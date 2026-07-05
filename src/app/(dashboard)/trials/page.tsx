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
import { Plus, UserCheck, SlidersHorizontal } from 'lucide-react';
import { getDocs, query, where, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  
  // Edit Modal
  const [editModalCustomer, setEditModalCustomer] = useState<Customer | null>(null);

  const fetchTrials = async (isActive = true) => {
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

  useEffect(() => {
    let isActive = true;
    fetchTrials(isActive);
    return () => { isActive = false; };
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
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Add New Trial Customer</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              isTrial={true}
              onSuccess={() => {
                setIsAddTrialOpen(false);
                fetchTrials();
              }}
              onCancel={() => setIsAddTrialOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle>Trial History</CardTitle>
            <CardDescription>View all trial customers and their conversion status.</CardDescription>
          </div>
          
          <div className="grid grid-cols-5 gap-2 w-full xl:w-auto mt-4 xl:mt-0">
            
            <div className="min-w-0">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block truncate">Month</label>
              <Select value={filterMonth} onValueChange={(val) => setFilterMonth(val || 'all')}>
                <SelectTrigger className="h-8 text-xs px-2"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="0">Jan</SelectItem>
                  <SelectItem value="1">Feb</SelectItem>
                  <SelectItem value="2">Mar</SelectItem>
                  <SelectItem value="3">Apr</SelectItem>
                  <SelectItem value="4">May</SelectItem>
                  <SelectItem value="5">Jun</SelectItem>
                  <SelectItem value="6">Jul</SelectItem>
                  <SelectItem value="7">Aug</SelectItem>
                  <SelectItem value="8">Sep</SelectItem>
                  <SelectItem value="9">Oct</SelectItem>
                  <SelectItem value="10">Nov</SelectItem>
                  <SelectItem value="11">Dec</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="min-w-0">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block truncate">Year</label>
              <Select value={filterYear} onValueChange={(val) => setFilterYear(val || 'all')}>
                <SelectTrigger className="h-8 text-xs px-2"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Array.from(new Set(trials.map(t => new Date(t.createdAt).getFullYear()))).sort((a, b) => b - a).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block truncate">Status</label>
              <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'all')}>
                <SelectTrigger className="h-8 text-xs px-2"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role !== 'junior_partner' && (
              <div className="min-w-0">
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block truncate">Partner</label>
                <Select value={filterJp} onValueChange={(val) => setFilterJp(val || 'all')}>
                  <SelectTrigger className="h-8 text-xs px-2">
                    <SelectValue placeholder="Partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.entries(partners).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name.split(' ')[0]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {role === 'super_admin' && !branchId && (
              <div className="min-w-0">
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block truncate">Club</label>
                <Select value={filterClub} onValueChange={(val) => setFilterClub(val || 'all')}>
                  <SelectTrigger className="h-8 text-xs px-2"><SelectValue placeholder="Club" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.entries(clubs).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name.split(' ')[0]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Joined On</TableHead>
                    <TableHead className="text-right">Action / Status</TableHead>
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
                    <TableRow 
                      key={c.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setEditModalCustomer(c)}
                    >
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
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {c.isTrial ? (
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => {
                              setAssignModalCustomer({ id: c.id, name: c.name });
                            }}
                          >
                            Assign Membership
                          </Button>
                        ) : c.trialConvertedAt ? (
                          <div className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full inline-block">
                            Converted on {new Date(c.trialConvertedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <div className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full inline-block">
                            Converted
                          </div>
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

      {assignModalCustomer && (
        <AssignMembershipModal
          open={!!assignModalCustomer}
          onOpenChange={(open) => !open && setAssignModalCustomer(null)}
          customerId={assignModalCustomer.id}
          customerName={assignModalCustomer.name}
          onSuccess={() => {
            // Re-fetch trials to update status to converted
            fetchTrials();
            setAssignModalCustomer(null);
          }}
        />
      )}

      {editModalCustomer && (
        <Dialog open={!!editModalCustomer} onOpenChange={(open) => !open && setEditModalCustomer(null)}>
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Trial Customer: {editModalCustomer.name}</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              customer={editModalCustomer}
              onSuccess={() => {
                setEditModalCustomer(null);
                fetchTrials();
              }}
              onCancel={() => setEditModalCustomer(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
