'use client';

import { useState, useEffect } from 'react';
import { StatsCards, StatsCardsSkeleton } from '@/components/dashboard/stats-cards';
import { RecentGaps, RecentGapsSkeleton } from '@/components/dashboard/recent-gaps';
import { QuickActions } from '@/components/dashboard/quick-actions';

interface Stats {
  totalPairs: number;
  totalSessions: number;
  openGaps: number;
  escalations: number;
}

interface Gap {
  id: string;
  question: string;
  similarity_score: number | null;
  created_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentGaps, setRecentGaps] = useState<Gap[]>([]);
  const [displayName, setDisplayName] = useState('Clara');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [statsRes, gapsRes, wsRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/gaps?status=open'),
          fetch('/api/workspace'),
        ]);

        const statsData = await statsRes.json();
        const gapsData = await gapsRes.json();
        const wsData = await wsRes.json();

        if (statsData.success) {
          setStats(statsData.stats);
        }
        if (gapsData.success) {
          setRecentGaps((gapsData.gaps || []).slice(0, 5));
        }
        if (wsData.success) {
          setDisplayName(wsData.workspace?.settings?.display_name || 'Clara');
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      }
      setLoading(false);
    }
    load();
  }, []);

  const isEmpty = stats && stats.totalPairs === 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Dashboard</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Overview of your chatbot performance
          </p>
        </div>
        <StatsCardsSkeleton />
        <RecentGapsSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ce-text">Dashboard</h1>
          <p className="mt-1 text-sm text-ce-text-muted">
            Overview of your chatbot performance
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <h2 className="text-xl font-semibold text-ce-text">
            Welcome to {displayName}!
          </h2>
          <p className="mt-2 text-ce-text-muted max-w-md mx-auto">
            Get started by adding your first Q&A pairs. Once you have content,
            your chatbot will be ready to help visitors.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-ce-text mb-4">Quick Actions</h2>
          <QuickActions displayName={displayName} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ce-text">Dashboard</h1>
        <p className="mt-1 text-sm text-ce-text-muted">
          Overview of your chatbot performance
        </p>
      </div>

      {stats && <StatsCards stats={stats} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentGaps gaps={recentGaps} />
        <div>
          <h2 className="text-lg font-semibold text-ce-text mb-4">Quick Actions</h2>
          <QuickActions displayName={displayName} />
        </div>
      </div>
    </div>
  );
}
