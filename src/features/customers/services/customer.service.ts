import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  orderBy
} from 'firebase/firestore';
import { db, COLLECTIONS } from '@/firebase';
import { cleanPayload } from '@/lib/utils';
import { Customer, CreateCustomerDTO } from '../types/customer.types';

import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

export class CustomerService {
  static async createCustomer(data: CreateCustomerDTO): Promise<string> {
    // Generate a simple 4 digit ID e.g. HC-8492
    const displayId = `HC-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const newDoc = await addDoc(COLLECTIONS.CUSTOMERS, cleanPayload({
      ...data,
      displayId,
      wasTrial: data.isTrial || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    }));
    
    ActivityLogsService.logActivity(
      'CREATE', 
      data.isTrial ? 'Trial' : 'Customer', 
      newDoc.id, 
      `Added new ${data.isTrial ? 'trial' : 'customer'} ${data.name} (${data.mobile})`, 
      data.createdBy,
      data.branchId
    );
    
    return newDoc.id;
  }

  static async getCustomer(id: string): Promise<Customer | null> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Customer;
  }

  static async getActiveCustomers(branchId?: string | null): Promise<Customer[]> {
    // Fetch all active customers and filter in-memory to bypass Firebase composite index requirements
    const q = query(
      COLLECTIONS.CUSTOMERS,
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    let customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
    
    if (branchId && branchId !== 'default-branch' && branchId !== 'all') {
      customers = customers.filter(c => c.branchId === branchId);
    }
    
    return customers;
  }

  static async updateCustomer(id: string, updates: Partial<Customer>, performedBy: string, branchId?: string): Promise<void> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now(),
    });
    
    ActivityLogsService.logActivity(
      'UPDATE', 
      'Customer', 
      id, 
      `Updated profile for customer`, 
      performedBy,
      branchId
    );
  }

  static async softDeleteCustomer(id: string, performedBy: string, branchId?: string): Promise<void> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    await updateDoc(docRef, {
      isArchived: true,
      updatedAt: Date.now(),
    });
    
    ActivityLogsService.logActivity(
      'ARCHIVE', 
      'Customer', 
      id, 
      `Archived customer`, 
      performedBy,
      branchId
    );
  }

  static async revertCustomer(id: string, performedBy: string, branchId?: string): Promise<void> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    await updateDoc(docRef, {
      isArchived: false,
      updatedAt: Date.now(),
    });
    
    ActivityLogsService.logActivity(
      'REVERT', 
      'Customer', 
      id, 
      `Restored archived customer`, 
      performedBy,
      branchId
    );
  }
}
