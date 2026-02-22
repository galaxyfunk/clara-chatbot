/**
 * Clara Chatbot Widget
 * Embed script for floating chat bubble + iframe overlay
 *
 * Usage:
 * <script src="https://your-domain.com/widget.js" data-workspace-id="YOUR_WORKSPACE_ID"></script>
 */
(function() {
  'use strict';

  // Get workspace ID from script tag
  const script = document.currentScript;
  const workspaceId = script.getAttribute('data-workspace-id');

  if (!workspaceId) {
    console.error('[Clara Widget] Missing data-workspace-id attribute');
    return;
  }

  // Get base URL from script src
  const scriptSrc = script.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));

  // Widget state
  let isOpen = false;
  let settings = null;
  let bubble = null;
  let overlay = null;
  let iframe = null;

  // Styles (injected into page)
  const styles = `
    .clara-widget-bubble {
      position: fixed;
      bottom: 20px;
      z-index: 99999;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: none;
      outline: none;
    }
    .clara-widget-bubble:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    .clara-widget-bubble.left {
      left: 20px;
    }
    .clara-widget-bubble.right {
      right: 20px;
    }
    .clara-widget-bubble svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    .clara-widget-bubble img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }
    .clara-widget-overlay {
      position: fixed;
      bottom: 100px;
      z-index: 99998;
      width: 380px;
      height: 550px;
      max-height: calc(100vh - 120px);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }
    .clara-widget-overlay.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .clara-widget-overlay.left {
      left: 20px;
    }
    .clara-widget-overlay.right {
      right: 20px;
    }
    .clara-widget-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .clara-widget-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.3);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
      z-index: 1;
    }
    .clara-widget-close:hover {
      background: rgba(0, 0, 0, 0.5);
    }
    .clara-widget-close svg {
      width: 14px;
      height: 14px;
      stroke: white;
      stroke-width: 2;
      fill: none;
    }

    /* Mobile styles */
    @media (max-width: 480px) {
      .clara-widget-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
      }
      .clara-widget-overlay.left,
      .clara-widget-overlay.right {
        left: 0;
        right: 0;
      }
      .clara-widget-close {
        top: 16px;
        right: 16px;
        width: 32px;
        height: 32px;
        background: rgba(0, 0, 0, 0.4);
      }
    }
  `;

  // SVG icons
  const chatIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const closeIcon = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  // Inject styles
  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.id = 'clara-widget-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Create bubble button
  function createBubble() {
    bubble = document.createElement('button');
    bubble.className = `clara-widget-bubble ${settings.bubble_position}`;
    bubble.style.backgroundColor = settings.bubble_color;
    bubble.setAttribute('aria-label', `Chat with ${settings.display_name}`);

    if (settings.chat_icon_url) {
      const img = document.createElement('img');
      img.src = settings.chat_icon_url;
      img.alt = settings.display_name;
      bubble.appendChild(img);
    } else {
      bubble.innerHTML = chatIcon;
    }

    bubble.addEventListener('click', toggleWidget);
    document.body.appendChild(bubble);
  }

  // Create overlay with iframe
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = `clara-widget-overlay ${settings.bubble_position}`;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'clara-widget-close';
    closeBtn.innerHTML = closeIcon;
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.addEventListener('click', closeWidget);
    overlay.appendChild(closeBtn);

    // Iframe
    iframe = document.createElement('iframe');
    iframe.className = 'clara-widget-iframe';
    iframe.src = `${baseUrl}/chat/${workspaceId}`;
    iframe.title = `Chat with ${settings.display_name}`;
    iframe.setAttribute('loading', 'lazy');
    overlay.appendChild(iframe);

    document.body.appendChild(overlay);
  }

  // Toggle widget open/close
  function toggleWidget() {
    if (isOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  // Open widget
  function openWidget() {
    if (!overlay) {
      createOverlay();
    }
    isOpen = true;
    overlay.classList.add('open');
    bubble.innerHTML = closeIcon;
    bubble.querySelector('svg').style.fill = 'none';
    bubble.querySelector('svg').style.stroke = 'white';
  }

  // Close widget
  function closeWidget() {
    isOpen = false;
    if (overlay) {
      overlay.classList.remove('open');
    }
    if (settings.chat_icon_url) {
      bubble.innerHTML = '';
      const img = document.createElement('img');
      img.src = settings.chat_icon_url;
      img.alt = settings.display_name;
      bubble.appendChild(img);
    } else {
      bubble.innerHTML = chatIcon;
    }
  }

  // Fetch workspace settings
  async function fetchSettings() {
    try {
      const response = await fetch(`${baseUrl}/api/workspace/public?workspace_id=${workspaceId}`);
      const data = await response.json();

      if (!data.success) {
        console.error('[Clara Widget] Failed to load settings:', data.error);
        return null;
      }

      return data.settings;
    } catch (error) {
      console.error('[Clara Widget] Failed to fetch settings:', error);
      return null;
    }
  }

  // Initialize widget
  async function init() {
    // Don't initialize if already loaded
    if (document.getElementById('clara-widget-styles')) {
      return;
    }

    settings = await fetchSettings();
    if (!settings) {
      return;
    }

    injectStyles();
    createBubble();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
