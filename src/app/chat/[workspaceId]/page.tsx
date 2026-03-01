'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { ChatWindow } from '@/components/chat/chat-window';
import type { WorkspaceSettings } from '@/types/workspace';

interface PublicSettings {
  display_name: string;
  welcome_message: string;
  placeholder_text: string;
  suggested_messages: string[];
  booking_url: string | null;
  primary_color: string;
  bubble_color: string;
  bubble_position: 'left' | 'right';
  avatar_url: string | null;
  chat_icon_url: string | null;
  max_suggestion_chips: number;
  escalation_enabled: boolean;
  powered_by_clara: boolean;
}

export default function PublicChatPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIframe, setIsIframe] = useState(false);

  // Detect if running inside an iframe
  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch(`/api/workspace/public?workspace_id=${workspaceId}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error || 'Failed to load chat');
          return;
        }

        setSettings(data.settings);
      } catch {
        setError('Failed to connect. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      fetchSettings();
    }
  }, [workspaceId]);

  // Send height to parent for dynamic iframe sizing
  useEffect(() => {
    if (isIframe) {
      const sendHeight = () => {
        const height = document.body.scrollHeight;
        window.parent.postMessage({ type: 'clara-resize', height }, '*');
      };
      // Send on mount and on resize
      sendHeight();
      const observer = new ResizeObserver(sendHeight);
      observer.observe(document.body);
      return () => observer.disconnect();
    }
  }, [isIframe]);

  // Loading state
  if (loading) {
    return (
      <div className={`${isIframe ? 'h-full' : 'min-h-screen'} flex items-center justify-center bg-gray-50`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Loading chat...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !settings) {
    return (
      <div className={`${isIframe ? 'h-full' : 'min-h-screen'} flex items-center justify-center bg-gray-50 p-4`}>
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Chat Unavailable
          </h1>
          <p className="text-gray-500 text-sm">
            {error || 'This chat is not available. Please check the link and try again.'}
          </p>
        </div>
      </div>
    );
  }

  // Convert public settings to full WorkspaceSettings format
  const fullSettings: WorkspaceSettings = {
    display_name: settings.display_name,
    welcome_message: settings.welcome_message,
    placeholder_text: settings.placeholder_text,
    suggested_messages: settings.suggested_messages,
    booking_url: settings.booking_url,
    primary_color: settings.primary_color,
    bubble_color: settings.bubble_color,
    bubble_position: settings.bubble_position,
    avatar_url: settings.avatar_url,
    chat_icon_url: settings.chat_icon_url,
    max_suggestion_chips: settings.max_suggestion_chips,
    escalation_enabled: settings.escalation_enabled,
    powered_by_clara: settings.powered_by_clara,
    // These fields aren't used in the public chat, but required by type
    personality_prompt: '',
    confidence_threshold: 0.78,
    custom_categories: [],
    onboarding_completed_steps: [],
  };

  return (
    <div className="h-screen w-full">
      <ChatWindow
        workspaceId={workspaceId}
        settings={fullSettings}
        isPlayground={false}
      />
    </div>
  );
}
