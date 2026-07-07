import { addDoc, getDocs, query, where, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { cleanPayload } from '@/lib/utils';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '../types/ledger.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { FamilyService } from '@/features/family/services/family.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

export class LedgerService {
  
  static async addPayment(
    data: Omit<PaymentLedgerEntry, 'id' | 'createdAt' | 'isArchived'> & { createdAt?: number }
  ): Promise<string> {
    const newDoc = await addDoc(COLLECTIONS.PAYMENT_LEDGER, cleanPayload({
      ...data,
      createdAt: data.createdAt || Date.now(),
      isArchived: false,
    }));
    
    let actionType: 'PURCHASE' | 'COLLECT_DEBT' | 'ADD_SHAKES' | 'DEDUCT_SHAKES' = 'PURCHASE';
    let details = `Payment of ₹${data.amount} via ${data.paymentMethod}`;
    
    if (data.type === 'Debt Collection') {
      actionType = 'COLLECT_DEBT';
      details = `Collected debt of ₹${data.amount} via ${data.paymentMethod}`;
    } else if (data.type === 'Membership') {
      actionType = 'PURCHASE';
      details = `Purchased membership ${data.planName || ''} for ₹${data.amount}`;
    } else if (data.type === 'Other' && data.notes?.includes('Manual Adjustment')) {
      if ((data.shakesAdded || 0) < 0) {
        actionType = 'DEDUCT_SHAKES';
        details = `Deducted ${Math.abs(data.shakesAdded || 0)} shakes`;
      } else {
        actionType = 'ADD_SHAKES';
        details = `Added ${data.shakesAdded || 0} shakes`;
      }
    }
    
    ActivityLogsService.logActivity(
      actionType,
      'Payment',
      newDoc.id,
      details,
      data.createdBy,
      data.branchId
    );
    
    return newDoc.id;
  }

  static async addConsumption(
    data: Omit<ShakeLedgerEntry, 'id' | 'createdAt' | 'isArchived' | 'customerId' | 'consumedBy'> & { createdAt?: number },
    actualConsumerId: string
  ): Promise<string> {
    
    // 1. Resolve Family Account
    const family = await FamilyService.getFamilyForCustomer(actualConsumerId);
    
    // The ledger is always charged to the primary customer of the family (or themselves if not in a family)
    const chargeToCustomerId = family ? family.primaryCustomerId : actualConsumerId;

    // 2. Resolve Name
    const consumer = await CustomerService.getCustomer(actualConsumerId);
    const consumedByName = consumer?.name || 'Unknown Consumer';

    const newDoc = await addDoc(COLLECTIONS.SHAKE_LEDGER, cleanPayload({
      ...data,
      customerId: chargeToCustomerId,
      consumedBy: consumedByName,
      juniorPartnerId: consumer?.juniorPartnerId || null,
      createdAt: data.createdAt || Date.now(),
      isArchived: false,
    }));
    
    // 3. Deduct from Junior Partner if assigned
    if (consumer?.juniorPartnerId) {
      await PartnerInventoryService.deductShakes(
        consumer.juniorPartnerId,
        data.shakesDeducted,
        chargeToCustomerId,
        data.createdBy
      );
    }
    
    ActivityLogsService.logActivity(
      'CONSUME',
      'Consumption',
      newDoc.id,
      `Served ${data.shakesDeducted} shake(s) to ${consumedByName}`,
      data.createdBy,
      data.branchId
    );
    
    return newDoc.id;
  }


  static async getCustomerBalance(requestedCustomerId: string): Promise<CustomerMembershipStatus> {
    // 1. Resolve Family Account
    const family = await FamilyService.getFamilyForCustomer(requestedCustomerId);
    
    // The ledger is always tied to the primary customer
    const ledgerCustomerId = family ? family.primaryCustomerId : requestedCustomerId;

    // 2. Fetch Payments (Additions)
    const paymentsQuery = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('customerId', '==', ledgerCustomerId),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry));

    // 3. Fetch Consumptions (Deductions)
    const consumptionsQuery = query(
      COLLECTIONS.SHAKE_LEDGER,
      where('customerId', '==', ledgerCustomerId),
      where('isArchived', '==', false)
    );
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const consumptions = consumptionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry));

    // 3. Calculate Ledger Balances
    let totalShakesPurchased = 0;
    let validUntil: number | undefined = undefined;
    let latestPlanName: string | undefined = undefined;
    let totalFinancialBalance = 0;

    for (const payment of payments) {
      if (payment.shakesAdded) {
        totalShakesPurchased += payment.shakesAdded;
      }
      if (payment.remainingBalance) {
        totalFinancialBalance += payment.remainingBalance;
      }
      // Determine latest plan name and validity
      if (!latestPlanName && payment.planName) {
        latestPlanName = payment.planName;
      }
      if (!validUntil && payment.validityDays) {
        // Validity is calculated from the time of purchase
        validUntil = payment.createdAt + (payment.validityDays * 24 * 60 * 60 * 1000);
      }
    }

    let totalShakesConsumed = 0;
    for (const consumption of consumptions) {
      totalShakesConsumed += consumption.shakesDeducted;
    }

    const remainingShakes = totalShakesPurchased - totalShakesConsumed;
    // Date expiry is ignored as per new rules, but we keep validUntil for display.
    const isExpired = (totalShakesPurchased > 0 && remainingShakes <= 0);

    return {
      customerId: requestedCustomerId,
      totalShakesPurchased,
      totalShakesConsumed,
      remainingShakes,
      latestPlanName,
      validUntil,
      isExpired,
      remainingBalance: totalFinancialBalance
    };
  }

  static async getCustomerHistory(requestedCustomerId: string) {
    // 1. Resolve Family Account
    const family = await FamilyService.getFamilyForCustomer(requestedCustomerId);
    const ledgerCustomerId = family ? family.primaryCustomerId : requestedCustomerId;

    const paymentsQuery = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('customerId', '==', ledgerCustomerId)
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    const payments = paymentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry))
      .filter(p => !p.isArchived)
      .sort((a, b) => b.createdAt - a.createdAt);

    const consumptionsQuery = query(
      COLLECTIONS.SHAKE_LEDGER,
      where('customerId', '==', ledgerCustomerId)
    );
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const consumptions = consumptionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry))
      .filter(c => !c.isArchived)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { payments, consumptions };
  }

  static async getTodayConsumptions(branchId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const consumptionsQuery = query(
      COLLECTIONS.SHAKE_LEDGER,
      where('branchId', '==', branchId)
    );
    const snap = await getDocs(consumptionsQuery);
    return snap.docs
      .map(d => d.data())
      .filter(d => !d.isArchived && d.createdAt >= startOfDay.getTime())
      .reduce((total, doc) => total + (doc.shakesDeducted || 0), 0);
  }

  static async getMonthlyRevenue(branchId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const paymentsQuery = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('branchId', '==', branchId)
    );
    const snap = await getDocs(paymentsQuery);
    return snap.docs
      .map(d => d.data())
      .filter(d => !d.isArchived && d.createdAt >= startOfMonth.getTime())
      .reduce((total, doc) => total + (doc.amount || 0), 0);
  }

  static async getReportsData(branchId: string | null, startDate: number, endDate: number) {
    const paymentsQuery = branchId ? query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('branchId', '==', branchId)
    ) : query(COLLECTIONS.PAYMENT_LEDGER);
    const paymentsSnap = await getDocs(paymentsQuery);
    const payments = paymentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate)
      .sort((a, b) => b.createdAt - a.createdAt);

    const consumptionsQuery = branchId ? query(
      COLLECTIONS.SHAKE_LEDGER,
      where('branchId', '==', branchId)
    ) : query(COLLECTIONS.SHAKE_LEDGER);
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const consumptions = consumptionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { payments, consumptions };
  }

  static async voidConsumption(consumptionId: string, voidedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.SHAKE_LEDGER, consumptionId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Consumption not found');
    
    const data = snap.data() as ShakeLedgerEntry;
    if (data.isArchived) throw new Error('Consumption is already voided');

    // 1. Mark as archived (this automatically refunds the customer because the balance query ignores archived entries)
    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now(),
      voidedBy
    });

    // 2. Refund the Partner's inventory if we know who served it
    if (data.juniorPartnerId) {
      // By adding shakes, we counteract the deduction
      await PartnerInventoryService.addShakes(
        data.juniorPartnerId,
        data.shakesDeducted,
        voidedBy,
        `Refund for voided consumption: ${consumptionId}`
      );
    }
  }

  static async voidPayment(paymentId: string, voidedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.PAYMENT_LEDGER, paymentId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Payment not found');
    
    const data = snap.data() as PaymentLedgerEntry;
    if (data.isArchived) throw new Error('Payment is already voided');

    // 1. Mark as archived (this automatically voids the validity and shakes because balance query ignores archived entries)
    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now(),
      voidedBy
    });
  }
  static async revertConsumption(consumptionId: string, revertedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.SHAKE_LEDGER, consumptionId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Consumption not found');
    
    const data = snap.data() as ShakeLedgerEntry;
    if (!data.isArchived) throw new Error('Consumption is not voided');

    // 1. Un-archive
    await updateDoc(docRef, {
      isArchived: false,
      updatedAt: Date.now(),
      revertedBy
    });

    // 2. Re-deduct the Partner's inventory
    if (data.juniorPartnerId) {
      await PartnerInventoryService.deductShakes(
        data.juniorPartnerId,
        data.shakesDeducted,
        data.customerId,
        revertedBy,
        `Re-deduction for reverted void consumption: ${consumptionId}`
      );
    }
  }

  static async revertPayment(paymentId: string, revertedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.PAYMENT_LEDGER, paymentId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Payment not found');
    
    const data = snap.data() as PaymentLedgerEntry;
    if (!data.isArchived) throw new Error('Payment is not voided');

    await updateDoc(docRef, {
      isArchived: false,
      updatedAt: Date.now(),
      revertedBy
    });
  }
}

