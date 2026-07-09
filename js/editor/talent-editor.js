/* talent-editor.js — beginner-friendly Cata-style talent tree editor.
   Edits Talent.dbc (client + server data/dbc) via /api/talent/*.
   Layout: class bar on top → 3 talent trees side by side, each a Tier×Column grid.
   Every cell is editable; prerequisite arrows are drawn from the prereq talent. */

  const TAL_COLS = 4;          // native 4 columns
  const TAL_MIN_ROWS = 11;     // native 11 tiers (Blizzard talent frame caps here)
  const TAL_CELL = 46;         // px per cell
  const TAL_GAP = 12;          // px between cells

  let _talClasses = [];
  let _tal = { classMask: 1, tabs: [] };   // tabs[i] = {id,name,icon_id,bg,order,rows,cells}
  let _talLoaded = false;
  let _talMeta = {};                       // spellId → {name, icon} cache

  function _talIcon(name){
    return name ? `https://wow.zamimg.com/images/wow/icons/medium/${String(name).toLowerCase()}.jpg` : '';
  }
  function _talKey(tier,col){ return tier + '_' + col; }

  // Resolve name+icon for the given spell IDs (cached) so rank rows show real names/tooltips.
  async function _talEnsureMeta(ids){
    const need = [...new Set(ids.map(x => parseInt(x)).filter(x => x > 0 && !_talMeta[x]))];
    if (!need.length) return;
    try {
      const r = await fetch(`${API}/talent/spell-meta`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:need})});
      const d = await r.json();
      if (d.ok) for (const [k,v] of Object.entries(d.data)) _talMeta[k] = v;
    } catch(e){}
  }

  // ── Offline spell tooltip (uses the app's own /api/spell/tooltip — no internet) ──
  const _talTipCache = {};
  async function talentSpellHover(e, sid){
    sid = parseInt(sid); if (!sid) return;
    let d = _talTipCache[sid];
    if (!d){
      try { const r = await fetch(`${API}/spell/tooltip/${sid}`); const j = await r.json(); if (!j.ok) return; d = j.data; _talTipCache[sid] = d; }
      catch(_){ return; }
    }
    document.getElementById('tal-spell-tip')?.remove();
    const color = d.color || '#FFD700';
    const tip = document.createElement('div');
    tip.id = 'tal-spell-tip';
    tip.style.cssText = `position:fixed;z-index:3000;background:linear-gradient(135deg,#0a1018,#050810);border:1px solid ${color};border-radius:6px;padding:10px 12px;font-family:'Share Tech Mono',monospace;font-size:0.78rem;color:var(--text);pointer-events:none;min-width:220px;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.85)`;
    const iconUrl = d.icon ? _talIcon(d.icon) : '';
    const iconH = iconUrl
      ? `<img src="${iconUrl}" style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;background:rgba(0,0,0,.4);flex-shrink:0"></div>`;
    let body = `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">${iconH}<div style="flex:1;min-width:0"><div style="color:${color};font-weight:600;line-height:1.25">${d.name||'?'}</div>${d.rank?`<div style="color:${color};font-size:0.66rem;opacity:.7">${d.rank}</div>`:''}</div></div>`;
    const meta = [];
    if (d.resource)  meta.push(`<span style="color:#4a9eff">${d.resource}</span>`);
    if (d.range)     meta.push(`<span style="color:#fff">${d.range}</span>`);
    if (d.cast_time) meta.push(`<span style="color:#fff">${d.cast_time}</span>`);
    if (d.cooldown)  meta.push(`<span style="color:var(--gold)">${d.cooldown}</span>`);
    if (meta.length) body += `<div style="display:flex;flex-wrap:wrap;gap:6px 10px;font-size:0.72rem;margin-bottom:4px">${meta.join('')}</div>`;
    if (d.desc){ const dh = d.desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,'<br>'); body += `<div style="color:#ffd200;font-size:0.74rem;font-style:italic;line-height:1.35">${dh}</div>`; }
    body += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08);font-size:0.62rem;color:rgba(255,255,255,.3)">ID: ${d.id||sid}</div>`;
    tip.innerHTML = body;
    document.body.appendChild(tip);
    positionTooltip(tip, e);
  }
  function talentTipMove(e){ const t = document.getElementById('tal-spell-tip'); if (t) positionTooltip(t, e); }
  function talentTipHide(){ document.getElementById('tal-spell-tip')?.remove(); }

  async function initTalentEditor(){
    if (_talLoaded) return;              // load once; class switch reloads the tree only
    _talLoaded = true;
    try {
      const r = await fetch(`${API}/talent/classes`); const d = await r.json();
      _talClasses = d.ok ? d.data : [];
    } catch(e){ _talClasses = []; }
    talentRenderClassbar();
    talentLoadTree(_tal.classMask);
  }

  function talentRenderClassbar(){
    const bar = document.getElementById('talent-classbar');
    if (!bar) return;
    bar.innerHTML = _talClasses.map(c => {
      const on = c.mask === _tal.classMask;
      return `<button onclick="talentSelectClass(${c.mask})" style="border:1px solid ${on?c.color:'var(--border)'};
        background:${on?c.color+'22':'var(--bg)'};color:${on?c.color:'var(--muted)'};border-radius:6px;
        padding:6px 13px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:0.82rem;font-weight:${on?'600':'400'}">
        ${c.name}</button>`;
    }).join('');
  }

  function talentSelectClass(mask){
    _tal.classMask = mask;
    talentRenderClassbar();
    talentLoadTree(mask);
  }

  async function talentLoadTree(mask){
    _tal.loaded = false;                 // block Save until the tree is fully loaded
    const book = document.getElementById('talent-book');
    if (book) book.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0">Loading tree…</div>`;
    try {
      const r = await fetch(`${API}/talent/tree/${mask}`); const d = await r.json();
      if (!d.ok){ book.innerHTML = `<div style="color:var(--red);padding:20px">${d.error}</div>`; return; }
      _tal.tabs = (d.data.tabs || []).map(tab => {
        const cells = {};
        let maxTier = 0;
        for (const t of tab.talents){
          cells[_talKey(t.tier, t.col)] = {
            id: t.id, tier: t.tier, col: t.col,
            ranks: t.ranks.slice(), maxRank: t.maxRank,
            name: t.name, icon: t.icon,
            prereqTalent: t.prereqTalent || 0, prereqRank: t.prereqRank || 0,
            reqSpell: t.reqSpell || 0, flags: t.flags || 0,
          };
          if (t.tier > maxTier) maxTier = t.tier;
        }
        return { id: tab.id, name: tab.name, icon_id: tab.icon_id, bg: tab.bg,
                 order: tab.order, rows: Math.max(TAL_MIN_ROWS, maxTier + 1), cells };
      });
      _tal.loaded = _tal.tabs.length > 0;   // only allow Save once a real tree is in memory
      talentRenderBook();
    } catch(e){ _tal.loaded = false; if (book) book.innerHTML = `<div style="color:var(--red);padding:20px">Server offline</div>`; }
  }

  function talentRenderBook(){
    const book = document.getElementById('talent-book');
    if (!book) return;
    book.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      ${_tal.tabs.map(talentRenderTree).join('')}</div>`;
    // draw prereq arrows after layout
    _tal.tabs.forEach(tab => talentDrawArrows(tab));
  }

  function talentRenderTree(tab){
    const gridW = TAL_COLS * TAL_CELL + (TAL_COLS - 1) * TAL_GAP;
    const gridH = tab.rows * TAL_CELL + (tab.rows - 1) * TAL_GAP;
    let cellsHtml = '';
    for (let tier = 0; tier < tab.rows; tier++){
      for (let col = 0; col < TAL_COLS; col++){
        const x = col * (TAL_CELL + TAL_GAP), y = tier * (TAL_CELL + TAL_GAP);
        const c = tab.cells[_talKey(tier, col)];
        const base = `position:absolute;left:${x}px;top:${y}px;width:${TAL_CELL}px;height:${TAL_CELL}px;box-sizing:border-box;border-radius:6px;cursor:pointer`;
        if (c){
          const rank1 = c.ranks[0] || 0;
          const img = c.icon ? `background-image:url('${_talIcon(c.icon)}');background-size:cover` : 'background:#222';
          cellsHtml += `<div onclick="talentEditCell(${tab.id},${tier},${col})"
            onmouseenter="talentSpellHover(event,${rank1})" onmousemove="talentTipMove(event)" onmouseleave="talentTipHide()"
            style="${base};${img};border:2px solid var(--gold);box-shadow:0 0 5px rgba(0,0,0,.6)">
            <span style="position:absolute;right:-4px;bottom:-6px;background:#000;border:1px solid var(--gold);color:var(--gold);
              border-radius:8px;font-size:0.62rem;padding:0 4px;line-height:1.4;font-family:monospace">${c.maxRank}</span></div>`;
        } else {
          cellsHtml += `<div onclick="talentEditCell(${tab.id},${tier},${col})"
            title="Empty — click to add a talent"
            style="${base};border:1.5px dashed rgba(255,255,255,.18);background:rgba(255,255,255,.02)"
            onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='rgba(255,255,255,.18)'"></div>`;
        }
      }
    }
    return `<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px;min-width:${gridW+28}px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        ${tab.icon_id ? '' : ''}
        <span style="color:var(--gold);font-weight:600;font-size:0.95rem">${tab.name}</span>
        <span style="color:var(--muted);font-size:0.7rem">#${tab.id} · ${Object.keys(tab.cells).length} talents</span>
      </div>
      <div style="position:relative;width:${gridW}px;height:${gridH}px">
        <svg id="tal-arrows-${tab.id}" width="${gridW}" height="${gridH}" style="position:absolute;left:0;top:0;pointer-events:none;z-index:1"></svg>
        <div style="position:absolute;left:0;top:0;width:${gridW}px;height:${gridH}px;z-index:2">${cellsHtml}</div>
      </div>
      <button class="e-btn e-btn-small" style="margin-top:12px;width:100%" onclick="talentAddRow(${tab.id})">＋ Add row (tier ${tab.rows})</button>
    </div>`;
  }

  function talentDrawArrows(tab){
    const svg = document.getElementById('tal-arrows-' + tab.id);
    if (!svg) return;
    const byId = {};
    Object.values(tab.cells).forEach(c => byId[c.id] = c);
    const center = c => ({ x: c.col*(TAL_CELL+TAL_GAP)+TAL_CELL/2, y: c.tier*(TAL_CELL+TAL_GAP)+TAL_CELL/2 });
    let s = `<defs><marker id="tal-ah-${tab.id}" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#1eff00"/></marker></defs>`;
    Object.values(tab.cells).forEach(c => {
      if (!c.prereqTalent) return;
      const pre = byId[c.prereqTalent];
      if (!pre) return;
      const a = center(pre), b = center(c);
      // stop the line at the target cell's edge
      const dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx,dy)||1;
      const bx = b.x - dx/len*(TAL_CELL/2+3), by = b.y - dy/len*(TAL_CELL/2+3);
      const ax = a.x + dx/len*(TAL_CELL/2), ay = a.y + dy/len*(TAL_CELL/2);
      s += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#1eff00" stroke-width="3"
        marker-end="url(#tal-ah-${tab.id})" opacity="0.85"/>`;
    });
    svg.innerHTML = s;
  }

  function talentAddRow(tabId){
    const tab = _tal.tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (tab.rows >= 11){ showToast('Note: Blizzard\'s default talent frame only renders 11 tiers','error'); }
    tab.rows++;
    talentRenderBook();
  }

  // ── Cell editor (modal) ─────────────────────────────────────────────────────
  let _talEdit = null;   // {tabId, tier, col, cell}

  async function talentEditCell(tabId, tier, col){
    const tab = _tal.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const key = _talKey(tier, col);
    const cell = tab.cells[key] || { id: 0, tier, col, ranks: [], maxRank: 0, name: '', icon: '',
                                     prereqTalent: 0, prereqRank: 0, reqSpell: 0, flags: 0 };
    _talEdit = { tabId, tier, col, cell: JSON.parse(JSON.stringify(cell)) };
    await _talEnsureMeta(_talEdit.cell.ranks);   // real names/icons for every rank
    talentRenderModal();
  }

  function talentRenderModal(){
    const tab = _tal.tabs.find(t => t.id === _talEdit.tabId);
    const c = _talEdit.cell;
    document.getElementById('tal-modal')?.remove();
    // prereq options = other talents in this tab
    const opts = ['<option value="0">— none —</option>'].concat(
      Object.values(tab.cells).filter(x => x.id !== c.id && x.id > 0).map(x =>
        `<option value="${x.id}"${x.id===c.prereqTalent?' selected':''}>${(x.name||('#'+x.id))} (T${x.tier+1})</option>`)
    ).join('');
    const rankRows = c.ranks.map((sid,i) => {
      const m = _talMeta[sid] || {};
      const nm = m.name || `Spell #${sid}`;
      const ic = m.icon || (i === 0 ? c.icon : '');
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
        <span style="color:var(--muted);width:22px">${i+1}.</span>
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:help"
          onmouseenter="talentSpellHover(event,${sid})" onmousemove="talentTipMove(event)" onmouseleave="talentTipHide()">
          <img src="${_talIcon(ic)}" style="width:24px;height:24px;border-radius:4px;flex-shrink:0" onerror="this.style.visibility='hidden'">
          <span style="font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_icEsc(nm)} <span style="color:var(--muted);font-size:0.7rem">#${sid}</span></span>
        </div>
        <button class="e-btn e-btn-small e-btn-danger" onclick="talentRankRemove(${i})">✕</button>
      </div>`;
    }).join('') || '<div style="color:var(--muted);font-size:0.78rem;padding:4px 0">No ranks yet — add at least one spell.</div>';

    const m = document.createElement('div');
    m.id = 'tal-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
    m.innerHTML = `<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:460px;max-width:100%;max-height:88vh;overflow-y:auto;padding:20px;position:relative">
      <button onclick="document.getElementById('tal-modal').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
      <div style="color:var(--gold);font-weight:600;margin-bottom:4px">Talent — ${tab.name} · Tier ${_talEdit.tier+1}, Col ${_talEdit.col+1}</div>
      <div style="color:var(--muted);font-size:0.72rem;margin-bottom:14px">${c.id?('Editing talent #'+c.id):'New talent (ID assigned on save)'}</div>

      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Ranks (one spell per rank)</div>
      <div id="tal-rank-list">${rankRows}</div>
      <button class="e-btn e-btn-small" style="margin:6px 0 14px" onclick="talentRankAdd()">🔍 Add rank (pick spell)</button>

      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Requires (arrow)</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <select id="tal-prereq" style="flex:1;${_scInputStyle?_scInputStyle():'background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:5px 8px;font-size:0.82rem'}">${opts}</select>
        <input id="tal-prereq-rank" type="number" min="0" value="${c.prereqRank||0}" title="Required rank of that talent"
          style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:5px 8px;font-size:0.82rem" placeholder="rank">
      </div>

      <details style="margin-bottom:14px">
        <summary style="cursor:pointer;color:var(--muted);font-size:0.75rem">Advanced (RequiredSpell, Flags)</summary>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="tal-reqspell" type="number" value="${c.reqSpell||0}" placeholder="RequiredSpellID"
            style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:5px 8px;font-size:0.82rem">
          <input id="tal-flags" type="number" value="${c.flags||0}" placeholder="Flags"
            style="width:90px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:5px 8px;font-size:0.82rem">
        </div>
      </details>

      <div style="display:flex;gap:8px;justify-content:space-between">
        ${c.id||c.ranks.length?`<button class="e-btn e-btn-danger" onclick="talentClearCell()">🗑 Clear cell</button>`:'<span></span>'}
        <div style="display:flex;gap:8px">
          <button class="e-btn" onclick="document.getElementById('tal-modal').remove()">Cancel</button>
          <button class="e-btn e-btn-green" onclick="talentApplyCell()">Apply</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
  }

  function talentRankAdd(){
    openSpellSearchModal('🔍 Pick spell for this rank', async (sid, sname) => {
      sid = parseInt(sid);
      _talEdit.cell.ranks.push(sid);
      await _talEnsureMeta([sid]);
      const m = _talMeta[sid] || {};
      if (_talEdit.cell.ranks.length === 1){   // first rank drives the cell icon/name
        _talEdit.cell.icon = m.icon || '';
        _talEdit.cell.name = m.name || '';
      }
      talentRenderModal();
    });
  }
  function talentRankRemove(i){
    _talEdit.cell.ranks.splice(i,1);
    if (!_talEdit.cell.ranks.length){ _talEdit.cell.icon=''; _talEdit.cell.name=''; }
    talentRenderModal();
  }
  function talentClearCell(){
    const tab = _tal.tabs.find(t => t.id === _talEdit.tabId);
    delete tab.cells[_talKey(_talEdit.tier, _talEdit.col)];
    document.getElementById('tal-modal').remove();
    talentRenderBook();
  }
  function talentApplyCell(){
    const c = _talEdit.cell;
    c.ranks = c.ranks.map(x=>parseInt(x)).filter(x=>x>0);
    if (!c.ranks.length){ showToast('Add at least one spell rank (or Clear cell)','error'); return; }
    c.maxRank = c.ranks.length;
    const m0 = _talMeta[c.ranks[0]] || {};   // keep the grid icon/name in sync with rank 1
    if (m0.icon) c.icon = m0.icon;
    if (m0.name) c.name = m0.name;
    c.prereqTalent = parseInt(document.getElementById('tal-prereq').value)||0;
    c.prereqRank = parseInt(document.getElementById('tal-prereq-rank').value)||0;
    c.reqSpell = parseInt(document.getElementById('tal-reqspell').value)||0;
    c.flags = parseInt(document.getElementById('tal-flags').value)||0;
    c.tier = _talEdit.tier; c.col = _talEdit.col;
    const tab = _tal.tabs.find(t => t.id === _talEdit.tabId);
    tab.cells[_talKey(_talEdit.tier, _talEdit.col)] = c;
    document.getElementById('tal-modal').remove();
    talentRenderBook();
  }

  // ── Save + Patch ────────────────────────────────────────────────────────────
  async function talentSavePatch(btn, force){
    // Guard 1: never save before the tree finished loading (that would wipe the DBC).
    if (!_tal.loaded || !_tal.tabs.length){
      showToast('Tree not loaded yet — open a class first','error'); return;
    }
    // Guard 2: don't save a tree that has no talents (accidental empty state).
    const empty = _tal.tabs.filter(t => Object.keys(t.cells).length === 0);
    if (empty.length && !force){
      const ok = await uiConfirm(`${empty.map(t=>t.name).join(', ')} ${empty.length>1?'have':'has'} 0 talents. `
        + `Saving now would ERASE ${empty.length>1?'those trees':'that tree'}. Save anyway?`,
        {title:'Empty tree', okText:'Save anyway', danger:true});
      if (!ok) return;
    }
    const payload = { class_mask: _tal.classMask, force: !!force, tabs: _tal.tabs.map(tab => ({
      id: tab.id,
      talents: Object.values(tab.cells).map(c => ({
        id: c.id, tier: c.tier, col: c.col, ranks: c.ranks,
        prereqTalent: c.prereqTalent, prereqRank: c.prereqRank,
        reqSpell: c.reqSpell, flags: c.flags,
      })),
    })) };
    const status = document.getElementById('talent-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳ Building…'; }
    if (status) status.textContent = 'Saving Talent.dbc + rebuilding MPQ…';
    try {
      const r = await fetch(`${API}/talent/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok){
        if (status) status.textContent = '';
        // Backend safety-stop → offer an explicit override
        if (/Safety stop/i.test(d.error||'') && !force){
          const ok = await uiConfirm(d.error + '\n\nForce the save anyway?', {title:'Safety stop', okText:'Force save', danger:true});
          if (btn){ btn.disabled = false; btn.textContent = '💾 Save + Patch'; }
          if (ok) return talentSavePatch(btn, true);
          return;
        }
        showToast(d.error||'Save failed','error'); return;
      }
      const bak = d.data.backup_created ? ' (.bak created)' : '';
      if (status) status.innerHTML = `<span style="color:#1eff00">✓ ${d.data.talents} talents written${bak} · MPQ rebuilt — restart server + relog</span>`;
      showToast(`Talents saved + patched ✓${bak}`);
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '💾 Save + Patch'; } }
  }
