import { z } from 'zod';

export const customerPurposeEnum = z.enum([
  'Weight Loss',
  'Weight Gain',
  'Muscle Building',
  'Fitness',
  'Wellness',
  'Diabetes Management',
  'Sports Performance',
  'Other',
]);

export const customerSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  mobile: z.string().min(10, 'Valid mobile number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  locality: z.string().optional(),
  purpose: z.array(customerPurposeEnum).min(1, 'Select at least one purpose'),
  otherPurposeDescription: z.string().optional(),
  notes: z.string().optional(),
  juniorPartnerId: z.string().optional(),
  branchId: z.string().optional(),
  reference: z.string().optional(),
  birthDate: z.string().min(1, 'Birth date is required'),
  assignPlanId: z.string().optional(),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Bank Transfer']).optional(),
}).refine((data) => {
  if (data.purpose.includes('Other') && !data.otherPurposeDescription) {
    return false;
  }
  return true;
}, {
  message: "Description is required when 'Other' is selected as a purpose",
  path: ['otherPurposeDescription'],
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
