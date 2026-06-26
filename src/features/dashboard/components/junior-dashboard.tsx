import { useState, useEffect } from 'react';
import { Users, UserCheck, IndianRupee, TrendingUp, Coffee, RefreshCcw } from 'lucide-react';
import { StatCard } from './stat-card';
import { useAuthStore, useBranchStore } from '@/store';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import Link from 'next/link';

export function JuniorDashboard() {
  const user = useAuthStore(state => state.user);
  const branchId = useBranchStore(state => state.activeBranchId);
  const [metrics, setMetrics] = useState({
    myMembers: 0,
    myTrials: 0,
    myRevenue: 0,
    myConversions: 0,
    todayConsumption: 0,
    myInventory: 0
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!user) return;
      try {
        const bId = branchId || 'default-branch';
        
        // 1. Get Customers added by this user
        const allCustomers = await CustomerService.getActiveCustomers(bId);
        const myCustomers = allCustomers.filter(c => c.createdBy === user.uid);
        const myTrials = myCustomers.filter(c => c.isTrial).length;
        const myMembers = myCustomers.length - myTrials;
        
        // 2. Get today's consumption
        const now = new Date();
        now.setHours(0,0,0,0);
        const startOfDay = now.getTime();
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
        
        // Fetch all branch ledgers for the month (we'll just use a wide range to be safe)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const reports = await LedgerService.getReportsData(bId, startOfMonth, endOfDay);
        
        // Filter for this user's actions
        const myPayments = reports.payments.filter(p => p.createdBy === user.uid);
        const myRevenue = myPayments.reduce((acc, p) => acc + p.amount, 0);
        const myConversions = myPayments.filter(p => p.notes?.includes('Membership Assigned')).length;

        const myConsumptionsToday = reports.consumptions.filter(c => 
          c.createdBy === user.uid && 
          c.createdAt >= startOfDay && 
          c.createdAt <= endOfDay
        );
        const todayConsumption = myConsumptionsToday.reduce((acc, c) => acc + c.shakesDeducted, 0);

        // Fetch remaining inventory
        const { PartnerInventoryService } = await import('@/features/partners/services/partner-inventory.service');
        const myInventory = await PartnerInventoryService.getInventoryBalance(user.uid);

        setMetrics({
          myMembers,
          myTrials,
          myRevenue,
          myConversions,
          todayConsumption,
          myInventory
        });
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchMetrics();
  }, [user, branchId]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/consumption" className="transition-transform hover:scale-[1.02] active:scale-95 block col-span-full md:col-span-1 lg:col-span-1">
          <StatCard 
            title="My Shake Inventory" 
            value={`${metrics.myInventory} Shakes`} 
            icon={Coffee} 
            description="Remaining balance to serve" 
          />
        </Link>
        <Link href="/customers" className="transition-transform hover:scale-[1.02] active:scale-95 block">
          <StatCard title="My Members" value={metrics.myMembers.toString()} icon={Users} description="Active members assigned to you" />
        </Link>
        <Link href="/trials" className="transition-transform hover:scale-[1.02] active:scale-95 block">
          <StatCard title="My Trials" value={metrics.myTrials.toString()} icon={UserCheck} description="Currently in trial phase" />
        </Link>
        <Link href="/revenue-logs" className="transition-transform hover:scale-[1.02] active:scale-95 block">
          <StatCard title="My Revenue" value={`₹${metrics.myRevenue.toLocaleString('en-IN')}`} icon={IndianRupee} description="Generated this month" />
        </Link>
        <Link href="/renewals" className="transition-transform hover:scale-[1.02] active:scale-95 block">
          <StatCard title="Renewals" value="View" icon={RefreshCcw} description="Manage expiring plans" />
        </Link>
        <Link href="/consumption-logs" className="transition-transform hover:scale-[1.02] active:scale-95 block">
          <StatCard title="Today's Consumption" value={`${metrics.todayConsumption} Shakes`} icon={Coffee} description="Recorded by you today" />
        </Link>
      </div>
    </div>
  );
}
