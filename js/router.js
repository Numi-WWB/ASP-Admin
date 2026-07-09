/* router.js — deep-linkable URLs per tab / subtab (e.g. /Editor/Items).
   Drives the existing showDB/showSub/loadPlayerTab navigation and keeps the
   browser URL + history in sync so reload / back / forward land on the right
   tab. Loaded after all feature scripts, before bootstrap.js. */
(function () {
  // tabKey -> { name (URL segment), subs: {subKey: URL segment} | null, kind }
  const TABS = {
    world:      { name: 'World',      kind: 'sub',    subs: { items:'Items', spells:'Spells', quests:'Quests', creatures:'Creatures', misc:'Misc' } },
    characters: { name: 'Characters', kind: 'none',   subs: null },
    player:     { name: 'Player',     kind: 'player', subs: { xp:'XP', class:'Classes', race:'Races', create:'Character', items:'Items', spells:'Spells' } },
    editor:     { name: 'Editor',     kind: 'sub',    subs: { items:'Items', spells:'Spells', talents:'Talents', creatures:'Creatures', quests:'Quests', loot:'Loot', smartai:'SmartAI' } },
    playerbots: { name: 'Playerbots', kind: 'sub',    subs: { texts:'Texts', speech:'Speech', gear:'Gear', enchants:'Enchants', weights:'Weights', strategies:'Strategies', dungeons:'Dungeons' } },
    auth:       { name: 'Auth',       kind: 'none',   subs: null },
  };

  let _suppress = false; // true while we drive the UI programmatically (skip URL push)

  function defaultSub(tab) {
    const t = TABS[tab];
    return (t && t.subs) ? Object.keys(t.subs)[0] : null;
  }

  function buildUrl(tab, sub) {
    const t = TABS[tab];
    if (!t) return '/';
    let u = '/' + t.name;
    if (sub && t.subs && t.subs[sub]) u += '/' + t.subs[sub];
    return u;
  }

  // Parse location.pathname → {tab, sub}. Case-insensitive on the URL segments.
  function parseUrl() {
    const parts = decodeURIComponent(location.pathname).split('/').filter(Boolean);
    if (!parts.length) return null;
    const tabSeg = parts[0].toLowerCase();
    let tab = null;
    for (const k in TABS) { if (TABS[k].name.toLowerCase() === tabSeg) { tab = k; break; } }
    if (!tab) return null;
    let sub = null;
    if (parts[1] && TABS[tab].subs) {
      const subSeg = parts[1].toLowerCase();
      for (const sk in TABS[tab].subs) { if (TABS[tab].subs[sk].toLowerCase() === subSeg) { sub = sk; break; } }
    }
    if (!sub) sub = defaultSub(tab);
    return { tab, sub };
  }

  function tabFromBtn(btn) {
    const m = (btn.getAttribute('onclick') || '').match(/showDB\('(\w+)'/);
    return m ? m[1] : null;
  }

  function activateTab(tab) {
    const btns = document.querySelectorAll('.main-nav-btn');
    for (const b of btns) {
      if ((b.getAttribute('onclick') || '').includes("showDB('" + tab + "'")) { b.click(); return; }
    }
  }

  function activateSub(tab, sub) {
    const t = TABS[tab];
    if (!t || !t.subs || !sub) return;
    if (t.kind === 'player') {
      if (typeof loadPlayerTab === 'function') loadPlayerTab(sub);
      return;
    }
    const sec = document.getElementById('db-' + tab);
    if (!sec) return;
    const needle = "showSub('" + tab + "','" + sub + "'";
    for (const b of sec.querySelectorAll('.sub-nav-btn')) {
      if ((b.getAttribute('onclick') || '').includes(needle)) { b.click(); return; }
    }
  }

  // Programmatically go to tab/sub and sync the URL (push=true adds history entry).
  function navigate(tab, sub, push) {
    if (!TABS[tab]) return;
    _suppress = true;
    activateTab(tab);
    if (sub) activateSub(tab, sub);
    _suppress = false;
    const url = buildUrl(tab, sub);
    const state = { tab, sub };
    if (push) history.pushState(state, '', url);
    else history.replaceState(state, '', url);
  }

  // ── User clicks → update URL ────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (_suppress) return;
    const navBtn = e.target.closest && e.target.closest('.main-nav-btn');
    if (navBtn) {
      const tab = tabFromBtn(navBtn);
      if (!tab) return;
      const ds = defaultSub(tab);
      // clicking a top tab lands on its default subtab
      if (ds) { _suppress = true; activateSub(tab, ds); _suppress = false; }
      history.pushState({ tab, sub: ds }, '', buildUrl(tab, ds));
      return;
    }
    const subBtn = e.target.closest && e.target.closest('.sub-nav-btn');
    if (subBtn) {
      const m = (subBtn.getAttribute('onclick') || '').match(/showSub\('(\w+)','(\w+)'/);
      if (m) history.pushState({ tab: m[1], sub: m[2] }, '', buildUrl(m[1], m[2]));
      return;
    }
    // NOTE: loadPlayerTab() re-renders #player-tabs (innerHTML) synchronously in the
    // inline onclick, so by the time this bubbles here the clicked button is already
    // detached. Match closest('button') (works on the detached node) and gate on the
    // onclick signature — a descendant selector like '#player-tabs button' would miss it.
    const pBtn = e.target.closest && e.target.closest('button');
    if (pBtn) {
      const m = (pBtn.getAttribute('onclick') || '').match(/loadPlayerTab\('(\w+)'/);
      if (m) history.pushState({ tab: 'player', sub: m[1] }, '', buildUrl('player', m[1]));
      return;
    }
  }, false);

  // ── Reload / deep-link: restore state after partials are injected ───────────
  document.addEventListener('app:ready', function () {
    const r = parseUrl();
    if (r) navigate(r.tab, r.sub, false);
    else navigate('world', defaultSub('world'), false); // normalize "/" → /World/Items
  });

  // ── Back / forward ──────────────────────────────────────────────────────────
  window.addEventListener('popstate', function () {
    const r = parseUrl();
    if (r) navigate(r.tab, r.sub, false);
  });
})();
