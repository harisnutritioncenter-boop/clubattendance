import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { useAuthStore } from '@/store';

interface ManageShakesModalProps {
  partnerId: string;
  partnerName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ManageShakesModal({ partnerId, partnerName, isOpen, onOpenChange, onSuccess }: ManageShakesModalProps) {
  const [amountStr, setAmountStr] = useState('');
  const [action, setAction] = useState<'ADD' | 'DEDUCT'>('ADD');
  
  // Default to today's date in YYYY-MM-DD format for the input
  const [transactionDate, setTransactionDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore(state => state.user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setIsSubmitting(true);
      const amount = parseInt(amountStr);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Please enter a valid positive number.");
        return;
      }
      
      const parsedDate = new Date(transactionDate);
      // Keep the current time of day if it's today, otherwise use noon of the selected date
      let timestamp = parsedDate.getTime();
      const today = new Date();
      if (parsedDate.toDateString() === today.toDateString()) {
        timestamp = today.getTime();
      } else {
        parsedDate.setHours(12, 0, 0, 0);
        timestamp = parsedDate.getTime();
      }
      
      if (action === 'ADD') {
        await PartnerInventoryService.addShakes(partnerId, amount, user.uid, undefined, timestamp);
        toast.success('Shakes assigned successfully');
      } else {
        // For manual deduction, we don't have a specific customerId, so we pass 'MANUAL_DEDUCTION'
        await PartnerInventoryService.deductShakes(partnerId, amount, 'MANUAL_DEDUCTION', user.uid, 'Admin manual deduction', timestamp);
        toast.success('Shakes deducted successfully');
      }
      
      setAmountStr('');
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
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Manage Shakes for {partnerName || 'Partner'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as 'ADD' | 'DEDUCT')}>
              <SelectTrigger>
                <SelectValue />
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
              <Input 
                type="date" 
                required 
                value={transactionDate} 
                onChange={e => setTransactionDate(e.target.value)} 
                max={new Date().toISOString().split('T')[0]} // Prevents future dates
              />
            </div>
          </div>
          
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
