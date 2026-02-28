'use client';

import { useState } from 'react';
import { X, Loader2, FlaskConical, Search } from 'lucide-react';
import type { QAPair } from '@/types/qa';

interface Match {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

interface TestMatchDialogProps {
  pair: QAPair;
  onClose: () => void;
}

function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.8) return 'text-green-600 bg-green-50';
  if (similarity >= 0.6) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function TestMatchDialog({ pair, onClose }: TestMatchDialogProps) {
  const [question, setQuestion] = useState(pair.question);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);

  const handleTest = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/qa-pairs/test-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Test failed');
      }

      setMatches(data.matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ce-border">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-ce-teal" />
            <h2 className="text-lg font-semibold text-ce-text">
              Test Match
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
        <div className="p-4 space-y-4">
          <p className="text-sm text-ce-text-muted">
            Test how well your question matches against your knowledge base.
            Edit the question to try variations.
          </p>

          {/* Question input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter a question to test..."
              className="flex-1 px-3 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent"
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            />
            <button
              onClick={handleTest}
              disabled={loading || !question.trim()}
              className="px-4 py-2 bg-ce-teal text-white text-sm font-medium rounded-lg hover:bg-ce-teal/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Run Test
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {matches && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-ce-text">
                {matches.length > 0 ? `Top ${matches.length} Matches` : 'No matches found'}
              </h3>

              {matches.length === 0 ? (
                <p className="text-sm text-ce-text-muted p-4 bg-ce-muted rounded-lg text-center">
                  No Q&A pairs matched this question above the threshold.
                  Consider adding a new Q&A pair for this topic.
                </p>
              ) : (
                <div className="space-y-2">
                  {matches.map((match, index) => (
                    <div
                      key={match.id}
                      className="border border-ce-border rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ce-text">
                            {index + 1}. {match.question}
                          </p>
                          <p className="text-xs text-ce-text-muted mt-1">
                            {truncateText(match.answer, 150)}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded-full ${getSimilarityColor(match.similarity)}`}
                        >
                          {(match.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-ce-text-muted">
                Green (80%+): High confidence match. Yellow (60-80%): Moderate match.
                Red (&lt;60%): Low confidence match.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-ce-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
