import { create } from 'zustand';
import { ShakeLedgerEntry, PaymentLedgerEntry } from '@/features/ledger/types/ledger.types';
import { getDocs, query, where, or } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase';

interface HistoryState {
  hasFetched: boolean;
  isFetching: boolean;
  historicalConsumptions: ShakeLedgerEntry[];
  historicalPayments: PaymentLedgerEntry[];
  fetchHistoricalData: (uid: string, upgradedAt: number) => Promise<void>;
  reset: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  hasFetched: false,
  isFetching: false,
  historicalConsumptions: [],
  historicalPayments: [],

  fetchHistoricalData: async (uid: string, upgradedAt: number) => {
    if (get().hasFetched || get().isFetching) return;
    
    set({ isFetching: true });
    try {
      // 1. Get all customers assigned to this partner
      const custQ = query(COLLECTIONS.CUSTOMERS, where('juniorPartnerId', '==', uid));
      const custSnap = await getDocs(custQ);
      const customerIds = custSnap.docs.map(d => d.id);

      // 2. Fetch createdBy me records
      const shakesByMeQ = query(COLLECTIONS.SHAKE_LEDGER, where('createdBy', '==', uid));
      const shakesByMeSnap = await getDocs(shakesByMeQ);
      const createdByMeShakes = shakesByMeSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShakeLedgerEntry));

      const paymentsByMeQ = query(COLLECTIONS.PAYMENT_LEDGER, where('createdBy', '==', uid));
      const paymentsByMeSnap = await getDocs(paymentsByMeQ);
      const createdByMePayments = paymentsByMeSnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentLedgerEntry));

      // 3. Fetch records for assigned customers in chunks
      let customerShakes: ShakeLedgerEntry[] = [];
      let customerPayments: PaymentLedgerEntry[] = [];

      if (customerIds.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < customerIds.length; i += chunkSize) {
          const chunk = customerIds.slice(i, i + chunkSize);
          
          const csQ = query(COLLECTIONS.SHAKE_LEDGER, where('customerId', 'in', chunk));
          const csSnap = await getDocs(csQ);
          customerShakes = customerShakes.concat(
            csSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShakeLedgerEntry))
          );

          const cpQ = query(COLLECTIONS.PAYMENT_LEDGER, where('customerId', 'in', chunk));
          const cpSnap = await getDocs(cpQ);
          customerPayments = customerPayments.concat(
            cpSnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentLedgerEntry))
          );
        }
      }

      // 4. Combine, deduplicate and filter
      const allShakesMap = new Map<string, ShakeLedgerEntry>();
      [...createdByMeShakes, ...customerShakes].forEach(s => {
        if (!s.isArchived && s.createdAt < upgradedAt) {
          // Keep the original juniorPartnerId if missing so grouping works in UI
          if (!s.juniorPartnerId) s.juniorPartnerId = uid;
          allShakesMap.set(s.id, s);
        }
      });

      const allPaymentsMap = new Map<string, PaymentLedgerEntry>();
      [...createdByMePayments, ...customerPayments].forEach(p => {
        if (!p.isArchived && p.createdAt < upgradedAt) {
          if (!p.juniorPartnerId) p.juniorPartnerId = uid;
          allPaymentsMap.set(p.id, p);
        }
      });

      const consumptions = Array.from(allShakesMap.values());
      const payments = Array.from(allPaymentsMap.values());

      set({ 
        historicalConsumptions: consumptions, 
        historicalPayments: payments, 
        hasFetched: true 
      });
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
    } finally {
      set({ isFetching: false });
    }
  },

  reset: () => set({ 
    hasFetched: false, 
    historicalConsumptions: [], 
    historicalPayments: [] 
  })
}));
