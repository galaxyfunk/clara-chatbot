'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { ContentTab } from '@/components/settings/content-tab';
import { StyleTab } from '@/components/settings/style-tab';
import { AITab } from '@/components/settings/ai-tab';
import { ApiKeysTab } from '@/components/settings/api-keys-tab';
import { EmbedTab } from '@/components/settings/embed-tab';
import type { WorkspaceSettings } from '@/types/workspace';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/types/workspace';

interface Workspace {
  id: string;
  settings: WorkspaceSettings;
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [activeTab, setActiveTab] = useState('content');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch workspace on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/workspace');
        const data = await res.json();
        if (data.success && data.workspace) {
          const mergedSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...data.workspace.settings };
          setWorkspace({ id: data.workspace.id, settings: mergedSettings });
          setSettings(mergedSettings);
        }
      } catch (err) {
        console.error('Failed to load workspace:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Track changes
  const handleSettingsChange = (updates: Partial<WorkspaceSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
    setSaveStatus('idle');
  };

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveStatus('success');
        setHasChanges(false);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setErrorMessage(data.error || 'Failed to save settings');
      }
    } catch {
      setSaveStatus('error');
      setErrorMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Settings</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Configure your chatbot
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-ce-navy" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with save button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Settings</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Configure your chatbot
          </p>
        </div>

        {/* Save button - only show for tabs that modify workspace settings */}
        {activeTab !== 'api-keys' && activeTab !== 'embed' && (
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Error message */}
      {saveStatus === 'error' && errorMessage && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Settings content */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Tabs */}
        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === 'content' && (
            <ContentTab settings={settings} onChange={handleSettingsChange} />
          )}
          {activeTab === 'style' && (
            <StyleTab settings={settings} onChange={handleSettingsChange} />
          )}
          {activeTab === 'ai' && (
            <AITab settings={settings} onChange={handleSettingsChange} />
          )}
          {activeTab === 'api-keys' && <ApiKeysTab />}
          {activeTab === 'embed' && workspace && (
            <EmbedTab workspaceId={workspace.id} />
          )}
        </div>
      </div>
    </div>
  );
}
