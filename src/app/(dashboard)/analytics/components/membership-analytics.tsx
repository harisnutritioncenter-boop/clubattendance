"use client";

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { MembershipService } from '@/features/memberships/services/membership.service';
import { Customer } from '@/features/customers/types/customer.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { MembershipPlan } from '@/features/memberships/types/membership.types';
import { Building, Users, ChevronRightIcon, CreditCard, ChevronLeftIcon, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAnalyticsUrlState } from '@/hooks/useAnalyticsUrlState';

type AugmentedCustomer = Customer & { 
  membershipStatus?: CustomerMembershipStatus & { planAssignedAt?: number };
};

interface MembershipAnalyticsProps {
  currentMonth: number;
  currentYear: number;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  activeBranchId?: string | null;
  user?: any;
  upgradedPartnerDetails?: any[];
  clubs: Record<string, string>;
  partners: Record<string, string>;
  role?: string | null;
}

export function MembershipAnalytics({ 
  currentMonth, 
  currentYear, 
  onNextMonth, 
  onPrevMonth, 
  clubs, 
  partners, 
  role, 
  activeBranchId,
  user,
  upgradedPartnerDetails = []
}: MembershipAnalyticsProps) {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [customers, setCustomers] = useState<AugmentedCustomer[]>([]);
  
  const { selectedPlanId, setSelectedPlanId, selectedClubId, setSelectedClubId, selectedPartnerId, setSelectedPartnerId } = useAnalyticsUrlState();

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });



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
        
        const [fetchedPlans, allCustomers] = await Promise.all([
          MembershipService.getActivePlans(),
          CustomerService.getActiveCustomers(branchIdToFetch)
        ]);

        const balancePromises = allCustomers.map(async (c) => {
          try {
            const bal = await LedgerService.getCustomerBalance(c.id);
            return { id: c.id, bal };
          } catch {
            return { id: c.id, bal: null };
          }
        });
        
        const balancesArray = await Promise.all(balancePromises);
        const balances: Record<string, any> = {};
        balancesArray.forEach(item => {
          if (item.bal) balances[item.id] = item.bal;
        });
        
        let validCustomers: AugmentedCustomer[] = allCustomers.map(c => ({
          ...c,
          membershipStatus: balances[c.id]
        }));

        // If junior partner, filter to ONLY show their customers
        if (role === 'junior_partner' && user) {
          validCustomers = validCustomers.filter(c => c.juniorPartnerId === user.uid || c.createdBy === user.uid);
        } else if (role === 'super_admin' && upgradedPartnerDetails.length > 0) {
          // Apply historical duality for Super Admins
          const historicalCustomers: AugmentedCustomer[] = [];
          validCustomers.forEach(c => {
             const partnerDetail = upgradedPartnerDetails.find(p => p.id === (c.juniorPartnerId || c.createdBy));
             if (partnerDetail && c.createdAt < partnerDetail.upgradedAt) {
                c.branchId = partnerDetail.oldClubId || 'orphan-historical';
                historicalCustomers.push({ ...c, id: `${c.id}_copy`, branchId: partnerDetail.newClubId, isHistoricalCopy: true } as any);
             }
          });
          validCustomers = [...validCustomers, ...historicalCustomers];
        }

        if (isActive) {
          setPlans(fetchedPlans);
          setCustomers(validCustomers);
        }
      } catch (error) {
        console.error("Error fetching memberships:", error);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    fetchData();
    return () => { isActive = false; };
  }, [activeBranchId, role, user]);

  const handleBack = () => {
    if (selectedPartnerId && role !== 'junior_partner') {
      setSelectedPartnerId(null);
    } else if (selectedClubId && role === 'super_admin') {
      setSelectedClubId(null);
    } else if (selectedPlanId) {
      setSelectedPlanId(null);
    }
  };

  const getPlanStats = (planName: string, filterByClub?: string, filterByPartner?: string) => {
    let relevantCustomers = customers.filter(c => c.membershipStatus && !c.membershipStatus.isExpired && c.membershipStatus.latestPlanName === planName);
    
    if (filterByClub) {
      relevantCustomers = relevantCustomers.filter(c => c.branchId === filterByClub);
    }
    
    if (filterByPartner) {
      relevantCustomers = relevantCustomers.filter(c => 
        (c.juniorPartnerId === filterByPartner) || 
        (!c.juniorPartnerId && c.createdBy === filterByPartner) ||
        (filterByPartner === 'unassigned' && !c.juniorPartnerId && !c.createdBy)
      );
    }

    const totalActive = relevantCustomers.length;
    
    const newThisMonth = relevantCustomers.filter(c => {
      if (!c.membershipStatus?.planAssignedAt) return false;
      const date = new Date(c.membershipStatus.planAssignedAt);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    return { totalActive, newThisMonth, customers: relevantCustomers };
  };

  const renderPlanLevel = () => {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <h2 className="text-xl font-bold text-foreground">Membership Plans</h2>
        
        {plans.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No membership plans found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map((plan) => {
              const stats = getPlanStats(plan.name);
              return (
                <div 
                  key={plan.id} 
                  onClick={() => setSelectedPlanId(plan.name)}
                  className="flex flex-col p-5 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400 shrink-0">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg text-foreground line-clamp-1">{plan.name}</div>
                      <div className="text-sm text-muted-foreground">{plan.shakesCount} Shakes • {plan.validityDays} Days</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-4 border-t">
                    <div className="flex gap-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active</span>
                        <span className="text-xl font-bold text-foreground">{stats.totalActive}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">New ({monthName})</span>
                        <span className="text-xl font-bold text-green-600 dark:text-green-400">{stats.newThisMonth}</span>
                      </div>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-muted-foreground self-end mb-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderClubLevel = () => {
    if (!selectedPlanId) return null;
    
    // Get all clubs that have active members for this plan
    const clubTotals: Record<string, { totalActive: number, newThisMonth: number }> = {};
    Object.keys(clubs).forEach(bId => {
      clubTotals[bId] = { totalActive: 0, newThisMonth: 0 };
    });
    
    customers.forEach(c => {
      if (role === 'super_admin' && (c as any).isHistoricalCopy) return; // DON'T count in club totals for super_admin
      if (c.membershipStatus && !c.membershipStatus.isExpired && c.membershipStatus.latestPlanName === selectedPlanId) {
        const bId = c.branchId || 'unknown';
        if (!clubTotals[bId]) clubTotals[bId] = { totalActive: 0, newThisMonth: 0 };
        
        clubTotals[bId].totalActive += 1;
        
        if (c.membershipStatus.planAssignedAt) {
          const date = new Date(c.membershipStatus.planAssignedAt);
          if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
            clubTotals[bId].newThisMonth += 1;
          }
        }
      }
    });

    const sortedClubs = Object.entries(clubTotals).sort((a, b) => b[1].totalActive - a[1].totalActive);

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
            <ChevronLeftIcon className="h-4 w-4" /> Back
          </Button>
          <h2 className="text-xl font-bold text-foreground">Clubs • {selectedPlanId}</h2>
        </div>

        {sortedClubs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No active members in this plan.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sortedClubs.map(([bId, stats], index) => (
              <div 
                key={bId} 
                onClick={() => setSelectedClubId(bId)}
                className="flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm group gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="font-bold text-muted-foreground w-4 shrink-0 mt-0.5 text-sm sm:text-base">{index + 1}.</span>
                  <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                    <Building className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="font-semibold text-base sm:text-lg text-foreground line-clamp-2 leading-tight">{clubs[bId] || 'Unknown Club'}</div>
                  </div>
                </div>
                <div className="flex items-center justify-end flex-wrap gap-2 shrink-0 mt-1">
                  <Badge variant="secondary" className="text-sm px-2 py-0.5 bg-primary/5">{stats.totalActive} Active</Badge>
                  <Badge variant="secondary" className="text-sm px-2 py-0.5 bg-green-500/10 text-green-600 whitespace-nowrap">{stats.newThisMonth} New</Badge>
                  <ChevronRightIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPartnerLevel = () => {
    if (!selectedPlanId || !selectedClubId) return null;

    const clubCustomers = customers.filter(c => c.branchId === selectedClubId && c.membershipStatus && !c.membershipStatus.isExpired && c.membershipStatus.latestPlanName === selectedPlanId);
    
    // Aggregate by partner
    const partnerTotals: Record<string, { totalActive: number, newThisMonth: number, hasHistorical: boolean }> = {};
    clubCustomers.forEach(c => {
      const pId = c.juniorPartnerId || c.createdBy || 'unassigned';
      if (!partnerTotals[pId]) partnerTotals[pId] = { totalActive: 0, newThisMonth: 0, hasHistorical: false };
      
      partnerTotals[pId].totalActive += 1;
      if ((c as any).isHistoricalCopy) partnerTotals[pId].hasHistorical = true;
      
      if (c.membershipStatus?.planAssignedAt) {
        const date = new Date(c.membershipStatus.planAssignedAt);
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
          partnerTotals[pId].newThisMonth += 1;
        }
      }
    });

    const sortedPartners = Object.entries(partnerTotals).sort((a, b) => b[1].totalActive - a[1].totalActive);

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
          {(role === 'super_admin' || role === 'club_owner') && (
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 shrink-0 self-start">
              <ChevronLeftIcon className="h-4 w-4" /> Back
            </Button>
          )}
          <h2 className="text-xl font-bold text-foreground">Partners • {selectedPlanId} {role === 'super_admin' && <span className="text-muted-foreground font-normal text-sm ml-2">({clubs[selectedClubId] || 'Unknown'})</span>}</h2>
        </div>

        {sortedPartners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No active members in this plan.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sortedPartners.map(([pId, stats], index) => (
              <div 
                key={pId} 
                onClick={() => setSelectedPartnerId(pId)}
                className="flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all shadow-sm group gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="font-bold text-muted-foreground w-4 shrink-0 mt-0.5 text-sm sm:text-base">{index + 1}.</span>
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
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
                  </div>
                </div>
                <div className="flex items-center justify-end flex-wrap gap-2 shrink-0 mt-1">
                  <Badge variant="secondary" className="text-sm px-2 py-0.5 bg-primary/5">{stats.totalActive} Active</Badge>
                  <Badge variant="secondary" className="text-sm px-2 py-0.5 bg-green-500/10 text-green-600 whitespace-nowrap">{stats.newThisMonth} New</Badge>
                  <ChevronRightIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCustomerLevel = () => {
    if (!selectedPlanId || !selectedClubId || !selectedPartnerId) return null;

    const { customers: planCustomers } = getPlanStats(selectedPlanId, selectedClubId, selectedPartnerId);

    // Sort by most recently assigned
    const sortedCustomers = [...planCustomers].sort((a, b) => {
      const timeA = a.membershipStatus?.planAssignedAt || 0;
      const timeB = b.membershipStatus?.planAssignedAt || 0;
      return timeB - timeA;
    });

    return (
      <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 shrink-0 self-start">
            <ChevronLeftIcon className="h-4 w-4" /> Back
          </Button>
          <h2 className="text-xl font-bold text-foreground">
            Members • {selectedPlanId}
            {role !== 'junior_partner' && (
              <span className="text-muted-foreground font-normal text-sm ml-2">
                ({selectedPartnerId === 'unassigned' ? 'Unassigned' : partners[selectedPartnerId] || 'Unknown'})
              </span>
            )}
          </h2>
        </div>

        {sortedCustomers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">No active members found.</div>
        ) : (
          <div className="space-y-3">
            {sortedCustomers.map((c, index) => {
              let isNew = false;
              if (c.membershipStatus?.planAssignedAt) {
                const date = new Date(c.membershipStatus.planAssignedAt);
                isNew = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
              }
              
              return (
                <div 
                  key={c.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all shadow-sm gap-4 group"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-muted-foreground w-5 text-right shrink-0">{index + 1}.</span>
                    <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
                      <User className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col">
                      <Link href={`/customers/${c.id}`} className="font-semibold text-lg hover:text-primary transition-colors hover:underline text-foreground">
                        {c.name}
                      </Link>
                      <div className="text-sm text-muted-foreground">{c.mobile}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    {isNew && (
                      <Badge variant="outline" className="border-green-500/30 text-green-600 bg-green-500/10">New</Badge>
                    )}
                    <Badge variant="secondary" className="bg-primary/5">
                      {c.membershipStatus?.remainingShakes} Shakes Left
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  let viewLevel = 'plan';
  if (selectedPlanId) {
    if (selectedPartnerId) viewLevel = 'customer';
    else if (selectedClubId) viewLevel = 'partner';
    else viewLevel = 'club';
  }

  return (
    <div className="w-full mt-4">
      {/* Month Changer */}
      {viewLevel === 'plan' && (
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
          {viewLevel === 'plan' && renderPlanLevel()}
          {viewLevel === 'club' && renderClubLevel()}
          {viewLevel === 'partner' && renderPartnerLevel()}
          {viewLevel === 'customer' && renderCustomerLevel()}
        </>
      )}
    </div>
  );
}
