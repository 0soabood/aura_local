import { useState, useEffect } from 'react';
import { LayoutGrid, Terminal, Map, DollarSign, FileText, Plus, Brain } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import CoreTerminal from './CoreTerminal';
import RoadmapView from './RoadmapView';
import ROIDash from './ROIDash';
import SystemLogs from './SystemLogs';
import { CommandPalette, CommandGroup, CommandItem, CommandSeparator } from './ui/CommandPalette';
import { useBrainDumpMode, useSetBrainDumpMode, useSelectedModel, useSetSelectedModel } from '../stores/useAura';
import { Cog, Cpu } from 'lucide-react';

export function AppLayout() {
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Use Zustand store for brain dump mode
  const brainDumpMode = useBrainDumpMode();
  const setBrainDumpMode = useSetBrainDumpMode();
  const selectedModel = useSelectedModel();
  const setSelectedModel = useSetSelectedModel();

  // Dynamic models fetched from API (grouped by provider)
  interface ProviderGroup {
    id: string;
    name: string;
    hasKey: boolean;
    models: Array<{ id: string; label: string }>;
  }

  const [modelProviders, setModelProviders] = useState<ProviderGroup[]>([]);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        const modelsData = res.ok ? await res.json() : null;

        if (modelsData && Array.isArray(modelsData.providers)) {
          setModelProviders(modelsData.providers);
        } else {
          // Fallback to a single OpenRouter group if the API is unavailable.
          setModelProviders([
            {
              id: 'openrouter',
              name: 'OPENROUTER',
              hasKey: true,
              models: [
                { id: 'openrouter:google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
                { id: 'openrouter:deepseek/deepseek-chat', label: 'DeepSeek Chat' },
              ],
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };

    fetchModels();
  }, []);

  // Determine current view from pathname
  const getCurrentView = () => {
    const path = location.pathname;
    if (path.includes('/terminal')) return 'terminal';
    if (path.includes('/roadmap')) return 'roadmap';
    if (path.includes('/dash')) return 'roi';
    if (path.includes('/logs')) return 'logs';
    if (path.includes('/research')) return 'research';
    if (path.includes('/chat')) return 'chat';
    if (path.includes('/hub')) return 'hub';
    return 'hub'; // Default to hub for '/'
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
      case 'hub': navigate('/hub'); break;
      case 'terminal': navigate('/terminal'); break;
      case 'roadmap': navigate('/roadmap'); break;
      case 'roi': navigate('/dash'); break;
      case 'logs': navigate('/logs'); break;
      case 'research': navigate('/research'); break;
      case 'chat': navigate('/chat'); break;
      default: navigate('/hub');
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--ink)',
      color: 'var(--bone)',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Global escape hatch back to the God View Hub */}
      {currentView !== 'hub' && (
        <button
          onClick={() => handleNavigate('hub')}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1.5rem',
            zIndex: 50,
            backgroundColor: 'var(--ink)',
            color: 'var(--bone)',
            padding: '0.5rem 0.75rem',
            border: 'var(--rule-thick)',
            boxShadow: 'var(--shadow-hard)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            transition: 'transform 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translate(-1px, -1px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translate(0, 0)'; }}
        >
          <LayoutGrid size={16} />
          <span>HUB</span>
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
            const newMode = !brainDumpMode;
            setBrainDumpMode(newMode);
            setCommandOpen(false);
          }}>
            <Brain size={16} />
            <span>{brainDumpMode ? 'Disable Brain Dump' : 'Brain Dump Mode'}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Models">
          <CommandItem onSelect={() => {
            setSelectedModel('auto');
            setCommandOpen(false);
          }}
          style={{
            backgroundColor: selectedModel === 'auto' ? 'var(--chartreuse)' : 'transparent',
          }}
          >
            <Cpu size={16} />
            <span>AUTO (DEFAULT){selectedModel === 'auto' ? ' ✓' : ''}</span>
          </CommandItem>
          {modelProviders.map(provider => (
            <CommandGroup key={provider.id} heading={`${provider.name}${provider.hasKey ? '' : ' 🔒'}`}>
              {provider.models.map(model => (
                <CommandItem
                  key={model.id}
                  onSelect={() => {
                    setSelectedModel(model.id);
                    setCommandOpen(false);
                  }}
                  style={{
                    backgroundColor: selectedModel === model.id ? 'var(--chartreuse)' : 'transparent',
                  }}
                >
                  <Cpu size={16} />
                  <span>{model.label}{selectedModel === model.id ? ' ✓' : ''}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandItem onSelect={() => {
            setCommandOpen(false);
            // Open settings - we need to access CoreTerminal's settingsOpen state
            // For now, just show a message
            alert('Open Terminal to access Model Settings (click the ⚙️ button)');
          }}>
            <Cog size={16} />
            <span>Model Settings...</span>
          </CommandItem>
        </CommandGroup>
      </CommandPalette>

      {/* Main Content - Uses Outlet for child routes */}
      <Outlet />
    </div>
  );
}
