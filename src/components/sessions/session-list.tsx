'use client';

import { MessageSquare, AlertTriangle } from 'lucide-react';
import { IntentTags } from './intent-card';
import type { ConversationSummary } from '@/types/chat';

interface SessionMetadata {
  summary?: ConversationSummary;
  summarized_at?: string;
}

interface Session {
  id: string;
  session_token: string;
  messages: unknown[];
  metadata?: SessionMetadata;
  escalated: boolean;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SessionList({ sessions, selectedId, onSelect }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center">
        <MessageSquare className="w-8 h-8 text-ce-text-muted mx-auto mb-2" />
        <p className="text-sm text-ce-text-muted">
          No chat sessions yet. Once visitors start chatting, conversations appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ce-border">
      {sessions.map((session) => {
        const summary = session.metadata?.summary;
        return (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={`w-full text-left px-4 py-3 hover:bg-ce-muted transition-colors ${
              selectedId === session.id
                ? 'bg-ce-muted border-l-2 border-ce-teal'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-ce-text">
                {summary?.visitor_name || formatDateTime(session.created_at)}
              </span>
              <div className="flex items-center gap-2">
                {session.escalated && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Escalated
                  </span>
                )}
                <span className="text-xs text-ce-text-muted">
                  {session.message_count} msgs
                </span>
              </div>
            </div>
            {/* Intent tags from summary */}
            {summary?.intent_tags && summary.intent_tags.length > 0 && (
              <div className="mt-1">
                <IntentTags tags={summary.intent_tags} />
              </div>
            )}
            {/* Show date if we used visitor name above */}
            {summary?.visitor_name && (
              <p className="text-xs text-ce-text-muted mt-1">
                {formatDateTime(session.created_at)}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SessionListSkeleton() {
  return (
    <div className="divide-y divide-ce-border animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 bg-ce-muted rounded" />
            <div className="h-4 w-12 bg-ce-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
