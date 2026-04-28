// src/components/ui/atoms.tsx
// Small shared atoms used across views.

import React from 'react';
import type { VerificationState } from '../../shared/types';

interface VerificationBadgeProps {
  state: VerificationState;
  showLabel?: boolean;
  className?: string;
}

const BADGE_CONFIG: Record<VerificationState, { label: string; cls: string }> = {
  accepted:      { label: '✓ ACCEPTED',   cls: 'tag verified' },
  source_checked:{ label: '? SOURCE',     cls: 'tag warn' },
  self_checked:  { label: '~ SELF-CHK',   cls: 'tag info' },
  unverified:    { label: '· UNVERIFIED', cls: 'tag unverified' },
  rejected:      { label: '✗ REJECTED',   cls: 'tag danger' },
};

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({ state, showLabel = true, className }) => {
  const cfg = BADGE_CONFIG[state] ?? BADGE_CONFIG.unverified;
  const cls = [cfg.cls, className].filter(Boolean).join(' ');
  if (!showLabel) return <span className={cls} aria-label={cfg.label} />;
  return <span className={cls}>{cfg.label}</span>;
};

export const Spinner: React.FC = () => (
  <span className="row" style={{ gap: 8 }}>
    <span className="spinner" />
    <span className="caps" style={{ color: 'var(--text-3)' }}>Loading…</span>
  </span>
);

export const Empty: React.FC<{ label?: string }> = ({ label = 'Nothing here yet' }) => (
  <div className="empty">
    <div className="caps">{label}</div>
  </div>
);

export const Sparkline: React.FC<{ data: number[]; w?: number; h?: number; stroke?: number }> = ({
  data, w = 100, h = 28, stroke = 2,
}) => {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h * 0.85 - h * 0.075}`)
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {data.map((v, i) => (
        <rect
          key={i}
          x={i * step - 1.5}
          y={h - ((v - min) / range) * h * 0.85 - h * 0.075 - 1.5}
          width={3}
          height={3}
          fill="currentColor"
        />
      ))}
    </svg>
  );
};

/** Bionic reading: bold leading ~45% of each word. */
export function bionic(text: string): React.ReactNode {
  const tokens = text.split(/(\s+)/);
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return tok;
    const m = tok.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
    if (!m) return tok;
    const [, lead, word, trail] = m;
    const cut = Math.max(1, Math.ceil(word.length * 0.45));
    return (
      <React.Fragment key={i}>
        {lead}<b>{word.slice(0, cut)}</b>{word.slice(cut)}{trail}
      </React.Fragment>
    );
  });
}

export const Bionic: React.FC<{ children: string }> = ({ children }) => (
  <span className="bionic">{bionic(children)}</span>
);

export const Mark: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <span
    style={{
      display: 'grid', placeItems: 'center',
      width: size, height: size,
      background: 'var(--bone)', color: 'var(--ink)',
      border: '2px solid var(--bone)',
      fontFamily: 'var(--font-display)', fontStyle: 'italic',
      fontSize: size * 0.62, lineHeight: 1,
    }}
  >Æ</span>
);

export const SectionNum: React.FC<{ n: string }> = ({ n }) => (
  <span className="section-num">§ {n}</span>
);
