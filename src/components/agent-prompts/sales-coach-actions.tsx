'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';

export function SalesCoachActions() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/agents/sales-coach/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Run failed');
      setMessage(data.message ?? 'Run started. Check Slack.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-ce-border p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ce-text">Run Sales Coach now</h2>
          <p className="text-xs text-ce-text-muted mt-1">
            Fetches Shawnee&apos;s recent Fireflies calls, runs each through the prompt below,
            and posts coaching analyses to <code className="text-ce-teal">#sales-coach-test</code>.
            Already-analyzed calls are skipped.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="shrink-0 px-4 py-2 bg-ce-navy text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 flex items-center gap-2"
        >
          {running ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-4 h-4" /> Run Now</>
          )}
        </button>
      </div>
      {message && (
        <div className="mt-3 text-sm text-ce-teal bg-ce-muted rounded-md p-2">{message}</div>
      )}
      {error && (
        <div className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>
      )}
    </div>
  );
}
