/* spell-creator.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let _scCurrentId = null;
  let _scEnums = null;
  let _scTemplates = null;
  let _scCurrentData = {};

  function _scFields() {
    const e = _scEnums || {};
    const eff = e.effect || {}, aur = e.aura || {};
    const tgt = e.implicitTarget || {}, rad = e.radiusIndex || {};
    const effectSlot = (n) => ([
      {n:`Effect_${n}`,             l:`Effect ${n}`,           t:'enum', e:eff, d:0, h:`What effect slot ${n} does — the core action (School Damage, Heal, Apply Aura, Trigger Spell…). Leave "None" to disable this slot.`},
      {n:`EffectAura_${n}`,         l:`Aura ${n} (if Apply Aura)`, t:'enum', e:aur, d:0, h:'Only used when Effect = "Apply Aura". Chooses the aura type: Periodic Damage = DoT, Periodic Heal = HoT, Mod Stat, Mod Speed, etc.'},
      {n:`EffectBasePoints_${n}`,   l:`BasePoints ${n} (Value -1)`, t:'number', d:0, h:'The effect amount minus 1. Actual value = BasePoints + 1 (plus the DieSides roll). So for "deal 50 damage" enter 49.'},
      {n:`EffectDieSides_${n}`,     l:`DieSides ${n}`,         t:'number', d:0, h:'Random roll added on top of BasePoints (1..DieSides). Use 1 for a fixed value (BasePoints+1, no roll).'},
      {n:`EffectRealPointsPerLevel_${n}`, l:`Per Level ${n}`,   t:'float',  d:0, h:'Extra value added per character level above BaseLevel (spell scaling). 0 = no level scaling.'},
      {n:`EffectAuraPeriod_${n}`,   l:`Aura Period ${n} (ms)`, t:'number', d:0, h:'Tick interval for periodic auras, in milliseconds. e.g. 3000 = a DoT/HoT that ticks every 3 seconds.'},
      {n:`ImplicitTargetA_${n}`,    l:`Target A ${n}`,         t:'enum', e:tgt, d:0, h:'Primary target selection for this effect (Self, Enemy, an Area around the caster/target, …).'},
      {n:`ImplicitTargetB_${n}`,    l:`Target B ${n}`,         t:'enum', e:tgt, d:0, h:'Secondary target selection, usually paired with Target A for area/destination effects. Often "None".'},
      {n:`EffectRadiusIndex_${n}`,  l:`Radius Idx ${n}`,       t:'enum', e:rad, d:0, h:'For area effects: the radius (from SpellRadius.dbc). Only matters when the target is an area.'},
      {n:`EffectMiscValue_${n}`,    l:`MiscValue ${n}`,        t:'number', d:0, h:'Effect-specific extra value. e.g. for "Mod Stat" it is the stat ID (-1=All, 0=Str, 1=Agi, 2=Sta, 3=Int, 4=Spi).'},
      {n:`EffectMiscValueB_${n}`,   l:`MiscValueB ${n}`,       t:'number', d:0, h:'A second effect-specific value used by a few effects (advanced). Leave 0 if unsure.'},
      {n:`EffectTriggerSpell_${n}`, l:`Trigger Spell ${n}`,    t:'spellid', d:0, h:'The spell ID cast by "Trigger Spell" effects or "Proc Trigger Spell" auras. Use the picker.'},
      {n:`EffectChainTargets_${n}`, l:`Chain Targets ${n}`,    t:'number', d:0, h:'How many targets a chaining effect hits in total (e.g. Chain Lightning). 0 = no chaining.'},
      {n:`EffectItemType_${n}`,     l:`Item Type ${n}`,        t:'number', d:0, h:'Only for the "Create Item" effect (24): the item_template.entry of the item to create.'},
    ]);

    return [
      {group:'Basics', fields:[
        {n:'Name_Lang_enUS', l:'Name (EN)',         t:'text', h:'The spell name shown in the spellbook and tooltips.'},
        {n:'Name_Lang_deDE', l:'Name (DE, optional)', t:'text', h:'Optional German name. Leave empty to fall back to the English name.'},
        {n:'NameSubtext_Lang_enUS', l:'Rank/Subtext', t:'text', h:'Small grey text under the name, e.g. "Rank 1". Optional.'},
        {n:'Description_Lang_enUS', l:'Description (EN)', t:'text', h:'The tooltip text. Supports WoW $-variables: $s1 = effect 1 value, $d = duration, $x1 = chain targets, etc.'},
        {n:'SpellIconID',    l:'SpellIcon ID',      t:'number', d:1, h:'Which icon to show (a SpellIcon.dbc ID). Re-uses an existing icon — the "Clone from Spell" picker below fills this for you.'},
        {n:'SpellVisualID_1', l:'SpellVisual ID',   t:'number', d:0, h:'The cast/impact animation (a SpellVisual.dbc ID). Re-uses an existing visual — the picker fills this too.'},
        {n:'_clone_from',    l:'Clone WHOLE spell from Spell ID', t:'spell_clone', d:0, h:'Pick any existing spell → copies EVERYTHING (school, cast time, range, cost, speed, effects, icon, visual…) into this form. Then just change the name & values and save as a new spell.'},
      ]},
      {group:'Casting / Cost', fields:[
        {n:'CastingTimeIndex', l:'Casting Time',     t:'enum', e:e.castingTimeIndex, d:1, h:'How long the cast takes (from SpellCastTimes.dbc). "Instant" = no cast bar.'},
        {n:'RangeIndex',       l:'Range',            t:'enum', e:e.rangeIndex, d:6, h:'Maximum distance to the target (from SpellRange.dbc). "Self" = only on yourself.'},
        {n:'RecoveryTime',     l:'Cooldown (ms)',    t:'number', d:0, h:'Time before the spell can be cast again, in milliseconds (1000 = 1 second). 0 = no cooldown.'},
        {n:'CategoryRecoveryTime', l:'Category CD (ms)', t:'preset', presets:[0,1000,1500,3000,5000,10000,30000], d:0, h:'A shared cooldown across a whole category of spells (advanced). Usually 0. Pick a preset or type your own.'},
        {n:'PowerType',        l:'Power Type',       t:'enum', e:e.powerType, d:0, h:'Which resource the spell costs: Mana, Rage, Energy, Focus, Runic Power, …'},
        {n:'ManaCost',         l:'Power Cost',       t:'number', d:0, h:'Flat resource cost (for the chosen Power Type). Note: Rage & Runic Power are stored ×10 (enter 100 for 10 Rage).'},
        {n:'ManaPerSecond',    l:'Power per Sec',    t:'number', d:0, h:'Resource drained per second while channeling. 0 for normal spells.'},
        {n:'DurationIndex',    l:'Duration',         t:'enum', e:e.durationIndex, d:0, h:'How long the aura/effect lasts (from SpellDuration.dbc). "infinite" = until removed.'},
        {n:'SchoolMask',       l:'School',           t:'enum', e:e.schoolMask, d:1, h:'Damage school (Physical, Fire, Frost, Shadow, …). Determines which resistance applies.'},
        {n:'Speed',            l:'Projectile Speed', t:'preset', presets:[0,15,20,24,25,28,30,35,40,50], step:'0.01', d:0, h:'How fast the missile travels toward the target. e.g. 28 for Frostbolt. 0 = instant hit (no travel time). Pick a preset or type your own.'},
        {n:'InterruptFlags',   l:'Interrupt / Move', t:'bitmask', e:e.interruptFlags, d:15, h:'When the cast gets interrupted. UNTICK “Interrupted by movement” to make the spell castable while moving. (Default 15 = like normal cast-time spells.)'},
      ]},
      {group:'Level / Scale', fields:[
        {n:'SpellLevel', l:'Spell Level (learned)', t:'number', d:1, h:'The level the spell is considered to be — used for scaling and requirements.'},
        {n:'BaseLevel',  l:'Base Level (Min)',      t:'number', d:1, h:'Minimum level for full effect; the "Per Level" scaling counts from here.'},
        {n:'MaxLevel',   l:'Max Level (0=∞)',       t:'number', d:0, h:'Level cap for the "Per Level" scaling. 0 = no cap (scales forever).'},
      ]},
      {group:'Proc / Charges', fields:[
        {n:'ProcChance',  l:'Proc Chance %',  t:'number', d:0, h:'Chance (0–100) that the proc effect triggers when a matching event happens.'},
        {n:'ProcCharges', l:'Proc Charges',   t:'number', d:0, h:'How many times the proc can fire before the aura is used up. 0 = unlimited.'},
        {n:'ProcTypeMask', l:'Proc Type Mask', t:'bitmask', e:e.procFlags, d:0, h:'WHICH events trigger the proc — tick the events (e.g. "On your melee ability", "On your harmful spell"). Combine several as needed.'},
      ]},
      {group:'Attribute (Bitmasks)', fields:[
        {n:'Attributes',    l:'Attributes',     t:'bitmask', e:e.spellAttr, d:0, h:'Core spell flags — tick the ones that apply (Passive, Ability, Ranged, Hidden, …).'},
        {n:'AttributesEx',  l:'AttributesEx',   t:'bitmask', e:e.spellAttrEx1, d:0, h:'Extra flags #1 — tick the ones you need (Channeled, No threat, Can\'t be reflected, …).'},
        {n:'AttributesEx2', l:'AttributesEx2',  t:'number',  d:0, h:'Extra flag bitmask #2 (advanced). Leave 0 unless copying a known flag value.'},
        {n:'AttributesEx3', l:'AttributesEx3',  t:'number',  d:0, h:'Extra flag bitmask #3 (advanced). Leave 0 unless copying a known flag value.'},
        {n:'AttributesEx4', l:'AttributesEx4',  t:'number',  d:0, h:'Extra flag bitmask #4 (advanced). Leave 0 unless copying a known flag value.'},
      ]},
      {group:'Equipment condition', fields:[
        {n:'EquippedItemClass',    l:'Equipped Item Class (-1=Any)',    t:'number', d:-1, h:'Requires an equipped item of this item class for the spell to work. -1 = no requirement.'},
        {n:'EquippedItemSubclass', l:'Equipped Item Subclass', t:'bitmask', e:e.equipWeaponSubclass, d:0, h:'Which weapon type(s) must be equipped (for weapon-required spells). Tick the allowed weapons. None ticked = any.'},
        {n:'EquippedItemInvTypes', l:'Equipped Item InvType',  t:'bitmask', e:e.equipInvType, d:0, h:'Which equipment slot(s) must hold the item. Tick the allowed slots. None ticked = any.'},
      ]},
      {group:'Effect 1', fields: effectSlot(1)},
      {group:'Effect 2', fields: effectSlot(2)},
      {group:'Effect 3', fields: effectSlot(3)},
    ];
  }

  async function openSpellCreateMode() {
    document.getElementById('spell-editor-screen-landing').style.display = 'none';
    document.getElementById('spell-editor-screen-editor').style.display  = 'none';
    document.getElementById('spell-editor-screen-create').style.display  = '';
    await scLoadEnums();
    await scLoadTemplates();
    scNewSpell();
    scLoadList();
  }

  function scBack() {
    document.getElementById('spell-editor-screen-create').style.display = 'none';
    document.getElementById('spell-editor-screen-landing').style.display = '';
  }

  // Build a client Spell.dbc into the MPQ patch so custom spells render client-side
  // (name, icon, cast bar, SpellVisual, tooltip). Shared by the advanced + easy creator.
  async function scRebuildMpq(btn) {
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Building Spell.dbc…'; }
    showToast('Rebuilding MPQ (writing ~50 MB Spell.dbc)…');
    try {
      const r = await fetch(`${API}/spell-create/rebuild-mpq`, { method:'POST' });
      const d = await r.json();
      if (!d.ok) { showToast(d.error || 'Rebuild failed', 'error'); }
      else {
        showToast(`✓ MPQ rebuilt — ${d.data.spells} custom spell(s)${d.data.copied_to_client ? ' + copied to client' : ''}. Restart the client & delete its Cache folder.`);
      }
    } catch(e) { showToast('Server offline', 'error'); }
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }

  async function scLoadEnums() {
    if (_scEnums) return;
    try {
      const r = await fetch(`${API}/spell-create/enums`);
      const d = await r.json();
      if (d.ok) _scEnums = d.data;
    } catch(e) {}
  }

  async function scLoadTemplates() {
    if (_scTemplates) return;
    try {
      const r = await fetch(`${API}/spell-create/templates`);
      const d = await r.json();
      if (d.ok) _scTemplates = d.data;
    } catch(e) {}
  }

  // Renders into whichever custom-spell list containers exist: #sc-list (advanced) and
  // #sc-easy-list (easy mode). Each uses its own click handler to open the spell.
  async function scLoadList() {
    const boxes = [
      { el: document.getElementById('sc-list'),      open: 'scLoadSpell' },
      { el: document.getElementById('sc-easy-list'), open: 'scEasyLoadSpell' },
    ].filter(b => b.el);
    if (!boxes.length) return;
    boxes.forEach(b => b.el.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">Loading…</div>');
    try {
      const r = await fetch(`${API}/spell-create/list`);
      const d = await r.json();
      if (!d.ok) { boxes.forEach(b => b.el.innerHTML = `<div style="color:var(--red)">${d.error}</div>`); return; }
      const rows = d.data || [];
      if (!rows.length) {
        boxes.forEach(b => b.el.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">No custom spells yet.</div>');
        return;
      }
      const rowHtml = (openFn) => rows.map(s => {
        const safeName = (s.name||'?').replace(/'/g,"\\'").replace(/</g,'&lt;');
        const rankStr = s.subtext ? ` · ${s.subtext.replace(/</g,'&lt;')}` : '';
        return `<div style="padding:7px 9px;border-bottom:1px solid var(--border);font-size:0.8rem;background:${_scCurrentId===s.ID?'rgba(30,255,0,.08)':''};display:flex;align-items:center;gap:6px">
          <div onclick="${openFn}(${s.ID})" style="flex:1;cursor:pointer;min-width:0">
            <div style="color:var(--cyan);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}${rankStr}</div>
            <div style="color:var(--muted);font-size:0.7rem">#${s.ID}</div>
          </div>
          <button onclick="scDeleteFromList(${s.ID},'${safeName}')" title="Delete"
            style="background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:3px 6px;cursor:pointer;font-size:0.78rem">🗑</button>
        </div>`;
      }).join('');
      boxes.forEach(b => b.el.innerHTML = rowHtml(b.open));
    } catch(e) { boxes.forEach(b => b.el.innerHTML = `<div style="color:var(--red)">${e.message}</div>`); }
  }

  async function scNewSpell() {
    _scCurrentId = null;
    document.getElementById('sc-status').textContent = '';
    try {
      const r = await fetch(`${API}/spell-create/next-id`);
      const d = await r.json();
      if (d.ok) {
        _scCurrentId = d.data.next_id;
        document.getElementById('sc-entry-badge').textContent = `New ID: #${_scCurrentId} (auto)`;
      }
    } catch(e) {}
    scRenderForm({});
  }

  async function scLoadSpell(sid) {
    _scCurrentId = sid;
    document.getElementById('sc-entry-badge').textContent = `Edit: #${sid}`;
    document.getElementById('sc-status').textContent = '';
    try {
      const r = await fetch(`${API}/spell-create/load/${sid}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      scRenderForm(d.data || {});
    } catch(e) { showToast('Server offline','error'); }
    scLoadList();
  }

  function _scInputStyle() { return _icInputStyle(); }
  function _scEsc(s){ return _icEsc(s); }

  function _scRenderTemplatePicker() {
    if (!_scTemplates || !_scTemplates.length) return '';
    let opts = `<option value="">— Choose spell template (overrides fields) —</option>`;
    for (const t of _scTemplates) {
      opts += `<option value="${t.key}">${_scEsc(t.label)}</option>`;
    }
    return `<div style="margin-bottom:10px">
      <label style="font-size:0.7rem;color:#1eff00;text-transform:uppercase;letter-spacing:.04em">✨ Template</label>
      <select onchange="scApplyTemplate(this.value);this.value=''" style="${_scInputStyle()};border-color:#1eff00">${opts}</select>
    </div>`;
  }

  function scApplyTemplate(key) {
    if (!key) return;
    const t = (_scTemplates || []).find(x => x.key === key);
    if (!t) return;
    for (const [k, v] of Object.entries(t.fields || {})) {
      const el = document.getElementById(`sc-${k}`);
      if (!el) continue;
      if (el.tagName === 'SELECT') {
        // Try matching option; if not present (e.g. number outside enum) add it
        let found = false;
        for (const o of el.options) {
          if (parseInt(o.value) === parseInt(v)) { el.value = o.value; found = true; break; }
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

  function scRenderForm(data) {
    _scCurrentData = data || {};
    const box = document.getElementById('sc-form');
    let html = _scRenderTemplatePicker();
    for (const grp of _scFields()) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${grp.group}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">`;
      for (const f of grp.fields) {
        const v = data[f.n] != null ? data[f.n] : (f.d != null ? f.d : '');
        // Info icon: hover shows what the field is for (beginner-friendly)
        const info = f.h ? ` <span title="${_scEsc(f.h)}" style="display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border:1px solid var(--cyan);border-radius:50%;color:var(--cyan);font-size:0.6rem;font-weight:700;font-style:italic;cursor:help;vertical-align:middle;line-height:1">i</span>` : '';
        let inputHtml = '';
        if (f.t === 'spell_clone') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="sc-${f.n}" value="${_scEsc(v)}" type="number" style="flex:1;${_scInputStyle()}">
            <button class="e-btn e-btn-small" onclick="scCloneVisualFromSpell()">🔍 Pick Spell</button>
          </div>`;
        } else if (f.t === 'spellid') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="sc-${f.n}" value="${_scEsc(v)}" type="number" style="flex:1;${_scInputStyle()}">
            <button class="e-btn e-btn-small" onclick="scPickSpell('${f.n}')">🔍 Pick</button>
          </div>`;
        } else if (f.t === 'enum') {
          inputHtml = _icRenderEnum(`sc-temp-${f.n}`, f.e || {}, v).replace(`id="ic-sc-temp-${f.n}"`, `id="sc-${f.n}"`);
        } else if (f.t === 'bitmask') {
          inputHtml = _icRenderBitmask(`sc-${f.n}`, f.e || {}, v);
        } else if (f.t === 'preset') {
          const step = f.step ? ` step="${f.step}"` : '';
          const opts = (f.presets||[]).map(p=>`<option value="${p}">`).join('');
          inputHtml = `<input id="sc-${f.n}" list="sc-dl-${f.n}" value="${_scEsc(v)}" type="number"${step} style="${_scInputStyle()}">`
            + `<datalist id="sc-dl-${f.n}">${opts}</datalist>`;
        } else {
          const step = (f.t === 'float') ? ' step="0.01"' : '';
          const typ = (f.t === 'number' || f.t === 'float') ? 'number' : 'text';
          inputHtml = `<input id="sc-${f.n}" value="${_scEsc(v)}" type="${typ}"${step} style="${_scInputStyle()}">`;
        }
        html += `<div>
          <label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${f.l}${info}</label>
          ${inputHtml}
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<div style="display:flex;gap:8px;margin-top:14px">
      <button class="e-btn e-btn-green" onclick="scSave()">💾 Save → spell_dbc</button>
      ${_scCurrentId ? `<button class="e-btn e-btn-red" onclick="scDelete()">🗑 Delete</button>` : ''}
    </div>`;
    box.innerHTML = html;
  }

  function scPickSpell(fieldName) {
    openSpellSearchModal('🔍 Pick a spell', (id) => {
      const el = document.getElementById(`sc-${fieldName}`);
      if (el) el.value = id;
      showToast(`Spell #${id} applied`);
    });
  }

  function scCloneVisualFromSpell() {
    openSpellSearchModal('🎨 Clone a whole spell (copies everything)', async (id) => {
      try {
        const r = await fetch(`${API}/spell-create/clone/${id}`);
        const d = await r.json();
        if (!d.ok) { showToast(d.error||'Error loading the source spell','error'); return; }
        const src = Object.assign({}, d.data);
        delete src.ID;                          // keep our new custom ID
        src._clone_from = id;
        // merge cloned values over the current form data and re-render everything
        scRenderForm(Object.assign({}, _scCurrentData, src));
        showToast(`Cloned "${src.Name_Lang_enUS||('#'+id)}" ✓ — edit & save as a new spell`);
      } catch(e) { showToast('Server offline','error'); }
    });
  }

  async function scSave() {
    const payload = {ID: _scCurrentId};
    for (const grp of _scFields()) for (const f of grp.fields) {
      if (f.n === '_clone_from') continue;  // helper field
      if (f.t === 'bitmask') { payload[f.n] = _icCollectBitmask(f.n); continue; }
      const el = document.getElementById(`sc-${f.n}`);
      if (!el) continue;
      let v = el.value;
      if (f.t === 'number' || f.t === 'enum' || f.t === 'spellid') {
        v = v === '' ? null : (parseInt(v) || 0);
      } else if (f.t === 'float' || f.t === 'preset') {
        v = v === '' ? null : (parseFloat(v) || 0);
      }
      payload[f.n] = v;
    }
    if (!payload.Name_Lang_enUS && !payload.Name_Lang_deDE) {
      showToast('Name required','error'); return;
    }
    document.getElementById('sc-status').textContent = 'Saving…';
    try {
      const r = await fetch(`${API}/spell-create/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) {
        document.getElementById('sc-status').textContent = '';
        showToast(d.error||'Error','error'); return;
      }
      document.getElementById('sc-status').innerHTML = `<span style="color:#1eff00">✓ Spell #${d.data.ID} in spell_dbc saved</span>`;
      showToast(`Spell #${d.data.ID} saved ✓ (Server reload required)`);
      scLoadList();
    } catch(e) { showToast('Server offline','error'); document.getElementById('sc-status').textContent = ''; }
  }

  async function scDelete() {
    if (!_scCurrentId) return;
    return scDeleteFromList(_scCurrentId, '');
  }

  async function scDeleteFromList(sid, name) {
    const label = name ? `"${name}" (#${sid})` : `#${sid}`;
    if (!await uiConfirm(`Delete spell ${label} from spell_dbc (+ proc/bonus/threat entries), remove it from the client Spell.dbc and rebuild the MPQ patch?`,
        {title:'Delete custom spell', okText:'Delete', danger:true})) return;
    try {
      const r = await fetch(`${API}/spell-create/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ID: sid})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Spell #${sid} removed + MPQ rebuilt ✓`);
      if (_scCurrentId === sid) scNewSpell();
      scLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

