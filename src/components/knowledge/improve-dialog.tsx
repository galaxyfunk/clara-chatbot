'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import type { QAPair } from '@/types/qa';

interface ImproveDialogProps {
  pair: QAPair;
  onAccept: (improved: { question: string; answer: string }) => void;
  onClose: () => void;
}

export function ImproveDialog({ pair, onAccept, onClose }: ImproveDialogProps) {
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [improved, setImproved] = useState<{ question: string; answer: string } | null>(null);

  useEffect(() => {
    async function loadImprovement() {
      try {
        const res = await fetch('/api/qa-pairs/improve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: pair.question,
            answer: pair.answer,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to improve');
        }
        setImproved(data.improved);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
      setLoading(false);
    }
    loadImprovement();
  }, [pair.question, pair.answer]);

  const handleAccept = async () => {
    if (!improved) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/qa-pairs/${pair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: improved.question,
          answer: improved.answer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      onAccept(improved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setAccepting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ce-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-ce-teal" />
            <h2 className="text-lg font-semibold text-ce-text">
              AI Improvement
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ce-text-muted hover:text-ce-text rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-ce-teal animate-spin mb-4" />
              <p className="text-ce-text-muted">Improving with AI...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && improved && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Original */}
              <div>
                <h3 className="text-sm font-medium text-ce-text-muted mb-3">Original</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-ce-muted rounded-lg">
                    <p className="text-xs font-medium text-ce-text-muted mb-1">Question</p>
                    <p className="text-sm text-ce-text-muted">{pair.question}</p>
                  </div>
                  <div className="p-3 bg-ce-muted rounded-lg">
                    <p className="text-xs font-medium text-ce-text-muted mb-1">Answer</p>
                    <p className="text-sm text-ce-text-muted">{pair.answer}</p>
                  </div>
                </div>
              </div>

              {/* Improved */}
              <div>
                <h3 className="text-sm font-medium text-ce-teal mb-3">Improved</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-ce-teal/5 border border-ce-teal/20 rounded-lg">
                    <p className="text-xs font-medium text-ce-teal mb-1">Question</p>
                    <p className="text-sm text-ce-text">{improved.question}</p>
                  </div>
                  <div className="p-3 bg-ce-teal/5 border border-ce-teal/20 rounded-lg">
                    <p className="text-xs font-medium text-ce-teal mb-1">Answer</p>
                    <p className="text-sm text-ce-text">{improved.answer}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && improved && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-ce-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="px-4 py-2 bg-ce-teal text-white text-sm font-medium rounded-lg hover:bg-ce-teal/90 disabled:opacity-50 flex items-center gap-2"
            >
              {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
              Accept Improvement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
