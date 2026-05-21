import { motion } from 'motion/react';
import { useState } from 'react';

interface NodeData {
  id: string;
  label: string;
  x: number;
  y: number;
  color: 'purple' | 'cyan' | 'green' | 'amber';
  icon: string;
}

interface ConnectionData {
  from: string;
  to: string;
  color: string;
}

const nodes: NodeData[] = [
  { id: 'supervisor', label: 'AURA', x: 400, y: 250, color: 'purple', icon: '⬡' },
  { id: 'research', label: 'Research', x: 150, y: 100, color: 'cyan', icon: '🔍' },
  { id: 'code', label: 'Code', x: 650, y: 100, color: 'purple', icon: '⌨️' },
  { id: 'synthesis', label: 'Synthesis', x: 150, y: 400, color: 'green', icon: '🧠' },
  { id: 'memory', label: 'Memory', x: 650, y: 400, color: 'amber', icon: '💾' },
];

const connections: ConnectionData[] = [
  { from: 'supervisor', to: 'research', color: '#22d3ee' },
  { from: 'supervisor', to: 'code', color: '#a855f7' },
  { from: 'supervisor', to: 'synthesis', color: '#10b981' },
  { from: 'supervisor', to: 'memory', color: '#f59e0b' },
];

const nodeColors: Record<string, { bg: string; border: string; glow: string; text: string }> = {
  purple: {
    bg: 'rgba(168, 85, 247, 0.15)',
    border: '#a855f7',
    glow: '0 0 30px rgba(168, 85, 247, 0.4)',
    text: '#c4b5fd',
  },
  cyan: {
    bg: 'rgba(34, 211, 238, 0.15)',
    border: '#22d3ee',
    glow: '0 0 30px rgba(34, 211, 238, 0.4)',
    text: '#67e8f9',
  },
  green: {
    bg: 'rgba(16, 185, 129, 0.15)',
    border: '#10b981',
    glow: '0 0 30px rgba(16, 185, 129, 0.4)',
    text: '#6ee7b7',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    glow: '0 0 30px rgba(245, 158, 11, 0.4)',
    text: '#fcd34d',
  },
};

function HexagonNode({ node, isHovered, onHover }: { node: NodeData; isHovered: boolean; onHover: (id: string | null) => void }) {
  const colors = nodeColors[node.color];
  const isSupervisor = node.id === 'supervisor';
  const size = isSupervisor ? 50 : 35;
  
  return (
    <motion.g
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: node.id === 'supervisor' ? 0 : 0.3 + nodes.indexOf(node) * 0.1 }}
    >
      {/* Glow background */}
      {isHovered && (
        <circle
          cx={node.x}
          cy={node.y}
          r={size + 20}
          fill="none"
          stroke={colors.border}
          strokeWidth="1"
          opacity="0.3"
          style={{ filter: `drop-shadow(0 0 10px ${colors.border})` }}
        />
      )}
      
      {/* Hexagon shape */}
      <motion.polygon
        points={getHexPoints(node.x, node.y, size)}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={isSupervisor ? 2.5 : 1.5}
        style={{
          filter: isHovered ? colors.glow : 'none',
          transition: 'filter 0.3s ease',
        }}
        animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
      
      {/* Inner icon */}
      <text
        x={node.x}
        y={node.y + (isSupervisor ? 6 : 4)}
        textAnchor="middle"
        fill={colors.text}
        fontSize={isSupervisor ? 24 : 18}
        fontFamily="var(--font-display)"
      >
        {node.icon}
      </text>
      
      {/* Label */}
      {isHovered && (
        <motion.text
          x={node.x}
          y={node.y + size + 20}
          textAnchor="middle"
          fill={colors.text}
          fontSize="12"
          fontWeight="600"
          fontFamily="var(--font-mono)"
          letterSpacing="0.05em"
          initial={{ opacity: 0, y: node.y + size + 15 }}
          animate={{ opacity: 1, y: node.y + size + 20 }}
          transition={{ duration: 0.2 }}
        >
          {node.label.toUpperCase()}
        </motion.text>
      )}
      
      {/* Supervisor label (always visible) */}
      {isSupervisor && (
        <text
          x={node.x}
          y={node.y + size + 22}
          textAnchor="middle"
          fill="#c4b5fd"
          fontSize="13"
          fontWeight="700"
          fontFamily="var(--font-mono)"
          letterSpacing="0.1em"
        >
          SUPERVISOR
        </text>
      )}
    </motion.g>
  );
}

function ConnectionLine({ conn, isHovered }: { conn: ConnectionData; isHovered: boolean }) {
  const fromNode = nodes.find(n => n.id === conn.from)!;
  const toNode = nodes.find(n => n.id === conn.to)!;
  
  return (
    <g>
      {/* Base line */}
      <line
        x1={fromNode.x}
        y1={fromNode.y}
        x2={toNode.x}
        y2={toNode.y}
        stroke={conn.color}
        strokeWidth="1"
        opacity="0.3"
      />
      
      {/* Animated glow line */}
      <motion.line
        x1={fromNode.x}
        y1={fromNode.y}
        x2={toNode.x}
        y2={toNode.y}
        stroke={conn.color}
        strokeWidth="2"
        opacity={isHovered ? 0.8 : 0.5}
        strokeDasharray="8 4"
        style={{
          filter: `drop-shadow(0 0 4px ${conn.color})`,
        }}
        animate={isHovered
          ? { strokeDashoffset: [0, -24], opacity: 0.9 }
          : { strokeDashoffset: [0, -24], opacity: 0.5 }
        }
        transition={{
          strokeDashoffset: { duration: 1.5, repeat: Infinity, ease: 'linear' },
          opacity: { duration: 0.3 },
        }}
      />
    </g>
  );
}

function getHexPoints(cx: number, cy: number, r: number): string {
  const points: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push([
      cx + r * Math.cos(angle),
      cy + r * Math.sin(angle),
    ]);
  }
  return points.map(p => p.join(',')).join(' ');
}

export default function NodeGraph() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.05) 0%, transparent 70%)',
    }}>
      <svg
        viewBox="0 0 800 500"
        style={{
          width: '100%',
          maxWidth: '800px',
          height: 'auto',
        }}
      >
        {/* SVG Filters for glow */}
        <defs>
          <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Connection lines */}
        {connections.map((conn, i) => (
          <ConnectionLine
            key={i}
            conn={conn}
            isHovered={hoveredNode === conn.from || hoveredNode === conn.to}
          />
        ))}
        
        {/* Nodes */}
        {nodes.map((node) => (
          <HexagonNode
            key={node.id}
            node={node}
            isHovered={hoveredNode === node.id}
            onHover={setHoveredNode}
          />
        ))}
      </svg>
    </div>
  );
}
