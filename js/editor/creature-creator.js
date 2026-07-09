/* creature-creator.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let _ccCurrentEntry = null;
  let _ccEnums = null;
  let _ccTemplates = null;
  let _ccCurrentData = {};

  function _ccFields() {
    const e = _ccEnums || {};
    return [
      {group:'Basics', fields:[
        {n:'name',     l:'Name',          t:'text'},
        {n:'subname',  l:'Subname (Title)', t:'text', h:'e.g. "Innkeeper" — appears under the name'},
        {n:'IconName', l:'Icon Name',     t:'text', h:'e.g. "Speak" for gossip symbol'},
        {n:'_displayid', l:'Display ID',    t:'creature_display', d:0, h:'🔍 Pick → takes DisplayID from an existing creature'},
        {n:'_display_scale', l:'Scale',  t:'float', d:1.0},
        {n:'minlevel', l:'Min Level',     t:'number', d:1},
        {n:'maxlevel', l:'Max Level',     t:'number', d:1},
        {n:'type',     l:'Type',          t:'enum', e:e.type, d:7},
        {n:'family',   l:'Beast Family (only Beast)', t:'enum', e:e.family, d:0},
        {n:'rank',     l:'Rank',          t:'enum', e:e.rank, d:0},
      ]},
      {group:'Faction / AI / Movement', fields:[
        {n:'faction',      l:'Faction',       t:'enum', e:e.faction, d:35},
        {n:'AIName',       l:'AI Name',       t:'enum_text', e:e.aiName, d:''},
        {n:'MovementType', l:'Movement Type', t:'enum', e:e.movementType, d:0},
        {n:'unit_class',   l:'Unit Class',    t:'enum', e:e.unit_class, d:1},
      ]},
      {group:'NPC Flags (Vendor/Trainer/Quest…)', fields:[
        {n:'npcflag', l:'NPC Flags', t:'bitmask', e:e.npcflag, d:0},
      ]},
      {group:'Unit Flags', fields:[
        {n:'unit_flags', l:'Unit Flags', t:'bitmask', e:e.unitFlags, d:0},
      ]},
      {group:'Type Flags / Extra Flags', fields:[
        {n:'type_flags',  l:'Type Flags',  t:'bitmask', e:e.typeFlags, d:0},
        {n:'flags_extra', l:'Flags Extra', t:'bitmask', e:e.flagsExtra, d:0},
      ]},
      {group:'Stats / Scaling', fields:[
        {n:'HealthModifier',     l:'HP Modifier',        t:'float', d:1.0},
        {n:'ManaModifier',       l:'Mana Modifier',      t:'float', d:1.0},
        {n:'ArmorModifier',      l:'Armor Modifier',     t:'float', d:1.0},
        {n:'DamageModifier',     l:'Damage Modifier',    t:'float', d:1.0},
        {n:'ExperienceModifier', l:'XP Modifier',        t:'float', d:1.0},
        {n:'BaseAttackTime',     l:'Base Attack Time (ms)', t:'number', d:2000},
        {n:'RangeAttackTime',    l:'Range Attack Time (ms)', t:'number', d:2000},
        {n:'BaseVariance',       l:'Base Variance',      t:'float', d:1.0},
        {n:'RangeVariance',      l:'Range Variance',     t:'float', d:1.0},
        {n:'RegenHealth',        l:'Regen Health (0/1)', t:'number', d:1},
      ]},
      {group:'Speed', fields:[
        {n:'speed_walk',   l:'Walk Speed',  t:'float', d:1.0},
        {n:'speed_run',    l:'Run Speed',   t:'float', d:1.14286},
        {n:'speed_swim',   l:'Swim Speed',  t:'float', d:1.0},
        {n:'speed_flight', l:'Flight Speed',t:'float', d:1.0},
        {n:'HoverHeight',  l:'Hover Height',t:'float', d:1.0},
        {n:'detection_range', l:'Detection Range', t:'float', d:18.0},
      ]},
      {group:'Loot / Gold', fields:[
        {n:'lootid',        l:'Loot Template ID',         t:'number', d:0},
        {n:'pickpocketloot',l:'Pickpocket Loot ID',       t:'number', d:0},
        {n:'skinloot',      l:'Skin Loot ID',             t:'number', d:0},
        {n:'mingold',       l:'Min Gold (copper)',        t:'number', d:0},
        {n:'maxgold',       l:'Max Gold (copper)',        t:'number', d:0},
      ]},
      {group:'Other', fields:[
        {n:'gossip_menu_id', l:'Gossip Menu ID',     t:'number', d:0},
        {n:'VehicleId',      l:'Vehicle ID',         t:'number', d:0},
        {n:'PetSpellDataId', l:'Pet Spell Data ID',  t:'number', d:0},
        {n:'KillCredit1',    l:'Kill Credit 1',      t:'number', d:0},
        {n:'KillCredit2',    l:'Kill Credit 2',      t:'number', d:0},
        {n:'ScriptName',     l:'ScriptName',         t:'text',   d:''},
      ]},
    ];
  }

  async function openCreatureCreateMode() {
    document.getElementById('creature-editor-screen-landing').style.display = 'none';
    document.getElementById('creature-editor-screen-editor').style.display  = 'none';
    document.getElementById('creature-editor-screen-create').style.display  = '';
    await ccLoadEnums();
    await ccLoadTemplates();
    ccNewCreature();
    ccLoadList();
  }

  function ccBack() {
    document.getElementById('creature-editor-screen-create').style.display = 'none';
    document.getElementById('creature-editor-screen-landing').style.display = '';
  }

  async function ccLoadEnums() {
    if (_ccEnums) return;
    try {
      const r = await fetch(`${API}/creature-create/enums`);
      const d = await r.json();
      if (d.ok) _ccEnums = d.data;
    } catch(e) {}
  }

  async function ccLoadTemplates() {
    if (_ccTemplates) return;
    try {
      const r = await fetch(`${API}/creature-create/templates`);
      const d = await r.json();
      if (d.ok) _ccTemplates = d.data;
    } catch(e) {}
  }

  async function ccLoadList() {
    const box = document.getElementById('cc-list');
    box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">Loading…</div>';
    try {
      const r = await fetch(`${API}/creature-create/list`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      if (!rows.length) {
        box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">No custom creatures yet.</div>';
        return;
      }
      box.innerHTML = rows.map(c => {
        const safeName = (c.name||'?').replace(/'/g,"\\'").replace(/</g,'&lt;');
        const subStr = c.subname ? ` · <${c.subname.replace(/</g,'&lt;')}>` : '';
        const lvl = c.minlevel === c.maxlevel ? `L${c.minlevel}` : `L${c.minlevel}-${c.maxlevel}`;
        return `<div style="padding:7px 9px;border-bottom:1px solid var(--border);font-size:0.8rem;background:${_ccCurrentEntry===c.entry?'rgba(30,255,0,.08)':''};display:flex;align-items:center;gap:6px">
          <div onclick="ccLoadCreature(${c.entry})" style="flex:1;cursor:pointer;min-width:0">
            <div style="color:var(--orange);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}${subStr}</div>
            <div style="color:var(--muted);font-size:0.7rem">#${c.entry} · ${lvl} · disp ${c.displayid||'?'}</div>
          </div>
          <button onclick="ccDeleteFromList(${c.entry},'${safeName}')" title="Delete"
            style="background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:3px 6px;cursor:pointer;font-size:0.78rem">🗑</button>
        </div>`;
      }).join('');
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function ccNewCreature() {
    _ccCurrentEntry = null;
    document.getElementById('cc-status').textContent = '';
    try {
      const r = await fetch(`${API}/creature-create/next-id`);
      const d = await r.json();
      if (d.ok) {
        _ccCurrentEntry = d.data.next_id;
        document.getElementById('cc-entry-badge').textContent = `New Entry: #${_ccCurrentEntry} (auto)`;
      }
    } catch(e) {}
    ccRenderForm({});
  }

  async function ccLoadCreature(entry) {
    _ccCurrentEntry = entry;
    document.getElementById('cc-entry-badge').textContent = `Edit: #${entry}`;
    document.getElementById('cc-status').textContent = '';
    try {
      const r = await fetch(`${API}/creature-create/load/${entry}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      ccRenderForm(d.data || {});
    } catch(e) { showToast('Server offline','error'); }
    ccLoadList();
  }

  function _ccRenderTemplatePicker() {
    if (!_ccTemplates || !_ccTemplates.length) return '';
    let opts = `<option value="">— Choose creature template (overrides fields) —</option>`;
    for (const t of _ccTemplates) {
      opts += `<option value="${t.key}">${_icEsc(t.label)}</option>`;
    }
    return `<div style="margin-bottom:10px">
      <label style="font-size:0.7rem;color:#1eff00;text-transform:uppercase;letter-spacing:.04em">✨ Template</label>
      <select onchange="ccApplyTemplate(this.value);this.value=''" style="${_icInputStyle()};border-color:#1eff00">${opts}</select>
    </div>`;
  }

  function ccApplyTemplate(key) {
    if (!key) return;
    const t = (_ccTemplates || []).find(x => x.key === key);
    if (!t) return;
    for (const [k, v] of Object.entries(t.fields || {})) {
      // bitmask fields → set _icCollectBitmask-compatible UI
      const wrap = document.getElementById(`ic-${k}-checks`);
      if (wrap) {
        // it's a bitmask
        const allEl = document.getElementById(`ic-${k}-all`);
        if (allEl) { allEl.checked = false; _icToggleBitmaskAll(k, false); }
        wrap.querySelectorAll('input[data-bit]').forEach(cb => {
          const bit = parseInt(cb.dataset.bit);
          cb.checked = (parseInt(v) & bit) === bit;
        });
        continue;
      }
      const el = document.getElementById(`cc-${k}`);
      if (!el) continue;
      if (el.tagName === 'SELECT') {
        let found = false;
        for (const o of el.options) {
          if (String(o.value) === String(v)) { el.value = o.value; found = true; break; }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = String(v); opt.textContent = `${v} — (Template)`; opt.selected = true;
          el.appendChild(opt);
        }
      } else {
        el.value = v;
      }
    }
    showToast(`Template applied: ${t.label}`);
  }

  function ccRenderForm(data) {
    _ccCurrentData = data || {};
    const box = document.getElementById('cc-form');
    let html = _ccRenderTemplatePicker();
    for (const grp of _ccFields()) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${grp.group}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">`;
      for (const f of grp.fields) {
        const v = data[f.n] != null ? data[f.n] : (f.d != null ? f.d : '');
        const hint = f.h ? `<div style="font-size:0.62rem;color:var(--muted);margin-top:2px">${f.h}</div>` : '';
        let inputHtml = '';
        if (f.t === 'creature_display') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="cc-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="ccPickDisplay()">🔍 Pick</button>
          </div>`;
        } else if (f.t === 'enum') {
          inputHtml = _icRenderEnum(`cc-temp-${f.n}`, f.e || {}, v).replace(`id="ic-cc-temp-${f.n}"`, `id="cc-${f.n}"`);
        } else if (f.t === 'enum_text') {
          // String-keyed enum dropdown
          let opts = '';
          for (const [k, lbl] of Object.entries(f.e || {})) {
            const sel = (String(v) === k) ? ' selected' : '';
            opts += `<option value="${_icEsc(k)}"${sel}>${_icEsc(lbl)}</option>`;
          }
          inputHtml = `<select id="cc-${f.n}" style="${_icInputStyle()}">${opts}</select>`;
        } else if (f.t === 'bitmask') {
          inputHtml = _icRenderBitmask(f.n, f.e || {}, v);
        } else {
          const step = (f.t === 'float') ? ' step="0.001"' : '';
          const typ = (f.t === 'number' || f.t === 'float') ? 'number' : 'text';
          inputHtml = `<input id="cc-${f.n}" value="${_icEsc(v)}" type="${typ}"${step} style="${_icInputStyle()}">`;
        }
        html += `<div>
          <label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${f.l}</label>
          ${inputHtml}${hint}
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<div style="display:flex;gap:8px;margin-top:14px">
      <button class="e-btn e-btn-green" onclick="ccSave()">💾 Save → DB</button>
      ${_ccCurrentEntry ? `<button class="e-btn e-btn-red" onclick="ccDelete()">🗑 Delete</button>` : ''}
    </div>`;
    box.innerHTML = html;
  }

  function ccPickDisplay() {
    openCreatureSearchModal('🎭 Clone display from a creature', async (entry, name) => {
      try {
        const r = await fetch(`${API}/creature-create/pick-display?q=${entry}`);
        const d = await r.json();
        if (!d.ok) { showToast(d.error||'Error','error'); return; }
        const dEl = document.getElementById('cc-_displayid');
        const sEl = document.getElementById('cc-_display_scale');
        if (dEl) dEl.value = d.data.displayid;
        if (sEl) sEl.value = d.data.scale;
        showToast(`Display ${d.data.displayid} (Scale ${d.data.scale}) from "${name}" applied`);
      } catch(e) { showToast('Server offline','error'); }
    });
  }

  async function ccSave() {
    const payload = {entry: _ccCurrentEntry};
    for (const grp of _ccFields()) for (const f of grp.fields) {
      if (f.t === 'bitmask') { payload[f.n] = _icCollectBitmask(f.n); continue; }
      const el = document.getElementById(`cc-${f.n}`);
      if (!el) continue;
      let v = el.value;
      if (f.t === 'number' || f.t === 'enum' || f.t === 'creature_display') {
        v = v === '' ? null : (parseInt(v) || 0);
      } else if (f.t === 'float') {
        v = v === '' ? null : (parseFloat(v) || 0);
      }
      payload[f.n] = v;
    }
    if (!payload.name) { showToast('Name required','error'); return; }
    document.getElementById('cc-status').textContent = 'Saving…';
    try {
      const r = await fetch(`${API}/creature-create/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) {
        document.getElementById('cc-status').textContent = '';
        showToast(d.error||'Error','error'); return;
      }
      document.getElementById('cc-status').innerHTML = `<span style="color:#1eff00">✓ Creature #${d.data.entry} saved</span>`;
      showToast(`Creature #${d.data.entry} saved ✓ (Server reload required)`);
      ccLoadList();
    } catch(e) { showToast('Server offline','error'); document.getElementById('cc-status').textContent = ''; }
  }

  async function ccDelete() {
    if (!_ccCurrentEntry) return;
    return ccDeleteFromList(_ccCurrentEntry, '');
  }

  async function ccDeleteFromList(entry, name) {
    const label = name ? `"${name}" (#${entry})` : `#${entry}`;
    if (!confirm(`Creature ${label} from creature_template + Models/Addon/Equip remove?`)) return;
    try {
      const r = await fetch(`${API}/creature-create/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({entry})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Creature #${entry} removed ✓`);
      if (_ccCurrentEntry === entry) ccNewCreature();
      ccLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

