import { useState } from 'react';
import { MembershipPlan, PlanEditRecord } from '../types/membership.types';
import { MembershipService } from '../services/membership.service';
import { formatDateTime } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';

interface PlanDetailsModalProps {
  plan: MembershipPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PlanDetailsModal({ plan, open, onOpenChange, onSuccess }: PlanDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const user = useAuthStore(state => state.user);
  
  // Edit Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [shakesCount, setShakesCount] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [isTrialPlan, setIsTrialPlan] = useState(false);

  if (!plan) return null;

  const handleEditClick = () => {
    setName(plan.name);
    setPrice(plan.price.toString());
    setShakesCount(plan.shakesCount.toString());
    setValidityDays(plan.validityDays.toString());
    setIsTrialPlan(plan.isTrialPlan || false);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const changes = [];
      const newPrice = Number(price);
      const newShakes = Number(shakesCount);
      const newDays = Number(validityDays);

      if (name !== plan.name) changes.push({ field: 'name', oldValue: plan.name, newValue: name });
      if (newPrice !== plan.price) changes.push({ field: 'price', oldValue: plan.price, newValue: newPrice });
      if (newShakes !== plan.shakesCount) changes.push({ field: 'shakesCount', oldValue: plan.shakesCount, newValue: newShakes });
      if (newDays !== plan.validityDays) changes.push({ field: 'validityDays', oldValue: plan.validityDays, newValue: newDays });
      if (isTrialPlan !== (plan.isTrialPlan || false)) changes.push({ field: 'isTrialPlan', oldValue: plan.isTrialPlan || false, newValue: isTrialPlan });

      if (changes.length === 0) {
        setIsEditing(false);
        return;
      }

      const newRecord: PlanEditRecord = {
        editedAt: Date.now(),
        editedBy: user.uid,
        changes
      };

      await MembershipService.updatePlan(plan.id, {
        name,
        price: newPrice,
        shakesCount: newShakes,
        validityDays: newDays,
        isTrialPlan,
        editHistory: [...(plan.editHistory || []), newRecord]
      });

      toast.success('Plan updated successfully');
      setIsEditing(false);
      onSuccess();
    } catch (error: any) {
      toast.error('Failed to update plan: ' + error.message);
    }
  };

  const handleTogglePause = async () => {
    try {
      await MembershipService.updatePlan(plan.id, { isActive: !plan.isActive });
      toast.success(`Plan ${plan.isActive ? 'paused' : 'resumed'} successfully`);
      onSuccess();
    } catch (error: any) {
      toast.error('Failed to toggle plan: ' + error.message);
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Are you sure you want to archive ${plan.name}? Past customers on this plan will keep their history, but it will be removed from your dashboard completely.`)) return;
    try {
      await MembershipService.updatePlan(plan.id, { isArchived: true, isActive: false });
      toast.success('Plan archived successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error('Failed to archive plan: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) setIsEditing(false);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center pr-6">
            <span>{isEditing ? 'Edit Plan' : 'Plan Details & History'}</span>
            {!isEditing && (
              <Badge variant={plan.isActive ? 'default' : 'secondary'} className={plan.isActive ? 'bg-green-500 hover:bg-green-600' : ''}>
                {plan.isActive ? 'Active' : 'Paused'}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (₹)</Label>
              <Input id="price" type="number" value={price} onChange={e => setPrice(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shakes">Total Shakes</Label>
              <Input id="shakes" type="number" value={shakesCount} onChange={e => setShakesCount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="days">Validity (Days)</Label>
              <Input id="days" type="number" value={validityDays} onChange={e => setValidityDays(e.target.value)} required />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="editIsTrialPlan" 
                checked={isTrialPlan} 
                onCheckedChange={(checked) => setIsTrialPlan(checked === true)} 
              />
              <Label htmlFor="editIsTrialPlan" className="text-sm font-medium leading-none">
                Make it for Trials
              </Label>
            </div>
            <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Plan Name</p>
                <p className="font-semibold text-lg">{plan.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status & Type</p>
                <div className="flex gap-2">
                  <Badge variant={plan.isActive ? 'default' : 'destructive'}>
                    {plan.isActive ? 'Active' : 'Paused'}
                  </Badge>
                  {plan.isTrialPlan && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      Trial Plan
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="font-semibold text-lg">₹{plan.price}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Included Shakes</p>
                <p className="font-semibold">{plan.shakesCount} Shakes</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Validity</p>
                <p className="font-semibold">{plan.validityDays} Days</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3">Edit History Log</h3>
              {(!plan.editHistory || plan.editHistory.length === 0) ? (
                <div className="text-sm text-muted-foreground italic bg-muted/10 p-3 rounded-md border">
                  No edits have been made to this plan.
                </div>
              ) : (
                <div className="space-y-3">
                  {[...plan.editHistory].reverse().map((record, idx) => (
                    <div key={idx} className="border rounded-md p-3 bg-card shadow-sm text-sm">
                      <div className="flex justify-between items-start mb-2 border-b pb-2">
                        <span className="font-medium text-xs text-muted-foreground">
                          Edited on {formatDateTime(record.editedAt)}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {record.changes.map((change, cIdx) => (
                          <li key={cIdx} className="flex gap-2">
                            <span className="font-medium capitalize">{change.field}:</span>
                            <span className="line-through text-muted-foreground">{change.oldValue}</span>
                            <span>→</span>
                            <span className="text-green-600 dark:text-green-400 font-semibold">{change.newValue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between border-t pt-4">
              <Button variant="destructive" onClick={handleArchive}>
                Delete (Archive)
              </Button>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="secondary" onClick={handleTogglePause}>
                  {plan.isActive ? 'Pause Plan' : 'Resume Plan'}
                </Button>
                <Button onClick={handleEditClick}>
                  Edit Details
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
