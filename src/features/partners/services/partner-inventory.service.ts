import { addDoc, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { cleanPayload } from '@/lib/utils';

export interface PartnerInventoryEntry {
  id?: string;
  partnerId: string;
  type: 'ADDITION' | 'DEDUCTION' | 'DEBT_COLLECTION';
  amount: number;
  
  // Financial fields
  totalCost?: number;
  amountPaid?: number;
  paymentMethod?: string;
  paymentType?: 'Full' | 'Partial' | 'Due';

  customerId?: string;
  clubId?: string;
  notes?: string;
  createdBy: string;
  createdAt: number;
  isArchived?: boolean;
}

export class PartnerInventoryService {
  /**
   * Add shakes to a Junior Partner's inventory (usually done by Admin)
   */
  static async addShakes(
    partnerId: string,
    amount: number,
    createdBy: string,
    notes?: string,
    createdAt?: number,
    totalCost: number = 0,
    amountPaid: number = 0,
    paymentMethod?: string,
    paymentType?: 'Full' | 'Partial' | 'Due',
    clubId?: string
  ): Promise<string> {
    const entry: Partial<PartnerInventoryEntry> = {
      partnerId,
      type: 'ADDITION',
      amount: Math.abs(amount),
      totalCost,
      amountPaid,
      paymentMethod,
      paymentType,
      clubId,
      notes: notes || 'Admin added shakes',
      createdBy,
      createdAt: createdAt || Date.now(),
      isArchived: false,
    };
    
    const newDoc = await addDoc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, cleanPayload(entry as Record<string, any>) as Omit<PartnerInventoryEntry, 'id'>);
    return newDoc.id;
  }

  static async collectDebt(
    partnerId: string,
    amountPaid: number,
    paymentMethod: string,
    createdBy: string,
    notes?: string,
    clubId?: string
  ): Promise<string> {
    const entry: Partial<PartnerInventoryEntry> = {
      partnerId,
      type: 'DEBT_COLLECTION',
      amount: 0,
      totalCost: 0,
      amountPaid,
      paymentMethod,
      paymentType: 'Partial', // Usually partial/full towards due
      clubId,
      notes: notes || 'Debt collection',
      createdBy,
      createdAt: Date.now(),
      isArchived: false,
    };

    const newDoc = await addDoc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, cleanPayload(entry as Record<string, any>) as Omit<PartnerInventoryEntry, 'id'>);
    return newDoc.id;
  }

  /**
   * Calculate both shakes balance and financial due balance for a Partner
   */
  static async getPartnerBalances(partnerId: string): Promise<{ shakesBalance: number, dueBalance: number, dueBalanceByClub: Record<string, number> }> {
    const q = query(
      COLLECTIONS.PARTNER_INVENTORY_LEDGER,
      where('partnerId', '==', partnerId)
    );
    
    const snapshot = await getDocs(q);
    
    let shakesBalance = 0;
    let totalCostSum = 0;
    let totalPaidSum = 0;
    const dueBalanceByClub: Record<string, number> = {};

    snapshot.forEach(doc => {
      const data = doc.data() as PartnerInventoryEntry;
      if (data.isArchived) return; // Skip archived entries
      
      if (data.type === 'ADDITION') {
        shakesBalance += data.amount;
      } else if (data.type === 'DEDUCTION') {
        shakesBalance -= data.amount;
      }
      
      // Calculate financial due
      if (data.type === 'ADDITION' || data.type === 'DEBT_COLLECTION') {
        totalCostSum += (data.totalCost || 0);
        totalPaidSum += (data.amountPaid || 0);
        
        const effectiveClubId = data.clubId || 'unknown';
        if (!dueBalanceByClub[effectiveClubId]) {
          dueBalanceByClub[effectiveClubId] = 0;
        }
        dueBalanceByClub[effectiveClubId] += (data.totalCost || 0) - (data.amountPaid || 0);
      }
    });
    
    return {
      shakesBalance,
      dueBalance: totalCostSum - totalPaidSum,
      dueBalanceByClub
    };
  }

  /**
   * Deduct shakes from a Junior Partner's inventory (when a customer consumes)
   */
  static async deductShakes(
    partnerId: string,
    amount: number,
    customerId: string,
    createdBy: string,
    notes?: string,
    createdAt?: number
  ): Promise<string> {
    const entry: Partial<PartnerInventoryEntry> = {
      partnerId,
      type: 'DEDUCTION',
      amount: Math.abs(amount),
      customerId,
      notes: notes || 'Attendance deduction',
      createdBy,
      createdAt: createdAt || Date.now(),
      isArchived: false,
    };

    const newDoc = await addDoc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, cleanPayload(entry as Record<string, any>) as Omit<PartnerInventoryEntry, 'id'>);
    return newDoc.id;
  }

  /**
   * Calculate the total remaining balance for a Junior Partner
   */
  static async getInventoryBalance(partnerId: string): Promise<number> {
    const balances = await this.getPartnerBalances(partnerId);
    return balances.shakesBalance;
  }
  static async voidInventoryEntry(entryId: string, voidedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, entryId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Inventory entry not found');
    
    const data = snap.data() as PartnerInventoryEntry;
    if (data.isArchived) throw new Error('Entry is already voided');

    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now(),
      voidedBy
    });
  }

  static async revertInventoryEntry(entryId: string, revertedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, entryId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Inventory entry not found');
    
    const data = snap.data() as PartnerInventoryEntry;
    if (!data.isArchived) throw new Error('Entry is not voided');

    await updateDoc(docRef, {
      isArchived: false,
      updatedAt: Date.now(),
      revertedBy
    });
  }

  /**
   * Edit an existing inventory entry
   */
  static async updateInventoryEntry(entryId: string, updates: Partial<PartnerInventoryEntry>, updatedBy: string): Promise<void> {
    const docRef = doc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, entryId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now(),
      updatedBy
    });
  }
}
