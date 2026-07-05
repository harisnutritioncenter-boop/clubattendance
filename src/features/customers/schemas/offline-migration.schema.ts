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
  branchId: z.string().optional(),
  birthDate: z.string().optional(),
  
  // Migration specific fields
  migrationType: z.enum(['custom', 'predefined']).default('custom'),
  
  // Custom mode
  startDate: z.string().min(1, 'Start date is required'),
  totalShakesPurchased: z.coerce.number().min(0, 'Cannot be negative').optional(),
  servedShakesTillDate: z.coerce.number().min(0, 'Cannot be negative').optional(),
  
  // Predefined mode
  planId: z.string().optional(),
  
  // Payment fields (shared)
  amountPaid: z.coerce.number().min(0, 'Cannot be negative').optional(),
  customPlanPrice: z.coerce.number().min(0, 'Cannot be negative').optional(),
  paymentMethod: z.string().optional(),
  paymentDate: z.string().optional(),
});

export const offlineMigrationSchema = baseSchema.superRefine((data, ctx) => {
  if (data.purpose.includes('Other') && !data.otherPurposeDescription) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Description is required when 'Other' is selected as a purpose",
      path: ['otherPurposeDescription'],
    });
  }

  if (data.migrationType === 'custom') {
    if (data.totalShakesPurchased === undefined || data.totalShakesPurchased < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total purchased shakes is required",
        path: ['totalShakesPurchased'],
      });
    }
    if (data.servedShakesTillDate === undefined || data.servedShakesTillDate < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Served shakes is required",
        path: ['servedShakesTillDate'],
      });
    }
    if (data.amountPaid === undefined || data.amountPaid < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount paid is required",
        path: ['amountPaid'],
      });
    }
    if (!data.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment method is required",
        path: ['paymentMethod'],
      });
    }
    if (!data.paymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment date is required",
        path: ['paymentDate'],
      });
    }
    if (data.customPlanPrice === undefined || data.customPlanPrice < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total plan price is required",
        path: ['customPlanPrice'],
      });
    }
  } else if (data.migrationType === 'predefined') {
    if (!data.planId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select a membership plan",
        path: ['planId'],
      });
    }
    if (data.amountPaid === undefined || data.amountPaid < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount paid is required",
        path: ['amountPaid'],
      });
    }
    if (!data.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment method is required",
        path: ['paymentMethod'],
      });
    }
    if (!data.paymentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment date is required",
        path: ['paymentDate'],
      });
    }
    if (data.servedShakesTillDate === undefined || data.servedShakesTillDate < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Served shakes is required",
        path: ['servedShakesTillDate'],
      });
    }
  }
});

export type OfflineMigrationFormValues = z.infer<typeof baseSchema>;
