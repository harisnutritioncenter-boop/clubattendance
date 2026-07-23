import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MembershipService } from '../services/membership.service';
import { MembershipPlan } from '../types/membership.types';
import { useAuthStore, useBranchStore } from '@/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | 'Due'>('Cash');
  const [paymentType, setPaymentType] = useState<'Full' | 'Partial' | 'Due'>('Full');
  const [partialAmount, setPartialAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);

  const { activeBranchId } = useBranchStore();
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    if (open && plans.length === 0) {
      MembershipService.getActivePlans().then(setPlans).catch(console.error);
    }
  }, [open, plans.length]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchId = activeBranchId || 'default-branch';
    if (!selectedPlan || !user) return;
    
    let finalAmount = selectedPlan.price;

    if (selectedPlan.isTrialPlan) {
      finalAmount = 0;
    } else if (paymentType === 'Partial') {
      if (!partialAmount || partialAmount <= 0) {
        toast.error("Please enter a valid partial amount");
        return;
      }
      finalAmount = Number(partialAmount);
    } else if (paymentType === 'Due') {
      finalAmount = 0;
    }
    
    // Automatically set payment method to 'Due' if amount is 0
    const finalPaymentMethod = paymentType === 'Due' ? 'Due' : paymentMethod;
    
    setLoading(true);
    try {
      await MembershipService.assignMembership(
        customerId,
        selectedPlan.id,
        finalPaymentMethod,
        branchId,
        user.uid,
        finalAmount
      );
      onSuccess?.();
      onOpenChange(false);
      
      // Reset form states
      setSelectedPlanId('');
      setPaymentType('Full');
      setPartialAmount('');
      
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
            <Label>Select Plan</Label>
            <Select value={selectedPlanId} onValueChange={(val) => setSelectedPlanId(val || '')} required>
              <SelectTrigger className="w-full text-base sm:text-sm">
                {selectedPlan ? (
                  <span className="truncate">
                    {selectedPlan.isTrialPlan ? '[TRIAL PLAN] ' : ''}{selectedPlan.name} - ₹{selectedPlan.price} ({selectedPlan.shakesCount} shakes / {selectedPlan.validityDays} days)
                  </span>
                ) : (
                  <span className="text-muted-foreground">-- Choose a Plan --</span>
                )}
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.isTrialPlan ? '[TRIAL PLAN] ' : ''}{p.name} - ₹{p.price} ({p.shakesCount} shakes / {p.validityDays} days)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPlan && !selectedPlan.isTrialPlan && (
            <>
              <div className="space-y-3 bg-muted/50 p-4 rounded-lg border">
                <Label>Payment Collection</Label>
                <div className="flex items-center gap-6 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="paymentType" 
                      value="Full" 
                      checked={paymentType === 'Full'} 
                      onChange={() => setPaymentType('Full')}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">Full Payment (₹{selectedPlan.price})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="paymentType" 
                      value="Partial" 
                      checked={paymentType === 'Partial'} 
                      onChange={() => setPaymentType('Partial')}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">Partial Payment</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="paymentType" 
                      value="Due" 
                      checked={paymentType === 'Due'} 
                      onChange={() => setPaymentType('Due')}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">Due (Full Amount)</span>
                  </label>
                </div>
                
                {paymentType === 'Partial' && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                    <Label htmlFor="partialAmount" className="text-xs text-muted-foreground">Amount Paid Today (₹)</Label>
                    <Input 
                      id="partialAmount" 
                      type="number" 
                      min="1" 
                      max={selectedPlan.price - 1} 
                      placeholder="e.g. 1000" 
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value ? Number(e.target.value) : '')}
                      required={paymentType === 'Partial'}
                      className="mt-1 text-base sm:text-sm"
                    />
                    {partialAmount && (
                      <p className="text-xs text-destructive mt-1 font-medium">
                        Remaining Balance will be: ₹{selectedPlan.price - Number(partialAmount)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              {paymentType !== 'Due' && (
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)} required>
                    <SelectTrigger className="w-full text-base sm:text-sm">
                      {paymentMethod ? (
                        <span>{paymentMethod}</span>
                      ) : (
                        <span className="text-muted-foreground">Select Payment Method</span>
                      )}
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <Button type="submit" className="w-full" disabled={loading || !selectedPlanId}>
            {loading ? 'Processing...' : (selectedPlan?.isTrialPlan ? 'Assign Trial Membership' : 'Confirm & Charge')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
