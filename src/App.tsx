/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Database, 
  BookOpen, 
  Hash, 
  Activity, 
  Settings, 
  LogOut,
  Terminal
} from 'lucide-react';
import ResearchConsole from './components/ResearchConsole';
import SystemLogs from './components/SystemLogs';
import RoadmapView from './components/RoadmapView';
import ROIDash from './components/ROIDash';
import CoreTerminal from './components/CoreTerminal';

type View = 'terminal' | 'research' | 'logs' | 'roadmap' | 'stats' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('terminal');

  const navItems = [
    { id: 'terminal', icon: Terminal, label: 'Core Shell' },
    { id: 'research', icon: BookOpen, label: 'Research' },
    { id: 'logs', icon: Terminal, label: 'System Logs' },
    { id: 'roadmap', icon: Hash, label: 'Roadmap' },
    { id: 'stats', icon: Activity, label: 'ROI' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ] as const;

  return (
    <div className="flex h-screen w-full bg-aura-bg text-zinc-400 font-sans overflow-hidden">
      {/* Primary Vertical Rail */}
      <nav className="w-12 flex flex-col items-center py-4 border-r border-aura-border bg-aura-panel flex-shrink-0">
        <div className="w-8 h-8 bg-aura-accent/20 border border-aura-accent/50 rounded-sm flex items-center justify-center mb-10">
          <Database className="text-aura-accent" size={16} />
        </div>
        
        <div className="flex flex-col gap-8 flex-1">
          {navItems.map((item) => (
            <button 
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`p-2 transition-all duration-200 group relative ${
                currentView === item.id ? 'text-aura-accent' : 'text-zinc-700 hover:text-zinc-500'
              }`}
              title={item.label}
            >
              <item.icon size={18} strokeWidth={currentView === item.id ? 2.5 : 2} />
              {currentView === item.id && (
                <div className="absolute left-[-1rem] top-1/2 -translate-y-1/2 w-0.5 h-6 bg-aura-accent shadow-[0_0_8px_#3b82f6]" />
              )}
            </button>
          ))}
        </div>

        <button className="mt-auto text-zinc-800 hover:text-red-500 transition-colors p-2">
          <LogOut size={18} />
        </button>
      </nav>

      {/* Main Orchestration Pane */}
      <main className="flex-1 min-w-0 h-full flex flex-col p-3 gap-3 overflow-hidden">
        {/* System Breadcrumbs / Header Rail */}
        <header className="flex items-center justify-between px-2 h-8 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-zinc-700 tracking-[0.2em] uppercase">SYSTEM.LOCAL_SYNC [v1.0.4]</span>
            <div className="h-3 w-px bg-aura-border" />
            <span className="text-[10px] font-bold text-aura-accent uppercase tracking-widest leading-none pt-0.5">{currentView.replace('-', '_')}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-aura-success rounded-full animate-pulse shadow-[0_0_5px_#10b981]" />
              <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-widest">Linked</span>
            </div>
            <div className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">
              {new Date().toISOString().split('T')[0]}
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative aura-panel rounded-sm shadow-2xl shadow-black/50 overflow-hidden">
          {currentView === 'terminal' && <CoreTerminal />}
          {currentView === 'research' && <ResearchConsole />}
          {currentView === 'logs' && <SystemLogs />}
          {currentView === 'roadmap' && <RoadmapView />}
          {currentView === 'stats' && <ROIDash />}
          {['settings'].includes(currentView) && (
            <div className="h-full flex items-center justify-center bg-aura-panel p-12">
              <div className="text-center max-w-md">
                <Settings size={48} className="mx-auto mb-6 text-zinc-900" />
                <h2 className="text-sm font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2">Control Substrate</h2>
                <p className="text-xs text-zinc-800 leading-relaxed font-mono">Kernel configuration and multi-model prioritization modules are inactive in the current session. Reference SYSTEM_v1_ALPHA docs.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
