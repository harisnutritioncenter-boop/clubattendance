import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MembershipService } from '../services/membership.service';
import { MembershipPlan } from '../types/membership.types';
import { useAuthStore, useBranchStore } from '@/store';
import { toast } from 'sonner';

interface AssignMembershipModalProps {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AssignMembershipModal({ customerId, customerName, open, onOpenChange, onSuccess }: AssignMembershipModalProps) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Bank Transfer'>('Cash');
  const [loading, setLoading] = useState(false);

  const { activeBranchId } = useBranchStore();
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    if (open && plans.length === 0) {
      MembershipService.getActivePlans().then(setPlans).catch(console.error);
    }
  }, [open, plans.length]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchId = activeBranchId || 'default-branch';
    if (!selectedPlanId || !user) return;
    
    setLoading(true);
    try {
      await MembershipService.assignMembership(
        customerId,
        selectedPlanId,
        paymentMethod,
        branchId,
        user.uid
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to assign membership.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Membership to {customerName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAssign} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan">Select Plan</Label>
            <select
              id="plan"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedPlanId}
              onChange={e => setSelectedPlanId(e.target.value)}
              required
            >
              <option value="">-- Choose a Plan --</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} - ₹{p.price} ({p.shakesCount} shakes / {p.validityDays} days)
                </option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="payment">Payment Method</Label>
            <select
              id="payment"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as any)}
              required
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !selectedPlanId}>
            {loading ? 'Processing...' : 'Confirm & Charge'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
