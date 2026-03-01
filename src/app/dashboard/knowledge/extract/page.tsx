'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Upload, Loader2, CheckCircle } from 'lucide-react';
import { ExtractionResults } from '@/components/knowledge/extraction-results';
import { FileUploadZone } from '@/components/knowledge/file-upload-zone';
import type { ExtractedQAPair } from '@/types/qa';

type Step = 'input' | 'extracting' | 'review' | 'saving' | 'done';
type InputMode = 'paste' | 'upload';

export default function TranscriptExtractPage() {
  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<InputMode>('paste');
  const [transcript, setTranscript] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pairs, setPairs] = useState<ExtractedQAPair[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [improvingIndex, setImprovingIndex] = useState<number | null>(null);
  const [stats, setStats] = useState({ totalFound: 0, newCount: 0, overlapCount: 0 });
  const [savedCount, setSavedCount] = useState(0);
  const [autoResolvedCount, setAutoResolvedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canExtract = inputMode === 'paste'
    ? transcript.length >= 100 && transcript.length <= 100000
    : uploadedFile !== null;

  const handleExtract = async () => {
    if (!canExtract) return;
    setStep('extracting');
    setError(null);

    try {
      let res: Response;

      if (inputMode === 'paste') {
        res = await fetch('/api/qa-pairs/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: transcript }),
        });
      } else {
        // File upload mode - use multipart form
        const formData = new FormData();
        formData.append('file', uploadedFile!);
        res = await fetch('/api/qa-pairs/extract', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract');
      }

      setPairs(data.pairs || []);
      setStats({
        totalFound: data.totalFound || 0,
        newCount: data.newCount || 0,
        overlapCount: data.overlapCount || 0,
      });

      // Auto-select new pairs
      const newIndices = new Set<number>();
      (data.pairs || []).forEach((p: ExtractedQAPair, i: number) => {
        if (p.isNew) newIndices.add(i);
      });
      setSelectedIndices(newIndices);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('input');
    }
  };

  const handleSave = async () => {
    const selectedPairs = pairs.filter((_, i) => selectedIndices.has(i));
    if (selectedPairs.length === 0) return;

    setStep('saving');
    setError(null);

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
          source: 'transcript_extraction',
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      setSavedCount(data.imported || 0);
      setAutoResolvedCount(data.auto_resolved || 0);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setStep('review');
    }
  };

  const handleToggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleSelectAll = (select: boolean) => {
    if (select) {
      setSelectedIndices(new Set(pairs.map((_, i) => i)));
    } else {
      setSelectedIndices(new Set());
    }
  };

  const handleImprove = async (index: number) => {
    const pair = pairs[index];
    if (!pair) return;

    setImprovingIndex(index);
    try {
      const res = await fetch('/api/qa-pairs/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: pair.question,
          answer: pair.answer,
        }),
      });
      const data = await res.json();

      if (res.ok && data.improved) {
        const updated = [...pairs];
        updated[index] = {
          ...updated[index],
          question: data.improved.question,
          answer: data.improved.answer,
        };
        setPairs(updated);
      }
    } catch {
      // Silently fail on improve error
    }
    setImprovingIndex(null);
  };

  const handleReset = () => {
    setStep('input');
    setInputMode('paste');
    setTranscript('');
    setUploadedFile(null);
    setPairs([]);
    setSelectedIndices(new Set());
    setStats({ totalFound: 0, newCount: 0, overlapCount: 0 });
    setSavedCount(0);
    setAutoResolvedCount(0);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/knowledge"
          className="p-2 text-ce-text-muted hover:text-ce-text rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Extract from Transcript</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Use AI to extract Q&A pairs from call transcripts or meeting notes
          </p>
        </div>
      </div>

      {/* Step: Input */}
      {step === 'input' && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          {/* Tab buttons */}
          <div className="flex border-b border-ce-border">
            <button
              onClick={() => setInputMode('paste')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                inputMode === 'paste'
                  ? 'border-ce-teal text-ce-teal'
                  : 'border-transparent text-ce-text-muted hover:text-ce-text'
              }`}
            >
              <FileText className="w-4 h-4" />
              Paste Text
            </button>
            <button
              onClick={() => setInputMode('upload')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                inputMode === 'upload'
                  ? 'border-ce-teal text-ce-teal'
                  : 'border-transparent text-ce-text-muted hover:text-ce-text'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>
          </div>

          {/* Paste text mode */}
          {inputMode === 'paste' && (
            <>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={12}
                className="w-full px-4 py-3 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent resize-none"
                placeholder="Paste a call transcript, meeting notes, or FAQ content. Clara will extract Q&A pairs automatically."
              />

              <div className="flex items-center justify-between">
                <span className="text-sm text-ce-text-muted">
                  {transcript.length.toLocaleString()} characters
                  {transcript.length < 100 && transcript.length > 0 && (
                    <span className="text-yellow-600 ml-2">
                      (minimum 100 characters)
                    </span>
                  )}
                </span>
                <button
                  onClick={handleExtract}
                  disabled={!canExtract}
                  className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Extract Q&A Pairs
                </button>
              </div>

              {transcript.length > 100000 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Text too long (max 100,000 characters)
                </div>
              )}
            </>
          )}

          {/* Upload file mode */}
          {inputMode === 'upload' && (
            <>
              <FileUploadZone
                onFileSelect={setUploadedFile}
                disabled={false}
              />

              <div className="flex items-center justify-end">
                <button
                  onClick={handleExtract}
                  disabled={!canExtract}
                  className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Extract Q&A Pairs
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Step: Extracting */}
      {step === 'extracting' && (
        <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-ce-teal animate-spin mb-4" />
          <p className="text-lg font-medium text-ce-text">
            Extracting Q&A pairs from transcript...
          </p>
          <p className="text-sm text-ce-text-muted mt-2">
            This may take 30-60 seconds for long transcripts
          </p>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-ce-text-muted">
                {stats.totalFound} pairs extracted
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                {stats.newCount} new
              </span>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                {stats.overlapCount} overlaps
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <ExtractionResults
              pairs={pairs}
              selectedIndices={selectedIndices}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onImprove={handleImprove}
              improvingIndex={improvingIndex}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep('input')}
              className="px-4 py-2 text-sm font-medium text-ce-text-muted hover:text-ce-text"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={selectedIndices.size === 0}
              className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Selected ({selectedIndices.size})
            </button>
          </div>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-ce-teal animate-spin mb-4" />
          <p className="text-lg font-medium text-ce-text">
            Saving {selectedIndices.size} pairs and generating embeddings...
          </p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
          <CheckCircle className="w-14 h-14 text-green-500 mb-4" />
          <p className="text-xl font-semibold text-ce-text">
            {savedCount} Q&A pairs saved!
          </p>
          <p className="text-sm text-ce-text-muted mt-2">
            Your knowledge base has been updated.
          </p>
          {autoResolvedCount > 0 && (
            <p className="text-sm text-ce-text-muted mt-2">
              {autoResolvedCount} flagged question{autoResolvedCount === 1 ? ' was' : 's were'} automatically resolved.{' '}
              <Link
                href="/dashboard/gaps?status=resolved"
                className="text-ce-teal hover:underline"
              >
                View resolved
              </Link>
            </p>
          )}
          <div className="mt-6 flex items-center gap-4">
            <Link
              href="/dashboard/knowledge"
              className="px-4 py-2 bg-ce-navy text-white text-sm font-medium rounded-lg hover:bg-ce-navy/90"
            >
              Go to Knowledge Base
            </Link>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted"
            >
              Extract More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
