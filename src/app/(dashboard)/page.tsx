'use client';

import { useEffect, useState } from "react";
import { getDoc, doc } from "firebase/firestore";
import { COLLECTIONS } from "@/firebase/collections";
import { useAuthStore, useBranchStore } from "@/store";
import { AdminDashboard } from "@/features/dashboard/components/admin-dashboard";
import { SuperAdminDashboard } from "@/features/dashboard/components/super-admin-dashboard";
import { JuniorDashboard } from "@/features/dashboard/components/junior-dashboard";

export default function DashboardPage() {
  const role = useAuthStore(state => state.role);
  const user = useAuthStore(state => state.user);
  const activeBranchId = useBranchStore(state => state.activeBranchId);
  const setActiveBranchId = useBranchStore(state => state.setActiveBranchId);
  const [clubName, setClubName] = useState<string>('');

  useEffect(() => {
    if ((role === 'club_owner' || role === 'junior_partner') && activeBranchId) {
      getDoc(doc(COLLECTIONS.BRANCHES, activeBranchId)).then((snap) => {
        if (snap.exists()) setClubName(snap.data().name);
      });
    }
  }, [role, activeBranchId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            {role === 'super_admin' && 'Welcome to your Super Admin Dashboard.'}
            {role === 'developer' && 'Welcome to the Developer Control Center.'}
            {role === 'club_owner' && `Welcome to ${clubName || 'your club'}.`}
            {role === 'junior_partner' && 'Welcome to the Junior Partner Dashboard.'}
          </p>
        </div>
        {(role === 'super_admin' || role === 'developer') && activeBranchId && (
          <button 
            onClick={() => setActiveBranchId(null)}
            className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors"
          >
            ← Back to Club Hub
          </button>
        )}
      </div>
      
      {(role === 'super_admin' || role === 'developer') && !activeBranchId && <SuperAdminDashboard />}
      {(role === 'super_admin' || role === 'developer') && activeBranchId && <AdminDashboard />}
      {role === 'club_owner' && <AdminDashboard />}
      {role === 'junior_partner' && <JuniorDashboard />}
    </div>
  );
}
