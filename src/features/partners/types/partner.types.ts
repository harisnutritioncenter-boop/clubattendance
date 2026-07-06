export interface Partner {
  id: string;
  email?: string;
  role: string;
  name?: string;
  mobile?: string;
  address?: string;
  locality?: string;
  birthDate?: number | null;
  clubId?: string;
  createdAt?: number;
  isArchived?: boolean;
}
