import { useState, useEffect } from 'react';
import { ModelRole } from '../../stores/useAura';
import { useModelConfig, useSetModelForRole, useResetModelConfig, useAgentModelOverrides, useSetModelForAgent, useResetAgentModelOverrides } from '../../stores/useAura';
import { MODEL_ROLES } from '../../lib/ModelConfig';

interface ModelSettingsProps {
  modelProviders: Array<{
    id: string;
    name: string;
    hasKey: boolean;
    models: Array<{ id: string; label: string }>;
  }>;
  onClose?: () => void;
}

const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  daily_driver: 'Daily Driver',
  long_context: 'Long Context',
  reasoning: 'Reasoning',
  agent_orchestrator: 'Agent Orchestrator',
  vision: 'Vision',
  translate: 'Translate',
  compaction: 'Compaction',
  bulk_fast: 'Bulk Fast',
  experimental: 'Experimental',
};

const AGENT_NAMES = [
  'SynthesisAgent',
  'CodeAgent',
  'ResearchAgent',
  'SupervisorRouter',
  'ReactiveOrchestrator',
];

export default function ModelSettings({ modelProviders, onClose }: ModelSettingsProps) {
  const modelConfig = useModelConfig();
  const setModelForRole = useSetModelForRole();
  const resetModelConfig = useResetModelConfig();
  const agentModelOverrides = useAgentModelOverrides();
  const setModelForAgent = useSetModelForAgent();
  const resetAgentModelOverrides = useResetAgentModelOverrides();

  const [localRoleModels, setLocalRoleModels] = useState<Partial<Record<ModelRole, string>>>({});
  const [localAgentModels, setLocalAgentModels] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize local state from store
  useEffect(() => {
    setLocalRoleModels(modelConfig || {});
  }, [modelConfig]);

  useEffect(() => {
    setLocalAgentModels(agentModelOverrides || {});
  }, [agentModelOverrides]);

  const handleRoleChange = (role: ModelRole, modelId: string) => {
    setLocalRoleModels(prev => ({ ...prev, [role]: modelId }));
    setHasChanges(true);
  };

  const handleAgentChange = (agent: string, modelId: string) => {
    setLocalAgentModels(prev => ({ ...prev, [agent]: modelId }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Save role models
    Object.entries(localRoleModels).forEach(([role, model]) => {
      if (model) {
        setModelForRole(role as ModelRole, model);
      }
    });

    // Save agent models
    Object.entries(localAgentModels).forEach(([agent, model]) => {
      if (model) {
        setModelForAgent(agent, model);
      }
    });

    // Sync to backend
    try {
      const aura = (window as any).aura;
      if (aura?.saveSettings) {
        await aura.saveSettings({
          modelConfig: localRoleModels,
          agentModelOverrides: localAgentModels,
        });
      } else {
        // Fallback: direct API call
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelConfig: localRoleModels,
            agentModelOverrides: localAgentModels,
          }),
        });
      }
    } catch (err) {
      console.error('Failed to sync settings to backend:', err);
    }

    setHasChanges(false);
    if (onClose) onClose();
  };

  const handleReset = () => {
    resetModelConfig();
    resetAgentModelOverrides();
    setLocalRoleModels({});
    setLocalAgentModels({});
    setHasChanges(true);
  };

  const handleCancel = () => {
    setLocalRoleModels(modelConfig || {});
    setLocalAgentModels(agentModelOverrides || {});
    setHasChanges(false);
    if (onClose) onClose();
  };

  const getDefaultModel = (role: ModelRole): string => {
    return MODEL_ROLES[role]?.primary || '';
  };

  return (
    <div style={{ padding: '1.5rem', color: 'var(--ink)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.05em', margin: 0 }}>
          MODEL CONFIGURATION
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '2px solid var(--ink)',
              background: 'var(--bone)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
            }}
          >
            ✕ CLOSE
          </button>
        )}
      </div>

      {/* Role-Based Model Selection */}
      <section style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '1rem', borderBottom: '3px solid var(--ink)', paddingBottom: '0.5rem' }}>
          ROLE-BASED MODELS
        </h3>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
          Configure which AI model handles each type of task. Leave as "Default" to use the system default.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(Object.keys(MODEL_ROLE_LABELS) as ModelRole[]).map(role => (
            <div
              key={role}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                border: '2px solid var(--ink)',
                background: localRoleModels[role] ? 'var(--chartreuse)' : 'var(--bone)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>{MODEL_ROLE_LABELS[role]}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>
                  Default: {getDefaultModel(role).split(':')[1] || getDefaultModel(role)}
                </div>
              </div>
              <select
                value={localRoleModels[role] || ''}
                onChange={(e) => handleRoleChange(role, e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '2px solid var(--ink)',
                  background: 'var(--bone)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  minWidth: '250px',
                  cursor: 'pointer',
                }}
              >
                <option value="">Default ({getDefaultModel(role).split(':')[1] || getDefaultModel(role)})</option>
                {modelProviders.map(provider => (
                  <optgroup key={provider.id} label={`${provider.name}${provider.hasKey ? '' : ' (no key)'}`}>
                    {provider.models
                      .filter(m => m.id !== 'auto')
                      .map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {localRoleModels[role] && (
                <button
                  onClick={() => handleRoleChange(role, '')}
                  style={{
                    padding: '0.5rem',
                    border: '2px solid var(--ink)',
                    background: 'var(--oxblood)',
                    color: 'var(--bone)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                  title="Reset to default"
                >
                  ↺
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Agent-Specific Overrides */}
      <section style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '1rem', borderBottom: '3px solid var(--ink)', paddingBottom: '0.5rem' }}>
          AGENT OVERRIDES
        </h3>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1.5rem' }}>
          Override model selection for specific agents. These take precedence over role-based configuration.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {AGENT_NAMES.map(agent => (
            <div
              key={agent}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                border: '2px solid var(--ink)',
                background: localAgentModels[agent] ? 'var(--marigold)' : 'var(--bone)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>{agent}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>
                  {localAgentModels[agent]
                    ? `Using: ${localAgentModels[agent].split(':')[1] || localAgentModels[agent]}`
                    : 'Using role-based default'}
                </div>
              </div>
              <select
                value={localAgentModels[agent] || ''}
                onChange={(e) => handleAgentChange(agent, e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '2px solid var(--ink)',
                  background: 'var(--bone)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  minWidth: '250px',
                  cursor: 'pointer',
                }}
              >
                <option value="">Use Role Default</option>
                {modelProviders.map(provider => (
                  <optgroup key={provider.id} label={`${provider.name}${provider.hasKey ? '' : ' (no key)'}`}>
                    {provider.models
                      .filter(m => m.id !== 'auto')
                      .map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {localAgentModels[agent] && (
                <button
                  onClick={() => handleAgentChange(agent, '')}
                  style={{
                    padding: '0.5rem',
                    border: '2px solid var(--ink)',
                    background: 'var(--oxblood)',
                    color: 'var(--bone)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                  title="Reset to default"
                >
                  ↺
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '3px solid var(--ink)', paddingTop: '1.5rem' }}>
        <button
          onClick={handleReset}
          style={{
            padding: '0.75rem 1.5rem',
            border: '2px solid var(--ink)',
            background: 'var(--oxblood)',
            color: 'var(--bone)',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '0.875rem',
          }}
        >
          RESET ALL TO DEFAULTS
        </button>
        <button
          onClick={handleCancel}
          style={{
            padding: '0.75rem 1.5rem',
            border: '2px solid var(--ink)',
            background: 'var(--bone)',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.875rem',
          }}
        >
          CANCEL
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          style={{
            padding: '0.75rem 1.5rem',
            border: '2px solid var(--ink)',
            background: hasChanges ? 'var(--chartreuse)' : 'var(--bone)',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            fontWeight: 800,
            fontSize: '0.875rem',
            opacity: hasChanges ? 1 : 0.5,
          }}
        >
          SAVE CHANGES
        </button>
      </div>
    </div>
  );
}
