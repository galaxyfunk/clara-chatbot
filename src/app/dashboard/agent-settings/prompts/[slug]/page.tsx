import { notFound, redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { getPromptBySlug } from '@/lib/agent-prompts/loader';
import { PromptEditor } from '@/components/agent-prompts/prompt-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AgentPromptEditPage({ params }: PageProps) {
  const { slug } = await params;

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

  const prompt = await getPromptBySlug(workspace.id, slug);
  if (!prompt) notFound();

  return (
    <div className="max-w-4xl mx-auto">
      <PromptEditor prompt={prompt} />
    </div>
  );
}
