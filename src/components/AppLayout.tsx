import { useState, useEffect } from 'react';
import { LayoutGrid, Terminal, Map, DollarSign, FileText, Plus, Brain } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import NavigationHub from './NavigationHub';
import CoreTerminal from './CoreTerminal';
import RoadmapView from './RoadmapView';
import ROIDash from './ROIDash';
import SystemLogs from './SystemLogs';
import { CommandPalette, CommandGroup, CommandItem, CommandSeparator } from './ui/CommandPalette';

export function AppLayout() {
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current view from pathname
  const getCurrentView = () => {
    const path = location.pathname;
    if (path.includes('/terminal')) return 'terminal';
    if (path.includes('/roadmap')) return 'roadmap';
    if (path.includes('/dash')) return 'roi';
    if (path.includes('/logs')) return 'logs';
    if (path.includes('/research')) return 'research';
    return 'hub';
  };

  const [currentView, setCurrentView] = useState(getCurrentView());

  // Update currentView when location changes
  useEffect(() => {
    setCurrentView(getCurrentView());
  }, [location]);

  // Keyboard shortcut for command palette (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    switch (view) {
      case 'hub': navigate('/'); break;
      case 'terminal': navigate('/terminal'); break;
      case 'roadmap': navigate('/roadmap'); break;
      case 'roi': navigate('/dash'); break;
      case 'logs': navigate('/logs'); break;
      case 'research': navigate('/research'); break;
      default: navigate('/');
    }
  };

  return (
    <div className="h-screen w-screen bg-[#050505] text-white overflow-hidden relative font-sans">
      {/* Global escape hatch back to the God View Hub */}
      {currentView !== 'hub' && (
        <button 
          onClick={() => handleNavigate('hub')}
          className="absolute top-4 right-6 z-50 bg-[#111] hover:bg-[#222] text-gray-300 hover:text-white px-3 py-2 rounded-md shadow-lg flex items-center gap-2 border border-[#333] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <LayoutGrid size={16} />
          <span className="text-xs font-bold tracking-widest uppercase">HUB</span>
        </button>
      )}

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => { handleNavigate('hub'); setCommandOpen(false); }}>
            <LayoutGrid size={16} />
            <span>Hub - God View</span>
          </CommandItem>
          <CommandItem onSelect={() => { handleNavigate('terminal'); setCommandOpen(false); }}>
            <Terminal size={16} />
            <span>Terminal - Core Shell</span>
          </CommandItem>
          <CommandItem onSelect={() => { handleNavigate('roadmap'); setCommandOpen(false); }}>
            <Map size={16} />
            <span>Roadmap - Project Tracking</span>
          </CommandItem>
          <CommandItem onSelect={() => { handleNavigate('roi'); setCommandOpen(false); }}>
            <DollarSign size={16} />
            <span>ROI Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => { handleNavigate('logs'); setCommandOpen(false); }}>
            <FileText size={16} />
            <span>System Logs</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => {
            // TODO: Implement new session action
            setCommandOpen(false);
          }}>
            <Plus size={16} />
            <span>New Session</span>
          </CommandItem>
          <CommandItem onSelect={() => {
            // TODO: Implement brain dump mode
            setCommandOpen(false);
          }}>
            <Brain size={16} />
            <span>Brain Dump Mode</span>
          </CommandItem>
        </CommandGroup>
      </CommandPalette>

      {/* Main Content - Uses Outlet for child routes */}
      <Outlet />
    </div>
  );
}