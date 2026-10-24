import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Starting cosmetic cleanup...");
  
  // 1. Fetch Users map
  const usersSnap = await getDocs(collection(db, 'users'));
  const usersMap = {};
  usersSnap.forEach(doc => {
    usersMap[doc.id] = doc.data().name || 'Unknown';
  });
  
  // 2. Fetch Customers map
  const customersSnap = await getDocs(collection(db, 'customers'));
  const customersMap = {};
  customersSnap.forEach(doc => {
    customersMap[doc.id] = doc.data().name || 'Unknown';
  });

  // 3. Fix Shake Ledger
  const shakeSnap = await getDocs(collection(db, 'shakeLedger'));
  let shakeUpdates = 0;
  for (const document of shakeSnap.docs) {
    const data = document.data();
    let updates = {};
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
