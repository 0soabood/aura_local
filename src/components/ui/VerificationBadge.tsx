import React from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Shield, 
  Search, 
  Zap, 
  CheckCircle2, 
  XCircle,
  Clock
} from 'lucide-react';
import { VerificationState } from '../../shared/types';

interface Props {
  state: VerificationState;
  showLabel?: boolean;
  className?: string;
}

const CONFIG: Record<VerificationState, { 
  label: string, 
  color: string, 
  icon: any,
  bg: string,
  border: string
}> = {
  unverified: { 
    label: 'UNVETTED', 
    color: 'text-zinc-600', 
    icon: Clock,
    bg: 'bg-zinc-900/20',
    border: 'border-zinc-800'
  },
  self_checked: { 
    label: 'INTERNAL_CHECK', 
    color: 'text-aura-accent', 
    icon: Zap,
    bg: 'bg-aura-accent/5',
    border: 'border-aura-accent/20'
  },
  source_checked: { 
    label: 'CORROBORATED', 
    color: 'text-aura-warn', 
    icon: Search,
    bg: 'bg-aura-warn/5',
    border: 'border-aura-warn/20'
  },
  accepted: { 
    label: 'VERIFIED_FACT', 
    color: 'text-aura-success', 
    icon: ShieldCheck,
    bg: 'bg-aura-success/5',
    border: 'border-aura-success/20'
  },
  rejected: { 
    label: 'REJECTED', 
    color: 'text-red-500', 
    icon: XCircle,
    bg: 'bg-red-500/5',
    border: 'border-red-500/20'
  }
};

export default function VerificationBadge({ state, showLabel = true, className = "" }: Props) {
  const config = CONFIG[state] || CONFIG.unverified;
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 border h-5 ${config.bg} ${config.border} ${config.color} ${className}`}>
      <Icon size={10} strokeWidth={3} />
      {showLabel && (
        <span className="text-[8px] font-bold uppercase tracking-[0.1em] leading-none pt-0.5">
          {config.label}
        </span>
      )}
    </div>
  );
}
