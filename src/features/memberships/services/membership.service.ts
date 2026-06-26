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
    });
    return newDoc.id;
  }

  static async getActivePlans(): Promise<MembershipPlan[]> {
    const q = query(
      COLLECTIONS.MEMBERSHIP_PLANS,
      where('isActive', '==', true),
      orderBy('price', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MembershipPlan));
  }

  // Assign a membership to a customer = Add a Payment Ledger Entry
  static async assignMembership(
    customerId: string, 
    planId: string, 
    paymentMethod: 'Cash' | 'Card' | 'UPI' | 'Bank Transfer',
    branchId: string,
    createdBy: string
  ): Promise<string> {
    // 1. Fetch the plan details
    const planDoc = await getDoc(doc(COLLECTIONS.MEMBERSHIP_PLANS, planId));
    if (!planDoc.exists()) throw new Error('Plan not found');
    const plan = planDoc.data() as MembershipPlan;

    // 2. Add to payment ledger
    const ledgerEntry = {
      customerId,
      amount: plan.price,
      paymentMethod,
      type: 'Membership' as const,
      shakesAdded: plan.shakesCount,
      validityDays: plan.validityDays,
      planName: plan.name,
      branchId,
      createdBy,
      notes: `Membership Assigned: ${plan.name}`,
    };

    const paymentId = await LedgerService.addPayment(ledgerEntry);
    
    // 3. Remove trial flag if they are becoming a member
    const customer = await CustomerService.getCustomer(customerId);
    if (customer?.isTrial) {
      await CustomerService.updateCustomer(customerId, { 
        isTrial: false,
        wasTrial: true,
        trialConvertedAt: Date.now()
      });
    }
    
    return paymentId;
  }
}
