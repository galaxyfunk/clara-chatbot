'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, X, ExternalLink } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';
import { WIDGET_LAYOUTS } from '@/types/workspace';

interface StyleTabProps {
  settings: WorkspaceSettings;
  onChange: (settings: Partial<WorkspaceSettings>) => void;
  workspaceId: string;
}

// Layout card SVG icons
function ClassicIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
      <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? '#f0f0f8' : '#f5f5f5'} stroke={active ? color : '#ddd'} strokeWidth="1" />
      <rect x="8" y="8" width="22" height="3" rx="1.5" fill="#ddd" />
      <rect x="8" y="14" width="30" height="2" rx="1" fill="#e8e8e8" />
      <rect x="8" y="18" width="20" height="2" rx="1" fill="#e8e8e8" />
      <circle cx="44" cy="32" r="6" fill={active ? color : '#ccc'} />
      <path d="M41.5 32h5M44 29.5v5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CommandBarIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
      <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? '#f0f0f8' : '#f5f5f5'} stroke={active ? color : '#ddd'} strokeWidth="1" />
      <rect x="10" y="16" width="36" height="12" rx="6" fill={active ? `${color}18` : '#e8e8e8'} stroke={active ? color : '#ddd'} strokeWidth="1" />
      <circle cx="17" cy="22" r="2.5" fill={active ? color : '#ccc'} />
      <rect x="22" y="20.5" width="16" height="3" rx="1.5" fill={active ? '#bbb' : '#ddd'} />
    </svg>
  );
}

function SideWhisperIcon({ color, active }: { color: string; active: boolean }) {
  return (
    <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
      <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? '#f0f0f8' : '#f5f5f5'} stroke={active ? color : '#ddd'} strokeWidth="1" />
      <rect x="8" y="8" width="22" height="3" rx="1.5" fill="#ddd" />
      <rect x="8" y="14" width="26" height="2" rx="1" fill="#e8e8e8" />
      <rect x="50" y="2" width="4" height="36" rx="2" fill={active ? color : '#ccc'} />
      <circle cx="52" cy="20" r="1.2" fill="#fff" />
    </svg>
  );
}

const LAYOUT_ICONS: Record<string, React.FC<{ color: string; active: boolean }>> = {
  classic: ClassicIcon,
  command_bar: CommandBarIcon,
  side_whisper: SideWhisperIcon,
};

export function StyleTab({ settings, onChange, workspaceId }: StyleTabProps) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Local state for textarea fields (converted from arrays)
  const [hintText, setHintText] = useState(
    (settings.hint_messages || []).join('\n')
  );

  // Sync local state when settings change externally
  useEffect(() => {
    setHintText((settings.hint_messages || []).join('\n'));
  }, [settings.hint_messages]);

  const handleUpload = async (
    file: File,
    type: 'avatar' | 'icon'
  ): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        return data.url;
      }
      console.error('Upload failed:', data.error);
      return null;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const url = await handleUpload(file, 'avatar');
    if (url) {
      onChange({ avatar_url: url });
    }
    setUploadingAvatar(false);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIcon(true);
    const url = await handleUpload(file, 'icon');
    if (url) {
      onChange({ chat_icon_url: url });
    }
    setUploadingIcon(false);
    if (iconInputRef.current) {
      iconInputRef.current.value = '';
    }
  };

  const handleHintMessagesChange = (value: string) => {
    setHintText(value);
    const arr = value.split('\n').map(s => s.trim()).filter(Boolean);
    onChange({ hint_messages: arr.length > 0 ? arr : null });
  };

  return (
    <div className="space-y-6">
      {/* Widget Layout */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Widget Layout
        </label>
        <p className="text-xs text-ce-text-muted mb-3">
          Choose how the chatbot appears on your website
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WIDGET_LAYOUTS.map((layout) => {
            const active = settings.widget_layout === layout.id;
            const IconComponent = LAYOUT_ICONS[layout.id];
            return (
              <button
                key={layout.id}
                onClick={() => onChange({ widget_layout: layout.id as WorkspaceSettings['widget_layout'] })}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  active
                    ? 'bg-opacity-5'
                    : 'bg-white border-ce-border hover:border-gray-300'
                }`}
                style={{
                  borderColor: active ? settings.primary_color : undefined,
                  backgroundColor: active ? `${settings.primary_color}08` : undefined,
                }}
              >
                <IconComponent color={settings.primary_color} active={active} />
                <div className="text-center">
                  <div className={`text-xs font-medium ${active ? 'text-ce-navy' : 'text-gray-600'}`}>
                    {layout.name}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {layout.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <a
          href={`/chat/${workspaceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-ce-teal hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Open Preview
        </a>
      </div>

      {/* Primary Color */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Primary Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={settings.primary_color}
            onChange={(e) => onChange({ primary_color: e.target.value })}
            className="w-12 h-10 rounded border border-ce-border cursor-pointer"
          />
          <input
            type="text"
            value={settings.primary_color}
            onChange={(e) => onChange({ primary_color: e.target.value })}
            className="w-28 px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy font-mono text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-ce-text-muted">
          Used for header, buttons, and user message bubbles
        </p>
      </div>

      {/* Layout-Specific Fields */}
      {settings.widget_layout === 'classic' && (
        <>
          {/* Bubble Color */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Bubble Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.bubble_color}
                onChange={(e) => onChange({ bubble_color: e.target.value })}
                className="w-12 h-10 rounded border border-ce-border cursor-pointer"
              />
              <input
                type="text"
                value={settings.bubble_color}
                onChange={(e) => onChange({ bubble_color: e.target.value })}
                className="w-28 px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy font-mono text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-ce-text-muted">
              Color of the floating chat bubble button
            </p>
          </div>

          {/* Chat Icon */}
          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Chat Bubble Icon
            </label>
            <div className="flex items-center gap-4">
              {settings.chat_icon_url ? (
                <div className="relative">
                  <img
                    src={settings.chat_icon_url}
                    alt="Chat icon"
                    className="w-12 h-12 rounded-full object-cover border border-ce-border"
                  />
                  <button
                    onClick={() => onChange({ chat_icon_url: null })}
                    className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: settings.bubble_color }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
              )}
              <div>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconChange}
                  className="hidden"
                />
                <button
                  onClick={() => iconInputRef.current?.click()}
                  disabled={uploadingIcon}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted disabled:opacity-50"
                >
                  {uploadingIcon ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploadingIcon ? 'Uploading...' : 'Upload Icon'}
                </button>
                <p className="mt-1 text-xs text-ce-text-muted">
                  Custom icon for the floating bubble
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {settings.widget_layout === 'command_bar' && (
        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">
            Trigger Text
          </label>
          <input
            type="text"
            value={settings.trigger_text || ''}
            onChange={(e) => onChange({ trigger_text: e.target.value || null })}
            placeholder="Ask about our services →"
            className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy text-sm"
          />
          <p className="mt-1 text-xs text-ce-text-muted">
            Typewriter text shown before users click to open
          </p>
        </div>
      )}

      {settings.widget_layout === 'side_whisper' && (
        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">
            Hint Messages
          </label>
          <textarea
            value={hintText}
            onChange={(e) => handleHintMessagesChange(e.target.value)}
            rows={3}
            placeholder="Need help?&#10;Ask us anything&#10;We're online"
            className="w-full px-3 py-2 border border-ce-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ce-navy text-sm resize-y"
          />
          <p className="mt-1 text-xs text-ce-text-muted">
            Rotating text shown on the edge strip — one per line
          </p>
        </div>
      )}

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Avatar Image
        </label>
        <div className="flex items-center gap-4">
          {settings.avatar_url ? (
            <div className="relative">
              <img
                src={settings.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover border border-ce-border"
              />
              <button
                onClick={() => onChange({ avatar_url: null })}
                className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-medium"
              style={{ backgroundColor: settings.primary_color }}
            >
              {settings.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted disabled:opacity-50"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
            </button>
            <p className="mt-1 text-xs text-ce-text-muted">
              Recommended: 128x128px square image
            </p>
          </div>
        </div>
      </div>

      {/* Powered by Clara */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.powered_by_clara}
            onChange={(e) => onChange({ powered_by_clara: e.target.checked })}
            className="w-4 h-4 rounded border-ce-border text-ce-navy focus:ring-ce-navy"
          />
          <span className="text-sm font-medium text-ce-text">
            Show Powered by Clara badge
          </span>
        </label>
      </div>
    </div>
  );
}
