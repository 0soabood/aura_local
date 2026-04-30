import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './index.css'; // Import Tailwind CSS

import { AppLayout } from './components/AppLayout';
import { ChatPage } from './components/ChatPage';
import { RoadmapPage } from './components/RoadmapPage';
import CoreTerminal from './components/CoreTerminal';
import ROIDash from './components/ROIDash';
import SystemLogs from './components/SystemLogs';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'terminal', element: <CoreTerminal /> },
      { path: 'roadmap', element: <RoadmapPage /> },
      { path: 'dash', element: <ROIDash /> },
      { path: 'logs', element: <SystemLogs /> },
      { path: 'research', element: <div className="p-6 text-gray-400">Research console coming soon...</div> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);