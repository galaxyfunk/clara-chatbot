'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { DEFAULT_CATEGORIES, type QAPair } from '@/types/qa';

interface QAPairFormProps {
  pair?: QAPair | null;
  onSave: (pair: QAPair) => void;
  onClose: () => void;
}

export function QAPairForm({ pair, onSave, onClose }: QAPairFormProps) {
  const isEdit = !!pair;
  const [question, setQuestion] = useState(pair?.question || '');
  const [answer, setAnswer] = useState(pair?.answer || '');
  const [category, setCategory] = useState(pair?.category || 'general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (pair) {
      setQuestion(pair.question);
      setAnswer(pair.answer);
      setCategory(pair.category);
    }
  }, [pair]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);
    setSaving(true);

    try {
      if (isEdit) {
        const res = await fetch(`/api/qa-pairs/${pair.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, category }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update');
        }
        onSave(data.pair);
        onClose();
      } else {
        const res = await fetch('/api/qa-pairs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, category }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create');
        }
        if (data.created === false) {
          // Duplicate found
          const similarityPct = Math.round((data.similarity || 0) * 100);
          setWarning(
            `Similar Q&A pair exists (${similarityPct}% match). Pair was NOT created.`
          );
          setSaving(false);
          return;
        }
        onSave(data.pair);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ce-border">
          <h2 className="text-lg font-semibold text-ce-text">
            {isEdit ? 'Edit Q&A Pair' : 'Add Q&A Pair'}
          </h2>
          <button
            onClick={onClose}
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

          {warning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}

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
              placeholder="What question will visitors ask?"
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
              placeholder="How should the chatbot respond?"
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
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !question.trim() || !answer.trim()}
              className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Pair'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
