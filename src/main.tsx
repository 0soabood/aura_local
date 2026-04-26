import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './preload/index'; // must run before any component module so window.aura is ready
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
