import { addDoc, getDocs, query, where, orderBy, doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { useAuthStore, useHistoryStore } from '@/store';
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
    
    // Ensure Admin payments route to the customer's actual club!
    let verifiedBranchId = data.branchId;
    try {
      if (data.customerId) {
        const customerDoc = await getDoc(doc(COLLECTIONS.CUSTOMERS, data.customerId));
        if (customerDoc.exists() && customerDoc.data().branchId) {
          verifiedBranchId = customerDoc.data().branchId;
        }
      }
      
      const userDoc = await getDoc(doc(COLLECTIONS.USERS, data.createdBy));
      if (userDoc.exists() && userDoc.data().role === 'junior_partner') {
         verifiedBranchId = userDoc.data().clubId || verifiedBranchId;
      }
    } catch (e) {
      console.warn("Failed to verify user/customer branchId for payment", e);
    }

    const newDoc = await addDoc(COLLECTIONS.PAYMENT_LEDGER, cleanPayload({
      ...data,
      branchId: verifiedBranchId,
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

    // Ensure Admin shakes route to the customer's actual club!
    let verifiedBranchId = data.branchId;
    try {
      if (consumer?.branchId) {
        verifiedBranchId = consumer.branchId;
      }
      
      const userDoc = await getDoc(doc(COLLECTIONS.USERS, data.createdBy));
      if (userDoc.exists() && userDoc.data().role === 'junior_partner') {
         verifiedBranchId = userDoc.data().clubId || verifiedBranchId;
      }
    } catch (e) {
      console.warn("Failed to verify user/customer branchId for shake", e);
    }

    const newDoc = await addDoc(COLLECTIONS.SHAKE_LEDGER, cleanPayload({
      ...data,
      branchId: verifiedBranchId,
      customerId: chargeToCustomerId,
      consumedBy: consumedByName,
      juniorPartnerId: consumer?.juniorPartnerId || null,
      batchId: data.batchId || null,
      batchName: data.batchName || null,
      createdAt: data.createdAt || Date.now(),
      isArchived: false,
    }));
    
    // 3. Deduct from Junior Partner if assigned
    if (consumer?.juniorPartnerId) {
      await PartnerInventoryService.deductShakes(
        consumer.juniorPartnerId,
        data.shakesDeducted,
        chargeToCustomerId,
        data.createdBy,
        undefined,
        data.createdAt || Date.now()
      );
    }
    
    ActivityLogsService.logActivity(
      'CONSUME',
      'Consumption',
      newDoc.id,
      `Marked ${data.shakesDeducted} attendance(s) to ${consumedByName}`,
      data.createdBy,
      data.branchId
    );
    
    return newDoc.id;
  }

  static async getAllCustomerBalances(branchId: string | null): Promise<Record<string, CustomerMembershipStatus & { planAssignedAt?: number }>> {
    // 1. Fetch all non-archived payments
    const paymentsQuery = branchId 
      ? query(COLLECTIONS.PAYMENT_LEDGER, where('branchId', '==', branchId), where('isArchived', '==', false))
      : query(COLLECTIONS.PAYMENT_LEDGER, where('isArchived', '==', false));
    
    const paymentsSnap = await getDocs(paymentsQuery);
    const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry));

    // 2. Fetch all non-archived consumptions
    const consumptionsQuery = branchId
      ? query(COLLECTIONS.SHAKE_LEDGER, where('branchId', '==', branchId), where('isArchived', '==', false))
      : query(COLLECTIONS.SHAKE_LEDGER, where('isArchived', '==', false));
      
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const consumptions = consumptionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry));

    // 3. Group by customerId
    const customerEntries: Record<string, ((PaymentLedgerEntry | ShakeLedgerEntry) & { type?: string })[]> = {};

    payments.forEach(p => {
      if (!customerEntries[p.customerId]) customerEntries[p.customerId] = [];
      customerEntries[p.customerId].push({ ...p, type: p.type || (p.planName ? 'Membership' : 'Debt Collection') });
    });

    consumptions.forEach(c => {
      if (!customerEntries[c.customerId]) customerEntries[c.customerId] = [];
      customerEntries[c.customerId].push({ ...c, type: 'Consumption' });
    });

    // 4. Calculate balances
    const balances: Record<string, CustomerMembershipStatus & { planAssignedAt?: number }> = {};

    for (const [customerId, entries] of Object.entries(customerEntries)) {
      entries.sort((a, b) => a.createdAt - b.createdAt);

      let cycleAssigned = 0;
      let cycleConsumed = 0;
      let validUntil: number | undefined = undefined;
      let latestPlanName: string | undefined = undefined;
      let planAssignedAt: number | undefined = undefined;
      let totalFinancialBalance = 0;

      for (const entry of entries) {
        if (entry.type === 'Membership' || entry.type === 'Add Shakes') {
          const payment = entry as PaymentLedgerEntry;
          const amt = payment.shakesAdded || 0;
          
          if (amt > 0) {
            if (cycleConsumed > cycleAssigned) {
              const deficit = cycleConsumed - cycleAssigned;
              cycleAssigned = amt;
              cycleConsumed = deficit;
            } else {
              const surplus = cycleAssigned - cycleConsumed;
              cycleAssigned = amt + surplus;
              cycleConsumed = 0;
            }
          }

          if (payment.remainingBalance) totalFinancialBalance += payment.remainingBalance;
          if (payment.planName) {
            latestPlanName = payment.planName;
            planAssignedAt = payment.createdAt; // Store the date this plan was assigned
          }
          if (payment.validityDays) validUntil = payment.createdAt + (payment.validityDays * 24 * 60 * 60 * 1000);

        } else if (entry.type === 'Debt Collection') {
          const payment = entry as PaymentLedgerEntry;
          const amt = payment.shakesAdded || 0;
          cycleAssigned += amt;
          if (payment.remainingBalance) totalFinancialBalance += payment.remainingBalance;

        } else if (entry.type === 'Consumption') {
          const shake = entry as ShakeLedgerEntry;
          const amt = shake.shakesDeducted || 0;
          cycleConsumed += amt;
        }
      }

      const remainingShakes = cycleAssigned - cycleConsumed;
      const isExpired = (cycleAssigned > 0 && remainingShakes <= 0);

      balances[customerId] = {
        customerId,
        totalShakesPurchased: cycleAssigned,
        totalShakesConsumed: cycleConsumed,
        remainingShakes,
        latestPlanName,
        planAssignedAt,
        validUntil,
        isExpired,
        remainingBalance: totalFinancialBalance
      };
    }

    return balances;
  }

  static async hasTransactions(customerId: string): Promise<boolean> {
    const q = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('customerId', '==', customerId)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  static async updatePastUnassignedLedgerEntries(customerId: string, newBranchId: string, newJuniorPartnerId: string): Promise<void> {
    const q = query(
      COLLECTIONS.PAYMENT_LEDGER,
      where('customerId', '==', customerId)
    );
    const snap = await getDocs(q);
    
    for (const document of snap.docs) {
      const data = document.data() as PaymentLedgerEntry;
      let needsUpdate = false;
      const updates: Partial<PaymentLedgerEntry> = {};

      if (!data.branchId || data.branchId === 'unassigned') {
        updates.branchId = newBranchId;
        needsUpdate = true;
      }
      
      if (!data.juniorPartnerId || data.juniorPartnerId === 'unassigned') {
        updates.juniorPartnerId = newJuniorPartnerId;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await updateDoc(doc(COLLECTIONS.PAYMENT_LEDGER, document.id), updates);
      }
    }
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

    // 4. Calculate Ledger Balances using Cycle Logic
    type UnifiedLedgerEntry = (PaymentLedgerEntry | ShakeLedgerEntry) & { type?: string };
    const allEntries: UnifiedLedgerEntry[] = [
      ...payments.map(p => ({ ...p, type: p.type || (p.planName ? 'Membership' : 'Debt Collection') } as UnifiedLedgerEntry)),
      ...consumptions.map(c => ({ ...c, type: c.isTransfer ? 'Transfer' : 'Consumption' } as UnifiedLedgerEntry))
    ];
    allEntries.sort((a, b) => a.createdAt - b.createdAt);

    let cycleAssigned = 0;
    let cycleConsumed = 0;
    
    let validUntil: number | undefined = undefined;
    let latestPlanName: string | undefined = undefined;
    let planAssignedAt: number | undefined = undefined;
    let totalFinancialBalance = 0;

    for (const entry of allEntries) {
      if (entry.type === 'Membership' || entry.type === 'Add Shakes') {
        const payment = entry as PaymentLedgerEntry;
        const amt = payment.shakesAdded || 0;
        
        if (amt > 0) {
          if (cycleConsumed > cycleAssigned) {
            const deficit = cycleConsumed - cycleAssigned;
            cycleAssigned = amt;
            cycleConsumed = deficit;
          } else {
            const surplus = cycleAssigned - cycleConsumed;
            cycleAssigned = amt + surplus;
            cycleConsumed = 0;
          }
        }

        if (payment.remainingBalance) totalFinancialBalance += payment.remainingBalance;
        if (payment.planName) {
          latestPlanName = payment.planName;
          planAssignedAt = payment.createdAt;
        }
        if (payment.validityDays) validUntil = payment.createdAt + (payment.validityDays * 24 * 60 * 60 * 1000);

      } else if (entry.type === 'Debt Collection') {
        const payment = entry as PaymentLedgerEntry;
        const amt = payment.shakesAdded || 0;
        cycleAssigned += amt;
        
        if (payment.remainingBalance) totalFinancialBalance += payment.remainingBalance;

      } else if (entry.type === 'Consumption') {
        const shake = entry as ShakeLedgerEntry;
        const amt = shake.shakesDeducted || 0;
        cycleConsumed += amt;
      }
    }

    const remainingShakes = cycleAssigned - cycleConsumed;
    // Date expiry is ignored as per new rules, but we keep validUntil for display.
    const isExpired = (cycleAssigned > 0 && remainingShakes <= 0);

    return {
      customerId: requestedCustomerId,
      totalShakesPurchased: cycleAssigned,
      totalShakesConsumed: cycleConsumed,
      remainingShakes,
      latestPlanName,
      planAssignedAt,
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
    let payments = paymentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate);

    const consumptionsQuery = branchId ? query(
      COLLECTIONS.SHAKE_LEDGER,
      where('branchId', '==', branchId)
    ) : query(COLLECTIONS.SHAKE_LEDGER);
    const consumptionsSnap = await getDocs(consumptionsQuery);

    let consumptions = consumptionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry))
      .filter(d => !d.isArchived && d.createdAt >= startDate && d.createdAt <= endDate);

    let upgradedPartnerDetails: Array<{ id: string, upgradedAt: number, newClubId: string, oldClubId?: string }> = [];

    // Dynamic Historic Merging for Upgraded Club Owners
    try {
      const authState = useAuthStore.getState();
      
      // For Club Owners: fetch and merge their own history
      if (authState.role === 'club_owner' && authState.userData?.previousRole === 'junior_partner' && authState.userData?.upgradedToClubOwnerAt) {
        const historyStore = useHistoryStore.getState();
        await historyStore.fetchHistoricalData(authState.user!.uid, authState.userData.upgradedToClubOwnerAt);
        const { historicalConsumptions, historicalPayments } = useHistoryStore.getState();
        
        const currentClubId = authState.userData.clubId || authState.userData.branchId;
        const mergedPayments = historicalPayments
          .filter(d => d.createdAt >= startDate && d.createdAt <= endDate)
          .map(p => ({ ...p, branchId: currentClubId, isHistoricalCopy: true }));
          
        const mergedConsumptions = historicalConsumptions
          .filter(d => d.createdAt >= startDate && d.createdAt <= endDate)
          .map(c => ({ ...c, branchId: currentClubId, isHistoricalCopy: true }));
        
        payments = [...payments, ...mergedPayments];
        consumptions = [...consumptions, ...mergedConsumptions];
      }
      
      // For all roles: clone historical entries for display in the correct clubs
      if (['super_admin', 'junior_partner', 'club_owner'].includes(authState.role as string)) {
        const usersSnap = await getDocs(query(COLLECTIONS.USERS));
        const partnersWithHistory = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(p => ((p as any).transferHistory && (p as any).transferHistory.length > 0) || (p as any).upgradedToClubOwnerAt);
        
        const customersSnap = await getDocs(query(COLLECTIONS.CUSTOMERS));
        const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const belongsToPartner = (record: any, partnerId: string) => {
          if (record.juniorPartnerId && record.juniorPartnerId !== 'unassigned') return record.juniorPartnerId === partnerId;
          if (record.createdBy === partnerId) return true;
          const customer = customersData.find(c => c.id === record.customerId) as any;
          if (customer?.juniorPartnerId && customer.juniorPartnerId !== 'unassigned') return customer.juniorPartnerId === partnerId;
          return false;
        };

        const historicalShakeCopies: ShakeLedgerEntry[] = [];
        const historicalPaymentCopies: PaymentLedgerEntry[] = [];
        
        partnersWithHistory.forEach(p => {
          const allConsumptions = consumptionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShakeLedgerEntry));
          const allPayments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentLedgerEntry));
          
          // Process formal transferHistory array
          if ((p as any).transferHistory && (p as any).transferHistory.length > 0) {
            (p as any).transferHistory.forEach((transfer: any) => {
              const { oldClubId, newClubId, transferredAt } = transfer;
              upgradedPartnerDetails.push({ id: p.id, upgradedAt: transferredAt, newClubId, oldClubId });
              
              // Only create historical copies for Super Admin view or if the JP themselves is viewing it
              const shouldCreateCopies = authState.role === 'super_admin' || authState.user?.uid === p.id;
              
              if (shouldCreateCopies) {
                // Fix old records and copy them
                consumptions.forEach(c => {
                  if (belongsToPartner(c, p.id) && c.createdAt < transferredAt && (!c.branchId || c.branchId === 'default-branch')) {
                    c.branchId = oldClubId || 'orphan-historical';
                  }
                });
                payments.forEach(payment => {
                  if (belongsToPartner(payment, p.id) && payment.createdAt < transferredAt && (!payment.branchId || payment.branchId === 'default-branch' || payment.branchId === 'unassigned')) {
                    payment.branchId = oldClubId || 'orphan-historical';
                  }
                });
                
                const pastShakes = consumptions.filter(c => belongsToPartner(c, p.id) && c.createdAt < transferredAt && c.createdAt >= (transfer.previousTransferredAt || 0) && !(c as any).isHistoricalCopy);
                pastShakes.forEach(shake => {
                  historicalShakeCopies.push({ ...shake, id: `${shake.id}_copy`, branchId: newClubId, isHistoricalCopy: true } as any);
                });
                
                const pastPayments = payments.filter(payment => belongsToPartner(payment, p.id) && payment.createdAt < transferredAt && payment.createdAt >= (transfer.previousTransferredAt || 0) && !(payment as any).isHistoricalCopy);
                pastPayments.forEach(payment => {
                  historicalPaymentCopies.push({ ...payment, id: `${payment.id}_copy`, branchId: newClubId, isHistoricalCopy: true } as any);
                });
              }
            });
          } else if ((p as any).upgradedToClubOwnerAt) {
             // Fallback for legacy upgradedToClubOwnerAt
             const upgradedAt = (p as any).upgradedToClubOwnerAt;
             const newClubId = (p as any).clubId;
             const oldClubShake = allConsumptions.find(c => belongsToPartner(c, p.id) && c.createdAt < upgradedAt && c.branchId && c.branchId !== 'default-branch' && c.branchId !== newClubId);
             const oldClubPayment = allPayments.find(pay => belongsToPartner(pay, p.id) && pay.createdAt < upgradedAt && pay.branchId && pay.branchId !== 'default-branch' && pay.branchId !== newClubId);
             const oldClubId = oldClubShake ? oldClubShake.branchId : (oldClubPayment ? oldClubPayment.branchId : undefined);
             
             upgradedPartnerDetails.push({ id: p.id, upgradedAt, newClubId, oldClubId });
             
             // Pre-fix any missing branchIds on past records so the UI doesn't map them to the customer's new club
             consumptions.forEach(c => {
               if (belongsToPartner(c, p.id) && c.createdAt < upgradedAt) {
                 if (!c.branchId || c.branchId === 'default-branch') {
                   c.branchId = oldClubId || 'orphan-historical';
                 }
               }
             });
             payments.forEach(payment => {
               if (belongsToPartner(payment, p.id) && payment.createdAt < upgradedAt) {
                 if (!payment.branchId || payment.branchId === 'default-branch' || payment.branchId === 'unassigned') {
                   payment.branchId = oldClubId || 'orphan-historical';
                 }
               }
             });
             
             const pastShakes = consumptions.filter(c => belongsToPartner(c, p.id) && c.createdAt < upgradedAt && !(c as any).isHistoricalCopy);
             pastShakes.forEach(shake => {
               historicalShakeCopies.push({ ...shake, id: `${shake.id}_copy`, branchId: (p as any).clubId, isHistoricalCopy: true } as any);
             });
             
             const pastPayments = payments.filter(payment => belongsToPartner(payment, p.id) && payment.createdAt < upgradedAt && !(payment as any).isHistoricalCopy);
             pastPayments.forEach(payment => {
               historicalPaymentCopies.push({ ...payment, id: `${payment.id}_copy`, branchId: (p as any).clubId, isHistoricalCopy: true } as any);
             });
          }
        });
        
        payments = [...payments, ...historicalPaymentCopies];
        consumptions = [...consumptions, ...historicalShakeCopies];
      }
    } catch (err) {
      console.warn("Failed to inject historical data", err);
    }

    payments.sort((a, b) => b.createdAt - a.createdAt);
    consumptions.sort((a, b) => b.createdAt - a.createdAt);

    return { payments, consumptions, upgradedPartnerDetails };
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
        'Refund for voided consumption',
        data.createdAt
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

    // 2. Check if we need to revert customer back to trial
    if (data.customerId && data.type === 'Membership') {
      const paymentsQuery = query(
        COLLECTIONS.PAYMENT_LEDGER,
        where('customerId', '==', data.customerId),
        where('isArchived', '==', false),
        where('type', '==', 'Membership')
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      
      // If there are no other active memberships for this customer
      if (paymentsSnap.empty) {
        const customerDocRef = doc(COLLECTIONS.CUSTOMERS, data.customerId);
        const customerSnap = await getDoc(customerDocRef);
        if (customerSnap.exists()) {
          const cData = customerSnap.data();
          if (cData.wasTrial) {
            await updateDoc(customerDocRef, {
              isTrial: true,
              trialConvertedAt: deleteField()
            });
            CustomerService.clearCache();
          }
        }
      }
    }

    ActivityLogsService.logActivity(
      'REVERT',
      'Payment',
      paymentId,
      `Voided/Refunded payment of ₹${data.amount} for plan: ${data.planName || 'Unknown'}`,
      voidedBy,
      data.branchId
    );
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
        `Re-deduction for reverted void consumption: ${consumptionId}`,
        data.createdAt
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

    if (data.customerId && data.type === 'Membership') {
      const customerDocRef = doc(COLLECTIONS.CUSTOMERS, data.customerId);
      const customerSnap = await getDoc(customerDocRef);
      if (customerSnap.exists()) {
        const cData = customerSnap.data();
        if (cData.isTrial) {
          await updateDoc(customerDocRef, {
            isTrial: false,
            wasTrial: true,
            trialConvertedAt: Date.now()
          });
          CustomerService.clearCache();
        }
      }
    }
  }
}

