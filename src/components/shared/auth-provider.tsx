'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, COLLECTIONS } from '@/firebase';
import { useAuthStore, UserRole, useBranchStore } from '@/store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch user role from Firestore
        try {
          const userDoc = await getDoc(doc(COLLECTIONS.USERS, user.uid));
          const userData = userDoc.data();
          let role: UserRole = 'junior_partner';
          
          if (user.email === 'developer@clubattendance.com') {
            role = 'developer';
          } else if (userData?.role) {
            role = userData.role === 'admin' ? 'club_owner' : (userData.role as UserRole);
          } else if (user.email === 'admin@clubattendance.com') {
            role = 'super_admin';
          }
          
          if (role !== 'super_admin' && role !== 'developer') {
            useBranchStore.getState().setActiveBranchId(userData?.clubId || 'default-branch');
          } else {
            useBranchStore.getState().setActiveBranchId(null);
          }
          
          setUser(user, role);
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUser(user, user.email === 'admin@clubattendance.com' ? 'super_admin' : 'junior_partner'); // Fallback
        }
      } else {
        setUser(null, null);
      }
    });

    return () => unsubscribe();
  }, [setUser]);

  return <>{children}</>;
}
