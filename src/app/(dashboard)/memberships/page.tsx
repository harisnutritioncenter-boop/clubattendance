'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MembershipService } from '@/features/memberships/services/membership.service';
import { MembershipPlan } from '@/features/memberships/types/membership.types';
import { useAuthStore } from '@/store';
import { PlanDetailsModal } from '@/features/memberships/components/plan-details-modal';
import { Badge } from '@/components/ui/badge';

export default function MembershipsPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan | null>(null);
  const role = useAuthStore(state => state.role);

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [shakesCount, setShakesCount] = useState('');
  const [validityDays, setValidityDays] = useState('');

  const loadPlans = async () => {
    try {
      const fetched = await MembershipService.getAllPlans();
      setPlans(fetched);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await MembershipService.createPlan({
        name,
        price: Number(price),
        shakesCount: Number(shakesCount),
        validityDays: Number(validityDays)
      });
      setOpen(false);
      setName('');
      setPrice('');
      setShakesCount('');
      setValidityDays('');
      loadPlans();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Membership Plans</h1>
        {(role === 'club_owner' || role === 'super_admin') && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-2 h-4 w-4" />
              Create Plan
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Membership Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreatePlan} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Plan Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. 30-Day Wellness" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹)</Label>
                  <Input id="price" type="number" value={price} onChange={e => setPrice(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shakes">Total Shakes</Label>
                  <Input id="shakes" type="number" value={shakesCount} onChange={e => setShakesCount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="days">Validity (Days)</Label>
                  <Input id="days" type="number" value={validityDays} onChange={e => setValidityDays(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full">Save Plan</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading plans...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className="cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden group"
              onClick={() => {
                setSelectedPlan(plan);
                setDetailsOpen(true);
              }}
            >
              {!plan.isActive && (
                <div className="absolute top-0 right-0">
                  <Badge variant="secondary" className="rounded-tl-none rounded-br-none">Paused</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-xl group-hover:text-primary transition-colors">{plan.name}</CardTitle>
                <CardDescription>{plan.validityDays} Days Validity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary mb-2">₹{plan.price}</div>
                <p className="text-muted-foreground">{plan.shakesCount} Shakes Included</p>
              </CardContent>
            </Card>
          ))}
          {plans.length === 0 && (
            <div className="col-span-3 text-center p-8 text-muted-foreground">
              No membership plans found. Create one to get started.
            </div>
          )}
        </div>
      )}

      <PlanDetailsModal 
        plan={selectedPlan}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onSuccess={() => {
          loadPlans();
          if (selectedPlan) {
            // Re-fetch or update selected plan so details modal updates live
            MembershipService.getAllPlans().then(all => {
              const updated = all.find(p => p.id === selectedPlan.id);
              if (updated) setSelectedPlan(updated);
            });
          }
        }}
      />
    </div>
  );
}
