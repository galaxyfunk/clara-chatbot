'use client';

import { User, Tag, FileText, Lightbulb, CheckSquare } from 'lucide-react';
import type { ConversationSummary } from '@/types/chat';

interface IntentCardProps {
  summary: ConversationSummary;
  compact?: boolean;
}

const intentColors: Record<string, string> = {
  pricing_inquiry: 'bg-green-100 text-green-700',
  technical_support: 'bg-blue-100 text-blue-700',
  demo_request: 'bg-purple-100 text-purple-700',
  general_question: 'bg-gray-100 text-gray-700',
  complaint: 'bg-red-100 text-red-700',
  feature_request: 'bg-yellow-100 text-yellow-700',
  onboarding: 'bg-teal-100 text-teal-700',
  billing: 'bg-orange-100 text-orange-700',
};

function formatIntent(intent: string): string {
  return intent
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function IntentCard({ summary, compact = false }: IntentCardProps) {
  if (compact) {
    // Compact view: just show intent tags inline
    return (
      <div className="flex flex-wrap gap-1">
        {summary.intent_tags.map((tag) => (
          <span
            key={tag}
            className={`px-1.5 py-0.5 text-xs font-medium rounded ${
              intentColors[tag] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {formatIntent(tag)}
          </span>
        ))}
      </div>
    );
  }

  // Full view: show all summary info
  return (
    <div className="bg-ce-muted rounded-lg p-4 space-y-3">
      {/* Visitor name */}
      {summary.visitor_name && (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-ce-text-muted" />
          <span className="text-sm font-medium text-ce-text">
            {summary.visitor_name}
          </span>
        </div>
      )}

      {/* Intent tags */}
      {summary.intent_tags.length > 0 && (
        <div className="flex items-start gap-2">
          <Tag className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-1">
            {summary.intent_tags.map((tag) => (
              <span
                key={tag}
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  intentColors[tag] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {formatIntent(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary.summary && (
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ce-text">{summary.summary}</p>
        </div>
      )}

      {/* Extracted facts */}
      {summary.extracted_facts.length > 0 && (
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <ul className="text-sm text-ce-text-muted list-disc list-inside">
            {summary.extracted_facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      {summary.next_steps.length > 0 && (
        <div className="flex items-start gap-2">
          <CheckSquare className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <ul className="text-sm text-ce-text-muted list-disc list-inside">
            {summary.next_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function IntentTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((tag) => (
        <span
          key={tag}
          className={`px-1.5 py-0.5 text-xs font-medium rounded ${
            intentColors[tag] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {formatIntent(tag)}
        </span>
      ))}
      {tags.length > 2 && (
        <span className="px-1.5 py-0.5 text-xs text-ce-text-muted">
          +{tags.length - 2}
        </span>
      )}
    </div>
  );
}
