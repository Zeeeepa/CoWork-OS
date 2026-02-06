import { useEffect, useMemo, useState } from 'react';
import type { MemoryFeaturesSettings, Workspace } from '../../shared/types';
import { MemorySettings } from './MemorySettings';

const DEFAULT_FEATURES: MemoryFeaturesSettings = {
  contextPackInjectionEnabled: true,
  heartbeatMaintenanceEnabled: true,
};

export function MemoryHubSettings() {
  const [features, setFeatures] = useState<MemoryFeaturesSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);

      const [loadedFeatures, loadedWorkspaces, tempWorkspace] = await Promise.all([
        window.electronAPI.getMemoryFeaturesSettings().catch(() => DEFAULT_FEATURES),
        window.electronAPI.listWorkspaces().catch(() => [] as Workspace[]),
        window.electronAPI.getTempWorkspace().catch(() => null as Workspace | null),
      ]);

      const combined: Workspace[] = [
        ...(tempWorkspace ? [tempWorkspace] : []),
        ...loadedWorkspaces.filter((w) => w.id !== tempWorkspace?.id),
      ];

      setFeatures(loadedFeatures);
      setWorkspaces(combined);
      setSelectedWorkspaceId((prev) => {
        if (prev && combined.some((w) => w.id === prev)) return prev;
        return combined[0]?.id || '';
      });
    } finally {
      setLoading(false);
    }
  };

  const saveFeatures = async (updates: Partial<MemoryFeaturesSettings>) => {
    const next: MemoryFeaturesSettings = { ...(features || DEFAULT_FEATURES), ...updates };
    setFeatures(next);
    try {
      setSaving(true);
      await window.electronAPI.saveMemoryFeaturesSettings(next);
    } catch (error) {
      console.error('Failed to save memory feature settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !features) {
    return (
      <div className="settings-section">
        <div className="settings-loading">Loading memory settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Memory</h2>
      <p className="settings-section-description">
        Control memory-related features globally and per workspace.
      </p>

      <div className="settings-subsection">
        <h3>Global Toggles</h3>

        <div className="settings-form-group">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={features.contextPackInjectionEnabled}
              onChange={(e) => saveFeatures({ contextPackInjectionEnabled: e.target.checked })}
              disabled={saving}
            />
            <span className="settings-toggle-label">Enable Workspace Context Pack Injection</span>
          </label>
          <p className="settings-form-hint">
            When enabled, the app may inject redacted notes from <code>.cowork/</code> into agent context
            to improve continuity.
          </p>
        </div>

        <div className="settings-form-group">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={features.heartbeatMaintenanceEnabled}
              onChange={(e) => saveFeatures({ heartbeatMaintenanceEnabled: e.target.checked })}
              disabled={saving}
            />
            <span className="settings-toggle-label">Enable Maintenance Heartbeats</span>
          </label>
          <p className="settings-form-hint">
            When enabled, lead agents can create a daily maintenance task if <code>.cowork/HEARTBEAT.md</code> exists.
          </p>
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Per Workspace</h3>

        {workspaces.length === 0 ? (
          <p className="settings-form-hint">No workspaces found.</p>
        ) : (
          <div className="settings-form-group">
            <label className="settings-label">Workspace</label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="settings-select"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {selectedWorkspace?.path && (
              <p className="settings-form-hint">
                Path: <code>{selectedWorkspace.path}</code>
              </p>
            )}
          </div>
        )}

        {selectedWorkspaceId && (
          <MemorySettings workspaceId={selectedWorkspaceId} />
        )}
      </div>
    </div>
  );
}

