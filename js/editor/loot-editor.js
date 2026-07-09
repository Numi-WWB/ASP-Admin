/* loot-editor.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  const LOOT_TABLE_LABELS = {
    creature_loot_template:      '💀 Creature',
    item_loot_template:          '📦 Item',
    gameobject_loot_template:    '🪨 GameObject',
    skinning_loot_template:      '🐾 Skinning',
    pickpocketing_loot_template: '🗝️ Pickpocket',
    fishing_loot_template:       '🎣 Fishing',
    disenchant_loot_template:    '💎 Disenchant',
    spell_loot_template:         '🔮 Spell',
    mail_loot_template:          '📬 Mail',
    reference_loot_template:     '🔗 Reference',
  };
  let lootTable = 'creature_loot_template';
  let lootEntry = null;

  function initLootEditor() {
    const el = document.getElementById('loot-editor-content');
    if (!el || el.innerHTML.trim()) return; // already initialized
    renderLootTableSelector();
  }

  function renderLootTableSelector() {
    const box = document.getElementById('loot-editor-content');
    if (!box) return;
    box.innerHTML = '';
    let selHtml = Object.entries(LOOT_TABLE_LABELS).map(([t,l]) =>
      `<option value="${t}"${t===lootTable?' selected':''}>${l}</option>`
    ).join('');
    box.innerHTML = `
    <div style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <select id="loot-table-select" onchange="lootTable=this.value"
        style="background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.85rem;padding:7px 10px">
        ${selHtml}
      </select>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="loot-entry-input" type="number" placeholder="Entry ID (direct)" value="${lootEntry||''}"
          style="width:130px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.85rem;padding:7px 10px"
          onkeydown="if(event.key==='Enter')loadLootTable()">
        <span style="color:var(--muted);font-size:0.78rem">or</span>
        <input id="loot-source-search" placeholder="Search source name (Creature / Item / GO) → Pick"
          style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.85rem;padding:7px 10px"
          oninput="lootSourceSearchDebounce()">
        <div id="loot-source-results" style="position:absolute;display:none;background:var(--panel);border:1px solid var(--border);border-radius:6px;max-height:300px;overflow-y:auto;z-index:30;margin-top:38px;min-width:300px"></div>
      </div>
      <button class="e-btn" onclick="loadLootTable()">🔍 Load</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <select id="loot-template-sel" onchange="applyLootTemplate(this.value);this.value=''"
        style="background:var(--bg);border:1px solid #1eff00;border-radius:6px;color:#1eff00;font-family:'Share Tech Mono',monospace;font-size:0.78rem;padding:5px 8px">
        <option value="">— ✨ Apply loot template (loads + adds items to the entry) —</option>
      </select>
      <button class="e-btn e-btn-small" onclick="showLootCopyDialog()">📋 Copy loot table → other entry</button>
      <button class="e-btn e-btn-small e-btn-danger" onclick="clearLootEntry()">🧹 Delete all entries of this entry</button>
    </div>
    <div id="loot-table-content"></div>`;
    loadLootTemplates();
  }

  let _lootTemplates = [];
  async function loadLootTemplates() {
    if (_lootTemplates.length) { _populateLootTemplateSelect(); return; }
    try {
      const r = await fetch(`${API}/loot/templates`);
      const d = await r.json();
      if (d.ok) _lootTemplates = d.data || [];
      _populateLootTemplateSelect();
    } catch(e) {}
  }
  function _populateLootTemplateSelect() {
    const sel = document.getElementById('loot-template-sel');
    if (!sel) return;
    let opts = `<option value="">— ✨ Apply loot template —</option>`;
    for (let i = 0; i < _lootTemplates.length; i++) {
      const t = _lootTemplates[i];
      opts += `<option value="${i}">${t.label.replace(/</g,'&lt;')}</option>`;
    }
    sel.innerHTML = opts;
  }

  let _lootSourceTimer = null;
  function lootSourceSearchDebounce() {
    clearTimeout(_lootSourceTimer);
    _lootSourceTimer = setTimeout(lootSourceSearch, 250);
  }
  async function lootSourceSearch() {
    const inp = document.getElementById('loot-source-search');
    const drop = document.getElementById('loot-source-results');
    if (!inp || !drop) return;
    const q = inp.value.trim();
    if (!q) { drop.style.display = 'none'; return; }
    const sourceType = lootTable.startsWith('creature_') || lootTable === 'pickpocketing_loot_template' || lootTable === 'skinning_loot_template'
      ? 'creature'
      : lootTable.startsWith('gameobject_') || lootTable === 'fishing_loot_template'
      ? 'gameobject'
      : 'item';
    try {
      const r = await fetch(`${API}/loot/pick-source/${sourceType}?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!d.ok) { drop.style.display = 'none'; return; }
      drop.innerHTML = (d.data || []).map(s => {
        const lootEntry = s.lootEntry || s.id;
        const note = sourceType === 'creature' && s.lootid === 0 ? ' <span style="color:var(--red)">(no lootid!)</span>' : '';
        return `<div onclick="pickLootSource(${lootEntry},'${(s.name||'').replace(/'/g,"\\'")}')"
          style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:0.82rem"
          onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background=''">
          <div style="color:var(--gold)">${(s.name||'?').replace(/</g,'&lt;')}${note}</div>
          <div style="color:var(--muted);font-size:0.7rem">${sourceType} #${s.id} → Loot-Entry ${lootEntry}</div>
        </div>`;
      }).join('');
      drop.style.display = '';
    } catch(e) { drop.style.display = 'none'; }
  }
  function pickLootSource(entry, name) {
    document.getElementById('loot-entry-input').value = entry;
    document.getElementById('loot-source-search').value = name;
    document.getElementById('loot-source-results').style.display = 'none';
    loadLootTable();
  }

  async function applyLootTemplate(idxStr) {
    if (idxStr === '') return;
    const t = _lootTemplates[parseInt(idxStr)];
    if (!t) return;
    if (!lootEntry) {
      const inp = document.getElementById('loot-entry-input');
      const e = parseInt(inp?.value || 0);
      if (!e) { showToast('Load an entry first','error'); return; }
      lootEntry = e;
    }
    if (t.clear) {
      if (!confirm(`Really delete ALL ${LOOT_TABLE_LABELS[lootTable]} entries for entry ${lootEntry}?`)) return;
      try {
        const r = await fetch(`${API}/loot/${lootTable}/clear`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Entry:lootEntry})});
        const d = await r.json();
        if (!d.ok) { showToast(d.error,'error'); return; }
        showToast(`${d.data.deleted} Entries deleted`);
        loadLootTable();
      } catch(e) { showToast('Server offline','error'); }
      return;
    }
    let added = 0;
    for (const row of (t.rows || [])) {
      try {
        const payload = {Entry:lootEntry, ...row};
        const r = await fetch(`${API}/loot/${lootTable}/add`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const d = await r.json();
        if (d.ok) added++;
      } catch(e) {}
    }
    showToast(`${added} entries from template "${t.label}" added ✓`);
    if (t.note) showToast(t.note);
    loadLootTable();
  }

  async function showLootCopyDialog() {
    if (!lootEntry) { showToast('Load a source entry first','error'); return; }
    const dst = prompt(`Copy loot from entry ${lootEntry} to which target entry?`, '');
    if (!dst) return;
    const dstN = parseInt(dst);
    if (!dstN) { showToast('Invalid target ID','error'); return; }
    try {
      const r = await fetch(`${API}/loot/${lootTable}/copy`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:lootEntry,destination:dstN})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error,'error'); return; }
      showToast(`${d.data.copied} entries copied from ${lootEntry} → ${dstN} ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  let _lootAddItemTimer = null;
  function lootAddItemSearchDebounce() {
    clearTimeout(_lootAddItemTimer);
    _lootAddItemTimer = setTimeout(lootAddItemSearch, 250);
  }
  async function lootAddItemSearch() {
    const inp = document.getElementById('loot-add-item-search');
    const drop = document.getElementById('loot-add-item-results');
    if (!inp || !drop) return;
    const q = inp.value.trim();
    if (!q) { drop.style.display = 'none'; return; }
    try {
      const r = await fetch(`${API}/item/search?q=${encodeURIComponent(q)}&limit=10`);
      const d = await r.json();
      if (!d.ok || !d.data?.length) { drop.style.display = 'none'; return; }
      drop.innerHTML = d.data.map(it => {
        const qc = QUALITY_COLOR[it.Quality||0] || '#fff';
        const safe = (it.name||'?').replace(/'/g,"\\'").replace(/</g,'&lt;');
        return `<div onclick="pickLootAddItem(${it.entry},'${safe}')"
          style="padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:0.8rem"
          onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background=''">
          <span style="color:${qc}">${safe}</span>
          <span style="color:var(--muted);font-size:0.7rem;margin-left:6px">#${it.entry} · iL${it.ItemLevel||0}</span>
        </div>`;
      }).join('');
      drop.style.display = '';
    } catch(e) { drop.style.display = 'none'; }
  }
  function pickLootAddItem(entry, name) {
    document.getElementById('loot-add-item').value = entry;
    document.getElementById('loot-add-item-search').value = name;
    document.getElementById('loot-add-item-results').style.display = 'none';
  }

  async function clearLootEntry() {
    if (!lootEntry) { showToast('Load an entry first','error'); return; }
    if (!confirm(`Really delete ALL loot entries for entry ${lootEntry}?`)) return;
    try {
      const r = await fetch(`${API}/loot/${lootTable}/clear`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Entry:lootEntry})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error,'error'); return; }
      showToast(`${d.data.deleted} Entries deleted`);
      loadLootTable();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadLootTable() {
    const entryInput = document.getElementById('loot-entry-input');
    const tableSelect = document.getElementById('loot-table-select');
    if (!entryInput || !tableSelect) return;
    lootEntry = parseInt(entryInput.value);
    lootTable = tableSelect.value;
    if (!lootEntry) { showToast('Enter Entry ID','error'); return; }
    const box = document.getElementById('loot-table-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0">Loading…</div>';
    try {
      const r = await fetch(`${API}/loot/${lootTable}/${lootEntry}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      renderLootRows(d.data || []);
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderLootRows(rows) {
    const box = document.getElementById('loot-table-content');
    const QUAL = ['var(--muted)','var(--text)','var(--green)','#0ae','#a335ee','var(--orange)','var(--gold)'];
    const label = LOOT_TABLE_LABELS[lootTable] || lootTable;
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:0.82rem;color:var(--muted)">${label} Entry <span style="color:var(--gold)">${lootEntry}</span> · ${rows.length} Entries</div>
    </div>`;
    if (rows.length) {
      html += `<table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:14px">
        <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Item</th>
          <th style="padding:5px 8px;text-align:center">Chance %</th>
          <th style="padding:5px 8px;text-align:center">Min</th>
          <th style="padding:5px 8px;text-align:center">Max</th>
          <th style="padding:5px 8px;text-align:center">Group</th>
          <th style="padding:5px 8px;text-align:center">Quest</th>
          <th style="padding:5px 8px;text-align:center">Ref</th>
          <th style="padding:5px 8px;text-align:center">Action</th>
        </tr></thead><tbody>`;
      for (const row of rows) {
        const qc = QUAL[row.Quality] || QUAL[1];
        const isRef = row.Reference && row.Reference !== 0;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)" id="loot-row-${row.Item}">
          <td style="padding:5px 8px">
            <span style="color:${qc}">${isRef ? `→ Ref #${row.Reference}` : (row.item_name||'?')}</span>
            <span style="color:var(--muted);font-size:0.72rem;margin-left:6px">#${row.Item}</span>
          </td>
          <td style="padding:5px 8px;text-align:center">
            <input type="number" value="${row.Chance}" min="-100" max="100" step="0.1"
              style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:${parseFloat(row.Chance)<0?'var(--muted)':'var(--text)'};font-family:monospace;font-size:0.8rem;padding:2px 5px;text-align:center"
              id="loot-chance-${row.Item}">
          </td>
          <td style="padding:5px 8px;text-align:center">
            <input type="number" value="${row.MinCount}" min="1" max="255"
              style="width:55px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:2px 4px;text-align:center"
              id="loot-min-${row.Item}">
          </td>
          <td style="padding:5px 8px;text-align:center">
            <input type="number" value="${row.MaxCount}" min="1" max="255"
              style="width:55px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:2px 4px;text-align:center"
              id="loot-max-${row.Item}">
          </td>
          <td style="padding:5px 8px;text-align:center;color:var(--muted)">${row.GroupId||0}</td>
          <td style="padding:5px 8px;text-align:center">${row.QuestRequired ? '<span style="color:var(--gold)">✓</span>' : '<span style="color:var(--border)">—</span>'}</td>
          <td style="padding:5px 8px;text-align:center;color:var(--muted)">${row.Reference||0}</td>
          <td style="padding:5px 8px;text-align:center;white-space:nowrap">
            <button class="e-btn e-btn-small" onclick="saveLootRow(${row.Item})" style="margin-right:4px">💾</button>
            <button class="e-btn e-btn-small e-btn-danger" onclick="deleteLootRow(${row.Item})">🗑</button>
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += `<div style="color:var(--muted);font-size:0.82rem;margin-bottom:14px">No Loot for Entry ${lootEntry}.</div>`;
    }
    // Add row form
    html += `<div style="border-top:1px solid var(--border);padding-top:14px;position:relative">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Add loot entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div style="position:relative;width:220px">
          <input id="loot-add-item-search" placeholder="Search Item (Name or ID)…"
            style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px"
            oninput="lootAddItemSearchDebounce()">
          <div id="loot-add-item-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid var(--border);border-radius:5px;max-height:240px;overflow-y:auto;z-index:25;margin-top:2px"></div>
        </div>
        <input id="loot-add-item" type="number" placeholder="Item ID" title="Will be from the Picker set"
          style="width:90px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <input id="loot-add-ref" type="number" placeholder="Ref (0=no)" value="0" title="Reference-Loot-Entry"
          style="width:90px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <input id="loot-add-chance" type="number" placeholder="Chance %" value="100" step="0.1"
          style="width:90px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <input id="loot-add-min" type="number" placeholder="Min" value="1" min="1"
          style="width:60px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <input id="loot-add-max" type="number" placeholder="Max" value="1" min="1"
          style="width:60px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <input id="loot-add-group" type="number" placeholder="Group" value="0" min="0"
          style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:6px 8px">
        <label style="display:flex;align-items:center;gap:4px;color:var(--muted);font-size:0.8rem;cursor:pointer">
          <input type="checkbox" id="loot-add-quest"> Quest-only
        </label>
        <button class="e-btn e-btn-gold" onclick="addLootRow()">＋ Add</button>
      </div>
      <div style="color:var(--muted);font-size:0.72rem;margin-top:5px">Chance negativ (-X%) = group roll. Item ID 0 + Ref ≠ 0 = Reference-Entry.</div>
    </div>`;
    box.innerHTML = html;
  }

  async function saveLootRow(itemId) {
    const chance = parseFloat(document.getElementById(`loot-chance-${itemId}`)?.value||100);
    const min    = parseInt(document.getElementById(`loot-min-${itemId}`)?.value||1);
    const max    = parseInt(document.getElementById(`loot-max-${itemId}`)?.value||1);
    try {
      const r = await fetch(`${API}/loot/${lootTable}/save_row`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Entry:lootEntry,Item:itemId,Chance:chance,MinCount:min,MaxCount:max})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Loot-Entry saved ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteLootRow(itemId) {
    if (!confirm(`Item #${itemId} from the Loot remove?`)) return;
    try {
      const r = await fetch(`${API}/loot/${lootTable}/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Entry:lootEntry,Item:itemId})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Removed ✓');
      loadLootTable();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function addLootRow() {
    const item  = parseInt(document.getElementById('loot-add-item')?.value||0);
    const ref   = parseInt(document.getElementById('loot-add-ref')?.value||0);
    const chance= parseFloat(document.getElementById('loot-add-chance')?.value||100);
    const min   = parseInt(document.getElementById('loot-add-min')?.value||1);
    const max   = parseInt(document.getElementById('loot-add-max')?.value||1);
    const group = parseInt(document.getElementById('loot-add-group')?.value||0);
    const quest = document.getElementById('loot-add-quest')?.checked ? 1 : 0;
    if (!item && !ref) { showToast('Enter Item ID or reference','error'); return; }
    try {
      const r = await fetch(`${API}/loot/${lootTable}/add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Entry:lootEntry,Item:item||ref,Reference:ref,Chance:chance,QuestRequired:quest,LootMode:1,GroupId:group,MinCount:min,MaxCount:max})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${d.data.item_name||'Entry'} added ✓`);
      loadLootTable();
    } catch(e) { showToast('Server offline','error'); }
  }


