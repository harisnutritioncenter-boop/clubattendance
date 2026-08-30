import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AnalyticsState {
  currentMonth: number;
  currentYear: number;
  activeTab: string;
  selectedClubId: string | null;
  selectedPartnerId: string | null;
  selectedPlanId: string | null;
  clubViewMode: 'partner' | 'customer';
  
  setMonthYear: (month: number, year: number) => void;
  setActiveTab: (tab: string) => void;
  setSelectedClubId: (id: string | null) => void;
  setSelectedPartnerId: (id: string | null) => void;
  setSelectedPlanId: (id: string | null) => void;
  setClubViewMode: (mode: 'partner' | 'customer') => void;
  resetDrillDowns: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      currentMonth: new Date().getMonth(),
      currentYear: new Date().getFullYear(),
      activeTab: "attendance",
      selectedClubId: null,
      selectedPartnerId: null,
      selectedPlanId: null,
      clubViewMode: 'partner',
      
      setMonthYear: (month, year) => set({ currentMonth: month, currentYear: year, selectedClubId: null, selectedPartnerId: null, selectedPlanId: null }),
      setActiveTab: (tab) => set({ activeTab: tab, selectedClubId: null, selectedPartnerId: null, selectedPlanId: null }),
      setSelectedClubId: (id) => set({ selectedClubId: id, selectedPartnerId: null }),
      setSelectedPartnerId: (id) => set({ selectedPartnerId: id }),
      setSelectedPlanId: (id) => set({ selectedPlanId: id, selectedClubId: null, selectedPartnerId: null }),
      setClubViewMode: (mode) => set({ clubViewMode: mode }),
      resetDrillDowns: () => set({ selectedClubId: null, selectedPartnerId: null, selectedPlanId: null }),
    }),
    {
      name: 'analytics-state-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
