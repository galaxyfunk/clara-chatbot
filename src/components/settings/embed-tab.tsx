'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface EmbedTabProps {
  workspaceId: string;
}

export function EmbedTab({ workspaceId }: EmbedTabProps) {
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const embedCode = `<script src="${baseUrl}/widget.js" data-workspace-id="${workspaceId}"></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div>
        <h3 className="text-lg font-medium text-ce-text">Embed Your Chatbot</h3>
        <p className="mt-1 text-sm text-ce-text-muted">
          Add the following script tag to your website to display the chat
          widget. Place it just before the closing{' '}
          <code className="px-1 py-0.5 bg-ce-muted rounded text-xs">
            &lt;/body&gt;
          </code>{' '}
          tag.
        </p>
      </div>

      {/* Embed code */}
      <div className="relative">
        <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
          <code>{embedCode}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Preview link */}
      <div className="p-4 bg-ce-muted rounded-lg">
        <h4 className="text-sm font-medium text-ce-text mb-2">
          Direct Chat Link
        </h4>
        <p className="text-sm text-ce-text-muted mb-3">
          You can also share a direct link to your chatbot:
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={`${baseUrl}/chat/${workspaceId}`}
            className="flex-1 px-3 py-2 bg-white border border-ce-border rounded-lg text-sm text-ce-text"
          />
          <a
            href={`/chat/${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-ce-teal rounded-lg hover:bg-ce-teal/90"
          >
            Open
            <ExternalLink className="w-4 h-4" />
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
