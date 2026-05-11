import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { AgentPromptListItem } from '@/types/agent-prompts';

interface PromptListProps {
  prompts: AgentPromptListItem[];
}

export function PromptList({ prompts }: PromptListProps) {
  if (prompts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-ce-text-muted">No agent prompts yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-ce-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ce-text-muted uppercase">
                Last edited
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-ce-text-muted uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ce-border">
            {prompts.map((p) => (
              <tr key={p.id} className="hover:bg-ce-muted/50 transition-colors">
                <td className="px-4 py-4">
                  <div className="text-sm font-medium text-ce-text">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-ce-text-muted mt-0.5">
                      {p.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-ce-teal/10 text-ce-teal">
                    {p.agentType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {p.isActive ? (
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-ce-text-muted">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/dashboard/agent-settings/prompts/${p.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-ce-teal hover:underline"
                  >
                    Edit
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {prompts.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/agent-settings/prompts/${p.slug}`}
            className="block bg-white rounded-lg shadow-sm p-4 hover:bg-ce-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-ce-text">{p.name}</p>
              <ChevronRight className="w-4 h-4 text-ce-text-muted flex-shrink-0 mt-0.5" />
            </div>
            {p.description && (
              <p className="text-xs text-ce-text-muted mb-3">{p.description}</p>
            )}
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-ce-teal/10 text-ce-teal">
                {p.agentType.replace(/_/g, ' ')}
              </span>
              {p.isActive ? (
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                  Active
                </span>
              ) : (
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                  Inactive
                </span>
              )}
              <span className="text-xs text-ce-text-muted ml-auto">
                {new Date(p.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
