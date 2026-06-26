'use client';

import { useState, useEffect } from 'react';
import { getDocs, query, orderBy, limit } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { useAuthStore, useBranchStore } from '@/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Coffee, CreditCard, UserPlus, Clock } from 'lucide-react';

interface ActivityLog {
  id: string;
  type: 'CONSUMPTION' | 'PAYMENT' | 'CUSTOMER_CREATED' | 'TRIAL_CREATED';
  title: string;
  description: string;
  createdAt: number;
  createdBy: string;
  branchId: string;
  metadata?: any;
}

export default function LogsPage() {
  const { role } = useAuthStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Lookups
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [clubs, setClubs] = useState<Record<string, string>>({});
  
  // Filters
  const [filterClub, setFilterClub] = useState('ALL');
  const [filterJp, setFilterJp] = useState('ALL');

  useEffect(() => {
    let isActive = true;
    const fetchLogs = async () => {
      try {
        setLoading(true);
        
        // Fetch lookup data
        const [usersSnap, branchesSnap] = await Promise.all([
          getDocs(COLLECTIONS.USERS),
          getDocs(COLLECTIONS.BRANCHES)
        ]);
        
        if (!isActive) return;

        const pMap: Record<string, string> = {};
        usersSnap.docs.forEach(d => { pMap[d.id] = d.data().name || d.data().email });
        setPartners(pMap);
        
        const cMap: Record<string, string> = {};
        branchesSnap.docs.forEach(d => { cMap[d.id] = d.data().name });
        setClubs(cMap);

        // Fetch recent activities (limit 100 per collection)
        const [consSnap, paySnap, custSnap, trialSnap] = await Promise.all([
          getDocs(query(COLLECTIONS.CONSUMPTIONS, orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(COLLECTIONS.PAYMENTS, orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(COLLECTIONS.CUSTOMERS, orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(COLLECTIONS.TRIALS, orderBy('createdAt', 'desc'), limit(100)))
        ]);
        
        if (!isActive) return;

        const allLogs: ActivityLog[] = [];

        consSnap.docs.forEach(d => {
          const data = d.data();
          allLogs.push({
            id: `cons_${d.id}`,
            type: 'CONSUMPTION',
            title: 'Shake Served',
            description: `Served ${data.shakesDeducted} shake(s) to ${data.consumedBy || 'Customer'}`,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            branchId: data.branchId,
          });
        });

        paySnap.docs.forEach(d => {
          const data = d.data();
          allLogs.push({
            id: `pay_${d.id}`,
            type: 'PAYMENT',
            title: `Payment: ${data.type}`,
            description: `Collected ₹${data.amount} via ${data.paymentMethod}`,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            branchId: data.branchId,
          });
        });

        custSnap.docs.forEach(d => {
          const data = d.data();
          allLogs.push({
            id: `cust_${d.id}`,
            type: 'CUSTOMER_CREATED',
            title: 'New Customer Joined',
            description: `Added ${data.name} (${data.mobile})`,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            branchId: data.branchId,
          });
        });
        
        trialSnap.docs.forEach(d => {
          const data = d.data();
          allLogs.push({
            id: `trial_${d.id}`,
            type: 'TRIAL_CREATED',
            title: 'New Trial Added',
            description: `Added trial for ${data.name}`,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            branchId: data.branchId,
          });
        });

        // Sort by newest first
        allLogs.sort((a, b) => b.createdAt - a.createdAt);
        
        setLogs(allLogs);
      } catch (err) {
        console.error("Error fetching logs:", err);
      } finally {
        if (isActive) setLoading(false);
      }
    };
    
    fetchLogs();
    
    return () => { isActive = false; };
  }, []);

  if (role !== 'super_admin') {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  const getIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'CONSUMPTION': return <Coffee className="h-4 w-4 text-orange-500" />;
      case 'PAYMENT': return <CreditCard className="h-4 w-4 text-green-500" />;
      case 'CUSTOMER_CREATED': return <UserPlus className="h-4 w-4 text-blue-500" />;
      case 'TRIAL_CREATED': return <Activity className="h-4 w-4 text-purple-500" />;
      default: return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filterClub !== 'ALL' && log.branchId !== filterClub) return false;
    if (filterJp !== 'ALL' && log.createdBy !== filterJp) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Logs</h1>
        <p className="text-muted-foreground">Monitor system-wide activity across all clubs</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-start justify-between space-y-4 md:space-y-0 pb-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Global Feed
          </CardTitle>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Filter Club:</label>
              <Select value={filterClub} onValueChange={(v) => setFilterClub(v || 'ALL')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Clubs">
                    {filterClub === 'ALL' ? 'All Clubs' : clubs[filterClub] || 'All Clubs'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Clubs</SelectItem>
                  {Object.entries(clubs).map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Filter JP:</label>
              <Select value={filterJp} onValueChange={(v) => setFilterJp(v || 'ALL')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Partners">
                    {filterJp === 'ALL' ? 'All Partners' : partners[filterJp] || 'All Partners'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Partners</SelectItem>
                  {Object.entries(partners).map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading activity feed...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No activity found for the selected filters.
            </div>
          ) : (
            <div className="divide-y">
              {filteredLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors flex gap-4">
                  <div className="mt-1 bg-background border rounded-full p-2 h-fit">
                    {getIcon(log.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{log.title}</p>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.description}</p>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                        Partner: {partners[log.createdBy] || 'Unknown JP'}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Club: {clubs[log.branchId] || 'Unknown Club'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
