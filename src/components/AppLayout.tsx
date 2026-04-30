import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import NavigationHub from './NavigationHub';
import CoreTerminal from './CoreTerminal';
import RoadmapView from './RoadmapView';
import ROIDash from './ROIDash';
import SystemLogs from './SystemLogs';

export function AppLayout() {
  const [currentView, setCurrentView] = useState('hub');

  const renderView = () => {
    switch (currentView) {
      case 'hub': return <NavigationHub onNavigate={setCurrentView} />;
      case 'terminal': return <CoreTerminal />;
      case 'roadmap': return <RoadmapView />;
      case 'roi': return <ROIDash />;
      case 'logs': return <SystemLogs />;
      // 'research' and 'archive' can be mapped when they are built out
      default: return <NavigationHub onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="h-screen w-screen bg-[#050505] text-white overflow-hidden relative font-sans">
      {/* Global escape hatch back to the God View Hub */}
      {currentView !== 'hub' && (
        <button 
          onClick={() => setCurrentView('hub')}
          className="absolute top-4 right-6 z-50 bg-[#111] hover:bg-[#222] text-gray-300 hover:text-white px-3 py-2 rounded-md shadow-lg flex items-center gap-2 border border-[#333] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <LayoutGrid size={16} />
          <span className="text-xs font-bold tracking-widest uppercase">HUB</span>
        </button>
      )}
      
      {renderView()}
    </div>
  );
}