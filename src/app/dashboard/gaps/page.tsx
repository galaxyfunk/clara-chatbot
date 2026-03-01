'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { GapCard, GapCardSkeleton, type Gap } from '@/components/gaps/gap-card';
import { GapResolveForm } from '@/components/gaps/gap-resolve-form';

type GapStatus = 'open' | 'resolved' | 'dismissed';

interface WorkspaceData {
  settings?: {
    custom_categories?: string[];
  };
}

export default function GapsPage() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [statusFilter, setStatusFilter] = useState<GapStatus>('open');
  const [resolvingGap, setResolvingGap] = useState<Gap | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0 });
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);

  const customCategories = workspace?.settings?.custom_categories || [];

  // Fetch gaps when filter changes
  useEffect(() => {
    async function load() {
      setLoading(true);
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

  const exportGapsToCSV = () => {
    if (gaps.length === 0) return;

    const headers = ['Question', 'AI Answer', 'Similarity Score', 'Status', 'Created At'];
    const rows = gaps.map(g => [
      `"${g.question.replace(/"/g, '""')}"`,
      `"${(g.ai_answer || '').replace(/"/g, '""')}"`,
      g.similarity_score?.toFixed(3) || '',
      g.status,
      g.created_at,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaps-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <button
            onClick={exportGapsToCSV}
            className="px-4 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
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
    </div>
  );
}
