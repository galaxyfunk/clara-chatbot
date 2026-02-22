'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import { SuggestionChips } from './suggestion-chips';
import type { WorkspaceSettings } from '@/types/workspace';
import type { ChatResponse } from '@/types/chat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  gap_detected?: boolean;
  escalation_offered?: boolean;
  booking_url?: string | null;
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
    if (!content.trim() || isLoading) return;

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
        }),
      });

      const data = await res.json();

      if (data.success) {
        const response = data as { success: true } & ChatResponse;
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: response.answer,
          gap_detected: response.gap_detected,
          escalation_offered: response.escalation_offered,
          booking_url: response.booking_url,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: data.error || 'Sorry, something went wrong. Please try again.',
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch {
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, I could not connect. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const currentChips = showInitialChips
    ? settings.suggested_messages.slice(0, settings.max_suggestion_chips)
    : [];

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

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{settings.display_name} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      {currentChips.length > 0 && !isLoading && (
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
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:opacity-50"
            style={{ '--tw-ring-color': settings.primary_color } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
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
