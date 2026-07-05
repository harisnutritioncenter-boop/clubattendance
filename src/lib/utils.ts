import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanPayload<T extends Record<string, any>>(obj: T): T {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    if (v !== undefined) {
      (acc as any)[k] = v;
    }
    return acc;
  }, {} as T);
}

export function calculateAge(birthDateTimestamp: number | undefined | null): number | null {
  if (!birthDateTimestamp) return null;
  const birthDate = new Date(birthDateTimestamp);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
