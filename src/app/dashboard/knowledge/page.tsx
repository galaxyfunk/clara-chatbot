'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Upload } from 'lucide-react';
import { QAPairsTable, QAPairsTableSkeleton } from '@/components/knowledge/qa-pairs-table';
import { QAPairForm } from '@/components/knowledge/qa-pair-form';
import { ImproveDialog } from '@/components/knowledge/improve-dialog';
import { CSVImportDialog } from '@/components/knowledge/csv-import-dialog';
import { DEFAULT_CATEGORIES, type QAPair } from '@/types/qa';

export default function KnowledgePage() {
  const [pairs, setPairs] = useState<QAPair[]>([]);
  const [workspace, setWorkspace] = useState<{ settings?: { display_name?: string } } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPair, setEditingPair] = useState<QAPair | null>(null);
  const [improvingPair, setImprovingPair] = useState<QAPair | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const displayName = workspace?.settings?.display_name || 'Clara';

  useEffect(() => {
    async function load() {
      try {
        const [pairsRes, wsRes] = await Promise.all([
          fetch('/api/qa-pairs'),
          fetch('/api/workspace'),
        ]);
        const pairsData = await pairsRes.json();
        const wsData = await wsRes.json();

        if (pairsData.success) {
          // Map snake_case to camelCase
          const mappedPairs = (pairsData.pairs || []).map((p: Record<string, unknown>) => ({
            id: p.id,
            workspaceId: p.workspace_id,
            question: p.question,
            answer: p.answer,
            category: p.category,
            source: p.source,
            isActive: p.is_active,
            metadata: p.metadata,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          }));
          setPairs(mappedPairs);
        }
        if (wsData.success) {
          setWorkspace(wsData.workspace);
        }
      } catch (error) {
        console.error('Failed to load knowledge base:', error);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') setIsAddModalOpen(true);
    if (params.get('action') === 'import') setIsImportOpen(true);
  }, []);

  const handleDelete = async (pairId: string) => {
    if (!window.confirm('Delete this Q&A pair?')) return;
    try {
      const res = await fetch(`/api/qa-pairs/${pairId}`, { method: 'DELETE' });
      if (res.ok) {
        setPairs((prev) => prev.filter((p) => p.id !== pairId));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleSave = (pair: QAPair | Record<string, unknown>) => {
    // Map to camelCase if needed - cast to any for snake_case access
    const p = pair as Record<string, unknown>;
    const mappedPair: QAPair = {
      id: (p.id) as string,
      workspaceId: (p.workspaceId || p.workspace_id) as string,
      question: p.question as string,
      answer: p.answer as string,
      category: p.category as string,
      source: (p.source || 'manual') as QAPair['source'],
      isActive: (p.isActive ?? p.is_active ?? true) as boolean,
      metadata: (p.metadata || {}) as Record<string, unknown>,
      createdAt: (p.createdAt || p.created_at) as string,
      updatedAt: (p.updatedAt || p.updated_at) as string,
    };

    if (editingPair) {
      setPairs((prev) =>
        prev.map((p) => (p.id === mappedPair.id ? mappedPair : p))
      );
    } else {
      setPairs((prev) => [mappedPair, ...prev]);
    }
    setEditingPair(null);
    setIsAddModalOpen(false);
  };

  const handleImproveAccept = (improved: { question: string; answer: string }) => {
    if (improvingPair) {
      setPairs((prev) =>
        prev.map((p) =>
          p.id === improvingPair.id
            ? { ...p, question: improved.question, answer: improved.answer }
            : p
        )
      );
    }
    setImprovingPair(null);
  };

  const handleImportComplete = async () => {
    // Refresh pairs after import
    try {
      const res = await fetch('/api/qa-pairs');
      const data = await res.json();
      if (data.success) {
        const mappedPairs = (data.pairs || []).map((p: Record<string, unknown>) => ({
          id: p.id,
          workspaceId: p.workspace_id,
          question: p.question,
          answer: p.answer,
          category: p.category,
          source: p.source,
          isActive: p.is_active,
          metadata: p.metadata,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        }));
        setPairs(mappedPairs);
      }
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
    setIsImportOpen(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ce-text">Knowledge Base</h1>
            <p className="mt-1 text-sm text-ce-text-muted">
              Manage Q&A pairs that power your chatbot
            </p>
          </div>
        </div>
        <QAPairsTableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Knowledge Base</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Manage Q&A pairs that power your chatbot
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 text-sm font-medium text-ce-text border border-ce-border rounded-lg hover:bg-ce-muted transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Q&A
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ce-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions and answers..."
            className="w-full pl-10 pr-4 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent"
          />
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-ce-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ce-teal focus:border-transparent"
        >
          <option value="all">All Categories</option>
          {DEFAULT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <QAPairsTable
        pairs={pairs}
        searchQuery={searchQuery}
        categoryFilter={categoryFilter}
        onEdit={setEditingPair}
        onImprove={setImprovingPair}
        onDelete={handleDelete}
        displayName={displayName}
      />

      {/* Modals */}
      {(isAddModalOpen || editingPair) && (
        <QAPairForm
          pair={editingPair}
          onSave={handleSave}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingPair(null);
          }}
        />
      )}

      {improvingPair && (
        <ImproveDialog
          pair={improvingPair}
          onAccept={handleImproveAccept}
          onClose={() => setImprovingPair(null)}
        />
      )}

      {isImportOpen && (
        <CSVImportDialog
          onComplete={handleImportComplete}
          onClose={() => setIsImportOpen(false)}
        />
      )}
    </div>
  );
}
