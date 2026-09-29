import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "dummy",
  projectId: "harisnutritioncenter-boop",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(collection(db, 'partner_inventory_ledger'));
  const snap = await getDocs(q);
  const entries = snap.docs.map(d => ({id: d.id, ...d.data()}));
  
  // Find entries where partnerId is jp4's ID or createdBy is jp4
  // Let's just dump all entries that have totalCost > 0
  const costEntries = entries.filter(e => e.totalCost > 0);
  console.log(JSON.stringify(costEntries, null, 2));
}
run();
