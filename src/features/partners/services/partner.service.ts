import { doc, getDoc, updateDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';

export class PartnerService {
  static async updatePartner(partnerId: string, updates: any): Promise<void> {
    const docRef = doc(COLLECTIONS.USERS, partnerId);
    
    // Check if clubId is being updated
    if (updates.clubId) {
      const pSnap = await getDoc(docRef);
      if (pSnap.exists() && pSnap.data().clubId !== updates.clubId) {
        // Club is changing! Update all customers assigned to this JP
        const q = query(COLLECTIONS.CUSTOMERS, where('juniorPartnerId', '==', partnerId));
        const cSnap = await getDocs(q);
        
        if (!cSnap.empty) {
          const batch = writeBatch(db);
          cSnap.docs.forEach(c => {
            batch.update(doc(COLLECTIONS.CUSTOMERS, c.id), { branchId: updates.clubId });
          });
          await batch.commit();
        }
      }
    }

    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now()
    });
  }

  static async softDeletePartner(partnerId: string): Promise<void> {
    const docRef = doc(COLLECTIONS.USERS, partnerId);
    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now()
    });
  }

  static async revertPartner(partnerId: string): Promise<void> {
    const docRef = doc(COLLECTIONS.USERS, partnerId);
    await updateDoc(docRef, {
      isArchived: false,
      updatedAt: Date.now()
    });
  }
}
