'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import type { WorkspaceSettings } from '@/types/workspace';

// Simple isDark check - returns true if background appears dark
function isDark(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  gap_detected?: boolean;
  escalation_offered?: boolean;
  booking_url?: string | null;
  isStreaming?: boolean;
}

interface ChatWindowProps {
  workspaceId: string;
  settings: WorkspaceSettings;
  isPlayground?: boolean;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Strip any hallucinated URLs from LLM text — booking link is provided separately
function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
}

export function ChatWindow({ workspaceId, settings, isPlayground = false }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionToken] = useState(() => generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const charQueueRef = useRef<string[]>([]);
  const displayedContentRef = useRef('');
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  // Start the 15ms character dequeue interval if not already running
  const startCharTick = useCallback((assistantId: string) => {
    if (tickIntervalRef.current) return;
    activeAssistantIdRef.current = assistantId;
    tickIntervalRef.current = setInterval(() => {
      const queue = charQueueRef.current;
      if (queue.length === 0) {
        clearInterval(tickIntervalRef.current!);
        tickIntervalRef.current = null;
        return;
      }
      const char = queue.shift()!;
      displayedContentRef.current += char;
      const displayed = displayedContentRef.current;
      const id = activeAssistantIdRef.current!;
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: displayed } : m))
      );
    }, 15);
  }, []);

  // Flush the entire remaining queue immediately (for done/error/unmount)
  const flushCharQueue = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (charQueueRef.current.length > 0) {
      displayedContentRef.current += charQueueRef.current.join('');
      charQueueRef.current = [];
    }
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
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
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setIsStreaming(true);

      // Reset character queue for this response
      charQueueRef.current = [];
      displayedContentRef.current = '';

      // Read SSE stream with character-by-character animation
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let prevStripped = '';

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
              const stripped = stripUrls(fullContent);
              // Push only the new characters (delta after strip) into the queue
              const newChars = stripped.slice(prevStripped.length);
              prevStripped = stripped;
              for (const ch of newChars) {
                charQueueRef.current.push(ch);
              }
              startCharTick(assistantId);
            }

            if (data.type === 'done') {
              // Flush remaining queue instantly and apply final metadata
              flushCharQueue();
              const finalContent = stripUrls(fullContent);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: finalContent,
                        escalation_offered: data.escalation_offered || false,
                        booking_url: data.booking_url || null,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }

            if (data.type === 'error') {
              flushCharQueue();
              const finalContent = stripUrls(fullContent) || 'Sorry, something went wrong. Please try again.';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: finalContent, isStreaming: false }
                    : m
                )
              );
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }

      // Final flush in case stream ended without 'done' event
      flushCharQueue();
      const finalContent = stripUrls(fullContent);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: finalContent, isStreaming: false } : m
        )
      );

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

  const isDisabled = isLoading;

  // Classic chat uses white background
  const chatBackground = '#ffffff';
  const headerTextColor = '#ffffff';
  const isDarkBg = isDark(chatBackground);

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: chatBackground }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: settings.primary_color }}
      >
        {settings.avatar_url ? (
          <img
            src={settings.avatar_url}
            alt={settings.display_name}
            className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-medium"
            style={{ color: headerTextColor }}
          >
            {settings.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="font-medium" style={{ color: headerTextColor }}>
            {settings.display_name}
          </h2>
          {isPlayground && (
            <p className="text-xs" style={{ color: headerTextColor, opacity: 0.7 }}>
              Playground Mode
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Welcome message */}
        <MessageBubble
          message={{
            role: 'assistant',
            content: settings.welcome_message,
          }}
          primaryColor={settings.primary_color}
          headerTextColor={headerTextColor}
          avatarUrl={settings.avatar_url}
          displayName={settings.display_name}
          isDarkBg={isDarkBg}
        />

        {/* Suggested message chips (pre-conversation only) */}
        {messages.length === 0 && (settings.suggested_messages || []).filter((msg) => msg.trim()).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(settings.suggested_messages || []).filter((msg) => msg.trim()).map((msg, i) => (
              <button
                key={i}
                onClick={() => sendMessage(msg)}
                disabled={isDisabled}
                className="px-3 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
                style={{
                  border: `1px solid ${settings.primary_color}`,
                  color: settings.primary_color,
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = settings.primary_color;
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = settings.primary_color;
                }}
              >
                {msg}
              </button>
            ))}
          </div>
        )}

        {/* Conversation messages */}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            primaryColor={settings.primary_color}
            headerTextColor={headerTextColor}
            avatarUrl={settings.avatar_url}
            displayName={settings.display_name}
            isDarkBg={isDarkBg}
          />
        ))}

        {/* Typing indicator - show when loading (before stream starts) */}
        {isLoading && (
          <div
            className="flex items-center gap-2"
            style={{ color: isDarkBg ? '#9ca3af' : '#6b7280' }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{settings.display_name} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 p-4"
        style={{
          backgroundColor: isDarkBg ? 'rgba(255,255,255,0.03)' : 'white',
          borderTop: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.06)' : '#e5e7eb'}`,
        }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={settings.placeholder_text}
            disabled={isDisabled}
            className="flex-1 px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:opacity-50"
            style={{
              backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : 'white',
              border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : '#d1d5db'}`,
              color: isDarkBg ? '#e5e7eb' : '#1f2937',
              '--tw-ring-color': settings.primary_color,
            } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="p-2 rounded-full disabled:opacity-50 transition-opacity"
            style={{
              backgroundColor: settings.primary_color,
              color: headerTextColor,
            }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Powered by Clara */}
        {settings.powered_by_clara && (
          <p
            className="mt-2 text-center text-xs"
            style={{ color: isDarkBg ? '#4b5563' : '#9ca3af' }}
          >
            Powered by Clara
          </p>
        )}
      </form>
    </div>
  );
}
