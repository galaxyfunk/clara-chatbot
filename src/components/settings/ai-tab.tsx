'use client';

import type { WorkspaceSettings } from '@/types/workspace';

interface AITabProps {
  settings: WorkspaceSettings;
  onChange: (settings: Partial<WorkspaceSettings>) => void;
}

export function AITab({ settings, onChange }: AITabProps) {
  return (
    <div className="space-y-6">
      {/* Personality Prompt */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Personality Prompt
        </label>
        <textarea
          value={settings.personality_prompt}
          onChange={(e) => onChange({ personality_prompt: e.target.value })}
          rows={20}
          className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy resize-y font-mono text-sm min-h-[300px]"
        />
        <p className="mt-1 text-xs text-ce-text-muted">
          System instructions that define how your chatbot behaves
        </p>
      </div>

      {/* Confidence Threshold */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Confidence Threshold
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={settings.confidence_threshold}
            onChange={(e) =>
              onChange({ confidence_threshold: parseFloat(e.target.value) })
            }
            className="flex-1 h-2 bg-ce-muted rounded-lg appearance-none cursor-pointer accent-ce-navy"
          />
          <span className="w-16 px-2 py-1 text-center text-sm font-medium bg-ce-muted rounded">
            {Math.round(settings.confidence_threshold * 100)}%
          </span>
        </div>
        <p className="mt-1 text-xs text-ce-text-muted">
          Questions below this threshold are flagged as gaps. Lower = more
          permissive, higher = stricter matching.
        </p>
      </div>

      {/* Escalation Toggle */}
      <div className="p-4 bg-ce-muted rounded-lg">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.escalation_enabled}
            onChange={(e) =>
              onChange({ escalation_enabled: e.target.checked })
            }
            className="w-4 h-4 mt-0.5 rounded border-ce-border text-ce-navy focus:ring-ce-navy"
          />
          <div>
            <span className="block text-sm font-medium text-ce-text">
              Enable Smart Escalation
            </span>
            <span className="block mt-1 text-xs text-ce-text-muted">
              When the chatbot cannot confidently answer a question, offer
              visitors the option to book a call. Requires a booking URL in the
              Content tab.
            </span>
          </div>
        </label>
      </div>

      {/* Integrations */}
      <div className="border-t border-ce-border pt-6">
        <h3 className="text-sm font-semibold text-ce-text mb-4">Integrations</h3>
        <div className="p-4 bg-ce-muted rounded-lg">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hubspot_enabled}
              onChange={(e) =>
                onChange({ hubspot_enabled: e.target.checked })
              }
              className="w-4 h-4 mt-0.5 rounded border-ce-border text-ce-navy focus:ring-ce-navy"
            />
            <div>
              <span className="block text-sm font-medium text-ce-text">
                HubSpot Contact Sync
              </span>
              <span className="block mt-1 text-xs text-ce-text-muted">
                Automatically create or update HubSpot contacts when visitors
                share their email in chat. Requires HUBSPOT_API_KEY environment
                variable.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
