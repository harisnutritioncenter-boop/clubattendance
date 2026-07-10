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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { calculateAge } from '@/lib/utils';

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
  const { user, role } = useAuthStore();
  const { activeBranchId } = useBranchStore();
  const [error, setError] = useState<string | null>(null);
  const [juniorPartners, setJuniorPartners] = useState<{value: string, label: string}[]>([]);
  const [referenceOptions, setReferenceOptions] = useState<string[]>([]);
  const [branches, setBranches] = useState<{id: string, name: string}[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersSnap, customersList, plansSnap] = await Promise.all([
          getDocs(COLLECTIONS.USERS),
          CustomerService.getActiveCustomers(activeBranchId),
          getDocs(COLLECTIONS.MEMBERSHIP_PLANS)
        ]);
        
        setPlans(plansSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => p.isActive));

        if (role === 'super_admin') {
          const branchesSnap = await getDocs(COLLECTIONS.BRANCHES);
          setBranches(branchesSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        }

        const jps: {value: string, label: string}[] = [];
        const refs: string[] = [];

        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (data.role === 'junior_partner' || data.role === 'club_owner') {
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
      branchId: '',
      migrationType: 'custom',
      startDate: new Date().toISOString().split('T')[0],
      totalShakesPurchased: 0,
      servedShakesTillDate: 0,
      planId: '',
      customPlanPrice: 0,
      amountPaid: 0,
      paymentMethod: 'Cash',
      paymentDate: new Date().toISOString().split('T')[0],
      birthDate: '',
    },
  });

  const purposes = form.watch('purpose');
  const showOtherDescription = purposes.includes('Other');
  const migrationType = form.watch('migrationType');
  const selectedPlanId = form.watch('planId');
  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const amountPaid = form.watch('amountPaid') || 0;
  
  const watchBirthDate = form.watch('birthDate');
  const computedAge = watchBirthDate ? calculateAge(new Date(watchBirthDate).getTime()) : null;

  const onSubmit = async (values: OfflineMigrationFormValues) => {
    try {
      setError(null);
      
      const branchId = values.branchId || activeBranchId || 'default-branch';
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
        birthDate: values.birthDate ? new Date(values.birthDate).getTime() : undefined,
        branchId,
        createdBy,
        isTrial: false,
      });

      // 2. Log Payment Ledger entry (Starting Balance)
      const pDate = new Date(values.paymentDate || values.startDate);
      pDate.setHours(new Date().getHours());
      pDate.setMinutes(new Date().getMinutes());

      if (values.migrationType === 'custom') {
        if (values.totalShakesPurchased && values.totalShakesPurchased > 0) {
          const remaining = (values.customPlanPrice || 0) - (values.amountPaid || 0);
          await LedgerService.addPayment({
            customerId,
            amount: values.amountPaid || 0,
            type: 'Membership',
            shakesAdded: values.totalShakesPurchased,
            planName: 'Offline Migration Plan',
            paymentMethod: (values.paymentMethod as any) || 'Cash',
            branchId,
            createdBy,
            remainingBalance: remaining > 0 ? remaining : 0,
            createdAt: pDate.getTime(),
            notes: `Offline Migration: Starting balance. Started on ${values.startDate}`
          });
        }
      } else {
        const plan = plans.find(p => p.id === values.planId);
        if (plan) {
          const remaining = plan.price - (values.amountPaid || 0);

          const payload: any = {
            customerId,
            amount: values.amountPaid || 0,
            totalPlanCost: plan.price,
            type: 'Membership',
            planName: plan.name,
            paymentMethod: (values.paymentMethod as any) || 'Cash',
            branchId,
            createdBy,
            remainingBalance: remaining > 0 ? remaining : 0,
            createdAt: pDate.getTime(),
            notes: `Offline Migration: ${plan.name}. Started on ${values.startDate}`
          };
          if (plan.shakesCount !== undefined) payload.shakesAdded = plan.shakesCount;
          if (plan.validityDays !== undefined) payload.validityDays = plan.validityDays;

          await LedgerService.addPayment(payload);
        }
      }

      // 3. Log Consumption Ledger entry (Served Shakes)
      if (values.servedShakesTillDate && values.servedShakesTillDate > 0) {
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
              <FormItem>
                <FormLabel>Junior Partner</FormLabel>
                <Combobox 
                  options={juniorPartners} 
                  value={field.value || ''} 
                  onChange={field.onChange} 
                  placeholder="Search Partner"
                  emptyText="No partner found"
                  onAddNew={() => window.open('/partners', '_blank')}
                  addNewText="Add New Partner"
                /><FormMessage />
              </FormItem>
            )}
          />
          {role === 'super_admin' && (
            <FormField
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Club (Branch)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a club">
                          {field.value ? branches.find(b => b.id === field.value)?.name || "Unknown Club" : "Select a club"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
          <FormField
            control={form.control}
            name="birthDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Birth Date
                  {computedAge !== null && computedAge !== undefined && (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      (Age: {computedAge} yrs)
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input type="date" max={new Date().toISOString().split('T')[0]} {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border-t pt-4 border-b pb-4 bg-muted/20 px-4 rounded-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <h3 className="font-semibold text-lg">Offline Migration Data</h3>
            <Tabs 
              value={migrationType} 
              onValueChange={(v) => form.setValue('migrationType', v as any)}
              className="w-full sm:w-[300px]"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="custom">Custom</TabsTrigger>
                <TabsTrigger value="predefined">Predefined</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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

          {migrationType === 'custom' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                name="customPlanPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Plan Price</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="planId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Membership Plan</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a plan">
                              {field.value && plans.find(p => p.id === field.value)
                                ? plans.find(p => p.id === field.value)?.name
                                : "Select a plan"}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {plans.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.shakes} Shakes @ ₹{p.price})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {selectedPlan && (
                  <div className="bg-background border p-3 rounded-lg flex flex-col justify-center">
                    <p className="text-sm text-muted-foreground font-semibold">Plan Price</p>
                    <p className="text-xl font-bold text-primary">₹{selectedPlan.price}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 border-t pt-4 mt-4">
            <h4 className="font-semibold text-sm">Payment Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amountPaid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount Received</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Received Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {migrationType === 'predefined' && selectedPlan && (
              <div className={`p-3 rounded-lg border ${selectedPlan.price - amountPaid > 0 ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400'}`}>
                <p className="text-sm font-semibold">Remaining Due Balance to Collect Later:</p>
                <p className="text-2xl font-bold">₹{Math.max(0, selectedPlan.price - amountPaid)}</p>
              </div>
            )}
            
            {migrationType === 'custom' && (
              <div className={`p-3 rounded-lg border ${(form.watch('customPlanPrice') || 0) - amountPaid > 0 ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400'}`}>
                <p className="text-sm font-semibold">Remaining Due Balance to Collect Later:</p>
                <p className="text-2xl font-bold">₹{Math.max(0, (form.watch('customPlanPrice') || 0) - amountPaid)}</p>
              </div>
            )}
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
