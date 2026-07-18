'use client';

import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { doc, setDoc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from '@/firebase';
import { firebaseConfig } from '@/firebase/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, UserCog, PackagePlus, Info, Building2 } from 'lucide-react';
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

function PartnerRow({ partner, clubs, onUpdate }: { partner: Partner, clubs: Club[], onUpdate: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const user = useAuthStore(state => state.user);
  
  const [isClubAssignOpen, setIsClubAssignOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string>(partner.clubId || '');
  const [isAssigningClub, setIsAssigningClub] = useState(false);

  const fetchBalance = async () => {
    if (partner.role === 'junior_partner' || partner.role === 'club_owner') {
      const bal = await PartnerInventoryService.getInventoryBalance(partner.id);
      setBalance(bal);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [partner.id]);

  const handleAssignClub = async () => {
    if (!selectedClubId) return;
    try {
      setIsAssigningClub(true);
      await updateDoc(doc(COLLECTIONS.USERS, partner.id), {
        clubId: selectedClubId
      });
      setIsClubAssignOpen(false);
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to assign club: " + error.message);
    } finally {
      setIsAssigningClub(false);
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
              {partner.role !== 'super_admin' && (
                <Dialog open={isClubAssignOpen} onOpenChange={setIsClubAssignOpen}>
                  <DialogTrigger render={<Button size="sm" variant="ghost" className="text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-2 h-6 px-2" />}>
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
          ) : partner.role !== 'super_admin' ? (
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
              <span className={`font-bold ${balance !== null && balance < 0 ? 'text-destructive' : 'text-primary'}`}>
                {balance !== null ? `${balance} Shakes` : '...'}
              </span>
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
            <div className="flex items-center justify-end gap-3">
              <Link href={`/partners/${partner.id}`}>
                <Button size="sm" variant="secondary">View Profile</Button>
              </Link>
            </div>
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
        partnerName={partner.name || partner.email || 'Partner'}
        isOpen={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        onSuccess={fetchBalance}
      />
    </>
  );
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
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
      
      // If the current user is a club_owner, they should only see themselves and JPs in their club
      if (currentUserRole === 'club_owner') {
        const currentDbUser = usersData.find(u => u.id === currentUser?.uid);
        if (currentDbUser?.clubId) {
          usersData = usersData.filter(u => u.clubId === currentDbUser.clubId);
        }
      } else if (currentUserRole === 'junior_partner') {
        // JPs probably shouldn't even see this page, but just in case
        usersData = usersData.filter(u => u.id === currentUser?.uid);
      }
      
      setPartners(usersData);
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

              {role === 'junior_partner' && (
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
    </div>
  );
}
