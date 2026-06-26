import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Calendar, FileText, 
  DollarSign, Plus, Check, MessageSquare, AlertCircle,
  Layers, PlusCircle, Edit2, X
} from 'lucide-react';
import { Customer, Booking, Service, Invoice, CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord } from 'shared';

export default function CustomerWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'timeline' | 'bookings' | 'billing' | 'custom-objects'>('timeline');
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [isNewCustomObjOpen, setIsNewCustomObjOpen] = useState(false);

  // Note Logger state
  const [newNote, setNewNote] = useState('');
  
  // Edit Profile form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editProfileError, setEditProfileError] = useState('');

  // New Booking form state
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingError, setBookingError] = useState('');

  // Add Payment form state
  const [paymentAmountCents, setPaymentAmountCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentError, setPaymentError] = useState('');

  // Custom Object Record Form State
  const [selectedCustomObjDef, setSelectedCustomObjDef] = useState<CustomObjectDefinition | null>(null);
  const [customObjRecordValues, setCustomObjRecordValues] = useState<Record<string, string>>({});
  const [customObjError, setCustomObjError] = useState('');

  // ----------------------------------------
  // Queries
  // ----------------------------------------
  const { data: customer, isLoading: isCustLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/api/customers/${id}`) as Promise<Customer & { customFields: Record<string, string> }>,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', { customerId: id }],
    queryFn: () => api.get(`/api/bookings?customerId=${id}`) as Promise<Booking[]>,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', { customerId: id }],
    queryFn: () => api.get(`/api/invoices?customerId=${id}`) as Promise<Invoice[]>,
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/api/services') as Promise<Service[]>,
  });

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ['customFieldDefs', 'customer'],
    queryFn: () => api.get('/api/custom-fields/definitions?entityType=customer') as Promise<CustomFieldDefinition[]>,
  });

  const { data: customObjDefs = [] } = useQuery({
    queryKey: ['customObjDefs'],
    queryFn: () => api.get('/api/custom-objects/definitions') as Promise<CustomObjectDefinition[]>,
  });

  // Query custom object records of selected definition for this customer
  const { data: customObjRecords = [] } = useQuery({
    queryKey: ['customObjRecords', selectedCustomObjDef?.id, id],
    queryFn: () => api.get(`/api/custom-objects/records?definitionId=${selectedCustomObjDef?.id}&customerId=${id}`) as Promise<CustomObjectRecord[]>,
    enabled: !!selectedCustomObjDef,
  });

  // Query custom field definitions for custom objects
  const { data: customObjFieldDefs = [] } = useQuery({
    queryKey: ['customFieldDefs', selectedCustomObjDef?.apiName],
    queryFn: () => api.get(`/api/custom-fields/definitions?entityType=${selectedCustomObjDef?.apiName}`) as Promise<CustomFieldDefinition[]>,
    enabled: !!selectedCustomObjDef,
  });

  // Sync edit profile form fields when customer details change
  React.useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setCompany(customer.company || '');
      setEmail(customer.email);
      setPhone(customer.phone || '');
      setMobile(customer.mobile || '');
      setAddress(customer.address || '');
      setNotes(customer.notes || '');
      setTagInput(customer.tags ? customer.tags.join(', ') : '');
      setCustomFieldValues(customer.customFields || {});
    }
  }, [customer]);

  // Sync selected custom object definitions
  React.useEffect(() => {
    if (customObjDefs.length > 0 && !selectedCustomObjDef) {
      setSelectedCustomObjDef(customObjDefs[0]);
    }
  }, [customObjDefs, selectedCustomObjDef]);

  const handleCustomFieldChange = (name: string, value: string) => {
    setCustomFieldValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // ----------------------------------------
  // Mutations
  // ----------------------------------------
  const updateCustomerMutation = useMutation({
    mutationFn: (updates: any) => api.put(`/api/customers/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setIsEditProfileOpen(false);
    },
    onError: (err: any) => {
      setEditProfileError(err.message || 'Failed to update profile');
    }
  });

  const logNoteMutation = useMutation({
    mutationFn: (notesText: string) => {
      const now = new Date().toLocaleString();
      const updatedNotes = `${customer?.notes || ''}\n\n[Note logged on ${now}]:\n${notesText}`.trim();
      return api.put(`/api/customers/${id}`, { notes: updatedNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setNewNote('');
    }
  });

  const createBookingMutation = useMutation({
    mutationFn: (bookingData: any) => api.post('/api/bookings', bookingData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', { customerId: id }] });
      queryClient.invalidateQueries({ queryKey: ['invoices', { customerId: id }] });
      setIsNewBookingOpen(false);
      setSelectedServiceId('');
      setBookingDate('');
      setBookingTime('');
      setBookingNotes('');
    },
    onError: (err: any) => {
      setBookingError(err.message || 'Failed to schedule booking');
    }
  });

  const createPaymentMutation = useMutation({
    mutationFn: (paymentData: any) => api.post(`/api/invoices/${selectedInvoice?.id}/payments`, paymentData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', { customerId: id }] });
      setIsAddPaymentOpen(false);
      setSelectedInvoice(null);
      setPaymentAmountCents(0);
      setPaymentNotes('');
    },
    onError: (err: any) => {
      setPaymentError(err.message || 'Failed to log payment');
    }
  });

  const createCustomObjRecordMutation = useMutation({
    mutationFn: (recordData: any) => api.post('/api/custom-objects/records', recordData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customObjRecords', selectedCustomObjDef?.id, id] });
      setIsNewCustomObjOpen(false);
      setCustomObjRecordValues({});
    },
    onError: (err: any) => {
      setCustomObjError(err.message || 'Failed to create record');
    }
  });

  const deleteCustomObjRecordMutation = useMutation({
    mutationFn: (recordId: string) => api.delete(`/api/custom-objects/records/${recordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customObjRecords', selectedCustomObjDef?.id, id] });
    }
  });

  // ----------------------------------------
  // Handlers
  // ----------------------------------------
  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setEditProfileError('First Name, Last Name, and Email are required.');
      return;
    }
    const tags = tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    updateCustomerMutation.mutate({
      firstName,
      lastName,
      company: company || undefined,
      email,
      phone: phone || undefined,
      mobile: mobile || undefined,
      address: address || undefined,
      notes: notes || undefined,
      tags,
      customFields: customFieldValues
    });
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || !bookingDate || !bookingTime) {
      setBookingError('All scheduling fields are required.');
      return;
    }
    createBookingMutation.mutate({
      customerId: id,
      serviceId: selectedServiceId,
      date: bookingDate,
      time: bookingTime,
      notes: bookingNotes
    });
  };

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

  const handleCustomObjSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomObjDef) return;
    createCustomObjRecordMutation.mutate({
      objectDefinitionId: selectedCustomObjDef.id,
      customerId: id,
      values: customObjRecordValues
    });
  };

  const openPaymentModal = (invoice: Invoice) => {
    // Calculate outstanding
    let invoiceTotal = 0;
    for (const item of invoice.items) {
      const sub = item.quantity * item.unitPrice;
      const tax = Math.round(sub * (item.taxRate / 100));
      invoiceTotal += sub + tax;
    }
    invoiceTotal -= invoice.discount;

    setSelectedInvoice(invoice);
    setPaymentAmountCents(invoiceTotal); // default to full payment
    setIsAddPaymentOpen(true);
  };

  // ----------------------------------------
  // Compile Timeline Data
  // ----------------------------------------
  const getTimelineFeed = () => {
    const feed: any[] = [];
    
    // 1. Bookings
    for (const b of bookings) {
      const serviceName = services.find(s => s.id === b.serviceId)?.name || 'Service Catalog Item';
      feed.push({
        id: b.id,
        type: 'booking',
        title: `Appointment ${b.status.toUpperCase()}`,
        description: `${serviceName} scheduled on ${b.date} at ${b.time}`,
        date: b.createdAt || b.date,
        icon: Calendar,
        color: b.status === 'completed' ? 'bg-emerald-500' : b.status === 'cancelled' ? 'bg-destructive' : 'bg-blue-500'
      });
    }

    // 2. Invoices
    for (const inv of invoices) {
      // Calculate total
      let total = 0;
      for (const item of inv.items) {
        const sub = item.quantity * item.unitPrice;
        total += sub + Math.round(sub * (item.taxRate / 100));
      }
      total -= inv.discount;

      feed.push({
        id: inv.id,
        type: 'invoice',
        title: `Invoice ${inv.invoiceNumber} Generated`,
        description: `Billed total of $${(total / 100).toFixed(2)} (${inv.status.toUpperCase()})`,
        date: inv.createdAt || '',
        icon: FileText,
        color: inv.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'
      });
    }

    // 3. Notes (Split from profile notes by log lines)
    if (customer?.notes) {
      const matches = customer.notes.match(/\[Note logged on [^\]]+\]:\n[\s\S]+?(?=\n\n\[Note logged on|$)/g);
      if (matches) {
        matches.forEach((m, idx) => {
          const titleLine = m.match(/\[Note logged on ([^\]]+)\]:/);
          const timestamp = titleLine ? titleLine[1] : '';
          const body = m.replace(/\[Note logged on [^\]]+\]:\n/, '');
          
          feed.push({
            id: `note-${idx}`,
            type: 'note',
            title: `Timeline Comment Logged`,
            description: body,
            date: timestamp,
            icon: MessageSquare,
            color: 'bg-indigo-500'
          });
        });
      }
    }

    // Sort desc by date
    feed.sort((a, b) => b.date.localeCompare(a.date));
    return feed;
  };

  if (isCustLoading || !customer) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-muted rounded-xl lg:col-span-1" />
          <div className="h-96 bg-muted rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const timelineFeed = getTimelineFeed();
  const customerFullName = `${customer.firstName} ${customer.lastName}`;
  const customerInitials = `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();

  return (
    <div className="space-y-6">
      {/* Top Navigation / Breadcrumbs */}
      <button 
        onClick={() => navigate('/customers')}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Customers Directory
      </button>

      {/* Main Grid Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Side Panel - Contact Detail Profile */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Card 1: Main Contact Info */}
          <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-border/40">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                {customerInitials}
              </div>
              <div>
                <h2 className="text-xl font-bold">{customerFullName}</h2>
                {customer.company && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1 font-medium">
                    <Briefcase className="h-3.5 w-3.5" /> {customer.company}
                  </p>
                )}
              </div>
              
              {customer.tags && customer.tags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {customer.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium border border-border/10">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Profile Fields List */}
            <div className="space-y-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Contact Details</span>
                <button 
                  onClick={() => setIsEditProfileOpen(true)}
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Edit2 className="h-3 w-3" /> Edit
                </button>
              </div>

              <div className="space-y-3 text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground/50 font-bold uppercase">Email</p>
                    <p className="text-foreground text-xs select-all">{customer.email}</p>
                  </div>
                </div>

                {customer.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground/50 font-bold uppercase">Phone</p>
                      <p className="text-foreground text-xs select-all">{customer.phone}</p>
                    </div>
                  </div>
                )}

                {customer.mobile && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground/50 font-bold uppercase">Mobile</p>
                      <p className="text-foreground text-xs select-all">{customer.mobile}</p>
                    </div>
                  </div>
                )}

                {customer.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground/50 font-bold uppercase">Address</p>
                      <p className="text-foreground text-xs select-all leading-normal">{customer.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Clean Notes */}
            {customer.notes && (
              <div className="pt-4 border-t border-border/40 space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">Profile Background</p>
                {/* Remove timestamp logs from pure profile notes for rendering in sidebar */}
                <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/20 whitespace-pre-line max-h-40 overflow-y-auto">
                  {customer.notes.replace(/\[Note logged on [^\]]+\]:\n[\s\S]+?(?=\n\n\[Note logged on|$)/g, '').trim() || 'No background summary logged.'}
                </p>
              </div>
            )}
          </div>

          {/* Card 2: Custom Properties */}
          {customFieldDefs.length > 0 && (
            <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm space-y-4">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] block">Custom Properties</span>
              <div className="space-y-3">
                {customFieldDefs.map(def => {
                  const val = customer.customFields?.[def.name];
                  
                  return (
                    <div key={def.id} className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/40 last:border-0 items-center">
                      <span className="text-xs text-muted-foreground font-medium col-span-1 shrink-0 truncate" title={def.label}>
                        {def.label}
                      </span>
                      <span className="text-xs font-semibold text-foreground text-right col-span-2 select-all truncate">
                        {val === 'true' ? 'Yes' : val === 'false' ? 'No' : val || '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side Panel - Hub Tab Panel Layout */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Navigation Tabs Bar */}
          <div className="flex border-b border-border gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-3 px-1 border-b-2 transition-all ${
                activeTab === 'timeline' 
                  ? 'border-primary text-primary font-bold' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('bookings')}
              className={`pb-3 px-1 border-b-2 transition-all ${
                activeTab === 'bookings' 
                  ? 'border-primary text-primary font-bold' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Bookings ({bookings.length})
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`pb-3 px-1 border-b-2 transition-all ${
                activeTab === 'billing' 
                  ? 'border-primary text-primary font-bold' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Invoices & Billing ({invoices.length})
            </button>
            <button
              onClick={() => setActiveTab('custom-objects')}
              className={`pb-3 px-1 border-b-2 transition-all ${
                activeTab === 'custom-objects' 
                  ? 'border-primary text-primary font-bold' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Custom Objects
            </button>
          </div>

          {/* TAB CONTENTS */}

          {/* Tab 1: Timeline */}
          {activeTab === 'timeline' && (
            <div className="space-y-6">
              
              {/* Note logger box */}
              <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm space-y-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={`Write a comment or update on ${customer.firstName}...`}
                  className="w-full min-h-[70px] p-3 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring resize-none"
                />
                <div className="flex justify-end">
                  <Button 
                    onClick={() => logNoteMutation.mutate(newNote)}
                    disabled={!newNote.trim() || logNoteMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs h-8 px-4"
                  >
                    {logNoteMutation.isPending ? 'Logging...' : 'Log Comment'}
                  </Button>
                </div>
              </div>

              {/* Feed List */}
              {timelineFeed.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground text-sm">
                  No activity history logged. Comments, invoices, and appointments will create a chronological timeline here.
                </div>
              ) : (
                <div className="relative border-l border-border/80 pl-6 ml-4 space-y-8 py-2">
                  {timelineFeed.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.id || index} className="relative">
                        
                        {/* Circle Indicator on vertical line */}
                        <div className={`absolute -left-[35px] top-1 h-6 w-6 rounded-full ${item.color} flex items-center justify-center text-white border-4 border-background shadow-sm`}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>

                        {/* Event Card */}
                        <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm hover:shadow-md transition-all space-y-1">
                          <div className="flex justify-between items-start gap-4">
                            <span className="font-bold text-sm text-foreground leading-tight">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0 font-medium bg-muted px-2 py-0.5 rounded">
                              {item.date.includes('T') ? item.date.split('T')[0] : item.date}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-normal whitespace-pre-line">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Bookings */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-foreground">Appointments</h3>
                <Button 
                  onClick={() => setIsNewBookingOpen(true)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 text-xs h-9"
                >
                  <Plus className="h-4 w-4" /> Book Appointment
                </Button>
              </div>

              {bookings.length === 0 ? (
                <div className="border border-border/40 bg-card rounded-xl p-12 text-center shadow-sm">
                  <Calendar className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                  <h4 className="font-bold text-sm mb-1">No appointments scheduled</h4>
                  <p className="text-xs text-muted-foreground mb-4">Book a slot in the catalog for this customer.</p>
                  <Button variant="outline" onClick={() => setIsNewBookingOpen(true)}>Book Slot</Button>
                </div>
              ) : (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="p-4">Service</th>
                        <th className="p-4">Date & Time</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/65">
                      {bookings.map(b => {
                        const service = services.find(s => s.id === b.serviceId);
                        
                        return (
                          <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4 font-bold text-foreground">{service?.name || 'Catalog Item'}</td>
                            <td className="p-4 font-medium">{b.date} at {b.time}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                b.status === 'completed' 
                                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                                  : b.status === 'cancelled'
                                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                    : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                              }`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="p-4 text-muted-foreground max-w-xs truncate" title={b.notes}>{b.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Billing & Invoices */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-foreground">Invoicing & Collections</h3>
              </div>

              {invoices.length === 0 ? (
                <div className="border border-border/40 bg-card rounded-xl p-12 text-center shadow-sm">
                  <FileText className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                  <h4 className="font-bold text-sm mb-1">No invoices generated</h4>
                  <p className="text-xs text-muted-foreground">Invoices are automatically issued when booking appointments.</p>
                </div>
              ) : (
                <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="p-4">Invoice #</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Total Billed</th>
                        <th className="p-4">Items</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/65">
                      {invoices.map(inv => {
                        let total = 0;
                        for (const item of inv.items) {
                          const sub = item.quantity * item.unitPrice;
                          total += sub + Math.round(sub * (item.taxRate / 100));
                        }
                        total -= inv.discount;

                        return (
                          <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4 font-bold text-foreground">{inv.invoiceNumber}</td>
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
                            <td className="p-4 font-bold text-foreground">${(total / 100).toFixed(2)}</td>
                            <td className="p-4 text-muted-foreground truncate max-w-[150px]">
                              {inv.items.map(it => `${it.name} x${it.quantity}`).join(', ')}
                            </td>
                            <td className="p-4 text-right">
                              {inv.status === 'unpaid' && (
                                <Button 
                                  onClick={() => openPaymentModal(inv)}
                                  className="bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] h-7 px-2.5 flex items-center gap-1 ml-auto"
                                >
                                  <DollarSign className="h-3 w-3" /> Log Payment
                                </Button>
                              )}
                              {inv.status === 'paid' && (
                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 justify-end">
                                  <Check className="h-3.5 w-3.5" /> Fully Collected
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Custom Objects Relational Cards */}
          {activeTab === 'custom-objects' && (
            <div className="space-y-6">
              {customObjDefs.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center text-muted-foreground text-sm">
                  No relational Custom Objects defined in settings. Register a definition (e.g. Vehicles, Properties) in the Settings panel first.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                  
                  {/* Objects Sidebar Select */}
                  <div className="md:col-span-1 bg-card border border-border/50 rounded-xl p-3 flex flex-row md:flex-col gap-1 overflow-x-auto shrink-0 shadow-sm">
                    {customObjDefs.map(def => (
                      <button
                        key={def.id}
                        onClick={() => setSelectedCustomObjDef(def)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                          selectedCustomObjDef?.id === def.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" /> {def.name}
                      </button>
                    ))}
                  </div>

                  {/* Objects Records Grid list */}
                  <div className="md:col-span-3 space-y-4">
                    <div className="flex justify-between items-center gap-4">
                      <h4 className="font-bold text-sm text-foreground">
                        {selectedCustomObjDef?.pluralName} list
                      </h4>
                      <Button 
                        onClick={() => setIsNewCustomObjOpen(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs h-8 px-3 flex items-center gap-1"
                      >
                        <PlusCircle className="h-3.5 w-3.5" /> Add {selectedCustomObjDef?.name}
                      </Button>
                    </div>

                    {customObjRecords.length === 0 ? (
                      <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-xs">
                        No {selectedCustomObjDef?.pluralName.toLowerCase()} records created for this customer.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {customObjRecords.map(rec => (
                          <div key={rec.id} className="bg-card border border-border/60 rounded-xl p-4 shadow-sm relative group">
                            
                            {/* Delete record float */}
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete this ${selectedCustomObjDef?.name.toLowerCase()} record?`)) {
                                  deleteCustomObjRecordMutation.mutate(rec.id!);
                                }
                              }}
                              className="absolute top-3 right-3 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>

                            <div className="space-y-3">
                              {/* Header */}
                              <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                                <Layers className="h-4 w-4 text-primary" />
                                <span className="text-xs font-bold text-foreground">
                                  {selectedCustomObjDef?.name} Card
                                </span>
                              </div>

                              {/* Attributes */}
                              <div className="space-y-1.5">
                                {customObjFieldDefs.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground">No field attributes defined for this object.</p>
                                ) : (
                                  customObjFieldDefs.map(def => {
                                    const val = rec.values?.[def.name];
                                    return (
                                      <div key={def.id} className="grid grid-cols-2 gap-1 text-[11px]">
                                        <span className="text-muted-foreground font-semibold truncate pr-1">{def.label}:</span>
                                        <span className="font-bold text-foreground truncate">{val || '—'}</span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------- */}
      {/* MODALS AND OVERLAYS                      */}
      {/* ---------------------------------------- */}

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Edit Customer Profile</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Modify properties and custom attributes.</p>
              </div>
              <button 
                onClick={() => { setIsEditProfileOpen(false); setEditProfileError(''); }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditProfileSubmit} className="p-6 space-y-6 flex-1">
              {editProfileError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editProfileError}</span>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">First Name *</label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Last Name *</label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Email *</label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Company</label>
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Phone</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Mobile</label>
                    <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Address</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Tags (comma separated)</label>
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Internal Notes</label>
                  <textarea 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full min-h-[80px] p-3 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                  />
                </div>
              </div>

              {/* Custom Fields section */}
              {customFieldDefs.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Custom Properties</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {customFieldDefs.map(def => {
                      const value = customFieldValues[def.name] || '';
                      
                      return (
                        <div key={def.id} className="space-y-1">
                          <label className="text-xs font-semibold">
                            {def.label} {def.required ? '*' : ''}
                          </label>
                          {def.type === 'textarea' ? (
                            <textarea
                              value={value}
                              onChange={(e) => handleCustomFieldChange(def.name, e.target.value)}
                              required={def.required}
                              className="w-full min-h-[60px] p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                            />
                          ) : def.type === 'dropdown' ? (
                            <select
                              value={value}
                              onChange={(e) => handleCustomFieldChange(def.name, e.target.value)}
                              required={def.required}
                              className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                            >
                              <option value="">Select option...</option>
                              {def.options.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : def.type === 'checkbox' ? (
                            <div className="flex items-center gap-2 py-2">
                              <input
                                type="checkbox"
                                checked={value === 'true'}
                                onChange={(e) => handleCustomFieldChange(def.name, e.target.checked ? 'true' : 'false')}
                                required={def.required}
                                className="h-4 w-4 rounded border-input text-primary focus:ring-ring bg-background"
                              />
                              <span className="text-sm text-muted-foreground">Enabled</span>
                            </div>
                          ) : (
                            <Input
                              type={
                                def.type === 'number' || def.type === 'currency' || def.type === 'percentage' 
                                  ? 'number' 
                                  : def.type === 'date' 
                                    ? 'date' 
                                    : def.type === 'datetime'
                                      ? 'datetime-local'
                                      : 'text'
                              }
                              value={value}
                              onChange={(e) => handleCustomFieldChange(def.name, e.target.value)}
                              required={def.required}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsEditProfileOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary text-primary-foreground">Save updates</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      {isNewBookingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Book Appointment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Locks catalog price. Auto-generates unpaid invoice.</p>
              </div>
              <button onClick={() => setIsNewBookingOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleBookingSubmit} className="p-6 space-y-4">
              {bookingError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold">Select Service Catalog Item *</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                >
                  <option value="">Choose service...</option>
                  {services.filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.id}>{s.name} — ${(s.price / 100).toFixed(2)}</option>
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
                  className="w-full min-h-[60px] p-2.5 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsNewBookingOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary text-primary-foreground">Book and Invoice</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Payment Modal */}
      {isAddPaymentOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Collect Payment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Attach cash or card collection to {selectedInvoice.invoiceNumber}.</p>
              </div>
              <button onClick={() => setIsAddPaymentOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              {paymentError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold">Payment Amount (USD) *</label>
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
                  placeholder="Receipt check number or transaction reference..."
                  className="w-full min-h-[60px] p-2.5 text-xs bg-background border border-input rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsAddPaymentOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary text-primary-foreground">Confirm Collection</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Object Record Modal */}
      {isNewCustomObjOpen && selectedCustomObjDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">New {selectedCustomObjDef.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Attach a {selectedCustomObjDef.name.toLowerCase()} relation card to this profile.</p>
              </div>
              <button onClick={() => setIsNewCustomObjOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleCustomObjSubmit} className="p-6 space-y-4">
              {customObjError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{customObjError}</span>
                </div>
              )}

              <div className="space-y-3">
                {customObjFieldDefs.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    No custom fields have been added to this object schema. Configure fields in settings first!
                  </div>
                ) : (
                  customObjFieldDefs.map(def => {
                    const value = customObjRecordValues[def.name] || '';
                    
                    return (
                      <div key={def.id} className="space-y-1">
                        <label className="text-xs font-semibold">
                          {def.label} {def.required ? '*' : ''}
                        </label>

                        {def.type === 'dropdown' ? (
                          <select
                            value={value}
                            onChange={(e) => setCustomObjRecordValues(p => ({ ...p, [def.name]: e.target.value }))}
                            required={def.required}
                            className="w-full h-10 p-2 text-sm bg-background border border-input rounded-lg focus:outline-none"
                          >
                            <option value="">Select option...</option>
                            {def.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                            value={value}
                            onChange={(e) => setCustomObjRecordValues(p => ({ ...p, [def.name]: e.target.value }))}
                            required={def.required}
                            placeholder={`Enter ${def.label.toLowerCase()}...`}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setIsNewCustomObjOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={customObjFieldDefs.length === 0} className="bg-primary text-primary-foreground">Save Relational Card</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
