import { addDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '../types/ledger.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { FamilyService } from '@/features/family/services/family.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';

export class LedgerService {
  
  static async addPayment(
    data: Omit<PaymentLedgerEntry, 'id' | 'createdAt' | 'isArchived'>
  ): Promise<string> {
    const newDoc = await addDoc(COLLECTIONS.PAYMENT_LEDGER, {
      ...data,
      createdAt: Date.now(),
      isArchived: false,
    });
    return newDoc.id;
  }

  static async addConsumption(
    data: Omit<ShakeLedgerEntry, 'id' | 'createdAt' | 'isArchived' | 'customerId' | 'consumedBy'>,
    actualConsumerId: string
  ): Promise<string> {
    
    // 1. Resolve Family Account
    const family = await FamilyService.getFamilyForCustomer(actualConsumerId);
    
    // The ledger is always charged to the primary customer of the family (or themselves if not in a family)
    const chargeToCustomerId = family ? family.primaryCustomerId : actualConsumerId;

    // 2. Resolve Name
    const consumer = await CustomerService.getCustomer(actualConsumerId);
    const consumedByName = consumer?.name || 'Unknown Consumer';

    const newDoc = await addDoc(COLLECTIONS.SHAKE_LEDGER, {
      ...data,
      customerId: chargeToCustomerId,
      consumedBy: consumedByName,
      createdAt: Date.now(),
      isArchived: false,
    });
    
    // 3. Deduct from Junior Partner if assigned
    if (consumer?.juniorPartnerId) {
      await PartnerInventoryService.deductShakes(
        consumer.juniorPartnerId,
        data.shakesDeducted,
        chargeToCustomerId,
        data.createdBy
      );
    }
    
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

    for (const payment of payments) {
      if (payment.shakesAdded) {
        totalShakesPurchased += payment.shakesAdded;
      }
      // Determine latest validity. Since they are ordered descending by createdAt, the first membership payment we find is the latest.
      if (!validUntil && payment.validityDays) {
        // Validity is calculated from the time of purchase
        validUntil = payment.createdAt + (payment.validityDays * 24 * 60 * 60 * 1000);
        latestPlanName = payment.planName;
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
      isExpired
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

  static async getReportsData(branchId: string, startDate: number, endDate: number) {
    const paymentsQuery = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('branchId', '==', branchId)
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    const payments = paymentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate)
      .sort((a, b) => b.createdAt - a.createdAt);

    const consumptionsQuery = query(
      COLLECTIONS.SHAKE_LEDGER,
      where('branchId', '==', branchId)
    );
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const consumptions = consumptionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { payments, consumptions };
  }
}
