// src/components/ROIDash.tsx
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, DollarSign, Gauge, Route } from 'lucide-react';
import type { TelemetryMetricsV2 } from '../shared/types';
import { Sparkline, Spinner, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

interface KPI { label: string; value: string; unit?: string; delta: string; spark: number[]; accent: 'none' | 'chart' | 'oxblood'; Icon: any; }

export default function ROIDash() {
  const [stats, setStats] = useState<TelemetryMetricsV2 | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try { 
      const data = await getAura()?.getStatsV2?.();
      setStats(data || { total_routes: 0, avg_latency_ms: 0, success_rate: 0, est_token_cost_usd: 0, hourly_latency_ms: Array(24).fill(0), spend_series_usd: Array(24).fill(0) }); 
    }
    catch (err) { console.error('[ROIDash]', err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  if (loading || !stats) return <div className="page"><div className="page-body"><Spinner /></div></div>;

  const kpis: KPI[] = [
    { label: 'TOTAL ROUTES', value: stats.total_routes.toLocaleString(), delta: '+184', spark: [22,28,24,31,27,34,30,38,36,42,39,45,41,47,44,50,46,52,49,55,51,58,54,60], accent: 'none', Icon: Route },
    { label: 'AVG LATENCY', value: (stats.avg_latency_ms/1000).toFixed(2), unit: 's', delta: '−0.12s', spark: stats.hourly_latency_ms, accent: 'chart', Icon: Gauge },
    { label: 'SUCCESS RATE', value: (stats.success_rate*100).toFixed(1), unit: '%', delta: '+1.8pp', spark: [88,90,89,91,92,93,94.2], accent: 'none', Icon: Activity },
    { label: 'EST. TOKEN COST', value: stats.est_token_cost_usd.toFixed(2), unit: '$', delta: '+$6.40', spark: stats.spend_series_usd, accent: 'oxblood', Icon: DollarSign },
  ];

  const accentBg = (a: KPI['accent']) => a === 'chart' ? 'var(--chartreuse)' : a === 'oxblood' ? 'var(--oxblood)' : 'var(--card)';
  const accentFg = (a: KPI['accent']) => a === 'oxblood' ? 'var(--bone)' : 'var(--ink)';

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <SectionNum n="04" />
          <b>R · O · I</b>
          <span>return on instruction · last 24h</span>
        </div>
        <div className="page-hd-actions">
          <span className="tag">LAST 24H</span>
          <span className="tag verified">LIVE</span>
        </div>
      </div>
      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {kpis.map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              style={{ border: '2px solid var(--rule)', background: accentBg(k.accent), color: k.accent === 'none' ? 'var(--text)' : accentFg(k.accent),
                padding: 16, boxShadow: 'var(--shadow-hard-lg)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="caps" style={{ opacity: 0.85 }}>{k.label}</span>
                <k.Icon size={14} />
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 4, marginTop: 10 }}>
                {k.unit === '$' && <span className="display" style={{ fontSize: 24 }}>$</span>}
                <span className="display" style={{ fontSize: 56, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{k.value}</span>
                {k.unit && k.unit !== '$' && <span className="display" style={{ fontSize: 24 }}>{k.unit}</span>}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
                <span className="mono" style={{ fontSize: 10 }}>Δ {k.delta}</span>
                <Sparkline data={k.spark} w={80} h={22} stroke={1.5} />
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginTop: 24 }}>
          <div style={{ border: '2px solid var(--rule)', background: 'var(--card)', padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="display" style={{ fontSize: 22 }}>Latency, by the hour</div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>seconds · 24 buckets</span>
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, borderBottom: '2px solid var(--rule)', borderLeft: '2px solid var(--rule)', padding: '0 4px 0 6px' }}>
              {stats.hourly_latency_ms.map((v, i) => (
                <div key={i} style={{ flex: 1, height: `${(v / 3000) * 100}%`,
                  background: i === stats.hourly_latency_ms.length - 1 ? 'var(--oxblood)' : 'var(--bone)',
                  border: '1px solid var(--rule)' }} />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 9 }}>00h</span>
              <span className="mono" style={{ fontSize: 9 }}>06h</span>
              <span className="mono" style={{ fontSize: 9 }}>12h</span>
              <span className="mono" style={{ fontSize: 9 }}>18h</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--oxblood)', fontWeight: 700 }}>NOW · {(stats.avg_latency_ms/1000).toFixed(2)}s</span>
            </div>
          </div>
          <div style={{ border: '2px solid var(--rule)', padding: 18, background: 'var(--paper)' }}>
            <div className="caps">TOKEN BUDGET</div>
            <div className="display" style={{ fontSize: 38, marginTop: 6, lineHeight: 1 }}>${stats.est_token_cost_usd.toFixed(2)}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>of $200.00 ceiling</div>
            <div style={{ marginTop: 14, height: 22, border: '2px solid var(--rule)', position: 'relative', background: 'var(--card)' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min((stats.est_token_cost_usd / 200) * 100, 100)}%`, background: 'var(--oxblood)' }} />
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to right, var(--rule) 0 1px, transparent 1px 20px)' }} />
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 9 }}>$0</span>
              <span className="mono" style={{ fontSize: 9 }}>$100</span>
              <span className="mono" style={{ fontSize: 9 }}>$200</span>
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px dashed var(--rule)' }}>
              <div className="caps" style={{ marginBottom: 6 }}>TOP CONSUMERS</div>
              {stats.top_consumers && stats.top_consumers.length > 0 ? (
                stats.top_consumers.map((item) => (
                  <div key={item.name} className="row" style={{ justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                    <span className="display" style={{ fontSize: 13 }}>{item.name}</span>
                    <span className="mono">${item.cost.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="mono" style={{ fontSize: 10, opacity: 0.5 }}>No expense data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
