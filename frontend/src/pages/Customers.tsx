import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Plus, Search, Tag, X, User, Briefcase, Mail, Phone, MapPin, 
  ChevronRight, Settings as SettingsIcon, AlertCircle
} from 'lucide-react';
import { Customer, CustomFieldDefinition } from 'shared';

export default function Customers() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
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
  const [errorMsg, setErrorMsg] = useState('');

  // Queries
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: () => api.get(`/api/customers?search=${search}`),
  });

  const { data: customFieldDefs = [] } = useQuery<CustomFieldDefinition[]>({
    queryKey: ['customFieldDefs', 'customer'],
    queryFn: () => api.get('/api/custom-fields/definitions?entityType=customer'),
    enabled: isModalOpen, // Fetch only when modal opens
  });

  // Mutation
  const createCustomerMutation = useMutation({
    mutationFn: (newCustomer: any) => api.post('/api/customers', newCustomer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to create customer');
    }
  });

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setCompany('');
    setEmail('');
    setPhone('');
    setMobile('');
    setAddress('');
    setNotes('');
    setTagInput('');
    setCustomFieldValues({});
    setErrorMsg('');
  };

  const handleCustomFieldChange = (name: string, value: string) => {
    setCustomFieldValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErrorMsg('First Name, Last Name, and Email are required.');
      return;
    }

    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const payload = {
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
    };

    createCustomerMutation.mutate(payload);
  };

  // Get unique tags across all fetched customers for filter list
  const allTags = Array.from(
    new Set(customers.flatMap(c => c.tags || []))
  );

  const filteredCustomers = selectedTag
    ? customers.filter(c => c.tags?.includes(selectedTag))
    : customers;

  // Initials hash helper for avatar background color
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-600',
      'from-emerald-500 to-teal-600',
      'from-amber-500 to-orange-600',
      'from-rose-500 to-red-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your client directory, review histories, and update properties.
          </p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 self-start sm:self-center"
        >
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name, company, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border/80"
          />
        </div>

        {/* Tag pills list */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1 font-medium mr-1">
              <Tag className="h-3 w-3" /> Filter:
            </span>
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-full border transition-all ${
                !selectedTag 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
              }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 rounded-full border transition-all ${
                  selectedTag === tag 
                    ? 'bg-primary text-primary-foreground border-primary' 
                    : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid directory */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border/40 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-5/6" />
            </div>
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="border border-border/40 bg-card rounded-xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <User className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">No customers found</h3>
          <p className="text-muted-foreground text-sm mb-6">
            {search || selectedTag 
              ? "We couldn't find any clients matching your filter criteria." 
              : "Let's build your client list! Add your first customer profile to get started."}
          </p>
          {(search || selectedTag) && (
            <Button variant="outline" onClick={() => { setSearch(''); setSelectedTag(null); }}>
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map(customer => {
            const fullName = `${customer.firstName} ${customer.lastName}`;
            const initials = `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();
            
            return (
              <div 
                key={customer.id} 
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="group bg-card hover:bg-muted/10 border border-border/60 hover:border-primary/30 rounded-xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Top card metadata */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${getAvatarColor(fullName)} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                        {initials}
                      </div>
                      <div>
                        <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors flex items-center gap-1.5">
                          {fullName}
                        </h3>
                        {customer.company && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Briefcase className="h-3 w-3 shrink-0" /> {customer.company}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all self-center" />
                  </div>

                  {/* Contact stats */}
                  <div className="space-y-2 text-xs text-muted-foreground pt-1">
                    {customer.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="truncate">{customer.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags bottom badge list */}
                {customer.tags && customer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-border/40">
                    {customer.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium border border-border/20">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Customer Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col">
            
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Add New Customer</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Register a new client profile in your local database.</p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
              {errorMsg && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Core Information Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">First Name *</label>
                    <Input 
                      value={firstName} 
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. Jane"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Last Name *</label>
                    <Input 
                      value={lastName} 
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g. Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Email *</label>
                    <Input 
                      type="email"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. jane.doe@example.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Company</label>
                    <Input 
                      value={company} 
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Phone</label>
                    <Input 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. (555) 123-4567"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Mobile</label>
                    <Input 
                      value={mobile} 
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="e.g. (555) 987-6543"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Address</label>
                  <Input 
                    value={address} 
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 123 Main St, Seattle, WA 98101"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Tags (comma separated)</label>
                  <Input 
                    value={tagInput} 
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. vip, lead, residential"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Internal Notes</label>
                  <textarea 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Provide notes or background info..."
                    className="w-full min-h-[80px] p-3 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                  />
                </div>
              </div>

              {/* Custom Properties Loader Section */}
              {customFieldDefs.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Custom Properties</h3>
                  </div>

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
                              placeholder={`Enter ${def.label.toLowerCase()}...`}
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
                              placeholder={`Enter ${def.label.toLowerCase()}...`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-border">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => { setIsModalOpen(false); resetForm(); }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createCustomerMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {createCustomerMutation.isPending ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
