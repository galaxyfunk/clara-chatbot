import { createServerClient } from '@/lib/supabase/server';
import type {
  AgentPrompt,
  AgentPromptListItem,
  AgentPromptUpdate,
} from '@/types/agent-prompts';

interface CacheEntry {
  content: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(workspaceId: string, slug: string): string {
  return `${workspaceId}:${slug}`;
}

function rowToPrompt(row: Record<string, unknown>): AgentPrompt {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    agentType: row.agent_type as AgentPrompt['agentType'],
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToListItem(row: Record<string, unknown>): AgentPromptListItem {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    agentType: row.agent_type as AgentPromptListItem['agentType'],
    isActive: row.is_active as boolean,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Load just the prompt content. Used by agents at runtime. Cached 60s.
 * Throws if not found or inactive.
 */
export async function loadPromptContent(
  workspaceId: string,
  slug: string
): Promise<string> {
  const key = cacheKey(workspaceId, slug);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.content;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('content, is_active')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (error || !data) {
    throw new Error(`[AgentPrompts] Prompt not found: ${slug}`);
  }
  if (!data.is_active) {
    throw new Error(`[AgentPrompts] Prompt inactive: ${slug}`);
  }

  cache.set(key, {
    content: data.content,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return data.content;
}

/** Drop a single cached entry. Called from update flow. */
export function invalidatePrompt(workspaceId: string, slug: string): void {
  cache.delete(cacheKey(workspaceId, slug));
}

/** List all prompts for a workspace, ordered by name. */
export async function listPrompts(
  workspaceId: string
): Promise<AgentPromptListItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('id, slug, name, description, agent_type, is_active, updated_at')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`[AgentPrompts] Failed to list: ${error.message}`);
  }
  return (data ?? []).map(rowToListItem);
}

/** Fetch a single prompt with full content. */
export async function getPromptBySlug(
  workspaceId: string,
  slug: string
): Promise<AgentPrompt | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return rowToPrompt(data);
}

/** Update editable fields. Invalidates cache on success. */
export async function updatePrompt(
  workspaceId: string,
  slug: string,
  update: AgentPromptUpdate
): Promise<AgentPrompt> {
  const supabase = createServerClient();
  const patch: Record<string, unknown> = {};
  if (update.name !== undefined) patch.name = update.name;
  if (update.description !== undefined) patch.description = update.description;
  if (update.content !== undefined) patch.content = update.content;
  if (update.isActive !== undefined) patch.is_active = update.isActive;

  if (Object.keys(patch).length === 0) {
    throw new Error('[AgentPrompts] No fields to update');
  }

  const { data, error } = await supabase
    .from('agent_prompts')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`[AgentPrompts] Update failed: ${error?.message ?? 'not found'}`);
  }
  invalidatePrompt(workspaceId, slug);
  return rowToPrompt(data);
}
