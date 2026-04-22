import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Activity, 
  CheckCircle2, 
  Zap, 
  Shield, 
  Database,
  ArrowUpRight,
  RefreshCw,
  Info
} from 'lucide-react';
import { TelemetryMetrics } from '../shared/types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

const aura = (window as any).aura;

export default function ROIDash() {
  const [stats, setStats] = useState<TelemetryMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await aura.getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!stats && loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-800 font-mono">
        <RefreshCw size={24} className="animate-spin mb-4" />
        <p className="tracking-widest uppercase text-[9px] font-bold">Synchronizing Telemetry Sensors...</p>
      </div>
    );
  }

  const metricCards = [
    { 
      label: 'Value Signal', 
      value: stats?.totalValueSignal.toFixed(1), 
      unit: 'ROI',
      icon: TrendingUp, 
      color: 'text-aura-success', 
      inferred: true
    },
    { 
      label: 'Exec Velocity', 
      value: stats?.executionVelocity, 
      unit: 'OPS/W',
      icon: Zap, 
      color: 'text-aura-warn', 
    },
    { 
      label: 'Vault Density', 
      value: stats?.researchDensity, 
      unit: 'RECORDS',
      icon: Database, 
      color: 'text-aura-accent', 
    },
    { 
      label: 'Kernel Health', 
      value: stats?.systemHealth, 
      unit: 'PERC',
      icon: Activity, 
      color: 'text-purple-500', 
    },
  ];

  return (
    <div className="flex flex-col h-full bg-aura-panel font-mono text-zinc-400">
      <div className="aura-title-bar shrink-0">
        <div className="flex items-center gap-2">
          <span className="operator-label">Telemetry Sensors</span>
          <span className="text-[10px] text-zinc-800">|</span>
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Active Stream</span>
        </div>
        <button 
          onClick={fetchStats}
          className="text-zinc-600 hover:text-white transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 aura-scroll-y p-6">
        <div className="max-w-6xl mx-auto">
          {/* Main Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {metricCards.map((card, i) => (
              <div
                key={card.label}
                className="aura-panel p-4 bg-aura-panel/40 border border-aura-border relative overflow-hidden group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="operator-label">{card.label}</span>
                  <card.icon size={12} className={card.color} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-zinc-200 tracking-tighter">{card.value}</span>
                  <span className="text-[8px] text-zinc-800 font-bold uppercase tracking-widest">{card.unit}</span>
                </div>
                <div className="mt-4 h-1 bg-aura-bg/50 overflow-hidden">
                  <div className={`h-full opacity-20 ${card.color.replace('text-', 'bg-')}`} style={{ width: '60%' }} />
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                  <card.icon size={80} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 aura-panel bg-aura-panel/20 p-6">
               <div className="operator-label mb-6 flex items-center gap-2">
                 <Activity size={12} className="text-aura-accent" /> Processing Magnitude // 07D_WINDOW
               </div>
               <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.recentActivity}>
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 8, fill: '#3f3f46', fontFamily: 'JetBrains Mono' }}
                      tickFormatter={(val) => val.split('-').slice(2).join('')}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', fontSize: '9px', fontFamily: 'JetBrains Mono' }}
                    />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]} barSize={32}>
                      {stats?.recentActivity.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === stats.recentActivity.length - 1 ? 'var(--color-aura-accent)' : '#27272a'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="aura-panel bg-aura-panel/20 p-6 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="operator-label absolute top-4 left-4">Integrity_Index</div>
                <div className="relative">
                  <div className="text-5xl font-black text-zinc-100 mb-2 tabular-nums">{stats?.systemHealth}</div>
                  <div className="absolute -right-6 top-1 text-[8px] text-zinc-700 font-bold uppercase tracking-widest rotate-90">Percentage</div>
                </div>
                <p className="text-[9px] text-zinc-800 uppercase tracking-widest text-center max-w-[120px] mt-4 font-bold leading-relaxed">System Verification Confidence Metric</p>
                <div className="w-full mt-8 flex flex-col gap-1.5 px-4 text-[8px] uppercase tracking-widest text-zinc-700 font-bold">
                  <div className="flex justify-between">
                    <span>Signal_Strength</span>
                    <span>99.2%</span>
                  </div>
                  <div className="w-full h-[3px] bg-zinc-900 overflow-hidden">
                    <div className="h-full bg-aura-accent" style={{ width: '99%' }} />
                  </div>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <div className="aura-panel p-4 flex items-center justify-between border-aura-border bg-aura-bg/20">
               <div className="flex items-center gap-3">
                 <div className="w-1 h-4 bg-aura-success/30 rounded-full" />
                 <span className="operator-label">Terminal Milestones</span>
               </div>
               <span className="text-lg font-bold text-zinc-300 tabular-nums">{stats?.tasksCompleted}</span>
            </div>
            <div className="aura-panel p-4 flex items-center justify-between border-aura-border bg-aura-bg/20">
               <div className="flex items-center gap-3">
                 <div className="w-1 h-4 bg-aura-accent/30 rounded-full" />
                 <span className="operator-label">In-Flight Proposals</span>
               </div>
               <span className="text-lg font-bold text-zinc-300 tabular-nums">{stats?.activeProposals}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
