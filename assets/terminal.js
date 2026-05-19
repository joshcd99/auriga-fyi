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

    // ─── Replay history (compact form) ───
    const history = state.history || [];
    if (history.length > 0) {
      const recent = history.slice(-6);
      appendLine(body, `<span class="dim">// resumed — last commands: ${recent.map(h => '<span class="kw">' + escapeHtml(h) + '</span>').join(' · ')}</span>`);
    } else {
      const path = location.pathname.replace(/\/$/, '') || '/';
      appendLine(body, `<span class="dim">${opts.greeting || `// ready at ${escapeHtml(path)} — type \`help\``}</span>`);
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
          appendLine(body, `<span class="dim">navigating to ${escapeHtml(cmd.label)}...</span>`);
          await sleep(280);
          location.href = cmd.href;
          break;
        case 'unknown':
        default:
          appendLine(body, `<span class="err">zsh: command not found: ${escapeHtml(cmd.raw)}</span><span class="dim">  (try \`help\`)</span>`);
          break;
      }
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

  window.AurigaTerminal = { mountDock, markIntroDone, wasIntroDone, PORTFOLIO, PROJECTS, ROUTES };
})();
