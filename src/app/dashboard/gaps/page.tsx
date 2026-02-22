'use client';

import { useState, useEffect } from 'react';
import { GapCard, GapCardSkeleton, type Gap } from '@/components/gaps/gap-card';
import { GapResolveForm } from '@/components/gaps/gap-resolve-form';

type GapStatus = 'open' | 'resolved' | 'dismissed';

export default function GapsPage() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [statusFilter, setStatusFilter] = useState<GapStatus>('open');
  const [resolvingGap, setResolvingGap] = useState<Gap | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0 });

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

  // Fetch all three counts on mount
  useEffect(() => {
    async function loadCounts() {
      try {
        const [openRes, resolvedRes, dismissedRes] = await Promise.all([
          fetch('/api/gaps?status=open'),
          fetch('/api/gaps?status=resolved'),
          fetch('/api/gaps?status=dismissed'),
        ]);
        const openData = await openRes.json();
        const resolvedData = await resolvedRes.json();
        const dismissedData = await dismissedRes.json();
        setCounts({
          open: (openData.gaps || []).length,
          resolved: (resolvedData.gaps || []).length,
          dismissed: (dismissedData.gaps || []).length,
        });
      } catch (error) {
        console.error('Failed to load counts:', error);
      }
    }
    loadCounts();
  }, []);

  const handleDismiss = async (gapId: string) => {
    if (!window.confirm("Dismiss this gap? It won't create a Q&A pair.")) return;

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

  const statusTabs: { value: GapStatus; label: string; count: number }[] = [
    { value: 'open', label: 'Open', count: counts.open },
    { value: 'resolved', label: 'Resolved', count: counts.resolved },
    { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
  ];

  const emptyMessages: Record<GapStatus, string> = {
    open: "No open gaps. When visitors ask questions your knowledge base can't answer, they'll appear here for review.",
    resolved: 'No resolved gaps yet. Resolved gaps create new Q&A pairs for your knowledge base.',
    dismissed: 'No dismissed gaps. Dismissed gaps are questions you chose not to add to your knowledge base.',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ce-text">Gap Review</h1>
        <p className="mt-1 text-sm text-ce-text-muted">
          Review unanswered questions and add them to your knowledge base
        </p>
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
          onSave={handleResolveComplete}
          onCancel={() => setResolvingGap(null)}
        />
      )}
    </div>
  );
}
