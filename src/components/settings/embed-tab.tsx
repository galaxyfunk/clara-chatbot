'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink, Code, MessageSquare, Link } from 'lucide-react';

interface EmbedTabProps {
  workspaceId: string;
}

type CopiedState = 'script' | 'iframe' | 'link' | null;

export function EmbedTab({ workspaceId }: EmbedTabProps) {
  const [copied, setCopied] = useState<CopiedState>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const scriptCode = `<script src="${baseUrl}/widget.js" data-workspace-id="${workspaceId}"></script>`;
  const iframeCode = `<iframe
  src="${baseUrl}/chat/${workspaceId}"
  width="400"
  height="600"
  style="border: none; border-radius: 12px;"
  title="Chat Widget"
></iframe>`;
  const directLink = `${baseUrl}/chat/${workspaceId}`;

  const handleCopy = async (text: string, type: CopiedState) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-ce-text">Embed Your Chatbot</h3>
        <p className="mt-1 text-sm text-ce-text-muted">
          Choose how you want to add the chatbot to your website.
        </p>
      </div>

      {/* Option 1: Floating Widget (Script Tag) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-ce-teal" />
          <h4 className="text-sm font-medium text-ce-text">
            Floating Chat Bubble (Recommended)
          </h4>
        </div>
        <p className="text-sm text-ce-text-muted">
          Adds a floating chat button to the corner of your website. Place this
          just before the closing{' '}
          <code className="px-1 py-0.5 bg-ce-muted rounded text-xs">
            &lt;/body&gt;
          </code>{' '}
          tag.
        </p>
        <div className="relative">
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
            <code>{scriptCode}</code>
          </pre>
          <button
            onClick={() => handleCopy(scriptCode, 'script')}
            className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied === 'script' ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Option 2: Iframe Embed */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-ce-teal" />
          <h4 className="text-sm font-medium text-ce-text">Iframe Embed</h4>
        </div>
        <p className="text-sm text-ce-text-muted">
          Embed the chat directly into a specific location on your page. Adjust
          the width and height to fit your design.
        </p>
        <div className="relative">
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm whitespace-pre-wrap">
            <code>{iframeCode}</code>
          </pre>
          <button
            onClick={() => handleCopy(iframeCode, 'iframe')}
            className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied === 'iframe' ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Option 3: Direct Link */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Link className="w-5 h-5 text-ce-teal" />
          <h4 className="text-sm font-medium text-ce-text">Direct Link</h4>
        </div>
        <p className="text-sm text-ce-text-muted">
          Share a direct link to your chatbot. Perfect for email signatures,
          social media, or QR codes.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={directLink}
            className="flex-1 px-3 py-2 bg-white border border-ce-border rounded-lg text-sm text-ce-text"
          />
          <button
            onClick={() => handleCopy(directLink, 'link')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-ce-navy rounded-lg hover:bg-ce-navy/90"
          >
            {copied === 'link' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Copy
          </button>
          <a
            href={`/chat/${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-ce-teal rounded-lg hover:bg-ce-teal/90"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </a>
        </div>
      </div>

      {/* Setup checklist */}
      <div className="p-4 border border-ce-border rounded-lg">
        <h4 className="text-sm font-medium text-ce-text mb-3">
          Before Embedding
        </h4>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-ce-text-muted">
            <span className="text-ce-teal mt-0.5">1.</span>
            <span>
              Add at least one Q&A pair to your knowledge base so your chatbot
              has content to work with.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-ce-text-muted">
            <span className="text-ce-teal mt-0.5">2.</span>
            <span>
              Configure an API key (OpenAI or Anthropic) in the API Keys tab.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-ce-text-muted">
            <span className="text-ce-teal mt-0.5">3.</span>
            <span>
              Test your chatbot in the Chat Playground to make sure it responds
              correctly.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-ce-text-muted">
            <span className="text-ce-teal mt-0.5">4.</span>
            <span>
              Customize the appearance in the Style tab to match your brand.
            </span>
          </li>
        </ul>
      </div>

      {/* Widget features */}
      <div className="p-4 border border-ce-border rounded-lg">
        <h4 className="text-sm font-medium text-ce-text mb-3">
          Widget Features
        </h4>
        <ul className="space-y-2 text-sm text-ce-text-muted">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-ce-teal rounded-full" />
            Floating chat bubble in corner of page
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-ce-teal rounded-full" />
            Expandable chat window with your branding
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-ce-teal rounded-full" />
            Mobile responsive design
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-ce-teal rounded-full" />
            Session persistence across page loads
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-ce-teal rounded-full" />
            Smart escalation to booking when needed
          </li>
        </ul>
      </div>
    </div>
  );
}
