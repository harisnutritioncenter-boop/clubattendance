'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDocs, query, where, or, collection } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { useAuthStore, useBranchStore } from '@/store';
import { PartnerInventoryEntry, PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarIcon, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ExtendedLedgerEntry extends PartnerInventoryEntry {
  partnerName: string;
  clubName: string;
  partnerCurrentClubName: string;
  createdByName: string;
}

export default function PartnerLedgerPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ExtendedLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerToVoid, setLedgerToVoid] = useState<ExtendedLedgerEntry | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const currentUserRole = useAuthStore(state => state.role);
  const currentUser = useAuthStore(state => state.user);
  const globalActiveBranch = useBranchStore(state => state.activeBranchId);

  const confirmVoidLedger = async () => {
    if (!ledgerToVoid || !ledgerToVoid.id) return;
    try {
      await PartnerInventoryService.voidInventoryEntry(ledgerToVoid.id, currentUser?.uid || 'system');
      toast.success('Ledger entry voided successfully');
      setRefreshKey(prev => prev + 1);
      setLedgerToVoid(null);
    } catch (error: any) {
      toast.error('Failed to void ledger entry: ' + error.message);
    }
  };
  
  // Filters
  const [selectedClubId, setSelectedClubId] = useState<string>('all');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const [clubs, setClubs] = useState<Record<string, string>>({});
  const [partners, setPartners] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Fetch clubs
        const clubsSnap = await getDocs(COLLECTIONS.BRANCHES);
        const clubsMap: Record<string, string> = {};
        clubsSnap.docs.forEach(d => { clubsMap[d.id] = d.data().name; });
        setClubs(clubsMap);

        // Fetch partners
        const usersSnap = await getDocs(COLLECTIONS.USERS);
        const partnersMap: Record<string, any> = {};
        usersSnap.docs.forEach(d => { partnersMap[d.id] = { id: d.id, ...d.data() }; });
        setPartners(partnersMap);

        // Determine accessible partners based on role
        let accessiblePartnerIds = Object.keys(partnersMap);
        if (currentUserRole === 'club_owner') {
          // Club owner sees their own club's partners
          accessiblePartnerIds = accessiblePartnerIds.filter(id => partnersMap[id].clubId === globalActiveBranch || id === currentUser?.uid);
        } else if (currentUserRole === 'junior_partner') {
          // Junior partner only sees themselves
          accessiblePartnerIds = [currentUser?.uid || ''];
        }

        // Fetch ledger
        const ledgerSnap = await getDocs(COLLECTIONS.PARTNER_INVENTORY_LEDGER);
        
        let ledgerData = ledgerSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(l => !l.isArchived)
          .filter(l => l.type === 'ADDITION' || l.type === 'DEBT_COLLECTION')
          .filter(l => {
            if (currentUserRole === 'club_owner') {
              return l.clubId === globalActiveBranch || (!l.clubId && l.createdBy === currentUser?.uid);
            } else if (currentUserRole === 'junior_partner') {
              return l.partnerId === currentUser?.uid;
            }
            return true; // Super Admin sees all
          })
          .map(l => {
            // For older records without a clubId, fallback to the partner's current clubId
            const effectiveClubId = l.clubId || partnersMap[l.partnerId]?.clubId;
            const currentClubId = partnersMap[l.partnerId]?.clubId;
            return {
              ...l,
              partnerName: partnersMap[l.partnerId]?.name || partnersMap[l.partnerId]?.email || 'Unknown',
              clubName: clubsMap[effectiveClubId] || 'Unknown',
              partnerCurrentClubName: clubsMap[currentClubId] || 'Unknown',
              createdByName: partnersMap[l.createdBy]?.name || partnersMap[l.createdBy]?.email || (l.createdBy === currentUser?.uid ? (currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Admin') : 'Admin')
            };
          });

        // Add to partners object if they had a transaction but aren't in current accessible list
        const activePartnerIdsInLedger = new Set(ledgerData.map(l => l.partnerId));
        const effectivePartnersObj = { ...partnersMap };
        // We only care about displaying them in the filter dropdown
        
        // Apply local filters
        if (selectedClubId !== 'all') {
          ledgerData = ledgerData.filter(l => (l.clubId || partnersMap[l.partnerId]?.clubId) === selectedClubId);
        }
        if (selectedPartnerId !== 'all') {
          ledgerData = ledgerData.filter(l => l.partnerId === selectedPartnerId);
        }
        if (startDate) {
          const start = startDate.getTime();
          ledgerData = ledgerData.filter(l => l.createdAt >= start);
        }
        if (endDate) {
          const end = new Date(endDate.getTime());
          end.setHours(23, 59, 59, 999);
          ledgerData = ledgerData.filter(l => l.createdAt <= end.getTime());
        }

        ledgerData.sort((a, b) => b.createdAt - a.createdAt);
        setLogs(ledgerData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUserRole, currentUser?.uid, globalActiveBranch, selectedClubId, selectedPartnerId, startDate, endDate, refreshKey]);

  // Derived filters
  const availableClubs = Object.entries(clubs).map(([id, name]) => ({ id, name }));
  
  const availablePartnersMap = new Map();
  // Add active partners
  Object.values(partners)
    .filter(p => (p.role === 'junior_partner' || p.role === 'club_owner') && (selectedClubId === 'all' || p.clubId === selectedClubId))
    .forEach(p => availablePartnersMap.set(p.id, { id: p.id, name: p.name || p.email }));
  // Add former partners that have logs
  logs.forEach(l => {
    if (!availablePartnersMap.has(l.partnerId) && (selectedClubId === 'all' || l.clubId === selectedClubId)) {
      availablePartnersMap.set(l.partnerId, { id: l.partnerId, name: l.partnerName });
    }
  });
  
  const availablePartners = Array.from(availablePartnersMap.values());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 sm:ml-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col space-y-1">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-primary">Global Partner Ledger</h2>
          <p className="text-muted-foreground text-sm">View all inventory and payment transactions for partners.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {currentUserRole === 'super_admin' && (
              <div className="space-y-2">
                <Label>Club</Label>
                <Select value={selectedClubId} onValueChange={(v) => setSelectedClubId(v || 'all')}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Clubs">
                      {selectedClubId === 'all' ? 'All Clubs' : availableClubs.find(c => c.id === selectedClubId)?.name || selectedClubId}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clubs</SelectItem>
                    {availableClubs.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {(currentUserRole === 'super_admin' || currentUserRole === 'club_owner') && (
              <div className="space-y-2">
                <Label>Partner</Label>
                <Select value={selectedPartnerId} onValueChange={(v) => setSelectedPartnerId(v || 'all')}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Partners">
                      {selectedPartnerId === 'all' ? 'All Partners' : availablePartners.find(p => p.id === selectedPartnerId)?.name || selectedPartnerId}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Partners</SelectItem>
                    {availablePartners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger render={
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                } />
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger render={
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                } />
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 sticky top-0">
                  <TableHead>Date</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Shakes</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Method</TableHead>
                  <TableHead className="text-right">Marked By</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground animate-pulse">Loading ledger...</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No ledger transactions found.</TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/partners/${log.partnerId}`} className="text-blue-600 hover:underline">
                          {log.partnerName}
                        </Link>
                      </TableCell>
                      <TableCell>{log.partnerCurrentClubName}</TableCell>
                      <TableCell>
                        <Badge variant={log.type === 'ADDITION' ? 'default' : 'secondary'}>
                          {log.type.replace('_', ' ')}{log.type === 'DEBT_COLLECTION' && log.clubName !== 'Unknown' ? ` (${log.clubName})` : ''}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold">{log.amount > 0 ? `+${log.amount}` : '-'}</TableCell>
                      <TableCell className="text-right">₹{log.totalCost?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-right font-bold text-green-600">₹{log.amountPaid?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-right">{log.paymentMethod || '-'}</TableCell>
                      <TableCell className="text-right">{log.createdByName}</TableCell>
                      <TableCell className="text-right p-4">
                        {(currentUserRole === 'super_admin' || (currentUserRole === 'club_owner' && (log.clubId === globalActiveBranch || (!log.clubId && log.createdBy === currentUser?.uid)))) && (
                          <Button variant="ghost" size="icon" onClick={() => setLedgerToVoid(log)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!ledgerToVoid} onOpenChange={(open) => !open && setLedgerToVoid(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Void Ledger Entry
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Are you sure you want to void this <span className="font-semibold text-foreground">{ledgerToVoid?.type.replace('_', ' ')}</span> transaction?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-3 rounded-md text-sm my-2">
            This will logically undo the transaction.
            {ledgerToVoid?.type === 'ADDITION' && ' The shakes added will be deducted from their balance, and the financial due will be reverted.'}
            {ledgerToVoid?.type === 'DEBT_COLLECTION' && ' The collected amount will be added back to their pending debt balance.'}
          </div>
          <DialogFooter className="sm:justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setLedgerToVoid(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmVoidLedger}>Yes, Void Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
