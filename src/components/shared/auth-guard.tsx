'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { AlertOctagon } from 'lucide-react';

interface SystemConfig {
  isAppLocked: boolean;
  restrictedEmails: string[];
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsConfigLoading(false);
      setConfig(null);
      return;
    }

    setIsConfigLoading(true);
    // Listen to global system config only if authenticated
    const unsubscribe = onSnapshot(doc(COLLECTIONS.SETTINGS, 'system_config'), (snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.data() as SystemConfig);
      } else {
        setConfig({ isAppLocked: false, restrictedEmails: [] });
      }
      setIsConfigLoading(false);
    }, (error) => {
      console.error('Error fetching system config:', error);
      setIsConfigLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user && !pathname.startsWith('/login')) {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading || isConfigLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground">Loading Club Attendance...</p>
        </div>
      </div>
    );
  }

  // Developer is immune to all locks
  const isDeveloper = user?.email === 'developer@clubattendance.com';

  if (!isDeveloper && user && config) {
    const isRestricted = config.restrictedEmails?.includes(user.email || '');
    
    if (config.isAppLocked || isRestricted) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertOctagon className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Service Unavailable</h1>
            <p className="text-muted-foreground">
              The application is currently experiencing connection issues or is undergoing emergency maintenance. Please try again later.
            </p>
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono">
                  ERR_CONNECTION_REFUSED_503
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  Ref: {user.uid.substring(0, 8)}
                </p>
              </div>
              <button 
                onClick={() => useAuthStore.getState().logout()}
                className="opacity-0 hover:opacity-100 text-xs text-muted-foreground underline transition-opacity"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!user && !pathname.startsWith('/login')) {
    return null;
  }

  return <>{children}</>;
}
