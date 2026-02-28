import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { extractQAPairsFromTranscript } from '@/lib/chat/extract-qa';
import { getMergedCategories } from '@/lib/categories';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '@/types/workspace';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace with settings
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, settings')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;
    const settings = { ...DEFAULT_WORKSPACE_SETTINGS, ...workspace.settings } as WorkspaceSettings;

    // 3. Parse and validate body
    const body = await request.json();
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json({ success: false, error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 100000) {
      return NextResponse.json({ success: false, error: 'Text too long (max 100,000 characters)' }, { status: 400 });
    }

    // 4. Get merged categories for extraction
    const categories = getMergedCategories(settings.custom_categories || []);

    // 5. Extract Q&A pairs
    const result = await extractQAPairsFromTranscript(text, workspaceId, categories);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
