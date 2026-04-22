import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerificationBadge from './VerificationBadge';
import { VERIFICATION_STATES, VerificationState } from '../../shared/types';

// Per-state contract: label text + Tailwind colour token. If a state is added
// to the enum without a CONFIG entry, the `Record<VerificationState, ...>`
// type in the component would already break compilation; this table makes
// sure the runtime mapping (label + colour class) is also correct.
const EXPECTED: Record<VerificationState, { label: string; color: string }> = {
  unverified:     { label: 'UNVETTED',         color: 'text-zinc-600' },
  self_checked:   { label: 'INTERNAL_CHECK',   color: 'text-aura-accent' },
  source_checked: { label: 'CORROBORATED',     color: 'text-aura-warn' },
  accepted:       { label: 'VERIFIED_FACT',    color: 'text-aura-success' },
  rejected:       { label: 'REJECTED',         color: 'text-red-500' },
};

describe('VerificationBadge', () => {
  it('covers every enum member with an EXPECTED entry (drift detector)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...VERIFICATION_STATES].sort());
  });

  it.each(VERIFICATION_STATES)('renders the right label + colour for %s', (state) => {
    const { container } = render(<VerificationBadge state={state} />);

    // Label text
    expect(screen.getByText(EXPECTED[state].label)).toBeTruthy();

    // Colour class lives on the outer div
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain(EXPECTED[state].color);
  });

  it('omits the label when showLabel={false}', () => {
    render(<VerificationBadge state="accepted" showLabel={false} />);
    expect(screen.queryByText('VERIFIED_FACT')).toBeNull();
  });

  it('re-renders with new state when promoted (state transition)', () => {
    const { rerender } = render(<VerificationBadge state="unverified" />);
    expect(screen.getByText('UNVETTED')).toBeTruthy();

    rerender(<VerificationBadge state="source_checked" />);
    expect(screen.queryByText('UNVETTED')).toBeNull();
    expect(screen.getByText('CORROBORATED')).toBeTruthy();

    rerender(<VerificationBadge state="accepted" />);
    expect(screen.getByText('VERIFIED_FACT')).toBeTruthy();
  });

  it('falls back to the unverified config for an unknown state', () => {
    // @ts-expect-error — intentionally violating the type to test the runtime fallback
    render(<VerificationBadge state="bogus" />);
    expect(screen.getByText('UNVETTED')).toBeTruthy();
  });

  it('appends a custom className without dropping the base styles', () => {
    const { container } = render(
      <VerificationBadge state="accepted" className="extra-class" />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('extra-class');
    expect(root.className).toContain('text-aura-success');
  });
});
