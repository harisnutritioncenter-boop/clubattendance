"use client";

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { Customer } from '@/features/customers/types/customer.types';
import { PaymentLedgerEntry } from '@/features/ledger/types/ledger.types';
import { Building, Users, ChevronRightIcon, ChevronLeftIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface RevenueAnalyticsProps {
  currentMonth: number;
  currentYear: number;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  clubs: Record<string, string>;
  partners: Record<string, string>;
  role?: string | null;
  activeBranchId?: string | null;
  user?: any;
}

export function RevenueAnalytics({ 
  currentMonth, 
  currentYear, 
  onNextMonth, 
  onPrevMonth, 
  clubs, 
  partners, 
  role, 
  activeBranchId,
  user
}: RevenueAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<PaymentLedgerEntry[]>([]);
  
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

  // Reset drill-down when month changes
  useEffect(() => {
    if (role !== 'club_owner' && role !== 'junior_partner') setSelectedClubId(null);
    if (role !== 'junior_partner') setSelectedPartnerId(null);
  }, [currentMonth, currentYear, role]);

  // Auto-skip levels based on role
  useEffect(() => {
    if (role === 'club_owner' && activeBranchId) {
      setSelectedClubId(activeBranchId);
    } else if (role === 'junior_partner' && activeBranchId && user) {
      setSelectedClubId(activeBranchId);
      setSelectedPartnerId(user.uid);
    }
  }, [role, activeBranchId, user]);

  useEffect(() => {
    let isActive = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const branchIdToFetch = role === 'super_admin' ? null : (activeBranchId || 'default-branch');
        
        // Date boundaries for the selected month
        const startOfMonth = new Date(currentYear, currentMonth, 1).getTime();
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime();
        
        const [allCustomers, reports] = await Promise.all([
          CustomerService.getActiveCustomers(branchIdToFetch),
          LedgerService.getReportsData(branchIdToFetch, startOfMonth, endOfMonth)
        ]);
        
        if (isActive) {
          setCustomers(allCustomers);
          setPayments(reports.payments);
        }
      } catch (error) {
        console.error("Error fetching revenue data:", error);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchData();
    return () => { isActive = false; };
  }, [activeBranchId, role, user, currentMonth, currentYear]);

  const handleBack = () => {
    if (selectedPartnerId && role !== 'junior_partner') {
      setSelectedPartnerId(null);
    } else if (selectedClubId && role === 'super_admin') {
      setSelectedClubId(null);
    }
  };

  const getCustomerPartnerMap = () => {
    const map: Record<string, string> = {};
    customers.forEach(c => {
      map[c.id] = c.juniorPartnerId || c.createdBy || 'unassigned';
    });
    return map;
  };

  const renderClubLevel = () => {
    const clubTotals: Record<string, { totalRevenue: number, count: number }> = {};
    
    payments.forEach(p => {
      const bId = p.branchId || 'unknown';
      if (!clubTotals[bId]) clubTotals[bId] = { totalRevenue: 0, count: 0 };
      clubTotals[bId].totalRevenue += p.amount;
      clubTotals[bId].count += 1;
    });

    const sortedClubs = Object.entries(clubTotals).sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
    const totalOverallRevenue = sortedClubs.reduce((acc, [_, stats]) => acc + stats.totalRevenue, 0);

    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">Clubs Revenue</h2>
          <div className="text-right">
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total Revenue</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">₹{totalOverallRevenue.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {sortedClubs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No revenue recorded this month.</div>
        ) : (
          <div className="space-y-3">
            {sortedClubs.map(([bId, stats], index) => (
              <div 
                key={bId} 
                onClick={() => setSelectedClubId(bId)}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm gap-4 group"
              >
                <div className="flex items-center gap-4">
                  <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                  <div className="p-3 bg-primary/10 rounded-lg text-primary shrink-0">
                    <Building className="h-6 w-6" />
                  </div>
                  <div className="font-semibold text-lg text-foreground">{clubs[bId] || 'Unknown Club'}</div>
                </div>
                <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                  <div className="flex flex-col text-right mr-2">
                    <span className="text-[10px] sm:text-xs text-muted-foreground uppercase">{stats.count} Transactions</span>
                    <span className="font-bold text-lg text-green-600 dark:text-green-400">₹{stats.totalRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPartnerLevel = () => {
    if (!selectedClubId) return null;

    const customerPartnerMap = getCustomerPartnerMap();
    const partnerTotals: Record<string, { totalRevenue: number, count: number }> = {};
    
    payments.forEach(p => {
      if (p.branchId === selectedClubId) {
        const pId = customerPartnerMap[p.customerId] || p.createdBy || 'unassigned';
        if (!partnerTotals[pId]) partnerTotals[pId] = { totalRevenue: 0, count: 0 };
        partnerTotals[pId].totalRevenue += p.amount;
        partnerTotals[pId].count += 1;
      }
    });

    const sortedPartners = Object.entries(partnerTotals).sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
    const totalClubRevenue = sortedPartners.reduce((acc, [_, stats]) => acc + stats.totalRevenue, 0);

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            {role === 'super_admin' && (
              <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 shrink-0">
                <ChevronLeftIcon className="h-4 w-4" /> Back
              </Button>
            )}
            <h2 className="text-xl font-bold text-foreground">
              Partners Revenue
              {role === 'super_admin' && <span className="text-muted-foreground font-normal text-sm ml-2">({clubs[selectedClubId] || 'Unknown'})</span>}
            </h2>
          </div>
          <div className="text-right sm:self-end">
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total Revenue</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">₹{totalClubRevenue.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {sortedPartners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No revenue recorded this month.</div>
        ) : (
          <div className="space-y-3">
            {sortedPartners.map(([pId, stats], index) => (
              <div 
                key={pId} 
                onClick={() => setSelectedPartnerId(pId)}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm group gap-4"
              >
                <div className="flex items-center gap-4">
                  <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col">
                    {pId === 'unassigned' ? (
                      <span className="font-semibold text-lg text-foreground">Unassigned / Admin</span>
                    ) : partners[pId] ? (
                      <Link 
                        href={`/partners/${pId}`} 
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-lg hover:text-primary transition-colors hover:underline text-foreground relative z-10"
                      >
                        {partners[pId]}
                      </Link>
                    ) : (
                      <span className="font-semibold text-lg text-muted-foreground">Unknown Partner</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                  <div className="flex flex-col text-right mr-2">
                    <span className="text-[10px] sm:text-xs text-muted-foreground uppercase">{stats.count} Transactions</span>
                    <span className="font-bold text-lg text-green-600 dark:text-green-400">₹{stats.totalRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCustomerLevel = () => {
    if (!selectedClubId || !selectedPartnerId) return null;

    const customerPartnerMap = getCustomerPartnerMap();
    const customerTotals: Record<string, { totalRevenue: number, count: number, name: string, mobile: string }> = {};
    
    payments.forEach(p => {
      const pId = customerPartnerMap[p.customerId] || p.createdBy || 'unassigned';
      if (p.branchId === selectedClubId && pId === selectedPartnerId) {
        const cId = p.customerId;
        if (!customerTotals[cId]) {
          const cData = customers.find(c => c.id === cId);
          customerTotals[cId] = { 
            totalRevenue: 0, 
            count: 0, 
            name: cData ? cData.name : 'Unknown Customer',
            mobile: cData ? cData.mobile : ''
          };
        }
        customerTotals[cId].totalRevenue += p.amount;
        customerTotals[cId].count += 1;
      }
    });

    const sortedCustomers = Object.entries(customerTotals).sort((a, b) => b[1].totalRevenue - a[1].totalRevenue);
    const totalPartnerRevenue = sortedCustomers.reduce((acc, [_, stats]) => acc + stats.totalRevenue, 0);

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            {role !== 'junior_partner' && (
              <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 shrink-0">
                <ChevronLeftIcon className="h-4 w-4" /> Back
              </Button>
            )}
            <h2 className="text-xl font-bold text-foreground">
              Customer Revenue
              {role !== 'junior_partner' && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  ({selectedPartnerId === 'unassigned' ? 'Unassigned' : partners[selectedPartnerId] || 'Unknown'})
                </span>
              )}
            </h2>
          </div>
          <div className="text-right sm:self-end">
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total Revenue</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">₹{totalPartnerRevenue.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {sortedCustomers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No revenue recorded for these customers.</div>
        ) : (
          <div className="space-y-3">
            {sortedCustomers.map(([cId, stats], index) => (
              <div 
                key={cId} 
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all shadow-sm gap-4 group"
              >
                <div className="flex items-center gap-4">
                  <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                  <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
                    <User className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col">
                    {cId !== 'unknown' ? (
                      <Link href={`/customers/${cId}`} className="font-semibold text-lg hover:text-primary transition-colors hover:underline text-foreground">
                        {stats.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-lg text-muted-foreground">{stats.name}</span>
                    )}
                    <div className="text-sm text-muted-foreground">{stats.mobile}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                  <div className="flex flex-col text-right mr-2">
                    <span className="text-[10px] sm:text-xs text-muted-foreground uppercase">{stats.count} Transactions</span>
                    <span className="font-bold text-lg text-green-600 dark:text-green-400">₹{stats.totalRevenue.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  let viewLevel = 'club';
  if (selectedPartnerId) viewLevel = 'customer';
  else if (selectedClubId) viewLevel = 'partner';

  // Always show month changer per user request? Wait, they said:
  // "see on main default membership page the date or month swelector will be there but not on any fuer ther details"
  // That was for MEMBERSHIP. 
  // Let's just make sure the month changer is visible at the top of whatever their entry level is.
  // Wait, if it's only visible on "club", then Club Owners and Junior Partners will never see it!
  // I will just make it visible everywhere for Revenue, or if they prefer it hidden, I'll hide it.
  // The safest bet is to make it visible on the top level for THAT role:
  const isTopLevel = (role === 'super_admin' && viewLevel === 'club') ||
                     (role === 'club_owner' && viewLevel === 'partner') ||
                     (role === 'junior_partner' && viewLevel === 'customer') ||
                     (!role); // fallback

  return (
    <div className="w-full mt-4">
      {/* Month Changer */}
      {isTopLevel && (
        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4 mb-6">
          <div className="flex items-center justify-between bg-card p-1.5 rounded-2xl border shadow-sm self-stretch sm:self-auto sm:w-[320px]">
            <Button variant="ghost" size="icon" onClick={onPrevMonth} disabled={loading} className="rounded-xl text-foreground shrink-0">
              <ChevronLeftIcon className="h-5 w-5" />
            </Button>
            <div className="font-bold text-center flex flex-col items-center flex-1 px-2">
              <span className="text-base sm:text-lg leading-tight text-foreground">{monthName} {currentYear}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onNextMonth} disabled={loading} className="rounded-xl text-foreground shrink-0">
              <ChevronRightIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] rounded-xl bg-card border animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {viewLevel === 'club' && renderClubLevel()}
          {viewLevel === 'partner' && renderPartnerLevel()}
          {viewLevel === 'customer' && renderCustomerLevel()}
        </>
      )}
    </div>
  );
}
