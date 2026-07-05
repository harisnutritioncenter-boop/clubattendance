import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';

export class PartnerService {
  static async updatePartner(partnerId: string, updates: any): Promise<void> {
    const docRef = doc(COLLECTIONS.USERS, partnerId);
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
