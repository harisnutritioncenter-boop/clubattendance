'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, BarChart, Users, Building, ChevronRightIcon, Activity, ArrowLeft, Trash2 } from 'lucide-react';
import { useAuthStore, useBranchStore } from '@/store';
import { useAnalyticsUrlState } from '@/hooks/useAnalyticsUrlState';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { ShakeLedgerEntry } from '@/features/ledger/types/ledger.types';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, CreditCard } from 'lucide-react';
import { TrialsAnalytics } from './components/trials-analytics';
import { MembershipAnalytics } from './components/membership-analytics';
import { RevenueAnalytics } from './components/revenue-analytics';
import { toast } from 'sonner';

const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function AnalyticsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDateStr = searchParams.get('date');
  
  const role = useAuthStore((state) => state.role);
  const user = useAuthStore((state) => state.user);
  const activeBranchId = useBranchStore((state) => state.activeBranchId);
  
  const { 
    currentMonth, currentYear, activeTab, 
    setMonthYear, setActiveTab, clubViewMode, setClubViewMode,
    selectedClubId, selectedPartnerId, selectedPlanId, updateUrl
  } = useAnalyticsUrlState();

  const isGlobalDrilledDown = selectedDateStr || 
    (role === 'super_admin' ? (selectedClubId !== null || selectedPartnerId !== null || selectedPlanId !== null) :
     role === 'club_owner' ? (selectedPartnerId !== null) :
     false);
  
  const [consumptions, setConsumptions] = useState<ShakeLedgerEntry[]>([]);
  const [upgradedPartnerDetails, setUpgradedPartnerDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Mappings
  const [clubs, setClubs] = useState<Record<string, string>>({});
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<Record<string, {name: string, assignedTo: string, branchId: string}>>({});

  useEffect(() => {
    if (role) {
      fetchMappings();
    }
  }, [role, activeBranchId]);

  useEffect(() => {
    fetchData();
  }, [currentMonth, currentYear, activeBranchId, role, user]);

  const fetchMappings = async () => {
    // 1. Fetch Branches
    try {
      const branchesSnap = await getDocs(COLLECTIONS.BRANCHES);
      const clubsMap: Record<string, string> = {};
      branchesSnap.docs.forEach(d => { clubsMap[d.id] = d.data().name; });
      setClubs(clubsMap);
    } catch (error) {
      console.error("Error fetching branches:", error);
    }

    // 2. Fetch Users (Partners)
    try {
      const usersSnap = await getDocs(COLLECTIONS.USERS);
      const partnersMap: Record<string, string> = {};
      usersSnap.docs.forEach(d => { partnersMap[d.id] = d.data().name || d.data().email || d.id; });
      setPartners(partnersMap);
    } catch (error) {
      console.error("Error fetching users:", error);
    }

    // 3. Fetch Customers based on role
    try {
      const branchIdToFetch = role === 'super_admin' ? null : (activeBranchId || 'default-branch');
      const customersSnap = await CustomerService.getActiveCustomers(branchIdToFetch, false, true);
      const custMap: Record<string, {name: string, assignedTo: string, branchId: string}> = {};
      customersSnap.forEach(c => { 
        custMap[c.id] = { 
          name: c.name, 
          assignedTo: c.juniorPartnerId || c.createdBy || '',
          branchId: c.branchId || ''
        }; 
      });
      setCustomers(custMap);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = new Date(currentYear, currentMonth, 1).getTime();
      const endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime();

      // For super admin and junior partner, we pass null to fetch all branches. Others use their activeBranchId
      const branchIdToFetch = (role === 'super_admin' || role === 'junior_partner') ? null : (activeBranchId || 'default-branch');
      
      const { consumptions: allMonthConsumptions, upgradedPartnerDetails: fetchedDetails } = await LedgerService.getReportsData(branchIdToFetch, startDate, endDate);
      setUpgradedPartnerDetails(fetchedDetails || []);
      
      let filteredConsumptions = allMonthConsumptions.filter((c: any) => !c.isTransfer);

      // If junior partner, filter to ONLY show consumptions explicitly stamped for this JP
      if (role === 'junior_partner' && user) {
        filteredConsumptions = filteredConsumptions.filter((c: any) => 
          c.juniorPartnerId === user.uid || (!c.juniorPartnerId && c.createdBy === user.uid)
        );
      }

      setConsumptions(filteredConsumptions);
    } catch (error) {
      console.error("Error fetching consumptions:", error);
    } finally {
      setLoading(false);
    }
  };

  const prevMonth = () => {
    let m = currentMonth - 1;
    let y = currentYear;
    if (m === -1) { m = 11; y = currentYear - 1; }
    
    updateUrl({ 
      month: m.toString(), 
      year: y.toString(), 
      ...(selectedDateStr ? { date: null } : {}) 
    });
  };

  const nextMonth = () => {
    let m = currentMonth + 1;
    let y = currentYear;
    if (m === 12) { m = 0; y = currentYear + 1; }
    
    updateUrl({ 
      month: m.toString(), 
      year: y.toString(), 
      ...(selectedDateStr ? { date: null } : {}) 
    });
  };

  const handleRevert = async (e: React.MouseEvent, c: ShakeLedgerEntry) => {
    e.stopPropagation();
    if (role === 'junior_partner') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (c.createdAt < sevenDaysAgo) {
        toast.error('Junior Partners can only revert consumptions within 7 days.');
        return;
      }
    }

    if (!confirm('Are you sure you want to revert this shake consumption? This will refund the shake.')) return;

    try {
      await LedgerService.voidConsumption(c.id, user?.uid || 'system');
      toast.success('Consumption reverted successfully');
      setConsumptions(prev => prev.filter(l => l.id !== c.id));
    } catch (error: any) {
      toast.error('Failed to revert consumption: ' + error.message);
    }
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const totalMonthShakes = consumptions.reduce((sum, c) => ((role === 'super_admin' || role === 'junior_partner') && (c as any).isHistoricalCopy) ? sum : sum + (c.shakesDeducted || 1), 0);

  // Helper to get consumptions for a specific day
  const getConsumptionsForDay = (dayOrDateStr: number | string) => {
    return consumptions.filter(c => {
      const cDate = new Date(c.createdAt);
      if (typeof dayOrDateStr === 'number') {
        return cDate.getDate() === dayOrDateStr && cDate.getMonth() === currentMonth && cDate.getFullYear() === currentYear;
      } else {
        const targetDate = new Date(dayOrDateStr);
        return cDate.getDate() === targetDate.getDate() && cDate.getMonth() === targetDate.getMonth() && cDate.getFullYear() === targetDate.getFullYear();
      }
    }).map(c => {
      // Fix bad historical data on the fly
      let bId = c.branchId;
      if (bId === 'orphan-historical') {
         bId = 'unknown'; // intercept
      } else if (!bId || bId === 'default-branch' || (Object.keys(clubs).length > 0 && !clubs[bId])) {
         bId = customers[c.customerId]?.branchId || bId;
      }
      let pId = c.juniorPartnerId;
      if (!pId || (Object.keys(partners).length > 0 && !partners[pId])) {
         pId = customers[c.customerId]?.assignedTo || pId;
      }
      return { ...c, branchId: bId, juniorPartnerId: pId };
    });
  };

  const handleDayClick = (day: number) => {
    const dayConsumptions = getConsumptionsForDay(day);
    if (dayConsumptions.length === 0) return; // Don't drill down if empty

    // format date as YYYY-MM-DD
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (role === 'super_admin') {
      router.push(`/analytics?date=${dateStr}`);
    } else if (role === 'club_owner') {
      router.push(`/analytics?date=${dateStr}&clubId=${activeBranchId}`);
    } else {
      router.push(`/analytics?date=${dateStr}&clubId=${activeBranchId}&partnerId=${user?.uid}`);
    }
  };

  const getBackUrl = () => {
    if (selectedPartnerId && role !== 'junior_partner') {
       return `/analytics?date=${selectedDateStr}&clubId=${selectedClubId}`;
    }
    if (selectedClubId && role === 'super_admin') {
       return `/analytics?date=${selectedDateStr}`;
    }
    return `/analytics`;
  };


  // --- Drill Down Rendering Logic ---
  
  const renderClubLevel = (dayConsumptions: ShakeLedgerEntry[]) => {
    // Aggregate by club and keep track of batches
    const clubTotals: Record<string, { total: number, batches: Record<string, number> }> = {};
    Object.keys(clubs).forEach(bId => {
      clubTotals[bId] = { total: 0, batches: {} };
    });
    dayConsumptions.forEach(c => {
      const bId = c.branchId || 'unknown';
      if (!clubTotals[bId]) clubTotals[bId] = { total: 0, batches: {} };
      
      if (role === 'super_admin' && (c as any).isHistoricalCopy) return; // DON'T count in club totals for super_admin
      
      const shakes = c.shakesDeducted || 1;
      clubTotals[bId].total += shakes;
      
      const batchName = c.batchName || 'No Batch';
      clubTotals[bId].batches[batchName] = (clubTotals[bId].batches[batchName] || 0) + shakes;
    });

    const sortedClubs = Object.entries(clubTotals).sort((a, b) => b[1].total - a[1].total);

    return (
      <div className="space-y-3 mt-6 animate-in slide-in-from-right-4 duration-300">
        <h2 className="text-xl font-bold mb-4 text-foreground">Clubs Overview</h2>
        {sortedClubs.map(([bId, data], index) => (
            <div 
              key={bId} 
              onClick={() => router.push(`/analytics?date=${selectedDateStr}&clubId=${bId}`)}
              className="flex items-center justify-between p-3 sm:p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm gap-2 sm:gap-4"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <span className="font-bold text-muted-foreground w-4 sm:w-5 text-right shrink-0 text-sm sm:text-base">{index + 1}.</span>
                <div className="p-2.5 bg-primary/10 rounded-lg text-primary shrink-0 hidden sm:block">
                  <Building className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="font-semibold text-base sm:text-lg text-foreground truncate leading-tight">{clubs[bId] || 'Unknown Club'}</span>
                  {Object.keys(data.batches).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Object.entries(data.batches)
                        .sort((a, b) => b[1] - a[1])
                        .map(([batchName, count]) => (
                          <Badge key={batchName} variant="outline" className="text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/30 px-1.5 py-0 whitespace-nowrap">
                            {batchName}: {count}
                          </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-sm sm:text-base px-2 py-1 bg-primary/5 whitespace-nowrap">
                  {data.total} <span className="hidden sm:inline ml-1">Attendances</span>
                </Badge>
                <ChevronRightIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </div>
            </div>
        ))}
      </div>
    );
  };

  const renderPartnerLevel = (dayConsumptions: ShakeLedgerEntry[]) => {
    // Filter to selected club
    const clubConsumptions = dayConsumptions.filter(c => c.branchId === selectedClubId);
    
    // Aggregate by partner. We use the customer's assigned partner if available, fallback to the person who marked it.
    const partnerData: Record<string, { total: number, batches: Record<string, number> }> = {};
    clubConsumptions.forEach(c => {
      const pId = c.juniorPartnerId || customers[c.customerId]?.assignedTo || c.createdBy || 'unassigned';
      if (!partnerData[pId]) partnerData[pId] = { total: 0, batches: {} };
      
      const shakes = c.shakesDeducted || 1;
      partnerData[pId].total += shakes;
      
      if (c.batchName) {
        partnerData[pId].batches[c.batchName] = (partnerData[pId].batches[c.batchName] || 0) + shakes;
      }
    });

    const sortedPartners = Object.entries(partnerData).sort((a, b) => b[1].total - a[1].total);

    // Group by Batch for the "customer" view mode
    const batchesMap: Record<string, ShakeLedgerEntry[]> = {};
    clubConsumptions.forEach(c => {
      const batchName = c.batchName || 'No Batch';
      if (!batchesMap[batchName]) batchesMap[batchName] = [];
      batchesMap[batchName].push(c);
    });
    const sortedBatches = Object.keys(batchesMap).sort();

    return (
      <div className="space-y-6 mt-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">
            {role === 'club_owner' ? 'Partners Overview' : 'Club Overview'} {role === 'super_admin' && <span className="text-muted-foreground font-normal text-sm ml-2">({clubs[selectedClubId || ''] || 'Unknown Club'})</span>}
          </h2>
          
          <div className="flex bg-muted/50 p-1 rounded-lg border shadow-sm">
            <button 
              onClick={() => setClubViewMode('partner')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${clubViewMode === 'partner' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              By Partner
            </button>
            <button 
              onClick={() => setClubViewMode('customer')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${clubViewMode === 'customer' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              By Customer
            </button>
          </div>
        </div>

        {clubViewMode === 'partner' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sortedPartners.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No attendances found for this club.</div>
            ) : (
              sortedPartners.map(([pId, data], index) => (
                <div 
                  key={pId} 
                  onClick={() => router.push(`/analytics?date=${selectedDateStr}&clubId=${selectedClubId}&partnerId=${pId}`)}
                  className="flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm group gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-bold text-muted-foreground w-4 shrink-0 mt-0.5 text-sm sm:text-base">{index + 1}.</span>
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      {pId === 'unassigned' ? (
                        <span className="font-semibold text-base sm:text-lg text-foreground line-clamp-2 leading-tight">Unassigned / Admin</span>
                      ) : partners[pId] ? (
                        <Link 
                          href={`/partners/${pId}`} 
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-base sm:text-lg hover:text-primary transition-colors hover:underline text-foreground relative z-10 line-clamp-2 leading-tight"
                        >
                          {partners[pId]}
                        </Link>
                      ) : (
                        <span className="font-semibold text-base sm:text-lg text-muted-foreground line-clamp-2 leading-tight">Unknown Partner</span>
                      )}
                      
                      {Object.keys(data.batches).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {Object.entries(data.batches)
                            .sort((a, b) => b[1] - a[1])
                            .map(([batchName, count]) => (
                              <Badge key={batchName} variant="outline" className="text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted/30 px-1.5 py-0 whitespace-nowrap">
                                {batchName}: {count}
                              </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end flex-wrap gap-2 shrink-0 mt-1">
                    <Badge variant="secondary" className="text-sm sm:text-base px-2 py-0.5 bg-primary/5 whitespace-nowrap">{data.total} Shakes</Badge>
                    <ChevronRightIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sortedBatches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No customer records found.</div>
            ) : (
              sortedBatches.map(batchName => (
                <div key={batchName} className="space-y-3 bg-card p-4 rounded-xl border shadow-sm">
                  <div className="flex items-center justify-between border-b pb-2 mb-3">
                    <h3 className="font-bold text-lg text-primary">{batchName}</h3>
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {batchesMap[batchName].reduce((sum, c) => sum + (c.shakesDeducted || 1), 0)} Total
                    </Badge>
                  </div>
                  {batchesMap[batchName].map((c, index) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-transparent hover:border-border transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                        <div className="flex flex-col">
                          {customers[c.customerId] ? (
                            <Link href={`/customers/${c.customerId}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                              {c.consumedBy || customers[c.customerId]?.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-foreground">{c.consumedBy || 'Unknown'}</span>
                          )}
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {customers[c.customerId]?.assignedTo && (
                                <span className="ml-2 pl-2 border-l">Partner: {partners[customers[c.customerId].assignedTo] || 'Unknown'}</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{c.shakesDeducted || 1} {c.shakesDeducted === 1 ? 'Shake' : 'Shakes'}</Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100 transition-opacity" onClick={(e) => handleRevert(e, c)} title="Revert Consumption">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCustomerLevel = (dayConsumptions: ShakeLedgerEntry[]) => {
    // Filter to selected club and selected partner
    const clubConsumptions = role === 'junior_partner' ? dayConsumptions.filter(c => !(c as any).isHistoricalCopy) : dayConsumptions.filter(c => c.branchId === selectedClubId);
    const partnerConsumptions = clubConsumptions.filter(c => {
      const pId = c.juniorPartnerId || customers[c.customerId]?.assignedTo || c.createdBy || 'unassigned';
      return pId === selectedPartnerId;
    });

    return (
      <div className="mt-6 animate-in slide-in-from-right-4 duration-300">
        <h2 className="text-xl font-bold mb-4 text-foreground">Customer Records {role !== 'junior_partner' && <span className="text-muted-foreground font-normal text-sm ml-2">({partners[selectedPartnerId || ''] || 'Unassigned'})</span>}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {partnerConsumptions.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No customer records found.</div>
          ) : (
            partnerConsumptions.map((c, index) => (
              <div key={c.id} className="flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border bg-card shadow-sm gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="font-bold text-muted-foreground w-4 shrink-0 mt-0.5 text-sm sm:text-base">{index + 1}.</span>
                  <div className="flex flex-col min-w-0">
                    {customers[c.customerId] ? (
                      <Link href={`/customers/${c.customerId}`} className="font-semibold text-base sm:text-lg hover:text-primary transition-colors hover:underline text-foreground line-clamp-2 leading-tight">
                        {c.consumedBy || customers[c.customerId]?.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-base sm:text-lg text-muted-foreground line-clamp-2 leading-tight">
                        {c.consumedBy || 'Unknown Customer'}
                      </span>
                    )}
                    <div className="text-sm text-muted-foreground mt-1 font-medium flex items-center flex-wrap gap-2">
                      {(c as any).isHistoricalCopy && (
                        <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800 hover:bg-blue-200 px-1.5 py-0 whitespace-nowrap">
                          Junior Partner (Historical)
                        </Badge>
                      )}
                      <span>Marked at {formatDateTime(c.createdAt).split(' ')[1] || 'Unknown Time'}</span>
                      {c.batchName && (
                        <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground bg-muted/30 px-1.5 py-0 whitespace-nowrap">
                          {c.batchName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                  <div className="flex items-center justify-end flex-wrap gap-2 shrink-0 mt-1">
                    <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20 px-3 py-0.5 text-sm sm:text-base">
                      +{c.shakesDeducted || 1}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100 transition-opacity ml-1" onClick={(e) => handleRevert(e, c)} title="Revert Consumption">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderDrillDown = () => {
    if (!selectedDateStr) return null;
    const dayConsumptions = getConsumptionsForDay(selectedDateStr);
    
    // Determine which view to render based on URL params
    const viewLevel = selectedPartnerId ? 'customer' : (selectedClubId ? 'partner' : 'club');
    
    const formattedDate = new Date(selectedDateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
      <div className="animate-in fade-in zoom-in-95 duration-300 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="icon" onClick={() => router.push(getBackUrl())} className="rounded-xl h-12 w-12 shrink-0 shadow-sm hover:bg-primary hover:text-primary-foreground transition-colors border-primary/20 bg-background text-foreground">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
              {formattedDate}
            </h1>
            <CardDescription className="text-base font-medium mt-1">
              Attendance Breakdown
            </CardDescription>
          </div>
        </div>
        
        {viewLevel === 'club' && renderClubLevel(dayConsumptions)}
        {viewLevel === 'partner' && renderPartnerLevel(dayConsumptions)}
        {viewLevel === 'customer' && renderCustomerLevel(dayConsumptions)}
      </div>
    );
  };



  return (
    <div className="p-4 sm:p-6 pb-24 md:pb-6 max-w-6xl mx-auto min-h-screen">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className={`w-full overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent mb-4 sm:mb-6 ${isGlobalDrilledDown ? 'hidden' : 'block'}`}>
          <TabsList className="inline-flex w-max min-w-full h-11 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="attendance" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><CalendarDays className="h-4 w-4" /> Attendance</TabsTrigger>
            <TabsTrigger value="trials" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><Activity className="h-4 w-4" /> Trials</TabsTrigger>
            <TabsTrigger value="membership" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><Users className="h-4 w-4" /> Membership</TabsTrigger>
            <TabsTrigger value="revenue" className="gap-2 px-4 whitespace-nowrap text-xs sm:text-sm"><CreditCard className="h-4 w-4" /> Revenue</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="attendance" className="mt-0">
          {!selectedDateStr ? (
            // Calendar View
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4">
            
            <div className="flex items-center justify-between bg-card p-1.5 rounded-2xl border shadow-sm self-stretch sm:self-auto sm:w-[320px]">
              <Button variant="ghost" size="icon" onClick={prevMonth} disabled={loading} className="rounded-xl text-foreground shrink-0"><ChevronLeft className="h-5 w-5" /></Button>
              <div className="font-bold text-center flex flex-col items-center flex-1 px-2">
                <span className="text-base sm:text-lg leading-tight text-foreground">{monthNames[currentMonth]} {currentYear}</span>
                <span className="text-xs text-muted-foreground font-semibold tracking-wider">
                  {totalMonthShakes} SHAKE{totalMonthShakes !== 1 ? 'S' : ''} TOTAL
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={nextMonth} disabled={loading} className="rounded-xl text-foreground shrink-0"><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded-2xl overflow-hidden border shadow-sm mt-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-muted/50 p-3 sm:p-4 text-center font-bold text-xs sm:text-sm text-muted-foreground uppercase tracking-widest border-b">
                <span className="sm:hidden">{day.substring(0, 3)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
            
            {/* Empty cells for start of month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-card min-h-[100px] sm:min-h-[140px] p-2 opacity-30" />
            ))}
            
            {/* Actual days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayConsumptions = getConsumptionsForDay(day);
              const totalShakes = dayConsumptions.reduce((sum, c) => ((role === 'super_admin' || role === 'junior_partner') && (c as any).isHistoricalCopy) ? sum : sum + (c.shakesDeducted || 1), 0);
              const hasAttendance = totalShakes > 0;
              const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, day).toDateString();

              return (
                <div 
                  key={day} 
                  onClick={() => handleDayClick(day)}
                  className={`bg-card min-h-[100px] sm:min-h-[140px] p-2 sm:p-3 flex flex-col relative transition-all overflow-hidden group ${
                    hasAttendance ? 'cursor-pointer hover:bg-primary/5 active:bg-primary/10 hover:shadow-inner' : ''
                  } ${isToday ? 'ring-2 ring-primary ring-inset z-10' : ''}`}
                >
                  <div className="flex justify-between items-start z-10">
                    <span className={`font-semibold text-sm sm:text-base rounded-full w-7 h-7 flex items-center justify-center transition-colors ${isToday ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground group-hover:text-primary'}`}>
                      {day}
                    </span>
                  </div>
                  
                  {hasAttendance && (
                    <div className="flex-1 flex flex-col items-center justify-center mt-1 pointer-events-none group-hover:scale-110 transition-transform duration-300 origin-bottom">
                      <span className="text-xl sm:text-2xl font-black text-primary drop-shadow-sm leading-none">{totalShakes}</span>
                      <span className="text-[8px] sm:text-[10px] font-bold text-primary/70 uppercase tracking-widest mt-1">Shakes</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Full Page Drill Down View
        renderDrillDown()
          )}
        </TabsContent>

        <TabsContent value="trials" className="mt-0">
          <TrialsAnalytics 
            currentMonth={currentMonth}
            currentYear={currentYear}
            role={role}
            user={user}
            activeBranchId={activeBranchId}
            clubs={clubs}
            partners={partners}
            upgradedPartnerDetails={upgradedPartnerDetails}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </TabsContent>

        <TabsContent value="membership" className="mt-0">
          <MembershipAnalytics 
            currentMonth={currentMonth}
            currentYear={currentYear}
            role={role}
            user={user}
            activeBranchId={activeBranchId}
            clubs={clubs}
            partners={partners}
            upgradedPartnerDetails={upgradedPartnerDetails}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </TabsContent>

        <TabsContent value="revenue" className="mt-0">
          <RevenueAnalytics 
            currentMonth={currentMonth}
            currentYear={currentYear}
            role={role}
            user={user}
            activeBranchId={activeBranchId}
            clubs={clubs}
            partners={partners}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading analytics...</div>}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
