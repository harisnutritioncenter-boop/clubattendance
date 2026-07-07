'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore, useBranchStore } from '@/store';
import { CustomerService } from '../services/customer.service';
import { Customer } from '../types/customer.types';
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
import { customerSchema, type CustomerFormValues } from '../schemas/customer.schema';
import { CustomerPurpose } from '../types/customer.types';
import { MembershipService } from '@/features/memberships/services/membership.service';
import { MembershipPlan } from '@/features/memberships/types/membership.types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface CustomerFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  isTrial?: boolean;
  customer?: Customer;
}

export function CustomerForm({ onSuccess, onCancel, isTrial, customer }: CustomerFormProps) {
  const { user, role } = useAuthStore();
  const { activeBranchId } = useBranchStore();
  const [error, setError] = useState<string | null>(null);
  
  const [allJuniorPartners, setAllJuniorPartners] = useState<{id: string, name: string, branchId: string}[]>([]);
  const [filteredJuniorPartners, setFilteredJuniorPartners] = useState<{value: string, label: string}[]>([]);
  const [referenceOptions, setReferenceOptions] = useState<string[]>([]);
  const [branches, setBranches] = useState<{id: string, name: string}[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name || '',
      mobile: customer?.mobile || '',
      email: customer?.email || '',
      address: customer?.address || '',
      locality: customer?.locality || '',
      purpose: customer?.purpose || [],
      otherPurposeDescription: customer?.otherPurposeDescription || '',
      notes: customer?.notes || '',
      juniorPartnerId: customer?.juniorPartnerId || '',
      branchId: customer?.branchId || '',
      reference: customer?.reference || '',
      birthDate: customer?.birthDate ? new Date(customer.birthDate).toISOString().split('T')[0] : '',
      assignPlanId: '',
      paymentMethod: 'Cash',
    },
  });

  const purposes = form.watch('purpose');
  const showOtherDescription = purposes.includes('Other');
  const selectedBranchId = form.watch('branchId') || activeBranchId;
  const assignPlanId = form.watch('assignPlanId');
  const watchBirthDate = form.watch('birthDate');
  const computedAge = watchBirthDate ? calculateAge(new Date(watchBirthDate).getTime()) : null;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersSnap, customersList, branchesSnap, plansList] = await Promise.all([
          getDocs(COLLECTIONS.USERS),
          CustomerService.getActiveCustomers(null), // global
          role === 'super_admin' ? getDocs(COLLECTIONS.BRANCHES) : Promise.resolve({ docs: [] }),
          MembershipService.getActivePlans()
        ]);

        const jps: {id: string, name: string, branchId: string}[] = [];
        const refs: string[] = [];

        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (data.role === 'junior_partner' || data.role === 'club_owner') {
            const label = data.name || data.email || d.id;
            jps.push({ id: d.id, name: label, branchId: data.clubId || data.branchId || '' });
            refs.push(label);
          }
        });

        customersList.forEach(c => {
          refs.push(c.name);
        });

        const bs = branchesSnap.docs.map(d => ({ id: d.id, name: d.data().name }));

        setAllJuniorPartners(jps);
        setReferenceOptions(refs);
        setBranches(bs);
        setPlans(plansList);
      } catch (e) {
        console.error('Failed to fetch form options', e);
      }
    };
    fetchData();
  }, [role]);

  // Filter Junior Partners when Branch changes
  useEffect(() => {
    let filtered = allJuniorPartners;
    
    // Strict match on branch. If not a super_admin, we must enforce their active branch.
    const branchToFilter = selectedBranchId || activeBranchId;
    
    if (branchToFilter) {
      filtered = filtered.filter(jp => jp.branchId === branchToFilter); 
    } else if (role !== 'super_admin') {
      // If no branch is determined yet but they are not a super admin, show nothing to prevent leaks
      filtered = [];
    }

    setFilteredJuniorPartners(filtered.map(jp => ({ value: jp.id, label: jp.name })));
    
    // Auto-select branch if not super admin
    if (role !== 'super_admin' && activeBranchId && !form.getValues('branchId')) {
      form.setValue('branchId', activeBranchId);
    }
  }, [selectedBranchId, allJuniorPartners, activeBranchId, role, form]);

  const onSubmit = async (values: CustomerFormValues) => {
    try {
      setError(null);
      
      const bId = values.branchId || activeBranchId || 'default-branch';
      const createdBy = user?.uid || 'system';
      
      const birthDateTimestamp = values.birthDate ? new Date(values.birthDate).getTime() : null;

      if (customer) {
        await CustomerService.updateCustomer(
          customer.id,
          {
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
            birthDate: birthDateTimestamp,
            branchId: bId,
          },
          createdBy,
          bId
        );
      } else {
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
          birthDate: birthDateTimestamp,
          branchId: bId,
          createdBy,
          isTrial: isTrial || false,
        });

        // Optional: Assign membership plan directly only on creation
        if (values.assignPlanId && values.assignPlanId !== 'none' && values.paymentMethod) {
          await MembershipService.assignMembership(
            customerId,
            values.assignPlanId,
            values.paymentMethod,
            bId,
            createdBy
          );
        }
      }

      form.reset();
      onSuccess?.();
    } catch (err: any) {
      console.error('Failed to save customer', err);
      setError('Failed to save customer. Please try again.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Core Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Assignment Info */}
        <div className="p-5 bg-muted/20 border rounded-xl space-y-4">
          <h3 className="font-semibold text-sm">Assignment Options</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              name="juniorPartnerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Junior Partner</FormLabel>
                  <Combobox
                    options={filteredJuniorPartners}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Select Junior Partner"
                    emptyText="No partner found"
                    onAddNew={() => window.open('/partners', '_blank')}
                    addNewText="Add New Partner"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Membership Assignment - Only show on creation */}
        {!customer && (
          <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl space-y-4">
            <div>
              <h3 className="font-semibold text-sm text-primary">Optional: Assign Membership Plan</h3>
              <p className="text-xs text-muted-foreground mt-1">You can also do this later.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assignPlanId"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end">
                    <FormLabel>Membership Plan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No Plan">
                            {field.value === 'none' ? "Skip for now" : field.value ? plans.find(p => p.id === field.value)?.name : "No Plan"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" className="text-muted-foreground">Skip for now</SelectItem>
                        {plans.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} - ₹{p.price} ({p.shakesCount} shakes)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {assignPlanId && assignPlanId !== 'none' && (
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <FormLabel>Payment Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Method">
                              {field.value || "Select Method"}
                            </SelectValue>
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
              )}
            </div>
          </div>
        )}

        {/* Additional Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <FormLabel>Purpose</FormLabel>
                <FormDescription>
                  Select all that apply.
                </FormDescription>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                                      field.value?.filter(
                                        (value) => value !== item
                                      )
                                    )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm cursor-pointer">
                            {item}
                          </FormLabel>
                        </FormItem>
                      )
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
                <FormLabel>Please specify other purpose</FormLabel>
                <FormControl>
                  <Input placeholder="Specific health condition or goal..." {...field} />
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
                  placeholder="Any dietary restrictions or medical conditions we should know about?" 
                  className="resize-none"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex justify-end gap-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Save Customer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
