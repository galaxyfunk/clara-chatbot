import { notFound, redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { SessionDetail } from '@/components/sessions/session-detail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionByIdPage({ params }: PageProps) {
  const { id } = await params;

  const authClient = await createAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  if (!workspace) redirect('/login');

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .select('id, session_token, messages, metadata, escalated, escalated_at, created_at, updated_at')
    .eq('id', id)
    .eq('workspace_id', workspace.id)
    .single();

  if (error || !session) notFound();

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden h-[calc(100vh-160px)] min-h-[500px]">
      <SessionDetail session={session} />
    </div>
  );
}
