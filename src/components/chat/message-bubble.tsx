'use client';

import { ExternalLink } from 'lucide-react';

interface MessageBubbleProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    gap_detected?: boolean;
    escalation_offered?: boolean;
    booking_url?: string | null;
  };
  primaryColor: string;
  avatarUrl: string | null;
  displayName: string;
}

export function MessageBubble({
  message,
  primaryColor,
  avatarUrl,
  displayName,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {/* Avatar for assistant */}
      {!isUser && (
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: primaryColor }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className="max-w-[80%] space-y-2">
        {/* Message bubble */}
        <div
          className={`relative px-4 py-3 rounded-lg ${
            isUser ? 'rounded-br-sm' : 'rounded-bl-sm'
          }`}
          style={
            isUser
              ? { backgroundColor: primaryColor, color: 'white' }
              : { backgroundColor: 'white', border: '1px solid #E5E7EB' }
          }
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>

          {/* Gap indicator */}
          {message.gap_detected && (
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full"
              title="Gap detected"
            />
          )}
        </div>

        {/* Escalation button */}
        {message.escalation_offered && message.booking_url && (
          <a
            href={message.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primaryColor }}
          >
            <span>Book a Call</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
