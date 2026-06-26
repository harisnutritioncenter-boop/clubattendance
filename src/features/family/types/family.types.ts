export interface FamilyGroup {
  id: string;
  primaryCustomerId: string;
  memberIds: string[]; // List of customer IDs linked to this family
  
  branchId: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export type CreateFamilyGroupDTO = Omit<FamilyGroup, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>;
