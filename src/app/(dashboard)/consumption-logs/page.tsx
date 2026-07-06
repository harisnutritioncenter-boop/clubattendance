'use client';

import { useState, useEffect } from 'react';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import { useBranchStore, useAuthStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { Search, Coffee, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ConsumptionLogsPage() {
  const globalBranchId = useBranchStore(state => state.activeBranchId);
  const authRole = useAuthStore(state => state.role);
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedClub, setSelectedClub] = useState<string>(globalBranchId || 'all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedPartner, setSelectedPartner] = useState('all');
  
  const [branches, setBranches] = useState<any[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  // Keep selectedClub in sync if they change the global branch via the top nav
  useEffect(() => {
    if (globalBranchId) setSelectedClub(globalBranchId);
  }, [globalBranchId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const bId = selectedClub === 'all' ? null : selectedClub;
      const start = new Date(startDate).getTime();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (authRole === 'super_admin' && branches.length === 0) {
        const branchSnap = await getDocs(COLLECTIONS.BRANCHES);
        setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const [{ consumptions }, customersSnap, usersSnap] = await Promise.all([
        LedgerService.getReportsData(bId, start, end.getTime()),
        CustomerService.getActiveCustomers(bId),
        getDocs(COLLECTIONS.USERS)
      ]);

      const customerMap: Record<string, string> = {};
      const customerPartnerMap: Record<string, string> = {};
      customersSnap.forEach(c => {
        customerMap[c.id] = c.displayId ? `${c.displayId} (${c.name})` : c.name;
        if (c.juniorPartnerId) {
          customerPartnerMap[c.id] = c.juniorPartnerId;
        }
      });

      const userMap: Record<string, string> = {};
      usersSnap.docs.forEach(d => {
        userMap[d.id] = d.data().name || d.data().email || d.id;
      });

      let formattedLogs = consumptions.map(c => {
        const partnerId = customerPartnerMap[c.customerId] || c.createdBy;
        return {
          ...c,
          customerName: customerMap[c.customerId] || 'Unknown Customer',
          partnerName: userMap[partnerId] || 'Unknown Partner'
        };
      });

      const user = useAuthStore.getState().user;
      if (authRole === 'junior_partner' && user) {
        formattedLogs = formattedLogs.filter(c => c.createdBy === user.uid);
      }

      setLogs(formattedLogs);
      // reset secondary filters when data updates
      setSelectedCustomer('all');
      setSelectedPartner('all');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedClub, startDate, endDate]);

  useEffect(() => {
    let result = logs;
    
    if (searchTerm.trim() !== '') {
      const lower = searchTerm.toLowerCase();
      result = result.filter(log => 
        log.customerName.toLowerCase().includes(lower) ||
        log.consumedBy?.toLowerCase().includes(lower) ||
        log.notes?.toLowerCase().includes(lower)
      );
    }

    if (selectedCustomer !== 'all') {
      result = result.filter(log => log.customerName === selectedCustomer);
    }
    
    if (selectedPartner !== 'all') {
      result = result.filter(log => log.partnerName === selectedPartner);
    }

    setFilteredLogs(result);
  }, [searchTerm, selectedCustomer, selectedPartner, logs]);

  const uniqueCustomers = Array.from(new Set(logs.map(l => l.customerName))).sort();
  const uniquePartners = Array.from(new Set(logs.map(l => l.partnerName))).sort();
  const totalShakes = filteredLogs.reduce((acc, log) => acc + (log.shakesDeducted || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consumption Logs</h1>
          <p className="text-muted-foreground">View and filter shake consumption records.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Total Served Card - smaller on mobile, prominent on desktop */}
        <Card className="bg-primary text-primary-foreground flex flex-row md:flex-col justify-between md:justify-center items-center p-4 md:p-6 md:w-64 shrink-0 shadow-md">
          <div className="flex items-center gap-3 md:flex-col md:mb-2">
            <Coffee className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
            <p className="text-sm md:text-base font-medium opacity-90">Total Served</p>
          </div>
          <p className="text-2xl md:text-4xl font-bold">{totalShakes.toLocaleString()}</p>
        </Card>

        {/* Filters Card */}
        <Card className="flex-1">
          <CardHeader className="p-3 md:p-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium flex items-center">
              <Filter className="w-4 h-4 mr-2" /> Filters
            </CardTitle>
            <Button variant="ghost" size="sm" className="md:hidden h-8" onClick={() => setShowMobileFilters(!showMobileFilters)}>
              {showMobileFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CardHeader>
          <CardContent className={cn("p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", !showMobileFilters && "hidden md:grid")}>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            
            {authRole === 'super_admin' && (
              <div className="space-y-2">
                <Label>Club</Label>
                <Select value={selectedClub} onValueChange={(v) => setSelectedClub(v || '')}>
                  <SelectTrigger><SelectValue placeholder="All Clubs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clubs</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={selectedCustomer} onValueChange={(v) => setSelectedCustomer(v || '')}>
                <SelectTrigger><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {uniqueCustomers.map(c => <SelectItem key={c as string} value={c as string}>{c as string}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Served By (Partner)</Label>
              <Select value={selectedPartner} onValueChange={(v) => setSelectedPartner(v || '')}>
                <SelectTrigger><SelectValue placeholder="All Partners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Partners</SelectItem>
                  {uniquePartners.map(p => <SelectItem key={p as string} value={p as string}>{p as string}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-4">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Showing {filteredLogs.length} records</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by customer, consumer, notes..."
              className="pl-8 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No consumption logs found matching your filters.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Primary Customer</TableHead>
                    <TableHead>Consumed By</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Served By</TableHead>
                    <TableHead className="text-right">Deducted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{log.customerName}</TableCell>
                      <TableCell className="whitespace-nowrap">{log.consumedBy || '-'}</TableCell>
                      <TableCell className="max-w-[150px] sm:max-w-[200px] truncate" title={log.notes}>{log.notes || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{log.partnerName}</TableCell>
                      <TableCell className="text-right font-bold text-orange-600">
                        -{log.shakesDeducted}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
