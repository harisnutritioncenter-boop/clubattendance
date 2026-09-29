import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { useAuthStore } from '@/store';

interface ManageShakesModalProps {
  partnerId: string;
  clubId?: string;
  partnerName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ManageShakesModal({ partnerId, clubId, partnerName, isOpen, onOpenChange, onSuccess }: ManageShakesModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [action, setAction] = useState<'ADD' | 'DEDUCT' | ''>('');
  
  // Financial fields
  const [totalCost, setTotalCost] = useState('');
  const [paymentType, setPaymentType] = useState<'Full' | 'Partial' | 'Due' | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Bank Transfer' | ''>('');
  const [partialAmount, setPartialAmount] = useState('');
  
  const [transactionDate, setTransactionDate] = useState<Date | undefined>(new Date());
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore(state => state.user);

  // Reset fields when action changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setAmountStr('');
      setTotalCost('');
      setPaymentType('');
      setPaymentMethod('');
      setPartialAmount('');
      setAction('');
      setTransactionDate(new Date());
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!action) {
      toast.error("Please select an action (Assign or Deduct).");
      return;
    }

    try {
      setIsSubmitting(true);
      const amount = parseInt(amountStr);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Please enter a valid positive number of shakes.");
        return;
      }

      let parsedTotalCost = 0;
      let finalAmountPaid = 0;
      
      if (action === 'ADD') {
        parsedTotalCost = parseFloat(totalCost);
        if (isNaN(parsedTotalCost) || parsedTotalCost < 0) {
          toast.error("Please enter a valid total cost.");
          return;
        }

        if (!paymentType) {
          toast.error("Please select a payment type.");
          return;
        }
        if (paymentType !== 'Due' && !paymentMethod) {
          toast.error("Please select a payment method.");
          return;
        }

        if (paymentType === 'Full') {
          finalAmountPaid = parsedTotalCost;
        } else if (paymentType === 'Partial') {
          finalAmountPaid = parseFloat(partialAmount);
          if (isNaN(finalAmountPaid) || finalAmountPaid <= 0 || finalAmountPaid > parsedTotalCost) {
            toast.error("Please enter a valid partial amount.");
            return;
          }
        } else if (paymentType === 'Due') {
          finalAmountPaid = 0;
        }
      }
      
      const parsedDate = transactionDate || new Date();
      let timestamp = parsedDate.getTime();
      const today = new Date();
      if (parsedDate.toDateString() === today.toDateString()) {
        timestamp = today.getTime();
      } else {
        parsedDate.setHours(12, 0, 0, 0);
        timestamp = parsedDate.getTime();
      }
      
      if (action === 'ADD') {
        await PartnerInventoryService.addShakes(
          partnerId, 
          amount, 
          user.uid, 
          undefined, 
          timestamp,
          parsedTotalCost,
          finalAmountPaid,
          paymentType === 'Due' ? 'Due' : paymentMethod,
          paymentType as any,
          clubId
        );
        toast.success('Shakes assigned successfully');
      } else {
        // For manual deduction, we don't have a specific customerId, so we pass 'MANUAL_DEDUCTION'
        await PartnerInventoryService.deductShakes(partnerId, amount, 'MANUAL_DEDUCTION', user.uid, 'Admin manual deduction', timestamp);
        toast.success('Shakes deducted successfully');
      }
      
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to ${action === 'ADD' ? 'assign' : 'deduct'} shakes: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Shakes for {partnerName || 'Partner'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as 'ADD' | 'DEDUCT')}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADD">Assign Shakes</SelectItem>
                <SelectItem value="DEDUCT">Deduct Shakes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Number of Shakes</Label>
              <Input 
                type="number" 
                min="1" 
                required 
                value={amountStr} 
                onChange={e => setAmountStr(e.target.value)} 
                placeholder="e.g. 300" 
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger render={
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !transactionDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {transactionDate ? format(transactionDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                } />
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={transactionDate}
                    onSelect={setTransactionDate}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {action === 'ADD' && (
            <>
              <div className="space-y-2 border-t pt-4 mt-2">
                <Label>Total Amount to Charge (₹)</Label>
                <Input 
                  type="number" 
                  min="0" 
                  required 
                  value={totalCost} 
                  onChange={e => setTotalCost(e.target.value)} 
                  placeholder="e.g. 3600" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Type</Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">Full Payment</SelectItem>
                      <SelectItem value="Partial">Partial Payment</SelectItem>
                      <SelectItem value="Due">Full Due</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {paymentType !== 'Due' && (
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {paymentType === 'Partial' && (
                <div className="space-y-2">
                  <Label>Amount Paid Now (₹)</Label>
                  <Input 
                    type="number" 
                    min="1" 
                    max={totalCost || undefined}
                    required 
                    value={partialAmount} 
                    onChange={e => setPartialAmount(e.target.value)} 
                    placeholder="e.g. 1000" 
                  />
                </div>
              )}
            </>
          )}
          
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} variant={action === 'DEDUCT' ? 'destructive' : 'default'}>
              {isSubmitting ? 'Processing...' : action === 'ADD' ? 'Assign Shakes' : 'Deduct Shakes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
