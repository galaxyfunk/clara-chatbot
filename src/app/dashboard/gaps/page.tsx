'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, ChevronDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { GapCard, GapCardSkeleton, type Gap } from '@/components/gaps/gap-card';
import { GapResolveForm } from '@/components/gaps/gap-resolve-form';
import { GapsBulkActionBar } from '@/components/gaps/gaps-bulk-action-bar';

type GapStatus = 'open' | 'resolved' | 'dismissed';

interface WorkspaceData {
  settings?: {
    custom_categories?: string[];
  };
}

function isValidStatus(status: string | null): status is GapStatus {
  return status === 'open' || status === 'resolved' || status === 'dismissed';
}

export default function GapsPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status');

  const [gaps, setGaps] = useState<Gap[]>([]);
  const [statusFilter, setStatusFilter] = useState<GapStatus>(
    isValidStatus(initialStatus) ? initialStatus : 'open'
  );
  const [resolvingGap, setResolvingGap] = useState<Gap | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0 });
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const customCategories = workspace?.settings?.custom_categories || [];
  const isOpenTab = statusFilter === 'open';

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch gaps when filter changes
  useEffect(() => {
    async function load() {
      setLoading(true);
      setSelectedIds(new Set()); // Clear selection when switching tabs
      try {
        const res = await fetch(`/api/gaps?status=${statusFilter}`);
        const data = await res.json();
        setGaps(data.gaps || []);
      } catch (error) {
        console.error('Failed to load gaps:', error);
      }
      setLoading(false);
    }
    load();
  }, [statusFilter]);

  // Fetch all three counts and workspace on mount
  useEffect(() => {
    async function loadCounts() {
      try {
        const [openRes, resolvedRes, dismissedRes, wsRes] = await Promise.all([
          fetch('/api/gaps?status=open'),
          fetch('/api/gaps?status=resolved'),
          fetch('/api/gaps?status=dismissed'),
          fetch('/api/workspace'),
        ]);
        const openData = await openRes.json();
        const resolvedData = await resolvedRes.json();
        const dismissedData = await dismissedRes.json();
        const wsData = await wsRes.json();
        setCounts({
          open: (openData.gaps || []).length,
          resolved: (resolvedData.gaps || []).length,
          dismissed: (dismissedData.gaps || []).length,
        });
        if (wsData.success) {
          setWorkspace(wsData.workspace);
        }
      } catch (error) {
        console.error('Failed to load counts:', error);
      }
    }
    loadCounts();
  }, []);

  const handleDismiss = async (gapId: string) => {
    if (!window.confirm("Dismiss this question? It won't be added to your knowledge base.")) return;

    try {
      await fetch('/api/gaps/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gap_id: gapId }),
      });
      setGaps((prev) => prev.filter((g) => g.id !== gapId));
      setCounts((prev) => ({
        ...prev,
        open: prev.open - 1,
        dismissed: prev.dismissed + 1,
      }));
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  const handleResolveComplete = () => {
    if (resolvingGap) {
      setGaps((prev) => prev.filter((g) => g.id !== resolvingGap.id));
      setCounts((prev) => ({
        ...prev,
        open: prev.open - 1,
        resolved: prev.resolved + 1,
      }));
    }
    setResolvingGap(null);
  };

  const handleNewCategory = async (category: string) => {
    const normalized = category.toLowerCase().trim();
    if (!normalized || customCategories.includes(normalized)) return;

    const newCategories = [...customCategories, normalized];
    try {
      await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_categories: newCategories }),
      });
      setWorkspace((prev) => ({
        ...prev,
        settings: { ...prev?.settings, custom_categories: newCategories },
      }));
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleToggleSelect = (gapId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === gaps.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(gaps.map((g) => g.id)));
    }
  };

  const handleBulkAction = async (action: 'dismiss' | 'delete') => {
    if (selectedIds.size === 0) return;

    try {
      const res = await fetch('/api/gaps/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Bulk action failed');
      }

      // Remove affected items from the list
      const affectedCount = data.affected || 0;
      setGaps((prev) => prev.filter((g) => !selectedIds.has(g.id)));
      setSelectedIds(new Set());

      // Update counts
      if (action === 'dismiss') {
        setCounts((prev) => ({
          ...prev,
          open: prev.open - affectedCount,
          dismissed: prev.dismissed + affectedCount,
        }));
      } else if (action === 'delete') {
        setCounts((prev) => ({
          ...prev,
          open: prev.open - affectedCount,
        }));
      }
    } catch (error) {
      console.error('Bulk action failed:', error);
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Get the gaps to export (selected if any, otherwise all open)
  const getExportGaps = (): Gap[] => {
    if (selectedIds.size > 0) {
      return gaps.filter((g) => selectedIds.has(g.id));
    }
    return gaps;
  };

  const exportQuestionsOnly = () => {
    const exportGaps = getExportGaps();
    if (exportGaps.length === 0) return;

    // Build Excel data
    const data: (string | undefined)[][] = [
      ['Question', 'AI Answer', 'Date Flagged'],
    ];

    for (const g of exportGaps) {
      const aiAnswer = g.ai_answer
        ? g.ai_answer.length > 200
          ? g.ai_answer.substring(0, 200) + '...'
          : g.ai_answer
        : '';
      const dateFlagged = new Date(g.created_at).toLocaleDateString();
      data.push([g.question, aiAnswer, dateFlagged]);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 60 }, // Question
      { wch: 60 }, // AI Answer
      { wch: 15 }, // Date Flagged
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Flagged Questions');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `flagged-questions-${today}.xlsx`);
    setExportDropdownOpen(false);
  };

  const exportInterviewGuide = async (includeQuestions: boolean, includeGuide: boolean) => {
    const exportGaps = getExportGaps();

    // Minimum 5 questions for guide
    if (includeGuide && exportGaps.length < 5) {
      alert('Select at least 5 questions to generate a meaningful interview guide');
      return;
    }

    setExportLoading(true);
    setExportDropdownOpen(false);

    try {
      const res = await fetch('/api/gaps/interview-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gap_ids: exportGaps.map((g) => g.id),
          include_questions_sheet: includeQuestions,
          include_guide_sheet: includeGuide,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate interview guide');
      }

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `clara-interview-guide-${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate interview guide');
    } finally {
      setExportLoading(false);
    }
  };

  const statusTabs: { value: GapStatus; label: string; count: number }[] = [
    { value: 'open', label: 'Open', count: counts.open },
    { value: 'resolved', label: 'Resolved', count: counts.resolved },
    { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
  ];

  const emptyMessages: Record<GapStatus, string> = {
    open: "No flagged questions. When visitors ask questions your chatbot can't confidently answer, they'll appear here for review.",
    resolved: 'No resolved questions yet. Resolved questions create new Q&A pairs for your knowledge base.',
    dismissed: 'No dismissed questions. Dismissed questions are ones you chose not to add to your knowledge base.',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Flagged Questions</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Questions your chatbot couldn&apos;t confidently answer. Review them, write an answer, and add it to your knowledge base to make your chatbot smarter.
          </p>
        </div>
        {gaps.length > 0 && (
          <div className="relative" ref={exportDropdownRef}>
            <button
              onClick={() => !exportLoading && setExportDropdownOpen(!exportDropdownOpen)}
              disabled={exportLoading}
              className="px-4 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating interview guide...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>

            {exportDropdownOpen && !exportLoading && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-ce-border z-50">
                <div className="py-1">
                  <button
                    onClick={exportQuestionsOnly}
                    className="w-full px-4 py-3 text-left text-sm text-ce-text hover:bg-ce-muted flex items-start gap-3"
                  >
                    <FileSpreadsheet className="w-5 h-5 text-ce-teal flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Questions Only</div>
                      <div className="text-xs text-ce-text-muted mt-0.5">
                        Export flagged questions as Excel
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => exportInterviewGuide(false, true)}
                    className="w-full px-4 py-3 text-left text-sm text-ce-text hover:bg-ce-muted flex items-start gap-3 border-t border-ce-border"
                  >
                    <FileText className="w-5 h-5 text-ce-navy flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Interview Guide Only</div>
                      <div className="text-xs text-ce-text-muted mt-0.5">
                        AI-generated interview prompts (min. 5 questions)
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => exportInterviewGuide(true, true)}
                    className="w-full px-4 py-3 text-left text-sm text-ce-text hover:bg-ce-muted flex items-start gap-3 border-t border-ce-border"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <FileSpreadsheet className="w-5 h-5 text-ce-teal" />
                    </div>
                    <div>
                      <div className="font-medium">Questions + Interview Guide</div>
                      <div className="text-xs text-ce-text-muted mt-0.5">
                        Both sheets in one Excel file (min. 5 questions)
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              statusFilter === tab.value
                ? 'bg-ce-navy text-white'
                : 'bg-white text-ce-text border border-ce-border hover:bg-ce-muted'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Select All header - only on Open tab */}
      {isOpenTab && gaps.length > 0 && !loading && (
        <div className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={gaps.length > 0 && selectedIds.size === gaps.length}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < gaps.length;
            }}
            onChange={handleSelectAll}
            className="w-4 h-4 rounded border-ce-border text-ce-teal focus:ring-ce-teal"
          />
          <span className="text-sm text-ce-text-muted">
            {selectedIds.size === 0
              ? 'Select all'
              : `${selectedIds.size} of ${gaps.length} selected`}
          </span>
        </div>
      )}

      {/* Gaps list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <GapCardSkeleton key={i} />
          ))}
        </div>
      ) : gaps.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-ce-text-muted">{emptyMessages[statusFilter]}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {gaps.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              onResolve={setResolvingGap}
              onDismiss={handleDismiss}
              showCheckbox={isOpenTab}
              selected={selectedIds.has(gap.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      )}

      {/* Resolve modal */}
      {resolvingGap && (
        <GapResolveForm
          gap={resolvingGap}
          categories={customCategories}
          onSave={handleResolveComplete}
          onCancel={() => setResolvingGap(null)}
          onNewCategory={handleNewCategory}
        />
      )}

      {/* Bulk action bar */}
      {isOpenTab && (
        <GapsBulkActionBar
          selectedCount={selectedIds.size}
          onAction={handleBulkAction}
          onClear={handleClearSelection}
        />
      )}
    </div>
  );
}
