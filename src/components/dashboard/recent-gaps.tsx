'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface RecentGapsProps {
  gaps: Array<{
    id: string;
    question: string;
    similarity_score: number | null;
    created_at: string;
  }>;
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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function RecentGaps({ gaps }: RecentGapsProps) {
  if (gaps.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ce-text">Flagged Questions</h2>
        <Link
          href="/dashboard/gaps"
          className="text-sm text-ce-teal hover:text-ce-teal/80 flex items-center gap-1"
        >
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="space-y-3">
        {gaps.map((gap) => (
          <div
            key={gap.id}
            className="flex items-start justify-between py-2 border-b border-ce-border last:border-0"
          >
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm text-ce-text truncate">
                {truncateText(gap.question, 80)}
              </p>
              <span className="text-xs text-ce-text-muted">
                {formatRelativeTime(gap.created_at)}
              </span>
            </div>
            {gap.similarity_score !== null && (
              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full whitespace-nowrap">
                {Math.round(gap.similarity_score * 100)}% match
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentGapsSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-28 bg-ce-muted rounded" />
        <div className="h-4 w-16 bg-ce-muted rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start justify-between py-2 border-b border-ce-border last:border-0">
            <div className="flex-1 mr-4">
              <div className="h-4 w-full bg-ce-muted rounded mb-2" />
              <div className="h-3 w-16 bg-ce-muted rounded" />
            </div>
            <div className="h-5 w-16 bg-ce-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
