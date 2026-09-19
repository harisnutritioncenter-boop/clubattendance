const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, orderBy } = require('firebase/firestore');

const firebaseConfig = {
  projectId: "harisnutritioncenter-boop",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'junior_partner')));
  const users = [];
  usersSnap.forEach(d => users.push({ id: d.id, ...d.data() }));
  
  users.sort((a,b) => b.createdAt - a.createdAt);
  console.log("Recent JPs:");
  users.slice(0, 5).forEach(u => console.log(`${u.name} - id: ${u.id} - clubId: ${u.clubId} - createdAt: ${new Date(u.createdAt).toISOString()}`));

  const customersSnap = await getDocs(collection(db, 'customers'));
  const customers = [];
  customersSnap.forEach(d => customers.push({ id: d.id, ...d.data() }));
  customers.sort((a,b) => b.createdAt - a.createdAt);
  
  console.log("\nRecent Customers:");
  customers.slice(0, 10).forEach(c => console.log(`${c.name} - id: ${c.id} - branchId: ${c.branchId} - JP: ${c.juniorPartnerId} - pastBranchIds: ${JSON.stringify(c.pastBranchIds)} - createdAt: ${new Date(c.createdAt).toISOString()}`));
  
  process.exit(0);
}
check();
