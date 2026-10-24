import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDMFtnsJfF90myqqYI-Fy4wEQ437uIMh1I",
  authDomain: "healthcafe01.firebaseapp.com",
  projectId: "healthcafe01",
  storageBucket: "healthcafe01.firebasestorage.app",
  messagingSenderId: "755589094",
  appId: "1:755589094:web:c209ea855908a012d78027"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Starting cosmetic cleanup...");
  
  // 1. Fetch Users map
  const usersSnap = await getDocs(collection(db, 'users'));
  const usersMap: Record<string, string> = {};
  usersSnap.forEach(doc => {
    usersMap[doc.id] = doc.data().name || 'Unknown';
  });
  
  // 2. Fetch Customers map
  const customersSnap = await getDocs(collection(db, 'customers'));
  const customersMap: Record<string, string> = {};
  customersSnap.forEach(doc => {
    customersMap[doc.id] = doc.data().name || 'Unknown';
  });

  // 3. Fix Shake Ledger
  const shakeSnap = await getDocs(collection(db, 'shakeLedger'));
  let shakeUpdates = 0;
  for (const document of shakeSnap.docs) {
    const data = document.data();
    let updates: any = {};
    let needsUpdate = false;
    
    if (data.notes && data.notes.includes('Admin deducted')) {
      updates.notes = data.notes.replace('Admin deducted', 'Marked');
      if (updates.notes.includes('shakes')) {
         updates.notes = updates.notes.replace('shakes', 'attendance(s)');
      }
      needsUpdate = true;
    }
    
    if (data.consumedBy && data.consumedBy.startsWith('Vx')) {
      updates.consumedBy = customersMap[data.consumedBy] || data.consumedBy;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await updateDoc(doc(db, 'shakeLedger', document.id), updates);
      shakeUpdates++;
    }
  }
  console.log(`Updated ${shakeUpdates} shake ledger entries.`);

  console.log("Cleanup complete!");
  process.exit(0);
}

run().catch(console.error);
