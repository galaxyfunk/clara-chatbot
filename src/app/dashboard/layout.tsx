import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { ensureWorkspace } from '@/lib/workspace';

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

  return (
    <div className="min-h-screen bg-ce-muted">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
