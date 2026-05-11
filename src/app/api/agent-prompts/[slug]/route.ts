import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { getPromptBySlug, updatePrompt } from '@/lib/agent-prompts/loader';
import type { AgentPromptUpdate } from '@/types/agent-prompts';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

async function resolveWorkspace() {
  const authClient = await createAuthClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized' as const, status: 401 };
  }

  const supabase = createServerClient();
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  if (wsError || !workspace) {
    return { error: 'Workspace not found' as const, status: 404 };
  }

  return { workspaceId: workspace.id as string };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const result = await resolveWorkspace();
    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const prompt = await getPromptBySlug(result.workspaceId, slug);
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const result = await resolveWorkspace();
    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const update: AgentPromptUpdate = {};

    if (typeof body.name === 'string') {
      update.name = body.name;
    }
    if (body.description === null || typeof body.description === 'string') {
      update.description = body.description as string | null;
    }
    if (typeof body.content === 'string') {
      if (body.content.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'Content cannot be empty' },
          { status: 400 }
        );
      }
      update.content = body.content;
    }
    if (typeof body.isActive === 'boolean') {
      update.isActive = body.isActive;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const prompt = await updatePrompt(result.workspaceId, slug, update);
    return NextResponse.json({ success: true, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
