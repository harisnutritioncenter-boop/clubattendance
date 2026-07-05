'use client';

import { useState, useEffect } from 'react';
import { CustomerService } from '@/features/customers/services/customer.service';
import { LedgerService } from '@/features/ledger/services/ledger.service';
import { Customer } from '@/features/customers/types/customer.types';
import { PaymentLedgerEntry, ShakeLedgerEntry } from '@/features/ledger/types/ledger.types';
import { CustomerMembershipStatus } from '@/features/memberships/types/membership.types';
import { useBranchStore, useAuthStore } from '@/store';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Coffee, Calendar, Receipt, Banknote } from 'lucide-react';
import { CollectPaymentModal } from '@/features/payments/components/collect-payment-modal';

export default function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  
  const [payments, setPayments] = useState<PaymentLedgerEntry[]>([]);
  const [consumptions, setConsumptions] = useState<ShakeLedgerEntry[]>([]);
  const [balance, setBalance] = useState<CustomerMembershipStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'payments' | 'consumptions'>('payments');
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);

  const branchId = useBranchStore(state => state.activeBranchId);

  const fetchCustomerHistory = async () => {
    if (!selectedCustomerId) {
      setPayments([]);
      setConsumptions([]);
      setBalance(null);
      return;
    }
    
    setLoading(true);
    try {
      const data = await LedgerService.getCustomerHistory(selectedCustomerId);
      setPayments(data.payments);
      setConsumptions(data.consumptions);
      
      const bal = await LedgerService.getCustomerBalance(selectedCustomerId);
      setBalance(bal);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      const bId = branchId || 'default-branch';
      let data = await CustomerService.getActiveCustomers(bId);
      
      const authState = useAuthStore.getState();
      if (authState.role === 'junior_partner') {
        data = data.filter(c => c.createdBy === authState.user?.uid);
      }
      
      setCustomers(data);
    };
    fetchCustomers();
  }, [branchId]);

  useEffect(() => {
    fetchCustomerHistory();
  }, [selectedCustomerId]);

  const customerOptions = customers.map(c => ({
    value: c.id,
    label: `${c.displayId || '-'} | ${c.name} | ${c.mobile}`
  }));

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ledger & History</h1>
          <p className="text-muted-foreground">View complete payment and consumption history.</p>
        </div>
      </div>

      <Card className="border-2 shadow-sm">
        <CardHeader className="pb-4 border-b bg-muted/20">
          <CardTitle>Select Customer</CardTitle>
          <CardDescription>Search by Name, Mobile, or HC-ID to view their ledger.</CardDescription>
          <div className="pt-2 max-w-md">
            <Combobox 
              options={customerOptions}
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              placeholder="Search customers..."
            />
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {!selectedCustomerId ? (
            <div className="text-center py-16 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Please select a customer to view their ledger history.</p>
            </div>
          ) : loading ? (
            <div className="text-center py-16 text-muted-foreground animate-pulse">
              Loading ledger data...
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Due Balance Section */}
              {balance && balance.remainingBalance > 0 && (
                <div className="bg-destructive/10 text-destructive px-6 py-4 border-b border-destructive/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-lg flex items-center gap-2">
                      <Banknote className="h-5 w-5" /> Due Balance: ₹{balance.remainingBalance}
                    </p>
                    <p className="text-sm opacity-80">This customer has an outstanding payment.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => setIsCollectModalOpen(true)}
                  >
                    Collect Payment
                  </Button>
                </div>
              )}

              {/* Custom Tabs Header */}
              <div className="flex border-b">
                <button
                  className={`flex items-center px-6 py-4 font-medium text-sm transition-colors ${activeTab === 'payments' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-muted-foreground hover:bg-muted/50'}`}
                  onClick={() => setActiveTab('payments')}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Payment History ({payments.length})
                </button>
                <button
                  className={`flex items-center px-6 py-4 font-medium text-sm transition-colors ${activeTab === 'consumptions' ? 'border-b-2 border-primary text-primary bg-primary/5' : 'text-muted-foreground hover:bg-muted/50'}`}
                  onClick={() => setActiveTab('consumptions')}
                >
                  <Coffee className="w-4 h-4 mr-2" />
                  Consumption Log ({consumptions.length})
                </button>
              </div>

              {/* Tabs Content */}
              <div className="p-0">
                {activeTab === 'payments' && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[150px]">Date</TableHead>
                          <TableHead>Type / Plan</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Shakes Added</TableHead>
                          <TableHead className="text-right">Amount (₹)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              No payment history found.
                            </TableCell>
                          </TableRow>
                        ) : payments.map(payment => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {new Date(payment.createdAt).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              {payment.type === 'Membership' ? (
                                <Badge variant="secondary">{payment.planName || 'Membership'}</Badge>
                              ) : (
                                <span>{payment.type}</span>
                              )}
                            </TableCell>
                            <TableCell>{payment.paymentMethod}</TableCell>
                            <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                              {payment.shakesAdded ? `+${payment.shakesAdded}` : '-'}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              ₹{payment.amount}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {activeTab === 'consumptions' && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[200px]">Date & Time</TableHead>
                          <TableHead>Consumed By</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="text-right">Shakes Deducted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {consumptions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              No consumption history found.
                            </TableCell>
                          </TableRow>
                        ) : consumptions.map(consumption => (
                          <TableRow key={consumption.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {new Date(consumption.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{consumption.consumedBy}</span>
                                {consumption.consumedBy !== selectedCustomer?.name && (
                                  <Badge variant="outline" className="text-xs">Family Member</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {consumption.notes || '-'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-destructive">
                              -{consumption.shakesDeducted}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCustomer && balance && balance.remainingBalance > 0 && (
        <CollectPaymentModal
          customerId={selectedCustomerId}
          customerName={selectedCustomer.name}
          amountDue={balance.remainingBalance}
          isOpen={isCollectModalOpen}
          onOpenChange={setIsCollectModalOpen}
          onSuccess={fetchCustomerHistory}
        />
      )}
    </div>
  );
}
