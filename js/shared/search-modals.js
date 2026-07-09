/* search-modals.js — reusable in-app search popups (spell / item / creature)
   with live debounced results, icons and hover tooltips. Shared by every
   editor/creator so nothing falls back to a browser prompt() for a lookup.
   Depends on shared helpers: sbShowTip/hideSpellTooltip/loadSpellIconsBatch
   (spells) and showItemTooltip/positionTooltip/itemIconUrl/qualityBg (items). */
(function () {
  let _timer = null;
  let _cb    = null;
  let _doSearch = null;

  function _close() {
    if (typeof hideSpellTooltip === 'function') hideSpellTooltip();
    document.getElementById('bag-tooltip')?.remove();
    document.getElementById('shared-search-modal')?.remove();
    _cb = null; _doSearch = null;
  }
  window.closeSharedSearch = _close;

  function _open(title, placeholder) {
    document.getElementById('shared-search-modal')?.remove();
    const m = `<div id="shared-search-modal" onclick="if(event.target===this)closeSharedSearch()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:960;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px">
      <div style="background:var(--panel);border:1px solid var(--cyan);border-radius:10px;width:580px;max-width:100%;max-height:75vh;display:flex;flex-direction:column;padding:16px;position:relative">
        <button onclick="closeSharedSearch()" style="position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="font-size:0.95rem;font-weight:600;color:var(--cyan);margin-bottom:10px">${title}</div>
        <input id="shared-search-input" placeholder="${placeholder}" autocomplete="off"
          style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.85rem;padding:8px 10px;margin-bottom:10px"
          oninput="_sharedSearchDebounce()"
          onkeydown="if(event.key==='Escape')closeSharedSearch()">
        <div id="shared-search-results" style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:6px;min-height:120px">
          <div style="padding:14px;color:var(--muted);font-size:0.8rem;text-align:center">Type to search…</div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', m);
    setTimeout(() => document.getElementById('shared-search-input')?.focus(), 30);
  }

  window._sharedSearchDebounce = function () {
    clearTimeout(_timer);
    _timer = setTimeout(() => { if (_doSearch) _doSearch(); }, 240);
  };
  window._sharedPick = function (id, name) { const cb = _cb; _close(); if (cb) cb(id, name); };

  function _box()  { return document.getElementById('shared-search-results'); }
  function _q()    { return document.getElementById('shared-search-input')?.value.trim(); }
  function _msg(t, c) { const b = _box(); if (b) b.innerHTML = `<div style="padding:14px;color:${c||'var(--muted)'};font-size:0.8rem;text-align:center">${t}</div>`; }

  // ── Spell search (rich spell tooltips + icons) ─────────────────────────────
  window.openSpellSearchModal = function (title, onPick) {
    _cb = onPick;
    _open(title || '🔍 Pick a spell', '🔍 Search by name or ID (e.g. Frostbolt, 116)…');
    _doSearch = async () => {
      const q = _q(); if (!q) { _msg('Type to search…'); return; }
      _msg('Search…');
      try {
        const r = await fetch(`${API}/spell/search?q=${encodeURIComponent(q)}&limit=25`);
        const d = await r.json();
        if (!d.ok || !d.data.length) { _msg('No results.'); return; }
        _box().innerHTML = d.data.map(s => {
          const id = s.ID || s.id;
          const name = (s.name || '?').replace(/"/g, '&quot;');
          const rank = (s.rank || '').replace(/"/g, '&quot;');
          const rankHtml = s.rank ? `<span style="color:rgba(200,160,60,.5);font-size:0.66rem;margin-left:5px">${s.rank}</span>` : '';
          return `<div data-spell-id="${id}" data-name="${name}" data-rank="${rank}" data-color="#94b3e8"
            onclick="_sharedPick(${id},'${(s.name || '').replace(/'/g, "\\'")}')"
            onmouseenter="sbShowTip(event,this)" onmouseleave="hideSpellTooltip()"
            style="display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)"
            onmouseover="this.style.background='rgba(148,130,201,.12)'" onmouseout="this.style.background=''">
            <div style="width:40px;height:40px;flex-shrink:0;border-radius:4px;overflow:hidden;background:rgba(148,130,201,.12);border:1px solid rgba(148,130,201,.3);display:flex;align-items:center;justify-content:center">
              <img data-spell="${id}" style="width:100%;height:100%;object-fit:cover;display:none" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:0.55rem;color:rgba(148,130,201,.6);font-family:monospace">${id}</div>
            </div>
            <div style="flex:1;min-width:0">
              <div style="color:#e8d090;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name || '?'}${rankHtml}</div>
              <div style="color:var(--muted);font-size:0.68rem">#${id}</div>
            </div>
          </div>`;
        }).join('');
        if (typeof loadSpellIconsBatch === 'function') loadSpellIconsBatch(d.data.map(s => s.ID || s.id));
      } catch (e) { _msg(e.message, 'var(--red)'); }
    };
  };

  // ── Item search (item tooltips + icons) ────────────────────────────────────
  window.openItemSearchModal = function (title, onPick) {
    _cb = onPick;
    _open(title || '🔍 Pick an item', '🔍 Search item by name or ID…');
    _doSearch = async () => {
      const q = _q(); if (!q) { _msg('Type to search…'); return; }
      _msg('Search…');
      try {
        const r = await fetch(`${API}/item/search?q=${encodeURIComponent(q)}&limit=25`);
        const d = await r.json();
        if (!d.ok || !d.data.length) { _msg('No results.'); return; }
        _box().innerHTML = d.data.map(it => {
          const qc = (typeof QUALITY_COLOR !== 'undefined' && QUALITY_COLOR[it.Quality || 0]) || '#fff';
          const bg = (typeof qualityBg === 'function') ? qualityBg(it.Quality || 0) : 'rgba(255,255,255,.05)';
          const name = (it.name || '?').replace(/"/g, '&quot;');
          const icon = (typeof itemIconUrl === 'function') ? itemIconUrl(it.entry) : null;
          const iconInner = icon
            ? `<img src="${icon}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:0.5rem;color:${qc};font-family:monospace">${it.entry}</span>`
            : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:0.5rem;color:${qc};font-family:monospace">${it.entry}</span>`;
          return `<div onclick="_sharedPick(${it.entry},'${(it.name || '').replace(/'/g, "\\'")}')"
            data-name="${name}" data-id="${it.entry}" data-quality="${it.Quality || 0}" data-ilvl="${it.ItemLevel || 0}" data-rlvl="${it.RequiredLevel || 0}"
            onmouseenter="_sharedItemTip(event,this)" onmousemove="_sharedItemTipMove(event)" onmouseleave="_sharedItemTipLeave()"
            style="display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)"
            onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
            <div style="width:36px;height:36px;flex-shrink:0;border-radius:4px;overflow:hidden;background:${bg};border:1px solid ${qc};display:flex;align-items:center;justify-content:center">${iconInner}</div>
            <div style="flex:1;min-width:0">
              <div style="color:${qc};font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.name || '?'}</div>
              <div style="color:var(--muted);font-size:0.68rem">#${it.entry} · iL${it.ItemLevel || 0}</div>
            </div>
          </div>`;
        }).join('');
      } catch (e) { _msg(e.message, 'var(--red)'); }
    };
  };
  window._sharedItemTip = function (e, el) {
    if (typeof showItemTooltip === 'function')
      showItemTooltip(e, { name: el.dataset.name, id: el.dataset.id, quality: parseInt(el.dataset.quality || 0), ilvl: el.dataset.ilvl, rlvl: el.dataset.rlvl });
  };
  window._sharedItemTipMove  = function (e) { const t = document.getElementById('bag-tooltip'); if (t && typeof positionTooltip === 'function') positionTooltip(t, e); };
  window._sharedItemTipLeave = function ()  { document.getElementById('bag-tooltip')?.remove(); };

  // ── Creature / NPC search ──────────────────────────────────────────────────
  window.openCreatureSearchModal = function (title, onPick) {
    _cb = onPick;
    _open(title || '🔍 Pick a creature', '🔍 Search creature by name or entry ID…');
    _doSearch = async () => {
      const q = _q(); if (!q) { _msg('Type to search…'); return; }
      _msg('Search…');
      try {
        const r = await fetch(`${API}/creature/search?q=${encodeURIComponent(q)}&limit=25`);
        const d = await r.json();
        if (!d.ok || !d.data.length) { _msg('No results.'); return; }
        _box().innerHTML = d.data.map(c => {
          const sub = c.subname ? ` <span style="color:var(--muted);font-size:0.68rem">&lt;${(c.subname || '').replace(/</g, '&lt;')}&gt;</span>` : '';
          const lvl = (c.minlevel != null) ? `L${c.minlevel}${(c.maxlevel && c.maxlevel != c.minlevel) ? '-' + c.maxlevel : ''}` : '';
          return `<div onclick="_sharedPick(${c.entry},'${(c.name || '').replace(/'/g, "\\'")}')"
            style="display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)"
            onmouseover="this.style.background='rgba(255,140,0,.1)'" onmouseout="this.style.background=''">
            <div style="flex:1;min-width:0">
              <div style="color:var(--orange);font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name || '?'}${sub}</div>
              <div style="color:var(--muted);font-size:0.68rem">#${c.entry}${lvl ? ' · ' + lvl : ''} · faction ${c.faction != null ? c.faction : '?'}</div>
            </div>
          </div>`;
        }).join('');
      } catch (e) { _msg(e.message, 'var(--red)'); }
    };
  };
})();
