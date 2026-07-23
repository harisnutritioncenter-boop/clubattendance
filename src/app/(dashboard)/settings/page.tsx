'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Bell, Settings2, ShieldCheck, ArchiveRestore } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ArchiveDashboard } from '@/features/settings/components/archive-dashboard';
import { useAuthStore, useBranchStore } from '@/store';
import Link from 'next/link';
import { doc, getDoc, getDocs, updateDoc, query, limit } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('archive');
  const user = useAuthStore(state => state.user);
  const role = useAuthStore(state => state.role);
  const activeBranchId = useBranchStore(state => state.activeBranchId);
  
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchEmail, setBranchEmail] = useState('');
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [resolvedBranchId, setResolvedBranchId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBranch = async () => {
      let targetBranchId = activeBranchId || (user as any)?.clubId;
      
      if (!targetBranchId) {
        try {
          const branchesSnap = await getDocs(query(COLLECTIONS.BRANCHES, limit(1)));
          if (!branchesSnap.empty) {
            targetBranchId = branchesSnap.docs[0].id;
          }
        } catch (e) {
          console.error(e);
        }
      }
      
      if (!targetBranchId) return;
      setResolvedBranchId(targetBranchId);
      
      setLoadingBranch(true);
      try {
        const snap = await getDoc(doc(COLLECTIONS.BRANCHES, targetBranchId));
        if (snap.exists()) {
          const data = snap.data();
          setBranchName(data.name || '');
          setBranchAddress(data.address || '');
          setBranchEmail(data.email || '');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingBranch(false);
      }
    };
    
    if (activeTab === 'branch') {
      fetchBranch();
    }
  }, [activeBranchId, activeTab, user]);

  const handleUpdateBranch = async () => {
    const targetBranchId = resolvedBranchId;
    if (!targetBranchId) {
      toast.error('No branch selected or found');
      return;
    }
    
    setSavingBranch(true);
    try {
      await updateDoc(doc(COLLECTIONS.BRANCHES, targetBranchId), {
        name: branchName,
        address: branchAddress,
        email: branchEmail,
        updatedAt: Date.now()
      });
      toast.success('Branch details updated successfully');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to update branch');
    } finally {
      setSavingBranch(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and branch configurations.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="w-full md:w-64 flex flex-col gap-2">

          {/* <Button 
            variant={activeTab === 'branch' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('branch')}
          >
            <Building2 className="w-4 h-4" /> Branch Info
          </Button> */}
          <Button 
            variant={activeTab === 'archive' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('archive')}
          >
            <ArchiveRestore className="w-4 h-4" /> Archive & Recovery
          </Button>
          {/* <Button 
            variant={activeTab === 'notifications' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('notifications')}
          >
            <Bell className="w-4 h-4" /> Notifications
          </Button>
          <Button 
            variant={activeTab === 'security' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('security')}
          >
            <ShieldCheck className="w-4 h-4" /> Security
          </Button> */}
        </aside>

        <div className="flex-1 space-y-6">


          {/* {activeTab === 'branch' && (
            <Card>
              <CardHeader>
                <CardTitle>Branch Information</CardTitle>
                <CardDescription>Manage your current active branch details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Branch Name</Label>
                  <Input 
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    placeholder="Enter branch name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Branch Address</Label>
                  <Input 
                    value={branchAddress}
                    onChange={e => setBranchAddress(e.target.value)}
                    placeholder="Enter branch address"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Contact Email</Label>
                  <Input 
                    type="email" 
                    value={branchEmail}
                    onChange={e => setBranchEmail(e.target.value)}
                    placeholder="contact@branch.com"
                  />
                </div>
                <Button 
                  className="mt-4" 
                  onClick={handleUpdateBranch}
                  disabled={loadingBranch || savingBranch}
                >
                  {savingBranch ? 'Updating...' : 'Update Branch'}
                </Button>
              </CardContent>
            </Card>
          )} */}

          {/* {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Control how you receive system alerts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Member Alerts</Label>
                    <p className="text-sm text-muted-foreground">Receive a notification when a trial converts to a member.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Daily Summary Emails</Label>
                    <p className="text-sm text-muted-foreground">Get a daily summary of revenue and consumption.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Button className="mt-4">Save Preferences</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage access controls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Require 2FA for all Club Owner logins.</p>
                  </div>
                  <Switch />
                </div>
                <Button className="mt-4">Update Security</Button>
              </CardContent>
            </Card>
          )} */}
          {activeTab === 'archive' && (
            <ArchiveDashboard />
          )}
        </div>
      </div>
    </div>
  );
}
