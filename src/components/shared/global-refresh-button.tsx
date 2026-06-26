'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function GlobalRefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="ml-auto flex items-center gap-2"
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Refresh Data</span>
    </Button>
  );
}
