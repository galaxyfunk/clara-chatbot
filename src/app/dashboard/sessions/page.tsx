'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Search, X, Loader2 } from 'lucide-react';
import { SessionList, SessionListSkeleton } from '@/components/sessions/session-list';
import { SessionDetail, SessionDetailEmpty } from '@/components/sessions/session-detail';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

interface SessionMetadata {
  summary?: ConversationSummary;
  summarized_at?: string;
}

interface Session {
  id: string;
  session_token: string;
  messages: ChatMessage[];
  metadata?: SessionMetadata;
  escalated: boolean;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSessions = useCallback(async (search?: string) => {
    setSearching(true);
    try {
      const url = search ? `/api/sessions?search=${encodeURIComponent(search)}` : '/api/sessions';
      const res = await fetch(url);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
    setSearching(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSessions(searchQuery || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, fetchSessions]);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Sessions</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Review chat conversations with your visitors
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ce-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-10 pr-10 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ce-text-muted animate-spin" />
          ) : searchQuery ? (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ce-text-muted hover:text-ce-text"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Master-detail layout */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:grid md:grid-cols-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* List */}
          <div className="border-r border-ce-border overflow-y-auto">
            {loading ? (
              <SessionListSkeleton />
            ) : (
              <SessionList
                sessions={sessions}
                selectedId={selectedSessionId}
                onSelect={setSelectedSessionId}
              />
            )}
          </div>

          {/* Detail */}
          <div className="col-span-3 overflow-hidden">
            {selectedSession ? (
              <SessionDetail session={selectedSession} />
            ) : (
              <SessionDetailEmpty />
            )}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden">
          {selectedSessionId && selectedSession ? (
            <div className="h-[600px] flex flex-col">
              {/* Back button */}
              <div className="flex-shrink-0 p-4 border-b border-ce-border">
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="flex items-center gap-2 text-sm text-ce-text-muted hover:text-ce-text"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to list
                </button>
              </div>
              {/* Detail */}
              <div className="flex-1 overflow-hidden">
                <SessionDetail session={selectedSession} />
              </div>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {loading ? (
                <SessionListSkeleton />
              ) : (
                <SessionList
                  sessions={sessions}
                  selectedId={selectedSessionId}
                  onSelect={setSelectedSessionId}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
