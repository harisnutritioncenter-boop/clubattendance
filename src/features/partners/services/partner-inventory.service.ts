import { addDoc, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';

export interface PartnerInventoryEntry {
  id?: string;
  partnerId: string;
  type: 'ADDITION' | 'DEDUCTION';
  amount: number;
  customerId?: string;
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
    createdAt?: number
  ): Promise<string> {
    const entry: Omit<PartnerInventoryEntry, 'id'> = {
      partnerId,
      type: 'ADDITION',
      amount: Math.abs(amount),
      notes: notes || 'Admin added shakes',
      createdBy,
      createdAt: createdAt || Date.now(),
      isArchived: false,
    };

    const newDoc = await addDoc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, entry);
    return newDoc.id;
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
    const entry: Omit<PartnerInventoryEntry, 'id'> = {
      partnerId,
      type: 'DEDUCTION',
      amount: Math.abs(amount),
      customerId,
      notes: notes || 'Admin deducted shakes',
      createdBy,
      createdAt: createdAt || Date.now(),
      isArchived: false,
    };

    const newDoc = await addDoc(COLLECTIONS.PARTNER_INVENTORY_LEDGER, entry);
    return newDoc.id;
  }

  /**
   * Calculate the total remaining balance for a Junior Partner
   */
  static async getInventoryBalance(partnerId: string): Promise<number> {
    const q = query(
      COLLECTIONS.PARTNER_INVENTORY_LEDGER,
      where('partnerId', '==', partnerId)
    );
    
    const snapshot = await getDocs(q);
    
    let balance = 0;
    snapshot.forEach(doc => {
      const data = doc.data() as PartnerInventoryEntry;
      if (data.isArchived) return; // Skip archived entries
      
      if (data.type === 'ADDITION') {
        balance += data.amount;
      } else if (data.type === 'DEDUCTION') {
        balance -= data.amount;
      }
    });
    
    return balance;
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
