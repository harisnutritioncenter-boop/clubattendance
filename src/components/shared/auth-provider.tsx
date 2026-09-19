'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, COLLECTIONS } from '@/firebase';
import { useAuthStore, UserRole, useBranchStore } from '@/store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubsDoc: () => void;
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (unsubsDoc) unsubsDoc();
        
        // Listen to user document in real-time
        unsubsDoc = onSnapshot(doc(COLLECTIONS.USERS, user.uid), (userDoc) => {
          if (userDoc.exists()) {
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
            
            setUser(user, role, userData);
          } else {
             // Fallback if doc doesn't exist yet
             setUser(user, user.email === 'admin@clubattendance.com' ? 'super_admin' : 'junior_partner');
          }
        }, (error) => {
          console.error('Error fetching user role:', error);
        });
      } else {
        if (unsubsDoc) unsubsDoc();
        setUser(null, null, null);
      }
    });

    return () => {
      unsubscribe();
      if (unsubsDoc) unsubsDoc();
    };
  }, [setUser]);

  return <>{children}</>;
}
