'use client';

import { Send } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';
import { WIDGET_LAYOUTS } from '@/types/workspace';
import { isDark } from '@/lib/color-utils';

interface SettingsPreviewProps {
  settings: WorkspaceSettings;
  hasUnsavedChanges: boolean;
}

export function SettingsPreview({ settings, hasUnsavedChanges }: SettingsPreviewProps) {
  const isDarkBg = isDark(settings.chat_background);
  const currentLayout = WIDGET_LAYOUTS.find(l => l.id === settings.widget_layout) || WIDGET_LAYOUTS[0];

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
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {currentLayout.name}
        </span>
      </div>

      {/* Chat panel preview */}
      <div className="p-3">
        <div className="h-[calc(100vh-220px)] min-h-[350px] max-h-[500px]">
          <div
            className="flex flex-col h-full rounded-lg overflow-hidden"
            style={{
              backgroundColor: settings.chat_background,
              border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5"
              style={{ backgroundColor: settings.primary_color }}
            >
              {settings.avatar_url ? (
                <img
                  src={settings.avatar_url}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: settings.header_text_color }}
                >
                  {settings.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className="text-sm font-medium"
                style={{ color: settings.header_text_color }}
              >
                {settings.display_name}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
              {/* Welcome message */}
              <div className="flex items-start gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
                  style={{ backgroundColor: settings.primary_color, color: settings.header_text_color }}
                >
                  {settings.display_name.charAt(0).toUpperCase()}
                </div>
                <div
                  className="rounded-lg px-2.5 py-1.5 text-xs max-w-[85%]"
                  style={{
                    backgroundColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'white',
                    border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
                    color: isDarkBg ? '#e5e7eb' : '#374151',
                  }}
                >
                  {settings.welcome_message}
                </div>
              </div>

              {/* User message */}
              <div className="flex justify-end">
                <div
                  className="rounded-lg px-2.5 py-1.5 text-xs max-w-[85%]"
                  style={{ backgroundColor: settings.primary_color, color: settings.header_text_color }}
                >
                  What services do you offer?
                </div>
              </div>

              {/* Bot reply */}
              <div className="flex items-start gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
                  style={{ backgroundColor: settings.primary_color, color: settings.header_text_color }}
                >
                  {settings.display_name.charAt(0).toUpperCase()}
                </div>
                <div
                  className="rounded-lg px-2.5 py-1.5 text-xs max-w-[85%]"
                  style={{
                    backgroundColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'white',
                    border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
                    color: isDarkBg ? '#e5e7eb' : '#374151',
                  }}
                >
                  I'd be happy to help! We offer tailored services for your needs.
                </div>
              </div>
            </div>

            {/* Suggestion chips */}
            {settings.suggested_messages.length > 0 && (
              <div className="flex-shrink-0 px-2.5 pb-1.5">
                <div className="flex flex-wrap gap-1">
                  {settings.suggested_messages.slice(0, 2).map((chip, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-[10px] rounded-full"
                      style={{
                        backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : 'white',
                        border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.15)' : settings.primary_color}`,
                        color: isDarkBg ? '#d1d5db' : settings.primary_color,
                      }}
                    >
                      {chip.length > 15 ? chip.slice(0, 15) + '...' : chip}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div
              className="flex-shrink-0 p-2"
              style={{
                backgroundColor: isDarkBg ? 'rgba(255,255,255,0.03)' : 'white',
                borderTop: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.06)' : '#e5e7eb'}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="flex-1 px-2.5 py-1 text-[10px] rounded-full"
                  style={{
                    backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
                    border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : '#d1d5db'}`,
                    color: isDarkBg ? '#6b7280' : '#9ca3af',
                  }}
                >
                  {settings.placeholder_text}
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: settings.primary_color }}
                >
                  <Send className="w-3 h-3" style={{ color: settings.header_text_color }} />
                </div>
              </div>
              {settings.powered_by_clara && (
                <p
                  className="mt-1 text-center text-[8px]"
                  style={{ color: isDarkBg ? '#4b5563' : '#9ca3af' }}
                >
                  Powered by Clara
                </p>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Live preview — colors update as you change settings
        </p>
      </div>
    </div>
  );
}
