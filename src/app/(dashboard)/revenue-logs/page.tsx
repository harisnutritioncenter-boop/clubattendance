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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Search, IndianRupee, Filter, ChevronDown, ChevronUp, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime } from '@/lib/utils';

export default function RevenueLogsPage() {
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
  
  const [branches, setBranches] = useState<any[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [logToRevert, setLogToRevert] = useState<any>(null);

  const [startDate, setStartDate] = useState<Date>(() => new Date());
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
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (authRole === 'super_admin' && branches.length === 0) {
        const branchSnap = await getDocs(COLLECTIONS.BRANCHES);
        setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      const [{ payments }, customersSnap, usersSnap] = await Promise.all([
        LedgerService.getReportsData(bId, start.getTime(), end.getTime()),
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
      const userRoleMap: Record<string, string> = {};
      usersSnap.docs.forEach(d => {
        userMap[d.id] = d.data().name || d.data().email || d.id;
        userRoleMap[d.id] = d.data().role;
      });

      let formattedLogs = payments.map(p => {
        const actualPartnerId = customerPartnerMap[p.customerId] || p.createdBy;
        return {
          ...p,
          actualPartnerId,
          customerName: customerMap[p.customerId] || 'Unknown Customer',
          partnerName: userMap[actualPartnerId] || 'Admin',
          partnerRole: userRoleMap[actualPartnerId]
        };
      });

      const user = useAuthStore.getState().user;
      if (authRole === 'junior_partner' && user) {
        formattedLogs = formattedLogs.filter(p => (customerPartnerMap[p.customerId] || p.createdBy) === user.uid);
      }

      setLogs(formattedLogs);
      // reset secondary filters when data updates
      setSelectedCustomer('all');
      setSelectedPartners([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (log: any) => {
    if (log.type !== 'Membership' && log.type !== 'Debt Collection') {
      toast.error('Only membership and debt collection payments can be reverted here.');
      return;
    }

    if (authRole === 'junior_partner') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (log.createdAt < sevenDaysAgo) {
        toast.error('Junior Partners can only revert assignments within 7 days.');
        return;
      }
    }

    setLogToRevert(log);
  };

  const confirmRevert = async () => {
    if (!logToRevert) return;
    try {
      await LedgerService.voidPayment(logToRevert.id, user?.uid || 'system');
      toast.success('Membership assignment reverted successfully');
      // Optimistic UI update
      const newLogs = logs.filter(l => l.id !== logToRevert.id);
      setLogs(newLogs);
      setLogToRevert(null);
    } catch (error: any) {
      toast.error('Failed to revert assignment: ' + error.message);
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
        log.planName?.toLowerCase().includes(lower) ||
        log.paymentMethod.toLowerCase().includes(lower)
      );
    }

    if (selectedCustomer !== 'all') {
      result = result.filter(log => log.customerName === selectedCustomer);
    }
    
    if (selectedPartners.length > 0) {
      result = result.filter(log => selectedPartners.includes(log.partnerName));
    }

    setFilteredLogs(result);
  }, [searchTerm, selectedCustomer, selectedPartners, logs]);

  const uniqueCustomers = Array.from(new Set(logs.map(l => l.customerName))).sort();
  const uniquePartners = Array.from(new Set(logs.map(l => l.partnerName))).sort();
  const totalRevenue = filteredLogs.reduce((acc, log) => acc + (log.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Logs</h1>
          <p className="text-muted-foreground">View and filter payment transactions.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Total Revenue Card - smaller on mobile, prominent on desktop */}
        <Card className="bg-primary text-primary-foreground flex flex-row md:flex-col justify-between md:justify-center items-center p-4 md:p-6 md:w-64 shrink-0 shadow-md">
          <div className="flex items-center gap-3 md:flex-col md:mb-2">
            <IndianRupee className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
            <p className="text-sm md:text-base font-medium opacity-90">Total Revenue</p>
          </div>
          <p className="text-2xl md:text-4xl font-bold">₹{totalRevenue.toLocaleString()}</p>
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
              <Label>Assigned By (Partner)</Label>
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
              placeholder="Search by customer, plan..."
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
            <div className="py-12 text-center text-muted-foreground">No revenue logs found matching your filters.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan / Item</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link href={`/customers/${log.customerId}`} className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                          {log.customerName}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{log.planName || log.type}</TableCell>
                      <TableCell className="whitespace-nowrap">{log.paymentMethod}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {log.actualPartnerId && log.partnerRole === 'junior_partner' ? (
                          <Link href={`/partners/${log.actualPartnerId}`} className="hover:underline text-primary" onClick={(e) => e.stopPropagation()}>
                            {log.partnerName}
                          </Link>
                        ) : log.partnerName}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        ₹{log.amount?.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {(log.type === 'Membership' || log.type === 'Debt Collection') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRevert(log)}
                            title="Void Membership"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!logToRevert} onOpenChange={(open) => !open && setLogToRevert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Void {logToRevert?.type === 'Debt Collection' ? 'Debt Collection' : 'Membership Assignment'}
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Are you sure you want to void the <span className="font-semibold text-foreground">{logToRevert?.planName || logToRevert?.type}</span> transaction for <span className="font-semibold text-foreground">{logToRevert?.customerName}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-3 rounded-md text-sm my-2">
            Are you sure you want to revert the payment of <strong>₹{logToRevert?.amount?.toLocaleString()}</strong> received on {logToRevert ? formatDateTime(logToRevert.createdAt) : ''}? 
            {logToRevert?.type === 'Debt Collection' 
              ? " This will logically refund the payment and immediately add this amount back to their pending debt balance." 
              : " This will logically refund the payment and immediately subtract the shakes from their available balance. If they have already consumed those shakes, their balance will become negative."}
          </div>
          <DialogFooter className="sm:justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLogToRevert(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRevert}>Yes, Void Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
