'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import type { AgentPrompt } from '@/types/agent-prompts';

interface PromptEditorProps {
  prompt: AgentPrompt;
}

export function PromptEditor({ prompt }: PromptEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description ?? '');
  const [content, setContent] = useState(prompt.content);
  const [isActive, setIsActive] = useState(prompt.isActive);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasChanges =
    name !== prompt.name ||
    description !== (prompt.description ?? '') ||
    content !== prompt.content ||
    isActive !== prompt.isActive;

  async function handleSave() {
    setSaving(true);
    setErrorMessage(null);
    setSaveStatus('idle');
    try {
      const res = await fetch(`/api/agent-prompts/${prompt.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description.trim() === '' ? null : description,
          content,
          isActive,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveStatus('error');
        setErrorMessage(data.error || 'Save failed');
        return;
      }
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
      router.refresh();
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/agent-settings/prompts"
          className="inline-flex items-center gap-1 text-sm text-ce-teal hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          All prompts
        </Link>
        <div className="flex items-center justify-between mt-2 gap-4">
          <h1 className="text-2xl font-semibold text-ce-text">{prompt.name}</h1>
          <span className="text-xs text-ce-text-muted font-mono">{prompt.slug}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-teal focus:border-ce-teal focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about what this prompt does"
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-teal focus:border-ce-teal focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">
            Prompt content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-teal focus:border-ce-teal focus:outline-none font-mono text-sm leading-relaxed"
          />
          <p className="text-xs text-ce-text-muted mt-1">
            Variables in <code className="bg-ce-muted px-1 py-0.5 rounded">{'{{double_braces}}'}</code>{' '}
            are interpolated by the agent at runtime.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ce-text">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-ce-border text-ce-teal focus:ring-ce-teal"
          />
          <span>Active</span>
        </label>
      </div>

      {saveStatus === 'error' && errorMessage && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-ce-text-muted">
          {saveStatus === 'success' && (
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle className="w-4 h-4" />
              Saved
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
