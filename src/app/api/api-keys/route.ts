import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;

    // 3. Get keys (NEVER select encrypted_key)
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, provider, model, key_last4, label, is_default, is_active, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch API keys: ${error.message}`);
    }

    return NextResponse.json({ success: true, keys: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;

    // 3. Parse and validate body
    const body = await request.json();
    const provider = body.provider;
    const model = body.model;
    const apiKey = body.api_key;
    const label = body.label || null;
    const isDefault = body.is_default || false;

    if (!provider || !['openai', 'anthropic'].includes(provider)) {
      return NextResponse.json({ success: false, error: 'Invalid provider (must be openai or anthropic)' }, { status: 400 });
    }

    if (!model || model.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Model is required' }, { status: 400 });
    }

    if (!apiKey || apiKey.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 });
    }

    // 4. Validate the API key with a test call
    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        });
      } else {
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('401') || errorMessage.includes('auth') || errorMessage.includes('API key')) {
        return NextResponse.json({ success: false, error: 'Invalid API key — authentication failed' }, { status: 400 });
      }
      if (errorMessage.includes('model') || errorMessage.includes('does not exist')) {
        return NextResponse.json({ success: false, error: `Model "${model}" not available — try a different model` }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: `Validation failed: ${errorMessage}` }, { status: 400 });
    }

    // 5. Encrypt and extract last 4
    const encryptedKey = encrypt(apiKey);
    const keyLast4 = apiKey.slice(-4);

    // 6. If is_default, unset existing defaults
    if (isDefault) {
      await supabase
        .from('api_keys')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId);
    }

    // 7. Insert new key
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        workspace_id: workspaceId,
        provider,
        model,
        encrypted_key: encryptedKey,
        key_last4: keyLast4,
        label,
        is_default: isDefault,
        is_active: true,
      })
      .select('id, provider, model, key_last4, label, is_default, is_active, created_at, updated_at')
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    return NextResponse.json({ success: true, key: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
