'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { useAuthStore } from '@/store';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Coffee,
  CalendarHeart,
  FileText,
  BadgeCent,
  UserCheck,
  Receipt,
  Download,
  Repeat,
  Activity,
  UserCircle,
  BarChart
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSidebar() {
  const role = useAuthStore((state) => state.role);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  const adminItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Attendance', url: '/consumption', icon: Coffee },
    { title: 'Partners', url: '/partners', icon: UserCheck },
    { title: 'Trials', url: '/trials', icon: UserCheck },
    { title: 'Customers', url: '/customers', icon: Users },
    { title: 'Memberships', url: '/memberships', icon: CalendarHeart },
    { title: 'Family Accounts', url: '/family', icon: Users },
    { title: 'Payments', url: '/payments', icon: CreditCard },
    { title: 'Renewals', url: '/renewals', icon: Repeat },
    { title: 'Revenue Logs', url: '/revenue-logs', icon: Receipt },
    { title: 'Consumption Logs', url: '/consumption-logs', icon: Coffee },
    { title: 'Analytics', url: '/analytics', icon: BarChart },
    { title: 'Reports', url: '/reports', icon: FileText },
    { title: 'Settings', url: '/settings', icon: Settings },
  ];

  // if (role === 'super_admin') {
  //   // Insert Activity Logs right after Consumption Logs for Super Admins
  //   const logsIndex = adminItems.findIndex(i => i.title === 'Consumption Logs');
  //   adminItems.splice(logsIndex + 1, 0, { title: 'Activity Logs', url: '/logs', icon: Activity as any });
  // }

  const juniorItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'My Profile', url: `/partners/${user?.uid || ''}`, icon: UserCircle },
    { title: 'Attendance', url: '/consumption', icon: Coffee },
    { title: 'Trials', url: '/trials', icon: UserCheck },
    { title: 'Customers', url: '/customers', icon: Users },
    { title: 'Memberships', url: '/memberships', icon: CalendarHeart },
    { title: 'Family Accounts', url: '/family', icon: Users },
    { title: 'Payments', url: '/payments', icon: CreditCard },
    { title: 'Renewals', url: '/renewals', icon: Repeat },
    { title: 'Revenue Logs', url: '/revenue-logs', icon: Receipt },
    { title: 'Consumption Logs', url: '/consumption-logs', icon: Coffee },
    { title: 'Analytics', url: '/analytics', icon: BarChart },
    { title: 'Reports', url: '/reports', icon: FileText },
  ];

  const items = (role === 'super_admin' || role === 'club_owner' || role === 'developer') ? adminItems : juniorItems;
  
  if (role === 'developer') {
    items.push({ title: 'Developer Portal', url: '/developer', icon: Activity as any });
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-xl font-bold text-primary">Club Attendance</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton render={<Link href={item.url} />} isActive={pathname === item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => useAuthStore.getState().logout()} className="w-full flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
