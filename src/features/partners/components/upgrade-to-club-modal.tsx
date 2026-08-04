import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDoc, updateDoc, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, COLLECTIONS } from '@/firebase';
import { toast } from 'sonner';

interface UpgradeToClubModalProps {
  partnerId: string;
  partnerName: string;
  currentBranchId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UpgradeToClubModal({
  partnerId,
  partnerName,
  currentBranchId,
  isOpen,
  onOpenChange,
  onSuccess,
}: UpgradeToClubModalProps) {
  const [newClubName, setNewClubName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName.trim()) {
      toast.error('Please enter a new club name.');
      return;
    }

    if (!confirm(`Are you sure you want to upgrade ${partnerName} to a Club Owner? This will create a new club and migrate all their current customers to the new club. Past data will remain linked to the old club for accounting purposes.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create a new branch
      const newClubRef = await addDoc(COLLECTIONS.BRANCHES, {
        name: newClubName.trim(),
        createdAt: Date.now()
      });
      const newBranchId = newClubRef.id;

      // 2. Update the user document
      const userRef = doc(COLLECTIONS.USERS, partnerId);
      await updateDoc(userRef, {
        role: 'club_owner',
        clubId: newBranchId, // Keep it named clubId to match existing schema
        previousRole: 'junior_partner',
        previousBranchId: currentBranchId,
        upgradedToClubOwnerAt: Date.now()
      });

      // 3. Migrate customers assigned to this partner to the new club
      const customersSnap = await getDocs(COLLECTIONS.CUSTOMERS);
      const customersToMigrate = customersSnap.docs.filter(customerDoc => {
        const data = customerDoc.data();
        return data.juniorPartnerId === partnerId || data.createdBy === partnerId;
      });
      
      if (customersToMigrate.length > 0) {
        const batch = writeBatch(db);
        customersToMigrate.forEach(customerDoc => {
          batch.update(doc(COLLECTIONS.CUSTOMERS, customerDoc.id), {
            branchId: newBranchId
          });
        });
        await batch.commit();
      }

      toast.success(`${partnerName} has been successfully upgraded to a Club Owner!`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error upgrading partner:', error);
      toast.error(`Failed to upgrade partner: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to Club Owner</DialogTitle>
          <DialogDescription>
            Upgrade {partnerName} to their own club. Their historical data will be frozen and merged into their new views.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpgrade} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>New Club Name</Label>
            <Input
              required
              placeholder="e.g. Healthy Cafe West"
              value={newClubName}
              onChange={(e) => setNewClubName(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Upgrading...' : 'Confirm Upgrade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
