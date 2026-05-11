import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './index.css'; // Import Tailwind CSS

import { AppLayout } from './components/AppLayout';
import NavigationHub from './components/NavigationHub';
import { ChatPage } from './components/ChatPage';
import { RoadmapPage } from './components/RoadmapPage';
import CoreTerminal from './components/CoreTerminal';
import ROIDash from './components/ROIDash';
import ResearchConsole from './components/ResearchConsole';
import SystemLogs from './components/SystemLogs';

if (!(window as any).aura) {
  console.error('[main.tsx] ERROR: window.aura is not defined! Preload script may have failed.');
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <NavigationHub /> },
      { path: 'hub', element: <NavigationHub /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'terminal', element: <CoreTerminal /> },
      { path: 'roadmap', element: <RoadmapPage /> },
      { path: 'dash', element: <ROIDash /> },
      { path: 'logs', element: <SystemLogs /> },
      { path: 'research', element: <ResearchConsole /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
