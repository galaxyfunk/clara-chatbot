'use client';

import { useState } from 'react';
import { Trash2, XCircle, X, Loader2 } from 'lucide-react';

interface GapsBulkActionBarProps {
  selectedCount: number;
  onAction: (action: 'dismiss' | 'delete') => Promise<void>;
  onClear: () => void;
}

export function GapsBulkActionBar({ selectedCount, onAction, onClear }: GapsBulkActionBarProps) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: 'dismiss' | 'delete') => {
    if (action === 'delete') {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${selectedCount} flagged question${selectedCount === 1 ? '' : 's'}? This cannot be undone.`
      );
      if (!confirmed) return;
    }

    setLoading(true);
    await onAction(action);
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

          {/* Dismiss */}
          <button
            onClick={() => handleAction('dismiss')}
            className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors"
            title="Dismiss selected"
          >
            <XCircle className="w-4 h-4" />
            Dismiss
          </button>

          {/* Delete */}
          <button
            onClick={() => handleAction('delete')}
            className="flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-white/10 rounded transition-colors text-red-300 hover:text-red-200"
            title="Delete selected"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>

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
