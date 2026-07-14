'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Coffee, UserCheck } from 'lucide-react';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';

export function MobileBottomBar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.role);
  
  const navItems = [
    { title: 'Customers', url: '/customers', icon: Users },
    { title: 'Attendance', url: '/consumption', icon: Coffee },
    { title: 'Partners', url: '/partners', icon: UserCheck, hideForJunior: true },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t flex items-center justify-around px-2 py-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        if (item.hideForJunior && role === 'junior_partner') return null;
        
        // Exact match or active sub-route
        const isActive = pathname === item.url || (pathname.startsWith(item.url + '/') && item.url !== '/');
        const Icon = item.icon;
        
        return (
          <Link
            key={item.url}
            href={item.url}
            className={cn(
              "flex flex-col items-center justify-center flex-1 p-1 rounded-lg transition-colors",
              isActive ? "text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-full mb-0.5 transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
            )}>
              <Icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-2")} />
            </div>
            <span className={cn("text-[10px]", isActive ? "font-bold" : "")}>{item.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
