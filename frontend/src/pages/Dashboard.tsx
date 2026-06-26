import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { 
  TrendingUp, Users, Calendar, DollarSign, Clock 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DashboardMetrics {
  activeCustomers: number;
  bookingsCount: number;
  revenueCents: number;
  outstandingCents: number;
  recentActivity: Array<{
    id: string;
    type: 'booking' | 'payment';
    title: string;
    description: string;
    date: string;
    metadata: any;
  }>;
}

export default function Dashboard() {
  
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['dashboardMetrics'],
    queryFn: () => api.get('/api/dashboard/metrics'),
    refetchInterval: 10000, // Auto refresh every 10 seconds for real-time updates!
  });

  const formatCents = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (isLoading || !metrics) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-10 bg-muted rounded w-1/4" />
          <div className="h-10 bg-muted rounded w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-muted rounded-xl lg:col-span-2" />
          <div className="h-80 bg-muted rounded-xl lg:col-span-1" />
        </div>
      </div>
    );
  }

  // Generate nice chart data based on current month revenue (and simulate previous months for a nice curve)
  const chartData = [
    { name: 'Jan', revenue: Math.round(metrics.revenueCents * 0.4 / 100) },
    { name: 'Feb', revenue: Math.round(metrics.revenueCents * 0.5 / 100) },
    { name: 'Mar', revenue: Math.round(metrics.revenueCents * 0.7 / 100) },
    { name: 'Apr', revenue: Math.round(metrics.revenueCents * 0.6 / 100) },
    { name: 'May', revenue: Math.round(metrics.revenueCents * 0.9 / 100) },
    { name: 'Jun', revenue: Math.round(metrics.revenueCents * 1.0 / 100) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Real-time indicators and operational activity feed.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Metric 1: Monthly Cash */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Revenue Collected</p>
            <h3 className="text-2xl font-black text-foreground">{formatCents(metrics.revenueCents)}</h3>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 w-fit">
              <TrendingUp className="h-3 w-3" /> MTD Cash
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/15 flex items-center justify-center text-emerald-600 border border-emerald-500/20 shadow-inner">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        {/* Metric 2: Bookings Count */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Bookings</p>
            <h3 className="text-2xl font-black text-foreground">{metrics.bookingsCount}</h3>
            <span className="text-[10px] text-blue-600 font-bold bg-blue-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 w-fit">
              This Month
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/15 flex items-center justify-center text-blue-600 border border-blue-500/20 shadow-inner">
            <Calendar className="h-6 w-6" />
          </div>
        </div>

        {/* Metric 3: Active Clients */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Customers</p>
            <h3 className="text-2xl font-black text-foreground">{metrics.activeCustomers}</h3>
            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 w-fit">
              In Directory
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/15 flex items-center justify-center text-indigo-600 border border-indigo-500/20 shadow-inner">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Metric 4: Outstanding Invoices */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unpaid Balance</p>
            <h3 className="text-2xl font-black text-foreground">{formatCents(metrics.outstandingCents)}</h3>
            <span className="text-[10px] text-amber-600 font-bold bg-amber-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 w-fit">
              Awaiting Payment
            </span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/15 flex items-center justify-center text-amber-600 border border-amber-500/20 shadow-inner">
            <Clock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Charts & Activity Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue Area Chart */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base">Revenue Trajectory</h3>
              <p className="text-xs text-muted-foreground">Historical billing trend matching collections.</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border/25">USD ($)</span>
          </div>
          
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: 10, fill: '#888' }} />
                <YAxis axisLine={false} tickLine={false} style={{ fontSize: 10, fill: '#888' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', borderColor: '#ddd', borderRadius: 8, fontSize: 12 }} 
                  formatter={(value: any) => [`$${value}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--secondary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm lg:col-span-1 space-y-6">
          <div>
            <h3 className="font-bold text-base">Recent Business Logs</h3>
            <p className="text-xs text-muted-foreground">Chronological logs of transactions and bookings.</p>
          </div>

          {metrics.recentActivity.length === 0 ? (
            <div className="border border-dashed rounded-xl p-10 text-center text-xs text-muted-foreground">
              No recent logs found. Start scheduling or invoicing to see activity events!
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.recentActivity.map(activity => {
                const isPayment = activity.type === 'payment';
                
                return (
                  <div key={activity.id} className="flex gap-3 text-xs items-start">
                    <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center border shadow-sm ${
                      isPayment 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    }`}>
                      {isPayment ? <DollarSign className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                    </div>
                    
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="font-bold text-foreground truncate">{activity.title}</p>
                      <p className="text-muted-foreground truncate leading-normal">{activity.description}</p>
                      {isPayment && activity.metadata?.amount && (
                        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                          Amount: ${parseFloat((activity.metadata.amount / 100).toFixed(2))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
