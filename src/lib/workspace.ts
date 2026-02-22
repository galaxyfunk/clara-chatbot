import { createServerClient } from '@/lib/supabase/server';
import type { Workspace } from '@/types/workspace';

export async function ensureWorkspace(userId: string): Promise<Workspace> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', userId)
    .single();

  if (existing) return mapWorkspace(existing);

  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({ owner_id: userId })
    .select()
    .single();

  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  return mapWorkspace(created);
}

function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    settings: row.settings as Workspace['settings'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
