'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CustomerList } from '@/features/customers/components/customer-list';
import { OfflineMigrationForm } from '@/features/customers/components/offline-migration-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function CustomersPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Customers</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Existing Customer</DialogTitle>
                <DialogDescription>
                  Migrate an offline customer into the system with their starting balance and history.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <OfflineMigrationForm 
                  onSuccess={() => setOpen(false)} 
                  onCancel={() => setOpen(false)}
                />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-muted-foreground">
        Manage your cafe customers and their details here.
      </p>
      
      <CustomerList />
    </div>
  );
}
