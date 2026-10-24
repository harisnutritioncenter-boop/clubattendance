'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CustomerService } from '@/features/customers/services/customer.service';
import { FamilyService } from '@/features/family/services/family.service';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContactActions } from '@/components/ui/contact-actions';
import { ArrowLeft, Calendar as CalendarIcon, CreditCard, User, Info, MapPin, Phone, Target, CalendarDays, ChevronLeft, ChevronRight, Check, Trash2, Minus, Plus, GlassWater, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateAge, formatDate, formatDateTime, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomerForm } from '@/features/customers/components/customer-form';
import { TransferCustomerModal } from '@/features/customers/components/transfer-customer-modal';
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
  const [usersMap, setUsersMap] = useState<Record<string, {name: string, role: string}>>({});
  const [loading, setLoading] = useState(true);

  const { user, role: authRole } = useAuthStore();
  const branchId = useBranchStore(state => state.activeBranchId);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateLogs, setSelectedDateLogs] = useState<LedgerEntry[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  /* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  */
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [targetCollectJpId, setTargetCollectJpId] = useState<string | undefined>(undefined);
  const [targetCollectBranchId, setTargetCollectBranchId] = useState<string | undefined>(undefined);
  const [targetCollectAmount, setTargetCollectAmount] = useState<number>(0);
  const [consumptionToRevert, setConsumptionToRevert] = useState<ShakeLedgerEntry | null>(null);
  const [paymentToRevert, setPaymentToRevert] = useState<PaymentLedgerEntry | null>(null);
  const [isSubmittingRevert, setIsSubmittingRevert] = useState(false);
  /* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  */
  const [batches, setBatches] = useState<any[]>([]);

  // Attendance Mark State
  const [isMarkAttendanceOpen, setIsMarkAttendanceOpen] = useState(false);
  const [serveCount, setServeCount] = useState(1);
  const [serveDate, setServeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

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
        const family = await FamilyService.getFamilyForCustomer(customerId);
        const ledgerCustomerId = family ? family.primaryCustomerId : customerId;

        const paymentsQ = query(
          COLLECTIONS.PAYMENT_LEDGER, 
          where('customerId', '==', ledgerCustomerId),
          where('isArchived', '==', false)
        );
        const shakesQ = query(
          COLLECTIONS.SHAKE_LEDGER, 
          where('customerId', '==', ledgerCustomerId), // also fetch consumptions from primary account so they perfectly match LedgerService
          where('isArchived', '==', false)
        );
        
        const [pSnap, sSnap] = await Promise.all([getDocs(paymentsQ), getDocs(shakesQ)]);
        
        const pRecords = pSnap.docs.map(d => ({ id: d.id, ...d.data(), type: d.data().type || 'Membership' } as LedgerEntry));
        const sRecords = sSnap.docs.map(d => ({ id: d.id, ...d.data(), type: d.data().isTransfer ? 'Transfer' : 'Consumption' } as LedgerEntry));
        
        let records = [...pRecords, ...sRecords].sort((a, b) => a.createdAt - b.createdAt); // oldest first
        
        if (user) {
          // Truncate timeline for FORMER viewers (Transfer/Jugaad boundary logic)
          if (authRole === 'junior_partner' && cust.juniorPartnerId !== user.uid) {
            // Viewer is a FORMER Junior Partner. Hide all records after their last interaction.
            const myLastRecord = [...records].reverse().find(r => r.juniorPartnerId === user.uid || r.createdBy === user.uid);
            if (myLastRecord) {
              records = records.filter(r => r.createdAt <= myLastRecord.createdAt);
            } else {
              records = records.filter(r => r.juniorPartnerId === user.uid); 
            }
          } else if (authRole === 'club_owner' && branchId && cust.branchId !== branchId && branchId !== 'default-branch' && branchId !== 'all') {
            // Viewer is a FORMER Club Owner (Inter-club transfer). Hide all records after it left their club.
            const myLastRecord = [...records].reverse().find(r => r.branchId === branchId);
            if (myLastRecord) {
              records = records.filter(r => r.createdAt <= myLastRecord.createdAt);
            } else {
              records = records.filter(r => r.branchId === branchId);
            }
          }
        }

        setLedger(records);
        
        // 5. Populate users map for names
        try {
          const uSnap = await getDocs(COLLECTIONS.USERS);
          const uMap: Record<string, {name: string, role: string}> = {};
          uSnap.docs.forEach(d => {
            uMap[d.id] = { name: d.data().name || d.data().email || 'Partner', role: d.data().role };
          });
          setUsersMap(uMap);
        } catch(e) {}

        // Fetch Batches
        const targetBranchId = branchId || (user as any)?.clubId || 'default-branch';
        if (targetBranchId) {
          const q = targetBranchId === 'default-branch'
            ? query(COLLECTIONS.BATCHES, where('branchId', '==', targetBranchId), where('isActive', '==', true))
            : query(COLLECTIONS.BATCHES, where('branchId', 'in', ['default-branch', targetBranchId]), where('isActive', '==', true));
          const batchesSnap = await getDocs(q);
          const bData = batchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          bData.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
          setBatches(bData);
          if (bData.length > 0) setSelectedBatchId(bData[0].id);
        }

        // 5. Fetch all customers for family name mapping
        const allCusts = await CustomerService.getActiveCustomers(branchId || 'default-branch');
        const nameMap: Record<string, string> = {};
        allCusts.forEach(c => { nameMap[c.id] = c.name; });
        setFamilyNames(nameMap);

        // 6. Fetch users for "Marked By" display
        const usersSnap = await getDocs(COLLECTIONS.USERS);
        const uMap: Record<string, {name: string, role: string}> = {};
        usersSnap.docs.forEach(d => {
          uMap[d.id] = { name: d.data().name || d.data().email || 'Unknown', role: d.data().role };
        });
        setUsersMap(uMap);

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

  const getCycleStatsAtTime = (timestamp: number, ledgerArray: LedgerEntry[]) => {
    let cycleAssigned = 0;
    let cycleConsumed = 0;

    for (const entry of ledgerArray) {
      if (entry.createdAt > timestamp) break; // Stop exactly at this time

      if (entry.type === 'Membership' || entry.type === 'Add Shakes') {
        const amt = (entry as PaymentLedgerEntry).shakesAdded || 0;
        if (amt > 0) {
          if (cycleConsumed > cycleAssigned) {
            const deficit = cycleConsumed - cycleAssigned;
            cycleAssigned = amt;
            cycleConsumed = deficit;
          } else {
            const surplus = cycleAssigned - cycleConsumed;
            cycleAssigned = amt + surplus;
            cycleConsumed = 0;
          }
        }
      } else if (entry.type === 'Debt Collection') {
        cycleAssigned += (entry as PaymentLedgerEntry).shakesAdded || 0;
      } else if (entry.type === 'Consumption') {
        cycleConsumed += (entry as ShakeLedgerEntry).shakesDeducted || 0;
      }
      // Note: 'Transfer' entries are intentionally ignored in cycle calculations as they have 0 deduction
    }
    return { cycleAssigned, cycleConsumed };
  };

  const getDayData = (day: number) => {
    const startOfDay = new Date(currentYear, currentMonth, day, 0, 0, 0).getTime();
    const endOfDay = new Date(currentYear, currentMonth, day, 23, 59, 59, 999).getTime();

    const startStats = getCycleStatsAtTime(startOfDay - 1, ledger);
    const endStats = getCycleStatsAtTime(endOfDay, ledger);
    
    const todaysLogs: LedgerEntry[] = [];
    for (const entry of ledger) {
      if (entry.createdAt > endOfDay) break;
      if (entry.createdAt >= startOfDay && (entry.type === 'Consumption' || entry.type === 'Transfer')) {
        todaysLogs.push(entry);
      }
    }

    return {
      totalAssigned: endStats.cycleAssigned,
      totalConsumed: endStats.cycleConsumed,
      assignedBeforeToday: startStats.cycleAssigned,
      consumedBeforeToday: startStats.cycleConsumed,
      todaysLogs
    };
  };

  const handleDayClick = (logs: LedgerEntry[], day: number) => {
    if (logs.length > 0) {
      setSelectedDateLogs(logs);
      setIsLogModalOpen(true);
    }
  };

  const canRevertConsumption = (sLog: ShakeLedgerEntry) => {
    if (authRole === 'super_admin') return true;
    if (authRole === 'club_owner') return !sLog.branchId || sLog.branchId === branchId;
    if (authRole === 'junior_partner') return sLog.juniorPartnerId === user?.uid || (!sLog.juniorPartnerId && customer?.juniorPartnerId === user?.uid);
    return false;
  };

  const canRevertPayment = (pLog: PaymentLedgerEntry) => {
    if (authRole === 'super_admin') return true;
    if (authRole === 'club_owner') return !pLog.branchId || pLog.branchId === branchId;
    if (authRole === 'junior_partner') return pLog.juniorPartnerId === user?.uid || (!pLog.juniorPartnerId && customer?.juniorPartnerId === user?.uid);
    return false;
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
    setIsSubmittingRevert(true);
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
    } finally {
      setIsSubmittingRevert(false);
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
    setIsSubmittingRevert(true);
    
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
      // Force a hard reload to ensure customer trial flags and Assign Membership button instantly resync
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      toast.error('Failed to revert assignment: ' + error.message);
    } finally {
      setIsSubmittingRevert(false);
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

      const selectedBatch = batches.find(b => b.id === selectedBatchId);
      const newConsumptionId = await LedgerService.addConsumption({
        shakesDeducted: serveCount,
        branchId: bId,
        createdBy: user.uid,
        createdAt: serveDateObj.getTime(),
        notes: notesStr,
        batchId: selectedBatch?.id || null,
        batchName: selectedBatch?.name || null
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

      const updatedLedger = [...ledger, newShakeEntry].sort((a, b) => a.createdAt - b.createdAt);
      setLedger(updatedLedger);

      setStatus({
        ...status,
        remainingShakes: status.remainingShakes - serveCount,
        totalShakesConsumed: status.totalShakesConsumed + serveCount
      });
      
      // Calculate exact cycle logic at the time of this service for accurate WhatsApp messages
      const { cycleAssigned, cycleConsumed } = getCycleStatsAtTime(serveDateObj.getTime(), updatedLedger);
      
      // Send automated WhatsApp message
      try {
        if (customer && customer.mobile) {
          const formattedDate = formatDate(serveDateObj.getTime());
          const selectedBatch = batches.find(b => b.id === selectedBatchId);
          const batchName = selectedBatch?.name || 'Unknown Batch';
          const remaining = cycleAssigned - cycleConsumed;
          
          await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: customer.name,
              mobile: customer.mobile,
              date: formattedDate,
              batch: batchName,
              consumed: cycleConsumed,
              total: cycleAssigned,
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

  /* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
  const isTransferredOut = customer && (
    (branchId && customer.branchId !== branchId && branchId !== 'default-branch' && branchId !== 'all') ||
    (authRole === 'junior_partner' && customer.juniorPartnerId !== user?.uid)
  );
  */
  const isTransferredOut = false;

  // Calculate debt breakdown so ANY viewer can see and collect ALL debts individually
  const debtMap: Record<string, { jpId: string, branchId: string, amount: number }> = {};
  
  if (ledger && status) {
    ledger.forEach(l => {
      if (l.type === 'Membership' || l.type === 'Debt Collection' || l.type === 'Add Shakes' || (!l.type && (l as any).planName)) {
         const p = l as PaymentLedgerEntry;
         if (p.remainingBalance) {
            // For old records that might not have jp/branch perfectly set, fallback to customer's current if it's the only one
            const jp = p.juniorPartnerId && p.juniorPartnerId !== 'unassigned' ? p.juniorPartnerId : (customer?.juniorPartnerId || 'unassigned');
            const br = p.branchId && p.branchId !== 'unassigned' && p.branchId !== 'default-branch' ? p.branchId : (customer?.branchId || 'unassigned');
            
            const key = `${jp}_${br}`;
            if (!debtMap[key]) debtMap[key] = { jpId: jp, branchId: br, amount: 0 };
            debtMap[key].amount += p.remainingBalance;
         }
      }
    });
  }

  const debtBreakdown = Object.values(debtMap).map(d => {
    let isLocal = false;
    if (authRole === 'junior_partner' && d.jpId === user?.uid) isLocal = true;
    else if (authRole === 'club_owner' && d.branchId === branchId) isLocal = true;
    else if (authRole === 'super_admin') isLocal = true;
    return { ...d, isLocal };
  }).filter(d => d.amount > 0);

  // Track state for multi-debt collection
  // (We use a React anti-pattern of let variables for UI rendering, but we'll bind them in the button click)
  let targetJpIdForCollection: string | undefined = undefined;
  let targetBranchIdForCollection: string | undefined = undefined;
  let targetAmountForCollection: number = 0;

  // Calculate the Dead-Time Boundary for backdating
  const lastOtherJpConsumption = ledger
    .filter(l => l.type === 'Consumption' && l.juniorPartnerId && l.juniorPartnerId !== customer?.juniorPartnerId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  
  let deadTimeBoundaryDate: Date | undefined = undefined;
  if (lastOtherJpConsumption) {
    deadTimeBoundaryDate = new Date(lastOtherJpConsumption.createdAt);
    deadTimeBoundaryDate.setHours(0, 0, 0, 0); // Start of that day
  }

  /* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
  const baseDate = customer?.trialConvertedAt || customer?.createdAt || 0;
  const isDeletable = Date.now() - baseDate <= 30 * 24 * 60 * 60 * 1000;

  const handleDeleteCustomer = async () => {
    if (!customer || !user) return;
    try {
      setIsDeleting(true);
      await CustomerService.hardDeleteCustomer(customer.id, user.uid);
      toast.success("Customer and all records successfully deleted.");
      setDeleteModalOpen(false);
      router.push(customer.isTrial ? '/trials' : '/customers');
    } catch (err: any) {
      console.error("Failed to delete customer:", err);
      toast.error(err.message || "Failed to delete customer.");
    } finally {
      setIsDeleting(false);
    }
  };
  */

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
      isTransferredOut && (
        <div className="bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-lg flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Transferred Customer</h3>
            <p className="text-sm mt-1">This customer has been transferred to another partner or club. You are viewing historical data only, and you cannot modify their profile, mark attendance, or collect payments.</p>
          </div>
        </div>
      )
      */}
      
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
          {!isTransferredOut && (
            <>
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
              {/* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
              (authRole === 'super_admin' || authRole === 'club_owner') && (
                <Button 
                  variant="outline" 
                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                  onClick={() => {
                    if (status && !status.isExpired) {
                      toast.error("Cannot transfer a customer with an active membership.");
                      return;
                    }
                    if (debtBreakdown.length > 0) {
                      toast.error("Cannot transfer a customer with outstanding debt. Please collect all debt first.");
                      return;
                    }
                    setTransferModalOpen(true);
                  }}
                >
                  Transfer
                </Button>
              )
              */}
              <Button variant="outline" onClick={() => setEditModalOpen(true)}>Edit Profile</Button>
              {/* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
              authRole === 'super_admin' && (
                <Button 
                  variant="destructive" 
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={!isDeletable}
                  className={cn("text-white", isDeletable ? "bg-red-600 hover:bg-red-700" : "bg-red-400 opacity-50")}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Record
                </Button>
              )
              */}
            </>
          )}
          {debtBreakdown.map((debt, idx) => (
             <Button key={idx} variant={debt.isLocal ? "destructive" : "secondary"} onClick={() => {
                 setTargetCollectJpId(debt.jpId !== 'unassigned' ? debt.jpId : undefined);
                 setTargetCollectBranchId(debt.branchId !== 'unassigned' ? debt.branchId : undefined);
                 setTargetCollectAmount(debt.amount);
                 setCollectModalOpen(true);
             }}>
               Collect Debt (₹{debt.amount}) {debt.jpId !== 'unassigned' && usersMap[debt.jpId] ? `for ${usersMap[debt.jpId].name}` : ''}
             </Button>
          ))}
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
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Membership & Health</CardTitle>
                {status?.latestPlanName && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-destructive border-destructive hover:bg-destructive/10" 
                    onClick={() => {
                      const latestMembership = [...ledger].reverse().find(l => l.type === 'Membership');
                      if (latestMembership) {
                        handleRevertPayment(latestMembership as PaymentLedgerEntry);
                      } else {
                        toast.error("No membership assignment found to revoke.");
                      }
                    }}
                  >
                    Revoke Plan
                  </Button>
                )}
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
                  const showRunningTotal = !isFuture && (totalAssigned > 0 || totalConsumed > 0) && (!wasFullyConsumedBeforeToday || hasConsumedToday);

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
                        <div className="flex flex-col gap-1 items-end">
                          {hasConsumedToday && (
                            <Badge variant="default" className="h-4 sm:h-5 px-1 sm:px-1.5 rounded-full bg-green-500 hover:bg-green-600 text-[10px] sm:text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              {todaysLogs.filter(l => l.type === 'Consumption').reduce((acc, log) => acc + ((log as ShakeLedgerEntry).shakesDeducted || 1), 0)}
                            </Badge>
                          )}
                          {todaysLogs.some(l => l.type === 'Transfer') && (
                            <Badge variant="default" className="h-4 sm:h-5 px-1 sm:px-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-[10px] sm:text-xs" title="Club Transfer">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Transfer
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {showRunningTotal && (
                        <div className="mt-auto">
                          <div className={`text-center font-mono text-sm py-1.5 rounded-md ${
                            hasConsumedToday ? 'bg-primary/10 text-primary font-bold' : 'bg-muted text-muted-foreground'
                          }`}>
                            {`${totalConsumed} / ${totalAssigned}`}
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
                          {pEntry.type === 'Membership' && canRevertPayment(pEntry) && (
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
              let markedByName = 'Admin';
              if (usersMap[sLog.createdBy]) {
                const u = usersMap[sLog.createdBy];
                markedByName = u.name !== 'Unknown' ? u.name : (u.role === 'club_owner' ? 'Club Owner' : u.role === 'junior_partner' ? 'Partner' : 'Admin');
              }
              
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
                      {customer?.isTrial && !sLog.isTransfer && <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] h-4 px-1 py-0">Trial</Badge>}
                    </span>
                    <span className="text-xs text-primary font-medium block mt-1">Consumed By: {consumerName}</span>
                    {sLog.batchName && <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium block">Batch: {sLog.batchName}</span>}
                    <span className="text-xs text-muted-foreground font-medium block">Marked By: {markedByName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {sLog.isTransfer ? (
                      <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Transferred</Badge>
                    ) : (
                      <Badge variant="outline">-{sLog.shakesDeducted || 1} Attendance(s)</Badge>
                    )}
                    {canRevertConsumption(sLog) && !sLog.isTransfer && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRevert(sLog)} title="Revert Consumption">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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

      {customer && status && debtBreakdown.length > 0 && (
        <CollectPaymentModal
          isOpen={collectModalOpen}
          onOpenChange={(open) => {
            setCollectModalOpen(open);
            if (!open) {
               setTargetCollectJpId(undefined);
               setTargetCollectBranchId(undefined);
               setTargetCollectAmount(0);
            }
          }}
          customerId={customer.id}
          customerName={customer.name}
          amountDue={targetCollectAmount > 0 ? targetCollectAmount : debtBreakdown[0]?.amount || 0}
          targetJuniorPartnerId={targetCollectJpId}
          targetBranchId={targetCollectBranchId}
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
            <Button variant="destructive" onClick={confirmRevertConsumption} disabled={isSubmittingRevert}>
              {isSubmittingRevert ? "Reverting..." : "Yes, Revert Consumption"}
            </Button>
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
            <Button variant="destructive" onClick={confirmRevertPayment} disabled={isSubmittingRevert}>
              {isSubmittingRevert ? "Reverting..." : "Yes, Void Assignment"}
            </Button>
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
                    <p className="text-sm font-medium mb-2 text-center">Select Batch</p>
                    <Select value={selectedBatchId} onValueChange={(val) => setSelectedBatchId(val || '')}>
                      <SelectTrigger className="w-full text-base sm:text-sm">
                        <SelectValue placeholder={batches.length > 0 ? "Select Batch" : "No active batches"}>
                          {batches.find(b => b.id === selectedBatchId)?.name || 'Select Batch'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        {batches.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          disabled={(date) => date > new Date() || (!!deadTimeBoundaryDate && date < deadTimeBoundaryDate)}
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
      
      {/* FEATURE: TRANSFER CUSTOMER (DISABLED) - UNCOMMENT TO RE-ENABLE
      customer && (
        <TransferCustomerModal
          isOpen={transferModalOpen}
          onOpenChange={setTransferModalOpen}
          customer={customer}
          onSuccess={() => {
            setTransferModalOpen(false);
            window.location.reload();
          }}
        />
      )
      */}

      {/* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-500 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Customer Record
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Are you sure you want to completely erase <strong>{customer?.name}</strong> from the system?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg my-2 border border-red-200 dark:border-red-900/50">
            <ul className="list-disc pl-4 space-y-2 text-sm text-red-800 dark:text-red-400 font-medium">
              <li>All payments will be voided and revenue reversed.</li>
              <li>All attendances will be voided and shakes fully refunded to the Junior Partner's inventory.</li>
              <li>The customer profile will be permanently deleted.</li>
            </ul>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400 text-sm font-medium">
            <p><strong>Time elapsed:</strong> {Math.floor((Date.now() - baseDate) / (1000 * 60 * 60 * 24))} days</p>
            <p><strong>Time remaining to delete:</strong> {Math.max(0, 30 - Math.floor((Date.now() - baseDate) / (1000 * 60 * 60 * 24)))} days</p>
            <p className="text-xs mt-1 opacity-80">After this time, you will not be able to delete this record.</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCustomer} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? 'Deleting...' : 'Yes, Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      */}
    </div>
  );
}
