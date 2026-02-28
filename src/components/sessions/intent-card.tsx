'use client';

import { User, Target, FileText, MessageCircle, TrendingUp, Building, CheckSquare } from 'lucide-react';
import type { ConversationSummary } from '@/types/chat';

interface IntentCardProps {
  summary: ConversationSummary;
  compact?: boolean;
}

const sentimentColors: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-gray-100 text-gray-700',
  negative: 'bg-red-100 text-red-700',
};

const buyingStageColors: Record<string, string> = {
  awareness: 'bg-blue-100 text-blue-700',
  consideration: 'bg-yellow-100 text-yellow-700',
  decision: 'bg-purple-100 text-purple-700',
  unknown: 'bg-gray-100 text-gray-600',
};

function formatLabel(text: string): string {
  return text
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function IntentCard({ summary, compact = false }: IntentCardProps) {
  if (compact) {
    // Compact view: show intent and sentiment inline
    return (
      <div className="flex flex-wrap gap-1">
        {summary.visitor_intent && (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-ce-teal/10 text-ce-teal">
            {summary.visitor_intent}
          </span>
        )}
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${sentimentColors[summary.sentiment]}`}>
          {formatLabel(summary.sentiment)}
        </span>
      </div>
    );
  }

  // Full view: show all summary info
  return (
    <div className="bg-ce-muted rounded-lg p-4 space-y-3">
      {/* Contact info - name */}
      {summary.contact_info.name && (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-ce-text-muted" />
          <span className="text-sm font-medium text-ce-text">
            {summary.contact_info.name}
          </span>
          {summary.contact_info.company && (
            <span className="text-sm text-ce-text-muted">
              @ {summary.contact_info.company}
            </span>
          )}
        </div>
      )}

      {/* Contact info - company only (if no name) */}
      {!summary.contact_info.name && summary.contact_info.company && (
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-ce-text-muted" />
          <span className="text-sm font-medium text-ce-text">
            {summary.contact_info.company}
          </span>
        </div>
      )}

      {/* Visitor intent */}
      {summary.visitor_intent && (
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-ce-text-muted" />
          <span className="text-sm text-ce-text">{summary.visitor_intent}</span>
        </div>
      )}

      {/* Sentiment and buying stage badges */}
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-ce-text-muted" />
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${sentimentColors[summary.sentiment]}`}>
          {formatLabel(summary.sentiment)}
        </span>
        <TrendingUp className="w-4 h-4 text-ce-text-muted ml-2" />
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${buyingStageColors[summary.buying_stage]}`}>
          {formatLabel(summary.buying_stage)}
        </span>
      </div>

      {/* Summary */}
      {summary.summary && (
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ce-text">{summary.summary}</p>
        </div>
      )}

      {/* Topics discussed */}
      {summary.topics_discussed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {summary.topics_discussed.map((topic, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs bg-white border border-ce-border rounded-full text-ce-text-muted"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Action items */}
      {summary.action_items.length > 0 && (
        <div className="flex items-start gap-2">
          <CheckSquare className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
          <ul className="text-sm text-ce-text-muted list-disc list-inside">
            {summary.action_items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SummaryBadges({ summary }: { summary: ConversationSummary }) {
  return (
    <div className="flex flex-wrap gap-1">
      {summary.visitor_intent && (
        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-ce-teal/10 text-ce-teal truncate max-w-[120px]">
          {summary.visitor_intent}
        </span>
      )}
      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${sentimentColors[summary.sentiment]}`}>
        {formatLabel(summary.sentiment)}
      </span>
      {summary.buying_stage !== 'unknown' && (
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${buyingStageColors[summary.buying_stage]}`}>
          {formatLabel(summary.buying_stage)}
        </span>
      )}
    </div>
  );
}
