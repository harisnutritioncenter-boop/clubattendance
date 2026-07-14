export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | 'Due';
export type PaymentType = 'Membership' | 'Retail' | 'Other' | 'Debt Collection';

export interface PaymentLedgerEntry {
  id: string;
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  type: PaymentType;
  
  // If it's a membership purchase, we record the shakes added and the validity
  shakesAdded?: number;
  validityDays?: number;
  planName?: string;
  totalPlanCost?: number;
  remainingBalance?: number;

  branchId: string;
  createdBy: string;
  createdAt: number;
  notes?: string;
  isArchived: boolean;
}

export interface ShakeLedgerEntry {
  id: string;
  customerId: string; // The primary account this is deducted from
  consumedBy: string; // Name of the person who actually drank it (useful for families)
  
  shakesDeducted: number; // Usually 1, but could be multiple if buying for friends
  
  juniorPartnerId?: string; // The partner who served this shake and had inventory deducted
  branchId: string;
  createdBy: string;
  createdAt: number;
  notes?: string;
  isArchived: boolean;
}
