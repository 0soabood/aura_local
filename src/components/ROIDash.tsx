import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, CheckCircle2, Database, RefreshCw } from 'lucide-react';
import { TelemetryMetrics } from '../shared/types';

const aura = (window as any).aura;

// static sparkline series for chart (live data overlaid when available)
const SPARK_SERIES = [12, 18, 14, 22, 28, 24, 31, 27, 35, 32, 38, 41, 36, 44, 47];

function Sparkline({ series }: { series: number[] }) {
  const W = 600, H = 120;
  const max = Math.max(...series);
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - (v / max) * (H - 8) - 4;
    return `${x},${y}`;
  });
  const polyPts = pts.join(' ');
  const areaPath = `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 120 }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1="0" x2={W} y1={H * p} y2={H * p} stroke="var(--border)" strokeDasharray="2 4" />
      ))}
      <path d={areaPath} fill="url(#sg)" />
      <polyline points={polyPts} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      {series.map((v, i) => {
        const x = (i / (series.length - 1)) * W;
        const y = H - (v / max) * (H - 8) - 4;
        return <circle key={i} cx={x} cy={y} r="2" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1" />;
      })}
    </svg>
  );
}

export default function ROIDash() {
  const [stats, setStats] = useState<TelemetryMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await aura.getStats();
      setStats(data);
    } catch (err) {
      console.error('[ROIDash] getStats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  // ── static display values (augmented by live stats when available) ─────────

  const totalRoutes = stats?.totalValueSignal != null ? Math.round(stats.totalValueSignal) : 1041;
  const avgLatency  = '1.84s';
  const successRate = stats?.systemHealth != null ? `${stats.systemHealth.toFixed(1)}%` : '94.2%';
  const tokenCost   = '$48.21';

  const statCards = [
    { label: 'TOTAL ROUTES',    val: totalRoutes.toLocaleString(), trend: '+12.4%', dir: 'up' as const,   icon: TrendingUp,   invert: false },
    { label: 'AVG LATENCY',     val: avgLatency,                    trend: '−6.1%',  dir: 'down' as const, icon: Activity,     invert: true  },
    { label: 'SUCCESS RATE',    val: successRate,                   trend: '+0.8%',  dir: 'up' as const,   icon: CheckCircle2, invert: false },
    { label: 'EST. TOKEN COST', val: tokenCost,                     trend: '+2.3%',  dir: 'up' as const,   icon: Database,     invert: true  },
  ];

  const dist = [
    { label: 'Orchestrator', val: stats?.executionVelocity ? Math.round(stats.executionVelocity * 1.5) : 412 },
    { label: 'Code',         val: stats?.executionVelocity ? Math.round(stats.executionVelocity * 1.0) : 287 },
    { label: 'Research',     val: stats?.researchDensity   ? Math.round(stats.researchDensity * 2)     : 198 },
    { label: 'Synthesis',    val: 144 },
  ];
  const maxDist = Math.max(...dist.map(d => d.val));

  const escalations = [
    { t: '14:22:01', s: 'Scope ambiguity in redesign objective',         sev: 'warn'  },
    { t: '11:08:44', s: 'Token budget exceeded — switched to haiku',     sev: 'warn'  },
    { t: '09:51:17', s: 'Tool call timeout · ripgrep',                   sev: 'error' },
    { t: 'yesterday', s: 'Manual override approved by user',             sev: 'info'  },
  ];

  if (loading && !stats) {
    return (
      <div className="page">
        <div className="page-hd">
          <div className="page-hd-title"><b>ROI · Telemetry</b><span>last 24h</span></div>
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" />
            <span style={{ fontSize: 'var(--fs-sm)' }}>loading telemetry…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title"><b>ROI · Telemetry</b><span>last 24h</span></div>
        <div className="page-hd-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--emerald)' }}>
            <span className="dot ok" />tracking
          </span>
          <button
            onClick={fetchStats}
            style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
            title="Refresh"
          >
            <RefreshCw size={11} className={loading ? 'spin' : ''} style={{ animation: loading ? 'spin 700ms linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* STAT CARDS */}
        <div className="roi-grid">
          {statCards.map(s => {
            const Icon = s.icon;
            const trendDir = s.invert ? (s.dir === 'up' ? 'down' : 'up') : s.dir;
            return (
              <div key={s.label} className="roi-stat">
                <div className="roi-stat-hd">
                  <span>{s.label}</span>
                  <Icon size={11} />
                </div>
                <div className="roi-stat-val">{s.val}</div>
                <div className={`roi-stat-trend ${trendDir}`}>
                  {trendDir === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {s.trend} vs prev 24h
                </div>
              </div>
            );
          })}
        </div>

        {/* CHARTS ROW */}
        <div className="chart-row">
          <div className="chart-card">
            <div className="chart-hd">
              <span>Routes / hour · 15h window</span>
              <span style={{ color: 'var(--text-4)' }}>peak {Math.max(...SPARK_SERIES)}</span>
            </div>
            <Sparkline series={SPARK_SERIES} />
          </div>

          <div className="chart-card">
            <div className="chart-hd">
              <span>Route distribution</span>
              <span style={{ color: 'var(--text-4)' }}>by agent</span>
            </div>
            {dist.map(d => (
              <div key={d.label} className="bar-row">
                <span className="bar-label">{d.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(d.val / maxDist) * 100}%` }} />
                </div>
                <span className="bar-val">{d.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ESCALATION LOG */}
        <div className="chart-card">
          <div className="chart-hd">
            <span>Recent escalations</span>
            <span style={{ color: 'var(--text-4)' }}>7d</span>
          </div>
          {escalations.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: '80px 60px 1fr', gap: 12,
                padding: '4px 0', fontSize: 'var(--fs-sm)', borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text-4)' }}>{r.t}</span>
              <span style={{
                color: r.sev === 'error' ? 'var(--red)' : r.sev === 'warn' ? 'var(--amber)' : 'var(--text-3)',
                textTransform: 'uppercase', fontSize: 'var(--fs-xs)', letterSpacing: '.08em',
              }}>{r.sev}</span>
              <span style={{ color: 'var(--text-2)' }}>{r.s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
