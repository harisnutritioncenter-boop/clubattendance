"use client";

import { usePathname } from 'next/navigation';
import { BarChart } from 'lucide-react';

export function TopBarTitle() {
  const pathname = usePathname();

  if (pathname.startsWith('/analytics')) {
    return (
      <div className="flex items-center gap-2 ml-2 sm:ml-4">
        <BarChart className="h-5 w-5 text-primary" />
        <span className="font-bold text-lg text-primary tracking-tight">Analytics</span>
      </div>
    );
  }
  
  return null;
}
