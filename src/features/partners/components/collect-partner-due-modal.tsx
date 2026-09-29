'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { useAuthStore } from '@/store';

interface CollectPartnerDueModalProps {
  partnerId: string;
  clubId?: string;
  partnerName: string;
  amountDue: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

export function CollectPartnerDueModal({
  partnerId,
  clubId,
  partnerName,
  amountDue,
  isOpen,
  onOpenChange,
  onSuccess
}: CollectPartnerDueModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [loading, setLoading] = useState(false);

  const user = useAuthStore(state => state.user);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await PartnerInventoryService.collectDebt(
        partnerId,
        numAmount,
        paymentMethod,
        user.uid,
        `Collected remaining due amount.`,
        clubId
      );

      toast.success('Payment collected successfully!');
      onSuccess();
      onOpenChange(false);
      setAmount('');
      setPaymentMethod('');
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
          <DialogTitle>Collect Partner Due</DialogTitle>
          <DialogDescription>
            Settle the outstanding balance for {partnerName}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave}>
          <div className="grid gap-4 py-4">
            <div className="bg-destructive/10 border-destructive/20 border text-destructive p-3 rounded-md flex justify-between items-center">
              <span className="font-medium">Total Due:</span>
              <span className="font-bold text-lg">₹{amountDue}</span>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right">
                Amount
              </Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="col-span-3"
                placeholder="Enter amount to collect"
                min="1"
                max={amountDue}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="paymentMethod" className="text-right">
                Method
              </Label>
              <div className="col-span-3">
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(method => (
                      <SelectItem key={method} value={method}>{method}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Processing...' : 'Collect Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
