'use client';

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { useBranchStore, useAuthStore } from '@/store';
import { Customer } from '@/features/customers/types/customer.types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CustomerForm } from '@/features/customers/components/customer-form';
import { AssignMembershipModal } from '@/features/memberships/components/assign-membership-modal';
import { Plus, UserCheck } from 'lucide-react';
import { getDocs, query, where, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';

export default function TrialsPage() {
  const branchId = useBranchStore(state => state.activeBranchId);
  const [trials, setTrials] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const role = useAuthStore(state => state.role);
  
  // Filters
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterJp, setFilterJp] = useState<string>('all');
  const [filterClub, setFilterClub] = useState<string>('all');
  
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [clubs, setClubs] = useState<Record<string, string>>({});
  
  // Modals
  const [isAddTrialOpen, setIsAddTrialOpen] = useState(false);
  const [assignModalCustomer, setAssignModalCustomer] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let isActive = true;
    const fetchTrials = async () => {
      try {
        setLoading(true);
        const bId = branchId || 'default-branch';
        let customers: Customer[] = [];
        
        if (role === 'super_admin' && !branchId) {
          const q = query(COLLECTIONS.CUSTOMERS, where('isArchived', '==', false), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        } else {
          customers = await CustomerService.getActiveCustomers(bId);
        }
        
        if (!isActive) return;
        
        // Fetch Maps for Filters
        const usersSnap = await getDocs(COLLECTIONS.USERS);
        const partnerMap: Record<string, string> = {};
        usersSnap.docs.forEach(doc => {
          partnerMap[doc.id] = doc.data().name || doc.data().email || 'Unknown';
        });
        setPartners(partnerMap);

        if (role === 'super_admin') {
          const branchesSnap = await getDocs(COLLECTIONS.BRANCHES);
          const clubMap: Record<string, string> = {};
          branchesSnap.docs.forEach(doc => {
            clubMap[doc.id] = doc.data().name;
          });
          setClubs(clubMap);
        }
        
        setTrials(customers.filter(c => c.isTrial === true || c.wasTrial === true));
      } catch (err) {
        console.error(err);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchTrials();
    
    return () => {
      isActive = false;
    };
  }, [branchId, role]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trials Management</h1>
          <p className="text-muted-foreground">Manage and convert your trial customers.</p>
        </div>
        <Dialog open={isAddTrialOpen} onOpenChange={setIsAddTrialOpen}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="h-4 w-4" /> Add Trial
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Trial Customer</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              isTrial={true}
              onSuccess={() => {
                setIsAddTrialOpen(false);
                window.location.reload();
              }}
              onCancel={() => setIsAddTrialOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-start justify-between space-y-4 md:space-y-0">
          <div>
            <CardTitle>Trial History</CardTitle>
            <CardDescription>View all trial customers and their conversion status.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select 
              className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">All Months</option>
              <option value="0">January</option>
              <option value="1">February</option>
              <option value="2">March</option>
              <option value="3">April</option>
              <option value="4">May</option>
              <option value="5">June</option>
              <option value="6">July</option>
              <option value="7">August</option>
              <option value="8">September</option>
              <option value="9">October</option>
              <option value="10">November</option>
              <option value="11">December</option>
            </select>
            <select 
              className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <select 
              className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="converted">Converted</option>
            </select>
            {role !== 'junior_partner' && (
              <select 
                className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={filterJp}
                onChange={(e) => setFilterJp(e.target.value)}
              >
                <option value="all">All Partners</option>
                {Object.entries(partners).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
            {role === 'super_admin' && !branchId && (
              <select 
                className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={filterClub}
                onChange={(e) => setFilterClub(e.target.value)}
              >
                <option value="all">All Clubs</option>
                {Object.entries(clubs).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading trials...</div>
          ) : trials.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-4">No active trials found.</p>
              <Button variant="outline" onClick={() => setIsAddTrialOpen(true)}>Add a Trial Customer</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Joined On</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials
                  .filter(c => {
                    if (filterStatus === 'pending' && !c.isTrial) return false;
                    if (filterStatus === 'converted' && c.isTrial) return false;
                    
                    if (filterJp !== 'all' && c.juniorPartnerId !== filterJp && c.createdBy !== filterJp) return false;
                    if (filterClub !== 'all' && c.branchId !== filterClub) return false;
                    
                    const d = new Date(c.createdAt);
                    if (filterYear !== 'all' && d.getFullYear().toString() !== filterYear) return false;
                    if (filterMonth !== 'all' && d.getMonth().toString() !== filterMonth) return false;
                    
                    return true;
                  })
                  .map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.displayId} | {c.mobile}</div>
                    </TableCell>
                    <TableCell>
                      {c.purpose.length > 0 ? c.purpose.join(', ') : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.isTrial && (
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            setAssignModalCustomer({ id: c.id, name: c.name });
                          }}
                        >
                          Assign Membership
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {assignModalCustomer && (
        <AssignMembershipModal
          open={!!assignModalCustomer}
          onOpenChange={(open) => !open && setAssignModalCustomer(null)}
          customerId={assignModalCustomer.id}
          customerName={assignModalCustomer.name}
          onSuccess={() => {
            // Re-fetch trials to update status to converted
            const bId = branchId || 'default-branch';
            CustomerService.getActiveCustomers(bId).then(customers => {
              let updated = customers;
              if (role === 'junior_partner') {
                const uid = useAuthStore.getState().user?.uid;
                updated = updated.filter(cust => cust.createdBy === uid);
              }
              setTrials(updated.filter(cust => cust.isTrial === true || cust.wasTrial === true));
            });
            setAssignModalCustomer(null);
          }}
        />
      )}
    </div>
  );
}
