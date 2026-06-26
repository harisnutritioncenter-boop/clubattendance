import { addDoc, getDocs, query, where } from 'firebase/firestore';
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
}

export class PartnerInventoryService {
  /**
   * Add shakes to a Junior Partner's inventory (usually done by Admin)
   */
  static async addShakes(
    partnerId: string,
    amount: number,
    createdBy: string,
    notes?: string
  ): Promise<string> {
    const entry: Omit<PartnerInventoryEntry, 'id'> = {
      partnerId,
      type: 'ADDITION',
      amount: Math.abs(amount),
      notes: notes || 'Admin added shakes',
      createdBy,
      createdAt: Date.now(),
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
    notes?: string
  ): Promise<string> {
    const entry: Omit<PartnerInventoryEntry, 'id'> = {
      partnerId,
      type: 'DEDUCTION',
      amount: Math.abs(amount),
      customerId,
      notes: notes || 'Customer consumed shakes',
      createdBy,
      createdAt: Date.now(),
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
      if (data.type === 'ADDITION') {
        balance += data.amount;
      } else if (data.type === 'DEDUCTION') {
        balance -= data.amount;
      }
    });
    
    return balance;
  }
}
