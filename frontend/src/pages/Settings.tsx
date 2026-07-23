import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSchema, Settings } from 'shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Building2, Palette, Landmark, ShieldAlert, Database, Download, Upload, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'custom' | 'backups'>('profile');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // CSV Import State
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [importStatus, setImportStatus] = useState<{ success?: boolean; count?: number; errors?: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Queries
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then(res => res.json()),
  });

  const { data: backups = [], refetch: refetchBackups } = useQuery<any[]>({
    queryKey: ['backups'],
    queryFn: () => fetch('/api/backups').then(res => res.json()),
    enabled: activeTab === 'backups',
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<Settings>({
    resolver: zodResolver(SettingsSchema),
  });

  useEffect(() => {
    if (settings) {
      reset(settings);
      if (settings.logoUrl) {
        setLogoPreview(settings.logoUrl);
      }
    }
  }, [settings, reset]);

  // Settings update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Settings) => fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      alert('Settings updated successfully!');
    },
    onError: (err) => {
      console.error(err);
      alert('Failed to save settings.');
    }
  });

  // Desktop Application Info
  const [appInfo, setAppInfo] = useState<{ version: string; userDataPath: string } | null>(null);

  // Backup Configuration State (persisted in localStorage)
  const [externalDir, setExternalDir] = useState(localStorage.getItem('backup_external_dir') || '');
  const [externalEnabled, setExternalEnabled] = useState(localStorage.getItem('backup_external_enabled') === 'true');
  
  const [encryptionEnabled, setEncryptionEnabled] = useState(localStorage.getItem('backup_encryption_enabled') === 'true');
  const [backupPassword, setBackupPassword] = useState('');

  const [s3Enabled, setS3Enabled] = useState(localStorage.getItem('backup_s3_enabled') === 'true');
  const [s3Endpoint, setS3Endpoint] = useState(localStorage.getItem('backup_s3_endpoint') || '');
  const [s3Region, setS3Region] = useState(localStorage.getItem('backup_s3_region') || '');
  const [s3Bucket, setS3Bucket] = useState(localStorage.getItem('backup_s3_bucket') || '');
  const [s3Prefix, setS3Prefix] = useState(localStorage.getItem('backup_s3_prefix') || '');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');

  const [dailyCount, setDailyCount] = useState(Number(localStorage.getItem('backup_daily_count') || '7'));
  const [weeklyCount, setWeeklyCount] = useState(Number(localStorage.getItem('backup_weekly_count') || '4'));
  const [monthlyCount, setMonthlyCount] = useState(Number(localStorage.getItem('backup_monthly_count') || '12'));

  useEffect(() => {
    if ((window as any).desktop) {
      (window as any).desktop.getApplicationInfo().then((info: any) => {
        setAppInfo(info);
      });
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem('backup_password');
    localStorage.removeItem('backup_s3_access_key');
    localStorage.removeItem('backup_s3_secret_key');
  }, []);

  useEffect(() => {
    localStorage.setItem('backup_external_dir', externalDir);
    localStorage.setItem('backup_external_enabled', String(externalEnabled));
    localStorage.setItem('backup_encryption_enabled', String(encryptionEnabled));
    localStorage.setItem('backup_s3_enabled', String(s3Enabled));
    localStorage.setItem('backup_s3_endpoint', s3Endpoint);
    localStorage.setItem('backup_s3_region', s3Region);
    localStorage.setItem('backup_s3_bucket', s3Bucket);
    localStorage.setItem('backup_s3_prefix', s3Prefix);
    localStorage.setItem('backup_daily_count', String(dailyCount));
    localStorage.setItem('backup_weekly_count', String(weeklyCount));
    localStorage.setItem('backup_monthly_count', String(monthlyCount));
  }, [externalDir, externalEnabled, encryptionEnabled, s3Enabled, s3Endpoint, s3Region, s3Bucket, s3Prefix, dailyCount, weeklyCount, monthlyCount]);

  // Backup mutations
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      let keyHex: string | undefined;
      if (encryptionEnabled && backupPassword) {
        const msgBuffer = new TextEncoder().encode(backupPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        keyHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalDirectory: externalEnabled ? externalDir : undefined,
          encryptionKeyHex: keyHex,
          s3Config: s3Enabled ? {
            endpoint: s3Endpoint,
            region: s3Region,
            bucket: s3Bucket,
            prefix: s3Prefix,
            accessKeyId: s3AccessKey,
            secretAccessKey: s3SecretKey
          } : undefined,
          dailyRetentionCount: dailyCount,
          weeklyRetentionCount: weeklyCount,
          monthlyRetentionCount: monthlyCount
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      refetchBackups();
      setBackupPassword('');
      setS3AccessKey('');
      setS3SecretKey('');
      alert('Database backup created successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to create database backup: ${err.message || err}`);
    }
  });

  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => fetch(`/api/backups/${filename}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetchBackups();
    },
    onError: () => alert('Failed to delete backup file.')
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      let keyHex: string | undefined;
      if (filename.endsWith('.crmbackup') && encryptionEnabled && backupPassword) {
        const msgBuffer = new TextEncoder().encode(backupPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        keyHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, encryptionKeyHex: keyHex }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: (res) => {
      alert(res.message || 'Database state restored successfully!');
      if ((window as any).desktop) {
        alert('Restarting application to apply changes...');
        (window as any).desktop.restartApplication();
      } else {
        window.location.reload();
      }
    },
    onError: (err: any) => {
      console.error(err);
      alert(`Failed to restore database: ${err.message || err}`);
    }
  });

  const selectedPrimary = watch('primaryColor') || '#0f172a';
  const selectedSecondary = watch('secondaryColor') || '#3b82f6';
  const selectedAccent = watch('accentColor') || '#10b981';

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

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvFileContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleCsvImport = async () => {
    if (!csvFileContent) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: csvFileContent }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setImportStatus({ success: true, count: data.importedCount, errors: data.errors });
        setCsvFileContent(null);
        setCsvFileName('');
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      } else {
        setImportStatus({ success: false, errors: data.errors || ['Customer import failed. Check validation logs.'] });
      }
    } catch (err: any) {
      setImportStatus({ success: false, errors: [err.message || 'Fatal csv format error'] });
    } finally {
      setIsImporting(false);
    }
  };

  const onSubmit = (data: Settings) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure company branding, local database backups, and custom metadata objects.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 select-none">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <Building2 className="w-4 h-4" />
            Profile & Branding
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <Landmark className="w-4 h-4" />
            Invoicing & Tax
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'custom' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <Palette className="w-4 h-4" />
            Custom Fields & Objects
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'backups' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <Database className="w-4 h-4" />
            Backups & Recovery
          </button>
        </aside>

        {/* Content Pane */}
        <div className="flex-1 bg-card border rounded-xl shadow-sm overflow-hidden p-6">
          <form onSubmit={handleSubmit(onSubmit)}>
            
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Business Profile & Branding</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Control how your CRM looks and displays to clients.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Business Name</label>
                    <Input {...register('businessName')} />
                    {errors.businessName && <span className="text-xs text-red-500">{errors.businessName.message}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Business Email</label>
                    <Input {...register('email')} />
                    {errors.email && <span className="text-xs text-red-500">{errors.email.message}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                    <Input {...register('phone')} />
                    {errors.phone && <span className="text-xs text-red-500">{errors.phone.message}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Website</label>
                    <Input {...register('website')} />
                    {errors.website && <span className="text-xs text-red-500">{errors.website.message}</span>}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Business Address</label>
                  <textarea {...register('address')} rows={3} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  {errors.address && <span className="text-xs text-red-500">{errors.address.message}</span>}
                </div>

                {/* Logo & Colors */}
                <div className="border-t pt-6 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-800">White-Label Cosmetics</h4>
                  
                  <div className="flex items-center gap-6 p-4 bg-muted/30 rounded-lg">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden border">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">Upload Custom Logo</label>
                      <input type="file" accept="image/*" onChange={handleLogoChange} className="text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">Primary Color</label>
                      <div className="flex gap-2">
                        <Input {...register('primaryColor')} className="font-mono text-center" />
                        <input type="color" value={selectedPrimary} onChange={(e) => setValue('primaryColor', e.target.value)} className="w-10 h-10 border rounded-md cursor-pointer shrink-0" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">Secondary Color</label>
                      <div className="flex gap-2">
                        <Input {...register('secondaryColor')} className="font-mono text-center" />
                        <input type="color" value={selectedSecondary} onChange={(e) => setValue('secondaryColor', e.target.value)} className="w-10 h-10 border rounded-md cursor-pointer shrink-0" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground block">Accent Color</label>
                      <div className="flex gap-2">
                        <Input {...register('accentColor')} className="font-mono text-center" />
                        <input type="color" value={selectedAccent} onChange={(e) => setValue('accentColor', e.target.value)} className="w-10 h-10 border rounded-md cursor-pointer shrink-0" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button type="submit">Save Profile Settings</Button>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Invoicing & Financial Settings</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Define currency codes, defaults, and invoicing footers.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Default Tax Rate (%)</label>
                    <Input {...register('defaultTaxRate', { valueAsNumber: true })} type="number" step="0.01" />
                    {errors.defaultTaxRate && <span className="text-xs text-red-500">{errors.defaultTaxRate.message}</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Currency System</label>
                    <select {...register('currency')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CAD">CAD ($)</option>
                      <option value="AUD">AUD ($)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Date Format</label>
                    <select {...register('dateFormat')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Timezone</label>
                    <select {...register('timezone')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Default Invoice Footer terms</label>
                  <textarea {...register('invoiceFooter')} rows={4} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button type="submit">Save Financial Settings</Button>
                </div>
              </div>
            )}

            {activeTab === 'custom' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Custom Fields & Objects Definitions</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Extend the database dynamically. Add metadata schema tags.</p>
                </div>

                <div className="p-4 bg-muted/20 border rounded-lg flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <h4 className="font-semibold text-slate-800">Dynamic Metadata Customization</h4>
                    <p className="text-slate-600 mt-1">Custom fields can be created directly on customer profile details panel. Database seeds define target templates automatically.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-semibold text-sm">Registered Custom Objects</span>
                  </div>
                  <div className="text-sm text-muted-foreground text-center py-6 bg-slate-50 border rounded-md">
                    Relational schemas verified. Registered active objects: **Vehicle**.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'backups' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">Database Backups & Portability</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Export, restore, or create database backups of your SQLite database.</p>
                </div>

                {/* Desktop environment system info */}
                {appInfo && (
                  <div className="p-4 bg-slate-50 border rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-700 block">Desktop App v{appInfo.version}</span>
                      <span className="text-muted-foreground font-mono block mt-0.5">UserData: {appInfo.userDataPath}</span>
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => (window as any).desktop.openPath(appInfo.userDataPath)}
                      className="text-[10px] py-1 px-2 border-slate-300 hover:bg-slate-100"
                    >
                      Open Folder
                    </Button>
                  </div>
                )}

                {/* Backup Settings Panel */}
                <div className="border rounded-lg p-5 space-y-4 bg-white shadow-sm">
                  <span className="font-semibold text-sm block border-b pb-2 text-slate-800">Backup Configuration</span>
                  
                  {/* External Drive Backup */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={externalEnabled} 
                        onChange={(e) => setExternalEnabled(e.target.checked)} 
                        className="rounded border-slate-300"
                      />
                      Enable External Drive Backup Location
                    </label>
                    {externalEnabled && (
                      <div className="flex gap-2 items-center">
                        <Input 
                          placeholder="Select an external storage path" 
                          value={externalDir} 
                          onChange={(e) => setExternalDir(e.target.value)}
                          className="text-xs h-8 flex-1"
                        />
                        {(window as any).desktop && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={async () => {
                              const path = await (window as any).desktop.chooseBackupDirectory();
                              if (path) setExternalDir(path);
                            }}
                            className="text-xs h-8 px-3 border-slate-300"
                          >
                            Browse...
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Archive Encryption */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={encryptionEnabled} 
                        onChange={(e) => setEncryptionEnabled(e.target.checked)} 
                        className="rounded border-slate-300"
                      />
                      Encrypt Backup Archives (AES-256-GCM)
                    </label>
                    {encryptionEnabled && (
                      <div className="max-w-md">
                        <Input 
                          type="password" 
                          placeholder="Enter archive encryption password" 
                          value={backupPassword} 
                          onChange={(e) => setBackupPassword(e.target.value)}
                          className="text-xs h-8"
                        />
                        <span className="text-[10px] text-amber-600 block mt-1">
                          ⚠️ Make sure to remember this password. You will need it to restore this backup.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* GFS Retention Policy */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-700 block">GFS Retention Schedule Counts</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground block">Daily Snapshots</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={dailyCount} 
                          onChange={(e) => setDailyCount(Number(e.target.value))}
                          className="text-xs h-8 mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block">Weekly Snapshots</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={weeklyCount} 
                          onChange={(e) => setWeeklyCount(Number(e.target.value))}
                          className="text-xs h-8 mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block">Monthly Snapshots</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={monthlyCount} 
                          onChange={(e) => setMonthlyCount(Number(e.target.value))}
                          className="text-xs h-8 mt-0.5"
                        />
                      </div>
                    </div>
                  </div>

                  {/* S3 Remote Sync */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input 
                        type="checkbox" 
                        checked={s3Enabled} 
                        onChange={(e) => setS3Enabled(e.target.checked)} 
                        className="rounded border-slate-300"
                      />
                      Enable S3-Compatible Remote Sync
                    </label>
                    {s3Enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] text-muted-foreground block">S3 Endpoint</label>
                          <Input 
                            placeholder="https://s3.amazonaws.com" 
                            value={s3Endpoint} 
                            onChange={(e) => setS3Endpoint(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block">S3 Region</label>
                          <Input 
                            placeholder="us-east-1" 
                            value={s3Region} 
                            onChange={(e) => setS3Region(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block">Bucket Name</label>
                          <Input 
                            placeholder="my-crm-backups" 
                            value={s3Bucket} 
                            onChange={(e) => setS3Bucket(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block">Path Prefix</label>
                          <Input 
                            placeholder="backups/" 
                            value={s3Prefix} 
                            onChange={(e) => setS3Prefix(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block">Access Key ID</label>
                          <Input 
                            placeholder="AKIA..." 
                            value={s3AccessKey} 
                            onChange={(e) => setS3AccessKey(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block">Secret Access Key</label>
                          <Input 
                            type="password"
                            placeholder="••••••••••••••••" 
                            value={s3SecretKey} 
                            onChange={(e) => setS3SecretKey(e.target.value)}
                            className="text-xs h-8 mt-0.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-5 space-y-3 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-primary" />
                        <h4 className="font-semibold text-sm">Create New Backup</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Saves a clean snapshot of the SQLite database in the backup directory.</p>
                    </div>
                    <Button 
                      type="button" 
                      onClick={() => createBackupMutation.mutate()} 
                      disabled={createBackupMutation.isPending}
                      className="w-full mt-2"
                    >
                      {createBackupMutation.isPending ? 'Backing up...' : 'Run Backup Now'}
                    </Button>
                  </div>

                  <div className="border rounded-lg p-5 space-y-3 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-emerald-500" />
                        <h4 className="font-semibold text-sm">Import Customers (CSV)</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Upload a CSV file containing headers: <code>first_name</code>, <code>last_name</code>, <code>email</code>, etc.</p>
                    </div>
                    <div className="space-y-2 mt-2">
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleCsvFileChange} 
                        className="text-xs w-full block" 
                      />
                      {csvFileName && (
                        <div className="flex items-center justify-between text-xs bg-white border p-1.5 rounded">
                          <span className="truncate max-w-[150px] font-mono text-[10px]">{csvFileName}</span>
                          <Button 
                            type="button" 
                            size="sm" 
                            onClick={handleCsvImport}
                            disabled={isImporting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white py-0.5 px-2 text-[10px]"
                          >
                            {isImporting ? 'Importing...' : 'Upload & Import'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {importStatus && (
                  <div className={`p-4 rounded-lg border text-xs space-y-2 ${importStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <h4 className="font-bold">{importStatus.success ? `Successfully imported ${importStatus.count} customers.` : 'Import failed.'}</h4>
                    {importStatus.errors && importStatus.errors.length > 0 && (
                      <ul className="list-disc pl-4 space-y-0.5 font-mono max-h-[120px] overflow-y-auto">
                        {importStatus.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-3 border-t pt-4">
                  <span className="font-semibold text-sm block">System Backup History</span>
                  
                  {backups.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6 bg-slate-50 border rounded-md">
                      No backups found in directory. Click 'Run Backup Now' above to generate one.
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden bg-white">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b">
                            <th className="p-3 font-semibold text-slate-600">File Name</th>
                            <th className="p-3 font-semibold text-slate-600">Size</th>
                            <th className="p-3 font-semibold text-slate-600">Date Created</th>
                            <th className="p-3 font-semibold text-slate-600 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {backups.map((bk: any) => (
                            <tr key={bk.filename} className="hover:bg-slate-50">
                              <td className="p-3 font-mono truncate max-w-[200px]">{bk.filename}</td>
                              <td className="p-3 text-muted-foreground">{(bk.sizeBytes / 1024).toFixed(1)} KB</td>
                              <td className="p-3 text-muted-foreground">{new Date(bk.createdAt).toLocaleString()}</td>
                              <td className="p-3 text-right space-x-2">
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => {
                                    if(confirm('Are you sure you want to restore? This will replace all active database data.')) {
                                      restoreBackupMutation.mutate(bk.filename);
                                    }
                                  }}
                                  disabled={restoreBackupMutation.isPending}
                                  className="text-[10px] py-1 px-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  Restore
                                </Button>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => {
                                    if(confirm('Delete backup file permanently?')) {
                                      deleteBackupMutation.mutate(bk.filename);
                                    }
                                  }}
                                  disabled={deleteBackupMutation.isPending}
                                  className="text-[10px] py-1 px-2 border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

          </form>
        </div>

      </div>
    </div>
  );
}
