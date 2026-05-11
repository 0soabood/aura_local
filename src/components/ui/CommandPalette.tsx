import * as React from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent, DialogTitle } from './Dialog';
import { X } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}

export const CommandPalette = ({ open, onOpenChange, children }: CommandPaletteProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{
        maxWidth: '32rem',
        backgroundColor: 'var(--bone)',
        border: 'var(--rule-thick)',
        boxShadow: 'var(--shadow-hard)',
        padding: '1.5rem',
      }}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Command className="command-root" style={{
          backgroundColor: 'transparent',
        }}>
          <Command.Input
            placeholder="TYPE A COMMAND OR SEARCH..."
            style={{
              width: '100%',
              padding: '0.75rem',
              border: 'var(--rule-thick)',
              backgroundColor: 'var(--ink)',
              color: 'var(--bone)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              outline: 'none',
            }}
          />
          <Command.List style={{
            marginTop: '0.5rem',
            maxHeight: '20rem',
            overflowY: 'auto',
          }}>
            <Command.Empty style={{
              padding: '1rem',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--ink)',
              opacity: 0.6,
            }}>
              NO RESULTS FOUND.
            </Command.Empty>
            {children}
          </Command.List>
        </Command>
        <button
          onClick={() => onOpenChange(false)}
          aria-label="Close command palette"
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            background: 'none',
            border: 'var(--rule-thick) solid transparent',
            cursor: 'pointer',
            padding: '0.25rem',
            color: 'var(--ink)',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
        >
          <X size={16} />
        </button>
      </DialogContent>
    </Dialog>
  );
};

export const CommandGroup = ({ heading, children }: { heading?: string; children: React.ReactNode }) => (
  <Command.Group heading={heading} style={{
    marginBottom: '0.5rem',
  }}>
    {heading && (
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.18em',
        color: 'var(--ink)',
        opacity: 0.6,
        padding: '0.5rem 0.75rem 0.25rem',
        borderBottom: 'var(--rule-thick)',
        marginBottom: '0.25rem',
      }}>
        {heading.toUpperCase()}
      </div>
    )}
    {children}
  </Command.Group>
);

export const CommandItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, children, ...props }, ref) => (
  <Command.Item
    ref={ref}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.375rem 0.75rem',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: 'pointer',
      backgroundColor: 'transparent',
      transition: 'background-color 0.1s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chartreuse)'; e.currentTarget.style.color = 'var(--ink)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'inherit'; }}
    {...props}
  >
    {children}
  </Command.Item>
));
CommandItem.displayName = 'CommandItem';

export const CommandSeparator = () => (
  <Command.Separator style={{
    height: '2px',
    backgroundColor: 'var(--rule)',
    margin: '0.5rem 0',
  }} />
);
