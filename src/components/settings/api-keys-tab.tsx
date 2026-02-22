'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, Loader2, Key, AlertCircle } from 'lucide-react';
import { SUPPORTED_MODELS, type LLMProvider, type ApiKey } from '@/types/api-keys';

interface ApiKeysTabProps {
  // This tab manages its own state since it's separate from workspace settings
}

interface ApiKeyForm {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  label: string;
  isDefault: boolean;
}

const INITIAL_FORM: ApiKeyForm = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: '',
  label: '',
  isDefault: false,
};

export function ApiKeysTab({}: ApiKeysTabProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ApiKeyForm>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  // Fetch keys on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/api-keys');
        const data = await res.json();
        if (data.success) {
          // Map snake_case to camelCase
          setKeys(
            (data.keys || []).map((k: Record<string, unknown>) => ({
              id: k.id,
              workspaceId: k.workspace_id,
              provider: k.provider,
              model: k.model,
              keyLast4: k.key_last4,
              label: k.label,
              isDefault: k.is_default,
              isActive: k.is_active,
              createdAt: k.created_at,
              updatedAt: k.updated_at,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load API keys:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleProviderChange = (provider: LLMProvider) => {
    // Reset model when provider changes
    const firstModel = SUPPORTED_MODELS.find((m) => m.provider === provider);
    setForm({
      ...form,
      provider,
      model: firstModel?.id || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          model: form.model,
          api_key: form.apiKey,
          label: form.label || null,
          is_default: form.isDefault,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to add API key');
        return;
      }

      // Add to list
      const newKey: ApiKey = {
        id: data.key.id,
        workspaceId: data.key.workspace_id,
        provider: data.key.provider,
        model: data.key.model,
        keyLast4: data.key.key_last4,
        label: data.key.label,
        isDefault: data.key.is_default,
        isActive: data.key.is_active,
        createdAt: data.key.created_at,
        updatedAt: data.key.updated_at,
      };

      // If new key is default, unset others
      if (newKey.isDefault) {
        setKeys((prev) =>
          prev.map((k) => ({ ...k, isDefault: false })).concat(newKey)
        );
      } else {
        setKeys((prev) => [...prev, newKey]);
      }

      setForm(INITIAL_FORM);
      setShowForm(false);
    } catch (err) {
      setError('Failed to add API key');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!window.confirm('Delete this API key? This cannot be undone.')) return;

    setDeleting(keyId);
    try {
      const res = await fetch(`/api/api-keys/${keyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } catch (err) {
      console.error('Failed to delete API key:', err);
    }
    setDeleting(null);
  };

  const handleSetDefault = async (keyId: string) => {
    try {
      const res = await fetch(`/api/api-keys/${keyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      const data = await res.json();
      if (data.success) {
        setKeys((prev) =>
          prev.map((k) => ({ ...k, isDefault: k.id === keyId }))
        );
      }
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  };

  const filteredModels = SUPPORTED_MODELS.filter(
    (m) => m.provider === form.provider
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-ce-navy" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-ce-text">API Keys</h3>
          <p className="text-sm text-ce-text-muted">
            Add your OpenAI or Anthropic API keys to power the chatbot
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90"
          >
            <Plus className="w-4 h-4" />
            Add Key
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 bg-ce-muted rounded-lg space-y-4"
        >
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Provider
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('anthropic')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.provider === 'anthropic'
                    ? 'bg-ce-navy text-white border-ce-navy'
                    : 'bg-white text-ce-text border-ce-border hover:bg-white/80'
                }`}
              >
                Anthropic
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange('openai')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.provider === 'openai'
                    ? 'bg-ce-navy text-white border-ce-navy'
                    : 'bg-white text-ce-text border-ce-border hover:bg-white/80'
                }`}
              >
                OpenAI
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Model
            </label>
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy bg-white"
            >
              {filteredModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} — {model.description}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              API Key
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={
                form.provider === 'anthropic'
                  ? 'sk-ant-...'
                  : 'sk-proj-...'
              }
              required
              className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
            />
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Production Key"
              className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
            />
          </div>

          {/* Default checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) =>
                setForm({ ...form, isDefault: e.target.checked })
              }
              className="w-4 h-4 rounded border-ce-border text-ce-navy focus:ring-ce-navy"
            />
            <span className="text-sm text-ce-text">Set as default key</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(INITIAL_FORM);
                setError(null);
              }}
              className="px-4 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.apiKey}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Validating...' : 'Add Key'}
            </button>
          </div>
        </form>
      )}

      {/* Keys list */}
      {keys.length === 0 ? (
        <div className="text-center py-8 text-ce-text-muted">
          <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No API keys configured</p>
          <p className="text-sm mt-1">Add a key to enable chat functionality</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const model = SUPPORTED_MODELS.find((m) => m.id === key.model);
            return (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 bg-white border border-ce-border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  {key.isDefault && (
                    <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ce-text">
                        {model?.name || key.model}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-ce-muted rounded text-ce-text-muted">
                        {key.provider}
                      </span>
                    </div>
                    <p className="text-sm text-ce-text-muted">
                      {key.label || `Ends with ...${key.keyLast4}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!key.isDefault && (
                    <button
                      onClick={() => handleSetDefault(key.id)}
                      className="px-3 py-1 text-xs font-medium text-ce-text border border-ce-border rounded hover:bg-ce-muted"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(key.id)}
                    disabled={deleting === key.id}
                    className="p-2 text-ce-text-muted hover:text-red-500 disabled:opacity-50"
                  >
                    {deleting === key.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
