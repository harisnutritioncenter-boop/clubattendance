'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Bell, Settings2, ShieldCheck, ArchiveRestore } from 'lucide-react';
import { useState } from 'react';
import { ArchiveDashboard } from '@/features/settings/components/archive-dashboard';
import { useAuthStore } from '@/store';
import Link from 'next/link';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const user = useAuthStore(state => state.user);
  const role = useAuthStore(state => state.role);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and branch configurations.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="w-full md:w-64 flex flex-col gap-2">
          <Button 
            variant={activeTab === 'general' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('general')}
          >
            <Settings2 className="w-4 h-4" /> General
          </Button>
          <Button 
            variant={activeTab === 'branch' ? 'default' : 'ghost'} 
            className="justify-start gap-2"
            onClick={() => setActiveTab('branch')}
          >
            <Building2 className="w-4 h-4" /> Branch Info
          </Button>
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
          {activeTab === 'general' && (
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Configure basic system behaviors.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Currency Format</Label>
                  <Select defaultValue="inr">
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inr">Indian Rupee (₹)</SelectItem>
                      <SelectItem value="usd">US Dollar ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 mt-4">
                  <Label>Timezone</Label>
                  <Select defaultValue="ist">
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ist">India Standard Time (IST)</SelectItem>
                      <SelectItem value="utc">Universal Time (UTC)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {user && role !== 'super_admin' && (
                  <div className="grid gap-2 mt-4">
                    <Label>My Profile</Label>
                    <p className="text-sm text-muted-foreground mb-2">View your performance metrics, inventory, and edit your profile details.</p>
                    <Link href={`/partners/${user.uid}`}>
                      <Button variant="outline">View My Profile</Button>
                    </Link>
                  </div>
                )}
                <Button className="mt-4">Save Changes</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'branch' && (
            <Card>
              <CardHeader>
                <CardTitle>Branch Information</CardTitle>
                <CardDescription>Manage your current active branch details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Branch Name</Label>
                  <Input defaultValue="Main Branch" />
                </div>
                <div className="grid gap-2">
                  <Label>Branch Address</Label>
                  <Input defaultValue="123 Health Ave, Wellness City" />
                </div>
                <div className="grid gap-2">
                  <Label>Contact Email</Label>
                  <Input type="email" defaultValue="main@clubattendance.com" />
                </div>
                <Button className="mt-4">Update Branch</Button>
              </CardContent>
            </Card>
          )}

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
