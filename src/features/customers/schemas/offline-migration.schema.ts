import { z } from 'zod';
import { customerPurposeEnum } from './customer.schema';

const baseSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  mobile: z.string().min(10, 'Valid mobile number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  locality: z.string().optional(),
  purpose: z.array(customerPurposeEnum).min(1, 'Select at least one purpose'),
  otherPurposeDescription: z.string().optional(),
  notes: z.string().optional(),
  juniorPartnerId: z.string().optional(),
  reference: z.string().optional(),
  
  // Migration specific fields
  startDate: z.string().min(1, 'Start date is required'),
  totalShakesPurchased: z.coerce.number().min(0, 'Cannot be negative'),
  servedShakesTillDate: z.coerce.number().min(0, 'Cannot be negative'),
});

export const offlineMigrationSchema = baseSchema.refine((data) => {
  if (data.purpose.includes('Other') && !data.otherPurposeDescription) {
    return false;
  }
  return true;
}, {
  message: "Description is required when 'Other' is selected as a purpose",
  path: ['otherPurposeDescription'],
});

export type OfflineMigrationFormValues = z.infer<typeof baseSchema>;
