'use client';

import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { doc, setDoc, getDocs, updateDoc, addDoc, query, where, or, writeBatch, arrayUnion } from 'firebase/firestore';
import { db, COLLECTIONS } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, UserCog, PackagePlus, Info, Building2, AlertTriangle } from 'lucide-react';
import { UserRole, useAuthStore } from '@/store';
import { PartnerInventoryService } from '@/features/partners/services/partner-inventory.service';
import { toast } from 'sonner';
import Link from 'next/link';
import { ContactActions } from '@/components/ui/contact-actions';

const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);
// Ensure secondaryAuth does not affect primary auth persistence
setPersistence(secondaryAuth, inMemoryPersistence);

interface Partner {
  id: string;
  email?: string;
  role: string;
  name?: string;
  clubId?: string;
  mobile?: string;
}

interface Club {
  id: string;
  name: string;
}

import { PartnerInventoryModal } from '@/features/partners/components/partner-inventory-modal';
import { ManageShakesModal } from '@/features/partners/components/add-shakes-modal';
import { CollectPartnerDueModal } from '@/features/partners/components/collect-partner-due-modal';
import { DebtTransferWarningModal } from '@/features/partners/components/debt-transfer-warning-modal';

function PartnerRow({ partner, clubs, onUpdate }: { partner: Partner, clubs: Club[], onUpdate: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [dueBalance, setDueBalance] = useState<number>(0);
  const [clubDebts, setClubDebts] = useState<{clubId: string, amount: number}[]>([]);
  const [activeCollectClubId, setActiveCollectClubId] = useState<string>('');
  const [activeCollectAmount, setActiveCollectAmount] = useState<number>(0);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isCollectDueOpen, setIsCollectDueOpen] = useState(false);
  const [isDebtWarningOpen, setIsDebtWarningOpen] = useState(false);
  const user = useAuthStore(state => state.user);
  const currentUserRole = useAuthStore(state => state.role);
  
  const [isClubAssignOpen, setIsClubAssignOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string>(partner.clubId || '');
  const [isAssigningClub, setIsAssigningClub] = useState(false);

  const fetchBalance = async () => {
    if (partner.role === 'junior_partner' || partner.role === 'club_owner') {
      const bal = await PartnerInventoryService.getPartnerBalances(partner.id);
      setBalance(bal.shakesBalance);
      
      const debts = [];
      for (const [cid, amount] of Object.entries(bal.dueBalanceByClub)) {
        if (amount > 0) debts.push({ clubId: cid, amount });
      }
      setClubDebts(debts);
      setDueBalance(bal.dueBalanceByClub[partner.clubId || ''] || 0);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [partner.id]);

  const executeClubAssignment = async () => {
    if (!selectedClubId) return;
    try {
      setIsAssigningClub(true);
      await updateDoc(doc(COLLECTIONS.USERS, partner.id), {
        clubId: selectedClubId
      });

      const customersQuery = query(
        COLLECTIONS.CUSTOMERS,
        or(
          where('juniorPartnerId', '==', partner.id),
          where('createdBy', '==', partner.id)
        )
      );
      const customersSnapshot = await getDocs(customersQuery);
      
      let activeCount = 0;
      let archivedCount = 0;
      if (!customersSnapshot.empty) {
        const batch = writeBatch(db);
        customersSnapshot.forEach((docSnap) => {
          const custData = docSnap.data();
          batch.update(docSnap.ref, { 
            branchId: selectedClubId,
            pastBranchIds: arrayUnion(custData.branchId)
          });
          
          // Add a Transfer log entry so it appears on the customer's calendar
          const newLedgerRef = doc(COLLECTIONS.SHAKE_LEDGER);
          batch.set(newLedgerRef, {
            customerId: docSnap.id,
            branchId: selectedClubId,
            createdBy: user?.uid || 'system',
            createdAt: Date.now(),
            shakesDeducted: 0,
            notes: `Customer transferred from previous club to new club under ${partner.name}.`,
            isTransfer: true,
            isArchived: false,
            type: 'Transfer'
          });

          if (!custData.isArchived) {
            activeCount++;
          } else {
            archivedCount++;
          }
        });
        await batch.commit();
      }

      let msg = 'Successfully assigned club.';
      if (activeCount > 0 || archivedCount > 0) {
        msg = `Successfully assigned club and migrated ${activeCount} active${archivedCount > 0 ? ` and ${archivedCount} archived` : ''} customers.`;
      }
      toast.success(msg);
      setIsClubAssignOpen(false);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to assign club: " + error.message);
    } finally {
      setIsAssigningClub(false);
    }
  };

  const handleAssignClub = async () => {
    if (dueBalance > 0) {
      setIsDebtWarningOpen(true);
    } else {
      await executeClubAssignment();
    }
  };

  const clubName = clubs.find(c => c.id === partner.clubId)?.name;

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <Link href={`/partners/${partner.id}`} className="hover:underline hover:text-primary transition-colors cursor-pointer">
            {partner.name || 'Unnamed'}
          </Link>
          {partner.mobile && (
            <div className="flex items-center gap-2 mt-1 font-normal">
              <span className="text-xs text-muted-foreground">{partner.mobile}</span>
              <ContactActions mobile={partner.mobile} />
            </div>
          )}
        </TableCell>
        <TableCell>{partner.email}</TableCell>
        <TableCell className="capitalize">{partner.role === 'club_owner' ? 'Club Owner' : partner.role.replace('_', ' ')}</TableCell>
        <TableCell>
          {clubName ? (
            <div className="flex items-center gap-2 group">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{clubName}</span>
              {currentUserRole === 'super_admin' && partner.role === 'junior_partner' && (
                <Dialog open={isClubAssignOpen} onOpenChange={setIsClubAssignOpen}>
                  <DialogTrigger render={<Button size="sm" variant="ghost" className="text-primary transition-opacity ml-2 h-6 px-2" />}>
                    Change
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Re-assign Club for {partner.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Select value={selectedClubId} onValueChange={(v) => setSelectedClubId(v || '')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a club">
                            {selectedClubId ? clubs.find(c => c.id === selectedClubId)?.name : "Select a club"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {clubs.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAssignClub} disabled={isAssigningClub} className="w-full">
                        {isAssigningClub ? 'Assigning...' : 'Confirm Assignment'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          ) : (currentUserRole === 'super_admin' && partner.role === 'junior_partner') ? (
            <Dialog open={isClubAssignOpen} onOpenChange={setIsClubAssignOpen}>
              <DialogTrigger render={<Button size="sm" variant="ghost" className="text-primary" />}>
                Assign Club
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Club to {partner.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Select value={selectedClubId} onValueChange={(v) => setSelectedClubId(v || '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a club">
                        {selectedClubId ? clubs.find(c => c.id === selectedClubId)?.name : "Select a club"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {clubs.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAssignClub} disabled={isAssigningClub} className="w-full">
                    {isAssigningClub ? 'Assigning...' : 'Confirm Assignment'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {(partner.role === 'junior_partner' || partner.role === 'club_owner') ? (
            <div className="flex items-center justify-end gap-3">
              <div className="flex flex-col items-end">
                <span className={`font-bold ${balance !== null && balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                  {balance !== null ? `${balance} Shakes` : '...'}
                </span>
                {clubDebts.map(d => (
                  <span key={d.clubId} className="text-xs text-destructive font-medium">
                    Due ({clubs.find(c => c.id === d.clubId)?.name || 'Unknown'}): ₹{d.amount}
                  </span>
                ))}
              </div>
              {clubDebts.map(d => (
                <Button 
                  key={d.clubId} 
                  size="sm" 
                  variant="destructive" 
                  onClick={() => {
                    setActiveCollectClubId(d.clubId);
                    setActiveCollectAmount(d.amount);
                    setIsCollectDueOpen(true);
                  }}
                >
                  Collect
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setIsLogOpen(true)}>
                Log
              </Button>
              <Button size="sm" variant="default" className="gap-2" onClick={() => setIsAssignOpen(true)}>
                <PackagePlus className="h-4 w-4" /> Manage Shakes
              </Button>
              <Link href={`/partners/${partner.id}`}>
                <Button size="sm" variant="secondary">View Profile</Button>
              </Link>
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      </TableRow>
      <PartnerInventoryModal 
        partnerId={partner.id}
        partnerName={partner.name || partner.email || 'Partner'}
        isOpen={isLogOpen}
        onOpenChange={setIsLogOpen}
        onUpdate={fetchBalance}
      />
      <ManageShakesModal 
        partnerId={partner.id}
        clubId={partner.clubId}
        partnerName={partner.name || partner.email || 'Partner'}
        isOpen={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        onSuccess={fetchBalance}
      />
      {clubDebts.length > 0 && (
        <CollectPartnerDueModal
          partnerId={partner.id}
          clubId={activeCollectClubId}
          partnerName={partner.name || partner.email || 'Partner'}
          amountDue={activeCollectAmount}
          isOpen={isCollectDueOpen}
          onOpenChange={setIsCollectDueOpen}
          onSuccess={fetchBalance}
        />
      )}
      {dueBalance > 0 && (
        <DebtTransferWarningModal
          isOpen={isDebtWarningOpen}
          onOpenChange={setIsDebtWarningOpen}
          partnerId={partner.id}
          clubId={partner.clubId}
          partnerName={partner.name || partner.email || 'Partner'}
          amountDue={dueBalance}
          actionName="Transfer Partner"
          onProceed={executeClubAssignment}
        />
      )}
    </>
  );
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [formerPartnersWithDebt, setFormerPartnersWithDebt] = useState<any[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('junior_partner');
  const [clubName, setClubName] = useState('');
  const [selectedClubId, setSelectedClubId] = useState('');

  const currentUserRole = useAuthStore(state => state.role);
  const currentUser = useAuthStore(state => state.user);
  
  const fetchData = async () => {
    try {
      const [usersSnap, clubsSnap] = await Promise.all([
        getDocs(COLLECTIONS.USERS),
        getDocs(COLLECTIONS.BRANCHES)
      ]);
      
      let usersData = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Partner));
      const clubsData = clubsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Club));
      
      let formerPartners: any[] = [];
      
      // If the current user is a club_owner, they should only see themselves and JPs in their club
      if (currentUserRole === 'club_owner') {
        const currentDbUser = usersData.find(u => u.id === currentUser?.uid);
        if (currentDbUser?.clubId) {
          const activeUsers = usersData.filter(u => u.clubId === currentDbUser.clubId);
          
          // Find former partners with debt
          const ledgerSnap = await getDocs(COLLECTIONS.PARTNER_INVENTORY_LEDGER);
          const ledgerEntries = ledgerSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          
          const debtMap: Record<string, number> = {};
          
          ledgerEntries.forEach(entry => {
            if (entry.type === 'ADDITION' || entry.type === 'DEBT_COLLECTION') {
              // Only count if this transaction happened at this club (or was created by this club owner before clubId was a thing)
              const matchesClub = entry.clubId === currentDbUser.clubId || (!entry.clubId && entry.createdBy === currentUser?.uid);
              if (matchesClub) {
                if (!debtMap[entry.partnerId]) debtMap[entry.partnerId] = 0;
                debtMap[entry.partnerId] += (entry.totalCost || 0) - (entry.amountPaid || 0);
              }
            }
          });
          
          for (const [pid, debt] of Object.entries(debtMap)) {
            if (debt > 0 && !activeUsers.find(u => u.id === pid)) {
              // This is a former partner who still owes money to this club!
              const partnerProfile = usersData.find(u => u.id === pid);
              if (partnerProfile) {
                formerPartners.push({
                  partner: partnerProfile,
                  debt: debt,
                  clubId: currentDbUser.clubId
                });
              }
            }
          }
          
          usersData = activeUsers;
        }
      } else if (currentUserRole === 'junior_partner') {
        // JPs probably shouldn't even see this page, but just in case
        usersData = usersData.filter(u => u.id === currentUser?.uid);
      }
      
      setPartners(usersData);
      setFormerPartnersWithDebt(formerPartners);
      setClubs(clubsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      let finalClubId = selectedClubId;
      
      // If a Club Owner is creating a Junior Partner, force it to their own club
      if (currentUserRole === 'club_owner' && role === 'junior_partner') {
        const currentDbUser = partners.find(u => u.id === currentUser?.uid);
        if (currentDbUser?.clubId) {
          finalClubId = currentDbUser.clubId;
        }
      }
      
      if (role === 'club_owner') {
        if (!clubName.trim()) {
          toast.error("Please enter a Club Name");
          setIsSubmitting(false);
          return;
        }
        // Create new club (branch)
        const newClubRef = await addDoc(COLLECTIONS.BRANCHES, {
          name: clubName.trim(),
          createdAt: Date.now()
        });
        finalClubId = newClubRef.id;
      }
      
      // Create user in Firebase Auth using secondary app
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCredential.user.uid;
      
      // Save role into Firestore
      await setDoc(doc(COLLECTIONS.USERS, uid), {
        email,
        name,
        role: role,
        clubId: finalClubId || null,
        createdAt: Date.now()
      });

      await signOut(secondaryAuth);
      
      setIsOpen(false);
      setEmail('');
      setPassword('');
      setName('');
      setRole('junior_partner');
      setClubName('');
      setSelectedClubId('');
      
      fetchData();
      toast.success("Partner created successfully!");
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error("This email is already in use by another account.");
      } else {
        toast.error(`Failed to create partner: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1 pr-2">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-primary break-words">
            Club Owners & Junior Partners
          </h2>
          {/* <p className="text-muted-foreground">Manage Junior Partners and Club Owners.</p> */}
        </div>
        <div className="flex gap-2">
          {(currentUserRole === 'super_admin' || currentUserRole === 'club_owner') && (
            <Link href="/partner-ledger">
              <Button variant="outline" className="gap-2">
                View Ledger
              </Button>
            </Link>
          )}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger render={<Button className="gap-2" />}>
              <Plus className="h-4 w-4" /> Add 
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role || ''} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior_partner">Junior Partner</SelectItem>
                    {currentUserRole === 'super_admin' && (
                      <SelectItem value="club_owner">Club Owner</SelectItem>
                    )}
                    {currentUserRole === 'super_admin' && (
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {role === 'club_owner' && (
                <div className="space-y-2">
                  <Label>Club Name (New Club will be created)</Label>
                  <Input required value={clubName} onChange={e => setClubName(e.target.value)} placeholder="Healthy Cafe Downtown" />
                </div>
              )}

              {role === 'junior_partner' && currentUserRole === 'super_admin' && (
                <div className="space-y-2">
                  <Label>Assign to Club</Label>
                  <Select value={selectedClubId} onValueChange={(v) => setSelectedClubId(v || '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a club">
                        {selectedClubId ? clubs.find(c => c.id === selectedClubId)?.name : "Select a club"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {clubs.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {role === 'junior_partner' && currentUserRole === 'club_owner' && (
                <div className="space-y-2">
                  <Label>Assign to Club</Label>
                  <Input disabled value={clubs.find(c => c.id === (partners.find(u => u.id === currentUser?.uid)?.clubId))?.name || 'Your Club'} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@clubattendance.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 6 characters" minLength={6} />
              </div>
              
              <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Staff Member'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Users</CardTitle>
          <CardDescription>Accounts with access to the Club Attendance system.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading partners...</div>
          ) : partners.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <UserCog className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-4">No users found in database.</p>
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Club Owner accounts created manually in Firebase Auth might not appear here until a role is assigned.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Club</TableHead>
                  <TableHead className="text-right">Inventory / Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <PartnerRow key={p.id} partner={p} clubs={clubs} onUpdate={fetchData} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {formerPartnersWithDebt.length > 0 && (
        <Card className="mt-8 border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-amber-700 dark:text-amber-500 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Pending Debt from Former Partners
            </CardTitle>
            <CardDescription>
              These Junior Partners have transferred to other clubs or upgraded to Club Owners but still owe debt to your club.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Amount Due</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formerPartnersWithDebt.map((fp) => (
                  <FormerPartnerRow key={fp.partner.id} formerPartner={fp} onUpdate={fetchData} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FormerPartnerRow({ formerPartner, onUpdate }: { formerPartner: any, onUpdate: () => void }) {
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const p = formerPartner.partner;
  
  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{p.name || 'Unnamed'}</TableCell>
        <TableCell>{p.email}</TableCell>
        <TableCell className="text-right text-destructive font-bold">₹{formerPartner.debt}</TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="destructive" onClick={() => setIsCollectOpen(true)}>
            Collect Debt
          </Button>
        </TableCell>
      </TableRow>
      <CollectPartnerDueModal
        partnerId={p.id}
        clubId={formerPartner.clubId}
        partnerName={p.name || p.email || 'Partner'}
        amountDue={formerPartner.debt}
        isOpen={isCollectOpen}
        onOpenChange={setIsCollectOpen}
        onSuccess={onUpdate}
      />
    </>
  );
}
