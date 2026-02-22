'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { MobileTopBar } from '@/components/mobile-top-bar';

interface DashboardShellProps {
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ce-muted">
      {/* Desktop sidebar */}
      <Sidebar
        userEmail={userEmail}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      {/* Mobile top bar */}
      <MobileTopBar onToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
      {/* Main content */}
      <main className="md:ml-64 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
