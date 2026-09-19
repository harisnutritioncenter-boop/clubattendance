import { doc, getDoc, updateDoc, query, where, getDocs, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '@/firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';

export class PartnerService {
  static async updatePartner(partnerId: string, updates: any): Promise<void> {
    const docRef = doc(COLLECTIONS.USERS, partnerId);
    
    // Check if clubId is being updated
    if (updates.clubId) {
      const pSnap = await getDoc(docRef);
      if (pSnap.exists() && pSnap.data().clubId !== updates.clubId) {
        const oldClubId = pSnap.data().clubId;
        const newClubId = updates.clubId;
        const transferredAt = Date.now();

        // 1. Log transfer history inside the updates payload
        updates.transferHistory = arrayUnion({
          oldClubId,
          newClubId,
          transferredAt
        });

        // 2. Club is changing! Update all customers assigned to this JP
        const q = query(COLLECTIONS.CUSTOMERS, where('juniorPartnerId', '==', partnerId));
        const cSnap = await getDocs(q);
        
        if (!cSnap.empty) {
          const docs = cSnap.docs;
          const chunkSize = 500; // Firestore limit is 500 writes per batch
          
          for (let i = 0; i < docs.length; i += chunkSize) {
            const chunk = docs.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            
            chunk.forEach(c => {
              const currentPastBranchIds = c.data().pastBranchIds || [];
              const updatedPastBranchIds = [...new Set([...currentPastBranchIds, oldClubId])];
              batch.update(doc(COLLECTIONS.CUSTOMERS, c.id), { 
                branchId: newClubId,
                pastBranchIds: updatedPastBranchIds
              });
            });
            
            await batch.commit();
          }
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
