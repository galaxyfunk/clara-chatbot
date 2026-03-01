'use client';

import { Database, MessageSquare, AlertCircle, PhoneForwarded } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    totalPairs: number;
    totalSessions: number;
    openGaps: number;
    escalations: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { label: 'Q&A Pairs', value: stats.totalPairs, icon: Database },
    { label: 'Sessions', value: stats.totalSessions, icon: MessageSquare },
    { label: 'Flagged Questions', value: stats.openGaps, icon: AlertCircle },
    { label: 'Escalations', value: stats.escalations, icon: PhoneForwarded },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-white rounded-lg shadow-sm p-6"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-ce-teal/10 rounded-lg">
                <Icon className="w-5 h-5 text-ce-teal" />
              </div>
              <span className="text-sm text-ce-text-muted">{card.label}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-ce-text">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-ce-muted rounded-lg" />
            <div className="h-4 w-20 bg-ce-muted rounded" />
          </div>
          <div className="mt-3 h-8 w-12 bg-ce-muted rounded" />
        </div>
      ))}
    </div>
  );
}
