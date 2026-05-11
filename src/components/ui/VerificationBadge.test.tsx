import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerificationBadge from './VerificationBadge';
import { VERIFICATION_STATES, VerificationState } from '../../shared/types';

const EXPECTED: Record<VerificationState, { label: string; cls: string }> = {
  unverified:     { label: '· UNVERIFIED', cls: 'tag unverified' },
  self_checked:   { label: '~ SELF-CHK',   cls: 'tag info' },
  source_checked: { label: '? SOURCE',     cls: 'tag warn' },
  accepted:       { label: '✓ ACCEPTED',   cls: 'tag verified' },
  rejected:       { label: '✗ REJECTED',   cls: 'tag danger' },
};

describe('VerificationBadge', () => {
  it('covers every enum member with an EXPECTED entry (drift detector)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...VERIFICATION_STATES].sort());
  });

  it.each(VERIFICATION_STATES)('renders the right label + class for %s', (state) => {
    const { container } = render(<VerificationBadge state={state} />);

    expect(screen.getByText(EXPECTED[state].label)).toBeTruthy();

    const root = container.firstChild as HTMLElement;
    // Both parts of the compound class must be present
    for (const part of EXPECTED[state].cls.split(' ')) {
      expect(root.className).toContain(part);
    }
  });

  it('omits the label when showLabel={false}', () => {
    render(<VerificationBadge state="accepted" showLabel={false} />);
    expect(screen.queryByText('✓ ACCEPTED')).toBeNull();
  });

  it('re-renders with new state when promoted (state transition)', () => {
    const { rerender } = render(<VerificationBadge state="unverified" />);
    expect(screen.getByText('· UNVERIFIED')).toBeTruthy();

    rerender(<VerificationBadge state="source_checked" />);
    expect(screen.queryByText('· UNVERIFIED')).toBeNull();
    expect(screen.getByText('? SOURCE')).toBeTruthy();

    rerender(<VerificationBadge state="accepted" />);
    expect(screen.getByText('✓ ACCEPTED')).toBeTruthy();
  });

  it('falls back to the unverified config for an unknown state', () => {
    // @ts-expect-error — intentionally violating the type to test the runtime fallback
    render(<VerificationBadge state="bogus" />);
    expect(screen.getByText('· UNVERIFIED')).toBeTruthy();
  });

  it('appends a custom className without dropping the base styles', () => {
    const { container } = render(
      <VerificationBadge state="accepted" className="extra-class" />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('extra-class');
    expect(root.className).toContain('verified');
  });
});
