import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Customer } from '../types/customer.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { Button } from '@/components/ui/button';
import { CalendarHeart, ClipboardList, MapPin, Phone, UserCircle, Target, FileText, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CustomerDetailsModalProps {
  customer: Customer | null;
  balance: CustomerMembershipStatus | null;
  partnerName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignPlanClick: () => void;
}

export function CustomerDetailsModal({
  customer,
  balance,
  partnerName,
  isOpen,
  onOpenChange,
  onAssignPlanClick
}: CustomerDetailsModalProps) {
  if (!customer) return null;

  const isExpired = balance?.isExpired;
  const expiryText = balance?.validUntil 
    ? new Date(balance.validUntil).toLocaleDateString() 
    : 'No Active Plan';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-primary" />
            {customer.name}
          </DialogTitle>
          <DialogDescription>
            {customer.displayId} • Joined {new Date(customer.createdAt).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] pr-4">
          <div className="space-y-6 pt-4">
            
            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> Contact & Location
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm bg-secondary/50 p-3 rounded-lg">
                <div className="font-medium">Mobile:</div>
                <div>{customer.mobile}</div>
                <div className="font-medium">Locality:</div>
                <div>{customer.locality || 'Not provided'}</div>
                <div className="font-medium">Address:</div>
                <div className="col-span-2 text-muted-foreground mt-1">
                  {customer.address || 'Not provided'}
                </div>
              </div>
            </div>

            {/* Health & Purpose */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Target className="h-4 w-4" /> Health & Purpose
              </h4>
              <div className="bg-secondary/50 p-3 rounded-lg space-y-2">
                <div className="flex flex-wrap gap-2">
                  {customer.purpose?.map(p => (
                    <Badge key={p} variant="secondary">{p}</Badge>
                  )) || <span className="text-sm text-muted-foreground">No specific purpose</span>}
                </div>
                {customer.notes && (
                  <div className="text-sm flex items-start gap-2 mt-2 pt-2 border-t border-border">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    <span>{customer.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Membership & Partner */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <CalendarHeart className="h-4 w-4" /> Membership Status
              </h4>
              <div className="bg-secondary/50 p-3 rounded-lg text-sm space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="font-medium">Assigned Junior Partner:</span>
                  <span className="font-semibold text-primary">{partnerName || 'None'}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-medium">Plan Expiry:</span>
                  <span className={isExpired ? 'text-destructive font-bold' : ''}>{expiryText}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Remaining Shakes:</span>
                  <span className={`font-bold ${balance?.remainingShakes && balance.remainingShakes < 5 ? 'text-destructive' : 'text-primary'}`}>
                    {balance?.remainingShakes || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total Consumed:</span>
                  <span>{balance?.totalShakesConsumed || 0}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {!isExpired && balance && balance.remainingShakes > 0 && (
          <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-sm text-amber-600 dark:text-amber-400 flex gap-2 items-start">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p><strong>Active Plan:</strong> This customer already has {balance.remainingShakes} shakes remaining. Assigning a new plan will overwrite their current balance.</p>
          </div>
        )}

        <DialogFooter className="mt-4 flex flex-row gap-3 w-full">
          <Button variant="outline" className="w-full flex-1" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="w-full flex-1 gap-2" onClick={onAssignPlanClick}>
            <ClipboardList className="h-4 w-4" /> Assign Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
