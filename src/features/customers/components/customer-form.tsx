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
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { TimedConfirmDialog } from '@/components/ui/timed-confirm-dialog';
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
import { calculateAge, cn, formatDate } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

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
  
  /* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const baseDate = customer?.trialConvertedAt || customer?.createdAt || 0;
  const isDeletable = Date.now() - baseDate <= 30 * 24 * 60 * 60 * 1000;

  const handleDelete = async () => {
    if (!customer || !user) return;
    try {
      setIsDeleting(true);
      await CustomerService.hardDeleteCustomer(customer.id, user.uid);
      toast.success("Customer and all records successfully deleted.");
      setDeleteModalOpen(false);
      window.location.href = customer.isTrial ? '/trials' : '/customers';
    } catch (err: any) {
      console.error("Failed to delete customer:", err);
      toast.error(err.message || "Failed to delete customer.");
    } finally {
      setIsDeleting(false);
    }
  };
  */
  
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
          getDocs(COLLECTIONS.BRANCHES),
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

  // Filter Junior Partners
  useEffect(() => {
    let filtered = allJuniorPartners;

    // Regular users (junior partners, club owners) only see their branch's JPs
    if (role !== 'super_admin') {
      if (activeBranchId) {
        filtered = filtered.filter(jp => jp.branchId === activeBranchId);
      } else {
        filtered = [];
      }
    }

    setFilteredJuniorPartners(filtered.map(jp => {
      const branchName = branches.find(b => b.id === jp.branchId)?.name || 'Unknown Club';
      return { 
        value: jp.id, 
        label: `${jp.name} (${branchName})` 
      };
    }));
    
    // Auto-select branch if not super admin
    if (role !== 'super_admin' && activeBranchId && !form.getValues('branchId')) {
      form.setValue('branchId', activeBranchId);
    }
  }, [allJuniorPartners, activeBranchId, role, form, branches]);

  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [pendingValues, setPendingValues] = useState<CustomerFormValues | null>(null);

  const executeSave = async (values: CustomerFormValues, isReassignment = false) => {
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
        
        if (isReassignment) {
          await LedgerService.updatePastUnassignedLedgerEntries(
            customer.id,
            bId,
            values.juniorPartnerId || 'unassigned'
          );
        }
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

  const onSubmit = async (values: CustomerFormValues) => {
    if (customer) {
      const wasMissingClub = !customer.branchId || customer.branchId === 'unassigned';
      const wasMissingPartner = !customer.juniorPartnerId || customer.juniorPartnerId === 'unassigned';
      
      const isAssigningClub = wasMissingClub && values.branchId && values.branchId !== 'unassigned';
      const isAssigningPartner = wasMissingPartner && values.juniorPartnerId && values.juniorPartnerId !== 'unassigned';
      
      if (isAssigningClub || isAssigningPartner) {
        const hasPastTx = await LedgerService.hasTransactions(customer.id);
        if (hasPastTx) {
          setPendingValues(values);
          setShowReassignDialog(true);
          return;
        }
      }
    }
    
    await executeSave(values, false);
  };

  return (
    <>
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
                  <Input 
                    type="tel" 
                    placeholder="Enter mobile number" 
                    {...field} 
                    onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))} 
                  />
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
                  <Popover>
                    <PopoverTrigger 
                      render={
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        />
                      }
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const localDateStr = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                            field.onChange(localDateStr);
                          } else {
                            field.onChange("");
                          }
                        }}
                        disabled={(date) => date > new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Assignment Info */}
        <div className="p-5 bg-muted/20 border rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">Assignment Options</h3>
            {!!customer && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded">
                Assignments cannot be edited.
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {role === 'super_admin' && !isTrial && (
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Club (Branch)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!!customer || !!form.watch('juniorPartnerId')}>
                      <FormControl>
                        <SelectTrigger className="disabled:opacity-50">
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
                    disabled={!!customer}
                    onChange={(val) => {
                      field.onChange(val);
                      if (val && role === 'super_admin') {
                        const jp = allJuniorPartners.find(p => p.id === val);
                        if (jp && jp.branchId) {
                          form.setValue('branchId', jp.branchId, { shouldValidate: true });
                        }
                      }
                    }}
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
                          <SelectItem value="Due">Due</SelectItem>
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

        <div className="flex justify-between items-center mt-6">
          <div>
            {/* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
            customer && role === 'super_admin' && (
              <Button 
                type="button" 
                variant="destructive"
                onClick={() => setDeleteModalOpen(true)}
                disabled={!isDeletable}
                className={cn("text-white", isDeletable ? "bg-red-600 hover:bg-red-700" : "bg-red-400 opacity-50")}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Record
              </Button>
            )
            */}
          </div>
          <div className="flex gap-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : 'Save Customer'}
            </Button>
          </div>
        </div>
      </form>
    </Form>

    {/* FEATURE: HARD DELETE CUSTOMER WITHIN 30 DAYS (DISABLED) - UNCOMMENT TO RE-ENABLE
    customer && (
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-500 flex items-center gap-2">
               Delete {isTrial ? 'Trial' : 'Customer'} Record
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Are you sure you want to completely erase <strong>{customer.name}</strong> from the system?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg my-2 border border-red-200 dark:border-red-900/50">
            <ul className="list-disc pl-4 space-y-2 text-sm text-red-800 dark:text-red-400 font-medium">
              <li>All payments will be voided and revenue reversed.</li>
              <li>All attendances will be voided and shakes fully refunded.</li>
              <li>The profile will be permanently deleted.</li>
            </ul>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400 text-sm font-medium">
            <p><strong>Time elapsed:</strong> {Math.floor((Date.now() - baseDate) / (1000 * 60 * 60 * 24))} days</p>
            <p><strong>Time remaining to delete:</strong> {Math.max(0, 30 - Math.floor((Date.now() - baseDate) / (1000 * 60 * 60 * 24)))} days</p>
            <p className="text-xs mt-1 opacity-80">After this time, you will not be able to delete this record.</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? 'Deleting...' : 'Yes, Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    */}

    <TimedConfirmDialog
      open={showReassignDialog}
      onOpenChange={setShowReassignDialog}
      title="Reassign Past Data?"
      description="All of the past data will go under the selected club or selected junior partner."
      countdownSeconds={5}
      onConfirm={async () => {
        if (pendingValues) {
          await executeSave(pendingValues, true);
        }
      }}
    />
    </>
  );
}
