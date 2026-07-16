'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { useAuthStore } from '@/store';
import { Partner } from '@/features/partners/types/partner.types';
import { PartnerInventoryService, PartnerInventoryEntry } from '@/features/partners/services/partner-inventory.service';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '@/features/ledger/types/ledger.types';
import { LedgerService } from '@/features/ledger/services/ledger.service';

export interface ExtendedPaymentLedgerEntry extends PaymentLedgerEntry {
  customerName?: string;
  markedByName?: string;
}

export interface ExtendedPartnerInventoryEntry extends PartnerInventoryEntry {
  customerName?: string;
  createdByName?: string;
}

import { Button } from '@/components/ui/button';
import { ContactActions } from '@/components/ui/contact-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, User, Package, CreditCard, Building2, CalendarDays, Phone, Mail, MapPin, Trash2, ChevronLeft, ChevronRight, PackagePlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { calculateAge, formatDate, formatDateTime } from '@/lib/utils';
import { PartnerForm } from '@/features/partners/components/partner-form';
import { ManageShakesModal } from '@/features/partners/components/add-shakes-modal';
import { CustomerList } from '@/features/customers/components/customer-list';

// Helper to get days in month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get day of week of first day (0-6, 0 is Sunday)
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function PartnerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const partnerId = params.id as string;
  const { role: currentUserRole, user: currentUser } = useAuthStore();

  const [partner, setPartner] = useState<Partner | null>(null);
  const [clubName, setClubName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Metrics
  const [inventoryLog, setInventoryLog] = useState<ExtendedPartnerInventoryEntry[]>([]);
  const [shakesServed, setShakesServed] = useState<ShakeLedgerEntry[]>([]);
  const [paymentsCollected, setPaymentsCollected] = useState<ExtendedPaymentLedgerEntry[]>([]);
  const [logToRevert, setLogToRevert] = useState<ExtendedPaymentLedgerEntry | null>(null);
  
  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateLogs, setSelectedDateLogs] = useState<ExtendedPartnerInventoryEntry[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  
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
        const rawInvData = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInventoryEntry))
          .filter(i => !i.isArchived)
          .sort((a, b) => b.createdAt - a.createdAt);

        // 4. Fetch Shakes Served
        // Include shakes recorded by this partner, AND shakes from this partner's customers
        const shakesQ = query(COLLECTIONS.SHAKE_LEDGER, where('createdBy', '==', partnerId), where('isArchived', '==', false));
        const shakesSnap = await getDocs(shakesQ);
        const createdByMeShakes = shakesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShakeLedgerEntry));

        // Get customers assigned to this partner
        const custQ = query(COLLECTIONS.CUSTOMERS, where('juniorPartnerId', '==', partnerId));
        const custSnap = await getDocs(custQ);
        const customerIds = custSnap.docs.map(d => d.id);
        
        let customerShakesData: ShakeLedgerEntry[] = [];
        if (customerIds.length > 0) {
          const chunkSize = 30;
          for (let i = 0; i < customerIds.length; i += chunkSize) {
            const chunk = customerIds.slice(i, i + chunkSize);
            // Remove where('isArchived', '==', false) to avoid needing a composite index
            const csQ = query(COLLECTIONS.SHAKE_LEDGER, where('customerId', 'in', chunk));
            const csSnap = await getDocs(csQ);
            customerShakesData = customerShakesData.concat(
              csSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as ShakeLedgerEntry))
                .filter(d => !d.isArchived)
            );
          }
        }

        const allShakesMap = new Map<string, ShakeLedgerEntry>();
        [...createdByMeShakes, ...customerShakesData].forEach(s => allShakesMap.set(s.id, s));
        
        const shakesData = Array.from(allShakesMap.values()).sort((a, b) => b.createdAt - a.createdAt);
        setShakesServed(shakesData);

        // 5. Fetch Payments Collected
        // Include payments created by this partner, AND payments from this partner's customers
        const payQ = query(COLLECTIONS.PAYMENT_LEDGER, where('createdBy', '==', partnerId), where('isArchived', '==', false));
        const paySnap = await getDocs(payQ);
        const createdByMeData = paySnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentLedgerEntry));

        // (Customers already fetched above, we can reuse `customerIds`)
        let customerPayData: PaymentLedgerEntry[] = [];
        if (customerIds.length > 0) {
          const chunkSize = 30;
          for (let i = 0; i < customerIds.length; i += chunkSize) {
            const chunk = customerIds.slice(i, i + chunkSize);
            // Remove where('isArchived', '==', false) to avoid needing a composite index
            const cpQ = query(COLLECTIONS.PAYMENT_LEDGER, where('customerId', 'in', chunk));
            const cpSnap = await getDocs(cpQ);
            customerPayData = customerPayData.concat(
              cpSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as PaymentLedgerEntry))
                .filter(d => !d.isArchived)
            );
          }
        }
        
        const allPayMap = new Map<string, PaymentLedgerEntry>();
        [...createdByMeData, ...customerPayData].forEach(p => allPayMap.set(p.id, p));

        const allUsersSnap = await getDocs(COLLECTIONS.USERS);
        const userMap: Record<string, string> = {};
        allUsersSnap.docs.forEach(d => {
          userMap[d.id] = d.data().name || d.data().email || d.id;
        });

        const allCustSnap = await getDocs(COLLECTIONS.CUSTOMERS);
        const custMap: Record<string, string> = {};
        allCustSnap.docs.forEach(d => {
          const c = d.data();
          custMap[d.id] = c.displayId ? `${c.displayId} (${c.name})` : c.name;
        });
        
        const payData = Array.from(allPayMap.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(p => ({
            ...p,
            customerName: custMap[p.customerId] || 'Unknown Customer',
            markedByName: userMap[p.createdBy] || 'Admin'
          }));
        setPaymentsCollected(payData);

        const mappedInvData = rawInvData.map(i => ({
          ...i,
          customerName: i.customerId ? (custMap[i.customerId] || 'Unknown Customer') : undefined,
          createdByName: i.createdBy ? (userMap[i.createdBy] || 'System') : 'System'
        }));
        setInventoryLog(mappedInvData);

      } catch (err) {
        console.error(err);
        toast.error("Failed to load partner profile");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [partnerId, refreshKey]);

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading Profile...</div>;
  }

  if (!partner) {
    return <div className="p-8 text-center">Partner not found.</div>;
  }

  const age = calculateAge(partner.birthDate);
  const inventoryBalance = inventoryLog.reduce((acc, curr) => curr.type === 'ADDITION' ? acc + curr.amount : acc - curr.amount, 0);
  
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
    const isYearMatch = selectedYear === 'all' ? true : date.getFullYear() === parseInt(selectedYear);
    if (isYearMatch && date.getMonth().toString() === selectedMonth) {
      return acc + (curr.shakesDeducted || 1);
    }
    return acc;
  }, 0);

  const totalRevenueCollected = paymentsCollected.reduce((acc, curr) => acc + curr.amount, 0);

  // Authorization to edit
  const canEdit = currentUserRole === 'super_admin' || currentUserRole === 'club_owner' || currentUser?.uid === partnerId;
  const canManageShakes = currentUserRole === 'super_admin' || currentUserRole === 'club_owner';

  // Calendar Logic
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-11
  
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

  const getDayData = (day: number) => {
    const startOfDay = new Date(currentYear, currentMonth, day, 0, 0, 0).getTime();
    const endOfDay = new Date(currentYear, currentMonth, day, 23, 59, 59, 999).getTime();

    const todaysLogs = inventoryLog.filter(entry => entry.createdAt >= startOfDay && entry.createdAt <= endOfDay);
    
    const additions = todaysLogs.filter(t => t.type === 'ADDITION').reduce((acc, curr) => acc + curr.amount, 0);
    const deductions = todaysLogs.filter(t => t.type === 'DEDUCTION').reduce((acc, curr) => acc + curr.amount, 0);

    const pastAndPresentLogs = inventoryLog.filter(entry => entry.createdAt <= endOfDay);
    const runningBalance = pastAndPresentLogs.reduce((acc, curr) => curr.type === 'ADDITION' ? acc + curr.amount : acc - curr.amount, 0);

    // Also check if any activity happened before today
    const pastLogs = inventoryLog.filter(entry => entry.createdAt < startOfDay);
    const pastBalance = pastLogs.reduce((acc, curr) => curr.type === 'ADDITION' ? acc + curr.amount : acc - curr.amount, 0);

    return { todaysLogs, additions, deductions, runningBalance, pastBalance };
  };

  const handleDayClick = (logs: ExtendedPartnerInventoryEntry[], day: number) => {
    if (logs.length > 0) {
      setSelectedDateLogs(logs);
      setIsLogModalOpen(true);
    }
  };

  const handleRevert = (log: ExtendedPaymentLedgerEntry) => {
    setLogToRevert(log);
  };

  const confirmRevert = async () => {
    if (!logToRevert) return;
    try {
      await LedgerService.voidPayment(logToRevert.id, currentUser?.uid || 'system');
      toast.success('Transaction voided successfully');
      const newLogs = paymentsCollected.filter(l => l.id !== logToRevert.id);
      setPaymentsCollected(newLogs);
      setLogToRevert(null);
    } catch (error: any) {
      toast.error('Failed to void transaction: ' + error.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 sm:ml-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight line-clamp-1">{partner.name || partner.email}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground capitalize">
              {partner.role.replace('_', ' ')} {clubName && `• ${clubName}`}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {canManageShakes && (
              <Button variant="outline" size="sm" className="gap-2 text-xs sm:text-sm h-8 sm:h-10 px-2 sm:px-4" onClick={() => setIsAssignOpen(true)}>
                <PackagePlus className="h-3 w-3 sm:h-4 sm:w-4" /> Manage Shakes
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8 sm:h-10 px-2 sm:px-4" onClick={() => setEditModalOpen(true)}>Edit Profile</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card className="bg-primary/5 flex flex-col justify-between">
          <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">Shakes Remaining (Inventory)</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-4">
            <div className="text-2xl sm:text-3xl font-bold">{inventoryBalance}</div>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-2 flex flex-row items-center justify-between space-y-0 gap-1">
            <CardDescription className="text-xs sm:text-sm">Attendances {selectedYear === 'all' ? '(All Time)' : '(Yearly)'}</CardDescription>
            <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v || 'all')}>
              <SelectTrigger className="w-[80px] sm:w-[100px] h-7 sm:h-8 text-xs px-2 sm:px-3">
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
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-4">
            <div className="text-2xl sm:text-3xl font-bold">{shakesServedYearly}</div>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-2 flex flex-row items-center justify-between space-y-0 gap-1">
            <CardDescription className="text-xs sm:text-sm">Attendances (Monthly)</CardDescription>
            <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v || '0')}>
              <SelectTrigger className="w-[70px] sm:w-[90px] h-7 sm:h-8 text-xs px-2 sm:px-3">
                <SelectValue>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(selectedMonth)]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                  <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-4 flex flex-col justify-end">
            <div className="text-2xl sm:text-3xl font-bold">{shakesServedMonthly}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">In {selectedYear === 'all' ? 'All Time' : selectedYear}</p>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-2">
            <CardDescription className="text-xs sm:text-sm">Total Revenue</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-4">
            <div className="text-2xl sm:text-3xl font-bold">₹{totalRevenueCollected.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <div className="w-full overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent mb-4 sm:mb-8">
          <TabsList className="inline-flex w-max min-w-full h-11 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="profile" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><User className="h-4 w-4" /> Profile Details</TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><Package className="h-4 w-4" /> Inventory Activity</TabsTrigger>
            <TabsTrigger value="payments" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><CreditCard className="h-4 w-4" /> Collections</TabsTrigger>
            <TabsTrigger value="customers" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><Users className="h-4 w-4" /> Customers</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-muted-foreground flex items-center gap-2"><Phone className="h-4 w-4" /> Mobile</div>
                  <div className="font-medium flex items-center gap-2">
                    <span>{partner.mobile || '-'}</span>
                    {partner.mobile && <ContactActions mobile={partner.mobile} />}
                  </div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><Mail className="h-4 w-4" /> Email</div>
                  <div className="font-medium">{partner.email || '-'}</div>
                  
                  <div className="text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Age / Birth Date</div>
                  <div className="font-medium">
                    {age !== null ? `${age} yrs` : '-'} 
                    {partner.birthDate && <span className="text-muted-foreground font-normal ml-1">({formatDate(partner.birthDate)})</span>}
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
                  <div className="font-medium">{partner.createdAt ? formatDateTime(partner.createdAt) : '-'}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="mt-0">
          <Card className="border-0 shadow-lg bg-card/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 sm:pb-8 gap-4">
              <div>
                <CardTitle className="text-2xl">Inventory Activity</CardTitle>
                <CardDescription>Chronological calendar log of shakes assigned to or consumed from this partner.</CardDescription>
              </div>
              <div className="flex items-center gap-4 bg-background p-1 rounded-lg border">
                <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
                <div className="font-bold w-32 text-center text-lg">{monthNames[currentMonth]} {currentYear}</div>
                <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="bg-muted/50 p-3 text-center font-semibold text-sm text-muted-foreground">
                    {day}
                  </div>
                ))}
                
                {/* Empty cells for start of month */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-card min-h-[80px] sm:min-h-[120px] p-1 sm:p-2 opacity-50" />
                ))}
                
                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const { todaysLogs, additions, deductions, runningBalance, pastBalance } = getDayData(day);
                  const hasActivity = todaysLogs.length > 0;
                  const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, day).toDateString();
                  const isFuture = new Date(currentYear, currentMonth, day).getTime() > new Date().getTime();

                  const showRunningTotal = !isFuture && (hasActivity || runningBalance > 0 || pastBalance > 0);

                  return (
                    <div 
                      key={day} 
                      onClick={() => handleDayClick(todaysLogs, day)}
                      className={`bg-card min-h-[80px] sm:min-h-[120px] p-1 sm:p-3 flex flex-col relative transition-colors overflow-hidden ${
                        hasActivity ? 'cursor-pointer hover:bg-primary/5' : ''
                      } ${isToday ? 'ring-2 ring-primary ring-inset z-10' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1 sm:mb-2 gap-1">
                        <span className={`font-semibold text-sm sm:text-lg ${isToday ? 'text-primary' : ''}`}>{day}</span>
                      </div>
                      
                      {hasActivity && (
                        <div className="flex flex-col gap-1 mt-1">
                          {additions > 0 && (
                            <div className="text-center font-mono text-[10px] sm:text-xs py-0.5 rounded-md bg-green-500/10 text-green-600 font-bold border border-green-500/20">
                              +{additions}
                            </div>
                          )}
                          {deductions > 0 && (
                            <div className="text-center font-mono text-[10px] sm:text-xs py-0.5 rounded-md bg-red-500/10 text-red-600 font-bold border border-red-500/20">
                              -{deductions}
                            </div>
                          )}
                        </div>
                      )}

                      {showRunningTotal && (
                        <div className="mt-auto">
                          <div className={`text-center font-mono text-xs sm:text-sm py-1 rounded-md ${
                            hasActivity ? 'bg-primary/10 text-primary font-bold' : 'bg-muted text-muted-foreground'
                          }`}>
                            Rem: {runningBalance}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                      <th className="p-4">Customer</th>
                      <th className="p-4">Plan / Item</th>
                      <th className="p-4">Method</th>
                      <th className="p-4">Marked By</th>
                      <th className="p-4 text-right">Amount</th>
                      {canEdit && <th className="p-4 w-[50px]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsCollected.map((entry, index) => (
                      <tr key={index} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-4 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                        <td className="p-4 font-medium">{entry.customerName || '-'}</td>
                        <td className="p-4">
                          <Badge variant={entry.type === 'Membership' ? 'default' : 'secondary'}>
                            {entry.type === 'Membership' ? entry.planName : entry.type}
                          </Badge>
                        </td>
                        <td className="p-4">{entry.paymentMethod}</td>
                        <td className="p-4 text-muted-foreground">{entry.markedByName || '-'}</td>
                        <td className="p-4 text-right font-bold text-green-600">
                          +₹{entry.amount}
                        </td>
                        {canEdit && (
                          <td className="p-4">
                            {(entry.type === 'Membership' || entry.type === 'Debt Collection') && (
                              <Button variant="ghost" size="icon" onClick={() => handleRevert(entry)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {paymentsCollected.length === 0 && (
                      <tr>
                        <td colSpan={canEdit ? 7 : 6} className="p-8 text-center text-muted-foreground">No payments collected by this partner yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Customers</CardTitle>
              <CardDescription>Manage all customers assigned to this junior partner.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerList filterByPartnerId={partnerId} />
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
      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inventory Activity on {selectedDateLogs.length > 0 ? formatDate(selectedDateLogs[0].createdAt) : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedDateLogs.map(log => (
              <div key={log.id} className="flex justify-between items-start p-3 border rounded-lg bg-card shadow-sm">
                <div>
                  <div className="font-semibold text-lg">{formatDateTime(log.createdAt)}</div>
                  <div className="flex gap-2 items-center mt-2">
                    <Badge variant="outline">{log.type}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Marked By: <span className="font-medium text-foreground">{log.createdByName}</span>
                    </span>
                  </div>
                  {log.customerName && (
                    <div className="text-sm mt-1">
                      Customer: <span className="font-medium">{log.customerName}</span>
                    </div>
                  )}
                  {log.notes && (
                    <div className="text-sm mt-2 text-muted-foreground p-2 bg-muted/50 rounded-md">
                      {log.notes}
                    </div>
                  )}
                </div>
                <div className={`text-2xl font-bold ${log.type === 'ADDITION' ? 'text-green-600' : 'text-red-600'}`}>
                  {log.type === 'ADDITION' ? '+' : '-'}{log.amount}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <ManageShakesModal 
        partnerId={partner.id}
        partnerName={partner.name || partner.email || 'Partner'}
        isOpen={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        onSuccess={() => setRefreshKey(prev => prev + 1)}
      />
    </div>
  );
}
