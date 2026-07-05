export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERT' | 'ARCHIVE' | 'CONSUME' | 'PURCHASE' | 'COLLECT_DEBT' | 'ADD_SHAKES' | 'DEDUCT_SHAKES' | 'ADD_FAMILY_MEMBER' | 'REMOVE_FAMILY_MEMBER';
export type EntityType = 'Customer' | 'Partner' | 'Consumption' | 'Payment' | 'Inventory' | 'Membership' | 'FamilyAccount' | 'Trial';

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  entityType: EntityType;
  entityId: string;
  details: string;
  performedBy: string; // User ID who performed the action
  performedByName?: string; // Cache the name for easy display
  branchId?: string; // Which branch this occurred in (if applicable)
  createdAt: number;
}
