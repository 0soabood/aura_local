import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import './components/aura.css';

import App from './App';

if (!(window as any).aura) {
  console.log('[main.tsx] Note: window.aura not defined — running in browser mode (non-Electron)');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
