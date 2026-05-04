import React from 'react';
import type { VerificationState } from '../../shared/types';

interface TagProps {
  label: string;
  variant?: 'default' | 'verified' | 'danger' | 'warn' | 'info';
  onRemove?: () => void;
  className?: string;
}

const TAG_CLASSES: Record<string, string> = {
  default: 'tag',
  verified: 'tag verified',
  danger: 'tag danger',
  warn: 'tag warn',
  info: 'tag info',
};

export const Tag: React.FC<TagProps> = ({ label, variant = 'default', onRemove, className }) => {
  const cls = [TAG_CLASSES[variant] || TAG_CLASSES.default, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls}>
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{ marginLeft: 4, cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit' }}
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
};

// Re-export VerificationBadge from atoms for convenience
export { VerificationBadge } from './atoms';
