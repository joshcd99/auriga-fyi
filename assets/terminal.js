// Shared docked terminal — mounted on every page.
// Exposes: window.AurigaTerminal.mountDock(opts)
// opts:
//   greeting: string  — first line printed on cold mount (default: "// resumed at <pathname>")
//   collapsed: bool   — start collapsed (default: from session state)
//   autoFocus: bool   — focus input after mount (default: false)
(function () {
  'use strict';

  // ─── Routing tables ───────────────────────────────────────────────
  const PORTFOLIO = {
    about:      { label: 'about',      desc: 'who I am',                       href: '/about/' },
    skills:     { label: 'skills',     desc: 'what I work with',               href: '/skills/' },
    projects:   { label: 'projects',   desc: "what I've built (5 entries)",    href: '/projects/' },
    resume:     { label: 'resume',     desc: '1-page CV',                      href: '/resume/' },
    reflection: { label: 'reflection', desc: 'signature work essay',           href: 'https://github.com/joshcd99/auriga-fyi#readme' },
  };
  const PROJECTS = {
    ember:     { label: 'Ember',      desc: 'personal finance tracker', href: 'https://ember.auriga.fyi' },
    greenstep: { label: 'GreenStep',  desc: 'sustainability challenge', href: 'https://greenstep.auriga.fyi' },
    plants:    { label: 'Plants',     desc: 'plant care tracker',       href: 'https://plants.auriga.fyi' },
    redacted:  { label: '[redacted]', desc: 'private',                  href: '/redacted' },
  };
  const ROUTES = Object.assign({}, PORTFOLIO, PROJECTS);

  // Aliases — short navigational commands.
  const ALIASES = {
    home: '/', '~': '/', cv: '/resume/', work: '/projects/',
    me: '/about/', who: '/about/', stack: '/skills/',
  };

  // ─── Session state ────────────────────────────────────────────────
  const STORAGE_KEY = 'auriga.terminal.v1';
  const HISTORY_LIMIT = 24;

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function saveState(patch) {
    const state = Object.assign(loadState(), patch);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function pushHistory(line) {
    const s = loadState();
    s.history = (s.history || []).concat([line]).slice(-HISTORY_LIMIT);
    saveState(s);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ─── Dock DOM ─────────────────────────────────────────────────────
  function buildDock() {
    const root = document.createElement('aside');
    root.className = 'terminal-dock';
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Terminal');
    root.innerHTML = `
      <div class="dock-bar" data-role="toggle" title="Click to collapse/expand">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="bar-title">auriga.fyi — zsh</span>
        <span class="dock-hint dim">\` to focus · click to collapse</span>
      </div>
      <div class="dock-body" data-role="body"></div>
      <div class="dock-input-row" data-role="input-row">
        <span class="prompt">$ </span>
        <span class="input-display" data-role="display"></span>
        <span class="cursor"></span>
        <input class="real-input" type="text" autocomplete="off" autocorrect="off"
               autocapitalize="off" spellcheck="false" data-role="real-input" />
      </div>
    `;
    return root;
  }

  function appendLine(body, html) {
    const span = document.createElement('span');
    span.className = 'dock-line';
    span.innerHTML = html == null ? '' : html;
    body.appendChild(span);
    body.scrollTop = body.scrollHeight;
    return span;
  }
  function appendListing(body, title, table) {
    appendLine(body, `<span class="dim">${title}</span>`);
    for (const [key, p] of Object.entries(table)) {
      const isRedacted = key === 'redacted';
      const row = document.createElement('span');
      row.className = 'dock-line listing-row';
      row.innerHTML = `<span class="proj-arrow">→ </span><span class="proj-name${isRedacted ? ' redacted' : ''}">${p.label}</span><span class="proj-desc${isRedacted ? ' redacted' : ''}">${p.desc}</span>`;
      body.appendChild(row);
    }
    appendLine(body, '');
    body.scrollTop = body.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Command resolution ───────────────────────────────────────────
  function resolveCommand(raw) {
    const val = (raw || '').trim();
    if (!val) return { kind: 'noop' };
    const lower = val.toLowerCase();

    if (lower === 'help' || lower === '?' || lower === 'ls') return { kind: 'help' };
    if (lower === 'clear' || lower === 'cls') return { kind: 'clear' };
    if (lower === 'whoami') return { kind: 'whoami' };
    if (lower === 'back' || lower === '..' || lower === '../' || lower === '-') return { kind: 'back' };
    if (lower === 'pwd') return { kind: 'pwd' };
    if (lower === 'date' || lower === 'now') return { kind: 'date' };

    if (ALIASES[lower]) return { kind: 'nav', href: ALIASES[lower], label: lower };
    if (ROUTES[lower]) return { kind: 'nav', href: ROUTES[lower].href, label: ROUTES[lower].label };

    return { kind: 'unknown', raw: val };
  }

  // ─── Mount ────────────────────────────────────────────────────────
  function mountDock(opts) {
    opts = opts || {};
    const state = loadState();
    const startCollapsed = opts.collapsed != null ? opts.collapsed : !!state.collapsed;

    const dock = buildDock();
    document.body.appendChild(dock);
    document.body.classList.add('has-dock');
    if (startCollapsed) dock.classList.add('collapsed');

    const body = dock.querySelector('[data-role="body"]');
    const display = dock.querySelector('[data-role="display"]');
    const realInput = dock.querySelector('[data-role="real-input"]');
    const toggleEl = dock.querySelector('[data-role="toggle"]');

    // ─── Restore full history if we have it; else greet ───
    if (state.dockHTML) {
      body.innerHTML = state.dockHTML;
      // Add a thin separator showing we landed somewhere new.
      const path = location.pathname.replace(/\/$/, '') || '/';
      appendLine(body, `<span class="dim">// → arrived at ${escapeHtml(path)}</span>`);
    } else {
      const path = location.pathname.replace(/\/$/, '') || '/';
      appendLine(body, `<span class="dim">${opts.greeting || `// ready at ${escapeHtml(path)} — type \`help\``}</span>`);
    }
    body.scrollTop = body.scrollHeight;

    // Helper for saving the current dock body to sessionStorage.
    function persistDockHTML() {
      saveState({ dockHTML: body.innerHTML });
    }

    // ─── Input handling ───
    let typed = '';

    function setTyped(v) {
      typed = v;
      display.textContent = v;
    }

    realInput.addEventListener('input', () => setTyped(realInput.value));

    realInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await submit();
      } else if (e.key === 'Escape') {
        setTyped('');
        realInput.value = '';
      } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        body.innerHTML = '';
      }
    });

    // Click anywhere on the dock body or input row → focus input.
    dock.addEventListener('click', (e) => {
      if (e.target === toggleEl || toggleEl.contains(e.target)) return;
      realInput.focus();
    });

    // Toggle collapsed via title bar click.
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dock.classList.toggle('collapsed');
      saveState({ collapsed: dock.classList.contains('collapsed') });
      if (!dock.classList.contains('collapsed')) realInput.focus();
    });

    // Global keyboard shortcut: backtick focuses input.
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' && !isTypingInOtherInput(e)) {
        e.preventDefault();
        if (dock.classList.contains('collapsed')) {
          dock.classList.remove('collapsed');
          saveState({ collapsed: false });
        }
        realInput.focus();
      }
    });

    if (opts.autoFocus) realInput.focus();

    // Bind back/forward handler once the dock is live.
    bindSpaListeners();

    // ─── Submit ────
    async function submit() {
      const raw = typed;
      const cmd = resolveCommand(raw);
      // Echo the command line
      appendLine(body, `<span class="prompt">$ </span><span class="cmd">${escapeHtml(raw)}</span>`);
      setTyped(''); realInput.value = '';
      if (raw.trim()) pushHistory(raw.trim());

      switch (cmd.kind) {
        case 'noop': break;
        case 'help':
          appendListing(body, 'portfolio (CISC 480):', PORTFOLIO);
          appendListing(body, 'live projects:', PROJECTS);
          appendLine(body, '<span class="dim">extras: <span class="kw">help</span> · <span class="kw">clear</span> · <span class="kw">whoami</span> · <span class="kw">back</span> · <span class="kw">pwd</span> · <span class="kw">date</span></span>');
          break;
        case 'clear':
          body.innerHTML = '';
          break;
        case 'whoami':
          appendLine(body, '<span class="accent">josh dunlap</span><span class="dim"> — cs \'26, university of st. thomas</span>');
          break;
        case 'pwd':
          appendLine(body, `<span class="kw">${escapeHtml(location.pathname)}</span>`);
          break;
        case 'date':
          appendLine(body, `<span class="dim">${new Date().toString()}</span>`);
          break;
        case 'back':
          appendLine(body, '<span class="dim">going back...</span>');
          await sleep(180);
          history.length > 0 ? window.history.back() : (location.href = '/');
          break;
        case 'nav':
          if (isInternalSpaRoute(cmd.href)) {
            appendLine(body, `<span class="dim">→ ${escapeHtml(cmd.label)}</span>`);
            persistDockHTML(); // save before swap so reloads still work
            try {
              await spaNavigate(cmd.href, cmd.label);
            } catch (_) { location.href = cmd.href; }
          } else {
            appendLine(body, `<span class="dim">navigating to ${escapeHtml(cmd.label)}...</span>`);
            await sleep(220);
            location.href = cmd.href;
          }
          break;
        case 'unknown':
        default:
          appendLine(body, `<span class="err">zsh: command not found: ${escapeHtml(cmd.raw)}</span><span class="dim">  (try \`help\`)</span>`);
          break;
      }

      // Persist the dock's current body HTML so the next page restores it.
      persistDockHTML();
    }

    return {
      dock,
      submit,
      focus: () => realInput.focus(),
      collapse: () => { dock.classList.add('collapsed'); saveState({ collapsed: true }); },
      expand: () => { dock.classList.remove('collapsed'); saveState({ collapsed: false }); },
    };
  }

  function isTypingInOtherInput(e) {
    const t = e.target;
    if (!t) return false;
    const tag = t.tagName && t.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return !t.classList.contains('real-input');
    if (t.isContentEditable) return true;
    return false;
  }

  // Mark intro as done (called by landing page after centered intro flies down).
  function markIntroDone() { saveState({ introDone: true }); }
  function wasIntroDone() { return !!loadState().introDone; }

  // Seed the dock's persisted history — used by the landing page just before
  // flying down, so the dock restores the centered intro + the command the
  // user submitted.
  function seedDockHTML(html) { saveState({ dockHTML: html }); }
  function clearDockHTML() { saveState({ dockHTML: null }); }
  function hasDockHistory() { return !!loadState().dockHTML; }

  // ─── SPA navigation ────────────────────────────────────────────────
  // Internal routes that SPA-navigate (fetch + swap <main>, no page reload).
  // Anything else (external subdomains, GitHub README, /redacted) falls back
  // to a real navigation.
  function isInternalSpaRoute(href) {
    if (!href || typeof href !== 'string') return false;
    if (!href.startsWith('/')) return false;
    if (href.startsWith('//')) return false; // protocol-relative external
    if (href === '/redacted' || href === '/redacted.html') return false;
    if (/\.[a-z0-9]+(\?|$|#)/i.test(href)) return false; // file extension (e.g. .pdf)
    return true;
  }

  // Fetch destination URL, swap its <main> into the current document,
  // update title + per-page <style> tags, fire resize for the starfield.
  // Does NOT touch history (callers handle pushState / popstate).
  async function spaReplaceContent(href) {
    const res = await fetch(href, { headers: { 'Accept': 'text/html' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Title
    if (doc.title) document.title = doc.title;

    // Swap <main>
    const newMain = doc.querySelector('main');
    const currentMain = document.querySelector('main');
    if (currentMain && newMain) {
      currentMain.replaceWith(newMain);
    } else if (newMain && !currentMain) {
      // Inject before the dock if present, else before #auriga-label, else at end.
      const dock = document.querySelector('.terminal-dock');
      const label = document.getElementById('auriga-label');
      const anchor = dock || label;
      if (anchor) document.body.insertBefore(newMain, anchor);
      else document.body.appendChild(newMain);
    } else if (currentMain && !newMain) {
      currentMain.remove();
    }

    // Per-page <style> tags — swap any previously injected ones for the new set.
    document.querySelectorAll('style[data-spa-page-style]').forEach(el => el.remove());
    doc.querySelectorAll('head > style').forEach(style => {
      const cloned = style.cloneNode(true);
      cloned.setAttribute('data-spa-page-style', '');
      document.head.appendChild(cloned);
    });

    // Body classes — add destination's classes, preserve runtime classes
    // (animation states, dock state). Never clobber the whole className,
    // since mid-animation that would yank flying-to-dock and snap the
    // transition back to its starting state.
    const destClasses = (doc.body.className || '').split(/\s+/).filter(Boolean);
    destClasses.forEach(c => document.body.classList.add(c));
    // Make sure scroll-page is on for content pages; remove fixed-page if set.
    document.body.classList.add('scroll-page');
    document.body.classList.remove('fixed-page');

    // Re-fire resize so the starfield canvas re-extends to the new content height.
    window.dispatchEvent(new Event('resize'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Public navigate: replace content + push history.
  async function spaNavigate(href, label) {
    try {
      await spaReplaceContent(href);
      try { history.pushState({ spa: true, href }, '', href); } catch (_) {}
    } catch (err) {
      // Fall back to real navigation if SPA fetch fails.
      console.warn('SPA navigation failed, falling back', err);
      location.href = href;
    }
  }

  // Back/forward — replay the URL without pushing new history.
  let spaListenersBound = false;
  function bindSpaListeners() {
    if (spaListenersBound) return;
    spaListenersBound = true;
    window.addEventListener('popstate', () => {
      spaReplaceContent(location.pathname + location.search).catch(() => {
        location.reload();
      });
    });
    // Replace initial history state so popstate has something to anchor to.
    try { history.replaceState({ spa: true, href: location.pathname }, '', location.pathname + location.search); } catch (_) {}
  }

  window.AurigaTerminal = {
    mountDock, markIntroDone, wasIntroDone,
    seedDockHTML, clearDockHTML, hasDockHistory,
    spaNavigate, spaReplaceContent, isInternalSpaRoute, bindSpaListeners,
    PORTFOLIO, PROJECTS, ROUTES
  };
})();
