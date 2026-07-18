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
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, UserCheck, AlertTriangle, Plus, Banknote, GlassWater, Minus, CheckCircle2, UserPlus, Calendar as CalendarIcon } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CustomerForm } from '@/features/customers/components/customer-form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import Link from 'next/link';
import { CollectPaymentModal } from '@/features/payments/components/collect-payment-modal';
import { ManageShakesModal } from '@/features/partners/components/add-shakes-modal';

export default function ConsumptionPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [partnerInventories, setPartnerInventories] = useState<Record<string, number>>({});
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [balance, setBalance] = useState<CustomerMembershipStatus | null>(null);
  
  // Serve State
  const [serveCount, setServeCount] = useState(1);
  const [serveDate, setServeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAddTrialOpen, setIsAddTrialOpen] = useState(false);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [isAddShakesModalOpen, setIsAddShakesModalOpen] = useState(false);

  const branchId = useBranchStore(state => state.activeBranchId);
  const user = useAuthStore(state => state.user);
  const role = useAuthStore(state => state.role);
  const [myInventory, setMyInventory] = useState<number | null>(null);

  const fetchData = async () => {
    const custData = await CustomerService.getActiveCustomers(null);
    setCustomers(custData);
    
    // Fetch all users to map partner names
    const usersSnap = await getDocs(COLLECTIONS.USERS);
    const pMap: Record<string, string> = {};
    usersSnap.docs.forEach(d => {
      const u = d.data();
      if (u.role === 'junior_partner') {
        pMap[d.id] = u.name || u.email || 'Unknown';
      }
    });
    setPartners(pMap);
  };

  useEffect(() => {
    fetchData();
  }, [branchId]);

  useEffect(() => {
    const fetchMyInventory = async () => {
      const { PartnerInventoryService } = await import('@/features/partners/services/partner-inventory.service');
      
      if (user && role === 'junior_partner') {
        const bal = await PartnerInventoryService.getInventoryBalance(user.uid);
        setMyInventory(bal);
      }
      
      // Also fetch inventory for the currently selected customer's assigned partner
      if (selectedCustomerId) {
        const c = customers.find(x => x.id === selectedCustomerId);
        if (c && c.juniorPartnerId) {
          const bal = await PartnerInventoryService.getInventoryBalance(c.juniorPartnerId);
          setPartnerInventories(prev => ({ ...prev, [c.juniorPartnerId!]: bal }));
        }
      }
    };
    fetchMyInventory();
  }, [user, role, success, selectedCustomerId, customers]);

  useEffect(() => {
    if (selectedCustomerId) {
      if (!isAssignModalOpen) {
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

  const customerOptions = customers.map(c => {
    let mobileDisplay = c.mobile;
    if (role === 'junior_partner' && c.juniorPartnerId !== user?.uid) {
      mobileDisplay = 'XXXXX XXXXX';
    }
    return {
      value: c.id,
      label: `${c.displayId || '-'} | ${c.name} | ${mobileDisplay}`
    };
  });

  const handleServe = async () => {
    if (!selectedCustomerId || !balance || !user) return;
    
    const bId = branchId || 'default-branch';
    setLoading(true);
    try {
      // Parse the date to timestamp
      const serveDateObj = new Date(serveDate);
      serveDateObj.setHours(new Date().getHours()); // keep current time but specific day
      serveDateObj.setMinutes(new Date().getMinutes());
      
      await LedgerService.addConsumption({
        shakesDeducted: serveCount,
        branchId: bId,
        createdBy: user.uid,
        createdAt: serveDateObj.getTime(),
        notes: `Served ${serveCount} shakes.`
      }, selectedCustomerId);
      
      setBalance({
        ...balance,
        remainingShakes: balance.remainingShakes - serveCount,
        totalShakesConsumed: balance.totalShakesConsumed + serveCount
      });
      
      // Send automated WhatsApp message
      try {
        const c = customers.find(x => x.id === selectedCustomerId);
        if (c && c.mobile) {
          const formattedDate = formatDate(serveDateObj.getTime());
          const timeStr = serveDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const consumed = balance.totalShakesConsumed + serveCount;
          const remaining = balance.remainingShakes - serveCount;
          const total = consumed + remaining;
          
          await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: c.name,
              mobile: c.mobile,
              date: formattedDate,
              time: timeStr,
              consumed: consumed,
              total: total,
              remaining: remaining
            })
          });
        }
      } catch (waError) {
        console.error('Failed to send WhatsApp message', waError);
      }
      
      setSuccess(true);
      toast.success(`Marked ${serveCount} attendance(s) for ${selectedCustomer?.name || 'Customer'}`);
      
      setTimeout(() => {
        // Auto-open search for next customer
        document.getElementById('customer-search-combobox')?.click();
      }, 500);
      
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to mark attendance.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const assignedPartnerId = selectedCustomer?.juniorPartnerId;
  const assignedPartnerName = assignedPartnerId ? partners[assignedPartnerId] : 'None';
  const assignedPartnerInventory = assignedPartnerId ? partnerInventories[assignedPartnerId] : null;

  const canClickCustomer = 
    role === 'super_admin' ? true :
    role === 'club_owner' ? selectedCustomer?.branchId === branchId :
    role === 'junior_partner' ? selectedCustomer?.juniorPartnerId === user?.uid : false;

  const canClickPartner =
    role === 'super_admin' ? true :
    role === 'club_owner' ? selectedCustomer?.branchId === branchId : false;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary"> Mark Attendance</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Dialog open={isAddTrialOpen} onOpenChange={setIsAddTrialOpen}>
            <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
              <UserPlus className="h-4 w-4" /> Add New Trial
            </DialogTrigger>
            <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
              <DialogHeader>
                <DialogTitle>Add New Trial Customer</DialogTitle>
              </DialogHeader>
              <CustomerForm 
                isTrial={true}
                onSuccess={() => {
                  setIsAddTrialOpen(false);
                  fetchData();
                }}
                onCancel={() => setIsAddTrialOpen(false)}
              />
            </DialogContent>
          </Dialog>

          {role === 'junior_partner' && myInventory !== null && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 px-3 text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Your Inventory</p>
              <p className={`text-xl font-bold ${myInventory < 0 ? 'text-destructive' : 'text-primary'}`}>
                {myInventory} Shakes
              </p>
            </div>
          )}
        </div>
      </div>

      <Card className="border-2 shadow-lg">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col md:flex-row md:items-end gap-3 relative">
            <div className="flex-1">
              <CardTitle className="mb-0.5">Find Customer</CardTitle>
              <CardDescription className="mb-1.5">Search by Name, Mobile, or HC-ID</CardDescription>
              <Combobox 
                id="customer-search-combobox"
                options={customerOptions}
                value={selectedCustomerId}
                onChange={(val) => {
                  setSelectedCustomerId(val);
                  if (success) {
                    setSuccess(false);
                    setServeCount(1);
                  }
                }}
                placeholder="Search customers..."
              />
            </div>
            
            <div className="w-full md:w-48">
              <CardDescription className="font-medium mb-2">Attendance Date</CardDescription>
              <Popover>
                <PopoverTrigger 
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !serveDate && "text-muted-foreground"
                      )}
                    />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {serveDate ? formatDate(serveDate) : <span>Pick a date</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={serveDate ? new Date(serveDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const localDateStr = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                        setServeDate(localDateStr);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Customer not found? <button onClick={() => setIsAddTrialOpen(true)} className="text-primary hover:underline">Add Trial Customer</button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4">
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
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              

              {/* Customer Name */}
              <div className="text-center mb-4 flex flex-col items-center justify-center gap-2">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  {canClickCustomer && selectedCustomer ? (
                    <Link href={`/customers/${selectedCustomer.id}`} className="hover:underline text-primary">
                      {selectedCustomer.name}
                    </Link>
                  ) : (
                    selectedCustomer?.name
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedCustomer?.isTrial && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border border-blue-200">
                      Trial Customer
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsAssignModalOpen(true)}>
                    Assign Membership
                  </Button>
                </div>
              </div>

              {/* Attendance Action Area */}
              {success ? (
                <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 p-6 rounded-xl text-center border border-green-200 dark:border-green-800 animate-in zoom-in-95 duration-300 flex flex-col items-center justify-center space-y-3 mb-4">
                  <div className="h-12 w-12 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-1">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Attendance Marked!</h3>
                    <p className="text-sm mt-1 opacity-90">{serveCount} attendance(s) deducted from {selectedCustomer?.name}.</p>
                  </div>
                  <Button variant="outline" className="mt-2" onClick={() => {
                    setSuccess(false);
                    setServeCount(1);
                  }}>
                    Mark Another
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  <div className="flex flex-col items-center gap-3 p-4 bg-muted/30 rounded-xl border border-dashed">
                    <p className="text-base font-medium">How many attendances?</p>
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
                    className="w-full h-12 text-lg font-bold" 
                    onClick={handleServe}
                    disabled={loading}
                  >
                    <GlassWater className="mr-2 h-6 w-6" />
                    {loading ? 'Processing...' : `Mark ${serveCount} Attendance${serveCount > 1 ? 's' : ''}`}
                  </Button>
                </div>
              )}

              {/* Partner Info Banner */}
              <div className="bg-muted p-2 sm:p-3 rounded-md flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium">
                    Assigned Partner: <span className="text-primary">
                      {canClickPartner && assignedPartnerId ? (
                        <Link href={`/partners/${assignedPartnerId}`} className="hover:underline">
                          {assignedPartnerName}
                        </Link>
                      ) : (
                        assignedPartnerName
                      )}
                    </span>
                  </p>
                  {assignedPartnerInventory !== null && (
                    <p className={`text-xs ${assignedPartnerInventory <= 10 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                      Partner Inventory: {assignedPartnerInventory} shakes remaining
                    </p>
                  )}
                </div>
                {role !== 'junior_partner' && assignedPartnerId && assignedPartnerInventory !== null && assignedPartnerInventory <= 10 && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="gap-1 border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => setIsAddShakesModalOpen(true)}
                  >
                    <AlertTriangle className="h-4 w-4" /> Add Inventory
                  </Button>
                )}
              </div>

              {/* Balance Status */}
              <div className="text-center">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 bg-secondary p-3 sm:p-4 rounded-xl w-full">
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
                      {balance.validUntil ? formatDate(balance.validUntil) : 'None'}
                    </p>
                  </div>
                  <div className="h-8 sm:h-12 w-px bg-border mx-1 sm:mx-2"></div>
                  <div className="text-center">
                    <p className="text-xs sm:text-sm text-muted-foreground">Marked</p>
                    <p className="text-base sm:text-lg font-medium">
                      {balance.totalShakesConsumed} / {balance.remainingShakes > 0 ? balance.totalShakesConsumed + balance.remainingShakes : balance.totalShakesConsumed}
                    </p>
                  </div>
                </div>
              </div>

              {/* Due Balance Section */}
              {balance.remainingBalance > 0 && (
                <div className="bg-destructive/10 text-destructive px-6 py-4 rounded-xl border border-destructive/20 flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                  <div>
                    <p className="font-semibold text-lg flex items-center gap-2">
                      <Banknote className="h-5 w-5" /> Due Balance: ₹{balance.remainingBalance}
                    </p>
                    <p className="text-sm opacity-80">This customer has an outstanding payment.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => setIsCollectModalOpen(true)}
                  >
                    Collect Payment
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

      {selectedCustomer && balance && balance.remainingBalance > 0 && (
        <CollectPaymentModal
          customerId={selectedCustomerId}
          customerName={selectedCustomer.name}
          amountDue={balance.remainingBalance}
          isOpen={isCollectModalOpen}
          onOpenChange={setIsCollectModalOpen}
          onSuccess={() => {
            // refresh balance
            LedgerService.getCustomerBalance(selectedCustomerId).then(setBalance);
          }}
        />
      )}

      {selectedCustomer && assignedPartnerId && (
        <ManageShakesModal 
          partnerId={assignedPartnerId}
          partnerName={assignedPartnerName}
          isOpen={isAddShakesModalOpen}
          onOpenChange={setIsAddShakesModalOpen}
          onSuccess={() => {
            // Refresh partner inventory
            const fetchMyInventory = async () => {
              const { PartnerInventoryService } = await import('@/features/partners/services/partner-inventory.service');
              const bal = await PartnerInventoryService.getInventoryBalance(assignedPartnerId);
              setPartnerInventories(prev => ({ ...prev, [assignedPartnerId]: bal }));
            };
            fetchMyInventory();
          }}
        />
      )}
    </div>
  );
}
