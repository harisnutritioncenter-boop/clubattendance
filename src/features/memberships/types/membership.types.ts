export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  shakesCount: number;
  validityDays: number;
  isActive: boolean;
  createdAt: number;
}

export interface CustomerMembershipStatus {
  customerId: string;
  // Derived balances (NEVER stored directly in the DB, always calculated from ledgers)
  totalShakesPurchased: number;
  totalShakesConsumed: number;
  remainingShakes: number;
  
  // We can track validity by finding the latest membership purchase in the payment ledger
  latestPlanName?: string;
  validUntil?: number; 
  isExpired: boolean;
}
