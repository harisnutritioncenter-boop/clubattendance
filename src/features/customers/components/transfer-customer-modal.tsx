'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Customer } from '../types/customer.types';
import { CustomerService } from '../services/customer.service';
import { useAuthStore } from '@/store';
import { getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { toast } from 'sonner';

interface TransferCustomerModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  onSuccess: () => void;
}

/* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
export function TransferCustomerModal({ isOpen, onOpenChange, customer, onSuccess }: TransferCustomerModalProps) {
  const [juniorPartners, setJuniorPartners] = useState<{label: string, value: string, clubId: string}[]>([]);
  const [selectedJp, setSelectedJp] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    async function loadJPs() {
      try {
        const branchSnap = await getDocs(COLLECTIONS.BRANCHES);
        const branchMap: Record<string, string> = {};
        branchSnap.docs.forEach(doc => {
          branchMap[doc.id] = doc.data().name || 'Unknown Club';
        });

        const q = query(COLLECTIONS.USERS, where('role', '==', 'junior_partner'));
        const snap = await getDocs(q);
        const jps = snap.docs
          .filter(doc => doc.data().isArchived !== true)
          .map(doc => {
            const jpData = doc.data();
            const baseName = jpData.name || jpData.email || 'Unknown';
            const clubName = jpData.clubId ? branchMap[jpData.clubId] || 'Unknown Club' : 'No Club';
            return {
              label: `${baseName} (${clubName})`,
              value: doc.id,
              clubId: jpData.clubId || ''
            };
          });
        let filteredJps = jps.filter(jp => jp.value !== customer.juniorPartnerId);
        
        const authState = useAuthStore.getState();
        if (authState.role === 'club_owner') {
          const ownerClubId = (authState.user as any)?.clubId;
          if (ownerClubId) {
            filteredJps = filteredJps.filter(jp => jp.clubId === ownerClubId);
          }
        }
        
        setJuniorPartners(filteredJps);
      } catch (error) {
        console.error("Error loading JPs", error);
      }
    }
    if (isOpen) {
      loadJPs();
      setSelectedJp('');
    }
  }, [isOpen, customer.juniorPartnerId]);

  const handleTransfer = async () => {
    if (!selectedJp) {
      toast.error("Please select a new Junior Partner.");
      return;
    }
    if (!user) return;

    const jpData = juniorPartners.find(jp => jp.value === selectedJp);
    if (!jpData) return;

    try {
      setIsSubmitting(true);
      await CustomerService.transferCustomer(
        customer.id,
        selectedJp,
        jpData.clubId,
        user.uid
      );
      toast.success("Customer transferred successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to transfer customer: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Customer</DialogTitle>
          <DialogDescription>
            Transfer <strong>{customer.name}</strong> to a new Junior Partner.
            This will update their active assigned club and record the transfer history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2 flex flex-col">
            <Label>New Junior Partner</Label>
            <Combobox
              options={juniorPartners}
              value={selectedJp}
              onChange={setSelectedJp}
              placeholder="Search junior partner..."
            />
          </div>
          
          {selectedJp && (
            <div className="text-sm bg-blue-50 text-blue-900 p-3 rounded-md">
              <p>The customer will be transferred to <strong>{juniorPartners.find(j => j.value === selectedJp)?.label}</strong>.</p>
              {juniorPartners.find(j => j.value === selectedJp)?.clubId !== customer.branchId && (
                <p className="mt-1 font-semibold">Note: This will also transfer the customer to a different club.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={isSubmitting || !selectedJp}>
            {isSubmitting ? "Transferring..." : "Transfer Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
*/

export function TransferCustomerModal(_props: TransferCustomerModalProps) {
  return null;
}
