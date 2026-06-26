'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore, useBranchStore } from '@/store';
import { CustomerService } from '../services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { getDocs } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { offlineMigrationSchema, type OfflineMigrationFormValues } from '../schemas/offline-migration.schema';
import { CustomerPurpose } from '../types/customer.types';

const PURPOSES: CustomerPurpose[] = [
  'Weight Loss',
  'Weight Gain',
  'Muscle Building',
  'Fitness',
  'Wellness',
  'Diabetes Management',
  'Sports Performance',
  'Other',
];

interface OfflineMigrationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function OfflineMigrationForm({ onSuccess, onCancel }: OfflineMigrationFormProps) {
  const { user } = useAuthStore();
  const { activeBranchId } = useBranchStore();
  const [error, setError] = useState<string | null>(null);
  const [juniorPartners, setJuniorPartners] = useState<{value: string, label: string}[]>([]);
  const [referenceOptions, setReferenceOptions] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersSnap, customersList] = await Promise.all([
          getDocs(COLLECTIONS.USERS),
          CustomerService.getActiveCustomers(activeBranchId)
        ]);

        const jps: {value: string, label: string}[] = [];
        const refs: string[] = [];

        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (data.role === 'junior_partner') {
            const label = data.name || data.email || d.id;
            jps.push({ value: d.id, label });
            refs.push(label);
          }
        });

        customersList.forEach(c => {
          refs.push(c.name);
        });

        setJuniorPartners(jps);
        setReferenceOptions(refs);
      } catch (e) {
        console.error('Failed to fetch form options', e);
      }
    };
    fetchData();
  }, [activeBranchId]);

  const form = useForm<OfflineMigrationFormValues>({
    resolver: zodResolver(offlineMigrationSchema) as any,
    defaultValues: {
      name: '',
      mobile: '',
      email: '',
      address: '',
      locality: '',
      purpose: [],
      otherPurposeDescription: '',
      notes: '',
      juniorPartnerId: '',
      reference: '',
      startDate: new Date().toISOString().split('T')[0],
      totalShakesPurchased: 0,
      servedShakesTillDate: 0,
    },
  });

  const purposes = form.watch('purpose');
  const showOtherDescription = purposes.includes('Other');

  const onSubmit = async (values: OfflineMigrationFormValues) => {
    try {
      setError(null);
      
      const branchId = activeBranchId || 'default-branch';
      const createdBy = user?.uid || 'system';

      // 1. Create the Customer Document
      const customerId = await CustomerService.createCustomer({
        name: values.name,
        mobile: values.mobile,
        address: values.address,
        locality: values.locality,
        purpose: values.purpose,
        otherPurposeDescription: values.otherPurposeDescription,
        notes: values.notes,
        email: values.email,
        juniorPartnerId: values.juniorPartnerId,
        reference: values.reference,
        branchId,
        createdBy,
        isTrial: false,
      });

      // 2. Log Payment Ledger entry (Starting Balance)
      if (values.totalShakesPurchased > 0) {
        await LedgerService.addPayment({
          customerId,
          amount: 0, // Since it's a migration, payment was already collected offline
          type: 'Membership',
          shakesAdded: values.totalShakesPurchased,
          planName: 'Offline Migration Plan',
          validityDays: undefined, // Ignored logic per new rules anyway
          paymentMethod: 'Cash',
          branchId,
          createdBy,
          notes: `Offline Migration: Starting balance. Started on ${values.startDate}`
        });
      }

      // 3. Log Consumption Ledger entry (Served Shakes)
      if (values.servedShakesTillDate > 0) {
        await LedgerService.addConsumption({
          shakesDeducted: values.servedShakesTillDate,
          branchId,
          createdBy,
          notes: `Offline Migration: Consumed shakes prior to system entry.`
        }, customerId);
      }

      form.reset();
      onSuccess?.();
    } catch (err: any) {
      console.error('Failed to migrate offline customer', err);
      setError('Failed to migrate customer. Please try again.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mobile Number</FormLabel>
                <FormControl>
                  <Input placeholder="+91 98765 43210" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="john@example.com" type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="juniorPartnerId"
            render={({ field }) => (
              <FormItem className="flex flex-col pt-2">
                <FormLabel>Junior Partner</FormLabel>
                <Combobox
                  options={juniorPartners}
                  value={field.value || ''}
                  onChange={field.onChange}
                  placeholder="Select Junior Partner"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference</FormLabel>
                <FormControl>
                  <div>
                    <Input 
                      placeholder="Type or select reference..." 
                      list="reference-options"
                      {...field} 
                    />
                    <datalist id="reference-options">
                      {referenceOptions.map((opt, i) => (
                        <option key={i} value={opt} />
                      ))}
                    </datalist>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border-t pt-4 border-b pb-4 bg-muted/20 px-4 rounded-md">
          <h3 className="font-semibold text-lg mb-4">Offline Migration Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalShakesPurchased"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Purchased Shakes</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="servedShakesTillDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shakes Served Till Date</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="locality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Locality</FormLabel>
                <FormControl>
                  <Input placeholder="Downtown" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="purpose"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">Purpose of joining</FormLabel>
                <FormDescription>
                  Select all that apply.
                </FormDescription>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {PURPOSES.map((item) => (
                  <FormField
                    key={item}
                    control={form.control}
                    name="purpose"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={item}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(item)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, item])
                                  : field.onChange(
                                      field.value?.filter((value) => value !== item)
                                    );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {item}
                          </FormLabel>
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {showOtherDescription && (
          <FormField
            control={form.control}
            name="otherPurposeDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Please specify purpose</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Preparing for marathon" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any medical conditions or allergies..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="flex justify-end space-x-4 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit">Migrate Offline Customer</Button>
        </div>
      </form>
    </Form>
  );
}
