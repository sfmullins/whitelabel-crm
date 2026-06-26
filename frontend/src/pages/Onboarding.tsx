import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSchema, Settings } from 'shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Sparkles, Building2, Palette, Landmark, ArrowRight, ArrowLeft } from 'lucide-react';

const COLOR_PRESETS = [
  { name: 'Sleek Dark (Default)', primary: '#0f172a', secondary: '#3b82f6', accent: '#10b981' },
  { name: 'Ocean Breeze', primary: '#0891b2', secondary: '#0ea5e9', accent: '#f43f5e' },
  { name: 'Forest Tech', primary: '#064e3b', secondary: '#10b981', accent: '#f59e0b' },
  { name: 'Royal Purple', primary: '#4c1d95', secondary: '#8b5cf6', accent: '#ec4899' },
];

interface OnboardingProps {
  onSuccess: () => void;
}

export default function Onboarding({ onSuccess }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Settings>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      businessName: '',
      logoUrl: '',
      primaryColor: '#0f172a',
      secondaryColor: '#3b82f6',
      accentColor: '#10b981',
      address: '',
      phone: '',
      email: '',
      website: '',
      invoiceFooter: 'Thank you for your business!',
      defaultTaxRate: 8.25,
      currency: 'USD',
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
    }
  });

  const selectedPrimary = watch('primaryColor');
  const selectedSecondary = watch('secondaryColor');
  const selectedAccent = watch('accentColor');

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setValue('logoUrl', base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setValue('primaryColor', preset.primary);
    setValue('secondaryColor', preset.secondary);
    setValue('accentColor', preset.accent);
  };

  const onSubmit = async (data: Settings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const err = await res.json();
        alert(`Error saving settings: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(error);
      alert('Network error while saving settings.');
    }
  };

  const nextStep = (e: React.MouseEvent) => {
    e.preventDefault();
    // Validate current step fields before proceeding
    if (step === 1) {
      const bizName = watch('businessName');
      const email = watch('email');
      const phone = watch('phone');
      const address = watch('address');
      
      if (!bizName || !email || !phone || !address) {
        alert('Please fill out all required fields on this step.');
        return;
      }
    }
    setStep((prev) => prev + 1);
  };

  const prevStep = (e: React.MouseEvent) => {
    e.preventDefault();
    setStep((prev) => prev - 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden transition-all duration-300">
        
        {/* Header Branding */}
        <div className="bg-slate-900 px-8 py-6 text-white flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-400" />
              CRM Onboarding
            </h1>
            <p className="text-slate-400 text-sm mt-1">Configure your workspace settings.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
            <span className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
            <span className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8">
          
          {/* STEP 1: BUSINESS PROFILE */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Building2 className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-800">Business Profile</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Business Name *</label>
                  <Input {...register('businessName')} placeholder="e.g. Acme Corporation" />
                  {errors.businessName && <span className="text-xs text-red-500">{errors.businessName.message}</span>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Business Email *</label>
                  <Input {...register('email')} type="email" placeholder="billing@acme.com" />
                  {errors.email && <span className="text-xs text-red-500">{errors.email.message}</span>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Phone Number *</label>
                  <Input {...register('phone')} placeholder="+1 (555) 123-4567" />
                  {errors.phone && <span className="text-xs text-red-500">{errors.phone.message}</span>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Website URL (Optional)</label>
                  <Input {...register('website')} placeholder="https://acme.com" />
                  {errors.website && <span className="text-xs text-red-500">{errors.website.message}</span>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Business Address *</label>
                <textarea 
                  {...register('address')} 
                  rows={2} 
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                  placeholder="Street name, Suite, City, Postcode"
                />
                {errors.address && <span className="text-xs text-red-500">{errors.address.message}</span>}
              </div>
            </div>
          )}

          {/* STEP 2: BRANDING */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Palette className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-800">Dynamic White-Label Branding</h2>
              </div>

              {/* Logo Upload */}
              <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-lg">
                <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-semibold text-slate-600 block">Company Logo (Optional)</label>
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" />
                </div>
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 block">Select Preset Palette</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="p-2 border border-slate-200 rounded-lg text-left hover:border-slate-400 transition"
                    >
                      <span className="text-[10px] font-semibold text-slate-600 block mb-1 truncate">{preset.name}</span>
                      <div className="flex gap-1">
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary }} />
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.secondary }} />
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.accent }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Pickers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                    Primary Color
                    <span className="text-[10px] text-slate-400">{selectedPrimary}</span>
                  </label>
                  <div className="flex gap-2">
                    <Input {...register('primaryColor')} type="text" className="font-mono text-center" />
                    <input type="color" value={selectedPrimary} onChange={(e) => setValue('primaryColor', e.target.value)} className="w-10 h-10 border border-slate-200 rounded-md cursor-pointer" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                    Secondary Color
                    <span className="text-[10px] text-slate-400">{selectedSecondary}</span>
                  </label>
                  <div className="flex gap-2">
                    <Input {...register('secondaryColor')} type="text" className="font-mono text-center" />
                    <input type="color" value={selectedSecondary} onChange={(e) => setValue('secondaryColor', e.target.value)} className="w-10 h-10 border border-slate-200 rounded-md cursor-pointer" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                    Accent Color
                    <span className="text-[10px] text-slate-400">{selectedAccent}</span>
                  </label>
                  <div className="flex gap-2">
                    <Input {...register('accentColor')} type="text" className="font-mono text-center" />
                    <input type="color" value={selectedAccent} onChange={(e) => setValue('accentColor', e.target.value)} className="w-10 h-10 border border-slate-200 rounded-md cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: FINANCIALS & LOCALIZATION */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Landmark className="w-5 h-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-800">Financials & Localization</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Default Tax Rate (%)</label>
                  <Input {...register('defaultTaxRate', { valueAsNumber: true })} type="number" step="0.01" />
                  {errors.defaultTaxRate && <span className="text-xs text-red-500">{errors.defaultTaxRate.message}</span>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Currency Symbol/Code</label>
                  <select {...register('currency')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Date Format</label>
                  <select {...register('dateFormat')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-06-26)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 26/06/2026)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 06/26/2026)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Timezone</label>
                  <select {...register('timezone')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="UTC">Coordinated Universal Time (UTC)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Invoice Terms/Footer</label>
                <textarea 
                  {...register('invoiceFooter')} 
                  rows={2} 
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Terms, conditions, bank details..."
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between gap-4">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={prevStep} className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            ) : (
              <div /> // Spacer
            )}

            {step < 3 ? (
              <Button type="button" onClick={nextStep} className="flex items-center gap-2">
                Next <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="submit" className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800">
                Finish Setup
              </Button>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
