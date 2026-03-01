'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Key, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ChatWindow } from '@/components/chat/chat-window';
import type { WorkspaceSettings } from '@/types/workspace';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/types/workspace';

interface WorkspaceData {
  id: string;
  settings: WorkspaceSettings;
}

export default function ChatPlaygroundPage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [hasQaPairs, setHasQaPairs] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [wsRes, keysRes, pairsRes] = await Promise.all([
          fetch('/api/workspace'),
          fetch('/api/api-keys'),
          fetch('/api/qa-pairs'),
        ]);

        const wsData = await wsRes.json();
        const keysData = await keysRes.json();
        const pairsData = await pairsRes.json();

        if (!wsData.success) {
          setError(wsData.error || 'Failed to load workspace');
          return;
        }

        setWorkspace({
          id: wsData.workspace.id,
          settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...wsData.workspace.settings },
        });

        // Check if there's at least one active API key
        const activeKeys = (keysData.keys || []).filter(
          (k: { is_active: boolean }) => k.is_active
        );
        setHasApiKey(activeKeys.length > 0);

        // Check if there's at least one Q&A pair
        setHasQaPairs((pairsData.pairs || []).length > 0);
      } catch (err) {
        setError('Failed to load chat playground');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div
        className="min-h-[calc(100vh-120px)] -m-6 p-6"
        style={{
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-ce-text">Chat Playground</h1>
            <p className="mt-1 text-sm text-ce-text-muted">
              Test your chatbot before embedding it
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm h-[600px] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-ce-navy" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-[calc(100vh-120px)] -m-6 p-6"
        style={{
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-ce-text">Chat Playground</h1>
            <p className="mt-1 text-sm text-ce-text-muted">
              Test your chatbot before embedding it
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6" />
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check for missing requirements
  if (!hasApiKey || !hasQaPairs) {
    return (
      <div
        className="min-h-[calc(100vh-120px)] -m-6 p-6"
        style={{
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-ce-text">Chat Playground</h1>
            <p className="mt-1 text-sm text-ce-text-muted">
              Test your chatbot before embedding it
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
            <div className="flex items-center gap-3 text-yellow-600">
              <AlertCircle className="w-6 h-6" />
              <h2 className="text-lg font-medium">Setup Required</h2>
            </div>

            <p className="text-ce-text-muted">
              Before you can test your chatbot, please complete the following:
            </p>

            <div className="space-y-4">
              {/* No API Key */}
              {!hasApiKey && (
                <div className="flex items-start gap-4 p-4 bg-ce-muted rounded-lg">
                  <div className="flex-shrink-0 w-10 h-10 bg-ce-navy/10 rounded-full flex items-center justify-center">
                    <Key className="w-5 h-5 text-ce-navy" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-ce-text">Add an API Key</h3>
                    <p className="mt-1 text-sm text-ce-text-muted">
                      Connect your OpenAI or Anthropic API key to power the chat.
                    </p>
                    <Link
                      href="/dashboard/settings"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90"
                    >
                      Go to Settings
                    </Link>
                  </div>
                </div>
              )}

              {/* No Q&A Pairs */}
              {!hasQaPairs && (
                <div className="flex items-start gap-4 p-4 bg-ce-muted rounded-lg">
                  <div className="flex-shrink-0 w-10 h-10 bg-ce-teal/10 rounded-full flex items-center justify-center">
                    <FileText className="w-5 h-5 text-ce-teal" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-ce-text">Add Knowledge Base Content</h3>
                    <p className="mt-1 text-sm text-ce-text-muted">
                      Add Q&A pairs so your chatbot knows how to respond.
                    </p>
                    <Link
                      href="/dashboard/knowledge"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-ce-teal rounded-lg hover:bg-ce-teal/90"
                    >
                      Go to Knowledge Base
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100vh-120px)] -m-6 p-6"
      style={{
        backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        backgroundColor: '#f9fafb',
      }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Chat Playground</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Test your chatbot before embedding it
          </p>
        </div>

        {/* Chat window container - same size as before */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden h-[600px]">
          {workspace && (
            <ChatWindow
              workspaceId={workspace.id}
              settings={workspace.settings}
              isPlayground
            />
          )}
        </div>
      </div>
    </div>
  );
}
