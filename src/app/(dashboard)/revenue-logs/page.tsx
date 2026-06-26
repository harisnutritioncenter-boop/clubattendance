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
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { Search, IndianRupee } from 'lucide-react';

export default function RevenueLogsPage() {
  const branchId = useBranchStore(state => state.activeBranchId);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const bId = branchId || 'default-branch';
      const start = new Date(startDate).getTime();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const [{ payments }, customersSnap, usersSnap] = await Promise.all([
        LedgerService.getReportsData(bId, start, end.getTime()),
        CustomerService.getActiveCustomers(bId),
        getDocs(COLLECTIONS.USERS)
      ]);

      const customerMap: Record<string, string> = {};
      customersSnap.forEach(c => {
        customerMap[c.id] = c.displayId ? `${c.displayId} (${c.name})` : c.name;
      });

      const userMap: Record<string, string> = {};
      usersSnap.docs.forEach(d => {
        userMap[d.id] = d.data().name || d.data().email || d.id;
      });

      let formattedLogs = payments.map(p => ({
        ...p,
        customerName: customerMap[p.customerId] || 'Unknown Customer',
        partnerName: userMap[p.createdBy] || 'Unknown Partner'
      }));

      const role = useAuthStore.getState().role;
      const user = useAuthStore.getState().user;
      if (role === 'junior_partner' && user) {
        formattedLogs = formattedLogs.filter(p => p.createdBy === user.uid);
      }

      setLogs(formattedLogs);
      setFilteredLogs(formattedLogs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredLogs(logs);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredLogs(logs.filter(log => 
        log.customerName.toLowerCase().includes(lower) ||
        log.planName?.toLowerCase().includes(lower) ||
        log.paymentMethod.toLowerCase().includes(lower)
      ));
    }
  }, [searchTerm, logs]);

  const totalRevenue = filteredLogs.reduce((acc, log) => acc + (log.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Logs</h1>
          <p className="text-muted-foreground">View and filter payment transactions.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card className="md:col-span-3">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-medium">Filter by Date</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-primary text-primary-foreground flex flex-col justify-center items-center p-6">
          <IndianRupee className="w-8 h-8 mb-2 opacity-80" />
          <p className="text-sm font-medium opacity-90">Total Revenue</p>
          <p className="text-3xl font-bold">₹{totalRevenue.toLocaleString()}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Showing {filteredLogs.length} records</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search logs..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No revenue logs found for this period.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan / Item</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{log.customerName}</TableCell>
                      <TableCell>{log.planName || log.type}</TableCell>
                      <TableCell>{log.paymentMethod}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{log.partnerName}</TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        ₹{log.amount?.toLocaleString()}
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
