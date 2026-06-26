'use client';

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { Customer } from '@/features/customers/types/customer.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { useBranchStore, useAuthStore } from '@/store';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GlassWater, Minus, Plus, CheckCircle2 } from 'lucide-react';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';
import { toast } from 'sonner';

export default function ConsumptionPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [balance, setBalance] = useState<CustomerMembershipStatus | null>(null);
  
  // Serve State
  const [serveCount, setServeCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const branchId = useBranchStore(state => state.activeBranchId);
  const user = useAuthStore(state => state.user);
  const role = useAuthStore(state => state.role);
  const [myInventory, setMyInventory] = useState<number | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      // Fetch all customers globally so any partner can serve any customer
      const data = await CustomerService.getActiveCustomers(null);
      setCustomers(data);
    };
    fetchCustomers();
  }, [branchId]);

  useEffect(() => {
    const fetchMyInventory = async () => {
      if (user && role === 'junior_partner') {
        const { PartnerInventoryService } = await import('@/features/partners/services/partner-inventory.service');
        const bal = await PartnerInventoryService.getInventoryBalance(user.uid);
        setMyInventory(bal);
      }
    };
    fetchMyInventory();
  }, [user, role, success]); // Re-fetch on success (after serve)

  useEffect(() => {
    if (selectedCustomerId) {
      if (!isAssignModalOpen) {
        // Reset states
        setSuccess(false);
        setServeCount(1);
        
        LedgerService.getCustomerBalance(selectedCustomerId)
          .then(setBalance)
          .catch(console.error);
      }
    } else {
      setBalance(null);
    }
  }, [selectedCustomerId, isAssignModalOpen]);

  const customerOptions = customers.map(c => ({
    value: c.id,
    label: `${c.displayId || '-'} | ${c.name} | ${c.mobile}`
  }));

  const handleServe = async () => {
    if (!selectedCustomerId || !balance || !user) return;
    
    const bId = branchId || 'default-branch';
    setLoading(true);
    try {
      await LedgerService.addConsumption({
        shakesDeducted: serveCount,
        branchId: bId,
        createdBy: user.uid,
        notes: `Served ${serveCount} shakes at the counter.`
      }, selectedCustomerId);
      
      // Update local balance state immediately
      setBalance({
        ...balance,
        remainingShakes: balance.remainingShakes - serveCount,
        totalShakesConsumed: balance.totalShakesConsumed + serveCount
      });
      
      setSuccess(true);
      setTimeout(() => {
        // Optionally auto-clear after 3 seconds or let them serve more
        // setSelectedCustomerId('');
        // setSuccess(false);
      }, 3000);
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to serve shake.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Serve Shakes</h1>
          <p className="text-muted-foreground">Select a customer to deduct shakes from their ledger.</p>
        </div>
        {role === 'junior_partner' && myInventory !== null && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Your Inventory</p>
            <p className={`text-2xl font-bold ${myInventory < 0 ? 'text-destructive' : 'text-primary'}`}>
              {myInventory} Shakes
            </p>
          </div>
        )}
      </div>

      <Card className="border-2 shadow-lg">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <CardTitle>Find Customer</CardTitle>
          <CardDescription>Search by Name, Mobile, or HC-ID</CardDescription>
          <div className="pt-2">
            <Combobox 
              options={customerOptions}
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              placeholder="Search customers..."
            />
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          {!selectedCustomerId ? (
            <div className="text-center py-12 text-muted-foreground">
              <GlassWater className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Please select a customer to view their balance.</p>
            </div>
          ) : !balance ? (
            <div className="text-center py-12 text-muted-foreground animate-pulse">
              Loading balance...
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              {/* Balance Status */}
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">{selectedCustomer?.name}</h2>
                <div className="inline-flex items-center justify-center gap-4 bg-secondary p-4 rounded-xl w-full">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Remaining</p>
                    <p className={`text-3xl font-bold ${balance.remainingShakes > 0 ? 'text-primary' : 'text-destructive'}`}>
                      {balance.remainingShakes}
                    </p>
                  </div>
                  <div className="h-12 w-px bg-border mx-2"></div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Expiry</p>
                    <p className={`text-lg font-medium ${balance.isExpired ? 'text-destructive' : ''}`}>
                      {balance.validUntil ? new Date(balance.validUntil).toLocaleDateString() : 'None'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Area */}
              {balance.remainingShakes <= 0 && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex flex-col items-center gap-2 border border-destructive/20 mb-6">
                  <p className="font-medium text-center">
                    Customer has 0 or fewer shakes remaining. Please assign a new plan.
                  </p>
                  <Button variant="destructive" size="sm" onClick={() => setIsAssignModalOpen(true)}>
                    Assign Plan
                  </Button>
                </div>
              )}
              
              {success ? (
                <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 p-8 rounded-xl text-center border border-green-200 dark:border-green-800 animate-in zoom-in-95 duration-300 flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Successfully Served!</h3>
                    <p className="text-sm mt-1 opacity-90">{serveCount} shake(s) deducted from {selectedCustomer?.name}.</p>
                  </div>
                  <Button variant="outline" className="mt-4" onClick={() => {
                    setSuccess(false);
                    setServeCount(1);
                  }}>
                    Serve Another
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-4 p-6 bg-muted/30 rounded-xl border border-dashed">
                    <p className="text-lg font-medium">How many shakes?</p>
                    <div className="flex items-center gap-6 bg-background p-2 rounded-full shadow-sm border">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-12 w-12"
                        onClick={() => setServeCount(Math.max(1, serveCount - 1))}
                        disabled={serveCount <= 1}
                      >
                        <Minus className="h-5 w-5" />
                      </Button>
                      <div className="flex flex-col items-center min-w-[3rem]">
                        <span className="text-3xl font-bold">{serveCount}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-12 w-12"
                        onClick={() => setServeCount(serveCount + 1)}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    className="w-full h-14 text-lg font-bold" 
                    onClick={handleServe}
                    disabled={loading}
                  >
                    <GlassWater className="mr-2 h-6 w-6" />
                    {loading ? 'Processing...' : `Serve ${serveCount} Shake${serveCount > 1 ? 's' : ''}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCustomer && (
        <AssignMembershipModal
          customerId={selectedCustomerId}
          customerName={selectedCustomer.name}
          open={isAssignModalOpen}
          onOpenChange={setIsAssignModalOpen}
        />
      )}
    </div>
  );
}
