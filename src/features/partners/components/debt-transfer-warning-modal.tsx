import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, IndianRupee } from 'lucide-react';
import { CollectPartnerDueModal } from './collect-partner-due-modal';

interface DebtTransferWarningModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  clubId?: string;
  partnerName: string;
  amountDue: number;
  actionName: string; // e.g., "Transfer" or "Upgrade"
  onProceed: () => void; // Called when skipping or after successfully collecting debt
}

export function DebtTransferWarningModal({
  isOpen,
  onOpenChange,
  partnerId,
  clubId,
  partnerName,
  amountDue,
  actionName,
  onProceed
}: DebtTransferWarningModalProps) {
  const [isCollectOpen, setIsCollectOpen] = useState(false);

  const handleCollectSuccess = () => {
    setIsCollectOpen(false);
    onOpenChange(false);
    onProceed();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Pending Debt Detected
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              <strong>{partnerName}</strong> currently owes <strong className="text-red-600">₹{amountDue.toLocaleString()}</strong> to their current club.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground mt-2 mb-4">
            If you proceed without collecting, the debt will remain permanently owed to the old club owner, who can collect it later from their Former Partners ledger.
          </div>

          <DialogFooter className="flex flex-col sm:flex-row flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => {
                onOpenChange(false);
                onProceed();
              }}
            >
              Skip & {actionName}
            </Button>
            <Button 
              type="button" 
              className="bg-green-600 hover:bg-green-700" 
              onClick={() => setIsCollectOpen(true)}
            >
              Collect Now & {actionName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isCollectOpen && (
        <CollectPartnerDueModal
          partnerId={partnerId}
          clubId={clubId}
          partnerName={partnerName}
          amountDue={amountDue}
          isOpen={isCollectOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsCollectOpen(false);
            }
          }}
          onSuccess={handleCollectSuccess}
        />
      )}
    </>
  );
}
