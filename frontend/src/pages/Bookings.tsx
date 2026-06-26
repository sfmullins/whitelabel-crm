import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Plus, Search, Calendar, X, Trash2, AlertCircle 
} from 'lucide-react';
import { Booking, Customer, Service } from 'shared';

export default function Bookings() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filters
  const [searchDate, setSearchDate] = useState('');
  const [searchCustomer, setSearchCustomer] = useState('');
  
  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Queries
  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['bookings', searchDate],
    queryFn: () => api.get(`/api/bookings?date=${searchDate}`),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/api/customers'),
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/api/services'),
  });

  // Mutations
  const createBookingMutation = useMutation({
    mutationFn: (newBooking: any) => api.post('/api/bookings', newBooking),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to create booking');
    }
  });

  const updateBookingStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'pending' | 'confirmed' | 'completed' | 'cancelled' }) => 
      api.put(`/api/bookings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    }
  });

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    }
  });

  const resetForm = () => {
    setSelectedCustomerId('');
    setSelectedServiceId('');
    setBookingDate('');
    setBookingTime('');
    setBookingNotes('');
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedServiceId || !bookingDate || !bookingTime) {
      setErrorMsg('All fields are required.');
      return;
    }

    createBookingMutation.mutate({
      customerId: selectedCustomerId,
      serviceId: selectedServiceId,
      date: bookingDate,
      time: bookingTime,
      notes: bookingNotes
    });
  };

  // Filter bookings locally by customer name
  const filteredBookings = bookings.filter(b => {
    const cust = customers.find(c => c.id === b.customerId);
    if (!cust) return true;
    const fullName = `${cust.firstName} ${cust.lastName}`.toLowerCase();
    return fullName.includes(searchCustomer.toLowerCase()) || 
      (cust.company || '').toLowerCase().includes(searchCustomer.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground mt-1">Schedule services, assign customers, and review itineraries.</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 self-start sm:self-center"
        >
          <Plus className="h-4 w-4" /> Book Appointment
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer name or company..."
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(e.target.value)}
            className="pl-9 bg-background border-border/80"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 shrink-0">
            <Calendar className="h-4 w-4" /> Date Filter:
          </span>
          <Input 
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="w-40 h-9 bg-background border-border/80 text-xs py-1"
          />
          {searchDate && (
            <button 
              onClick={() => setSearchDate('')}
              className="text-xs text-muted-foreground hover:text-primary underline font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Bookings Grid list */}
      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-xl" />
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="border border-border/40 bg-card rounded-xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <Calendar className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">No bookings scheduled</h3>
          <p className="text-muted-foreground text-xs mb-6">
            {searchDate || searchCustomer 
              ? "We couldn't find any appointments matching your filters." 
              : "Let's schedule your first slot. Select a client, service catalog item, and pick a date!"}
          </p>
          {(searchDate || searchCustomer) ? (
            <Button variant="outline" onClick={() => { setSearchCustomer(''); setSearchDate(''); }}>
              Reset Filters
            </Button>
          ) : (
            <Button onClick={() => setIsModalOpen(true)}>Book Appointment</Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-4">Customer</th>
                <th className="p-4">Service</th>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Status</th>
                <th className="p-4">Notes</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/65">
              {filteredBookings.map(b => {
                const customer = customers.find(c => c.id === b.customerId);
                const service = services.find(s => s.id === b.serviceId);
                const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Client';
                const customerCompany = customer?.company ? ` (${customer.company})` : '';

                return (
                  <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-foreground">{customerName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{customerCompany || customer?.email}</p>
                    </td>
                    <td className="p-4 font-bold text-foreground">{service?.name || 'Catalog Item'}</td>
                    <td className="p-4 font-medium">{b.date} at {b.time}</td>
                    <td className="p-4">
                      <select
                        value={b.status}
                        onChange={(e: any) => updateBookingStatusMutation.mutate({ id: b.id!, status: e.target.value })}
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-background border focus:outline-none focus:ring-1 focus:ring-ring ${
                          b.status === 'completed' 
                            ? 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5' 
                            : b.status === 'cancelled'
                              ? 'text-destructive border-destructive/20 bg-destructive/5'
                              : 'text-blue-600 border-blue-500/20 bg-blue-500/5'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="p-4 text-muted-foreground max-w-xs truncate" title={b.notes}>{b.notes || '—'}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this booking slot? (Does not delete invoice)')) {
                            deleteBookingMutation.mutate(b.id!);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-auto block"
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

      {/* Add Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Schedule Appointment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Locks price. Triggers invoice auto-generation.</p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold">Select Customer *</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Choose customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} {c.company ? `(${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Select Service Catalog Item *</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Choose service...</option>
                  {services.filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ${(s.price / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Date *</label>
                  <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Time *</label>
                  <Input type="time" value={bookingTime} onChange={(e) => setBookingTime(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Appointment Notes</label>
                <textarea 
                  value={bookingNotes} 
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Special instructions or prep requests..."
                  className="w-full min-h-[65px] p-2.5 text-xs bg-background border border-input rounded-lg focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Book and Invoice
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
