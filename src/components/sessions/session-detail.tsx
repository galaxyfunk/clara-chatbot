'use client';

import { useEffect, useRef } from 'react';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { IntentCard } from './intent-card';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

interface SessionMetadata {
  summary?: ConversationSummary;
  summarized_at?: string;
}

interface Session {
  id: string;
  messages: ChatMessage[];
  metadata?: SessionMetadata;
  escalated: boolean;
  created_at: string;
}

interface SessionDetailProps {
  session: Session;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SessionDetail({ session }: SessionDetailProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.id]);

  const summary = session.metadata?.summary;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-ce-border bg-white space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ce-text-muted">
            {new Date(session.created_at).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          {session.escalated && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              Escalated
            </span>
          )}
        </div>

        {/* Visitor Intent Card */}
        {summary && <IntentCard summary={summary} />}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-ce-muted">
        {session.messages.map((message, index) => (
          <div
            key={message.message_id || index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className="max-w-[80%] space-y-1">
              {/* Message bubble */}
              <div
                className={`relative px-4 py-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-ce-navy text-white rounded-br-sm'
                    : 'bg-white border border-ce-border rounded-bl-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {/* Gap indicator */}
                {message.gap_detected && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" title="Gap detected" />
                )}
              </div>

              {/* Escalation button for assistant messages */}
              {message.role === 'assistant' && message.escalation_offered && (
                <a
                  href="#"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-ce-teal text-white text-xs font-medium rounded-lg"
                >
                  <span>Book a Call</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Suggestion chips (disabled in review) */}
              {message.role === 'assistant' && message.suggestion_chips && message.suggestion_chips.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {message.suggestion_chips.map((chip, chipIndex) => (
                    <span
                      key={chipIndex}
                      className="px-2 py-1 text-xs bg-ce-muted text-ce-text-muted border border-ce-border rounded-full"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <span className="text-xs text-ce-text-muted">
                {formatTime(message.timestamp)}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export function SessionDetailEmpty() {
  return (
    <div className="h-full flex items-center justify-center bg-ce-muted">
      <div className="text-center">
        <AlertCircle className="w-8 h-8 text-ce-text-muted mx-auto mb-2" />
        <p className="text-sm text-ce-text-muted">
          Select a conversation to view the full chat history.
        </p>
      </div>
    </div>
  );
}
