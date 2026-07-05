'use client';

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuthStore, useBranchStore } from '@/store';
import { FamilyService } from '@/features/family/services/family.service';
import { CustomerService } from '@/features/customers/services/customer.service';
import { FamilyGroup } from '@/features/family/types/family.types';
import { Customer } from '@/features/customers/types/customer.types';
import { Combobox } from '@/components/ui/combobox';
import Link from 'next/link';
import { FamilyEditModal } from '@/features/family/components/family-edit-modal';
import { Settings2 } from 'lucide-react';

export default function FamilyPage() {
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<FamilyGroup | null>(null);

  const branchId = useBranchStore(state => state.activeBranchId);
  const user = useAuthStore(state => state.user);

  // Form State
  const [primaryCustomerId, setPrimaryCustomerId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>(['']);

  const loadData = async () => {
    // We fall back to 'default-branch' if null
    const bId = branchId || 'default-branch';
    try {
      let [fetchedFamilies, fetchedCustomers] = await Promise.all([
        FamilyService.getActiveFamilies(bId),
        CustomerService.getActiveCustomers(bId)
      ]);
      
      const role = useAuthStore.getState().role;
      if (role === 'junior_partner' && user) {
        fetchedFamilies = fetchedFamilies.filter(f => f.createdBy === user.uid);
      }
      
      setFamilies(fetchedFamilies);
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [branchId]);

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    const bId = branchId || 'default-branch';
    if (!bId || !user) return;
    
    const validMembers = memberIds.filter(id => id.trim() !== '');

    try {
      await FamilyService.createFamily({
        primaryCustomerId,
        memberIds: validMembers,
        branchId: bId,
        createdBy: user.uid
      }, user.uid, bId);
      setOpen(false);
      setPrimaryCustomerId('');
      setMemberIds(['']);
      loadData();
    } catch (error) {
      console.error(error);
    }
  };

  const getCustomerName = (id: string) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.name} (${c.displayId})` : id;
  };

  const customerOptions = customers.map(c => ({
    value: c.id,
    label: `${c.displayId || '-'} | ${c.name} | ${c.mobile}`
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Family Accounts</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Create Family
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Family Account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateFamily} className="space-y-4">
              <div className="space-y-2">
                <Label>Primary Customer</Label>
                <Combobox 
                  options={customerOptions}
                  value={primaryCustomerId}
                  onChange={setPrimaryCustomerId}
                  placeholder="Search by ID, Name or Mobile..."
                  emptyText="Customer not found. Please create them first."
                />
              </div>
              
              <div className="space-y-2 mt-4">
                <Label>Family Members</Label>
                {memberIds.map((mId, index) => (
                  <div key={index} className="flex gap-2 items-center mb-2">
                    <div className="flex-1">
                      <Combobox 
                        options={customerOptions.filter(o => o.value !== primaryCustomerId)}
                        value={mId}
                        onChange={(val) => {
                          const newIds = [...memberIds];
                          newIds[index] = val;
                          setMemberIds(newIds);
                        }}
                        placeholder="Search member..."
                      />
                    </div>
                    {index > 0 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => {
                        const newIds = [...memberIds];
                        newIds.splice(index, 1);
                        setMemberIds(newIds);
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setMemberIds([...memberIds, ''])}>
                  + Add Another Member
                </Button>
              </div>

              <div className="pt-4 border-t text-sm text-muted-foreground flex justify-between items-center">
                Can't find a customer?
                <Link href="/customers" className="text-primary hover:underline">Go to Customers</Link>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={!primaryCustomerId}>
                Create Family
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading families...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {families.map((family) => (
            <Card key={family.id} className="relative group">
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  setSelectedFamily(family);
                  setEditModalOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </Button>
              <CardHeader>
                <CardTitle className="text-xl pr-8">Family of {getCustomerName(family.primaryCustomerId)}</CardTitle>
                <CardDescription>Primary account pays for shakes</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-semibold mb-2">Members ({family.memberIds.length}):</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground">
                  {family.memberIds.map(mId => (
                    <li key={mId}>{getCustomerName(mId)}</li>
                  ))}
                  {family.memberIds.length === 0 && <li>No members added yet.</li>}
                </ul>
              </CardContent>
            </Card>
          ))}
          {families.length === 0 && (
            <div className="col-span-full text-center p-8 text-muted-foreground">
              No family accounts found.
            </div>
          )}
        </div>
      )}

      <FamilyEditModal 
        family={selectedFamily}
        customers={customers}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={loadData}
      />
    </div>
  );
}
