'use client';

import { useState, useRef, useEffect } from 'react';
import type { WorkspaceSettings } from '@/types/workspace';

// ============================================================
// DESIGN TOKENS — Cloud Employee brand colors (hardcoded)
// ============================================================
const CE = {
  navy: '#213D66',
  navyDark: '#1a2d4d',
  teal: '#2A7F7F',
  lime: '#C5E84D',
  white: '#FFFFFF',
  text: '#1a2332',
  textMuted: '#5a6577',
  gray300: '#c4cbd8',
  gray400: '#9aa3b4',
  gray600: '#4a5468',
  border: 'rgba(33, 61, 102, 0.1)',
};

const GLASS = {
  bg: 'rgba(255, 255, 255, 0.72)',
  bgSolid: 'rgba(255, 255, 255, 0.82)',
  blur: 'blur(40px) saturate(180%)',
  outerBorder: '1px solid rgba(255, 255, 255, 0.45)',
  chipBg: 'rgba(255, 255, 255, 0.55)',
  chipBgHover: 'rgba(42, 127, 127, 0.06)',
  chipBorder: 'rgba(33, 61, 102, 0.09)',
  chipBorderHover: 'rgba(42, 127, 127, 0.3)',
  inputBg: 'rgba(255, 255, 255, 0.6)',
  inputBorder: 'rgba(33, 61, 102, 0.1)',
};

// ============================================================
// TYPES
// ============================================================
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestion_chips?: string[];
  isStreaming?: boolean;
}

interface PanelChatProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

// ============================================================
// HELPERS
// ============================================================
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================
// PANEL CHAT COMPONENT
// ============================================================
export function PanelChat({ workspaceId, settings }: PanelChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionToken] = useState(() => generateId());
  const [showInitialChips, setShowInitialChips] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Send message to chat API with streaming
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || isStreaming) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setShowInitialChips(false);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          session_token: sessionToken,
          message: content.trim(),
          message_id: userMessage.id,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: errorData.error || 'Sorry, something went wrong. Please try again.',
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
        return;
      }

      // Create placeholder assistant message
      const assistantId = generateId();
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        suggestion_chips: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setIsStreaming(true);

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'token') {
              fullContent += data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                )
              );
            }

            if (data.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: fullContent,
                        suggestion_chips: data.suggestion_chips || [],
                        isStreaming: false,
                      }
                    : m
                )
              );
            }

            if (data.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: fullContent || 'Sorry, something went wrong. Please try again.',
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          } catch {
            // Malformed SSE line — skip
          }
        }
      }

      setIsStreaming(false);
    } catch {
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, I could not connect. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleChipClick = (chip: string) => {
    sendMessage(chip);
  };

  const handleClose = () => {
    window.parent.postMessage({ type: 'clara-close' }, '*');
  };

  // Get suggestion chips
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isStreaming);
  const bottomChips = showInitialChips && messages.length === 0
    ? settings.suggested_messages.slice(0, settings.max_suggestion_chips)
    : (lastAssistantMessage?.suggestion_chips || []).slice(0, settings.max_suggestion_chips);

  const isDisabled = isLoading || isStreaming;
  const hasInput = input.trim().length > 0;

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: GLASS.bg,
        backdropFilter: GLASS.blur,
        WebkitBackdropFilter: GLASS.blur,
        borderLeft: GLASS.outerBorder,
        position: 'relative',
      }}
    >
      {/* Gradient accent strip */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3px',
          background: `linear-gradient(180deg, ${CE.lime} 0%, ${CE.teal} 40%, ${CE.navy} 100%)`,
          zIndex: 1,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '18px 20px 16px',
          borderBottom: `1px solid ${CE.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: GLASS.bgSolid,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar */}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(33,61,102,0.15)',
              background: settings.avatar_url ? undefined : CE.navy,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {settings.avatar_url ? (
              <img
                src={settings.avatar_url}
                alt={settings.display_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={CE.white}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </div>
          <div>
            <div
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: CE.navy,
                letterSpacing: '-0.3px',
                lineHeight: 1.2,
              }}
            >
              {settings.display_name || 'Clara'}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: CE.teal,
                marginTop: '2px',
                letterSpacing: '0.2px',
              }}
            >
              Cloud Employee Assistant
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            color: CE.gray400,
            cursor: 'pointer',
            fontSize: '16px',
            borderRadius: '8px',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(33,61,102,0.06)';
            e.currentTarget.style.color = CE.gray600;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = CE.gray400;
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Welcome message */}
        <div
          style={{
            color: CE.textMuted,
            fontSize: '14px',
            lineHeight: 1.65,
          }}
        >
          {settings.welcome_message}
        </div>

        {/* Conversation messages */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: '14px 14px 4px 14px',
                    background: CE.navy,
                    color: CE.white,
                    fontSize: '14px',
                    lineHeight: 1.55,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              <div
                style={{
                  color: CE.textMuted,
                  fontSize: '14px',
                  lineHeight: 1.65,
                }}
              >
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div style={{ display: 'flex', gap: '5px', padding: '6px 0' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: CE.gray400,
                  animation: 'dotBounce 1.2s infinite',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom zone */}
      <div
        style={{
          borderTop: `1px solid ${CE.border}`,
          background: GLASS.bgSolid,
          padding: '12px 16px 16px',
          flexShrink: 0,
        }}
      >
        {/* Suggestion chips */}
        {bottomChips.length > 0 && !isDisabled && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              marginBottom: '10px',
            }}
          >
            {bottomChips.map((chip, i) => (
              <button
                key={`${chip}-${i}`}
                onClick={() => handleChipClick(chip)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: GLASS.chipBg,
                  border: `1px solid ${GLASS.chipBorder}`,
                  borderRadius: '10px',
                  color: CE.text,
                  fontSize: '13px',
                  lineHeight: 1.4,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = GLASS.chipBorderHover;
                  e.currentTarget.style.background = GLASS.chipBgHover;
                  e.currentTarget.style.transform = 'translateX(3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = GLASS.chipBorder;
                  e.currentTarget.style.background = GLASS.chipBg;
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span>{chip}</span>
                <span
                  style={{
                    color: CE.teal,
                    fontSize: '15px',
                    flexShrink: 0,
                  }}
                >
                  →
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              background: GLASS.inputBg,
              border: `1px solid ${GLASS.inputBorder}`,
              borderRadius: '12px',
              padding: '4px 4px 4px 14px',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={settings.placeholder_text || 'Ask a question...'}
              disabled={isDisabled}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: CE.text,
                fontSize: '14px',
                padding: '8px 0',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={!hasInput || isDisabled}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                background: hasInput ? CE.teal : 'rgba(33,61,102,0.06)',
                border: 'none',
                cursor: hasInput ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke={hasInput ? 'white' : CE.gray400}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </form>

        {/* Powered by footer */}
        {settings.powered_by_clara && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '9px',
              fontSize: '11px',
              color: CE.gray300,
              letterSpacing: '0.2px',
            }}
          >
            Powered by Clara
          </div>
        )}
      </div>

      {/* Keyframes for typing animation */}
      <style>{`
        @keyframes dotBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
