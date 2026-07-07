import { useState, useEffect } from 'react';
import { FamilyGroup } from '../types/family.types';
import { Customer } from '@/features/customers/types/customer.types';
import { FamilyService } from '../services/family.service';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import { X, Trash2 } from 'lucide-react';

import { useAuthStore } from '@/store';

interface FamilyEditModalProps {
  family: FamilyGroup | null;
  customers: Customer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function FamilyEditModal({ family, customers, open, onOpenChange, onSuccess }: FamilyEditModalProps) {
  const { user } = useAuthStore();
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (family) {
      setMemberIds(family.memberIds || []);
    }
  }, [family]);

  if (!family) return null;

  const getCustomerName = (id: string) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.name} (${c.displayId})` : id;
  };

  const customerOptions = customers.filter(c => !c.isTrial).map(c => ({
    value: c.id,
    label: `${c.displayId || '-'} | ${c.name} | ${c.mobile}`
  }));

  const handleSave = async () => {
    const validMembers = memberIds.filter(id => id.trim() !== '');
    
    try {
      await FamilyService.updateFamily(family.id, { memberIds: validMembers }, user?.uid || 'system', family.branchId);
      toast.success('Family updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error('Failed to update family: ' + error.message);
    }
  };

  const handleArchive = async () => {
    if (!confirm(`Are you sure you want to disband this family? Members will no longer share shakes with ${getCustomerName(family.primaryCustomerId)}.`)) return;
    
    try {
      await FamilyService.updateFamily(family.id, { isArchived: true }, user?.uid || 'system', family.branchId);
      toast.success('Family disbanded successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error('Failed to disband family: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Family Account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-4">
          <div className="bg-muted/30 p-4 rounded-lg">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Primary Account (Pays for Shakes)</Label>
            <p className="font-semibold text-lg mt-1">{getCustomerName(family.primaryCustomerId)}</p>
          </div>
          
          <div className="space-y-3">
            <Label>Family Members (Consume Shakes)</Label>
            
            {memberIds.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No members currently.</p>
            )}

            {memberIds.map((mId, index) => (
              <div key={index} className="flex gap-2 items-center bg-card border rounded-md p-2">
                <div className="flex-1 truncate text-sm font-medium pl-2">
                  {getCustomerName(mId) || (
                    <Combobox 
                      options={customerOptions.filter(o => o.value !== family.primaryCustomerId && !memberIds.includes(o.value))}
                      value={mId}
                      onChange={(val) => {
                        const newIds = [...memberIds];
                        newIds[index] = val;
                        setMemberIds(newIds);
                      }}
                      placeholder="Select new member..."
                    />
                  )}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => {
                  const newIds = [...memberIds];
                  newIds.splice(index, 1);
                  setMemberIds(newIds);
                }} className="text-destructive hover:bg-destructive/10">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="w-full mt-2 border-dashed"
              onClick={() => setMemberIds([...memberIds, ''])}
            >
              + Add New Member
            </Button>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={handleArchive} className="text-destructive hover:bg-destructive/10 sm:mr-auto px-2">
            <Trash2 className="h-4 w-4 mr-2" /> Disband Family
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">Cancel</Button>
            <Button onClick={handleSave} className="flex-1 sm:flex-none">Save Changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
