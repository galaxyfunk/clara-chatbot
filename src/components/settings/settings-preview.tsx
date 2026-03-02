'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';
import { WIDGET_LAYOUTS } from '@/types/workspace';
import { isDark } from '@/lib/color-utils';

interface SettingsPreviewProps {
  settings: WorkspaceSettings;
  hasUnsavedChanges: boolean;
}

// Standard chat panel - IDENTICAL for all layouts
function ChatPanel({
  settings,
  isDarkBg,
  showTrafficLights = false,
}: {
  settings: WorkspaceSettings;
  isDarkBg: boolean;
  showTrafficLights?: boolean;
}) {
  return (
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
        {showTrafficLights && (
          <div className="flex gap-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
        )}
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
  );
}

// Fake host page background
function HostPageBackground() {
  return (
    <div className="absolute inset-0 bg-[#f5f5f5] p-3">
      <div className="w-16 h-2 bg-gray-300 rounded mb-3" />
      <div className="w-24 h-3 bg-gray-200 rounded mb-2" />
      <div className="w-full h-2 bg-gray-200 rounded mb-1.5" />
      <div className="w-4/5 h-2 bg-gray-200 rounded mb-1.5" />
      <div className="w-3/5 h-2 bg-gray-200 rounded mb-4" />
      <div className="w-20 h-2 bg-gray-300 rounded mb-2" />
      <div className="w-full h-2 bg-gray-200 rounded mb-1.5" />
      <div className="w-4/5 h-2 bg-gray-200 rounded" />
    </div>
  );
}

// Classic Bubble Layout
function ClassicPreview({ settings, isDarkBg }: { settings: WorkspaceSettings; isDarkBg: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-gray-200">
      <HostPageBackground />

      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
        style={{ backgroundColor: settings.bubble_color || settings.primary_color }}
      >
        {isOpen ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : settings.chat_icon_url ? (
          <img src={settings.chat_icon_url} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        )}
      </button>

      {/* Overlay panel */}
      {isOpen && (
        <div className="absolute bottom-14 right-3 w-48 h-56 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <ChatPanel settings={settings} isDarkBg={isDarkBg} />
        </div>
      )}
    </div>
  );
}

// Command Bar Layout
function CommandBarPreview({ settings, isDarkBg }: { settings: WorkspaceSettings; isDarkBg: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-gray-200 bg-[#0d0d0d]">
      {/* Dimmed host content */}
      <div className="absolute inset-0 opacity-30 p-3">
        <div className="w-16 h-2 bg-gray-600 rounded mb-3" />
        <div className="w-24 h-3 bg-gray-700 rounded mb-2" />
        <div className="w-full h-2 bg-gray-700 rounded mb-1.5" />
        <div className="w-4/5 h-2 bg-gray-700 rounded" />
      </div>

      {/* Command bar trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md"
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: settings.primary_color }}
          />
          <span className="text-[10px] text-gray-400 max-w-[100px] truncate">
            {settings.trigger_text || 'Ask about our services...'}
          </span>
          <span className="text-[8px] text-gray-500 bg-white/10 px-1 rounded font-mono">⌘K</span>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <>
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[70%] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <ChatPanel settings={settings} isDarkBg={isDarkBg} />
          </div>
        </>
      )}
    </div>
  );
}

// Side Whisper Layout
function SideWhisperPreview({ settings, isDarkBg }: { settings: WorkspaceSettings; isDarkBg: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-gray-200">
      <HostPageBackground />

      {/* Edge strip trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute top-1/2 -translate-y-1/2 right-0 w-1.5 h-20 rounded-l-md flex items-center justify-center transition-all hover:w-8 group"
          style={{ backgroundColor: settings.primary_color }}
        >
          <div className="w-1 h-1 rounded-full bg-white animate-pulse group-hover:hidden" />
          <span className="hidden group-hover:block text-[8px] text-white writing-vertical">
            {settings.hint_messages?.[0] || 'Need help?'}
          </span>
        </button>
      )}

      {/* Side panel */}
      {isOpen && (
        <>
          <div className="absolute inset-0 bg-black/20" onClick={() => setIsOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-[55%] shadow-xl animate-in slide-in-from-right duration-200">
            <ChatPanel settings={settings} isDarkBg={isDarkBg} />
          </div>
        </>
      )}

      <style jsx>{`
        .writing-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
      `}</style>
    </div>
  );
}

export function SettingsPreview({ settings, hasUnsavedChanges }: SettingsPreviewProps) {
  const isDarkBg = isDark(settings.chat_background);
  const currentLayout = WIDGET_LAYOUTS.find(l => l.id === settings.widget_layout) || WIDGET_LAYOUTS[0];

  const renderPreview = () => {
    switch (settings.widget_layout) {
      case 'command_bar':
        return <CommandBarPreview settings={settings} isDarkBg={isDarkBg} />;
      case 'side_whisper':
        return <SideWhisperPreview settings={settings} isDarkBg={isDarkBg} />;
      default:
        return <ClassicPreview settings={settings} isDarkBg={isDarkBg} />;
    }
  };

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

      {/* Interactive preview */}
      <div className="p-3">
        <div className="h-[calc(100vh-220px)] min-h-[350px] max-h-[500px]">
          {renderPreview()}
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Click the trigger to preview the interaction
        </p>
      </div>
    </div>
  );
}
