'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import type { WorkspaceSettings } from '@/types/workspace';

interface StyleTabProps {
  settings: WorkspaceSettings;
  onChange: (settings: Partial<WorkspaceSettings>) => void;
}

export function StyleTab({ settings, onChange }: StyleTabProps) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6">
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

      {/* Bubble Position */}
      <div>
        <label className="block text-sm font-medium text-ce-text mb-1">
          Bubble Position
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => onChange({ bubble_position: 'left' })}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              settings.bubble_position === 'left'
                ? 'bg-ce-navy text-white border-ce-navy'
                : 'bg-white text-ce-text border-ce-border hover:bg-ce-muted'
            }`}
          >
            Bottom Left
          </button>
          <button
            onClick={() => onChange({ bubble_position: 'right' })}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              settings.bubble_position === 'right'
                ? 'bg-ce-navy text-white border-ce-navy'
                : 'bg-white text-ce-text border-ce-border hover:bg-ce-muted'
            }`}
          >
            Bottom Right
          </button>
        </div>
      </div>

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
