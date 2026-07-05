'use client';

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { useBranchStore, useAuthStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';

export default function RenewalsPage() {
  const branchId = useBranchStore(state => state.activeBranchId);
  const [loading, setLoading] = useState(true);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    const fetchRenewals = async () => {
      try {
        setLoading(true);
        const bId = branchId || 'default-branch';
        let customers = await CustomerService.getActiveCustomers(bId);
        
        const authState = useAuthStore.getState();
        if (authState.role === 'junior_partner') {
          customers = customers.filter(c => c.createdBy === authState.user?.uid);
        }
        
        const data = [];
        for (const c of customers) {
          const balance = await LedgerService.getCustomerBalance(c.id);
          const daysLeft = balance.validUntil ? Math.ceil((balance.validUntil - Date.now()) / (1000 * 60 * 60 * 24)) : null;
          
          if (balance.isExpired || (daysLeft !== null && daysLeft <= 7)) {
            data.push({
              id: c.id,
              displayId: c.displayId || '-',
              name: c.name,
              mobile: c.mobile,
              planName: balance.latestPlanName || '-',
              remainingShakes: balance.remainingShakes,
              validUntil: balance.validUntil,
              isExpired: balance.isExpired,
              daysLeft
            });
          }
        }
        
        setExpiring(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRenewals();
  }, [branchId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Renewals & Expirations</h1>
        <p className="text-muted-foreground">Customers who need to renew their memberships.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Action Required</CardTitle>
          <CardDescription>Members expiring within 7 days or already expired.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading data...</div>
          ) : expiring.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No expiring memberships found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Current Plan</TableHead>
                  <TableHead className="text-right">Remaining Shakes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.displayId} | {c.mobile}</div>
                    </TableCell>
                    <TableCell>{c.planName}</TableCell>
                    <TableCell className="text-right font-medium">{c.remainingShakes}</TableCell>
                    <TableCell>
                      {c.isExpired ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          Expiring in {c.daysLeft} days
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedCustomer({ id: c.id, name: c.name });
                          setAssignModalOpen(true);
                        }}
                      >
                        Renew Now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedCustomer && (
        <AssignMembershipModal
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
