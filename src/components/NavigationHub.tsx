import { useRef } from 'react';
import { motion } from 'motion/react';
import { Terminal, Activity, Layers, Search, FileText } from 'lucide-react';

interface NavigationHubProps {
  onNavigate: (view: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  cyan:    '#06b6d4',
  emerald: '#10b981',
  violet:  '#8b5cf6',
  amber:   '#f59e0b',
  red:     '#ef4444',
};

const NODES = [
  {
    id: 'terminal',
    label: 'AURA Terminal',
    sub: 'Orchestrator v3',
    icon: Terminal,
    color: 'cyan',
    x: 50,
    y: 52,
    desc: 'Chat with agents. Real-time SSE streaming.',
    primary: true,
  },
  {
    id: 'roi',
    label: 'ROI Dashboard',
    sub: 'Telemetry',
    icon: Activity,
    color: 'emerald',
    x: 78,
    y: 28,
    desc: 'Latency, sessions, error rate.',
    primary: false,
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    sub: 'Kanban board',
    icon: Layers,
    color: 'violet',
    x: 78,
    y: 74,
    desc: '5-column milestone tracker.',
    primary: false,
  },
  {
    id: 'research',
    label: 'Research Console',
    sub: 'Snippets',
    icon: Search,
    color: 'amber',
    x: 20,
    y: 28,
    desc: 'CRUD research snippets + tags.',
    primary: false,
  },
  {
    id: 'logs',
    label: 'System Logs',
    sub: 'Audit trail',
    icon: FileText,
    color: 'red',
    x: 20,
    y: 74,
    desc: 'Filter and search system events.',
    primary: false,
  },
] as const;

// SVG edge definitions: from CoreTerminal (50,52) to each satellite node
const EDGES = NODES.filter(n => !n.primary).map(n => ({
  id: n.id,
  x1: 50,
  y1: 52,
  x2: n.x,
  y2: n.y,
  color: COLOR_MAP[n.color],
}));

export default function NavigationHub({ onNavigate }: NavigationHubProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="hub-canvas" ref={containerRef}>
      {/* dot-grid background */}
      <div className="hub-grid-bg" />

      {/* ambient center glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '52%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 400,
          background: 'radial-gradient(ellipse, rgba(6,182,212,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* edge lines */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          {EDGES.map(e => (
            <linearGradient key={`g-${e.id}`} id={`grad-${e.id}`} x1={`${e.x1}%`} y1={`${e.y1}%`} x2={`${e.x2}%`} y2={`${e.y2}%`} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor={e.color} stopOpacity="0.15" />
            </linearGradient>
          ))}
        </defs>
        {EDGES.map((e, i) => (
          <motion.line
            key={e.id}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={`url(#grad-${e.id})`}
            strokeWidth="0.3"
            strokeDasharray="2 1.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.7, ease: 'easeOut' }}
          />
        ))}
      </svg>

      {/* nodes */}
      {NODES.map((node, i) => {
        const Icon = node.icon;
        const accent = COLOR_MAP[node.color];
        return (
          <motion.div
            key={node.id}
            className="hub-node"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              border: `1px solid ${accent}30`,
              background: 'rgba(15,20,28,0.88)',
              backdropFilter: 'blur(12px)',
              boxShadow: node.primary ? `0 0 40px ${accent}18, inset 0 0 20px ${accent}06` : `0 0 20px ${accent}10`,
              width: node.primary ? 220 : 188,
            }}
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.05 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{
              scale: 1.06,
              boxShadow: `0 0 36px ${accent}40, inset 0 0 24px ${accent}10`,
              borderColor: `${accent}60`,
            }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate(node.id)}
          >
            {/* status dot */}
            <span
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: accent,
                boxShadow: `0 0 6px ${accent}`,
                opacity: 0.8,
              }}
            />

            {/* icon */}
            <div style={{ marginBottom: 10 }}>
              <Icon size={node.primary ? 22 : 18} color={accent} strokeWidth={1.5} />
            </div>

            {/* labels */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, marginBottom: 2 }}>
              {node.label}
            </div>
            <div style={{ fontSize: 9, color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
              {node.sub}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {node.desc}
            </div>
          </motion.div>
        );
      })}

      {/* bottom label */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 9,
          color: 'var(--text-4)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Click a node to enter
      </div>
    </div>
  );
}
