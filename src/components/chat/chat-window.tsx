'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import { SuggestionChips } from './suggestion-chips';
import type { WorkspaceSettings } from '@/types/workspace';

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

interface ChatWindowProps {
  workspaceId: string;
  settings: WorkspaceSettings;
  isPlayground?: boolean;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function ChatWindow({ workspaceId, settings, isPlayground = false }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionToken] = useState(() => generateId());
  const [showInitialChips, setShowInitialChips] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
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
    setShowInitialChips(false);
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

  // Get suggestion chips - either from last assistant message or initial chips
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isStreaming);
  const currentChips = showInitialChips
    ? settings.suggested_messages.slice(0, settings.max_suggestion_chips)
    : lastAssistantMessage?.suggestion_chips || [];

  const isDisabled = isLoading || isStreaming;

  return (
    <div className="flex flex-col h-full bg-gray-50">
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
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-medium">
            {settings.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-white font-medium">{settings.display_name}</h2>
          {isPlayground && (
            <p className="text-white/70 text-xs">Playground Mode</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome message */}
        <MessageBubble
          message={{
            role: 'assistant',
            content: settings.welcome_message,
          }}
          primaryColor={settings.primary_color}
          avatarUrl={settings.avatar_url}
          displayName={settings.display_name}
        />

        {/* Conversation messages */}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            primaryColor={settings.primary_color}
            avatarUrl={settings.avatar_url}
            displayName={settings.display_name}
          />
        ))}

        {/* Typing indicator - show when loading (before stream starts) */}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{settings.display_name} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips - hide while streaming */}
      {currentChips.length > 0 && !isDisabled && (
        <div className="flex-shrink-0 px-4 pb-2">
          <SuggestionChips
            chips={currentChips}
            onChipClick={handleChipClick}
            primaryColor={settings.primary_color}
          />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 p-4 bg-white border-t border-gray-200">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={settings.placeholder_text}
            disabled={isDisabled}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:opacity-50"
            style={{ '--tw-ring-color': settings.primary_color } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="p-2 rounded-full text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: settings.primary_color }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Powered by Clara */}
        {settings.powered_by_clara && (
          <p className="mt-2 text-center text-xs text-gray-400">
            Powered by Clara
          </p>
        )}
      </form>
    </div>
  );
}
