"use client";

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { Customer } from '@/features/customers/types/customer.types';
import { Building, Users, ChevronRightIcon, ChevronLeftIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import { ContactActions } from '@/components/ui/contact-actions';

interface TrialsAnalyticsProps {
  currentMonth: number;
  currentYear: number;
  role: string | null;
  user: any;
  activeBranchId: string | null;
  clubs: Record<string, string>;
  partners: Record<string, string>;
  onDrillDownStateChange: (isDrilledDown: boolean) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function TrialsAnalytics({
  currentMonth,
  currentYear,
  role,
  user,
  activeBranchId,
  clubs,
  partners,
  onDrillDownStateChange,
  onPrevMonth,
  onNextMonth
}: TrialsAnalyticsProps) {
  const [trials, setTrials] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill down states
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const isDrilledDown = selectedClubId !== null || selectedPartnerId !== null;

  useEffect(() => {
    onDrillDownStateChange(isDrilledDown);
  }, [isDrilledDown, onDrillDownStateChange]);

  useEffect(() => {
    // Reset drill-down when month changes
    if (role !== 'club_owner' && role !== 'junior_partner') setSelectedClubId(null);
    if (role !== 'junior_partner') setSelectedPartnerId(null);
  }, [currentMonth, currentYear, role]);

  useEffect(() => {
    let isActive = true;
    const fetchTrials = async () => {
      setLoading(true);
      try {
        const branchIdToFetch = role === 'super_admin' ? null : (activeBranchId || 'default-branch');
        const allCustomers = await CustomerService.getActiveCustomers(branchIdToFetch);
        
        // Filter trials created in the selected month/year
        let filteredTrials = allCustomers.filter(c => {
          if (!c.isTrial && !c.wasTrial) return false;
          
          const createdAtDate = new Date(c.createdAt);
          return createdAtDate.getMonth() === currentMonth && createdAtDate.getFullYear() === currentYear;
        });

        // If junior partner, filter to ONLY show their trials
        if (role === 'junior_partner' && user) {
          filteredTrials = filteredTrials.filter(c => c.juniorPartnerId === user.uid || c.createdBy === user.uid);
        }

        if (isActive) {
          setTrials(filteredTrials);
        }
      } catch (error) {
        console.error("Error fetching trials:", error);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchTrials();
    return () => { isActive = false; };
  }, [currentMonth, currentYear, activeBranchId, role, user]);

  const handleBack = () => {
    if (selectedPartnerId && role !== 'junior_partner') {
      setSelectedPartnerId(null);
    } else if (selectedClubId && role === 'super_admin') {
      setSelectedClubId(null);
    } else {
      // Top level
    }
  };

  // Auto-skip levels based on role
  useEffect(() => {
    if (role === 'club_owner' && activeBranchId) {
      setSelectedClubId(activeBranchId);
    } else if (role === 'junior_partner' && activeBranchId && user) {
      setSelectedClubId(activeBranchId);
      setSelectedPartnerId(user.uid);
    }
  }, [role, activeBranchId, user]);

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

  const renderClubLevel = () => {
    // Aggregate by club
    const clubTotals: Record<string, { total: number, notConverted: number }> = {};
    trials.forEach(c => {
      const bId = c.branchId || 'unknown';
      if (!clubTotals[bId]) clubTotals[bId] = { total: 0, notConverted: 0 };
      clubTotals[bId].total += 1;
      if (c.isTrial) clubTotals[bId].notConverted += 1;
    });

    const sortedClubs = Object.entries(clubTotals).sort((a, b) => b[1].total - a[1].total);

    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-foreground">Trials by Club ({monthName} {currentYear})</h2>
        </div>
        {sortedClubs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No trials created in this month.</div>
        ) : (
          sortedClubs.map(([bId, stats], index) => (
            <div 
              key={bId} 
              onClick={() => setSelectedClubId(bId)}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm gap-4"
            >
              <div className="flex items-center gap-4">
                <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                <div className="p-3 bg-primary/10 rounded-lg text-primary">
                  <Building className="h-6 w-6" />
                </div>
                <div className="font-semibold text-lg text-foreground">{clubs[bId] || 'Unknown Club'}</div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-primary/5">{stats.total} Total</Badge>
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-red-500/10 text-red-600">{stats.notConverted} Not Converted</Badge>
                <ChevronRightIcon className="h-5 w-5 text-muted-foreground hidden sm:block" />
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderPartnerLevel = () => {
    // Filter to selected club
    const clubTrials = trials.filter(c => c.branchId === selectedClubId);
    
    // Aggregate by partner
    const partnerTotals: Record<string, { total: number, notConverted: number }> = {};
    clubTrials.forEach(c => {
      const pId = c.juniorPartnerId || c.createdBy || 'unassigned';
      if (!partnerTotals[pId]) partnerTotals[pId] = { total: 0, notConverted: 0 };
      partnerTotals[pId].total += 1;
      if (c.isTrial) partnerTotals[pId].notConverted += 1;
    });

    const sortedPartners = Object.entries(partnerTotals).sort((a, b) => b[1].total - a[1].total);

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-4 mb-6">
          {role === 'super_admin' && (
            <Button variant="outline" size="icon" onClick={handleBack} className="shrink-0 rounded-full h-10 w-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-foreground">Partners Overview</h2>
            <span className="text-sm text-muted-foreground font-medium">{clubs[selectedClubId || ''] || 'Unknown Club'} • {monthName} {currentYear}</span>
          </div>
        </div>

        {sortedPartners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No trials found for this club in this month.</div>
        ) : (
          sortedPartners.map(([pId, stats], index) => (
            <div 
              key={pId} 
              onClick={() => setSelectedPartnerId(pId)}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm group gap-4"
            >
              <div className="flex items-center gap-4">
                <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                <div className="p-3 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                  {pId === 'unassigned' ? (
                    <span className="font-semibold text-lg text-foreground">Unassigned / Admin</span>
                  ) : partners[pId] ? (
                    <Link href={`/partners/${pId}`} className="font-semibold text-lg hover:text-primary transition-colors hover:underline text-foreground">
                      {partners[pId]}
                    </Link>
                  ) : (
                    <span className="font-semibold text-lg text-muted-foreground">Unknown Partner</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto">
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-primary/5">{stats.total} Total</Badge>
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-red-500/10 text-red-600">{stats.notConverted} Not Converted</Badge>
                <ChevronRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary hidden sm:block" />
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderCustomerLevel = () => {
    // Filter to selected club and selected partner
    const clubTrials = trials.filter(c => c.branchId === selectedClubId);
    const partnerTrials = clubTrials.filter(c => {
      const pId = c.juniorPartnerId || c.createdBy || 'unassigned';
      return pId === selectedPartnerId;
    });

    const converted = partnerTrials.filter(c => !c.isTrial);
    const notConverted = partnerTrials.filter(c => c.isTrial);

    const renderTable = (list: Customer[], title: string, isConverted: boolean) => (
      <div className="bg-card rounded-xl border overflow-hidden shadow-sm h-fit">
        <div className={`p-4 font-bold text-lg border-b ${isConverted ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'}`}>
          {title} ({list.length})
        </div>
        {list.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No customers found.</div>
        ) : (
          <div className="divide-y">
            {list.map((c, index) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-muted/30 transition-colors gap-3">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-muted-foreground w-4 text-right shrink-0">{index + 1}.</span>
                  <div className="flex flex-col">
                    <Link href={`/customers/${c.id}`} className="font-semibold text-base hover:text-primary transition-colors hover:underline text-foreground">
                      {c.name || 'Unknown'}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5">Created: {formatDateTime(c.createdAt).split(' ')[0]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto ml-8 sm:ml-0">
                  <span className="text-sm text-muted-foreground">{c.mobile}</span>
                  <ContactActions mobile={c.mobile} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-4 mb-2">
          {role !== 'junior_partner' && (
            <Button variant="outline" size="icon" onClick={handleBack} className="shrink-0 rounded-full h-10 w-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-foreground">Trials Records</h2>
            <span className="text-sm text-muted-foreground font-medium">
              {partners[selectedPartnerId || ''] || 'Unassigned'} • {clubs[selectedClubId || ''] || 'Unknown Club'} • {monthName} {currentYear}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderTable(notConverted, "Not Converted Trials", false)}
          {renderTable(converted, "Converted Trials", true)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="animate-pulse">Loading trials data...</p>
      </div>
    );
  }

  // View routing
  const viewLevel = selectedPartnerId ? 'customer' : (selectedClubId ? 'partner' : 'club');

  return (
    <div className="w-full mt-4">
      <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4 mb-6">
        <div className="flex items-center justify-between bg-card p-1.5 rounded-2xl border shadow-sm self-stretch sm:self-auto sm:w-[320px]">
          <Button variant="ghost" size="icon" onClick={onPrevMonth} disabled={loading} className="rounded-xl text-foreground shrink-0"><ChevronLeftIcon className="h-5 w-5" /></Button>
          <div className="font-bold text-center flex flex-col items-center flex-1 px-2">
            <span className="text-base sm:text-lg leading-tight text-foreground">{monthName} {currentYear}</span>
            <span className="text-xs text-muted-foreground font-semibold tracking-wider">
              {trials.length} TRIAL{trials.length !== 1 ? 'S' : ''} TOTAL
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onNextMonth} disabled={loading} className="rounded-xl text-foreground shrink-0"><ChevronRightIcon className="h-5 w-5" /></Button>
        </div>
      </div>

      {viewLevel === 'club' && renderClubLevel()}
      {viewLevel === 'partner' && renderPartnerLevel()}
      {viewLevel === 'customer' && renderCustomerLevel()}
    </div>
  );
}
