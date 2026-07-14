'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { useBranchStore, useAuthStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Users, CreditCard, Coffee, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsPage() {
  const branchId = useBranchStore(state => state.activeBranchId);
  const [loading, setLoading] = useState(false);
  
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const downloadExcel = (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleCustomerMaster = async () => {
    try {
      setLoading(true);
      let customers = await CustomerService.getActiveCustomers(branchId);
      
      const authState = useAuthStore.getState();
      if (authState.role === 'junior_partner') {
        customers = customers.filter(c => c.createdBy === authState.user?.uid);
      }
      
      const data = customers.map(c => ({
        'HC-ID': c.displayId || '-',
        'Name': c.name,
        'Mobile': c.mobile,
        'Joined Date': formatDate(c.createdAt)
      }));

      downloadExcel(data, 'Customer_Master_Report');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const buildMappings = async () => {
    const bId = branchId || 'default-branch';
    const [customersSnap, usersSnap] = await Promise.all([
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

    return { customerMap, userMap };
  };

  const handleSalesAndRevenue = async () => {
    try {
      setLoading(true);
      const start = new Date(startDate).getTime();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const bId = branchId || 'default-branch';
      let [{ payments }, { customerMap, userMap }] = await Promise.all([
        LedgerService.getReportsData(bId, start, end.getTime()),
        buildMappings()
      ]);
      
      const authState = useAuthStore.getState();
      if (authState.role === 'junior_partner') {
        payments = payments.filter(p => p.createdBy === authState.user?.uid);
      }
      
      const data = payments.map(p => ({
        'Date': formatDateTime(p.createdAt),
        'Customer ID': customerMap[p.customerId] || p.customerId,
        'Type': p.type,
        'Plan Name': p.planName || '-',
        'Payment Method': p.paymentMethod,
        'Amount (₹)': p.amount,
        'Shakes Added': p.shakesAdded || 0,
        'Marked By': userMap[p.createdBy] || p.createdBy
      }));

      downloadExcel(data, 'Sales_Revenue_Report');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleConsumptionLog = async () => {
    try {
      setLoading(true);
      const start = new Date(startDate).getTime();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      const bId = branchId || 'default-branch';
      let [{ consumptions }, { customerMap, userMap }] = await Promise.all([
        LedgerService.getReportsData(bId, start, end.getTime()),
        buildMappings()
      ]);
      
      const authState = useAuthStore.getState();
      if (authState.role === 'junior_partner') {
        consumptions = consumptions.filter(c => c.createdBy === authState.user?.uid);
      }
      
      const data = consumptions.map(c => ({
        'Date & Time': formatDateTime(c.createdAt),
        'Customer': customerMap[c.customerId] || c.customerId,
        'Consumed By': c.consumedBy,
        'Shakes Deducted': c.shakesDeducted,
        'Notes': c.notes || '-',
        'Marked By': userMap[c.createdBy] || c.createdBy
      }));

      downloadExcel(data, 'Consumption_Log_Report');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleExpiringMemberships = async () => {
    try {
      setLoading(true);
      // For expiring memberships, we look at customers and their ledger balances
      let customers = await CustomerService.getActiveCustomers(branchId);
      
      const authState = useAuthStore.getState();
      if (authState.role === 'junior_partner') {
        customers = customers.filter(c => c.createdBy === authState.user?.uid);
      }
      
      const data = [];
      for (const c of customers) {
        const balance = await LedgerService.getCustomerBalance(c.id);
        const daysLeft = balance.validUntil ? Math.ceil((balance.validUntil - Date.now()) / (1000 * 60 * 60 * 24)) : null;
        
        // Include if expiring within 7 days, or already expired but has 0 shakes remaining (or just all expired)
        if (balance.isExpired || (daysLeft !== null && daysLeft <= 7)) {
          data.push({
            'HC-ID': c.displayId || '-',
            'Name': c.name,
            'Mobile': c.mobile,
            'Last Plan': balance.latestPlanName || '-',
            'Shakes Remaining': balance.remainingShakes,
            'Expiry Date': balance.validUntil ? formatDate(balance.validUntil) : '-',
            'Status': balance.isExpired ? 'Expired' : `Expiring in ${daysLeft} days`
          });
        }
      }

      downloadExcel(data, 'Expiring_Memberships_Report');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports & Exports</h1>
        <p className="text-muted-foreground">Generate and download business reports in Excel (.xlsx) format.</p>
      </div>

      <Card className="border-2 shadow-sm mb-6">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <CardTitle>Date Range Selection</CardTitle>
          <CardDescription>Select the date range for Sales and Consumption reports.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-6 max-w-md">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Customer Master
            </CardTitle>
            <CardDescription>All registered customers and their profile information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCustomerMaster} disabled={loading} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-500" />
              Sales & Revenue
            </CardTitle>
            <CardDescription>All payments and plan purchases within the selected date range.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSalesAndRevenue} disabled={loading} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-orange-500" />
              Consumption Log
            </CardTitle>
            <CardDescription>Every attendance marked and recorded within the selected date range.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConsumptionLog} disabled={loading} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-red-500" />
              Expiring Memberships
            </CardTitle>
            <CardDescription>Customers whose plans are expiring soon or have already expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExpiringMemberships} disabled={loading} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Excel
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
