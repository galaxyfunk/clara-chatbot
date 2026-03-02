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

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'clara-widget-close';
    closeBtn.innerHTML = closeIcon;
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.addEventListener('click', closeChat);
    frameEl.appendChild(closeBtn);

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

    fetchSettings(WORKSPACE_ID).then(function(s) {
      if (!s) return;
      settings = s;
      injectStyles(s);

      var layout = s.widget_layout || 'classic';
      switch (layout) {
        case 'command_bar':
          createCommandBarTrigger(s);
          break;
        case 'side_whisper':
          createSideWhisperTrigger(s);
          break;
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
