import { create } from 'zustand';

interface BranchState {
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string | null) => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  activeBranchId: null, // "null" implies default or all branches for admin
  setActiveBranchId: (branchId) => set({ activeBranchId: branchId }),
}));
