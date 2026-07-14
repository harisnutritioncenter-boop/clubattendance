'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs, updateDoc, where, deleteField } from 'firebase/firestore';
import { db } from '@/firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { useAuthStore } from '@/store';
import { CustomerService } from '@/features/customers/services/customer.service';
import { ShieldAlert, Lock, Unlock, Mail, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface SystemConfig {
  isAppLocked: boolean;
  restrictedEmails: string[];
}

export default function DeveloperPortalPage() {
  const role = useAuthStore(state => state.role);
  const [config, setConfig] = useState<SystemConfig>({ isAppLocked: false, restrictedEmails: [] });
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [migrating, setMigrating] = useState(false);

  const configRef = doc(COLLECTIONS.SETTINGS, 'system_config');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(configRef);
        if (snap.exists()) {
          setConfig(snap.data() as SystemConfig);
        } else {
          // Initialize if not exists
          await setDoc(configRef, { isAppLocked: false, restrictedEmails: [] });
        }
      } catch (error) {
        console.error('Error fetching config:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  if (role !== 'developer') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">You do not have access to this portal.</p>
      </div>
    );
  }

  const handleToggleLock = async () => {
    const newState = !config.isAppLocked;
    try {
      await setDoc(configRef, { ...config, isAppLocked: newState }, { merge: true });
      setConfig({ ...config, isAppLocked: newState });
      toast.success(newState ? 'Application is now LOCKED globally.' : 'Application is now UNLOCKED.');
    } catch (error) {
      toast.error('Failed to update lock state.');
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    
    if (config.restrictedEmails.includes(newEmail.trim())) {
      toast.error('Email is already restricted.');
      return;
    }

    const updatedEmails = [...config.restrictedEmails, newEmail.trim()];
    try {
      await setDoc(configRef, { ...config, restrictedEmails: updatedEmails }, { merge: true });
      setConfig({ ...config, restrictedEmails: updatedEmails });
      setNewEmail('');
      toast.success('Email restricted successfully.');
    } catch (error) {
      toast.error('Failed to restrict email.');
    }
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    const updatedEmails = config.restrictedEmails.filter(e => e !== emailToRemove);
    try {
      await setDoc(configRef, { ...config, restrictedEmails: updatedEmails }, { merge: true });
      setConfig({ ...config, restrictedEmails: updatedEmails });
      toast.success('Email restriction removed.');
    } catch (error) {
      toast.error('Failed to remove email restriction.');
    }
  };

  const handleMigrateIds = async () => {
    if (!confirm('Are you sure you want to run the customer ID migration? This will overwrite existing IDs!')) return;
    setMigrating(true);
    try {
      const usersSnap = await getDocs(COLLECTIONS.USERS);
      const partnersMap = new Map();
      usersSnap.docs.forEach(d => {
        partnersMap.set(d.id, d.data().name || '');
      });

      const q = query(COLLECTIONS.CUSTOMERS, orderBy('createdAt', 'asc'));
      const custSnap = await getDocs(q);
      
      const counters = new Map(); 
      let migratedCount = 0;

      for (const customerDoc of custSnap.docs) {
        const data = customerDoc.data();
        const partnerId = data.juniorPartnerId || 'UNASSIGNED';
        const partnerName = partnersMap.get(partnerId) || '';
        
        let count = counters.get(partnerId) || 0;
        count++;
        counters.set(partnerId, count);
        
        const initials = CustomerService.getInitials(partnerName);
        const displayId = `${initials}${String(count).padStart(4, '0')}`;
        
        await updateDoc(doc(COLLECTIONS.CUSTOMERS, customerDoc.id), {
          displayId,
        });
        migratedCount++;
      }
      
      for (const [pId, count] of counters.entries()) {
        const initials = CustomerService.getInitials(partnersMap.get(pId) || '');
        const counterRef = doc(COLLECTIONS.SETTINGS, `counter_customers_${pId}`);
        await setDoc(counterRef, { count, initials, partnerId: pId }, { merge: true });
      }

      toast.success(`Successfully migrated ${migratedCount} customer IDs!`);
    } catch (err) {
      console.error(err);
      toast.error('Migration failed!');
    } finally {
      setMigrating(false);
    }
  };

  const handleFixTrialConversions = async () => {
    if (!confirm('Are you sure you want to fix trial conversions? This will scan all customers and revert those with no active memberships back to trial.')) return;
    setMigrating(true);
    try {
      const q = query(COLLECTIONS.CUSTOMERS);
      const custSnap = await getDocs(q);
      let fixedCount = 0;

      for (const customerDoc of custSnap.docs) {
        const data = customerDoc.data();
        if (data.wasTrial && !data.isTrial) {
          // Check for active memberships
          const paymentsQuery = query(
            COLLECTIONS.PAYMENT_LEDGER,
            where('customerId', '==', customerDoc.id),
            where('isArchived', '==', false),
            where('type', '==', 'Membership')
          );
          const paymentsSnap = await getDocs(paymentsQuery);
          
          if (paymentsSnap.empty) {
            await updateDoc(doc(COLLECTIONS.CUSTOMERS, customerDoc.id), {
              isTrial: true,
              trialConvertedAt: deleteField()
            });
            fixedCount++;
          }
        }
      }
      toast.success(`Successfully fixed ${fixedCount} trial customers!`);
      CustomerService.clearCache();
    } catch (err) {
      console.error(err);
      toast.error('Fix failed!');
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return <div>Loading developer portal...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
          <ShieldAlert className="h-8 w-8" />
          Developer Portal
        </h1>
        <p className="text-muted-foreground mt-2">
          Danger Zone. These controls affect the entire system globally in real-time.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Global Lock Card */}
        <div className={`p-6 rounded-xl border-2 transition-colors ${config.isAppLocked ? 'border-destructive bg-destructive/5' : 'border-border bg-card'}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {config.isAppLocked ? <Lock className="text-destructive h-5 w-5" /> : <Unlock className="text-primary h-5 w-5" />}
                Global App Lock
              </h2>
              <p className="text-sm text-muted-foreground">
                When enabled, all users (except developers) will be immediately kicked out to a fake 503 connection error screen.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Button 
              size="lg"
              variant={config.isAppLocked ? 'outline' : 'destructive'} 
              className="w-full font-bold"
              onClick={handleToggleLock}
            >
              {config.isAppLocked ? 'UNLOCK APPLICATION' : 'LOCK ENTIRE APPLICATION'}
            </Button>
          </div>
        </div>

        {/* Email Restrictions Card */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Restrict Specific Accounts
            </h2>
            <p className="text-sm text-muted-foreground">
              Add user emails below to permanently block their access with a 503 error.
            </p>
          </div>
          
          <form onSubmit={handleAddEmail} className="flex gap-2 mt-6">
            <Input 
              type="email" 
              placeholder="user@example.com" 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </form>

          <div className="mt-6 space-y-2">
            <Label>Currently Restricted Emails</Label>
            {config.restrictedEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No emails restricted.</p>
            ) : (
              <ul className="space-y-2">
                {config.restrictedEmails.map(email => (
                  <li key={email} className="flex items-center justify-between p-2 rounded-md bg-secondary/50 text-sm">
                    <span className="font-medium text-destructive">{email}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => handleRemoveEmail(email)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* DB Migration Card */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-primary">
              <ShieldAlert className="h-5 w-5" />
              Data Migrations
            </h2>
            <p className="text-sm text-muted-foreground">
              Run structural updates on the database.
            </p>
          </div>
          <div className="mt-6">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleMigrateIds}
              disabled={migrating}
            >
              {migrating ? 'Migrating...' : 'Migrate Customer IDs to Partner Format'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full mt-2"
              onClick={handleFixTrialConversions}
              disabled={migrating}
            >
              {migrating ? 'Fixing...' : 'Fix Voided Trial Conversions'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
