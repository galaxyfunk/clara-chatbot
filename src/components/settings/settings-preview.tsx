'use client';

import { Send } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';

interface SettingsPreviewProps {
  settings: WorkspaceSettings;
  hasUnsavedChanges: boolean;
}

export function SettingsPreview({ settings, hasUnsavedChanges }: SettingsPreviewProps) {
  // Sample conversation to show styling
  const sampleMessages = [
    { role: 'user' as const, content: 'What services do you offer?' },
    { role: 'assistant' as const, content: "I'd be happy to help! We offer a range of services tailored to your needs. Would you like more details about any specific area?" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Preview header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Preview</span>
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
              Unsaved
            </span>
          )}
        </div>
      </div>

      {/* Chat widget preview */}
      <div className="max-h-[500px] overflow-hidden">
        <div className="flex flex-col h-[480px] bg-gray-50">
          {/* Widget header */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: settings.primary_color }}
          >
            {settings.avatar_url ? (
              <img
                src={settings.avatar_url}
                alt={settings.display_name}
                className="w-8 h-8 rounded-full object-cover border-2 border-white/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
                {settings.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <h3 className="text-white font-medium text-sm">{settings.display_name}</h3>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Welcome message */}
            <div className="flex items-start gap-2">
              {settings.avatar_url ? (
                <img
                  src={settings.avatar_url}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs"
                  style={{ backgroundColor: settings.primary_color }}
                >
                  {settings.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div
                className="rounded-lg px-3 py-2 max-w-[85%] text-sm"
                style={{ backgroundColor: settings.bubble_color, color: '#fff' }}
              >
                {settings.welcome_message}
              </div>
            </div>

            {/* Sample conversation */}
            {sampleMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  settings.avatar_url ? (
                    <img
                      src={settings.avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs"
                      style={{ backgroundColor: settings.primary_color }}
                    >
                      {settings.display_name.charAt(0).toUpperCase()}
                    </div>
                  )
                )}
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                    msg.role === 'user'
                      ? 'bg-gray-200 text-gray-800'
                      : ''
                  }`}
                  style={
                    msg.role === 'assistant'
                      ? { backgroundColor: settings.bubble_color, color: '#fff' }
                      : undefined
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {/* Suggested messages */}
          {settings.suggested_messages.length > 0 && (
            <div className="flex-shrink-0 px-3 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {settings.suggested_messages.slice(0, settings.max_suggestion_chips).map((chip, idx) => (
                  <button
                    key={idx}
                    className="px-2.5 py-1 text-xs rounded-full border transition-colors cursor-default"
                    style={{
                      borderColor: settings.primary_color,
                      color: settings.primary_color,
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="flex-shrink-0 p-3 bg-white border-t border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={settings.placeholder_text}
                disabled
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-full bg-gray-50 cursor-not-allowed"
              />
              <button
                disabled
                className="p-1.5 rounded-full text-white cursor-not-allowed opacity-50"
                style={{ backgroundColor: settings.primary_color }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Powered by Clara */}
            {settings.powered_by_clara && (
              <p className="mt-1.5 text-center text-[10px] text-gray-400">
                Powered by Clara
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
