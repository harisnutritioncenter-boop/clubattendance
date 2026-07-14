import { addDoc, getDocs, query, where, orderBy, updateDoc, doc, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { MembershipPlan } from '../types/membership.types';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerService } from '@/features/customers/services/customer.service';

export class MembershipService {
  
  // Membership Plans
  static async createPlan(data: Omit<MembershipPlan, 'id' | 'createdAt' | 'isActive'>): Promise<string> {
    const newDoc = await addDoc(COLLECTIONS.MEMBERSHIP_PLANS, {
      ...data,
      createdAt: Date.now(),
      isActive: true,
      isArchived: false,
      editHistory: []
    });
    return newDoc.id;
  }

  static async getActivePlans(): Promise<MembershipPlan[]> {
    // We fetch all plans and filter in-memory to avoid needing a complex Firebase composite index.
    // Membership plans are very few in number, so this is highly efficient.
    const snapshot = await getDocs(COLLECTIONS.MEMBERSHIP_PLANS);
    const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MembershipPlan));
    
    return plans
      .filter(p => p.isActive === true && p.isArchived !== true)
      .sort((a, b) => (a.price || 0) - (b.price || 0));
  }

  static async getAllPlans(): Promise<MembershipPlan[]> {
    // Fetch all plans and filter in-memory to bypass Firebase index requirements
    const snapshot = await getDocs(COLLECTIONS.MEMBERSHIP_PLANS);
    const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MembershipPlan));
    
    return plans
      .filter(p => p.isArchived !== true)
      .sort((a, b) => (a.price || 0) - (b.price || 0));
  }

  static async updatePlan(id: string, updates: Partial<MembershipPlan>): Promise<void> {
    const docRef = doc(COLLECTIONS.MEMBERSHIP_PLANS, id);
    await updateDoc(docRef, updates);
  }

  // Assign a membership to a customer = Add a Payment Ledger Entry
  static async assignMembership(
    customerId: string, 
    planId: string, 
    paymentMethod: 'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | 'Due',
    branchId: string,
    createdBy: string,
    amountPaid?: number
  ): Promise<string> {
    // 1. Fetch the plan details
    const planDoc = await getDoc(doc(COLLECTIONS.MEMBERSHIP_PLANS, planId));
    if (!planDoc.exists()) throw new Error('Plan not found');
    const plan = planDoc.data() as MembershipPlan;

    const finalAmountPaid = amountPaid !== undefined ? amountPaid : plan.price;
    const remainingBalance = plan.price - finalAmountPaid;

    // 2. Add to payment ledger
    const ledgerEntry = {
      customerId,
      amount: finalAmountPaid,
      totalPlanCost: plan.price,
      remainingBalance: remainingBalance,
      paymentMethod,
      type: 'Membership' as const,
      shakesAdded: plan.shakesCount,
      validityDays: plan.validityDays,
      planName: plan.name,
      branchId,
      createdBy,
      notes: `Membership Assigned: ${plan.name}` + (remainingBalance > 0 ? ` (Partial Payment. Balance: ${remainingBalance})` : ''),
    };

    const paymentId = await LedgerService.addPayment(ledgerEntry);
    
    // 3. Remove trial flag if they are becoming a member and it's not a trial plan
    const customer = await CustomerService.getCustomer(customerId);
    if (customer?.isTrial && !plan.isTrialPlan) {
      await CustomerService.updateCustomer(customerId, { 
        isTrial: false,
        wasTrial: true,
        trialConvertedAt: Date.now()
      }, createdBy, branchId);
    }
    
    return paymentId;
  }
}
