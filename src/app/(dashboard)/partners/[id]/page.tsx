'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { useAuthStore } from '@/store';
import { Partner } from '@/features/partners/types/partner.types';
import { PartnerInventoryService, PartnerInventoryEntry } from '@/features/partners/services/partner-inventory.service';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '@/features/ledger/types/ledger.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, User, Package, CreditCard, Building2, CalendarDays, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { calculateAge } from '@/lib/utils';
import { PartnerForm } from '@/features/partners/components/partner-form';

export default function PartnerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const partnerId = params.id as string;
  const { role: currentUserRole, user: currentUser } = useAuthStore();

  const [partner, setPartner] = useState<Partner | null>(null);
  const [clubName, setClubName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Metrics
  const [inventoryLog, setInventoryLog] = useState<PartnerInventoryEntry[]>([]);
  const [shakesServed, setShakesServed] = useState<ShakeLedgerEntry[]>([]);
  const [paymentsCollected, setPaymentsCollected] = useState<PaymentLedgerEntry[]>([]);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // 1. Fetch Partner
        const pSnap = await getDoc(doc(COLLECTIONS.USERS, partnerId));
        if (!pSnap.exists()) {
          toast.error("Partner not found");
          return;
        }
        const partnerData = { id: pSnap.id, ...pSnap.data() } as Partner;
        setPartner(partnerData);

        // 2. Fetch Club Name
        if (partnerData.clubId) {
          const cSnap = await getDoc(doc(COLLECTIONS.BRANCHES, partnerData.clubId));
          if (cSnap.exists()) {
            setClubName(cSnap.data().name);
          }
        }

        // 3. Fetch Inventory Logs
        const invQ = query(COLLECTIONS.PARTNER_INVENTORY_LEDGER, where('partnerId', '==', partnerId));
        const invSnap = await getDocs(invQ);
        const invData = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInventoryEntry))
          .filter(i => !i.isArchived)
          .sort((a, b) => b.createdAt - a.createdAt);
        setInventoryLog(invData);

        // 4. Fetch Shakes Served (Consumption Ledger where createdBy = partnerId)
        const shakesQ = query(COLLECTIONS.SHAKE_LEDGER, where('createdBy', '==', partnerId), where('isArchived', '==', false));
        const shakesSnap = await getDocs(shakesQ);
        const shakesData = shakesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShakeLedgerEntry))
          .sort((a, b) => b.createdAt - a.createdAt);
        setShakesServed(shakesData);

        // 5. Fetch Payments Collected (Payment Ledger where createdBy = partnerId)
        const payQ = query(COLLECTIONS.PAYMENT_LEDGER, where('createdBy', '==', partnerId), where('isArchived', '==', false));
        const paySnap = await getDocs(payQ);
        const payData = paySnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentLedgerEntry))
          .sort((a, b) => b.createdAt - a.createdAt);
        setPaymentsCollected(payData);

      } catch (err) {
        console.error(err);
        toast.error("Failed to load partner profile");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [partnerId]);

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading Profile...</div>;
  }

  if (!partner) {
    return <div className="p-8 text-center">Partner not found.</div>;
  }

  const age = calculateAge(partner.birthDate);
  const totalShakesAdded = inventoryLog.filter(l => l.type === 'ADDITION').reduce((acc, curr) => acc + curr.amount, 0);
  
  const availableYears = Array.from(new Set(shakesServed.map(s => new Date(s.createdAt).getFullYear()))).sort((a, b) => b - a);
  if (!availableYears.includes(new Date().getFullYear())) {
    availableYears.unshift(new Date().getFullYear());
    availableYears.sort((a, b) => b - a);
  }

  const shakesServedYearly = shakesServed.reduce((acc, curr) => {
    if (selectedYear === 'all') return acc + (curr.shakesDeducted || 1);
    const date = new Date(curr.createdAt);
    if (date.getFullYear().toString() === selectedYear) {
      return acc + (curr.shakesDeducted || 1);
    }
    return acc;
  }, 0);

  const shakesServedMonthly = shakesServed.reduce((acc, curr) => {
    const date = new Date(curr.createdAt);
    const targetYear = selectedYear === 'all' ? new Date().getFullYear() : parseInt(selectedYear);
    if (date.getFullYear() === targetYear && date.getMonth().toString() === selectedMonth) {
      return acc + (curr.shakesDeducted || 1);
    }
    return acc;
  }, 0);

  const totalRevenueCollected = paymentsCollected.reduce((acc, curr) => acc + curr.amount, 0);

  // Authorization to edit
  const canEdit = currentUserRole === 'super_admin' || currentUserRole === 'club_owner' || currentUser?.uid === partnerId;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{partner.name || partner.email}</h1>
            <p className="text-muted-foreground capitalize">
              {partner.role.replace('_', ' ')} {clubName && `• ${clubName}`}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditModalOpen(true)}>Edit Profile</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Shakes Assigned (Inventory)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalShakesAdded}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription>Shakes Served {selectedYear === 'all' ? '(All Time)' : '(Yearly)'}</CardDescription>
            <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v || 'all')}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{shakesServedYearly}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription>Shakes Served (Monthly)</CardDescription>
            <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v || '0')}>
              <SelectTrigger className="w-[90px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                  <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{shakesServedMonthly}</div>
            <p className="text-xs text-muted-foreground mt-1">In {selectedYear === 'all' ? new Date().getFullYear() : selectedYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue Collected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{totalRevenueCollected.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl mb-8">
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" /> Profile Details</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2"><Package className="h-4 w-4" /> Inventory Activity</TabsTrigger>
          <TabsTrigger value="payments" className="gap-2"><CreditCard className="h-4 w-4" /> Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-muted-foreground flex items-center gap-2"><Phone className="h-4 w-4" /> Mobile</div>
                  <div className="font-medium">{partner.mobile || '-'}</div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><Mail className="h-4 w-4" /> Email</div>
                  <div className="font-medium">{partner.email || '-'}</div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Age / Birth Date</div>
                  <div className="font-medium">
                    {age !== null ? `${age} yrs` : '-'} 
                    {partner.birthDate && <span className="text-muted-foreground font-normal ml-1">({new Date(partner.birthDate).toLocaleDateString()})</span>}
                  </div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><MapPin className="h-4 w-4" /> Locality</div>
                  <div className="font-medium">{partner.locality || '-'}</div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><MapPin className="h-4 w-4" /> Full Address</div>
                  <div className="font-medium">{partner.address || '-'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-muted-foreground">Role</div>
                  <div className="font-medium capitalize">{partner.role.replace('_', ' ')}</div>

                  <div className="text-muted-foreground">Club / Branch</div>
                  <div className="font-medium">{clubName || '-'}</div>

                  <div className="text-muted-foreground">Joined At</div>
                  <div className="font-medium">{partner.createdAt ? new Date(partner.createdAt).toLocaleString() : '-'}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Additions & Deductions</CardTitle>
              <CardDescription>Chronological log of shakes assigned to or consumed from this partner.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground sticky top-0">
                      <th className="p-4">Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-right">Amount</th>
                      <th className="p-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLog.map(entry => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-4 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                        <td className="p-4">
                          <Badge variant={entry.type === 'ADDITION' ? 'default' : 'secondary'}>
                            {entry.type}
                          </Badge>
                        </td>
                        <td className={`p-4 text-right font-bold ${entry.type === 'ADDITION' ? 'text-green-600' : 'text-red-600'}`}>
                          {entry.type === 'ADDITION' ? '+' : '-'}{entry.amount}
                        </td>
                        <td className="p-4 text-muted-foreground max-w-xs truncate" title={entry.notes}>{entry.notes || '-'}</td>
                      </tr>
                    ))}
                    {inventoryLog.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">No inventory logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Payments Collected</CardTitle>
              <CardDescription>Financial transactions where this partner was the creator.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground sticky top-0">
                      <th className="p-4">Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-right">Amount</th>
                      <th className="p-4">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsCollected.map(entry => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-4 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                        <td className="p-4">
                          <Badge variant="outline">{entry.type}</Badge>
                          {entry.planName && <div className="text-xs text-muted-foreground mt-1">{entry.planName}</div>}
                        </td>
                        <td className="p-4 text-right font-bold text-green-600">
                          ₹{entry.amount.toLocaleString()}
                        </td>
                        <td className="p-4">{entry.paymentMethod || '-'}</td>
                      </tr>
                    ))}
                    {paymentsCollected.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">No collections found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Profile: {partner.name}</DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            <PartnerForm 
              partner={partner} 
              onSuccess={() => {
                setEditModalOpen(false);
                window.location.reload();
              }}
              onCancel={() => setEditModalOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
