'use client';

import { useState, useEffect } from 'react';
import { useBranchStore } from '@/store';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

export function SuperAdminDashboard() {
  const setActiveBranchId = useBranchStore(state => state.setActiveBranchId);
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const snap = await getDocs(COLLECTIONS.BRANCHES);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClubs(data);
      } catch (error) {
        console.error("Failed to fetch clubs:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchClubs();
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading clubs...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {clubs.map(club => (
          <Card 
            key={club.id} 
            className="cursor-pointer hover:border-primary transition-colors bg-card"
            onClick={() => setActiveBranchId(club.id)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {club.name || 'Unnamed Club'}
              </CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">Manage Club →</div>
              <p className="text-xs text-muted-foreground mt-1">
                View all metrics and users for this club.
              </p>
            </CardContent>
          </Card>
        ))}
        {clubs.length === 0 && (
          <div className="col-span-full p-8 text-center border rounded-lg bg-secondary/20">
            <p className="text-muted-foreground">No clubs found. Create a Club Owner in the Partners tab to automatically create a Club.</p>
          </div>
        )}
      </div>
    </div>
  );
}
