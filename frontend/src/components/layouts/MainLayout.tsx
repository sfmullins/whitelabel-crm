import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useBranding } from '../../hooks/useBranding';
import Onboarding from '../../pages/Onboarding';
import { 
  LayoutDashboard, Users, Layers, Calendar, FileText, 
  Settings, Search, Plus 
} from 'lucide-react';
import { Button } from '../ui/button';

export default function MainLayout() {
  const { settings, isLoading, needsOnboarding, refetch } = useBranding();
  const navigate = useNavigate();
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener (CTRL+K or CMD+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Autofocus input when modal opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isSearchOpen]);

  // Instant query search API trigger
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Failed to run search', err);
      } finally {
        setIsSearching(false);
      }
    }, 150);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-slate-900"></div>
        <p className="text-slate-500 font-medium text-sm">Booting CRM Workspace...</p>
      </div>
    );
  }

  // Intercept and force onboarding if settings do not exist
  if (needsOnboarding) {
    return <Onboarding onSuccess={refetch} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r bg-white flex flex-col justify-between shrink-0 hidden md:flex">
        <div className="flex flex-col gap-6 p-6">
          
          {/* Logo Branding */}
          <div className="flex items-center gap-3">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-9 h-9 object-contain" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm">
                {settings?.businessName[0].toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <h2 className="font-bold text-slate-800 leading-tight truncate">{settings?.businessName}</h2>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Workspace</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            <NavLink
              to="/"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </NavLink>

            <NavLink
              to="/customers"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Users className="w-4 h-4" />
              Customers
            </NavLink>

            <NavLink
              to="/bookings"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Calendar className="w-4 h-4" />
              Bookings
            </NavLink>

            <NavLink
              to="/invoices"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <FileText className="w-4 h-4" />
              Invoices
            </NavLink>

            <NavLink
              to="/services"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Layers className="w-4 h-4" />
              Services
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Settings className="w-4 h-4" />
              Settings
            </NavLink>
          </nav>
        </div>

        {/* Footer Info */}
        <div className="p-6 border-t bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Local Database Mode
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header bar */}
        <header className="h-16 border-b bg-white flex items-center justify-between px-8 shrink-0">
          
          {/* Left search bar trigger */}
          <div 
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-3 max-w-md w-full bg-slate-50 border rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-100/60 transition-all select-none"
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-400 w-full text-left truncate">
              Search customers, invoices...
            </span>
            <span className="text-[10px] text-slate-400 bg-white border rounded px-1.5 font-semibold shadow-sm shrink-0">CTRL+K</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            
            {/* Quick Create Button */}
            <div className="relative group">
              <Button size="sm" className="flex items-center gap-1.5" onClick={() => navigate('/customers')}>
                <Plus className="w-4 h-4" /> Create Profile
              </Button>
            </div>

            {/* Profile indicator */}
            <div className="w-8 h-8 rounded-full bg-slate-100 border flex items-center justify-center text-xs font-bold text-slate-700 select-none">
              AD
            </div>

          </div>

        </header>

        {/* Dynamic page mount */}
        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Spotlight Overlay Modal */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-[15vh] p-4 animate-fade-in"
          onClick={() => setIsSearchOpen(false)}
        >
          <div 
            className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input bar */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type customer name, email, or invoice number..."
                className="bg-transparent text-sm outline-none w-full placeholder:text-slate-400 text-foreground"
              />
              <span className="text-[10px] text-slate-400 bg-muted px-1.5 py-0.5 rounded font-semibold border border-border/10">ESC</span>
            </div>

            {/* Search results list */}
            <div className="max-h-[300px] overflow-y-auto p-2 text-xs">
              {isSearching ? (
                <div className="p-6 text-center text-muted-foreground font-medium">Running local query search...</div>
              ) : searchQuery.trim().length < 2 ? (
                <div className="p-6 text-center text-muted-foreground font-medium">Type at least 2 characters to search.</div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground font-medium">No matches found in directory.</div>
              ) : (
                <div className="space-y-4 p-1">
                  {searchResults.map(categoryGroup => (
                    <div key={categoryGroup.category} className="space-y-1.5">
                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {categoryGroup.category}
                      </div>
                      <div className="space-y-1">
                        {categoryGroup.items.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              navigate(item.url);
                              setIsSearchOpen(false);
                            }}
                            className="px-3 py-2.5 rounded-lg hover:bg-muted/80 cursor-pointer flex flex-col gap-1 transition-colors border border-transparent hover:border-border/30"
                          >
                            <span className="font-bold text-foreground text-sm leading-none">{item.title}</span>
                            <span className="text-muted-foreground text-[10px]">{item.subtitle}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
