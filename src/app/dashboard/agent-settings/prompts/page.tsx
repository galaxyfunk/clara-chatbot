import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { listPrompts } from '@/lib/agent-prompts/loader';
import { PromptList } from '@/components/agent-prompts/prompt-list';

export const dynamic = 'force-dynamic';

export default async function AgentPromptsPage() {
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

  const prompts = await listPrompts(workspace.id);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ce-text">Agent Prompts</h1>
        <p className="text-sm text-ce-text-muted mt-1">
          Edit prompts for Clara&apos;s agents. Saved changes apply within 60 seconds.
        </p>
      </div>
      <PromptList prompts={prompts} />
    </div>
  );
}
