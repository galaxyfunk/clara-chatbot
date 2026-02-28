import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { extractQAPairsFromTranscript } from '@/lib/chat/extract-qa';
import { getMergedCategories } from '@/lib/categories';
import { parseFile } from '@/lib/files/parse';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '@/types/workspace';

// pdf-parse requires Node.js runtime
export const runtime = 'nodejs';
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

    // 3. Parse request body (JSON or multipart)
    const contentType = request.headers.get('content-type') || '';
    let text: string;

    if (contentType.includes('multipart/form-data')) {
      // File upload mode
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
      }

      // Parse file to extract text
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parseResult = await parseFile(buffer, file.name);

      if (!parseResult.success || !parseResult.text) {
        return NextResponse.json({ success: false, error: parseResult.error || 'Failed to parse file' }, { status: 400 });
      }

      text = parseResult.text;
    } else {
      // JSON body mode (paste text)
      const body = await request.json();
      text = body.text?.trim();

      if (!text) {
        return NextResponse.json({ success: false, error: 'Text is required' }, { status: 400 });
      }
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
