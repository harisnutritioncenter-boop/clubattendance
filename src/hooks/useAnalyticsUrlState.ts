import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export function useAnalyticsUrlState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const getParam = (key: string) => searchParams.get(key);

  const dateParam = getParam('date');
  const dateObj = dateParam ? new Date(dateParam) : new Date();

  const currentMonth = getParam('month') ? parseInt(getParam('month') as string) : dateObj.getMonth();
  const currentYear = getParam('year') ? parseInt(getParam('year') as string) : dateObj.getFullYear();
  const activeTab = getParam('tab') || 'attendance';
  const selectedClubId = getParam('clubId');
  const selectedPartnerId = getParam('partnerId');
  const selectedPlanId = getParam('planId');
  const clubViewMode = (getParam('view') as 'partner' | 'customer') || 'partner';

  const updateUrl = useCallback((newParams: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Use router.push to add to history so Android Back button works!
    router.push(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  const setMonthYear = (month: number, year: number) => {
    updateUrl({ month: month.toString(), year: year.toString() });
  };

  const setActiveTab = (tab: string) => {
    updateUrl({ tab, clubId: null, partnerId: null, planId: null });
  };

  const setSelectedClubId = (id: string | null) => {
    updateUrl({ clubId: id, partnerId: null });
  };

  const setSelectedPartnerId = (id: string | null) => {
    updateUrl({ partnerId: id });
  };

  const setSelectedPlanId = (id: string | null) => {
    updateUrl({ planId: id, clubId: null, partnerId: null });
  };

  const setClubViewMode = (mode: 'partner' | 'customer') => {
    updateUrl({ view: mode });
  };

  const setClubAndPartnerId = (cId: string | null, pId: string | null) => {
    updateUrl({ clubId: cId, partnerId: pId });
  };

  const resetDrillDowns = () => {
    updateUrl({ clubId: null, partnerId: null, planId: null });
  };

  return {
    currentMonth,
    currentYear,
    activeTab,
    selectedClubId,
    selectedPartnerId,
    selectedPlanId,
    clubViewMode,
    setMonthYear,
    setActiveTab,
    setSelectedClubId,
    setSelectedPartnerId,
    setSelectedPlanId,
    setClubViewMode,
    setClubAndPartnerId,
    resetDrillDowns,
    updateUrl,
  };
}
