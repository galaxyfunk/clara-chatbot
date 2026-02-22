'use client';

import { useState, useRef } from 'react';
import { X, Upload, Loader2, CheckCircle } from 'lucide-react';
import type { ExtractedQAPair } from '@/types/qa';

interface CSVImportDialogProps {
  onComplete: (importedCount: number) => void;
  onClose: () => void;
}

type Step = 'upload' | 'preview' | 'saving' | 'done';

export function CSVImportDialog({ onComplete, onClose }: CSVImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [pairs, setPairs] = useState<ExtractedQAPair[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState({ totalFound: 0, newCount: 0, overlapCount: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvText(text);
  };

  const handlePreview = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setErrors([]);

    try {
      const res = await fetch('/api/qa-pairs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to process CSV');
      }

      setPairs(data.pairs || []);
      setStats({
        totalFound: data.totalFound || 0,
        newCount: data.newCount || 0,
        overlapCount: data.overlapCount || 0,
      });
      setErrors(data.errors || []);

      // Auto-select new pairs
      const newIndices = new Set<number>();
      (data.pairs || []).forEach((p: ExtractedQAPair, i: number) => {
        if (p.isNew) newIndices.add(i);
      });
      setSelectedIndices(newIndices);
      setStep('preview');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'An error occurred']);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    const selectedPairs = pairs.filter((_, i) => selectedIndices.has(i));
    if (selectedPairs.length === 0) return;

    setStep('saving');
    setLoading(true);

    try {
      const res = await fetch('/api/qa-pairs/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairs: selectedPairs.map((p) => ({
            question: p.question,
            answer: p.answer,
            category: p.category,
          })),
          source: 'csv_import',
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      setSavedCount(data.imported || 0);
      setStep('done');
      onComplete(data.imported || 0);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to save']);
      setStep('preview');
    }
    setLoading(false);
  };

  const toggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const toggleSelectAll = (select: boolean) => {
    if (select) {
      setSelectedIndices(new Set(pairs.map((_, i) => i)));
    } else {
      setSelectedIndices(new Set());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ce-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-ce-text">Import CSV</h2>
          <button
            onClick={onClose}
            className="p-2 text-ce-text-muted hover:text-ce-text rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-ce-text-muted">
                CSV should have columns: <code className="bg-ce-muted px-1 rounded">question</code>,{' '}
                <code className="bg-ce-muted px-1 rounded">answer</code>,{' '}
                <code className="bg-ce-muted px-1 rounded">category</code> (optional)
              </p>

              <div
                className="border-2 border-dashed border-ce-border rounded-lg p-8 text-center cursor-pointer hover:border-ce-teal transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-ce-text-muted mx-auto mb-2" />
                <p className="text-sm text-ce-text-muted">
                  Click to upload or drag and drop
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-ce-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-2 bg-white text-sm text-ce-text-muted">or paste CSV</span>
                </div>
              </div>

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-ce-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ce-teal"
                placeholder="question,answer,category&#10;What is your pricing?,Our plans start at $99/month,pricing"
              />

              {errors.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  {errors.map((err, i) => (
                    <p key={i} className="text-sm text-yellow-700">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-ce-text-muted">
                  {stats.totalFound} pairs found
                </span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                  {stats.newCount} new
                </span>
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                  {stats.overlapCount} overlaps
                </span>
              </div>

              {errors.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  {errors.map((err, i) => (
                    <p key={i} className="text-sm text-yellow-700">{err}</p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 py-2 border-b border-ce-border">
                <input
                  type="checkbox"
                  checked={selectedIndices.size === pairs.length}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-ce-text-muted">Select all</span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pairs.map((pair, i) => (
                  <div
                    key={i}
                    className={`p-3 border rounded-lg ${
                      selectedIndices.has(i) ? 'border-ce-teal bg-ce-teal/5' : 'border-ce-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(i)}
                        onChange={() => toggleSelect(i)}
                        className="mt-1 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ce-text truncate">
                          {pair.question}
                        </p>
                        <p className="text-sm text-ce-text-muted truncate">
                          {pair.answer}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              pair.isNew
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {pair.isNew ? 'New' : 'Overlap'}
                          </span>
                          {!pair.isNew && pair.existingMatchScore && (
                            <span className="text-xs text-ce-text-muted">
                              {Math.round(pair.existingMatchScore * 100)}% match
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-ce-teal animate-spin mb-4" />
              <p className="text-ce-text-muted">
                Saving {selectedIndices.size} pairs...
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
              <p className="text-lg font-medium text-ce-text">
                {savedCount} Q&A pairs saved!
              </p>
              <p className="text-sm text-ce-text-muted mt-1">
                Your knowledge base has been updated.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-ce-border flex-shrink-0">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text"
              >
                Cancel
              </button>
              <button
                onClick={handlePreview}
                disabled={!csvText.trim() || loading}
                className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Preview
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={selectedIndices.size === 0 || loading}
                className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save {selectedIndices.size} pairs
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
