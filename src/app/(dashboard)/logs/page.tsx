'use client';

import { useState, useEffect } from 'react';
import { getDocs, query, orderBy, limit } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { useAuthStore } from '@/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Coffee, CreditCard, UserPlus, Clock, Database, CheckSquare, Settings, DollarSign, Edit, UserMinus } from 'lucide-react';
import { ActivityLog, ActivityAction, EntityType } from '@/features/activity-logs/types/activity.types';

export default function LogsPage() {
  const { role } = useAuthStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Lookups
  const [users, setUsers] = useState<Record<string, string>>({});
  const [clubs, setClubs] = useState<Record<string, string>>({});
  
  // Filters
  const [filterClub, setFilterClub] = useState('ALL');
  const [filterUser, setFilterUser] = useState('ALL');

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

        const uMap: Record<string, string> = {};
        usersSnap.docs.forEach(d => { uMap[d.id] = d.data().name || d.data().email });
        setUsers(uMap);
        
        const cMap: Record<string, string> = {};
        branchesSnap.docs.forEach(d => { cMap[d.id] = d.data().name });
        setClubs(cMap);

        // Fetch recent activities directly from ACTIVITY_LOGS
        const logsSnap = await getDocs(query(COLLECTIONS.ACTIVITY_LOGS, orderBy('createdAt', 'desc'), limit(300)));
        
        if (!isActive) return;

        const allLogs: ActivityLog[] = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        
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

  const getIcon = (action: ActivityAction) => {
    switch (action) {
      case 'CREATE': return <UserPlus className="h-4 w-4 text-blue-500" />;
      case 'UPDATE': return <Edit className="h-4 w-4 text-blue-400" />;
      case 'DELETE': return <UserMinus className="h-4 w-4 text-red-500" />;
      case 'ARCHIVE': return <Database className="h-4 w-4 text-yellow-600" />;
      case 'CONSUME': return <Coffee className="h-4 w-4 text-orange-500" />;
      case 'PURCHASE': return <CreditCard className="h-4 w-4 text-green-500" />;
      case 'COLLECT_DEBT': return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'ADD_SHAKES': return <Activity className="h-4 w-4 text-teal-500" />;
      case 'DEDUCT_SHAKES': return <Activity className="h-4 w-4 text-red-400" />;
      default: return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };
  
  const getEntityLabel = (entityType: EntityType) => {
    return entityType;
  };

  const filteredLogs = logs.filter(log => {
    if (filterClub !== 'ALL' && log.branchId !== filterClub) return false;
    if (filterUser !== 'ALL' && log.performedBy !== filterUser) return false;
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
              <label className="text-sm font-medium whitespace-nowrap">Filter User:</label>
              <Select value={filterUser} onValueChange={(v) => setFilterUser(v || 'ALL')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Users">
                    {filterUser === 'ALL' ? 'All Users' : users[filterUser] || 'All Users'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Users</SelectItem>
                  {Object.entries(users).map(([id, name]) => (
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
                    {getIcon(log.action)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{log.action} {getEntityLabel(log.entityType)}</p>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.details}</p>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                        User: {log.performedByName || users[log.performedBy] || log.performedBy}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Club: {clubs[log.branchId || ''] || 'Global/Unknown'}
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
