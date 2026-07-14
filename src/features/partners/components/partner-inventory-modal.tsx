'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PartnerInventoryService, PartnerInventoryEntry } from '../services/partner-inventory.service';
import { formatDateTime } from '@/lib/utils';
import { getDocs, query, where, orderBy } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { ActivityLogsService } from '@/features/activity-logs/services/activity.service';

interface PartnerInventoryModalProps {
  partnerId: string;
  partnerName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const REASONS = [
  "Typo in entry",
  "Incorrect Partner selected",
  "Accidental duplication",
  "Other"
];

export function PartnerInventoryModal({ partnerId, partnerName, isOpen, onOpenChange, onUpdate }: PartnerInventoryModalProps) {
  const [entries, setEntries] = useState<PartnerInventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [originalAmount, setOriginalAmount] = useState<number>(0);

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');

  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const user = useAuthStore(state => state.user);

  const fetchEntries = async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const q = query(
        COLLECTIONS.PARTNER_INVENTORY_LEDGER,
        where('partnerId', '==', partnerId),
        where('isArchived', '==', false)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInventoryEntry));
      
      // Sort by descending createdAt (newest first)
      data.sort((a, b) => b.createdAt - a.createdAt);
      setEntries(data);
      
      // Fetch overall balance for preview
      const bal = await PartnerInventoryService.getInventoryBalance(partnerId);
      setCurrentBalance(bal);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load inventory log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEntries();
    }
  }, [isOpen, partnerId]);

  const handleEditSave = async (entryId: string) => {
    if (!user) return;
    try {
      const amount = parseInt(editAmount);
      if (isNaN(amount)) {
        toast.error('Please enter a valid number');
        return;
      }
      
      if (amount <= 0) {
        toast.error('Amount must be at least 1. If you need it to be 0, please use the Delete button instead.');
        return;
      }
      
      if (amount > originalAmount) {
        toast.error(`You cannot increase the amount (Max: ${originalAmount}). Create a new entry to add more inventory.`);
        return;
      }
      
      if (!editReason) {
        toast.error('Please select a reason for editing.');
        return;
      }
      
      await PartnerInventoryService.updateInventoryEntry(entryId, { amount }, user.uid);
      await ActivityLogsService.logActivity('UPDATE', 'Inventory', entryId, `Edited amount from ${originalAmount} to ${amount}. Reason: ${editReason}`, user.uid);
      
      toast.success('Inventory entry updated');
      setEditingId(null);
      setEditReason('');
      fetchEntries();
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update entry');
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteId) return;
    
    if (!deleteReason) {
      toast.error('Please select a reason for deleting.');
      return;
    }
    
    try {
      await PartnerInventoryService.voidInventoryEntry(deleteId, user.uid);
      await ActivityLogsService.logActivity('DELETE', 'Inventory', deleteId, `Deleted inventory entry. Reason: ${deleteReason}`, user.uid);
      toast.success('Inventory entry deleted');
      setDeleteId(null);
      setDeleteReason('');
      fetchEntries();
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    }
  };

  const getPreviewBalance = () => {
    const amount = parseInt(editAmount) || 0;
    const diff = amount - originalAmount;
    return currentBalance + diff;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inventory Log: {partnerName}</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">Loading...</TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">No inventory records found.</TableCell>
                  </TableRow>
                ) : (
                  entries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          entry.type === 'ADDITION' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {entry.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editingId === entry.id ? (
                          <div className="flex flex-col gap-2 w-48">
                            <Input 
                              type="number" 
                              className="h-8" 
                              value={editAmount} 
                              onChange={e => setEditAmount(e.target.value)}
                              max={originalAmount}
                              min={1}
                            />
                            <div className="text-xs text-muted-foreground">
                              Preview Balance: <span className="font-bold text-primary">{getPreviewBalance()}</span>
                            </div>
                            <Select value={editReason} onValueChange={(v) => setEditReason(v || '')}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {REASONS.map(r => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <span className="font-medium">{entry.amount}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.notes}</TableCell>
                      <TableCell className="text-right whitespace-nowrap align-top pt-4">
                        {editingId === entry.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" onClick={() => handleEditSave(entry.id!)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                            {entry.type === 'ADDITION' && (
                              <Button size="sm" variant="outline" className="w-20" onClick={() => {
                                setEditingId(entry.id!);
                                setEditAmount(entry.amount.toString());
                                setOriginalAmount(entry.amount);
                                setEditReason('');
                              }}>
                                Edit
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" className="w-20" onClick={() => {
                              setDeleteId(entry.id!);
                              setDeleteReason('');
                            }}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Reason Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this inventory entry? This will reverse its effect on the partner's balance.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Deletion</label>
              <Select value={deleteReason} onValueChange={(v) => setDeleteReason(v || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
