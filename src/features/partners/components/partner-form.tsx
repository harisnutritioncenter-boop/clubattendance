'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Partner } from '../types/partner.types';
import { PartnerService } from '../services/partner.service';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { partnerSchema, type PartnerFormValues } from '../schemas/partner.schema';
import { toast } from 'sonner';

interface PartnerFormProps {
  partner: Partner;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PartnerForm({ partner, onSuccess, onCancel }: PartnerFormProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues: {
      name: partner.name || '',
      mobile: partner.mobile || '',
      address: partner.address || '',
      locality: partner.locality || '',
      birthDate: partner.birthDate ? new Date(partner.birthDate).toISOString().split('T')[0] : '',
    },
  });

  const onSubmit = async (values: PartnerFormValues) => {
    try {
      setError(null);
      const birthDateTimestamp = values.birthDate ? new Date(values.birthDate).getTime() : null;

      await PartnerService.updatePartner(partner.id, {
        name: values.name,
        mobile: values.mobile || '',
        address: values.address || '',
        locality: values.locality || '',
        birthDate: birthDateTimestamp,
      });

      toast.success("Profile updated successfully!");
      onSuccess?.();
    } catch (err: any) {
      console.error('Failed to update profile', err);
      setError('Failed to update profile. Please try again.');
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
                  <Input placeholder="Jane Doe" {...field} />
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
          
          <div className="space-y-2">
            <Label>Email</Label>
            <Input disabled value={partner.email || ''} />
          </div>
          
          <FormField
            control={form.control}
            name="birthDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Birth Date</FormLabel>
                <FormControl>
                  <Input type="date" max={new Date().toISOString().split('T')[0]} {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
