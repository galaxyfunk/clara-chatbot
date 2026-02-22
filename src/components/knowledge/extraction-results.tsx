'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import type { ExtractedQAPair } from '@/types/qa';

interface ExtractionResultsProps {
  pairs: ExtractedQAPair[];
  selectedIndices: Set<number>;
  onToggleSelect: (index: number) => void;
  onSelectAll: (selected: boolean) => void;
  onImprove: (index: number) => void;
  improvingIndex: number | null;
}

export function ExtractionResults({
  pairs,
  selectedIndices,
  onToggleSelect,
  onSelectAll,
  onImprove,
  improvingIndex,
}: ExtractionResultsProps) {
  const allSelected = pairs.length > 0 && selectedIndices.size === pairs.length;

  return (
    <div className="space-y-4">
      {/* Select all */}
      <div className="flex items-center gap-2 py-2 border-b border-ce-border">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm text-ce-text-muted">
          {allSelected ? 'Deselect all' : 'Select all'}
        </span>
        <span className="text-xs text-ce-text-muted ml-auto">
          {selectedIndices.size} of {pairs.length} selected
        </span>
      </div>

      {/* Pairs list */}
      <div className="space-y-3">
        {pairs.map((pair, index) => {
          const isImproving = improvingIndex === index;
          const isSelected = selectedIndices.has(index);

          return (
            <div
              key={index}
              className={`p-4 border rounded-lg ${
                isSelected ? 'border-ce-teal bg-ce-teal/5' : 'border-ce-border bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(index)}
                  className="mt-1 rounded"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ce-text">
                    {pair.question}
                  </p>
                  <p className="mt-1 text-sm text-ce-text-muted">
                    {pair.answer}
                  </p>

                  {/* Badges */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        pair.isNew
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {pair.isNew ? 'New' : 'Overlap'}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-ce-muted text-ce-text-muted rounded-full">
                      {pair.category}
                    </span>
                    {!pair.isNew && pair.existingMatchScore && (
                      <span className="text-xs text-ce-text-muted">
                        {Math.round(pair.existingMatchScore * 100)}% match with existing
                      </span>
                    )}
                  </div>
                </div>

                {/* Improve button */}
                <button
                  onClick={() => onImprove(index)}
                  disabled={isImproving}
                  className="p-2 text-ce-text-muted hover:text-ce-teal hover:bg-ce-teal/10 rounded-lg transition-colors disabled:opacity-50"
                  title="Improve with AI"
                >
                  {isImproving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
