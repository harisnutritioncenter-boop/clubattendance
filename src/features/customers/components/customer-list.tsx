import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import { useBranchStore, useAuthStore } from '@/store';
import { CustomerService } from '../services/customer.service';
import { Customer } from '../types/customer.types';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { CustomerDetailsModal } from './customer-details-modal';
import { CustomerForm } from './customer-form';
import { CollectPaymentModal } from '@/features/payments/components/collect-payment-modal';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Eye, Filter, Download, Plus, AlertTriangle, MessageCircle, Phone, Copy, Search } from "lucide-react";
import { ContactActions } from "@/components/ui/contact-actions";
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function CustomerList({ filterByPartnerId }: { filterByPartnerId?: string }) {
  const { activeBranchId } = useBranchStore();
  const authState = useAuthStore(state => state);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, CustomerMembershipStatus>>({});
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [jpFilter, setJpFilter] = useState('ALL');
  const [clubFilter, setClubFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [inventoryFilter, setInventoryFilter] = useState('ALL');

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    let isActive = true;
    
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 1. Fetch Junior Partners map
        const usersSnap = await getDocs(COLLECTIONS.USERS);
        const partnerMap: Record<string, string> = {};
        usersSnap.docs.forEach(doc => {
          partnerMap[doc.id] = doc.data().name || doc.data().email || 'Unknown';
        });
        
        if (!isActive) return;
        setPartners(partnerMap);

        // 1.5 Fetch Branches for Admin
        if (authState.role === 'super_admin') {
          const branchesSnap = await getDocs(COLLECTIONS.BRANCHES);
          const branchMap: Record<string, string> = {};
          branchesSnap.docs.forEach(doc => {
            branchMap[doc.id] = doc.data().name;
          });
          if (!isActive) return;
          setBranches(branchMap);
        }

        // 2. Fetch Customers
        let data = await CustomerService.getActiveCustomers(activeBranchId);
        // Filter out trial customers
        data = data.filter(c => c.isTrial !== true);
        
        if (filterByPartnerId) {
          data = data.filter(c => c.juniorPartnerId === filterByPartnerId);
        } else if (authState.role === 'junior_partner' && authState.user) {
          data = data.filter(c => c.juniorPartnerId === authState.user!.uid);
        }
        
        if (!isActive) return;
        setCustomers(data);

        // 3. Fetch Balances for all loaded customers
        const balancePromises = data.map(async (c) => {
          try {
            const bal = await LedgerService.getCustomerBalance(c.id);
            return { id: c.id, bal };
          } catch {
            return { id: c.id, bal: null };
          }
        });
        
        const balancesArray = await Promise.all(balancePromises);
        const balanceMap: Record<string, CustomerMembershipStatus> = {};
        balancesArray.forEach(item => {
          if (item.bal) balanceMap[item.id] = item.bal;
        });
        
        if (!isActive) return;
        setBalances(balanceMap);

      } catch (err: any) {
        console.error('Failed to fetch customers:', err);
        if (isActive) setError('Failed to load customers.');
      } finally {
        if (isActive) setIsLoading(false);
      }
    };
    
    fetchData();
    
    return () => {
      isActive = false;
    };
  }, [activeBranchId, authState.role, authState.user?.uid]);

  const openAssignPlan = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailsModalOpen(false);
    setTimeout(() => setAssignModalOpen(true), 150); // slight delay to unmount details
  };

  const openCollectDebt = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailsModalOpen(false);
    setTimeout(() => setCollectModalOpen(true), 150);
  };

  const promptArchiveCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailsModalOpen(false);
    setTimeout(() => setArchiveModalOpen(true), 150);
  };

  const confirmArchiveCustomer = async () => {
    if (!selectedCustomer) return;
    
    try {
      await CustomerService.softDeleteCustomer(selectedCustomer.id, authState.user?.uid || 'system', selectedCustomer.branchId);
      toast.success('Customer archived successfully');
      setArchiveModalOpen(false);
      
      // Update local state to immediately remove them
      setCustomers(prev => prev.filter(c => c.id !== selectedCustomer.id));
    } catch (err: any) {
      toast.error('Failed to archive customer: ' + err.message);
    }
  };

  const openDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailsModalOpen(true);
  };

  // Extract unique purposes from data
  const allPurposes = useMemo(() => {
    const pSet = new Set<string>();
    customers.forEach(c => c.purpose?.forEach(p => pSet.add(p)));
    return Array.from(pSet);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const bal = balances[c.id];
      const partnerName = partners[c.juniorPartnerId || ''] || '';
      
      // Search
      const matchesSearch = !searchQuery || 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.mobile.includes(searchQuery) ||
        (c.displayId || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Status Filter
      if (statusFilter === 'ACTIVE' && (!bal || bal.isExpired || bal.remainingShakes <= 0)) return false;
      if (statusFilter === 'EXPIRED' && bal && !bal.isExpired && bal.remainingShakes > 0) return false;

      // JP Filter
      if (jpFilter === 'UNASSIGNED' && c.juniorPartnerId) return false;
      if (jpFilter !== 'ALL' && jpFilter !== 'UNASSIGNED' && c.juniorPartnerId !== jpFilter) return false;

      // Club Filter
      if (clubFilter === 'UNASSIGNED' && c.branchId && c.branchId !== 'default-branch') return false;
      if (clubFilter !== 'ALL' && clubFilter !== 'UNASSIGNED' && c.branchId !== clubFilter) return false;

      // Purpose Filter
      if (purposeFilter !== 'ALL' && (!c.purpose || !c.purpose.includes(purposeFilter as any))) return false;

      // Inventory Filter
      if (inventoryFilter === 'LOW' && (!bal || bal.remainingShakes > 5)) return false;
      if (inventoryFilter === 'EMPTY' && (!bal || bal.remainingShakes > 0)) return false;

      return true;
    });
  }, [customers, balances, partners, searchQuery, statusFilter, jpFilter, clubFilter, purposeFilter, inventoryFilter]);

  const exportToExcel = () => {
    if (filteredCustomers.length === 0) {
      toast.error('No customers to export');
      return;
    }
    const data = filteredCustomers.map(c => {
      const bal = balances[c.id];
      const pName = partners[c.juniorPartnerId || ''] || '-';
      return {
        ID: c.displayId || '-',
        Name: c.name,
        Mobile: c.mobile,
        Partner: pName,
        'Plan Name': bal?.latestPlanName || '-',
        'Remaining Shakes': bal?.remainingShakes || 0,
        Expired: bal?.isExpired ? 'Yes' : 'No',
        Purpose: (c.purpose || []).join(', ')
      };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Auto-size columns nicely
    const colWidths = [
      { wch: 10 }, // ID
      { wch: 25 }, // Name
      { wch: 15 }, // Mobile
      { wch: 20 }, // Partner
      { wch: 25 }, // Plan
      { wch: 18 }, // Remaining Shakes
      { wch: 10 }, // Expired
      { wch: 30 }, // Purpose
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, `customers_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading customers...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-destructive">{error}</div>;
  }

  if (customers.length === 0) {
    return (
      <div className="border rounded-lg bg-card text-card-foreground shadow-sm p-12 text-center text-muted-foreground">
        No customers found. Click "Add Customer" to create one.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* CRM Filter Toolbar */}
      <div className="flex flex-col space-y-4">
        {/* Always Visible Search */}
        <div className="flex flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Search Customers</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, mobile, ID..."
                className="pl-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <Button variant="outline" className="w-auto gap-2" onClick={exportToExcel}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export Excel</span><span className="sm:hidden">Export</span>
          </Button>
        </div>
        <div id="customer-filters" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 py-2">
          <div className="w-full min-w-0">
            <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 block truncate">Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || '')}>
              <SelectTrigger className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All</SelectItem>
                <SelectItem value="ACTIVE" className="text-xs">Active</SelectItem>
                <SelectItem value="EXPIRED" className="text-xs">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!filterByPartnerId && (
            <div className="w-full min-w-0">
              <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 block truncate">Partner</label>
              <Select value={jpFilter} onValueChange={(v) => setJpFilter(v || '')}>
                <SelectTrigger className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs">
                  <SelectValue placeholder="Partner">
                    {jpFilter === 'ALL' ? 'All' : jpFilter === 'UNASSIGNED' ? 'Unassigned' : (partners[jpFilter] ? partners[jpFilter].split(' ')[0] : 'Partner')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All</SelectItem>
                  <SelectItem value="UNASSIGNED" className="text-xs">Unassigned</SelectItem>
                  {Object.entries(partners).map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {authState.role === 'super_admin' && (
            <div className="w-full min-w-0">
              <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 block truncate">Club</label>
              <Select value={clubFilter} onValueChange={(v) => setClubFilter(v || '')}>
                <SelectTrigger className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs">
                  <SelectValue placeholder="Club">
                    {clubFilter === 'ALL' ? 'All' : clubFilter === 'UNASSIGNED' ? 'Unassigned' : (branches[clubFilter] ? branches[clubFilter] : 'Club')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All</SelectItem>
                  <SelectItem value="UNASSIGNED" className="text-xs">Unassigned</SelectItem>
                  {Object.entries(branches).map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="w-full min-w-0">
            <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 block truncate">Purpose</label>
            <Select value={purposeFilter} onValueChange={(v) => setPurposeFilter(v || '')}>
              <SelectTrigger className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs">
                <SelectValue placeholder="Purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All</SelectItem>
                {allPurposes.map(p => (
                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full min-w-0">
            <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1 block truncate">Inventory</label>
            <Select value={inventoryFilter} onValueChange={(v) => setInventoryFilter(v || '')}>
              <SelectTrigger className="h-8 px-1.5 sm:px-3 text-[10px] sm:text-xs">
                <SelectValue placeholder="Inventory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">All</SelectItem>
                <SelectItem value="LOW" className="text-xs">Low (≤5)</SelectItem>
                <SelectItem value="EMPTY" className="text-xs">Empty</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] text-center">#</TableHead>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Junior Partner</TableHead>
              <TableHead>Membership / Expiry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No customers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer, index) => {
                const bal = balances[customer.id];
                const pName = partners[customer.juniorPartnerId || ''] || '-';
                const isExpired = bal?.isExpired;
                const expiryText = bal?.validUntil 
                  ? formatDate(bal.validUntil) 
                  : 'No Active Plan';

                return (
                  <TableRow 
                    key={customer.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openDetails(customer)}
                  >
                    <TableCell className="text-center text-muted-foreground font-medium">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium text-xs text-muted-foreground whitespace-nowrap">
                      {customer.displayId || '-'}
                    </TableCell>
                    <TableCell className="font-semibold">{customer.name}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium text-xs sm:text-sm">{customer.mobile}</span>
                        <ContactActions mobile={customer.mobile} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.juniorPartnerId ? (
                        <Link href={`/partners/${customer.juniorPartnerId}`} onClick={(e) => e.stopPropagation()}>
                          <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium hover:underline text-primary">
                            {pName}
                          </span>
                        </Link>
                      ) : (
                        <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium">
                          {pName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div>
                          <span className={`text-sm ${isExpired || (bal && bal.remainingShakes <= 0) ? 'text-destructive font-bold' : ''}`}>
                            {bal?.latestPlanName ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground">{bal.latestPlanName}</span>
                                <span className="text-xs text-muted-foreground">{expiryText}</span>
                              </div>
                            ) : (
                              expiryText
                            )}
                          </span>
                          {bal && bal.remainingShakes > 0 && !isExpired && (
                            <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {bal.remainingShakes} shakes
                            </span>
                          )}
                        </div>
                        {bal && bal.remainingBalance > 0 && (
                          <div className="text-xs font-semibold text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-sm inline-block w-fit">
                            Due: ₹{bal.remainingBalance}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Global Modals */}
      <CustomerDetailsModal
        isOpen={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        customer={selectedCustomer}
        balance={selectedCustomer ? balances[selectedCustomer.id] : null}
        partnerName={selectedCustomer ? partners[selectedCustomer.juniorPartnerId || ''] : ''}
        onAssignPlanClick={() => openAssignPlan(selectedCustomer!)}
        onCollectDebtClick={() => openCollectDebt(selectedCustomer!)}
        onArchiveClick={() => promptArchiveCustomer(selectedCustomer!)}
        onEditClick={() => {
          setDetailsModalOpen(false);
          setTimeout(() => setEditModalOpen(true), 150);
        }}
      />

      {selectedCustomer && (
        <AssignMembershipModal 
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          customerId={selectedCustomer.id} 
          customerName={selectedCustomer.name} 
        />
      )}

      {selectedCustomer && balances[selectedCustomer.id] && balances[selectedCustomer.id].remainingBalance > 0 && (
        <CollectPaymentModal
          isOpen={collectModalOpen}
          onOpenChange={setCollectModalOpen}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          amountDue={balances[selectedCustomer.id].remainingBalance}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {selectedCustomer && (
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer: {selectedCustomer.name}</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              customer={selectedCustomer}
              onSuccess={() => {
                setEditModalOpen(false);
                // The data doesn't auto-refresh here, maybe we should trigger a fetch
                // But typically reloading the window or triggering a re-render is needed
                window.location.reload(); 
              }}
              onCancel={() => setEditModalOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {selectedCustomer && (
        <Dialog open={archiveModalOpen} onOpenChange={setArchiveModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-destructive">Archive Customer</DialogTitle>
              <DialogDescription>
                Are you sure you want to archive <strong>{selectedCustomer.name}</strong>? 
                They will no longer appear in the active customer list, but their financial records will be kept safe.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:justify-end mt-4">
              <Button variant="outline" onClick={() => setArchiveModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmArchiveCustomer}>
                Yes, Archive
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
