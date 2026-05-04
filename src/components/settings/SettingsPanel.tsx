import { useState } from 'react';
import { X, Cog, Info } from 'lucide-react';
import ModelSettings from './ModelSettings';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  modelProviders: Array<{
    id: string;
    name: string;
    hasKey: boolean;
    models: Array<{ id: string; label: string }>;
  }>;
}

type SettingsTab = 'models' | 'general' | 'about';

export default function SettingsPanel({ isOpen, onClose, modelProviders }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'models':
        return <ModelSettings modelProviders={modelProviders} onClose={onClose} />;
      case 'general':
        return (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink)', opacity: 0.6 }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800 }}>GENERAL SETTINGS</h3>
            <p style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
              General settings coming soon...
            </p>
          </div>
        );
      case 'about':
        return (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '1rem' }}>ABOUT AURA</h3>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, lineHeight: 1.6 }}>
              AURA (Automated Utility & Research Assistant)<br/>
              Version: 0.1.0 (Neubrutalist Edition)<br/>
              Built with React, Electron, and LangGraph
            </p>
          </div>
        );
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bone)',
          border: '4px solid var(--ink)',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '8px 8px 0px var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '4px solid var(--ink)',
            background: 'var(--ink)',
            color: 'var(--bone)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cog size={24} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
              SETTINGS
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '2px solid var(--bone)',
              color: 'var(--bone)',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close Settings"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '3px solid var(--ink)',
            background: 'var(--bone)',
          }}
        >
          {([
            { id: 'models' as const, label: 'MODELS', icon: Cog },
            { id: 'general' as const, label: 'GENERAL', icon: null },
            { id: 'about' as const, label: 'ABOUT', icon: Info },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '1rem',
                border: 'none',
                borderBottom: activeTab === tab.id ? '4px solid var(--ink)' : '4px solid transparent',
                background: activeTab === tab.id ? 'var(--chartreuse)' : 'transparent',
                fontWeight: activeTab === tab.id ? 900 : 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab.icon && <tab.icon size={16} />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '1rem' }}>
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
