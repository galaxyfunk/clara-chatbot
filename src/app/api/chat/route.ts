import { NextResponse } from 'next/server';
import { processChat } from '@/lib/chat/engine';
import type { ChatRequest } from '@/types/chat';

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 2000 characters)' }, { status: 400 });
    }

    const response = await processChat(body);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
