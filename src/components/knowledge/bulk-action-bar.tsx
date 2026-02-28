'use client';

import { useState } from 'react';
import { Trash2, Power, PowerOff, Tag, X, Loader2 } from 'lucide-react';
import { getMergedCategories, formatCategory } from '@/lib/categories';

interface BulkActionBarProps {
  selectedCount: number;
  customCategories: string[];
  onAction: (action: string, category?: string) => Promise<void>;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, customCategories, onAction, onClear }: BulkActionBarProps) {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const categories = getMergedCategories(customCategories);

  const handleAction = async (action: string, category?: string) => {
    setLoading(true);
    setShowCategoryDropdown(false);
    await onAction(action, category);
    setLoading(false);
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-ce-navy text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 z-40">
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Updating...</span>
        </div>
      ) : (
        <>
          <span className="text-sm font-medium">{selectedCount} selected</span>

          <div className="h-4 w-px bg-white/30" />

          {/* Delete */}
          <button
            onClick={() => handleAction('delete')}
            className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors"
            title="Delete selected"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>

          {/* Activate */}
          <button
            onClick={() => handleAction('activate')}
            className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors"
            title="Activate selected"
          >
            <Power className="w-4 h-4" />
            Activate
          </button>

          {/* Deactivate */}
          <button
            onClick={() => handleAction('deactivate')}
            className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors"
            title="Deactivate selected"
          >
            <PowerOff className="w-4 h-4" />
            Deactivate
          </button>

          {/* Category */}
          <div className="relative">
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors"
              title="Set category"
            >
              <Tag className="w-4 h-4" />
              Category
            </button>
            {showCategoryDropdown && (
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-ce-border min-w-[150px] max-h-48 overflow-y-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleAction('categorize', cat)}
                    className="w-full px-3 py-2 text-left text-sm text-ce-text hover:bg-ce-muted transition-colors"
                  >
                    {formatCategory(cat)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-white/30" />

          {/* Clear */}
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-2 py-1 text-sm text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </>
      )}
    </div>
  );
}
