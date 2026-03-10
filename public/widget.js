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

    // Create shadow DOM host
    var host = document.createElement('div');
    host.id = 'clara-shadow-host';
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });

    // Build avatar HTML once (used in header + assistant messages)
    var avatarHTML = s.avatar_url
      ? '<img src="' + s.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">'
      : '<svg viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="50" fill="#213D66"/><path d="M30 50c0-8.5 6-15 14-15 5 0 9 2.5 11.5 6.5" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M70 50c0 8.5-6 15-14 15-5 0-9-2.5-11.5-6.5" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M44 43c3-2 7-2 10 0 4 2.5 6 7 6 12" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M56 57c-3 2-7 2-10 0-4-2.5-6-7-6-12" stroke="white" stroke-width="5.5" stroke-linecap="round" fill="none"/></svg>';

    // Inject CSS
    var styleEl = document.createElement('style');
    styleEl.textContent = '\n' +
      ':host {\n' +
      '  --ce-navy: #213D66;\n' +
      '  --ce-navy-dark: #1a2d4d;\n' +
      '  --ce-teal: #2A7F7F;\n' +
      '  --ce-lime: #C5E84D;\n' +
      '  --ce-white: #FFFFFF;\n' +
      '  --ce-offwhite: #f8f9fb;\n' +
      '  --ce-gray100: #eef1f5;\n' +
      '  --ce-gray200: #dde2ea;\n' +
      '  --ce-gray300: #c4cbd8;\n' +
      '  --ce-gray400: #9aa3b4;\n' +
      '  --ce-gray500: #6b7588;\n' +
      '  --ce-gray600: #4a5468;\n' +
      '  --ce-text: #1a2332;\n' +
      '  --ce-text-muted: #5a6577;\n' +
      '  --ce-border: rgba(33, 61, 102, 0.1);\n' +
      '  --glass-bg: rgba(255, 255, 255, 0.78);\n' +
      '  --glass-bg-solid: rgba(255, 255, 255, 0.88);\n' +
      '  --glass-blur: blur(40px) saturate(180%);\n' +
      '  --glass-outer-border: 1px solid rgba(255, 255, 255, 0.5);\n' +
      '  --glass-modal-shadow: 0 32px 80px rgba(33,61,102,0.2), 0 12px 40px rgba(33,61,102,0.1), inset 0 1px 0 rgba(255,255,255,0.6);\n' +
      '  --glass-pill-shadow: 0 4px 24px rgba(33,61,102,0.12), 0 1px 4px rgba(33,61,102,0.06), inset 0 1px 0 rgba(255,255,255,0.7);\n' +
      '  --glass-input-bg: rgba(255, 255, 255, 0.5);\n' +
      '  --glass-input-border: rgba(33, 61, 102, 0.1);\n' +
      '  --glass-backdrop: rgba(15, 23, 42, 0.3);\n' +
      '}\n' +
      '.cb-pill, .cb-modal {\n' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;\n' +
      '}\n' +
      '.cb-pill {\n' +
      '  position: fixed;\n' +
      '  bottom: 28px;\n' +
      '  left: 50%;\n' +
      '  transform: translateX(-50%);\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 12px;\n' +
      '  padding: 11px 14px 11px 16px;\n' +
      '  background: var(--glass-bg);\n' +
      '  backdrop-filter: var(--glass-blur);\n' +
      '  -webkit-backdrop-filter: var(--glass-blur);\n' +
      '  border: var(--glass-outer-border);\n' +
      '  border-radius: 14px;\n' +
      '  box-shadow: var(--glass-pill-shadow);\n' +
      '  cursor: pointer;\n' +
      '  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n' +
      '  white-space: nowrap;\n' +
      '  pointer-events: auto;\n' +
      '  min-width: 320px;\n' +
      '}\n' +
      '.cb-pill:hover {\n' +
      '  box-shadow: 0 8px 32px rgba(33,61,102,0.16), 0 2px 8px rgba(33,61,102,0.08), inset 0 1px 0 rgba(255,255,255,0.7);\n' +
      '  transform: translateX(-50%) translateY(-2px);\n' +
      '}\n' +
      '.cb-pill.hidden { display: none; }\n' +
      '.cb-pill-icon {\n' +
      '  flex-shrink: 0;\n' +
      '  color: var(--ce-gray400);\n' +
      '}\n' +
      '.cb-pill-body {\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 10px;\n' +
      '  flex: 1;\n' +
      '}\n' +
      '.cb-pill-dot {\n' +
      '  position: relative;\n' +
      '  width: 6px;\n' +
      '  height: 6px;\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.cb-pill-dot-core {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  border-radius: 50%;\n' +
      '  background: var(--ce-teal);\n' +
      '  animation: cbPulseGlow 3s ease-in-out infinite;\n' +
      '}\n' +
      '.cb-pill-dot-ring {\n' +
      '  position: absolute;\n' +
      '  inset: -3px;\n' +
      '  border-radius: 50%;\n' +
      '  background: var(--ce-teal);\n' +
      '  opacity: 0;\n' +
      '  animation: cbPulseRing 3s ease-in-out infinite;\n' +
      '}\n' +
      '.cb-pill-text {\n' +
      '  font-size: 14px;\n' +
      '  color: var(--ce-gray400);\n' +
      '  font-weight: 400;\n' +
      '}\n' +
      '.cb-pill-divider {\n' +
      '  height: 16px;\n' +
      '  width: 1px;\n' +
      '  background: var(--ce-gray200);\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.cb-pill-kbd {\n' +
      '  padding: 2px 7px;\n' +
      '  border-radius: 6px;\n' +
      '  background: rgba(33,61,102,0.05);\n' +
      '  border: 1px solid rgba(33,61,102,0.1);\n' +
      '  font-size: 11px;\n' +
      '  font-family: inherit;\n' +
      '  color: var(--ce-gray400);\n' +
      '  line-height: 18px;\n' +
      '}\n' +
      '@media (max-width: 768px) {\n' +
      '  .cb-pill-kbd { display: none; }\n' +
      '  .cb-pill-divider { display: none; }\n' +
      '  .cb-pill { min-width: auto; }\n' +
      '}\n' +
      '@keyframes cbPulseGlow {\n' +
      '  0%, 100% { opacity: 0.4; transform: scale(0.85); }\n' +
      '  50% { opacity: 1; transform: scale(1); }\n' +
      '}\n' +
      '@keyframes cbPulseRing {\n' +
      '  0%, 100% { opacity: 0; transform: scale(0.5); }\n' +
      '  50% { opacity: 0.18; transform: scale(1.8); }\n' +
      '}\n' +
      '.cb-backdrop {\n' +
      '  position: fixed;\n' +
      '  inset: 0;\n' +
      '  background: var(--glass-backdrop);\n' +
      '  backdrop-filter: blur(4px);\n' +
      '  -webkit-backdrop-filter: blur(4px);\n' +
      '  pointer-events: auto;\n' +
      '  opacity: 0;\n' +
      '  visibility: hidden;\n' +
      '  transition: opacity 0.15s ease, visibility 0.15s ease;\n' +
      '}\n' +
      '.cb-backdrop.open {\n' +
      '  opacity: 1;\n' +
      '  visibility: visible;\n' +
      '}\n' +
      '.cb-modal {\n' +
      '  position: fixed;\n' +
      '  top: 50%;\n' +
      '  left: 50%;\n' +
      '  transform: translate(-50%, -48%) scale(0.97);\n' +
      '  width: 660px;\n' +
      '  max-width: calc(100vw - 32px);\n' +
      '  max-height: calc(100vh - 64px);\n' +
      '  background: var(--glass-bg);\n' +
      '  backdrop-filter: var(--glass-blur);\n' +
      '  -webkit-backdrop-filter: var(--glass-blur);\n' +
      '  border: var(--glass-outer-border);\n' +
      '  border-radius: 18px;\n' +
      '  box-shadow: var(--glass-modal-shadow);\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  overflow: hidden;\n' +
      '  pointer-events: auto;\n' +
      '  opacity: 0;\n' +
      '  visibility: hidden;\n' +
      '  transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n' +
      '}\n' +
      '.cb-modal.open {\n' +
      '  opacity: 1;\n' +
      '  visibility: visible;\n' +
      '  transform: translate(-50%, -50%) scale(1);\n' +
      '}\n' +
      '.cb-modal.compact {\n' +
      '  height: auto;\n' +
      '}\n' +
      '.cb-modal.expanded {\n' +
      '  height: 540px;\n' +
      '}\n' +
      '.cb-modal::before {\n' +
      '  content: \'\';\n' +
      '  position: absolute;\n' +
      '  top: 0;\n' +
      '  left: 18px;\n' +
      '  right: 18px;\n' +
      '  height: 3px;\n' +
      '  background: linear-gradient(90deg, var(--ce-lime) 0%, var(--ce-teal) 40%, var(--ce-navy) 100%);\n' +
      '  z-index: 1;\n' +
      '  border-radius: 0 0 3px 3px;\n' +
      '}\n' +
      '.cb-header {\n' +
      '  padding: 14px 16px 12px;\n' +
      '  border-bottom: 1px solid var(--ce-border);\n' +
      '  background: var(--glass-bg-solid);\n' +
      '  display: flex;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '  flex-shrink: 0;\n' +
      '  border-radius: 18px 18px 0 0;\n' +
      '}\n' +
      '.cb-header-left {\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 10px;\n' +
      '}\n' +
      '.cb-avatar {\n' +
      '  width: 30px;\n' +
      '  height: 30px;\n' +
      '  border-radius: 50%;\n' +
      '  overflow: hidden;\n' +
      '  flex-shrink: 0;\n' +
      '  box-shadow: 0 1px 4px rgba(33,61,102,0.12);\n' +
      '}\n' +
      '.cb-avatar img {\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '  object-fit: cover;\n' +
      '  display: block;\n' +
      '}\n' +
      '.cb-avatar svg {\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '}\n' +
      '.cb-title {\n' +
      '  font-size: 14px;\n' +
      '  font-weight: 700;\n' +
      '  color: var(--ce-navy);\n' +
      '}\n' +
      '.cb-subtitle {\n' +
      '  font-size: 12px;\n' +
      '  font-weight: 500;\n' +
      '  color: var(--ce-teal);\n' +
      '  margin-left: 8px;\n' +
      '}\n' +
      '.cb-header-right {\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 6px;\n' +
      '}\n' +
      '.cb-new-chat {\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  font-size: 12px;\n' +
      '  color: var(--ce-gray400);\n' +
      '  cursor: pointer;\n' +
      '  padding: 5px 10px;\n' +
      '  border-radius: 6px;\n' +
      '  font-family: inherit;\n' +
      '  transition: all 0.15s ease;\n' +
      '  display: none;\n' +
      '}\n' +
      '.cb-new-chat.visible { display: inline-block; }\n' +
      '.cb-new-chat:hover {\n' +
      '  background: rgba(33,61,102,0.06);\n' +
      '  color: var(--ce-gray600);\n' +
      '}\n' +
      '.cb-close {\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  color: var(--ce-gray400);\n' +
      '  cursor: pointer;\n' +
      '  font-size: 15px;\n' +
      '  border-radius: 7px;\n' +
      '  width: 28px;\n' +
      '  height: 28px;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: all 0.15s ease;\n' +
      '}\n' +
      '.cb-close:hover {\n' +
      '  background: rgba(33,61,102,0.06);\n' +
      '  color: var(--ce-gray600);\n' +
      '}\n' +
      '.cb-body {\n' +
      '  flex: 1;\n' +
      '  overflow-y: auto;\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '}\n' +
      '.cb-welcome-zone {\n' +
      '  padding: 14px 10px 0;\n' +
      '}\n' +
      '.cb-welcome-text {\n' +
      '  padding: 0 4px 12px;\n' +
      '  color: var(--ce-text-muted);\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.6;\n' +
      '  white-space: pre-wrap;\n' +
      '}\n' +
      '.cb-suggestions-label {\n' +
      '  padding: 6px 4px 4px;\n' +
      '  font-size: 11px;\n' +
      '  font-weight: 600;\n' +
      '  color: var(--ce-gray400);\n' +
      '  text-transform: uppercase;\n' +
      '  letter-spacing: 0.5px;\n' +
      '}\n' +
      '.cb-suggestion {\n' +
      '  width: 100%;\n' +
      '  text-align: left;\n' +
      '  padding: 10px 12px;\n' +
      '  background: transparent;\n' +
      '  border: none;\n' +
      '  border-radius: 9px;\n' +
      '  color: var(--ce-text);\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.4;\n' +
      '  cursor: pointer;\n' +
      '  transition: all 0.15s ease;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 10px;\n' +
      '  font-family: inherit;\n' +
      '}\n' +
      '.cb-suggestion:hover {\n' +
      '  background: rgba(42, 127, 127, 0.06);\n' +
      '}\n' +
      '.cb-suggestion-icon {\n' +
      '  flex-shrink: 0;\n' +
      '  opacity: 0.5;\n' +
      '  color: var(--ce-teal);\n' +
      '}\n' +
      '.cb-suggestion-text {\n' +
      '  flex: 1;\n' +
      '}\n' +
      '.cb-suggestion-arrow {\n' +
      '  margin-left: auto;\n' +
      '  color: var(--ce-gray300);\n' +
      '  font-size: 13px;\n' +
      '}\n' +
      '.cb-messages {\n' +
      '  padding: 18px 22px;\n' +
      '  display: flex;\n' +
      '  flex-direction: column;\n' +
      '  gap: 12px;\n' +
      '}\n' +
      '.cb-msg-row {\n' +
      '  display: flex;\n' +
      '  align-items: flex-start;\n' +
      '  gap: 10px;\n' +
      '}\n' +
      '.cb-msg-avatar {\n' +
      '  width: 22px;\n' +
      '  height: 22px;\n' +
      '  border-radius: 50%;\n' +
      '  flex-shrink: 0;\n' +
      '  margin-top: 1px;\n' +
      '  overflow: hidden;\n' +
      '}\n' +
      '.cb-msg-avatar svg {\n' +
      '  width: 100%;\n' +
      '  height: 100%;\n' +
      '}\n' +
      '.cb-msg-avatar-user {\n' +
      '  background: var(--ce-navy);\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '}\n' +
      '.cb-msg-content {\n' +
      '  flex: 1;\n' +
      '}\n' +
      '.cb-msg-text {\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.55;\n' +
      '}\n' +
      '.cb-msg-text.user { color: var(--ce-text); }\n' +
      '.cb-msg-text.assistant { color: var(--ce-text-muted); line-height: 1.65; }\n' +
      '.cb-typing {\n' +
      '  display: flex;\n' +
      '  gap: 5px;\n' +
      '  padding: 6px 0;\n' +
      '}\n' +
      '.cb-dot {\n' +
      '  width: 6px;\n' +
      '  height: 6px;\n' +
      '  border-radius: 50%;\n' +
      '  background: var(--ce-gray400);\n' +
      '  animation: cbDotBounce 1.2s infinite;\n' +
      '}\n' +
      '.cb-dot:nth-child(2) { animation-delay: 0.15s; }\n' +
      '.cb-dot:nth-child(3) { animation-delay: 0.3s; }\n' +
      '@keyframes cbDotBounce {\n' +
      '  0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }\n' +
      '  30% { transform: translateY(-5px); opacity: 1; }\n' +
      '}\n' +
      '.cb-bottom {\n' +
      '  border-top: 1px solid var(--ce-border);\n' +
      '  background: var(--glass-bg-solid);\n' +
      '  flex-shrink: 0;\n' +
      '  border-radius: 0 0 18px 18px;\n' +
      '}\n' +
      '.cb-input-wrap {\n' +
      '  padding: 10px 14px 8px;\n' +
      '}\n' +
      '.cb-input-bar {\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  gap: 10px;\n' +
      '  background: var(--glass-input-bg);\n' +
      '  border: 1px solid var(--glass-input-border);\n' +
      '  border-radius: 11px;\n' +
      '  padding: 4px 4px 4px 14px;\n' +
      '}\n' +
      '.cb-input {\n' +
      '  flex: 1;\n' +
      '  background: none;\n' +
      '  border: none;\n' +
      '  outline: none;\n' +
      '  color: var(--ce-text);\n' +
      '  font-size: 14px;\n' +
      '  font-family: inherit;\n' +
      '  padding: 8px 0;\n' +
      '}\n' +
      '.cb-input::placeholder {\n' +
      '  color: var(--ce-gray400);\n' +
      '}\n' +
      '.cb-send {\n' +
      '  width: 34px;\n' +
      '  height: 34px;\n' +
      '  border-radius: 8px;\n' +
      '  border: none;\n' +
      '  display: flex;\n' +
      '  align-items: center;\n' +
      '  justify-content: center;\n' +
      '  transition: all 0.2s ease;\n' +
      '  flex-shrink: 0;\n' +
      '}\n' +
      '.cb-send.active {\n' +
      '  background: var(--ce-teal);\n' +
      '  color: white;\n' +
      '  cursor: pointer;\n' +
      '}\n' +
      '.cb-send.inactive {\n' +
      '  background: transparent;\n' +
      '  cursor: default;\n' +
      '}\n' +
      '.cb-esc-badge {\n' +
      '  display: flex;\n' +
      '  gap: 4px;\n' +
      '  margin-right: 6px;\n' +
      '}\n' +
      '.cb-esc-kbd {\n' +
      '  padding: 2px 7px;\n' +
      '  border-radius: 5px;\n' +
      '  background: rgba(33,61,102,0.05);\n' +
      '  border: 1px solid rgba(33,61,102,0.1);\n' +
      '  font-size: 11px;\n' +
      '  font-family: inherit;\n' +
      '  color: var(--ce-gray400);\n' +
      '  line-height: 18px;\n' +
      '}\n' +
      '.cb-footer {\n' +
      '  padding: 4px 16px 10px;\n' +
      '  display: flex;\n' +
      '  justify-content: space-between;\n' +
      '  align-items: center;\n' +
      '}\n' +
      '.cb-footer-powered {\n' +
      '  font-size: 11px;\n' +
      '  color: var(--ce-gray300);\n' +
      '}\n' +
      '.cb-footer-hint {\n' +
      '  font-size: 11px;\n' +
      '  color: var(--ce-gray400);\n' +
      '}\n' +
      '.cb-error {\n' +
      '  color: #c0392b;\n' +
      '  font-size: 13px;\n' +
      '  padding: 8px 12px;\n' +
      '  background: rgba(192,57,43,0.08);\n' +
      '  border-radius: 8px;\n' +
      '  line-height: 1.5;\n' +
      '  margin: 0 22px;\n' +
      '}\n';
    shadow.appendChild(styleEl);

    // ── BUILD DOM ──

    // Pill trigger
    var pill = document.createElement('div');
    pill.className = 'cb-pill';

    var pillIcon = document.createElement('span');
    pillIcon.className = 'cb-pill-icon';
    pillIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
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
    pillText.textContent = 'Ask about our services...';
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
    suggestionsLabel.textContent = 'Suggestions';
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
          '<span class="cb-suggestion-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>' +
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
      row.className = 'cb-msg-row';

      var avatar = document.createElement('div');
      avatar.className = 'cb-msg-avatar cb-msg-avatar-user';
      avatar.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

      var content = document.createElement('div');
      content.className = 'cb-msg-content';
      var textEl = document.createElement('div');
      textEl.className = 'cb-msg-text user';
      textEl.textContent = text;
      content.appendChild(textEl);

      row.appendChild(avatar);
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
            msgResult.textEl.textContent = fullContent.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
            scrollToBottom();
          },
          onDone: function(data) {
            msgResult.textEl.textContent = fullContent.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
            if (data.booking_url) {
              renderBookingLink(data.booking_url, msgResult.content);
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

    // Pill click opens modal
    pill.addEventListener('click', function() { openModal(); });

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

    // ── WINDOW.CLARAWIDGET API ──

    window.ClaraWidget = {
      open: function() { openModal(); },
      close: function() { closeModal(); },
      destroy: function() {
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
            assistantEl.textContent = fullContent.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
            scrollToBottom();
          },
          onDone: function(data) {
            assistantEl.textContent = fullContent.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
            if (data.booking_url) {
              renderBookingLink(data.booking_url, assistantEl);
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

    // Update window.ClaraWidget API
    window.ClaraWidget = {
      open: function() { openPanel(); },
      close: function() { closePanel(); },
      destroy: function() {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        settings = null;
        isOpen = false;
      }
    };
  }

  // ── Fetch Settings ──
  function fetchSettings(id) {
    return fetch(BASE_URL + '/api/workspace/public?workspace_id=' + id)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.success) {
          console.error('[Clara Widget] Failed to load settings:', data.error);
          return null;
        }
        return data.settings;
      })
      .catch(function(err) {
        console.error('[Clara Widget] Fetch error:', err);
        return null;
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
  window.ClaraWidget = {
    open: function() {
      if (!settings) return;
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
