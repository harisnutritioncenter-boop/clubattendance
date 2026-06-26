import { collection, CollectionReference, DocumentData } from 'firebase/firestore';
import { db } from './firestore';

const createCollection = <T = DocumentData>(collectionName: string) => {
  return collection(db, collectionName) as CollectionReference<T>;
};

export const COLLECTIONS = {
  USERS: createCollection('users'),
  BRANCHES: createCollection('branches'),
  CUSTOMERS: createCollection('customers'),
  TRIALS: createCollection('trials'),
  MEMBERSHIP_PLANS: createCollection('membershipPlans'),
  MEMBERSHIPS: createCollection('memberships'),
  FAMILY_ACCOUNTS: createCollection('familyAccounts'),
  FAMILY_GROUPS: createCollection('familyGroups'),
  CONSUMPTIONS: createCollection('consumptions'),
  SHAKE_LEDGER: createCollection('shakeLedger'),
  PAYMENTS: createCollection('payments'),
  PAYMENT_LEDGER: createCollection('paymentLedger'),
  RENEWALS: createCollection('renewals'),
  NOTIFICATIONS: createCollection('notifications'),
  SETTINGS: createCollection('settings'),
  PARTNER_INVENTORY_LEDGER: createCollection('partnerInventoryLedger'),
} as const;
