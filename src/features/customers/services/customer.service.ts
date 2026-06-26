import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  orderBy
} from 'firebase/firestore';
import { db, COLLECTIONS } from '@/firebase';
import { Customer, CreateCustomerDTO } from '../types/customer.types';

export class CustomerService {
  static async createCustomer(data: CreateCustomerDTO): Promise<string> {
    // Generate a simple 4 digit ID e.g. HC-8492
    const displayId = `HC-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newDoc = await addDoc(COLLECTIONS.CUSTOMERS, {
      ...data,
      displayId,
      wasTrial: data.isTrial || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    });
    return newDoc.id;
  }

  static async getCustomer(id: string): Promise<Customer | null> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Customer;
  }

  static async getActiveCustomers(branchId?: string | null): Promise<Customer[]> {
    let q;
    if (branchId) {
      q = query(
        COLLECTIONS.CUSTOMERS,
        where('branchId', '==', branchId),
        where('isArchived', '==', false),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        COLLECTIONS.CUSTOMERS,
        where('isArchived', '==', false),
        orderBy('createdAt', 'desc')
      );
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
  }

  static async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  static async softDeleteCustomer(id: string): Promise<void> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now(),
    });
  }
}
