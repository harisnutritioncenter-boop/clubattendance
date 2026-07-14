'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '@/features/ledger/types/ledger.types';
import { MembershipService } from '@/features/memberships/services/membership.service';
import { Customer } from '@/features/customers/types/customer.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { COLLECTIONS, db } from '@/firebase';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContactActions } from '@/components/ui/contact-actions';
import { ArrowLeft, Calendar as CalendarIcon, CreditCard, User, Info, MapPin, Phone, Target, CalendarDays, ChevronLeft, ChevronRight, Check, Trash2, Minus, Plus, GlassWater, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateAge, formatDate, formatDateTime, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomerForm } from '@/features/customers/components/customer-form';
import { CollectPaymentModal } from '@/features/payments/components/collect-payment-modal';
import { useAuthStore, useBranchStore } from '@/store';
// Create a union type for the UI since we fetch from a single ledger collection in Firebase
type LedgerEntry = (PaymentLedgerEntry | ShakeLedgerEntry) & { type?: string };

// Helper to get days in month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get day of week of first day (0-6, 0 is Sunday)
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [partnerName, setPartnerName] = useState<string>('');
  const [status, setStatus] = useState<CustomerMembershipStatus | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [familyNames, setFamilyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const { user, role: authRole } = useAuthStore();
  const branchId = useBranchStore(state => state.activeBranchId);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateLogs, setSelectedDateLogs] = useState<LedgerEntry[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [paymentToRevert, setPaymentToRevert] = useState<PaymentLedgerEntry | null>(null);
  const [consumptionToRevert, setConsumptionToRevert] = useState<ShakeLedgerEntry | null>(null);

  // Attendance Mark State
  const [isMarkAttendanceOpen, setIsMarkAttendanceOpen] = useState(false);
  const [serveCount, setServeCount] = useState(1);
  const [serveDate, setServeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // 1. Fetch Customer
        const snap = await getDoc(doc(COLLECTIONS.CUSTOMERS, customerId));
        if (!snap.exists()) {
          toast.error("Customer not found");
          return;
        }
        const cust = { id: snap.id, ...snap.data() } as Customer;
        setCustomer(cust);

        // 2. Fetch Partner Name if exists
        if (cust.juniorPartnerId) {
          const pSnap = await getDoc(doc(COLLECTIONS.USERS, cust.juniorPartnerId));
          if (pSnap.exists()) {
            setPartnerName(pSnap.data().name || pSnap.data().email);
          }
        }

        // 3. Fetch Status
        const stat = await LedgerService.getCustomerBalance(customerId);
        setStatus(stat);

        // 4. Fetch Ledger (Chronological)
        const paymentsQ = query(
          COLLECTIONS.PAYMENT_LEDGER, 
          where('customerId', '==', customerId),
          where('isArchived', '==', false)
        );
        const shakesQ = query(
          COLLECTIONS.SHAKE_LEDGER, 
          where('customerId', '==', customerId),
          where('isArchived', '==', false)
        );
        
        const [pSnap, sSnap] = await Promise.all([getDocs(paymentsQ), getDocs(shakesQ)]);
        
        const pRecords = pSnap.docs.map(d => ({ id: d.id, ...d.data(), type: d.data().type || 'Membership' } as LedgerEntry));
        const sRecords = sSnap.docs.map(d => ({ id: d.id, ...d.data(), type: 'Consumption' } as LedgerEntry));
        
        const records = [...pRecords, ...sRecords].sort((a, b) => a.createdAt - b.createdAt); // oldest first
        
        setLedger(records);

        // 5. Fetch all customers for family name mapping
        const allCusts = await CustomerService.getActiveCustomers(branchId || 'default-branch');
        const nameMap: Record<string, string> = {};
        allCusts.forEach(c => { nameMap[c.id] = c.name; });
        setFamilyNames(nameMap);

      } catch (err) {
        console.error(err);
        toast.error("Failed to load customer profile");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [customerId]);

  const age = calculateAge(customer?.birthDate);

  // Calendar Logic
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-11
  
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const prevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const getDayData = (day: number) => {
    const startOfDay = new Date(currentYear, currentMonth, day, 0, 0, 0).getTime();
    const endOfDay = new Date(currentYear, currentMonth, day, 23, 59, 59, 999).getTime();

    let totalAssigned = 0;
    let totalConsumed = 0;
    let assignedBeforeToday = 0;
    let consumedBeforeToday = 0;
    const todaysLogs: LedgerEntry[] = [];

    // Because ledger is sorted chronologically, we just iterate through
    for (const entry of ledger) {
      if (entry.createdAt > endOfDay) break; // Don't count future events

      const isBeforeToday = entry.createdAt < startOfDay;

      if (entry.type === 'Membership' || entry.type === 'Add Shakes' || entry.type === 'Debt Collection') {
        const amt = (entry as PaymentLedgerEntry).shakesAdded || 0;
        totalAssigned += amt;
        if (isBeforeToday) assignedBeforeToday += amt;
      } else if (entry.type === 'Consumption') {
        const amt = (entry as ShakeLedgerEntry).shakesDeducted || 0;
        totalConsumed += amt;
        if (isBeforeToday) consumedBeforeToday += amt;
      }

      // Check if the entry happened ON this specific day
      if (entry.createdAt >= startOfDay && entry.createdAt <= endOfDay) {
        if (entry.type === 'Consumption') {
          todaysLogs.push(entry);
        }
      }
    }

    return { totalAssigned, totalConsumed, assignedBeforeToday, consumedBeforeToday, todaysLogs };
  };

  const handleDayClick = (logs: LedgerEntry[], day: number) => {
    if (logs.length > 0) {
      setSelectedDateLogs(logs);
      setIsLogModalOpen(true);
    }
  };

  const handleRevert = async (sLog: ShakeLedgerEntry) => {
    if (authRole === 'junior_partner') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (sLog.createdAt < sevenDaysAgo) {
        toast.error('Junior Partners can only revert consumptions within 7 days.');
        return;
      }
    }
    setConsumptionToRevert(sLog);
  };

  const confirmRevertConsumption = async () => {
    if (!consumptionToRevert) return;
    try {
      await LedgerService.voidConsumption(consumptionToRevert.id!, user?.uid || 'system');
      toast.success('Consumption reverted successfully');
      setIsLogModalOpen(false);
      
      // Update ledger optimistically
      setLedger(prev => prev.filter(l => l.id !== consumptionToRevert.id));
      if (status) {
        setStatus({
          ...status,
          remainingShakes: status.remainingShakes + (consumptionToRevert.shakesDeducted || 1)
        });
      }
      setConsumptionToRevert(null);
    } catch (error: any) {
      toast.error('Failed to revert consumption: ' + error.message);
    }
  };

  const handleRevertPayment = async (pLog: PaymentLedgerEntry) => {
    if (pLog.type !== 'Membership') {
      toast.error('Only membership assignments can be reverted here.');
      return;
    }

    if (authRole === 'junior_partner') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (pLog.createdAt < sevenDaysAgo) {
        toast.error('Junior Partners can only revert assignments within 7 days.');
        return;
      }
    }
    setPaymentToRevert(pLog);
  };

  const confirmRevertPayment = async () => {
    if (!paymentToRevert) return;
    try {
      await LedgerService.voidPayment(paymentToRevert.id!, user?.uid || 'system');
      toast.success('Membership assignment reverted successfully');
      
      // Update ledger optimistically
      setLedger(prev => prev.filter(l => l.id !== paymentToRevert.id));
      if (status) {
        setStatus({
          ...status,
          remainingShakes: status.remainingShakes - (paymentToRevert.shakesAdded || 0),
          remainingBalance: status.remainingBalance - (paymentToRevert.remainingBalance || 0)
        });
      }
      setPaymentToRevert(null);
    } catch (error: any) {
      toast.error('Failed to revert assignment: ' + error.message);
    }
  };

  const handleServe = async () => {
    if (!status || !user) return;
    
    const bId = branchId || 'default-branch';
    setMarkingAttendance(true);
    try {
      const serveDateObj = new Date(serveDate);
      serveDateObj.setHours(new Date().getHours());
      serveDateObj.setMinutes(new Date().getMinutes());
      
      const notesStr = customer?.isTrial ? `Marked ${serveCount} attendance.` : `Served ${serveCount} shakes.`;

      const newConsumptionId = await LedgerService.addConsumption({
        shakesDeducted: serveCount,
        branchId: bId,
        createdBy: user.uid,
        createdAt: serveDateObj.getTime(),
        notes: notesStr
      }, customerId);
      
      const newShakeEntry = {
        id: newConsumptionId,
        shakesDeducted: serveCount,
        branchId: bId,
        createdBy: user.uid,
        createdAt: serveDateObj.getTime(),
        notes: notesStr,
        customerId,
        type: 'Consumption',
        isArchived: false,
      } as LedgerEntry;

      setLedger(prev => [...prev, newShakeEntry].sort((a, b) => a.createdAt - b.createdAt));

      setStatus({
        ...status,
        remainingShakes: status.remainingShakes - serveCount,
        totalShakesConsumed: status.totalShakesConsumed + serveCount
      });
      
      // Send automated WhatsApp message
      try {
        if (customer && customer.mobile) {
          const formattedDate = formatDate(serveDateObj.getTime());
          const timeStr = serveDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const consumed = status.totalShakesConsumed + serveCount;
          const remaining = status.remainingShakes - serveCount;
          const total = consumed + remaining;
          
          await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: customer.name,
              mobile: customer.mobile,
              date: formattedDate,
              time: timeStr,
              consumed: consumed,
              total: total,
              remaining: remaining
            })
          });
        }
      } catch (waError) {
        console.error('Failed to send WhatsApp message', waError);
      }
      
      setAttendanceSuccess(true);
      setTimeout(() => {
        setIsMarkAttendanceOpen(false);
        setAttendanceSuccess(false);
        setServeCount(1);
      }, 2000);
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to mark attendance.");
    } finally {
      setMarkingAttendance(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading Customer Profile...</div>;
  }

  if (!customer) {
    return <div className="p-8 text-center">Customer not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-muted-foreground mt-1">
              <p>{customer.displayId} • Joined {formatDate(customer.createdAt)}</p>
              <div className="hidden sm:block h-4 w-px bg-border"></div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ContactActions mobile={customer.mobile} />
                <span>{customer.mobile}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white" 
            onClick={() => {
              setServeCount(1);
              setAttendanceSuccess(false);
              setIsMarkAttendanceOpen(true);
            }}
          >
            <Check className="mr-2 h-4 w-4" /> Mark Attendance
          </Button>
          <Button variant="outline" onClick={() => setEditModalOpen(true)}>Edit Profile</Button>
          {status && status.remainingBalance > 0 && (
             <Button variant="destructive" onClick={() => setCollectModalOpen(true)}>Collect Debt (₹{status.remainingBalance})</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="flex w-full overflow-x-auto justify-start sm:grid sm:grid-cols-3 max-w-2xl mb-8 p-1">
          <TabsTrigger value="profile" className="whitespace-nowrap shrink-0 gap-2"><User className="h-4 w-4" /> Profile Details</TabsTrigger>
          <TabsTrigger value="calendar" className="whitespace-nowrap shrink-0 gap-2"><CalendarIcon className="h-4 w-4" /> Attendance</TabsTrigger>
          <TabsTrigger value="payments" className="whitespace-nowrap shrink-0 gap-2"><CreditCard className="h-4 w-4" /> Payment History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-muted-foreground">Mobile</div>
                  <div className="font-medium">{customer.mobile}</div>
                  
                  <div className="text-muted-foreground">Email</div>
                  <div className="font-medium">{customer.email || '-'}</div>
                  
                  <div className="text-muted-foreground">Age / Birth Date</div>
                  <div className="font-medium">
                    {age !== null ? `${age} yrs` : '-'} 
                    {customer.birthDate && <span className="text-muted-foreground font-normal ml-1">({formatDate(customer.birthDate)})</span>}
                  </div>
                  
                  <div className="text-muted-foreground">Locality</div>
                  <div className="font-medium">{customer.locality || '-'}</div>
                  
                  <div className="text-muted-foreground">Full Address</div>
                  <div className="font-medium">{customer.address || '-'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Membership & Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-muted-foreground">Junior Partner</div>
                  <div className="font-medium">{partnerName || '-'}</div>

                  <div className="text-muted-foreground">Health Goals</div>
                  <div className="font-medium flex flex-wrap gap-1">
                    {customer.purpose?.map(p => (
                      <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                    )) || '-'}
                  </div>

                  <div className="text-muted-foreground">Active Plan</div>
                  <div className="font-medium text-primary font-bold">{status?.latestPlanName || 'None'}</div>

                  <div className="text-muted-foreground">Remaining Attendances</div>
                  <div className="font-medium text-lg font-bold">{status?.remainingShakes || 0}</div>
                  
                  {customer.notes && (
                    <>
                      <div className="text-muted-foreground">Notes</div>
                      <div className="font-medium italic text-muted-foreground">{customer.notes}</div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <Card className="border-0 shadow-lg bg-card/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 sm:pb-8 gap-4">
              <div>
                <CardTitle className="text-2xl">Attendance & Consumption</CardTitle>
                <CardDescription>View daily attendance. Numbers represent (Marked / Total Assigned).</CardDescription>
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
                  const { totalAssigned, totalConsumed, assignedBeforeToday, consumedBeforeToday, todaysLogs } = getDayData(day);
                  const hasConsumedToday = todaysLogs.length > 0;
                  const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, day).toDateString();
                  const isFuture = new Date(currentYear, currentMonth, day).getTime() > new Date().getTime();

                  const wasFullyConsumedBeforeToday = assignedBeforeToday > 0 && consumedBeforeToday >= assignedBeforeToday;
                  const showRunningTotal = !isFuture && totalAssigned > 0 && (!wasFullyConsumedBeforeToday || hasConsumedToday);

                  return (
                    <div 
                      key={day} 
                      onClick={() => handleDayClick(todaysLogs, day)}
                      className={`bg-card min-h-[80px] sm:min-h-[120px] p-1 sm:p-3 flex flex-col relative transition-colors overflow-hidden ${
                        hasConsumedToday ? 'cursor-pointer hover:bg-primary/5' : ''
                      } ${isToday ? 'ring-2 ring-primary ring-inset z-10' : ''}`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start mb-1 sm:mb-2 gap-1">
                        <span className={`font-semibold text-sm sm:text-lg ${isToday ? 'text-primary' : ''}`}>{day}</span>
                        {hasConsumedToday && (
                          <Badge variant="default" className="h-4 sm:h-5 px-1 sm:px-1.5 rounded-full bg-green-500 hover:bg-green-600 text-[10px] sm:text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            {todaysLogs.reduce((acc, log) => acc + ((log as ShakeLedgerEntry).shakesDeducted || 1), 0)}
                          </Badge>
                        )}
                      </div>
                      
                      {showRunningTotal && (
                        <div className="mt-auto">
                          <div className={`text-center font-mono text-sm py-1.5 rounded-md ${
                            hasConsumedToday ? 'bg-primary/10 text-primary font-bold' : 'bg-muted text-muted-foreground'
                          }`}>
                            {totalConsumed} / {totalAssigned}
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
              <CardTitle>Payment & Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                      <th className="p-4">Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-left font-medium text-muted-foreground w-32">Amount</th>
                      <th className="p-4 text-left font-medium text-muted-foreground">Method</th>
                      <th className="p-4 text-left font-medium text-muted-foreground">Notes</th>
                      <th className="p-4 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...ledger].reverse().filter(l => l.type === 'Membership' || l.type === 'Debt Collection' || l.type === 'Add Shakes').map(entry => {
                      const pEntry = entry as PaymentLedgerEntry;
                      return (
                      <tr key={pEntry.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-4 whitespace-nowrap">{formatDateTime(pEntry.createdAt)}</td>
                        <td className="p-4">
                          <Badge variant={pEntry.type === 'Debt Collection' ? 'secondary' : 'outline'}>
                            {pEntry.type}
                          </Badge>
                          {pEntry.planName && <div className="text-xs text-muted-foreground mt-1">{pEntry.planName}</div>}
                        </td>
                        <td className="p-4 font-bold">
                          {pEntry.amount > 0 ? `₹${pEntry.amount}` : '-'}
                        </td>
                        <td className="p-4">{pEntry.paymentMethod || '-'}</td>
                        <td className="p-4 text-muted-foreground text-xs max-w-xs truncate" title={pEntry.notes}>{pEntry.notes || '-'}</td>
                        <td className="p-4">
                          {pEntry.type === 'Membership' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRevertPayment(pEntry)}
                              title="Void Membership"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )})}
                    {ledger.filter(l => l.type === 'Membership' || l.type === 'Debt Collection' || l.type === 'Add Shakes').length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">No financial transactions found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consumption Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedDateLogs.map((log, i) => {
              const sLog = log as ShakeLedgerEntry;
              const consumerName = sLog.consumedBy && familyNames[sLog.consumedBy] ? familyNames[sLog.consumedBy] : customer?.name;
              const markedByName = sLog.createdBy === customer?.juniorPartnerId ? (partnerName || 'Partner') : 'Admin';
              
              let displayNotes = sLog.notes || 'Marked attendance';
              if (displayNotes.includes('Served') && displayNotes.includes('shakes')) {
                displayNotes = displayNotes.replace('Served', 'Marked').replace('shakes.', 'attendance(s).');
              }
              return (
              <div key={sLog.id || i} className="flex flex-col gap-1 p-3 bg-muted/30 rounded-lg border">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold flex items-center gap-2">
                      {new Date(sLog.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {customer?.isTrial && <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] h-4 px-1 py-0">Trial</Badge>}
                    </span>
                    <span className="text-xs text-primary font-medium block mt-1">Consumed By: {consumerName}</span>
                    <span className="text-xs text-muted-foreground font-medium block">Marked By: {markedByName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">-{sLog.shakesDeducted || 1} Attendance(s)</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRevert(sLog)} title="Revert Consumption">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {displayNotes}
                </div>
              </div>
            )})}
          </div>
        </DialogContent>
      </Dialog>

      {customer && (
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer: {customer.name}</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              customer={customer}
              onSuccess={() => {
                setEditModalOpen(false);
                window.location.reload(); 
              }}
              onCancel={() => setEditModalOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {customer && status && status.remainingBalance > 0 && (
        <CollectPaymentModal
          isOpen={collectModalOpen}
          onOpenChange={setCollectModalOpen}
          customerId={customer.id}
          customerName={customer.name}
          amountDue={status.remainingBalance}
          onSuccess={() => window.location.reload()}
        />
      )}

      {/* Styled Dialog for Reverting Consumption */}
      <Dialog open={!!consumptionToRevert} onOpenChange={(open) => !open && setConsumptionToRevert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Revert Attendance
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Are you sure you want to revert the <strong>{consumptionToRevert?.shakesDeducted || 1} attendance(s)</strong> marked on {consumptionToRevert ? formatDateTime(consumptionToRevert.createdAt) : ''}?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-3 rounded-md text-sm my-2">
            This will restore the attendance(s) back to the customer's balance.
          </div>
          <DialogFooter className="sm:justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConsumptionToRevert(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRevertConsumption}>Yes, Revert Consumption</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Styled Dialog for Reverting Membership */}
      <Dialog open={!!paymentToRevert} onOpenChange={(open) => !open && setPaymentToRevert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Void Membership Assignment
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              Are you sure you want to void the <span className="font-semibold text-foreground">{paymentToRevert?.planName || 'Membership'}</span> assignment for <span className="font-semibold text-foreground">{customer?.name}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 p-3 rounded-md text-sm my-2">
            This will logically refund the <strong>₹{paymentToRevert?.amount?.toLocaleString()}</strong> payment and immediately subtract the attendances from their available balance. If they have already marked those attendances, their balance will become negative.
          </div>
          <DialogFooter className="sm:justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPaymentToRevert(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRevertPayment}>Yes, Void Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Attendance Modal */}
      {customer && status && (
        <Dialog open={isMarkAttendanceOpen} onOpenChange={(open) => {
          if (!open) {
            setIsMarkAttendanceOpen(false);
            setAttendanceSuccess(false);
            setServeCount(1);
          } else {
            setIsMarkAttendanceOpen(true);
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark Attendance for {customer.name}</DialogTitle>
              <DialogDescription>
                Deduct attendances from the customer's remaining balance.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 flex flex-col items-center">
              {attendanceSuccess ? (
                <div className="flex flex-col items-center animate-in zoom-in-95 duration-300 space-y-4">
                  <div className="h-16 w-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-green-700 dark:text-green-400">Attendance Marked!</h3>
                    <p className="text-sm mt-1 text-muted-foreground">{serveCount} attendance(s) deducted.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-4 mb-6">
                    <p className="text-sm font-medium">How many attendances?</p>
                    <div className="flex items-center gap-6 bg-muted/50 p-2 rounded-full border">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-10 w-10"
                        onClick={() => setServeCount(Math.max(1, serveCount - 1))}
                        disabled={serveCount <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div className="flex flex-col items-center min-w-[2rem]">
                        <span className="text-2xl font-bold">{serveCount}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-10 w-10"
                        onClick={() => setServeCount(serveCount + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="w-full mb-6">
                    <p className="text-sm font-medium mb-2 text-center">Attendance Date</p>
                    <Popover>
                      <PopoverTrigger 
                        render={
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !serveDate && "text-muted-foreground"
                            )}
                          />
                        }
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {serveDate ? formatDate(serveDate) : <span>Pick a date</span>}
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center">
                        <Calendar
                          mode="single"
                          selected={serveDate ? new Date(serveDate) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const localDateStr = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                              setServeDate(localDateStr);
                            }
                          }}
                          disabled={(date) => date > new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Button 
                    size="lg" 
                    className="w-full text-base font-bold bg-green-600 hover:bg-green-700 text-white" 
                    onClick={handleServe}
                    disabled={markingAttendance}
                  >
                    <GlassWater className="mr-2 h-5 w-5" />
                    {markingAttendance ? 'Processing...' : `Confirm ${serveCount} Attendance${serveCount > 1 ? 's' : ''}`}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
