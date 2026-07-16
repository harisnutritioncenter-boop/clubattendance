'use client';
import Link from 'next/link';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Search, Coffee, Filter, ChevronDown, ChevronUp, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime } from '@/lib/utils';

export default function ConsumptionLogsPage() {
  const globalBranchId = useBranchStore(state => state.activeBranchId);
  const authRole = useAuthStore(state => state.role);
  const user = useAuthStore(state => state.user);
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedClub, setSelectedClub] = useState<string>(globalBranchId || 'all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedJuniorPartners, setSelectedJuniorPartners] = useState<string[]>([]);
  
  const [branches, setBranches] = useState<any[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => new Date());

  // Keep selectedClub in sync if they change the global branch via the top nav
  useEffect(() => {
    if (globalBranchId) setSelectedClub(globalBranchId);
  }, [globalBranchId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      // For Junior Partners, we fetch all records and filter in-memory to catch records created by Admin without a branch ID
      const bId = authRole === 'junior_partner' ? null : (selectedClub === 'all' ? null : selectedClub);
      const start = startDate.getTime();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (authRole === 'super_admin' && branches.length === 0) {
        const branchSnap = await getDocs(COLLECTIONS.BRANCHES);
        setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const [{ consumptions }, customersSnap, usersSnap] = await Promise.all([
        LedgerService.getReportsData(bId, start, end.getTime()),
        getDocs(COLLECTIONS.CUSTOMERS),
        getDocs(COLLECTIONS.USERS)
      ]);

      const customerMap: Record<string, string> = {};
      const customerPartnerMap: Record<string, string> = {};
      customersSnap.docs.forEach(doc => {
        const c = doc.data();
        customerMap[doc.id] = c.displayId ? `${c.displayId} (${c.name})` : c.name;
        if (c.juniorPartnerId) {
          customerPartnerMap[doc.id] = c.juniorPartnerId;
        }
      });

      const userMap: Record<string, string> = {};
      usersSnap.docs.forEach(d => {
        userMap[d.id] = d.data().name || d.data().email || d.id;
      });

      let formattedLogs = consumptions.map(c => {
        const partnerId = c.createdBy;
        const assignedJpId = customerPartnerMap[c.customerId];
        return {
          ...c,
          partnerId,
          assignedJpId,
          customerName: customerMap[c.customerId] || 'Unknown Customer',
          partnerName: userMap[partnerId] || 'Admin',
          juniorPartnerName: assignedJpId ? (userMap[assignedJpId] || 'Unknown') : 'None'
        };
      });

      const user = useAuthStore.getState().user;
      if (authRole === 'junior_partner' && user) {
        formattedLogs = formattedLogs.filter(c => (customerPartnerMap[c.customerId] || c.createdBy) === user.uid);
      }

      setLogs(formattedLogs);
      // reset secondary filters when data updates
      setSelectedCustomer('all');
      setSelectedPartners([]);
      setSelectedJuniorPartners([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedClub, startDate, endDate, globalBranchId, authRole]);

  const handleRevert = async (log: any) => {
    if (authRole === 'junior_partner') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (log.createdAt < sevenDaysAgo) {
        toast.error('Junior Partners can only revert consumptions within 7 days.');
        return;
      }
    }

    if (!confirm('Are you sure you want to revert this shake consumption? This will refund the shake.')) return;

    try {
      await LedgerService.voidConsumption(log.id, user?.uid || 'system');
      toast.success('Consumption reverted successfully');
      // Optimistic UI update
      const newLogs = logs.filter(l => l.id !== log.id);
      setLogs(newLogs);
      // Let the useEffect handle re-filtering
    } catch (error: any) {
      toast.error('Failed to revert consumption: ' + error.message);
    }
  };

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
    
    if (selectedPartners.length > 0) {
      result = result.filter(log => selectedPartners.includes(log.partnerName));
    }
    
    if (selectedJuniorPartners.length > 0) {
      result = result.filter(log => selectedJuniorPartners.includes(log.juniorPartnerName));
    }

    setFilteredLogs(result);
  }, [searchTerm, selectedCustomer, selectedPartners, selectedJuniorPartners, logs]);

  const uniqueCustomers = Array.from(new Set(logs.map(l => l.customerName))).sort();
  const uniquePartners = Array.from(new Set(logs.map(l => l.partnerName))).sort();
  const uniqueJuniorPartners = Array.from(new Set(logs.map(l => l.juniorPartnerName).filter(n => n !== 'None'))).sort();
  const totalShakes = filteredLogs.reduce((acc, log) => acc + (log.shakesDeducted || 1), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consumption Logs</h1>
          <p className="text-muted-foreground">View and filter shake consumption records.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Total Attendances Card - smaller on mobile, prominent on desktop */}
        <Card className="bg-primary text-primary-foreground flex flex-row md:flex-col justify-between md:justify-center items-center p-4 md:p-6 md:w-64 shrink-0 shadow-md">
          <div className="flex items-center gap-3 md:flex-col md:mb-2">
            <Coffee className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
            <p className="text-sm md:text-base font-medium opacity-90">Total Attendances</p>
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
              <Popover>
                <PopoverTrigger render={<Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")} />}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yy") : <span>Pick a date</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger render={<Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")} />}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yy") : <span>Pick a date</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
            
            {authRole === 'super_admin' && (
              <div className="space-y-2">
                <Label>Club</Label>
                <Select value={selectedClub} onValueChange={(v) => setSelectedClub(v || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Clubs">
                      {selectedClub === 'all' ? 'All Clubs' : branches.find(b => b.id === selectedClub)?.name || selectedClub}
                    </SelectValue>
                  </SelectTrigger>
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
              <Label>Junior Partner</Label>
              <Popover>
                <PopoverTrigger
                  className="w-full justify-start text-left font-normal h-10 border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border rounded-md"
                >
                  {selectedJuniorPartners.length === 0 
                    ? "All Junior Partners" 
                    : `${selectedJuniorPartners.length} selected`}
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2" align="start">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uniqueJuniorPartners.map(p => (
                      <div key={p as string} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`jp-${p}`}
                          checked={selectedJuniorPartners.includes(p as string)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedJuniorPartners([...selectedJuniorPartners, p as string]);
                            } else {
                              setSelectedJuniorPartners(selectedJuniorPartners.filter(x => x !== p));
                            }
                          }}
                        />
                        <label htmlFor={`jp-${p}`} className="text-sm font-medium leading-none cursor-pointer">
                          {p as string}
                        </label>
                      </div>
                    ))}
                    {uniqueJuniorPartners.length === 0 && <div className="text-sm text-muted-foreground p-2">No junior partners found</div>}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>Marked By (Partner)</Label>
              <Popover>
                <PopoverTrigger
                  className="w-full justify-start text-left font-normal h-10 border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border rounded-md"
                >
                  {selectedPartners.length === 0 
                    ? "All Partners" 
                    : `${selectedPartners.length} selected`}
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2" align="start">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uniquePartners.map(p => (
                      <div key={p as string} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`partner-${p}`}
                          checked={selectedPartners.includes(p as string)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedPartners([...selectedPartners, p as string]);
                            } else {
                              setSelectedPartners(selectedPartners.filter(x => x !== p));
                            }
                          }}
                        />
                        <label htmlFor={`partner-${p}`} className="text-sm font-medium leading-none cursor-pointer">
                          {p as string}
                        </label>
                      </div>
                    ))}
                    {uniquePartners.length === 0 && <div className="text-sm text-muted-foreground p-2">No partners found</div>}
                  </div>
                </PopoverContent>
              </Popover>
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
                    <TableHead>Marked By</TableHead>
                    <TableHead>Junior Partner</TableHead>
                    <TableHead className="text-right">Deducted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{log.customerName}</TableCell>
                      <TableCell className="whitespace-nowrap">{log.consumedBy || '-'}</TableCell>
                      <TableCell className="max-w-[150px] sm:max-w-[200px] truncate" title={log.notes}>{log.notes || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {log.partnerId ? (
                          <Link href={`/partners/${log.partnerId}`} className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                            {log.partnerName}
                          </Link>
                        ) : log.partnerName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {log.assignedJpId ? (
                          <Link href={`/partners/${log.assignedJpId}`} className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                            {log.juniorPartnerName}
                          </Link>
                        ) : (log.juniorPartnerName === 'None' ? '-' : log.juniorPartnerName)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-orange-600">
                        -{log.shakesDeducted}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRevert(log)} title="Revert Consumption">
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
