import React from 'react';
import { ChatThread } from './ChatThread';
import { ChatInput } from './ChatInput';
import './aura.css';

export function AuraApp() {
  return (
    <div className="aura-app">
      <header className="aura-header">
        <h1>AURA // CORE_TERMINAL</h1>
      </header>
      <main className="aura-main">
        <ChatThread />
      </main>
      <footer className="aura-footer">
        <ChatInput />
      </footer>
    </div>
  );
}