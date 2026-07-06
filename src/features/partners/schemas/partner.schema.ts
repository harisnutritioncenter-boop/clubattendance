import { z } from 'zod';

export const partnerSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  mobile: z.string().optional(),
  address: z.string().optional(),
  locality: z.string().optional(),
  birthDate: z.string().optional(),
});

export type PartnerFormValues = z.infer<typeof partnerSchema>;
