'use client';

import { Menu } from 'lucide-react';

interface MobileTopBarProps {
  onToggle: () => void;
}

export function MobileTopBar({ onToggle }: MobileTopBarProps) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-ce-navy z-40 flex items-center px-4">
      <button
        onClick={onToggle}
        className="p-2 text-white/70 hover:text-white rounded-lg transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="w-6 h-6" />
      </button>
      <span className="ml-3 text-white font-medium">Clara</span>
    </div>
  );
}
