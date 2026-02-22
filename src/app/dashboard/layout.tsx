import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { ensureWorkspace } from '@/lib/workspace';
import { DashboardShell } from '@/components/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ensure workspace exists for this user
  await ensureWorkspace(user.id);

  const userEmail = user.email || '';

  return (
    <DashboardShell userEmail={userEmail}>
      {children}
    </DashboardShell>
  );
}
