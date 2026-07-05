'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { useAuthStore, useBranchStore } from '@/store';
import { toast } from 'sonner';

interface CollectPaymentModalProps {
  customerId: string;
  customerName: string;
  amountDue: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

export function CollectPaymentModal({
  customerId,
  customerName,
  amountDue,
  isOpen,
  onOpenChange,
  onSuccess
}: CollectPaymentModalProps) {
  const [amount, setAmount] = useState(amountDue.toString());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);

  const user = useAuthStore(state => state.user);
  const branchId = useBranchStore(state => state.activeBranchId) || 'default-branch';

  const handleSave = async () => {
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (numAmount > amountDue) {
      toast.error('Cannot collect more than the due amount.');
      return;
    }
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      // Create a debt collection entry
      // amount is positive (we received money)
      // remainingBalance is negative (reduces the global due balance)
      await LedgerService.addPayment({
        customerId,
        branchId,
        amount: numAmount,
        paymentMethod: paymentMethod as any,
        type: 'Debt Collection',
        shakesAdded: 0,
        validityDays: 0,
        remainingBalance: -numAmount, 
        createdBy: user.uid,
        notes: `Collected remaining due amount.`
      });

      toast.success('Payment collected successfully!');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to collect payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Collect Remaining Payment</DialogTitle>
          <DialogDescription>
            Settle the outstanding balance for {customerName}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="bg-destructive/10 border-destructive/20 border text-destructive p-3 rounded-md flex justify-between items-center">
            <span className="font-medium">Total Due:</span>
            <span className="font-bold text-lg">₹{amountDue}</span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Collection Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={amountDue}
            />
          </div>

          <div className="grid gap-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select Method">
                  {paymentMethod || "Select Method"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(method => (
                  <SelectItem key={method} value={method}>{method}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Processing...' : 'Collect Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
