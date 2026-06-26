export type CustomerPurpose =
  | 'Weight Loss'
  | 'Weight Gain'
  | 'Muscle Building'
  | 'Fitness'
  | 'Wellness'
  | 'Diabetes Management'
  | 'Sports Performance'
  | 'Other';

export interface Customer {
  id: string; // Firebase Auth UID or generated ID
  displayId: string; // e.g. HC-1042
  name: string;
  mobile: string;
  email?: string;
  address?: string;
  locality?: string;
  purpose: CustomerPurpose[];
  otherPurposeDescription?: string;
  notes?: string;
  isTrial?: boolean;
  wasTrial?: boolean;
  trialConvertedAt?: number;
  juniorPartnerId?: string;
  reference?: string;
  
  // Ledger/Membership derived fields (virtual/not stored)
  // We can add them later when joining with ledger data
  
  // Base fields
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  branchId: string;
  isArchived: boolean;
}

export type CreateCustomerDTO = Omit<Customer, 'id' | 'displayId' | 'createdAt' | 'updatedAt' | 'isArchived'>;
