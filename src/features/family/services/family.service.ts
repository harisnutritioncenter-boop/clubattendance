import { addDoc, doc, getDoc, getDocs, query, updateDoc, where, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { FamilyGroup, CreateFamilyGroupDTO } from '../types/family.types';

export class FamilyService {
  static async createFamily(data: CreateFamilyGroupDTO): Promise<string> {
    const newDoc = await addDoc(COLLECTIONS.FAMILY_GROUPS, {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    });
    return newDoc.id;
  }

  static async getActiveFamilies(branchId: string): Promise<FamilyGroup[]> {
    const q = query(
      COLLECTIONS.FAMILY_GROUPS,
      where('branchId', '==', branchId),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FamilyGroup));
  }

  // Find if a customer is part of any family (either as primary or member)
  static async getFamilyForCustomer(customerId: string): Promise<FamilyGroup | null> {
    // Check if they are primary
    const qPrimary = query(
      COLLECTIONS.FAMILY_GROUPS,
      where('primaryCustomerId', '==', customerId),
      where('isArchived', '==', false)
    );
    const snapshotPrimary = await getDocs(qPrimary);
    if (!snapshotPrimary.empty) {
      const doc = snapshotPrimary.docs[0];
      return { id: doc.id, ...doc.data() } as FamilyGroup;
    }

    // Check if they are a member
    const qMember = query(
      COLLECTIONS.FAMILY_GROUPS,
      where('memberIds', 'array-contains', customerId),
      where('isArchived', '==', false)
    );
    const snapshotMember = await getDocs(qMember);
    if (!snapshotMember.empty) {
      const doc = snapshotMember.docs[0];
      return { id: doc.id, ...doc.data() } as FamilyGroup;
    }

    return null;
  }
}
