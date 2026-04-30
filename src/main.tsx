import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './index.css'; // Import Tailwind CSS

import { AppLayout } from './components/AppLayout';
import { ChatPage } from './components/ChatPage';
import { RoadmapPage } from './components/RoadmapPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'roadmap', element: <RoadmapPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);