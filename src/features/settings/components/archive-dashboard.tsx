'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { CustomerService } from '@/features/customers/services/customer.service';
import { PartnerService } from '@/features/partners/services/partner.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

export function ArchiveDashboard() {
  const [activeTab, setActiveTab] = useState('customers');
  const [archivedData, setArchivedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useAuthStore(state => state.user);

  const fetchArchivedData = async () => {
    setLoading(true);
    try {
      let q;
      if (activeTab === 'customers') {
        q = query(COLLECTIONS.CUSTOMERS, where('isArchived', '==', true));
      } else if (activeTab === 'partners') {
        q = query(COLLECTIONS.USERS, where('isArchived', '==', true));
      } else if (activeTab === 'consumptions') {
        q = query(COLLECTIONS.SHAKE_LEDGER, where('isArchived', '==', true));
      } else if (activeTab === 'payments') {
        q = query(COLLECTIONS.PAYMENT_LEDGER, where('isArchived', '==', true));
      }

      if (q) {
        const snap = await getDocs(q);
        setArchivedData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch archived data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchivedData();
  }, [activeTab]);

  const handleRevert = async (id: string) => {
    if (!user) return;
    try {
      if (activeTab === 'customers') {
        await CustomerService.revertCustomer(id);
        await ActivityLogsService.logActivity('REVERT', 'Customer', id, `Reverted customer ${id}`, user.uid);
      } else if (activeTab === 'partners') {
        await PartnerService.revertPartner(id);
        await ActivityLogsService.logActivity('REVERT', 'Partner', id, `Reverted partner ${id}`, user.uid);
      } else if (activeTab === 'consumptions') {
        await LedgerService.revertConsumption(id, user.uid);
        await ActivityLogsService.logActivity('REVERT', 'Consumption', id, `Reverted consumption ${id}`, user.uid);
      } else if (activeTab === 'payments') {
        await LedgerService.revertPayment(id, user.uid);
        await ActivityLogsService.logActivity('REVERT', 'Payment', id, `Reverted payment ${id}`, user.uid);
      }
      toast.success('Successfully reverted');
      fetchArchivedData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to revert');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive & Recovery</CardTitle>
        <CardDescription>View and revert soft-deleted records to restore ledger balances.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
            <TabsTrigger value="consumptions">Consumptions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>
          
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date Deleted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground animate-pulse">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : archivedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No archived records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  archivedData.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        {activeTab === 'customers' && (item.name || item.mobile)}
                        {activeTab === 'partners' && (item.name || item.email)}
                        {activeTab === 'consumptions' && `${item.consumedBy} - ${item.shakesDeducted} shakes`}
                        {activeTab === 'payments' && `₹${item.amount} for ${item.planName || 'Custom'}`}
                      </TableCell>
                      <TableCell>{new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => handleRevert(item.id)}>
                          Revert
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
