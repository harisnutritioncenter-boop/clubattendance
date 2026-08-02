'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';
import { addDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { toast } from 'sonner';
import { useAuthStore, useBranchStore } from '@/store';
import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

export function BatchesDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const user = useAuthStore(state => state.user);
  const activeBranchId = useBranchStore(state => state.activeBranchId);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const targetBranchId = activeBranchId || (user as any)?.clubId || 'default-branch';
      if (!targetBranchId) return;

      const q = query(COLLECTIONS.BATCHES, where('branchId', '==', targetBranchId));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      setBatches(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [activeBranchId, user]);

  const handleAddBatch = async () => {
    if (!newBatchName.trim()) {
      toast.error('Batch name cannot be empty');
      return;
    }

    const targetBranchId = activeBranchId || (user as any)?.clubId || 'default-branch';
    if (!targetBranchId) {
      toast.error('No branch selected');
      return;
    }

    setIsSubmitting(true);
    try {
      const newDoc = await addDoc(COLLECTIONS.BATCHES, {
        name: newBatchName.trim(),
        branchId: targetBranchId,
        isActive: true,
        createdAt: Date.now(),
        createdBy: user?.uid,
      });

      await ActivityLogsService.logActivity(
        'CREATE',
        'Batch',
        newDoc.id,
        `Created batch: ${newBatchName.trim()}`,
        user?.uid || 'system',
        targetBranchId
      );

      toast.success('Batch created successfully');
      setNewBatchName('');
      fetchBatches();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (batchId: string, currentStatus: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(COLLECTIONS.BATCHES, batchId), {
        isActive: !currentStatus,
        updatedAt: Date.now(),
        updatedBy: user.uid,
      });

      const targetBranchId = activeBranchId || (user as any)?.clubId;
      await ActivityLogsService.logActivity(
        'UPDATE',
        'Batch',
        batchId,
        `${!currentStatus ? 'Activated' : 'Paused'} batch`,
        user.uid,
        targetBranchId
      );

      toast.success('Batch status updated');
      fetchBatches();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to update batch status');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Batches</CardTitle>
        <CardDescription>Create and manage attendance batches (e.g., Morning, Evening).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-4 max-w-sm">
          <div className="flex-1 space-y-2">
            <Label>New Batch Name</Label>
            <Input 
              placeholder="e.g. Morning Batch" 
              value={newBatchName} 
              onChange={e => setNewBatchName(e.target.value)} 
            />
          </div>
          <Button onClick={handleAddBatch} disabled={isSubmitting || !newBatchName.trim()}>
            Add Batch
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                    Loading batches...
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                    No batches found.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.name}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${batch.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {batch.isActive ? 'Active' : 'Paused'}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(batch.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant={batch.isActive ? "destructive" : "default"} 
                        size="sm"
                        onClick={() => handleToggleStatus(batch.id, batch.isActive)}
                      >
                        {batch.isActive ? 'Pause' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
