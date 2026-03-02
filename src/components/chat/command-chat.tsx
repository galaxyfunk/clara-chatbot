'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import type { WorkspaceSettings } from '@/types/workspace';
import { isDark } from '@/lib/color-utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  gap_detected?: boolean;
  escalation_offered?: boolean;
  booking_url?: string | null;
  suggestion_chips?: string[];
  isStreaming?: boolean;
}

interface CommandChatProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function CommandChat({ workspaceId, settings }: CommandChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionToken] = useState(() => generateId());
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDarkBg = isDark(settings.chat_background);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setHasStartedConversation(true);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          session_token: sessionToken,
          message: content.trim(),
          message_id: userMessage.id,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: errorData.error || 'Sorry, something went wrong. Please try again.',
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
        return;
      }

      // Create placeholder assistant message
      const assistantId = generateId();
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        suggestion_chips: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setIsStreaming(true);

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'token') {
              fullContent += data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                )
              );
            }

            if (data.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: fullContent,
                        suggestion_chips: data.suggestion_chips || [],
                        escalation_offered: data.escalation_offered || false,
                        booking_url: data.booking_url || null,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }

            if (data.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: fullContent || 'Sorry, something went wrong. Please try again.',
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }

      setIsStreaming(false);
    } catch {
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, I could not connect. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleChipClick = (chip: string) => {
    sendMessage(chip);
  };

  const handleClose = () => {
    window.parent.postMessage({ type: 'clara-close' }, '*');
  };

  const isDisabled = isLoading || isStreaming;

  // Color calculations
  const textColor = isDarkBg ? '#e5e7eb' : '#374151';
  const mutedTextColor = isDarkBg ? '#6b7280' : '#9ca3af';
  const borderColor = isDarkBg ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
  const inputBgColor = isDarkBg ? 'rgba(255,255,255,0.06)' : '#ffffff';
  const headerBgColor = isDarkBg
    ? 'rgba(255,255,255,0.03)'
    : 'rgba(0,0,0,0.02)';

  return (
    <div
      className="flex flex-col h-full w-full min-h-[300px] max-h-[80vh]"
      style={{ backgroundColor: settings.chat_background }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 py-3.5"
        style={{
          backgroundColor: headerBgColor,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Green online dot */}
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: '#4ade80',
              boxShadow: '0 0 6px #4ade80',
            }}
          />
          {/* Name - uppercase, bold, small */}
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: textColor }}
          >
            {settings.display_name}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" style={{ color: mutedTextColor }} />
        </button>
      </div>

      {/* Input area - at the top */}
      <div className="flex-shrink-0 px-5 py-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={settings.placeholder_text || 'Ask about developers, pricing, process...'}
            disabled={isDisabled}
            className="flex-1 px-4 py-3.5 text-[15px] rounded-xl focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:opacity-50"
            style={{
              backgroundColor: inputBgColor,
              border: `1px solid ${borderColor}`,
              color: isDarkBg ? '#e5e7eb' : '#1f2937',
              '--tw-ring-color': settings.primary_color,
            } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="px-4 py-3.5 text-sm font-medium rounded-xl disabled:opacity-30 transition-opacity"
            style={{
              backgroundColor: settings.primary_color,
              color: settings.header_text_color,
            }}
          >
            Send
          </button>
        </form>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-5">
        {!hasStartedConversation ? (
          /* Initial state: Suggestion chips */
          <div className="flex flex-wrap gap-2 pb-4">
            {settings.suggested_messages.slice(0, settings.max_suggestion_chips).map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleChipClick(chip)}
                disabled={isDisabled}
                className="px-3.5 py-2 text-[13px] rounded-full transition-colors hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.15)' : '#d1d5db'}`,
                  color: isDarkBg ? '#d1d5db' : '#4b5563',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        ) : (
          /* Conversation state: Messages */
          <div className="space-y-4 pb-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                primaryColor={settings.primary_color}
                headerTextColor={settings.header_text_color}
                avatarUrl={settings.avatar_url}
                displayName={settings.display_name}
                isDarkBg={isDarkBg}
              />
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div
                className="flex items-center gap-2"
                style={{ color: mutedTextColor }}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{settings.display_name} is typing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderTop: `1px solid ${borderColor}` }}
      >
        {settings.powered_by_clara ? (
          <span className="text-[11px]" style={{ color: mutedTextColor }}>
            Powered by Clara
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11px]" style={{ color: mutedTextColor }}>
          ESC to close
        </span>
      </div>
    </div>
  );
}
