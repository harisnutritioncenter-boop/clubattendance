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
import { runTransaction } from 'firebase/firestore';

import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

export class CustomerService {
  private static activeCustomersCache: Customer[] | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

  static clearCache() {
    this.activeCustomersCache = null;
    this.cacheTimestamp = 0;
  }

  static getInitials(name?: string): string {
    if (!name || name.trim() === '') return 'XY';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  static async getNextCustomerId(juniorPartnerId?: string, partnerName?: string): Promise<string> {
    const initials = this.getInitials(partnerName);
    const counterId = juniorPartnerId || 'UNASSIGNED';
    const counterRef = doc(COLLECTIONS.SETTINGS, `counter_customers_${counterId}`);
    
    const sequenceNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let newCount = 1;
      if (counterDoc.exists()) {
        newCount = (counterDoc.data().count || 0) + 1;
        transaction.update(counterRef, { count: newCount });
      } else {
        transaction.set(counterRef, { count: newCount, initials, partnerId: counterId });
      }
      return newCount;
    });
    
    return `${initials}${String(sequenceNumber).padStart(4, '0')}`;
  }

  static async createCustomer(data: CreateCustomerDTO): Promise<string> {
    let partnerName = '';
    if (data.juniorPartnerId) {
      const partnerDoc = await getDoc(doc(COLLECTIONS.USERS, data.juniorPartnerId));
      if (partnerDoc.exists()) {
        partnerName = partnerDoc.data().name || '';
      }
    }
    
    const displayId = await this.getNextCustomerId(data.juniorPartnerId, partnerName);
    
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
    
    
    this.clearCache();
    return newDoc.id;
  }

  static async getCustomer(id: string): Promise<Customer | null> {
    const docRef = doc(COLLECTIONS.CUSTOMERS, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Customer;
  }

  static async getActiveCustomers(branchId?: string | null, forceRefresh = false): Promise<Customer[]> {
    if (
      !forceRefresh && 
      this.activeCustomersCache && 
      (Date.now() - this.cacheTimestamp < this.CACHE_DURATION)
    ) {
      let customers = this.activeCustomersCache;
      if (branchId && branchId !== 'default-branch' && branchId !== 'all') {
        customers = customers.filter(c => c.branchId === branchId);
      }
      return customers;
    }

    // Fetch all active customers and filter in-memory to bypass Firebase composite index requirements
    const q = query(
      COLLECTIONS.CUSTOMERS,
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    let customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
    
    this.activeCustomersCache = customers;
    this.cacheTimestamp = Date.now();
    
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
    this.clearCache();
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
    this.clearCache();
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
    this.clearCache();
  }
}
