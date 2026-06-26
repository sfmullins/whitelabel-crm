import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Plus, Search, Clock, DollarSign, X, 
  Trash2, AlertCircle, Sparkles 
} from 'lucide-react';
import { Service } from 'shared';

export default function Services() {
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30); // minutes
  const [priceCents, setPriceCents] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Queries
  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ['services', includeInactive],
    queryFn: () => api.get(`/api/services?includeInactive=${includeInactive}`),
  });

  // Mutations
  const createServiceMutation = useMutation({
    mutationFn: (newService: any) => api.post('/api/services', newService),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to create service catalog item');
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Service> }) => api.put(`/api/services/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Cannot delete service catalog item because it is referenced in appointments or invoices.');
    }
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setDuration(30);
    setPriceCents(0);
    setTaxRate(0);
    setIsActive(true);
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || duration <= 0 || priceCents < 0) {
      setErrorMsg('Name, duration, and price are required.');
      return;
    }

    createServiceMutation.mutate({
      name,
      description: description || undefined,
      duration,
      price: priceCents,
      taxRate,
      isActive
    });
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Service Catalog</h1>
          <p className="text-muted-foreground mt-1">Manage catalog offers, duration templates, and taxes.</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 self-start sm:self-center"
        >
          <Plus className="h-4 w-4" /> Add Catalog Item
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search catalog services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border/80"
          />
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="checkbox"
            id="includeInactive"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring bg-background"
          />
          <label htmlFor="includeInactive" className="text-xs font-semibold text-muted-foreground cursor-pointer">
            Include archived/inactive templates
          </label>
        </div>
      </div>

      {/* Catalog items grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted rounded-xl" />
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="border border-border/40 bg-card rounded-xl p-12 text-center max-w-lg mx-auto shadow-sm">
          <Sparkles className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">No services found</h3>
          <p className="text-muted-foreground text-xs mb-6">Create a catalog item representing a service you charge clients for.</p>
          <Button onClick={() => setIsModalOpen(true)}>Add Catalog Item</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map(service => (
            <div 
              key={service.id} 
              className={`bg-card border rounded-xl p-6 shadow-sm flex flex-col justify-between transition-all group relative ${
                service.isActive 
                  ? 'border-border/60 hover:border-primary/20 hover:shadow-md' 
                  : 'border-border/30 opacity-60'
              }`}
            >
              
              {/* Delete action float */}
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${service.name}" completely from catalog?`)) {
                    deleteServiceMutation.mutate(service.id!);
                  }
                }}
                className="absolute top-4 right-4 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              <div className="space-y-4">
                {/* Header info */}
                <div className="space-y-1 pr-6">
                  <h3 className="font-bold text-base leading-tight flex items-center gap-2">
                    {service.name}
                    {!service.isActive && (
                      <span className="text-[9px] font-bold tracking-wider uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border/10">
                        Archived
                      </span>
                    )}
                  </h3>
                  {service.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {service.description}
                    </p>
                  )}
                </div>

                {/* Duration and Cost Stats */}
                <div className="flex gap-4 text-xs font-semibold text-muted-foreground pt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <span>{service.duration} mins</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="text-foreground">${(service.price / 100).toFixed(2)}</span>
                  </div>
                  {service.taxRate > 0 && (
                    <div className="text-[10px] text-muted-foreground/50 self-center">
                      ({service.taxRate}% tax)
                    </div>
                  )}
                </div>
              </div>

              {/* Status Toggle control footer */}
              <div className="flex justify-between items-center mt-5 pt-3 border-t border-border/40 text-xs">
                <span className="text-muted-foreground font-semibold">Active Status</span>
                <button
                  onClick={() => toggleActiveMutation.mutate({
                    id: service.id!,
                    updates: { isActive: !service.isActive }
                  })}
                  className={`px-2.5 py-1 rounded-md font-bold text-[10px] uppercase border transition-all ${
                    service.isActive 
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-emerald-500/20' 
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground border-border/10'
                  }`}
                >
                  {service.isActive ? 'Active' : 'Archived'}
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Add Catalog Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Add Service Catalog Item</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Define a service catalog template.</p>
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
                <label className="text-xs font-semibold">Service Name *</label>
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. Initial Inspection Consultation"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Service Description</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Details about what the service involves..."
                  className="w-full min-h-[60px] p-2.5 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Duration (minutes) *</label>
                  <Input 
                    type="number" 
                    value={duration} 
                    onChange={(e) => setDuration(parseInt(e.target.value || '0', 10))} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Price (USD) *</label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={(priceCents / 100).toFixed(2)} 
                    onChange={(e) => setPriceCents(Math.round(parseFloat(e.target.value || '0') * 100))} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Tax Rate (%)</label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={taxRate} 
                    onChange={(e) => setTaxRate(parseFloat(e.target.value || '0'))} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold block mb-1">Catalog Status</label>
                  <div className="flex items-center gap-2 py-2">
                    <input 
                      type="checkbox"
                      id="isActiveCheck"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary bg-background"
                    />
                    <label htmlFor="isActiveCheck" className="text-xs font-medium cursor-pointer">
                      Make active immediately
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Save Template
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
