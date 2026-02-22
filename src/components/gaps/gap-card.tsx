'use client';

import { useState } from 'react';
import { CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';

export interface Gap {
  id: string;
  question: string;
  ai_answer: string | null;
  best_match_id?: string | null;
  bestMatchQuestion?: string;
  similarity_score: number | null;
  status: string;
  created_at: string;
}

interface GapCardProps {
  gap: Gap;
  onResolve: (gap: Gap) => void;
  onDismiss: (gapId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function GapCard({ gap, onResolve, onDismiss }: GapCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = gap.status === 'open';

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      {/* Question */}
      <p className="text-lg font-medium text-ce-text">{gap.question}</p>

      {/* Meta info */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ce-text-muted">
        <span>{formatRelativeTime(gap.created_at)}</span>
        {gap.bestMatchQuestion && gap.similarity_score !== null && (
          <span>
            Closest match: {gap.bestMatchQuestion.substring(0, 40)}... ({Math.round(gap.similarity_score * 100)}%)
          </span>
        )}
      </div>

      {/* AI Answer toggle */}
      {gap.ai_answer && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-ce-teal hover:text-ce-teal/80"
          >
            {expanded ? (
              <>
                Hide AI answer <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                Show AI answer <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-ce-muted rounded-lg">
              <p className="text-sm text-ce-text-muted">{gap.ai_answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions - only for open gaps */}
      {isOpen && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => onResolve(gap)}
            className="px-3 py-2 bg-ce-teal text-white text-sm font-medium rounded-lg hover:bg-ce-teal/90 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Resolve
          </button>
          <button
            onClick={() => onDismiss(gap.id)}
            className="px-3 py-2 text-ce-text-muted border border-ce-border text-sm font-medium rounded-lg hover:bg-ce-muted flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function GapCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
      <div className="h-6 w-3/4 bg-ce-muted rounded mb-3" />
      <div className="h-4 w-1/4 bg-ce-muted rounded mb-4" />
      <div className="flex gap-2">
        <div className="h-9 w-24 bg-ce-muted rounded-lg" />
        <div className="h-9 w-24 bg-ce-muted rounded-lg" />
      </div>
    </div>
  );
}
