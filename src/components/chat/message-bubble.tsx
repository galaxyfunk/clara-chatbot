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
  headerTextColor: string;
  avatarUrl: string | null;
  displayName: string;
  isDarkBg: boolean;
}

export function MessageBubble({
  message,
  primaryColor,
  headerTextColor,
  avatarUrl,
  displayName,
  isDarkBg,
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
              ? { backgroundColor: primaryColor, color: headerTextColor }
              : {
                  backgroundColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'white',
                  border: isDarkBg ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E5E7EB',
                  color: isDarkBg ? '#e5e7eb' : '#1f2937',
                }
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
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primaryColor, color: headerTextColor }}
          >
            <span>Book a Call</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
