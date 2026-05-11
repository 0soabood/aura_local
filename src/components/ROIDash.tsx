import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, DollarSign, Gauge, Route } from 'lucide-react';
import type { TelemetryMetricsV2 } from '../shared/types';
import { Sparkline, Spinner, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

interface KPI {
  label: string;
  value: string;
  unit?: string;
  delta: string;
  spark: number[];
  accent: 'none' | 'chart' | 'oxblood';
  Icon: any;
}

function padSeries(series: number[] | undefined, length: number): number[] {
  const safeSeries = Array.isArray(series) ? series.filter((value) => Number.isFinite(value)) : [];
  if (safeSeries.length >= length) return safeSeries.slice(-length);
  return [...Array(length - safeSeries.length).fill(0), ...safeSeries];
}

function lastTwoValues(series: number[]): [number, number] {
  const safeSeries = series.filter((value) => Number.isFinite(value));
  if (safeSeries.length === 0) return [0, 0];
  if (safeSeries.length === 1) return [safeSeries[0], safeSeries[0]];
  return [safeSeries[safeSeries.length - 2], safeSeries[safeSeries.length - 1]];
}

function formatSignedNumber(value: number, digits = 0, suffix = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}${suffix}`;
}

function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedSecondsFromMs(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value / 1000).toFixed(2)}s`;
}

export default function ROIDash() {
  const [stats, setStats] = useState<TelemetryMetricsV2 | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getAura()?.getStatsV2?.();
      setStats(data || {
        total_routes: 0,
        avg_latency_ms: 0,
        success_rate: 0,
        est_token_cost_usd: 0,
        route_count_series: Array(24).fill(0),
        hourly_latency_ms: Array(24).fill(0),
        success_rate_series: Array(24).fill(0),
        spend_series_usd: Array(7).fill(0),
        top_consumers: [],
      });
    } catch (err) {
      console.error('[ROIDash]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading || !stats) {
    return <div className="page"><div className="page-body"><Spinner /></div></div>;
  }

  const routeSeries = padSeries(stats.route_count_series, 24);
  const latencySeries = padSeries(stats.hourly_latency_ms, 24);
  const successSeries = padSeries(stats.success_rate_series, 24);
  const spendSeries = padSeries(stats.spend_series_usd, 7);

  const [prevRoute, currentRoute] = lastTwoValues(routeSeries);
  const [prevLatency, currentLatency] = lastTwoValues(latencySeries);
  const [prevSuccess, currentSuccess] = lastTwoValues(successSeries);
  const [prevSpend, currentSpend] = lastTwoValues(spendSeries);

  const kpis: KPI[] = [
    {
      label: 'TOTAL ROUTES',
      value: stats.total_routes.toLocaleString(),
      delta: formatSignedNumber(currentRoute - prevRoute),
      spark: routeSeries,
      accent: 'none',
      Icon: Route,
    },
    {
      label: 'AVG LATENCY',
      value: (stats.avg_latency_ms / 1000).toFixed(2),
      unit: 's',
      delta: formatSignedSecondsFromMs(currentLatency - prevLatency),
      spark: latencySeries,
      accent: 'chart',
      Icon: Gauge,
    },
    {
      label: 'SUCCESS RATE',
      value: (stats.success_rate * 100).toFixed(1),
      unit: '%',
      delta: formatSignedNumber((currentSuccess - prevSuccess) * 100, 1, 'pp'),
      spark: successSeries.map((value) => value * 100),
      accent: 'none',
      Icon: Activity,
    },
    {
      label: 'EST. TOKEN COST',
      value: stats.est_token_cost_usd.toFixed(2),
      unit: '$',
      delta: formatSignedCurrency(currentSpend - prevSpend),
      spark: spendSeries,
      accent: 'oxblood',
      Icon: DollarSign,
    },
  ];

  const accentBg = (accent: KPI['accent']) => {
    if (accent === 'chart') return 'var(--chartreuse)';
    if (accent === 'oxblood') return 'var(--oxblood)';
    return 'var(--card)';
  };

  const accentFg = (accent: KPI['accent']) => accent === 'oxblood' ? 'var(--bone)' : 'var(--ink)';

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
          {kpis.map((kpi, index) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              style={{
                border: '2px solid var(--rule)',
                background: accentBg(kpi.accent),
                color: kpi.accent === 'none' ? 'var(--text)' : accentFg(kpi.accent),
                padding: 16,
                boxShadow: 'var(--shadow-hard-lg)',
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="caps" style={{ opacity: 0.85 }}>{kpi.label}</span>
                <kpi.Icon size={14} />
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 4, marginTop: 10 }}>
                {kpi.unit === '$' && <span className="display" style={{ fontSize: 24 }}>$</span>}
                <span className="display" style={{ fontSize: 56, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{kpi.value}</span>
                {kpi.unit && kpi.unit !== '$' && <span className="display" style={{ fontSize: 24 }}>{kpi.unit}</span>}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
                <span className="mono" style={{ fontSize: 10 }}>DELTA {kpi.delta}</span>
                <Sparkline data={kpi.spark} w={80} h={22} stroke={1.5} />
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
              {latencySeries.map((value, index) => (
                <div
                  key={index}
                  style={{
                    flex: 1,
                    height: `${(value / 3000) * 100}%`,
                    background: index === latencySeries.length - 1 ? 'var(--oxblood)' : 'var(--bone)',
                    border: '1px solid var(--rule)',
                  }}
                />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 9 }}>00h</span>
              <span className="mono" style={{ fontSize: 9 }}>23h</span>
            </div>
          </div>

          {/* Top Consumers */}
          <div style={{ border: '2px solid var(--rule)', background: 'var(--card)', padding: 18 }}>
            <div className="display" style={{ fontSize: 22, marginBottom: 14 }}>Top Consumers</div>
            {(stats as any).top_consumers?.map((c: any, i: number) => (
              <div key={c.name} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: i < ((stats as any).top_consumers.length - 1) ? '1px solid var(--rule)' : 'none' }}>
                <span className="mono" style={{ fontSize: 12 }}>{c.name}</span>
                <span className="mono" style={{ fontSize: 12 }}>${Number(c.cost).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
