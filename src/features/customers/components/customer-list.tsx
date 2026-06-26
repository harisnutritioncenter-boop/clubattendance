import { useEffect, useState, useMemo } from 'react';
import { useBranchStore, useAuthStore } from '@/store';
import { CustomerService } from '../services/customer.service';
import { Customer } from '../types/customer.types';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { CustomerDetailsModal } from './customer-details-modal';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
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
import { Filter, Search } from 'lucide-react';

export function CustomerList() {
  const { activeBranchId } = useBranchStore();
  const authState = useAuthStore(state => state);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, CustomerMembershipStatus>>({});
  const [partners, setPartners] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [jpFilter, setJpFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [inventoryFilter, setInventoryFilter] = useState('ALL');

  // Modal States
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
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

        // 2. Fetch Customers
        let data = await CustomerService.getActiveCustomers(activeBranchId);
        // Filter out trial customers
        data = data.filter(c => c.isTrial !== true);
        
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
      if (jpFilter !== 'ALL' && c.juniorPartnerId !== jpFilter) return false;

      // Purpose Filter
      if (purposeFilter !== 'ALL' && (!c.purpose || !c.purpose.includes(purposeFilter as any))) return false;

      // Inventory Filter
      if (inventoryFilter === 'LOW' && (!bal || bal.remainingShakes > 5)) return false;
      if (inventoryFilter === 'EMPTY' && (!bal || bal.remainingShakes > 0)) return false;

      return true;
    });
  }, [customers, balances, partners, searchQuery, statusFilter, jpFilter, purposeFilter, inventoryFilter]);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 p-4 bg-secondary/30 rounded-lg border">
        
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Name, mobile, ID..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Membership Status</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || '')}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="EXPIRED">Expired / Empty</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Junior Partner</label>
          <Select value={jpFilter} onValueChange={(v) => setJpFilter(v || '')}>
            <SelectTrigger>
              <SelectValue placeholder="Junior Partner">
                {jpFilter === 'ALL' ? 'All Partners' : partners[jpFilter] || 'Junior Partner'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Partners</SelectItem>
              {Object.entries(partners).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Primary Purpose</label>
          <Select value={purposeFilter} onValueChange={(v) => setPurposeFilter(v || '')}>
            <SelectTrigger>
              <SelectValue placeholder="Purpose" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Purposes</SelectItem>
              {allPurposes.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Inventory Warning</label>
          <Select value={inventoryFilter} onValueChange={(v) => setInventoryFilter(v || '')}>
            <SelectTrigger>
              <SelectValue placeholder="Inventory Warning" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any Inventory</SelectItem>
              <SelectItem value="LOW">Low Balance (≤ 5)</SelectItem>
              <SelectItem value="EMPTY">Empty (0)</SelectItem>
            </SelectContent>
          </Select>
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
                  ? new Date(bal.validUntil).toLocaleDateString() 
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
                    <TableCell>{customer.mobile}</TableCell>
                    <TableCell>
                      <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium">
                        {pName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${isExpired || (bal && bal.remainingShakes <= 0) ? 'text-destructive font-bold' : ''}`}>
                        {expiryText}
                      </span>
                      {bal && bal.remainingShakes > 0 && !isExpired && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {bal.remainingShakes} shakes
                        </span>
                      )}
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
      />

      {selectedCustomer && (
        <AssignMembershipModal 
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          customerId={selectedCustomer.id} 
          customerName={selectedCustomer.name} 
        />
      )}
    </div>
  );
}
