import { create } from 'zustand';
import { User, signOut } from 'firebase/auth';
import { auth } from '@/firebase';

export type UserRole = 'developer' | 'super_admin' | 'club_owner' | 'junior_partner' | null;

interface AuthState {
  user: User | null;
  role: UserRole;
  isLoading: boolean;
  userData: any;
  setUser: (user: User | null, role: UserRole, userData?: any) => void;
  setLoading: (isLoading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  userData: null,
  isLoading: true,
  setUser: (user, role, userData = null) => set({ user, role, userData, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
    set({ user: null, role: null, userData: null, isLoading: false });
  },
}));
