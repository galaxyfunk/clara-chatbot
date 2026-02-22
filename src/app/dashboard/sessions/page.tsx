'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SessionList, SessionListSkeleton } from '@/components/sessions/session-list';
import { SessionDetail, SessionDetailEmpty } from '@/components/sessions/session-detail';
import type { ChatMessage } from '@/types/chat';

interface Session {
  id: string;
  session_token: string;
  messages: ChatMessage[];
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        setSessions(data.sessions || []);
      } catch (error) {
        console.error('Failed to load sessions:', error);
      }
      setLoading(false);
    }
    load();
  }, []);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ce-text">Sessions</h1>
        <p className="mt-1 text-sm text-ce-text-muted">
          Review chat conversations with your visitors
        </p>
      </div>

      {/* Master-detail layout */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:grid md:grid-cols-3 h-[600px]">
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
          <div className="col-span-2">
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
