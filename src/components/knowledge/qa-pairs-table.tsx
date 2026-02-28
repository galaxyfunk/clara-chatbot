'use client';

import { Pencil, Sparkles, Trash2, Undo2, FlaskConical } from 'lucide-react';
import type { QAPair } from '@/types/qa';

interface QAPairsTableProps {
  pairs: QAPair[];
  searchQuery: string;
  categoryFilter: string;
  onEdit: (pair: QAPair) => void;
  onImprove: (pair: QAPair) => void;
  onDelete: (pairId: string) => void;
  onRevert?: (pairId: string) => void;
  onTest?: (pair: QAPair) => void;
  displayName: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (pairId: string) => void;
  onToggleSelectAll?: (ids: string[]) => void;
}

function hasOriginal(pair: QAPair): boolean {
  const metadata = pair.metadata as Record<string, unknown> | undefined;
  return !!(metadata?.original_question && metadata?.original_answer);
}

const categoryColors: Record<string, string> = {
  pricing: 'bg-blue-100 text-blue-700',
  process: 'bg-green-100 text-green-700',
  developers: 'bg-purple-100 text-purple-700',
  retention: 'bg-orange-100 text-orange-700',
  case_studies: 'bg-pink-100 text-pink-700',
  comparisons: 'bg-yellow-100 text-yellow-700',
  general: 'bg-gray-100 text-gray-700',
};

const sourceColors: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-600',
  csv_import: 'bg-blue-100 text-blue-600',
  transcript_extraction: 'bg-purple-100 text-purple-600',
};

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  csv_import: 'CSV',
  transcript_extraction: 'Extracted',
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function QAPairsTable({
  pairs,
  searchQuery,
  categoryFilter,
  onEdit,
  onImprove,
  onDelete,
  onRevert,
  onTest,
  displayName,
  selectedIds = new Set(),
  onToggleSelect,
  onToggleSelectAll,
}: QAPairsTableProps) {
  // Filter pairs
  const filteredPairs = pairs.filter((pair) => {
    const matchesSearch =
      !searchQuery ||
      pair.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pair.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || pair.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (pairs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-ce-text-muted">
          No Q&A pairs yet. Add your first pair to teach {displayName}.
        </p>
      </div>
    );
  }

  if (filteredPairs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-ce-text-muted">
          No Q&A pairs match your search criteria.
        </p>
      </div>
    );
  }

  const filteredIds = filteredPairs.map(p => p.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someSelected = filteredIds.some(id => selectedIds.has(id));

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-ce-muted">
            <tr>
              {onToggleSelectAll && (
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={() => onToggleSelectAll(filteredIds)}
                    className="w-4 h-4 rounded border-ce-border text-ce-teal focus:ring-ce-teal"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Answer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Source
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-ce-text-muted uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ce-border">
            {filteredPairs.map((pair) => (
              <tr key={pair.id} className={`hover:bg-ce-muted/50 ${selectedIds.has(pair.id) ? 'bg-ce-teal/5' : ''}`}>
                {onToggleSelect && (
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(pair.id)}
                      onChange={() => onToggleSelect(pair.id)}
                      className="w-4 h-4 rounded border-ce-border text-ce-teal focus:ring-ce-teal"
                    />
                  </td>
                )}
                <td className="px-4 py-4 text-sm text-ce-text max-w-xs">
                  {truncateText(pair.question, 60)}
                </td>
                <td className="px-4 py-4 text-sm text-ce-text-muted max-w-sm">
                  {truncateText(pair.answer, 100)}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      categoryColors[pair.category] || categoryColors.general
                    }`}
                  >
                    {pair.category}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      sourceColors[pair.source] || sourceColors.manual
                    }`}
                  >
                    {sourceLabels[pair.source] || pair.source}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(pair)}
                      className="p-2 text-ce-text-muted hover:text-ce-text hover:bg-ce-muted rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onImprove(pair)}
                      className="p-2 text-ce-text-muted hover:text-ce-teal hover:bg-ce-teal/10 rounded-lg transition-colors"
                      title="Improve with AI"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    {onTest && (
                      <button
                        onClick={() => onTest(pair)}
                        className="p-2 text-ce-text-muted hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Test match"
                      >
                        <FlaskConical className="w-4 h-4" />
                      </button>
                    )}
                    {hasOriginal(pair) && onRevert && (
                      <button
                        onClick={() => onRevert(pair.id)}
                        className="p-2 text-ce-text-muted hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                        title="Revert to original"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(pair.id)}
                      className="p-2 text-ce-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredPairs.map((pair) => (
          <div key={pair.id} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-ce-text flex-1">
                {truncateText(pair.question, 100)}
              </p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(pair)}
                  className="p-1.5 text-ce-text-muted hover:text-ce-text rounded transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onImprove(pair)}
                  className="p-1.5 text-ce-text-muted hover:text-ce-teal rounded transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                {onTest && (
                  <button
                    onClick={() => onTest(pair)}
                    className="p-1.5 text-ce-text-muted hover:text-purple-600 rounded transition-colors"
                  >
                    <FlaskConical className="w-4 h-4" />
                  </button>
                )}
                {hasOriginal(pair) && onRevert && (
                  <button
                    onClick={() => onRevert(pair.id)}
                    className="p-1.5 text-ce-text-muted hover:text-orange-600 rounded transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(pair.id)}
                  className="p-1.5 text-ce-text-muted hover:text-red-600 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-ce-text-muted mb-3">
              {truncateText(pair.answer, 150)}
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  categoryColors[pair.category] || categoryColors.general
                }`}
              >
                {pair.category}
              </span>
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  sourceColors[pair.source] || sourceColors.manual
                }`}
              >
                {sourceLabels[pair.source] || pair.source}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function QAPairsTableSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse">
      <div className="bg-ce-muted px-4 py-3">
        <div className="flex gap-4">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-20 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded ml-auto" />
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="px-4 py-4 border-b border-ce-border">
          <div className="flex gap-4">
            <div className="h-4 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
