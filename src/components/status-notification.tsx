'use client';

import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface StatusNotificationProps {
  message: string | null;
  type: 'success' | 'error';
  onDismiss: () => void;
}

export function StatusNotification({ message, type, onDismiss }: StatusNotificationProps) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-sm ${
        type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle className="w-5 h-5 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
      )}
      <span className="text-sm font-medium flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
