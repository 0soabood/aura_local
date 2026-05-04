import React from 'react';
import { ChatPage } from './ChatPage';

export function AuraApp() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: 'var(--ink)',
      color: 'var(--bone)',
      fontFamily: 'var(--font-mono)',
    }}>
      <header style={{
        padding: '1rem 1.5rem',
        backgroundColor: 'var(--ink)',
        borderBottom: 'var(--rule-thick)',
        fontSize: '0.875rem',
        letterSpacing: '0.1em',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>AURA // CORE_TERMINAL</h1>
      </header>
      <main style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <ChatPage />
      </main>
    </div>
  );
}