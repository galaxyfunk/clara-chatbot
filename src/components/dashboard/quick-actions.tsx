'use client';

import Link from 'next/link';
import { Plus, Upload, FileText } from 'lucide-react';

interface QuickActionsProps {
  displayName: string;
}

export function QuickActions({ displayName }: QuickActionsProps) {
  const actions = [
    {
      label: 'Add Q&A Pair',
      description: `Add a new Q&A pair to ${displayName}'s knowledge base`,
      href: '/dashboard/knowledge?action=add',
      icon: Plus,
    },
    {
      label: 'Import CSV',
      description: 'Bulk import Q&A pairs from a CSV file',
      href: '/dashboard/knowledge?action=import',
      icon: Upload,
    },
    {
      label: 'Extract from Transcript',
      description: 'Use AI to extract Q&A pairs from transcripts',
      href: '/dashboard/knowledge/extract',
      icon: FileText,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            className="bg-white border border-ce-border rounded-lg p-6 hover:border-ce-teal transition-colors group"
          >
            <div className="p-2 bg-ce-muted rounded-lg w-fit group-hover:bg-ce-teal/10 transition-colors">
              <Icon className="w-5 h-5 text-ce-text-muted group-hover:text-ce-teal transition-colors" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-ce-text">{action.label}</h3>
            <p className="mt-1 text-xs text-ce-text-muted">{action.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
