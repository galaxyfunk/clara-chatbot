/**
 * Clara Chatbot Widget
 * Supports 3 layouts: classic, command_bar, side_whisper
 *
 * Usage:
 * <script src="https://your-domain.com/widget.js" data-workspace-id="YOUR_WORKSPACE_ID"></script>
 */
(function() {
  'use strict';

  // ── Config ──
  var SCRIPT = document.currentScript || document.querySelector('script[data-workspace-id]');
  if (!SCRIPT) return;
  var WORKSPACE_ID = SCRIPT.getAttribute('data-workspace-id');
  if (!WORKSPACE_ID) {
    console.error('[Clara Widget] Missing data-workspace-id attribute');
    return;
  }

  // Get base URL from script src
  var scriptSrc = SCRIPT.src;
  var BASE_URL = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));

  // ── State ──
  var settings = null;
  var isOpen = false;
  var intervalIds = [];
  var keyboardHandler = null;
  var triggerEl = null;
  var frameEl = null;
  var backdropEl = null;

  // ── Seeded sessions ──
  //
  // A host page can hand the widget a conversation that already exists, so the
  // visitor lands mid-thread instead of in an empty box. See ClaraWidget.open().
  //
  // Each layout registers how to apply a seed to itself, because the three have
  // nothing in common structurally: two build their own shadow DOM and own a
  // sessionToken variable, while classic delegates to a hosted iframe and can
  // only be seeded through its URL. `applySeed` is whichever one mounted.
  var applySeed = null;

  /** Classic only: the seed waiting to be written into the iframe URL. */
  var pendingFrameSeed = null;

  /** Normalises whatever a caller passed to open(). Returns null if unseeded. */
  function readSeed(opts) {
    if (!opts || typeof opts !== 'object') return null;
    var token = opts.sessionToken || opts.session_token;
    if (typeof token !== 'string' || !token) return null;
    return {
      sessionToken: token,
      greeting: typeof opts.greeting === 'string' ? opts.greeting : '',
      // Shown as a compact attachment chip. The document's TEXT never comes
      // through here: it is Clara's context, not thread content.
      filename: typeof opts.filename === 'string' ? opts.filename : ''
    };
  }

  /** Document glyph for the attachment chip, inline so it needs no fetch. */
  var ATTACHMENT_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/>' +
    '<path d="M14 3v5h5"/></svg>';

  /**
   * The attachment chip: a small "this file is attached" marker standing in for
   * the document, instead of dumping its text into the thread.
   *
   * Layout-agnostic and inline-styled, so the two shadow-DOM layouts can each
   * drop it in without sharing a stylesheet. Sits on the right, where the
   * visitor's own messages sit, because the upload was their action.
   */
  function buildAttachmentChip(filename) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:14px;';

    var chip = document.createElement('div');
    chip.setAttribute('role', 'note');
    chip.style.cssText =
      'display:inline-flex;align-items:center;gap:8px;max-width:85%;' +
      'padding:8px 12px;border-radius:10px;' +
      'border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.10);' +
      'font-size:13px;line-height:1.3;opacity:.9;';

    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'flex-shrink:0;display:flex;';
    icon.innerHTML = ATTACHMENT_ICON;

    var name = document.createElement('span');
    name.textContent = filename;
    // A long filename must not blow out the panel width.
    name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    chip.appendChild(icon);
    chip.appendChild(name);
    row.appendChild(chip);
    return row;
  }

  // ── Z-Index Constants ──
  var Z_TRIGGER = 2147483645;
  var Z_OVERLAY = 2147483646;

  // ── Helpers ──
  function isMobile() {
    return window.innerWidth < 768;
  }

  // ============================================================
  // SHARED UTILITIES (used by Side Whisper, Command Bar, future layouts)
  // ============================================================

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // Host-page analytics. Keyed to session_token so a seeded JD greeting
  // (which sets hasConversation without a visitor message) cannot count as a
  // conversation, and so "New chat" can fire again on the new token.
  var analyticsStartedTokens = {};
  var analyticsEmailTokens = {};

  function postClaraAnalytics(event, token) {
    if (!token) return;
    if (event === 'clara_conversation_started') {
      if (analyticsStartedTokens[token]) return;
      analyticsStartedTokens[token] = true;
    } else if (event === 'clara_email_captured') {
      if (analyticsEmailTokens[token]) return;
      analyticsEmailTokens[token] = true;
    } else {
      return;
    }
    var payload = {
      source: 'clara-widget',
      type: 'clara-analytics',
      event: event,
      session_token: token
    };
    var inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch (e) {
      inIframe = true;
    }
    if (inIframe) {
      window.parent.postMessage(payload, '*');
    } else {
      window.postMessage(payload, window.location.origin);
    }
  }

  // SSE Stream Handler (with line buffering for TCP chunk splits)
  async function handleSSEStream(response, callbacks) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    try {
      while (true) {
        var result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        // Keep the last element — it may be an incomplete line
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          try {
            var data = JSON.parse(line.slice(6));
            if (data.type === 'token' && callbacks.onToken) {
              callbacks.onToken(data.content);
            } else if (data.type === 'done' && callbacks.onDone) {
              callbacks.onDone(data);
            } else if (data.type === 'error' && callbacks.onError) {
              callbacks.onError(new Error(data.message || 'Stream error'));
            }
          } catch (e) { /* skip malformed JSON lines */ }
        }
      }
    } catch (err) {
      if (callbacks.onError) callbacks.onError(err);
    }
  }

  // Typing Dots Creator
  function createTypingDots() {
    var el = document.createElement('div');
    el.className = 'clara-typing';
    el.style.display = 'none';
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('div');
      dot.className = 'clara-dot';
      el.appendChild(dot);
    }
    return {
      element: el,
      show: function() { el.style.display = 'flex'; },
      hide: function() { el.style.display = 'none'; }
    };
  }

  function stripAssistantDisplayText(text) {
    return String(text || '')
      .replace(/\[(?:book\s+a\s+call|book\s+a\s+meeting|schedule\s+a\s+call|talk\s+to\s+(?:a\s+)?human)\](?:\([^)]*\))?/gi, '')
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/(?:\s*(?:here|below)):\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Render a booking URL as a clickable anchor appended to a container element.
  // Safe DOM construction — no innerHTML for user-facing content.
  function renderBookingLink(bookingUrl, containerEl) {
    if (!bookingUrl) return;
    var wrapper = document.createElement('div');
    wrapper.style.marginTop = '8px';
    var a = document.createElement('a');
    a.href = bookingUrl;
    a.textContent = 'Book a Call';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'display:inline-block;padding:6px 14px;border-radius:6px;background:#213D66;color:#fff;text-decoration:none;font-size:13px;font-weight:500;';
    wrapper.appendChild(a);
    containerEl.appendChild(wrapper);
  }

  function typeText(el, text, speed, callback) {
    var i = 0;
    el.textContent = '';
    var id = setInterval(function() {
      el.textContent = text.slice(0, i + 1);
      i++;
      if (i >= text.length) {
        clearInterval(id);
        if (callback) callback();
      }
    }, speed || 40);
    intervalIds.push(id);
    return id;
  }

  function rotateMessages(el, messages, interval) {
    if (!messages || messages.length === 0) return null;
    var idx = 0;
    function show() {
      typeText(el, messages[idx], 30);
      idx = (idx + 1) % messages.length;
    }
    show();
    var id = setInterval(show, interval || 5000);
    intervalIds.push(id);
    return id;
  }

  // ── SVG Icons ──
  var chatIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // ── Styles ──
  function injectStyles(s) {
    if (document.getElementById('clara-widget-styles')) return;

    var css = '\n' +
      '/* Clara Widget Base */\n' +
      '.clara-widget-trigger{position:fixed;z-index:' + Z_TRIGGER + ';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}\n' +
      '.clara-widget-backdrop{position:fixed;inset:0;z-index:' + Z_OVERLAY + ';background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.3s;pointer-events:none;}\n' +
      '.clara-widget-backdrop.open{opacity:1;pointer-events:auto;}\n' +
      '.clara-widget-frame{position:fixed;z-index:' + (Z_OVERLAY + 1) + ';background:#fff;overflow:hidden;opacity:0;transition:opacity 0.3s,transform 0.3s;pointer-events:none;}\n' +
      '.clara-widget-frame.open{opacity:1;pointer-events:auto;}\n' +
      '.clara-widget-frame iframe{width:100%;height:100%;border:none;}\n' +
      '.clara-widget-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.3);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1;}\n' +
      '.clara-widget-close:hover{background:rgba(0,0,0,0.5);}\n' +
      '.clara-widget-close svg{width:14px;height:14px;color:#fff;}\n' +

      '/* Classic Bubble */\n' +
      '.clara-trigger-classic{bottom:20px;width:60px;height:60px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;border:none;}\n' +
      '.clara-trigger-classic:hover{transform:scale(1.05);}\n' +
      '.clara-trigger-classic.left{left:20px;}\n' +
      '.clara-trigger-classic.right{right:20px;}\n' +
      '.clara-trigger-classic svg{width:28px;height:28px;color:#fff;}\n' +
      '.clara-trigger-classic img{width:32px;height:32px;border-radius:50%;object-fit:cover;}\n' +
      '.clara-frame-overlay{bottom:100px;width:380px;height:550px;max-height:calc(100vh - 120px);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.15);transform:translateY(20px) scale(0.95);}\n' +
      '.clara-frame-overlay.left{left:20px;}\n' +
      '.clara-frame-overlay.right{right:20px;}\n' +
      '.clara-frame-overlay.open{transform:translateY(0) scale(1);}\n' +

      '/* Command Bar */\n' +
      '.clara-trigger-command{bottom:16px;left:50%;transform:translateX(-50%);padding:10px 16px;background:rgba(255,255,255,0.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;display:flex;align-items:center;gap:8px;cursor:pointer;opacity:0;animation:claraFadeIn 0.4s ease 2.5s forwards;}\n' +
      '.clara-trigger-command .dot{width:8px;height:8px;border-radius:50%;animation:claraPulse 2s infinite;}\n' +
      '.clara-trigger-command .text{color:#888;font-size:13px;max-width:200px;overflow:hidden;white-space:nowrap;}\n' +
      '.clara-trigger-command .kbd{padding:2px 6px;background:rgba(255,255,255,0.08);border-radius:4px;font-size:10px;color:#555;font-family:monospace;}\n' +

      '/* Side Whisper */\n' +
      '.clara-trigger-whisper{top:50%;right:0;transform:translateY(-50%);width:38px;height:130px;border-radius:12px 0 0 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px 0;cursor:pointer;box-shadow:-2px 0 8px rgba(0,0,0,0.1);transition:width 0.2s ease,box-shadow 0.2s ease;opacity:0;animation:claraFadeIn 0.4s ease 1.5s forwards;}\n' +
      '.clara-trigger-whisper:hover{width:46px;box-shadow:-3px 0 16px rgba(0,0,0,0.15);}\n' +
      '.clara-trigger-whisper .whisper-icon{width:18px;height:18px;color:rgba(255,255,255,0.95);flex-shrink:0;}\n' +
      '.clara-trigger-whisper .whisper-text{writing-mode:vertical-rl;text-orientation:mixed;font-size:9px;font-weight:600;letter-spacing:1.2px;color:rgba(255,255,255,0.95);text-transform:uppercase;flex-shrink:0;}\n' +
      '.clara-trigger-whisper .whisper-dot{width:4px;height:4px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px #4ade80;flex-shrink:0;}\n' +
      '.clara-frame-panel{top:0;right:0;bottom:0;width:380px;border-radius:0;box-shadow:-4px 0 24px rgba(0,0,0,0.15);transform:translateX(100%);}\n' +
      '.clara-frame-panel.open{transform:translateX(0);}\n' +

      '/* Modal (command_bar) */\n' +
      '.clara-frame-modal{top:50%;left:50%;transform:translate(-50%,-50%) scale(0.95);width:90%;max-width:560px;height:70vh;max-height:600px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);}\n' +
      '.clara-frame-modal.open{transform:translate(-50%,-50%) scale(1);}\n' +

      '/* Mobile overrides */\n' +
      '@media(max-width:767px){\n' +
      '  .clara-widget-frame{top:0!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;border-radius:0!important;transform:none!important;}\n' +
      '  .clara-widget-frame.open{transform:none!important;}\n' +
      '  .clara-trigger-command{bottom:12px;width:90%;left:5%;transform:none;}\n' +
      '  .clara-trigger-whisper{width:34px;height:110px;}\n' +
      '  .clara-trigger-whisper .whisper-text{font-size:8px;}\n' +
      '}\n' +

      '/* Animations */\n' +
      '@keyframes claraFadeIn{from{opacity:0;}to{opacity:1;}}\n' +
      '@keyframes claraPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.6;transform:scale(1.2);}}\n' +
      '@keyframes claraGlow{0%,100%{opacity:0.5;}50%{opacity:1;}}\n';

    var styleEl = document.createElement('style');
    styleEl.id = 'clara-widget-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ── Frame Creators ──
  function createFrame(type) {
    // Backdrop (for modal)
    if (type === 'modal') {
      backdropEl = document.createElement('div');
      backdropEl.className = 'clara-widget-backdrop';
      backdropEl.addEventListener('click', closeChat);
      document.body.appendChild(backdropEl);
    }

    // Frame container
    frameEl = document.createElement('div');
    frameEl.id = 'clara-widget-frame';
    frameEl.className = 'clara-widget-frame ' + (
      type === 'overlay' ? 'clara-frame-overlay ' + (settings.bubble_position || 'right') :
      type === 'modal' ? 'clara-frame-modal' :
      type === 'panel' ? 'clara-frame-panel' : ''
    );

    // Close button — only for overlay/modal, not panel (panel-chat.tsx has its own)
    if (type !== 'panel') {
      var closeBtn = document.createElement('button');
      closeBtn.className = 'clara-widget-close';
      closeBtn.innerHTML = closeIcon;
      closeBtn.setAttribute('aria-label', 'Close chat');
      closeBtn.addEventListener('click', closeChat);
      frameEl.appendChild(closeBtn);
    }

    // Iframe — add mode param based on layout
    var iframe = document.createElement('iframe');
    var chatUrl = BASE_URL + '/chat/' + WORKSPACE_ID;
    if (type === 'panel') {
      chatUrl += '?mode=panel';
    } else if (type === 'modal') {
      chatUrl += '?mode=command';
    }
    // A seeded session reaches the hosted chat page through the URL: this layout
    // renders in an iframe we do not control the internals of, so there is no
    // DOM to paint into the way the shadow-DOM layouts have.
    if (pendingFrameSeed) {
      chatUrl += (chatUrl.indexOf('?') === -1 ? '?' : '&')
        + 'session=' + encodeURIComponent(pendingFrameSeed.sessionToken);
      if (pendingFrameSeed.greeting) {
        chatUrl += '&greeting=' + encodeURIComponent(pendingFrameSeed.greeting);
      }
      if (pendingFrameSeed.filename) {
        chatUrl += '&filename=' + encodeURIComponent(pendingFrameSeed.filename);
      }
      pendingFrameSeed = null;
    }

    iframe.src = chatUrl;
    iframe.title = 'Chat with ' + settings.display_name;
    iframe.setAttribute('loading', 'lazy');
    frameEl.appendChild(iframe);

    document.body.appendChild(frameEl);
  }

  function openChat(type) {
    if (isOpen) return;
    if (!frameEl) createFrame(type);
    isOpen = true;
    if (backdropEl) backdropEl.classList.add('open');
    frameEl.classList.add('open');
    // Update trigger state for classic
    if (triggerEl && settings.widget_layout === 'classic') {
      triggerEl.innerHTML = closeIcon;
      triggerEl.querySelector('svg').style.color = '#fff';
    }
  }

  function closeChat() {
    if (!isOpen) return;
    isOpen = false;
    if (frameEl) frameEl.classList.remove('open');
    if (backdropEl) backdropEl.classList.remove('open');
    // Restore classic trigger
    if (triggerEl && settings.widget_layout === 'classic') {
      if (settings.chat_icon_url) {
        triggerEl.innerHTML = '<img src="' + settings.chat_icon_url + '" alt="' + settings.display_name + '">';
      } else {
        triggerEl.innerHTML = chatIcon;
      }
    }
  }

  // ── Trigger Creators ──
  function createClassicTrigger(s) {
    triggerEl = document.createElement('button');
    triggerEl.id = 'clara-widget-trigger';
    triggerEl.className = 'clara-widget-trigger clara-trigger-classic ' + (s.bubble_position || 'right');
    triggerEl.style.backgroundColor = s.bubble_color || '#000';
    triggerEl.setAttribute('aria-label', 'Chat with ' + s.display_name);

    if (s.chat_icon_url) {
      triggerEl.innerHTML = '<img src="' + s.chat_icon_url + '" alt="' + s.display_name + '">';
    } else {
      triggerEl.innerHTML = chatIcon;
    }

    triggerEl.addEventListener('click', function() {
      if (isOpen) closeChat();
      else openChat('overlay');
    });

    document.body.appendChild(triggerEl);
  }

  function createCommandBarTrigger(s) {
    triggerEl = document.createElement('div');
    triggerEl.id = 'clara-widget-trigger';
    triggerEl.className = 'clara-widget-trigger clara-trigger-command';

    // Pulsing dot
    var dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.backgroundColor = s.primary_color;
    triggerEl.appendChild(dot);

    // Typewriter text
    var textEl = document.createElement('span');
    textEl.className = 'text';
    triggerEl.appendChild(textEl);

    var triggerText = s.trigger_text || 'Ask about our services...';
    setTimeout(function() {
      typeText(textEl, triggerText, 40);
    }, 2500);

    // Keyboard shortcut badge
    var kbd = document.createElement('span');
    kbd.className = 'kbd';
    kbd.textContent = navigator.platform.indexOf('Mac') > -1 ? '\u2318K' : 'Ctrl+K';
    triggerEl.appendChild(kbd);

    triggerEl.addEventListener('click', function() {
      if (isOpen) closeChat();
      else openChat(isMobile() ? 'overlay' : 'modal');
    });

    // Keyboard handler
    keyboardHandler = function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) closeChat();
        else openChat(isMobile() ? 'overlay' : 'modal');
      }
      if (e.key === 'Escape' && isOpen) {
        closeChat();
      }
    };
    document.addEventListener('keydown', keyboardHandler);

    document.body.appendChild(triggerEl);
  }

  function createSideWhisperTrigger(s) {
    triggerEl = document.createElement('div');
    triggerEl.id = 'clara-widget-trigger';
    triggerEl.className = 'clara-widget-trigger clara-trigger-whisper';
    triggerEl.style.backgroundColor = s.primary_color;

    // Chat bubble icon
    var iconEl = document.createElement('div');
    iconEl.className = 'whisper-icon';
    iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    triggerEl.appendChild(iconEl);

    // Vertical text - use first hint message or "ASK [NAME]"
    var textEl = document.createElement('span');
    textEl.className = 'whisper-text';
    var hints = s.hint_messages || [];
    var displayText = hints[0] || ('ASK ' + (s.display_name || 'CLARA').toUpperCase());
    textEl.textContent = displayText.toUpperCase();
    triggerEl.appendChild(textEl);

    // Rotate text if multiple hints
    if (hints.length > 1) {
      var hintIdx = 0;
      var hintInterval = setInterval(function() {
        hintIdx = (hintIdx + 1) % hints.length;
        textEl.textContent = hints[hintIdx].toUpperCase();
      }, 4000);
      intervalIds.push(hintInterval);
    }

    // Online dot with glow
    var dotEl = document.createElement('div');
    dotEl.className = 'whisper-dot';
    triggerEl.appendChild(dotEl);

    // Click handler
    triggerEl.addEventListener('click', function() {
      if (isOpen) closeChat();
      else openChat(isMobile() ? 'overlay' : 'panel');
    });

    // ESC to close
    keyboardHandler = function(e) {
      if (e.key === 'Escape' && isOpen) closeChat();
    };
    document.addEventListener('keydown', keyboardHandler);

    document.body.appendChild(triggerEl);
  }

  // ============================================================
  // LAYOUT: COMMAND BAR — Shadow DOM Spotlight Overlay
  // ============================================================

  function createCommandBar() {
    var s = settings;
    var sessionToken = generateUUID();
    var isSending = false;
    var hasConversation = false;

    // Fonts: @font-face declared in the main document applies inside the shadow root
    if (!document.getElementById('clara-fonts')) {
      var fontLink = document.createElement('link');
      fontLink.id = 'clara-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
      document.head.appendChild(fontLink);
    }

    // Create shadow DOM host
    var host = document.createElement('div');
    host.id = 'clara-shadow-host';
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });

    // Build avatar HTML once (used in header + assistant messages)
    var avatarHTML = s.avatar_url
      ? '<img src="' + s.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">'
      : '<img src="' + BASE_URL + '/clara-avatar.svg" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">';

    // Inject CSS
    var styleEl = document.createElement('style');
    styleEl.textContent = `
:host {
  --ce-panel:#0B1424;
  --ce-panel-2:#0d1729;
  --ce-border:#22314D;
  --ce-hairline:#16223A;
  --ce-inset:#101C31;
  --ce-inset-hover:#12203a;
  --ce-composer:#0E1A2E;
  --ce-composer-border:#2b3a56;
  --ce-user-bubble:#1B2A45;
  --ce-lime:#D4FF3C;
  --ce-lime-hover:#e6ff7a;
  --ce-ink:#060F1E;
  --ce-text:#E6ECF5;
  --ce-text-2:#B8C2D1;
  --ce-muted:#7F8CA0;
  --ce-placeholder:#5f6b7d;
  --ce-footer:#4b5567;
  --ce-scrim:rgba(4,8,15,.72);
  --ce-shadow-modal:0 32px 80px rgba(0,0,0,.62);
  --ce-shadow-pill:0 18px 44px rgba(0,0,0,.5);
  --ce-font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --ce-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
.cb-pill, .cb-modal { font-family: var(--ce-font); }

/* CLOSED STATE: launcher pill */
.cb-pill {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 12px 18px;
  min-width: 360px;
  background: var(--ce-panel);
  border: 1px solid var(--ce-border);
  border-radius: 999px;
  box-shadow: var(--ce-shadow-pill);
  cursor: pointer;
  white-space: nowrap;
  pointer-events: auto;
  transition: border-color .2s ease, transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s ease;
}
.cb-pill:hover {
  border-color: var(--ce-lime);
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 22px 52px rgba(0,0,0,.58);
}
.cb-pill.hidden { display: none; }
.cb-pill-icon { width: 22px; height: 22px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: block; }
.cb-pill-icon img, .cb-pill-icon svg { width: 100%; height: 100%; display: block; object-fit: cover; }
.cb-pill-body { display: flex; align-items: center; gap: 10px; flex: 1; }
.cb-pill-dot { position: relative; width: 6px; height: 6px; flex-shrink: 0; }
.cb-pill-dot-core { position: absolute; inset: 0; border-radius: 50%; background: var(--ce-lime); animation: cbPulseGlow 3s ease-in-out infinite; }
.cb-pill-dot-ring { position: absolute; inset: -3px; border-radius: 50%; background: var(--ce-lime); opacity: 0; animation: cbPulseRing 3s ease-in-out infinite; }
.cb-pill-text { font-size: 14.5px; font-weight: 400; color: var(--ce-muted); }
.cb-pill-divider { display: none; }
.cb-pill-kbd {
  padding: 5px 8px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--ce-border);
  font-family: var(--ce-mono);
  font-size: 11px;
  line-height: 1;
  color: var(--ce-placeholder);
}
@media (max-width: 768px) {
  .cb-pill { min-width: auto; width: calc(100vw - 32px); }
  .cb-pill-kbd { display: none; }
}
@keyframes cbPulseGlow { 0%,100% { opacity:.4; transform: scale(.85); } 50% { opacity:1; transform: scale(1); } }
@keyframes cbPulseRing { 0%,100% { opacity:0; transform: scale(.5); } 50% { opacity:.18; transform: scale(1.8); } }

/* SCRIM */
.cb-backdrop {
  position: fixed; inset: 0;
  background: var(--ce-scrim);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  pointer-events: auto;
  opacity: 0; visibility: hidden;
  transition: opacity .15s ease, visibility .15s ease;
}
.cb-backdrop.open { opacity: 1; visibility: visible; }

/* MODAL */
.cb-modal {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, calc(-50% + 10px)) scale(.985);
  width: 620px;
  max-width: calc(100vw - 32px);
  max-height: min(600px, calc(100vh - 64px));
  background: var(--ce-panel);
  border: 1px solid var(--ce-border);
  border-radius: 20px;
  box-shadow: var(--ce-shadow-modal);
  display: flex; flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  opacity: 0; visibility: hidden;
  transition: opacity .2s ease, visibility .2s ease, transform .22s cubic-bezier(.16,1,.3,1);
}
.cb-modal.open { opacity: 1; visibility: visible; transform: translate(-50%,-50%) scale(1); }
.cb-modal.compact  { height: auto; }
.cb-modal.expanded { height: 540px; }
.cb-modal::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--ce-lime) 0%, rgba(212,255,60,.15) 55%, rgba(212,255,60,0) 100%);
  z-index: 1;
}

/* HEADER */
.cb-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--ce-hairline);
  background: var(--ce-panel);
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
  border-radius: 20px 20px 0 0;
}
.cb-header-left { display: flex; align-items: center; gap: 12px; }
.cb-avatar { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; flex-shrink: 0; box-shadow: none; }
.cb-avatar img, .cb-avatar svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.cb-title    { font-size: 15.5px; font-weight: 600; letter-spacing: -.2px; color: #FFFFFF; }
.cb-subtitle { font-size: 13px; font-weight: 400; color: var(--ce-muted); margin-left: 10px; }
.cb-header-right { display: flex; align-items: center; gap: 8px; }
.cb-new-chat {
  display: none;
  background: transparent;
  border: 1px solid var(--ce-border);
  border-radius: 999px;
  padding: 7px 12px;
  font-family: var(--ce-font);
  font-size: 12px; font-weight: 500;
  color: var(--ce-text-2);
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}
.cb-new-chat.visible { display: inline-block; }
.cb-new-chat:hover { border-color: #32435F; color: #fff; background: transparent; }
.cb-close {
  background: transparent; border: none;
  color: var(--ce-muted);
  width: 28px; height: 28px;
  border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.cb-close:hover { background: var(--ce-hairline); color: #fff; }

/* BODY / SCROLL */
.cb-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; scrollbar-width: thin; scrollbar-color: var(--ce-border) transparent; }
.cb-body::-webkit-scrollbar { width: 8px; }
.cb-body::-webkit-scrollbar-thumb { background: var(--ce-border); border-radius: 8px; }
.cb-body::-webkit-scrollbar-track { background: transparent; }

/* WELCOME + SUGGESTIONS */
.cb-welcome-zone { padding: 20px 18px 4px; }
.cb-welcome-text {
  padding: 0 0 20px;
  color: var(--ce-text);
  font-size: 15.5px;
  line-height: 25px;
  white-space: pre-wrap;
  text-wrap: pretty;
}
.cb-suggestions-label {
  padding: 0 0 11px;
  font-family: var(--ce-mono);
  font-size: 10px; font-weight: 500;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--ce-muted);
}
.cb-suggestions-list { display: flex; flex-direction: column; gap: 9px; }
.cb-suggestion {
  width: 100%;
  text-align: left;
  display: flex; align-items: center; gap: 13px;
  padding: 14px 15px;
  background: var(--ce-inset);
  border: 1px solid var(--ce-border);
  border-radius: 13px;
  font-family: var(--ce-font);
  font-size: 14.5px; font-weight: 500; line-height: 1.3;
  color: var(--ce-text);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.cb-suggestion:hover { background: var(--ce-inset-hover); border-color: var(--ce-lime); }
.cb-suggestion-icon { width: 5px; height: 5px; border-radius: 50%; background: var(--ce-lime); flex-shrink: 0; opacity: 1; }
.cb-suggestion-text { flex: 1; }
.cb-suggestion-arrow { margin-left: auto; color: var(--ce-placeholder); font-size: 14px; }

/* MESSAGES */
.cb-messages { padding: 20px 18px 8px; display: flex; flex-direction: column; gap: 16px; }
.cb-msg-row { display: flex; align-items: flex-start; gap: 12px; animation: cbMsgIn .2s ease-out both; }
.cb-msg-row.user { justify-content: flex-end; }
@keyframes cbMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.cb-msg-avatar { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; overflow: hidden; margin-top: 0; }
.cb-msg-avatar img, .cb-msg-avatar svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.cb-msg-content { flex: 1; }
.cb-msg-text { font-size: 15.5px; line-height: 25px; text-wrap: pretty; }
.cb-msg-text.assistant { color: var(--ce-text); }
.cb-msg-text.user {
  display: inline-block;
  max-width: 100%;
  background: var(--ce-user-bubble);
  color: #FFFFFF;
  font-size: 15px; line-height: 23px;
  padding: 12px 17px;
  border-radius: 16px 16px 4px 16px;
  text-align: left;
}
.cb-typing { display: flex; align-items: center; gap: 5px; height: 26px; padding: 0; }
.cb-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ce-lime); animation: cbDotBounce 1.1s infinite; }
.cb-dot:nth-child(2) { animation-delay: .15s; }
.cb-dot:nth-child(3) { animation-delay: .3s; }
@keyframes cbDotBounce { 0%,60%,100% { transform: translateY(0); opacity: .25; } 30% { transform: translateY(-3px); opacity: 1; } }
.cb-typing-label {
  font-family: var(--ce-mono);
  font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
  color: var(--ce-placeholder);
  margin-left: 4px;
}

/* COMPOSER */
.cb-bottom { border-top: 1px solid var(--ce-hairline); background: var(--ce-panel); flex-shrink: 0; border-radius: 0 0 20px 20px; }
.cb-input-wrap { padding: 12px 18px 8px; }
.cb-input-bar {
  display: flex; align-items: center; gap: 10px;
  background: var(--ce-composer);
  border: 1px solid var(--ce-composer-border);
  border-radius: 16px;
  padding: 4px 6px 4px 16px;
  transition: border-color .15s ease;
}
.cb-input-bar:focus-within { border-color: #3a4c70; }
.cb-input {
  flex: 1; background: none; border: none; outline: none;
  font-family: var(--ce-font); font-size: 15px;
  color: #FFFFFF;
  padding: 12px 0;
}
.cb-input::placeholder { color: var(--ce-placeholder); }
.cb-send {
  width: 34px; height: 34px;
  border-radius: 999px; border: none;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background .2s ease;
}
.cb-send.active { background: var(--ce-lime); color: var(--ce-ink); cursor: pointer; }
.cb-send.active:hover { background: var(--ce-lime-hover); }
.cb-send.inactive { background: transparent; cursor: default; }
.cb-esc-badge { display: flex; gap: 4px; margin-right: 4px; }
.cb-esc-kbd {
  padding: 5px 8px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--ce-border);
  font-family: var(--ce-mono);
  font-size: 11px; line-height: 1;
  color: var(--ce-placeholder);
}
.cb-footer { padding: 11px 22px 14px; display: flex; justify-content: space-between; align-items: center; }
.cb-footer-powered {
  font-family: var(--ce-mono);
  font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase;
  color: var(--ce-footer);
}
.cb-footer-hint { font-size: 12px; color: var(--ce-footer); }

/* ERROR */
.cb-error {
  margin: 0 18px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255,107,107,.08);
  border: 1px solid rgba(255,107,107,.24);
  color: #FF8F8F;
  font-size: 13.5px; line-height: 1.5;
}

/* FOCUS */
.cb-pill:focus-visible, .cb-suggestion:focus-visible, .cb-new-chat:focus-visible,
.cb-close:focus-visible, .cb-send:focus-visible {
  outline: 2px solid var(--ce-lime);
  outline-offset: 2px;
}
/* The composer shows focus via the bar border, not an outline - see .cb-input-bar:focus-within */
.cb-input:focus, .cb-input:focus-visible { outline: none; }

/* REDUCED MOTION */
@media (prefers-reduced-motion: reduce) {
  .cb-modal, .cb-pill, .cb-msg-row { transition-duration: .01ms !important; animation: none !important; }
  .cb-modal.open { transform: translate(-50%,-50%) scale(1); }
  .cb-dot { animation: none; opacity: .6; }
}
`;
    shadow.appendChild(styleEl);

    // ── BUILD DOM ──

    // Pill trigger
    var pill = document.createElement('div');
    pill.className = 'cb-pill';
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');

    var pillIcon = document.createElement('span');
    pillIcon.className = 'cb-pill-icon';
    pillIcon.innerHTML = avatarHTML;
    pill.appendChild(pillIcon);

    var pillBody = document.createElement('div');
    pillBody.className = 'cb-pill-body';

    var pillDot = document.createElement('div');
    pillDot.className = 'cb-pill-dot';
    var pillDotCore = document.createElement('div');
    pillDotCore.className = 'cb-pill-dot-core';
    var pillDotRing = document.createElement('div');
    pillDotRing.className = 'cb-pill-dot-ring';
    pillDot.appendChild(pillDotCore);
    pillDot.appendChild(pillDotRing);
    pillBody.appendChild(pillDot);

    var pillText = document.createElement('span');
    pillText.className = 'cb-pill-text';
    pillText.textContent = s.trigger_text || 'Ask about our services...';
    pillBody.appendChild(pillText);

    pill.appendChild(pillBody);

    var pillDivider = document.createElement('div');
    pillDivider.className = 'cb-pill-divider';
    pill.appendChild(pillDivider);

    var pillKbd = document.createElement('kbd');
    pillKbd.className = 'cb-pill-kbd';
    pillKbd.textContent = navigator.platform.indexOf('Mac') > -1 ? '⌘K' : 'Ctrl+K';
    pill.appendChild(pillKbd);

    shadow.appendChild(pill);

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.className = 'cb-backdrop';
    shadow.appendChild(backdrop);

    // Modal
    var modal = document.createElement('div');
    modal.className = 'cb-modal compact';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Clara, Cloud Employee Assistant');

    // Header
    var header = document.createElement('div');
    header.className = 'cb-header';

    var headerLeft = document.createElement('div');
    headerLeft.className = 'cb-header-left';

    var headerAvatar = document.createElement('div');
    headerAvatar.className = 'cb-avatar';
    headerAvatar.innerHTML = avatarHTML;
    headerLeft.appendChild(headerAvatar);

    var headerTextWrap = document.createElement('div');
    var titleEl = document.createElement('span');
    titleEl.className = 'cb-title';
    titleEl.textContent = s.display_name || 'Clara';
    headerTextWrap.appendChild(titleEl);
    var subtitleEl = document.createElement('span');
    subtitleEl.className = 'cb-subtitle';
    subtitleEl.textContent = 'Cloud Employee Assistant';
    headerTextWrap.appendChild(subtitleEl);
    headerLeft.appendChild(headerTextWrap);

    header.appendChild(headerLeft);

    var headerRight = document.createElement('div');
    headerRight.className = 'cb-header-right';

    var newChatBtn = document.createElement('button');
    newChatBtn.className = 'cb-new-chat';
    newChatBtn.textContent = 'New chat';
    headerRight.appendChild(newChatBtn);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cb-close';
    closeBtn.textContent = '✕';
    headerRight.appendChild(closeBtn);

    header.appendChild(headerRight);
    modal.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'cb-body';

    // Welcome zone (pre-conversation)
    var welcomeZone = document.createElement('div');
    welcomeZone.className = 'cb-welcome-zone';

    var welcomeText = document.createElement('div');
    welcomeText.className = 'cb-welcome-text';
    welcomeText.textContent = s.welcome_message || 'Ask anything about ' + (s.display_name || 'our') + ' services.';
    welcomeZone.appendChild(welcomeText);

    var suggestionsLabel = document.createElement('div');
    suggestionsLabel.className = 'cb-suggestions-label';
    suggestionsLabel.textContent = 'Start here';
    welcomeZone.appendChild(suggestionsLabel);

    var suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'cb-suggestions-list';
    suggestionsContainer.style.marginBottom = '16px';

    var suggestions = (s.suggested_messages || []).filter(function(m) { return m.trim(); });
    if (suggestions.length > 0) {
      suggestions.forEach(function(text) {
        var btn = document.createElement('button');
        btn.className = 'cb-suggestion';
        btn.innerHTML =
          '<span class="cb-suggestion-icon"></span>' +
          '<span class="cb-suggestion-text">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
          '<span class="cb-suggestion-arrow">→</span>';
        btn.addEventListener('click', function() { sendMessage(text); });
        suggestionsContainer.appendChild(btn);
      });
    } else {
      suggestionsLabel.style.display = 'none';
      suggestionsContainer.style.display = 'none';
    }

    welcomeZone.appendChild(suggestionsContainer);

    body.appendChild(welcomeZone);

    // Messages container (hidden initially)
    var messagesContainer = document.createElement('div');
    messagesContainer.className = 'cb-messages';
    messagesContainer.setAttribute('aria-live', 'polite');
    messagesContainer.style.display = 'none';

    // Typing dots row
    var typingRow = document.createElement('div');
    typingRow.className = 'cb-msg-row';
    typingRow.style.display = 'none';

    var typingAvatar = document.createElement('div');
    typingAvatar.className = 'cb-msg-avatar';
    typingAvatar.innerHTML = avatarHTML;
    typingRow.appendChild(typingAvatar);

    var typingDots = document.createElement('div');
    typingDots.className = 'cb-typing';
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('div');
      dot.className = 'cb-dot';
      typingDots.appendChild(dot);
    }
    typingRow.appendChild(typingDots);

    var typingLabel = document.createElement('span');
    typingLabel.className = 'cb-typing-label';
    typingLabel.textContent = 'Clara is thinking';
    typingRow.appendChild(typingLabel);

    messagesContainer.appendChild(typingRow);

    body.appendChild(messagesContainer);
    modal.appendChild(body);

    // Bottom zone
    var bottomEl = document.createElement('div');
    bottomEl.className = 'cb-bottom';

    var inputWrap = document.createElement('div');
    inputWrap.className = 'cb-input-wrap';

    var inputBar = document.createElement('div');
    inputBar.className = 'cb-input-bar';

    var inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'cb-input';
    inputEl.placeholder = s.placeholder_text || 'Ask a question...';
    inputBar.appendChild(inputEl);

    var escBadge = document.createElement('div');
    escBadge.className = 'cb-esc-badge';
    var escKbd = document.createElement('kbd');
    escKbd.className = 'cb-esc-kbd';
    escKbd.textContent = 'esc';
    escBadge.appendChild(escKbd);
    inputBar.appendChild(escBadge);

    var sendBtn = document.createElement('button');
    sendBtn.className = 'cb-send inactive';
    sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    sendBtn.style.display = 'none';
    inputBar.appendChild(sendBtn);

    inputWrap.appendChild(inputBar);
    bottomEl.appendChild(inputWrap);

    // Footer
    var footerEl = document.createElement('div');
    footerEl.className = 'cb-footer';

    if (s.powered_by_clara) {
      var footerPowered = document.createElement('span');
      footerPowered.className = 'cb-footer-powered';
      footerPowered.textContent = 'Powered by Clara';
      footerEl.appendChild(footerPowered);
    } else {
      var spacer = document.createElement('span');
      footerEl.appendChild(spacer);
    }

    var footerHint = document.createElement('span');
    footerHint.className = 'cb-footer-hint';
    footerHint.textContent = '↵ ask';
    footerEl.appendChild(footerHint);

    bottomEl.appendChild(footerEl);
    modal.appendChild(bottomEl);

    shadow.appendChild(modal);

    // ── HELPER FUNCTIONS ──

    function scrollToBottom() {
      body.scrollTop = body.scrollHeight;
    }

    function showTyping() {
      typingRow.style.display = 'flex';
      typingRow.style.alignItems = 'center';
    }

    function hideTyping() {
      typingRow.style.display = 'none';
    }

    function disableInput() {
      inputEl.disabled = true;
    }

    function enableInput() {
      inputEl.disabled = false;
    }

    function focusInput() {
      inputEl.focus();
    }

    function updateFooterHint() {
      footerHint.textContent = hasConversation ? '↵ send' : '↵ ask';
    }

    function openModal() {
      pill.classList.add('hidden');
      backdrop.classList.add('open');
      modal.classList.add('open');
      setTimeout(function() { inputEl.focus(); }, 150);
    }

    function closeModal() {
      backdrop.classList.remove('open');
      modal.classList.remove('open');
      pill.classList.remove('hidden');
      pill.focus();
    }

    function resetChat() {
      messagesContainer.innerHTML = '';
      messagesContainer.appendChild(typingRow);
      welcomeZone.style.display = 'block';
      messagesContainer.style.display = 'none';
      modal.classList.remove('expanded');
      modal.classList.add('compact');
      newChatBtn.classList.remove('visible');
      hasConversation = false;
      sessionToken = generateUUID();
      inputEl.placeholder = s.placeholder_text || 'Ask a question...';
      updateFooterHint();
    }

    function addUserMessage(text) {
      var row = document.createElement('div');
      row.className = 'cb-msg-row user';

      var content = document.createElement('div');
      content.className = 'cb-msg-content';
      content.style.textAlign = 'right';
      var textEl = document.createElement('div');
      textEl.className = 'cb-msg-text user';
      textEl.textContent = text;
      content.appendChild(textEl);

      row.appendChild(content);
      messagesContainer.insertBefore(row, typingRow);
      scrollToBottom();
    }

    function addAssistantMessage(text) {
      var row = document.createElement('div');
      row.className = 'cb-msg-row';

      var avatar = document.createElement('div');
      avatar.className = 'cb-msg-avatar';
      avatar.innerHTML = avatarHTML;

      var content = document.createElement('div');
      content.className = 'cb-msg-content';
      var textEl = document.createElement('div');
      textEl.className = 'cb-msg-text assistant';
      textEl.textContent = text;
      content.appendChild(textEl);

      row.appendChild(avatar);
      row.appendChild(content);
      messagesContainer.insertBefore(row, typingRow);
      scrollToBottom();

      return { textEl: textEl, content: content };
    }

    function showErrorMessage(text) {
      var err = document.createElement('div');
      err.className = 'cb-error';
      err.textContent = text;
      messagesContainer.insertBefore(err, typingRow);
      scrollToBottom();
    }

    // ── SEND MESSAGE ──

    async function sendMessage(text) {
      if (!text.trim() || isSending) return;
      isSending = true;
      disableInput();
      postClaraAnalytics('clara_conversation_started', sessionToken);

      // First message: transition from compact to expanded
      if (!hasConversation) {
        hasConversation = true;
        welcomeZone.style.display = 'none';
        messagesContainer.style.display = 'flex';
        modal.classList.remove('compact');
        modal.classList.add('expanded');
        newChatBtn.classList.add('visible');
        inputEl.placeholder = 'Ask a follow-up...';
        updateFooterHint();
      }

      addUserMessage(text);
      inputEl.value = '';
      escBadge.style.display = 'flex';
      sendBtn.style.display = 'none';
      sendBtn.className = 'cb-send inactive';

      showTyping();
      scrollToBottom();

      try {
        var response = await fetch(BASE_URL + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: WORKSPACE_ID,
            session_token: sessionToken,
            message: text,
            message_id: generateUUID(),
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error('Chat request failed: ' + response.status);
        }

        hideTyping();
        var msgResult = addAssistantMessage('');
        var fullContent = '';

        await handleSSEStream(response, {
          onToken: function(content) {
            fullContent += content;
            msgResult.textEl.textContent = stripAssistantDisplayText(fullContent);
            scrollToBottom();
          },
          onDone: function(data) {
            msgResult.textEl.textContent = stripAssistantDisplayText(fullContent);
            if (data.booking_url) {
              renderBookingLink(data.booking_url, msgResult.content);
            }
            if (data.email_captured) {
              postClaraAnalytics('clara_email_captured', sessionToken);
            }
            scrollToBottom();
          },
          onError: function(err) {
            console.error('Clara stream error:', err);
            showErrorMessage('Something went wrong. Please try again.');
            hideTyping();
          }
        });
      } catch (err) {
        console.error('Clara chat error:', err);
        hideTyping();
        showErrorMessage('Could not connect. Please try again.');
      } finally {
        isSending = false;
        enableInput();
        focusInput();
      }
    }

    // ── EVENT LISTENERS ──

    // Input: toggle esc badge vs send button
    inputEl.addEventListener('input', function() {
      if (inputEl.value.trim()) {
        escBadge.style.display = 'none';
        sendBtn.style.display = 'flex';
        sendBtn.className = 'cb-send active';
      } else {
        escBadge.style.display = 'flex';
        sendBtn.style.display = 'none';
        sendBtn.className = 'cb-send inactive';
      }
    });

    // Enter key sends
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        sendMessage(inputEl.value.trim());
      }
    });

    // Send button click
    sendBtn.addEventListener('click', function() {
      if (inputEl.value.trim()) sendMessage(inputEl.value.trim());
    });

    // Pill click / Enter / Space opens modal
    pill.addEventListener('click', function() { openModal(); });
    pill.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal();
      }
    });

    // Backdrop click closes modal
    backdrop.addEventListener('click', function() { closeModal(); });

    // Close button click
    closeBtn.addEventListener('click', function() { closeModal(); });

    // New chat button
    newChatBtn.addEventListener('click', function() { resetChat(); });

    // ⌘K / Ctrl+K toggle + Escape close (document-level, named for cleanup)
    var keydownHandler = function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (modal.classList.contains('open')) closeModal();
        else openModal();
      }
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    };
    document.addEventListener('keydown', keydownHandler);

    // ── SEEDING ──
    //
    // Adopt a session created elsewhere (the JD upload on the hiring pages) and
    // paint its opening turn, so the modal opens expanded and already in
    // conversation rather than showing the welcome zone and suggestions.
    applySeed = function(seed) {
      sessionToken = seed.sessionToken;
      hasConversation = true;
      welcomeZone.style.display = 'none';
      messagesContainer.style.display = 'block';
      modal.classList.remove('compact');
      modal.classList.add('expanded');
      newChatBtn.classList.add('visible');
      // Chip first: it is what the visitor did, and the greeting answers it.
      if (seed.filename) {
        messagesContainer.insertBefore(buildAttachmentChip(seed.filename), typingRow);
      }
      if (seed.greeting) addAssistantMessage(seed.greeting);
    };

    // ── WINDOW.CLARAWIDGET API ──

    window.ClaraWidget = {
      // open() with no argument behaves exactly as it always has. Every existing
      // CTA on the site calls it that way and none of them may change.
      open: function(opts) {
        var seed = readSeed(opts);
        if (seed) applySeed(seed);
        openModal();
      },
      close: function() { closeModal(); },
      destroy: function() {
        applySeed = null;
        document.removeEventListener('keydown', keydownHandler);
        if (host && host.parentNode) host.parentNode.removeChild(host);
        settings = null;
        isOpen = false;
      }
    };
  }

  // ============================================================
  // LAYOUT: SIDE WHISPER — Shadow DOM Injection
  // ============================================================

  function createSideWhisper() {
    var s = settings;
    var sessionToken = generateUUID();
    var isSending = false;

    // Create shadow DOM host
    var host = document.createElement('div');
    host.id = 'clara-shadow-host';
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });

    // Inject CSS
    var styleEl = document.createElement('style');
    styleEl.textContent = '\n' +
      ':host {\n' +
      '  --ce-navy: #213D66;\n' +
      '  --ce-teal: #2A7F7F;\n' +
      '  --ce-lime: #C5E84D;\n' +
      '  --ce-white: #FFFFFF;\n' +
      '  --ce-offwhite: #f8f9fb;\n' +
      '  --ce-gray50: #f5f7fa;\n' +
      '  --ce-gray100: #eef1f5;\n' +
      '  --ce-gray200: #dde2ea;\n' +
      '  --ce-gray300: #c4cbd8;\n' +
      '  --ce-gray400: #9aa3b4;\n' +
      '  --ce-gray500: #6b7588;\n' +
      '  --ce-gray600: #4a5468;\n' +
      '  --ce-text: #1a2332;\n' +
      '  --ce-text-muted: #5a6577;\n' +
      '  --ce-border: rgba(33, 61, 102, 0.1);\n' +
      '  --glass-bg: rgba(255, 255, 255, 0.72);\n' +
      '  --glass-bg-solid: rgba(255, 255, 255, 0.82);\n' +
      '  --glass-blur: blur(40px) saturate(180%);\n' +
      '  --glass-outer-border: 1px solid rgba(255, 255, 255, 0.45);\n' +
      '  --glass-shadow: -12px 0 60px rgba(33,61,102,0.1), -1px 0 0 rgba(255,255,255,0.3);\n' +
      '  --glass-input-bg: rgba(255, 255, 255, 0.6);\n' +
      '  --glass-input-border: rgba(33, 61, 102, 0.1);\n' +
      '}\n' +
      '.clara-panel {\n' +
      '  position: fixed;\n' +
      '  right: 0;\n' +
      '  top: 0;\n' +
      '  height: 100vh;\n' +
      '  width: 400px;\n' +
      '  max-width: 100vw;\n' +
      '  background: var(--glass-bg);\n' +
      '  backdrop-filter: var(--glass-blur);\n' +
      '  -webkit-backdrop-filter: var(--glass-blur);\n' +
      '  border-left: var(--glass-outer-border);\n' +
      '  box-shadow: none;\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  transform: translateX(100%);\n' +
      '  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;\n' +
      '  pointer-events: auto;\n' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;\n' +
      '}\n' +
      '.clara-panel.open {\n' +
      '  transform: translateX(0);\n' +
      '  box-shadow: var(--glass-shadow);\n' +
      '}\n' +
      '.clara-panel::before {\n' +
      '  content: \'\';\n' +
      '  position: absolute;\n' +
      '  left: 0;\n' +
      '  top: 0;\n' +
      '  bottom: 0;\n' +
      '  width: 3px;\n' +
      '  background: linear-gradient(180deg, var(--ce-lime) 0%, var(--ce-teal) 40%, var(--ce-navy) 100%);\n' +
      '  z-index: 1;\n' +
      '}\n' +
      '.clara-header {\n' +
      '  padding: 18px 20px 16px;\n' +
      '  border-bottom: 1px solid var(--ce-border);\n' +
      '  display: flex;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '  background: var(--glass-bg-solid);\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.clara-header-left {\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 12px;\n' +
      '}\n' +
      '.clara-avatar {\n' +
      '  width: 40px;\n' +
      '  height: 40px;\n' +
      '  border-radius: 50%;\n' +
      '  overflow: hidden;\n' +
      '  flex-shrink: 0;\n' +
      '  box-shadow: 0 2px 8px rgba(33,61,102,0.15);\n' +
      '}\n' +
      '.clara-avatar img {\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '  object-fit: cover;\n' +
      '  display: block;\n' +
      '}\n' +
      '.clara-avatar svg {\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '}\n' +
      '.clara-title {\n' +
      '  font-size: 17px;\n' +
      '  font-weight: 700;\n' +
      '  color: var(--ce-navy);\n' +
      '  letter-spacing: -0.3px;\n' +
      '  line-height: 1.2;\n' +
      '}\n' +
      '.clara-subtitle {\n' +
      '  font-size: 12px;\n' +
      '  font-weight: 600;\n' +
      '  color: var(--ce-teal);\n' +
      '  margin-top: 2px;\n' +
      '  letter-spacing: 0.2px;\n' +
      '}\n' +
      '.clara-close {\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  color: var(--ce-gray400);\n' +
      '  cursor: pointer;\n' +
      '  font-size: 16px;\n' +
      '  border-radius: 8px;\n' +
      '  width: 30px;\n' +
      '  height: 30px;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: all 0.15s ease;\n' +
      '}\n' +
      '.clara-close:hover {\n' +
      '  background: rgba(33,61,102,0.06);\n' +
      '  color: var(--ce-gray600);\n' +
      '}\n' +
      '.clara-messages {\n' +
      '  flex: 1;\n' +
      '  overflow-y: auto;\n' +
      '  padding: 20px;\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  gap: 16px;\n' +
      '}\n' +
      '.clara-welcome {\n' +
      '  color: var(--ce-text-muted);\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.65;\n' +
      '  white-space: pre-wrap;\n' +
      '}\n' +
      '.clara-suggestions {\n' +
      '  display: flex;\n' +
      '  flex-wrap: wrap;\n' +
      '  gap: 8px;\n' +
      '}\n' +
      '.clara-suggestion-btn {\n' +
      '  padding: 6px 14px;\n' +
      '  border-radius: 999px;\n' +
      '  border: 1px solid var(--ce-teal);\n' +
      '  background: transparent;\n' +
      '  color: var(--ce-teal);\n' +
      '  font-size: 13px;\n' +
      '  line-height: 1.4;\n' +
      '  cursor: pointer;\n' +
      '  font-family: inherit;\n' +
      '  transition: background 0.15s ease;\n' +
      '}\n' +
      '.clara-suggestion-btn:hover {\n' +
      '  background: rgba(42, 127, 127, 0.06);\n' +
      '}\n' +
      '.clara-msg-user {\n' +
      '  display: flex;\n' +
      '  justify-content: flex-end;\n' +
      '}\n' +
      '.clara-msg-user-bubble {\n' +
      '  max-width: 85%;\n' +
      '  padding: 10px 14px;\n' +
      '  border-radius: 14px 14px 4px 14px;\n' +
      '  background: var(--ce-navy);\n' +
      '  color: var(--ce-white);\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.55;\n' +
      '}\n' +
      '.clara-msg-assistant {\n' +
      '  color: var(--ce-text-muted);\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.65;\n' +
      '}\n' +
      '.clara-typing {\n' +
      '  display: flex;\n' +
      '  gap: 5px;\n' +
      '  padding: 6px 0;\n' +
      '}\n' +
      '.clara-dot {\n' +
      '  width: 6px;\n' +
      '  height: 6px;\n' +
      '  border-radius: 50%;\n' +
      '  background: var(--ce-gray400);\n' +
      '  animation: claraDotBounce 1.2s infinite;\n' +
      '}\n' +
      '.clara-dot:nth-child(2) { animation-delay: 0.15s; }\n' +
      '.clara-dot:nth-child(3) { animation-delay: 0.3s; }\n' +
      '@keyframes claraDotBounce {\n' +
      '  0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }\n' +
      '  30% { transform: translateY(-5px); opacity: 1; }\n' +
      '}\n' +
      '.clara-bottom {\n' +
      '  border-top: 1px solid var(--ce-border);\n' +
      '  background: var(--glass-bg-solid);\n' +
      '  padding: 12px 16px 16px;\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.clara-input-bar {\n' +
      '  display: flex;\n' +
      '  gap: 8px;\n' +
      '  align-items: center;\n' +
      '  background: var(--glass-input-bg);\n' +
      '  border: 1px solid var(--glass-input-border);\n' +
      '  border-radius: 12px;\n' +
      '  padding: 4px 4px 4px 14px;\n' +
      '}\n' +
      '.clara-input {\n' +
      '  flex: 1;\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  outline: none;\n' +
      '  color: var(--ce-text);\n' +
      '  font-size: 14px;\n' +
      '  padding: 8px 0;\n' +
      '  font-family: inherit;\n' +
      '}\n' +
      '.clara-input::placeholder {\n' +
      '  color: var(--ce-gray400);\n' +
      '}\n' +
      '.clara-send {\n' +
      '  width: 36px;\n' +
      '  height: 36px;\n' +
      '  border-radius: 9px;\n' +
      '  border: none;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: all 0.2s ease;\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.clara-send.active {\n' +
      '  background: var(--ce-teal);\n' +
      '  cursor: pointer;\n' +
      '}\n' +
      '.clara-send.inactive {\n' +
      '  background: rgba(33,61,102,0.06);\n' +
      '  cursor: default;\n' +
      '}\n' +
      '.clara-footer {\n' +
      '  text-align: center;\n' +
      '  margin-top: 9px;\n' +
      '  font-size: 11px;\n' +
      '  color: var(--ce-gray300);\n' +
      '  letter-spacing: 0.2px;\n' +
      '}\n' +
      '.clara-trigger {\n' +
      '  position: fixed;\n' +
      '  right: 0;\n' +
      '  bottom: 120px;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 9px;\n' +
      '  padding: 11px 18px 11px 14px;\n' +
      '  background: rgba(255,255,255,0.85);\n' +
      '  backdrop-filter: blur(20px);\n' +
      '  -webkit-backdrop-filter: blur(20px);\n' +
      '  border-radius: 14px 0 0 14px;\n' +
      '  border: 1px solid rgba(255,255,255,0.5);\n' +
      '  border-right: none;\n' +
      '  box-shadow: 0 4px 24px rgba(33,61,102,0.1), inset 0 1px 0 rgba(255,255,255,0.8);\n' +
      '  cursor: pointer;\n' +
      '  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n' +
      '  pointer-events: auto;\n' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;\n' +
      '}\n' +
      '.clara-trigger:hover {\n' +
      '  padding-right: 24px;\n' +
      '  box-shadow: 0 6px 32px rgba(33,61,102,0.14), inset 0 1px 0 rgba(255,255,255,0.8);\n' +
      '}\n' +
      '.clara-trigger.hidden { display: none; }\n' +
      '.clara-trigger-dot {\n' +
      '  width: 8px;\n' +
      '  height: 8px;\n' +
      '  border-radius: 50%;\n' +
      '  background: var(--ce-teal);\n' +
      '  box-shadow: 0 0 8px rgba(42,127,127,0.4);\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.clara-trigger-text {\n' +
      '  font-size: 13px;\n' +
      '  font-weight: 600;\n' +
      '  color: var(--ce-navy);\n' +
      '  white-space: nowrap;\n' +
      '}\n' +
      '.clara-error {\n' +
      '  color: #c0392b;\n' +
      '  font-size: 13px;\n' +
      '  padding: 8px 12px;\n' +
      '  background: rgba(192,57,43,0.08);\n' +
      '  border-radius: 8px;\n' +
      '  line-height: 1.5;\n' +
      '}\n';
    shadow.appendChild(styleEl);

    // Build DOM structure
    // Panel
    var panel = document.createElement('div');
    panel.className = 'clara-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'clara-header';

    var headerLeft = document.createElement('div');
    headerLeft.className = 'clara-header-left';

    var avatar = document.createElement('div');
    avatar.className = 'clara-avatar';
    if (s.avatar_url) {
      var avatarImg = document.createElement('img');
      avatarImg.src = s.avatar_url;
      avatarImg.alt = s.display_name || 'Clara';
      avatar.appendChild(avatarImg);
    } else {
      avatar.innerHTML = '<svg viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="#213D66"/><path d="M30 50c0-8.5 6-15 14-15 5 0 9 2.5 11.5 6.5" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M70 50c0 8.5-6 15-14 15-5 0-9-2.5-11.5-6.5" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M44 43c3-2 7-2 10 0 4 2.5 6 7 6 12" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M56 57c-3 2-7 2-10 0-4-2.5-6-7-6-12" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/></svg>';
    }
    headerLeft.appendChild(avatar);

    var textWrapper = document.createElement('div');
    var titleEl = document.createElement('div');
    titleEl.className = 'clara-title';
    titleEl.textContent = s.display_name || 'Clara';
    var subtitleEl = document.createElement('div');
    subtitleEl.className = 'clara-subtitle';
    subtitleEl.textContent = 'Cloud Employee Assistant';
    textWrapper.appendChild(titleEl);
    textWrapper.appendChild(subtitleEl);
    headerLeft.appendChild(textWrapper);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'clara-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closePanel);

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Messages area
    var messagesEl = document.createElement('div');
    messagesEl.className = 'clara-messages';

    var welcomeEl = document.createElement('div');
    welcomeEl.className = 'clara-welcome';
    welcomeEl.textContent = s.welcome_message || 'Hi! How can I help you today?';
    messagesEl.appendChild(welcomeEl);

    // Suggested message chips
    var suggestionsWrap = null;
    var panelSuggestions = (s.suggested_messages || []).filter(function(m) { return m.trim(); });
    if (panelSuggestions.length > 0) {
      suggestionsWrap = document.createElement('div');
      suggestionsWrap.className = 'clara-suggestions';
      panelSuggestions.forEach(function(text) {
        var btn = document.createElement('button');
        btn.className = 'clara-suggestion-btn';
        btn.textContent = text;
        btn.addEventListener('click', function() { sendMessage(text); });
        suggestionsWrap.appendChild(btn);
      });
      messagesEl.appendChild(suggestionsWrap);
    }

    var typingDots = createTypingDots();
    messagesEl.appendChild(typingDots.element);

    panel.appendChild(messagesEl);

    // Bottom zone
    var bottomEl = document.createElement('div');
    bottomEl.className = 'clara-bottom';

    // Input bar
    var inputBar = document.createElement('div');
    inputBar.className = 'clara-input-bar';

    var inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'clara-input';
    inputEl.placeholder = s.placeholder_text || 'Type your message...';

    var sendBtn = document.createElement('button');
    sendBtn.className = 'clara-send inactive';
    sendBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

    inputBar.appendChild(inputEl);
    inputBar.appendChild(sendBtn);
    bottomEl.appendChild(inputBar);

    // Powered by footer
    if (s.powered_by_clara) {
      var footerEl = document.createElement('div');
      footerEl.className = 'clara-footer';
      footerEl.textContent = 'Powered by Clara';
      bottomEl.appendChild(footerEl);
    }

    panel.appendChild(bottomEl);
    shadow.appendChild(panel);

    // Trigger tab
    var trigger = document.createElement('div');
    trigger.className = 'clara-trigger';

    var triggerDot = document.createElement('div');
    triggerDot.className = 'clara-trigger-dot';

    var triggerText = document.createElement('span');
    triggerText.className = 'clara-trigger-text';
    triggerText.textContent = 'Ask ' + (s.display_name || 'Clara');

    trigger.appendChild(triggerDot);
    trigger.appendChild(triggerText);
    trigger.addEventListener('click', openPanel);
    shadow.appendChild(trigger);

    // Helper functions
    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function updateSendButton() {
      var hasInput = inputEl.value.trim().length > 0;
      sendBtn.className = 'clara-send ' + (hasInput ? 'active' : 'inactive');
      sendBtn.style.color = hasInput ? 'white' : 'var(--ce-gray400)';
    }

    function disableInput() {
      inputEl.disabled = true;
      sendBtn.disabled = true;
    }

    function enableInput() {
      inputEl.disabled = false;
      sendBtn.disabled = false;
    }

    function focusInput() {
      inputEl.focus();
    }

    function addUserBubble(text) {
      var wrapper = document.createElement('div');
      wrapper.className = 'clara-msg-user';
      var bubble = document.createElement('div');
      bubble.className = 'clara-msg-user-bubble';
      bubble.textContent = text;
      wrapper.appendChild(bubble);
      messagesEl.insertBefore(wrapper, typingDots.element);
    }

    function addAssistantBubble(text) {
      var el = document.createElement('div');
      el.className = 'clara-msg-assistant';
      el.textContent = text;
      messagesEl.insertBefore(el, typingDots.element);
      return el;
    }

    function showErrorMessage(text) {
      var el = document.createElement('div');
      el.className = 'clara-error';
      el.textContent = text;
      messagesEl.insertBefore(el, typingDots.element);
      scrollToBottom();
    }

    // Send message with streaming
    async function sendMessage(text) {
      if (!text.trim() || isSending) return;
      isSending = true;
      disableInput();
      postClaraAnalytics('clara_conversation_started', sessionToken);
      inputEl.value = '';
      updateSendButton();

      // Hide suggestion chips on first message
      if (suggestionsWrap) {
        suggestionsWrap.style.display = 'none';
        suggestionsWrap = null;
      }

      addUserBubble(text);
      typingDots.show();
      scrollToBottom();

      try {
        var response = await fetch(BASE_URL + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: WORKSPACE_ID,
            session_token: sessionToken,
            message: text,
            message_id: generateUUID(),
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error('Chat request failed: ' + response.status);
        }

        var assistantEl = addAssistantBubble('');
        typingDots.hide();
        var fullContent = '';

        await handleSSEStream(response, {
          onToken: function(content) {
            fullContent += content;
            assistantEl.textContent = stripAssistantDisplayText(fullContent);
            scrollToBottom();
          },
          onDone: function(data) {
            assistantEl.textContent = stripAssistantDisplayText(fullContent);
            if (data.booking_url) {
              renderBookingLink(data.booking_url, assistantEl);
            }
            if (data.email_captured) {
              postClaraAnalytics('clara_email_captured', sessionToken);
            }
            scrollToBottom();
          },
          onError: function(err) {
            console.error('Clara stream error:', err);
            showErrorMessage('Something went wrong. Please try again.');
            typingDots.hide();
          }
        });
      } catch (err) {
        console.error('Clara chat error:', err);
        typingDots.hide();
        showErrorMessage('Could not connect. Please try again.');
      } finally {
        isSending = false;
        enableInput();
        focusInput();
      }
    }

    // Panel open/close
    function openPanel() {
      panel.classList.add('open');
      trigger.classList.add('hidden');
      isOpen = true;
      setTimeout(function() { inputEl.focus(); }, 400);
    }

    function closePanel() {
      panel.classList.remove('open');
      trigger.classList.remove('hidden');
      isOpen = false;
    }

    // Event listeners
    inputEl.addEventListener('input', updateSendButton);

    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputEl.value.trim() && !isSending) {
          sendMessage(inputEl.value.trim());
        }
      }
    });

    sendBtn.addEventListener('click', function() {
      if (inputEl.value.trim() && !isSending) {
        sendMessage(inputEl.value.trim());
      }
    });

    // ESC to close
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    });

    // Click outside to close
    shadow.addEventListener('click', function(e) {
      if (!panel.contains(e.target) && !trigger.contains(e.target) && panel.classList.contains('open')) {
        closePanel();
      }
    });

    // ── SEEDING ── see the matching block in createCommandBar.
    applySeed = function(seed) {
      sessionToken = seed.sessionToken;
      if (welcomeEl && welcomeEl.parentNode) welcomeEl.style.display = 'none';
      if (seed.filename) {
        messagesEl.insertBefore(buildAttachmentChip(seed.filename), typingDots.element);
      }
      if (seed.greeting) addAssistantBubble(seed.greeting);
      scrollToBottom();
    };

    // Update window.ClaraWidget API
    window.ClaraWidget = {
      // Unseeded open() is unchanged. See createCommandBar.
      open: function(opts) {
        var seed = readSeed(opts);
        if (seed) applySeed(seed);
        openPanel();
      },
      close: function() { closePanel(); },
      destroy: function() {
        applySeed = null;
        if (host && host.parentNode) host.parentNode.removeChild(host);
        settings = null;
        isOpen = false;
      }
    };
  }

  // ── Fetch Settings ──
  //
  // One retry, after a short pause. Until 9 Sep 2026 a single failed fetch
  // meant the widget never mounted for that page view and never tried again;
  // the host site's "Ask our AI anything" CTAs then fell through to their
  // booking-page fallback with no error visible anywhere. The failures that
  // prompted this were brief database blips lasting a few seconds, which is
  // exactly what one retry after a pause covers. A genuine 404 (no such
  // workspace) is not retried: it will not change.
  var SETTINGS_RETRY_DELAY_MS = 1500;

  function fetchSettingsOnce(id) {
    return fetch(BASE_URL + '/api/workspace/public?workspace_id=' + id)
      .then(function(res) {
        return res.json().then(function(data) {
          if (!data.success) {
            console.error('[Clara Widget] Failed to load settings:', data.error);
            return { settings: null, retryable: res.status !== 404 };
          }
          return { settings: data.settings, retryable: false };
        });
      })
      .catch(function(err) {
        console.error('[Clara Widget] Fetch error:', err);
        return { settings: null, retryable: true };
      });
  }

  function fetchSettings(id) {
    return fetchSettingsOnce(id).then(function(first) {
      if (first.settings || !first.retryable) return first.settings;
      return new Promise(function(resolve) {
        setTimeout(resolve, SETTINGS_RETRY_DELAY_MS);
      }).then(function() {
        return fetchSettingsOnce(id);
      }).then(function(second) {
        return second.settings;
      });
    });
  }

  // ── Init ──
  function init() {
    if (document.getElementById('clara-widget-styles')) return;

    // Listen for close message from iframe (panel-chat.tsx sends this)
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'clara-close') {
        closeChat();
      }
    });

    fetchSettings(WORKSPACE_ID).then(function(s) {
      if (!s) return;
      settings = s;
      injectStyles(s);

      var layout = s.widget_layout || 'classic';
      switch (layout) {
        case 'command_bar':
          // Shadow DOM injection — spotlight overlay with ⌘K shortcut
          createCommandBar();
          return; // ClaraWidget API is set up inside createCommandBar
        case 'side_whisper':
          // Shadow DOM injection — real frosted glass, no iframe
          createSideWhisper();
          return; // ClaraWidget API is set up inside createSideWhisper
        default:
          createClassicTrigger(s);
      }
    });
  }

  // ── Public API ──
  //
  // This is the classic (iframe) definition. The shadow-DOM layouts replace it
  // with their own once they mount, so all three must accept the same argument.
  window.ClaraWidget = {
    /**
     * open()                                    - unchanged, as every CTA calls it.
     * open({ sessionToken, greeting })          - adopt an existing conversation.
     */
    open: function(opts) {
      if (!settings) return;
      var seed = readSeed(opts);
      // Must be set BEFORE openChat, which is what builds the iframe.
      if (seed) pendingFrameSeed = seed;
      var layout = settings.widget_layout || 'classic';
      var type = layout === 'classic' ? 'overlay' :
                 layout === 'side_whisper' ? 'panel' : 'modal';
      if (isMobile()) type = 'overlay';
      openChat(type);
    },
    close: function() {
      closeChat();
    },
    destroy: function() {
      // Clear intervals
      intervalIds.forEach(function(id) { clearInterval(id); });
      intervalIds = [];
      // Remove keyboard listener
      if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
        keyboardHandler = null;
      }
      // Close chat
      closeChat();
      // Remove DOM elements
      if (triggerEl) { triggerEl.remove(); triggerEl = null; }
      if (frameEl) { frameEl.remove(); frameEl = null; }
      if (backdropEl) { backdropEl.remove(); backdropEl = null; }
      // Remove styles
      var styles = document.getElementById('clara-widget-styles');
      if (styles) styles.remove();
      // Clean up
      settings = null;
      isOpen = false;
      delete window.ClaraWidget;
    }
  };

  // ── DOM Ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
