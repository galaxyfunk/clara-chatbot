'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { DEFAULT_CATEGORIES } from '@/types/qa';

interface GapResolveFormProps {
  gap: {
    id: string;
    question: string;
    ai_answer: string | null;
  };
  onSave: () => void;
  onCancel: () => void;
}

export function GapResolveForm({ gap, onSave, onCancel }: GapResolveFormProps) {
  const [question, setQuestion] = useState(gap.question);
  const [answer, setAnswer] = useState(gap.ai_answer || '');
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/gaps/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gap_id: gap.id,
          question: question.trim(),
          answer: answer.trim(),
          category,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to resolve gap');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ce-border">
          <h2 className="text-lg font-semibold text-ce-text">
            Resolve Gap
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-ce-text-muted hover:text-ce-text rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="text-sm text-ce-text-muted">
            Review and edit the question and answer, then save to add this to your knowledge base.
          </p>

          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              required
              className="w-full px-3 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Answer
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              required
              className="w-full px-3 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent resize-none"
              placeholder="Write the answer..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ce-text mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent"
            >
              {DEFAULT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ce-border">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !question.trim() || !answer.trim()}
              className="px-4 py-2 bg-ce-teal text-white text-sm font-medium rounded-lg hover:bg-ce-teal/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Q&A Pair
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
