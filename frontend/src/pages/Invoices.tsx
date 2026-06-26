import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Search, FileText, DollarSign, X, Trash2, AlertCircle, Printer
} from 'lucide-react';
import { Invoice, Customer } from 'shared';

export default function Invoices() {
  const queryClient = useQueryClient();
  const [searchCustomer, setSearchCustomer] = useState('');
  const [searchStatus, setSearchStatus] = useState<string>('');
  
  // Payment modal state
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [paymentAmountCents, setPaymentAmountCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentError, setPaymentError] = useState('');

  // Queries
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: () => api.get('/api/invoices'),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/api/customers'),
  });

  // Mutations
  const createPaymentMutation = useMutation({
    mutationFn: (paymentData: any) => api.post(`/api/invoices/${selectedInvoice?.id}/payments`, paymentData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsAddPaymentOpen(false);
      setSelectedInvoice(null);
      setPaymentAmountCents(0);
      setPaymentNotes('');
    },
    onError: (err: any) => {
      setPaymentError(err.message || 'Failed to log payment');
    }
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  });

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentAmountCents <= 0) {
      setPaymentError('Payment amount must be greater than $0.00.');
      return;
    }
    createPaymentMutation.mutate({
      amount: paymentAmountCents,
      paymentMethod,
      notes: paymentNotes
    });
  };

  const openPaymentModal = (invoice: Invoice) => {
    // Calculate invoice total
    let total = 0;
    for (const item of invoice.items) {
      const sub = item.quantity * item.unitPrice;
      total += sub + Math.round(sub * (item.taxRate / 100));
    }
    total -= invoice.discount;

    setSelectedInvoice(invoice);
    setPaymentAmountCents(total); // default to full payment
    setIsAddPaymentOpen(true);
  };

  const getInvoiceTotal = (invoice: Invoice) => {
    let total = 0;
    for (const item of invoice.items) {
      const sub = item.quantity * item.unitPrice;
      total += sub + Math.round(sub * (item.taxRate / 100));
    }
    total -= invoice.discount;
    return total;
  };

  // Filter invoices locally
  const filteredInvoices = invoices.filter(inv => {
    // Status check
    if (searchStatus && inv.status !== searchStatus) return false;

    // Customer check
    if (!searchCustomer) return true;
    const customer = customers.find(c => c.id === inv.customerId);
    if (!customer) return false;
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    return fullName.includes(searchCustomer.toLowerCase()) || 
      (inv.invoiceNumber || '').toLowerCase().includes(searchCustomer.toLowerCase()) ||
      (customer.company || '').toLowerCase().includes(searchCustomer.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground mt-1">Review billings, collect payments, and audit customer transactions.</p>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice #, customer name, company..."
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(e.target.value)}
            className="pl-9 bg-background border-border/80"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">
            Status:
          </span>
          <select
            value={searchStatus}
            onChange={(e) => setSearchStatus(e.target.value)}
            className="w-40 h-9 bg-background border border-border/80 text-xs px-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices List Grid */}
      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded-xl" />
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="border border-border/40 bg-card rounded-xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <FileText className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">No invoices found</h3>
          <p className="text-muted-foreground text-xs mb-4">
            {searchCustomer || searchStatus 
              ? "We couldn't find any invoices matching your search parameters." 
              : "Invoices are generated automatically when booking customer appointments."}
          </p>
          {(searchCustomer || searchStatus) && (
            <Button variant="outline" onClick={() => { setSearchCustomer(''); setSearchStatus(''); }}>
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-4">Invoice Number</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Line Items</th>
                <th className="p-4">Total Billed</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/65">
              {filteredInvoices.map(inv => {
                const customer = customers.find(c => c.id === inv.customerId);
                const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Client';
                const total = getInvoiceTotal(inv);

                return (
                  <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 font-bold text-foreground">{inv.invoiceNumber}</td>
                    <td className="p-4">
                      <p className="font-bold text-foreground">{customerName}</p>
                      {customer?.company && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{customer.company}</p>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground max-w-xs truncate">
                      {inv.items.map(it => `${it.name} x${it.quantity}`).join(', ')}
                    </td>
                    <td className="p-4 font-bold text-foreground">${(total / 100).toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        inv.status === 'paid' 
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                          : inv.status === 'cancelled'
                            ? 'bg-destructive/10 text-destructive border border-destructive/20'
                            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-4 text-right flex items-center justify-end gap-2">
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        download
                        className="p-1.5 rounded hover:bg-slate-100 text-muted-foreground hover:text-slate-800 transition-colors"
                        title="Download PDF Invoice"
                      >
                        <Printer className="h-4 w-4" />
                      </a>
                      
                      {inv.status === 'unpaid' && (
                        <Button 
                          onClick={() => openPaymentModal(inv)}
                          className="bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] h-7 px-2.5 flex items-center gap-1"
                        >
                          <DollarSign className="h-3 w-3" /> Log Payment
                        </Button>
                      )}
                      
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete invoice ${inv.invoiceNumber}?`)) {
                            deleteInvoiceMutation.mutate(inv.id!);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Collect Payment Modal */}
      {isAddPaymentOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Log Invoice Payment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Collect balance against invoice {selectedInvoice.invoiceNumber}.</p>
              </div>
              <button 
                onClick={() => { setIsAddPaymentOpen(false); setSelectedInvoice(null); }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              {paymentError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold">Collected Amount (USD) *</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={(paymentAmountCents / 100).toFixed(2)} 
                  onChange={(e) => setPaymentAmountCents(Math.round(parseFloat(e.target.value || '0') * 100))} 
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Credit/Debit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Transaction Notes</label>
                <textarea 
                  value={paymentNotes} 
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Receipt check #4019, card swipe txn ID..."
                  className="w-full min-h-[60px] p-2.5 text-xs bg-background border border-input rounded-lg focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => { setIsAddPaymentOpen(false); setSelectedInvoice(null); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Confirm Collection
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
