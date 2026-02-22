'use client';

import { Plus, X } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';

interface ContentTabProps {
  settings: WorkspaceSettings;
  onChange: (settings: Partial<WorkspaceSettings>) => void;
}

export function ContentTab({ settings, onChange }: ContentTabProps) {
  const handleAddSuggestion = () => {
    if (settings.suggested_messages.length >= 5) return;
    onChange({
      suggested_messages: [...settings.suggested_messages, ''],
    });
  };

  const handleUpdateSuggestion = (index: number, value: string) => {
    const updated = [...settings.suggested_messages];
    updated[index] = value;
    onChange({ suggested_messages: updated });
  };

  const handleRemoveSuggestion = (index: number) => {
    onChange({
      suggested_messages: settings.suggested_messages.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={settings.display_name}
          onChange={(e) => onChange({ display_name: e.target.value })}
          placeholder="Clara"
          className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
        />
        <p className="mt-1 text-xs text-ce-text-muted">
          The name shown in the chat header
        </p>
      </div>

      {/* Welcome Message */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Welcome Message
        </label>
        <textarea
          value={settings.welcome_message}
          onChange={(e) => onChange({ welcome_message: e.target.value })}
          rows={2}
          placeholder="Hi! How can I help you today?"
          className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy resize-none"
        />
        <p className="mt-1 text-xs text-ce-text-muted">
          First message visitors see when opening the chat
        </p>
      </div>

      {/* Placeholder Text */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Input Placeholder
        </label>
        <input
          type="text"
          value={settings.placeholder_text}
          onChange={(e) => onChange({ placeholder_text: e.target.value })}
          placeholder="Type your message..."
          className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
        />
      </div>

      {/* Suggested Messages */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Suggested Messages
        </label>
        <p className="text-xs text-ce-text-muted mb-3">
          Quick-start questions shown as clickable chips (max 5)
        </p>
        <div className="space-y-2">
          {settings.suggested_messages.map((msg, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={msg}
                onChange={(e) => handleUpdateSuggestion(index, e.target.value)}
                placeholder={`Suggestion ${index + 1}`}
                className="flex-1 px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
              />
              <button
                onClick={() => handleRemoveSuggestion(index)}
                className="p-2 text-ce-text-muted hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {settings.suggested_messages.length < 5 && (
            <button
              onClick={handleAddSuggestion}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ce-teal hover:text-ce-teal/80"
            >
              <Plus className="w-4 h-4" />
              Add suggestion
            </button>
          )}
        </div>
      </div>

      {/* Booking URL */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Booking URL
        </label>
        <input
          type="url"
          value={settings.booking_url || ''}
          onChange={(e) => onChange({ booking_url: e.target.value || null })}
          placeholder="https://calendly.com/your-link"
          className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy"
        />
        <p className="mt-1 text-xs text-ce-text-muted">
          Link for the "Book a Call" button when escalation is triggered
        </p>
      </div>
    </div>
  );
}
