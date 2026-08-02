'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CustomerForm } from '@/features/customers/components/customer-form';
import { Plus } from 'lucide-react';
import { TrialList } from '@/features/customers/components/trial-list';

export default function TrialsPage() {
  const [isAddTrialOpen, setIsAddTrialOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trials Management</h1>
          <p className="text-muted-foreground">Manage and convert your trial customers.</p>
        </div>
        <Dialog open={isAddTrialOpen} onOpenChange={setIsAddTrialOpen}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="h-4 w-4" /> Add Trial
          </DialogTrigger>
          <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Add New Trial Customer</DialogTitle>
            </DialogHeader>
            <CustomerForm 
              isTrial={true}
              onSuccess={() => {
                setIsAddTrialOpen(false);
                setRefreshKey(prev => prev + 1);
              }}
              onCancel={() => setIsAddTrialOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <TrialList key={refreshKey} onAddTrialRequest={() => setIsAddTrialOpen(true)} />
    </div>
  );
}
