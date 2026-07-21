'use client';

import { useState, useEffect } from 'react';
import { Users, UserCheck, UsersRound, IndianRupee, Coffee, BadgeCent, CreditCard, Award, RefreshCcw } from 'lucide-react';
import { StatCard } from './stat-card';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { useBranchStore } from '@/store';
import Link from 'next/link';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';

export function AdminDashboard() {
  const branchId = useBranchStore(state => state.activeBranchId);
  
  const [metrics, setMetrics] = useState({
    activeMembers: 0,
    trialCustomers: 0,
    revenue: 0,
    consumptionsToday: 0
  });

  const [topPartner, setTopPartner] = useState({ name: 'Loading...', conversions: 0 });

  useEffect(() => {
    let isActive = true;

    const fetchMetrics = async () => {
      const bId = branchId || 'default-branch';
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

      // Parallel fetching for performance
      const [customers, consumptions, revenue, reportsData, usersSnap] = await Promise.all([
        CustomerService.getActiveCustomers(bId),
        LedgerService.getTodayConsumptions(bId),
        LedgerService.getMonthlyRevenue(bId),
        LedgerService.getReportsData(bId, startOfMonth, endOfMonth),
        getDocs(COLLECTIONS.USERS)
      ]);
      
      if (!isActive) return;

      const trialCount = customers.filter(c => c.isTrial).length;
      const membersCount = customers.length - trialCount;

      setMetrics({
        activeMembers: membersCount,
        trialCustomers: trialCount,
        revenue,
        consumptionsToday: consumptions
      });

      // Calculate Top Partner
      const payments = reportsData.payments;
      const partnerConversions: Record<string, number> = {};
      
      payments.forEach(p => {
        if (p.notes?.includes('Membership Assigned')) {
          partnerConversions[p.createdBy] = (partnerConversions[p.createdBy] || 0) + 1;
        }
      });

      let topPartnerId: string | null = null;
      let maxConversions = 0;
      Object.entries(partnerConversions).forEach(([userId, count]) => {
        if (count > maxConversions) {
          maxConversions = count;
          topPartnerId = userId;
        }
      });

      if (topPartnerId) {
        const userDoc = usersSnap.docs.find(d => d.id === topPartnerId);
        const name = userDoc ? userDoc.data().name || userDoc.data().email : 'Admin';
        setTopPartner({ name, conversions: maxConversions });
      } else {
        setTopPartner({ name: 'No conversions yet', conversions: 0 });
      }
    };
    fetchMetrics();
    
    return () => {
      isActive = false;
    };
  }, [branchId]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/customers" className="transition-transform hover:scale-105 active:scale-95 block">
          <StatCard title="Total Active Members" value={metrics.activeMembers.toString()} icon={Users} description="Across all plans" />
        </Link>
        <Link href="/trials" className="transition-transform hover:scale-105 active:scale-95 block">
          <StatCard title="Active Trials" value={metrics.trialCustomers.toString()} icon={UserCheck} description="Currently in trial period" />
        </Link>
        <Link href="/revenue-logs" className="transition-transform hover:scale-105 active:scale-95 block">
          <StatCard title="Revenue This Month" value={`₹${metrics.revenue.toLocaleString()}`} icon={IndianRupee} description="Total collected" />
        </Link>
        <Link href="/consumption-logs" className="transition-transform hover:scale-105 active:scale-95 block">
          <StatCard title="Today's Consumption" value={`${metrics.consumptionsToday} Attendances`} icon={Coffee} description="Total marked today" />
        </Link>
        <Link href="/renewals" className="transition-transform hover:scale-105 active:scale-95 block">
          <StatCard title="Renewals" value="View" icon={RefreshCcw} description="Manage expiring plans" />
        </Link>
        <div className="transition-transform hover:scale-105 block">
          <StatCard title="Top Partner" value={topPartner.name} icon={Award} description={`${topPartner.conversions} conversions this month`} />
        </div>
      </div>
    </div>
  );
}
