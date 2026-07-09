/* item-creator.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let _icCurrentEntry = null; // null = new item
  let _icSettings = null;
  let _icEnums = null;
  let _icCurrentData = {};

  // ── Quick-fill: pick an equipment slot, then the matching equipment type.
  // Types set Class + Subclass + Material (and, for weapons / off-hand / ranged,
  // refine InventoryType via `inv`). Material: Cloth 7, Leather 8, Chain 5,
  // Plate 6, Metal 1, Wood 2, Not-Defined 0.
  const IC_ET_ARMOR = [
    {label:'Cloth',   class:4, subclass:1, material:7},
    {label:'Leather', class:4, subclass:2, material:8},
    {label:'Chain',   class:4, subclass:3, material:5},
    {label:'Plate',   class:4, subclass:4, material:6},
  ];
  const IC_ET_MAINHAND = [
    {label:'Axe (1H)',    class:2, subclass:0,  material:1, inv:21},
    {label:'Mace (1H)',   class:2, subclass:4,  material:1, inv:21},
    {label:'Sword (1H)',  class:2, subclass:7,  material:1, inv:21},
    {label:'Dagger',      class:2, subclass:15, material:1, inv:21},
    {label:'Fist Weapon', class:2, subclass:13, material:1, inv:21},
    {label:'Axe (2H)',    class:2, subclass:1,  material:1, inv:17},
    {label:'Mace (2H)',   class:2, subclass:5,  material:1, inv:17},
    {label:'Sword (2H)',  class:2, subclass:8,  material:1, inv:17},
    {label:'Polearm',     class:2, subclass:6,  material:2, inv:17},
    {label:'Staff',       class:2, subclass:10, material:2, inv:17},
  ];
  const IC_ET_OFFHAND = [
    {label:'Shield',           class:4, subclass:6,  material:1, inv:14},
    {label:'Axe (1H)',         class:2, subclass:0,  material:1, inv:22},
    {label:'Mace (1H)',        class:2, subclass:4,  material:1, inv:22},
    {label:'Sword (1H)',       class:2, subclass:7,  material:1, inv:22},
    {label:'Dagger',           class:2, subclass:15, material:1, inv:22},
    {label:'Fist Weapon',      class:2, subclass:13, material:1, inv:22},
    {label:'Held in Off-hand', class:4, subclass:0,  material:0, inv:23},
  ];
  const IC_ET_RANGEDSLOT = [
    {label:'Bow',      class:2, subclass:2,  material:2, inv:15},
    {label:'Crossbow', class:2, subclass:18, material:2, inv:15},
    {label:'Gun',      class:2, subclass:3,  material:1, inv:15},
    {label:'Wand',     class:2, subclass:19, material:1, inv:26},
    {label:'Thrown',   class:2, subclass:16, material:1, inv:25},
    {label:'Libram',   class:4, subclass:7,  material:0, inv:28},
    {label:'Idol',     class:4, subclass:8,  material:0, inv:28},
    {label:'Totem',    class:4, subclass:9,  material:0, inv:28},
    {label:'Sigil',    class:4, subclass:10, material:0, inv:28},
  ];
  const IC_ET_AMMO = [
    {label:'Arrow',  class:6, subclass:2, material:0, inv:24},
    {label:'Bullet', class:6, subclass:3, material:0, inv:24},
  ];
  // Equipment slots in character paper-doll order. inv = base InventoryType;
  // types = equipment-type list shown once the slot is picked (null = none).
  const IC_SLOTS = [
    {label:'Head',      inv:1,  types:IC_ET_ARMOR},
    {label:'Neck',      inv:2,  types:null, auto:{class:4, subclass:0, material:4}}, // jewelry
    {label:'Shoulders', inv:3,  types:IC_ET_ARMOR},
    {label:'Back',      inv:16, types:null, auto:{class:4, subclass:1, material:7}}, // cloaks = Cloth
    {label:'Chest',     inv:5,  types:IC_ET_ARMOR},
    {label:'Shirt',     inv:4,  types:null, auto:{class:4, subclass:0, material:7}}, // cloth
    {label:'Tabard',    inv:19, types:null, auto:{class:4, subclass:0, material:7}}, // cloth
    {label:'Wrists',    inv:9,  types:IC_ET_ARMOR},
    {label:'Hands',     inv:10, types:IC_ET_ARMOR},
    {label:'Belt',      inv:6,  types:IC_ET_ARMOR},
    {label:'Legs',      inv:7,  types:IC_ET_ARMOR},
    {label:'Feet',      inv:8,  types:IC_ET_ARMOR},
    {label:'Ring',      inv:11, types:null, auto:{class:4, subclass:0, material:4}}, // jewelry
    {label:'Trinket',   inv:12, types:null, auto:{class:4, subclass:0, material:4}}, // jewelry
    {label:'Main Hand', inv:21, types:IC_ET_MAINHAND},
    {label:'Off Hand',  inv:22, types:IC_ET_OFFHAND},
    {label:'Ranged',    inv:15, types:IC_ET_RANGEDSLOT},
    {label:'Ammo',      inv:24, types:IC_ET_AMMO},
  ];
  let _icTypeGroup = null; // equipment-type list currently shown in the dropdown

  // Field types: 'text','number','float','enum','enum_sub' (subclass cascades from class), 'bitmask','displayid'
  function _icFields() {
    const statTypes = _icEnums?.statType || {};
    const stats = [];
    for (let i = 1; i <= 10; i++) {
      stats.push({n:`stat_type${i}`,  l:`Stat ${i} Type`,  t:'enum', e:statTypes, d:0});
      stats.push({n:`stat_value${i}`, l:`Stat ${i} Value`, t:'number', d:0});
    }
    return [
      {group:'Basics', fields:[
        {n:'name',          l:'Name',           t:'text'},
        {n:'description',   l:'Description',   t:'text'},
        {n:'Quality',       l:'Quality',        t:'enum', e:_icEnums?.quality, d:1},
        {n:'class',         l:'Class',          t:'enum', e:_icEnums?.class, d:4},
        {n:'subclass',      l:'Subclass',       t:'enum_sub', d:0},
        {n:'displayid',     l:'DisplayID',      t:'displayid', d:0, h:'Picker → search an existing item whose display to use'},
        {n:'InventoryType', l:'InventoryType',  t:'enum', e:_icEnums?.inventoryType, d:0},
        {n:'Material',      l:'Material',       t:'enum', e:_icEnums?.material, d:0},
        {n:'sheath',        l:'Sheathe Type',   t:'enum', e:_icEnums?.sheath, d:0},
        {n:'bonding',       l:'Bonding',        t:'enum', e:_icEnums?.bonding, d:0},
      ]},
      {group:'Requirements / Allowable', fields:[
        {n:'RequiredLevel',  l:'Required Level', t:'number', d:0},
        {n:'ItemLevel',      l:'Item Level',     t:'number', d:1},
        {n:'AllowableClass', l:'Allowable Class', t:'bitmask', e:_icEnums?.allowableClass, d:-1, h:'Choose nothing = -1 (all classes)'},
        {n:'AllowableRace',  l:'Allowable Race',  t:'bitmask', e:_icEnums?.allowableRace, d:-1, h:'Choose nothing = -1 (all races)'},
        {n:'RequiredSkill',     l:'Required Skill ID',   t:'number', d:0},
        {n:'RequiredSkillRank', l:'Required Skill Rank', t:'number', d:0},
        {n:'requiredspell',     l:'Required Spell',      t:'number', d:0},
      ]},
      {group:'Flags', fields:[
        {n:'Flags',      l:'Item Flags',  t:'bitmask', e:_icEnums?.flags,      d:0},
        {n:'FlagsExtra', l:'Flags Extra', t:'bitmask', e:_icEnums?.flagsExtra, d:0},
      ]},
      {group:'Stack/Price', fields:[
        {n:'stackable',  l:'Stack Size',          t:'number', d:1},
        {n:'BuyPrice',   l:'Buy Price (copper)',  t:'number', d:0},
        {n:'SellPrice',  l:'Sell Price (copper)', t:'number', d:0},
        {n:'BuyCount',   l:'Buy Count',           t:'number', d:1},
        {n:'maxcount',   l:'Max Count (0=unlimited)', t:'number', d:0},
      ]},
      {group:'Stats (10 Slots)', fields: stats},
      {group:'Heirloom Scaling', fields:[
        {n:'ScalingStatDistribution', l:'ScalingStatDistribution ID', t:'number', d:0, h:'References ScalingStatDistribution.dbc (for heirloom items)'},
        {n:'ScalingStatValue',        l:'ScalingStatValue (Bitmask)', t:'ssv_bitmask', d:0, h:'Choose slot type, number is a custom mask'},
      ]},
      {group:'Armor', fields:[
        {n:'armor',       l:'Armor',           t:'number', d:0},
        {n:'block',       l:'Block',           t:'number', d:0},
        {n:'MaxDurability', l:'Max Durability', t:'number', d:0},
        {n:'holy_res',    l:'Holy Resistance',   t:'number', d:0},
        {n:'fire_res',    l:'Fire Resistance',   t:'number', d:0},
        {n:'nature_res',  l:'Nature Resistance', t:'number', d:0},
        {n:'frost_res',   l:'Frost Resistance',  t:'number', d:0},
        {n:'shadow_res',  l:'Shadow Resistance', t:'number', d:0},
        {n:'arcane_res',  l:'Arcane Resistance', t:'number', d:0},
      ]},
      {group:'Weapons-Damage', fields:[
        {n:'dmg_min1',  l:'Damage 1 min',  t:'float',  d:0},
        {n:'dmg_max1',  l:'Damage 1 max',  t:'float',  d:0},
        {n:'dmg_type1', l:'Damage Type 1',  t:'enum', e:_icEnums?.dmgType, d:0},
        {n:'dmg_min2',  l:'Damage 2 min',  t:'float',  d:0},
        {n:'dmg_max2',  l:'Damage 2 max',  t:'float',  d:0},
        {n:'dmg_type2', l:'Damage Type 2',  t:'enum', e:_icEnums?.dmgType, d:0},
        {n:'delay',     l:'Delay (ms)',     t:'number', d:0},
        {n:'ammo_type', l:'Ammo Type',      t:'number', d:0},
        {n:'RangedModRange', l:'Ranged Mod Range (%)', t:'float', d:0, h:'Wands/Bows/Guns: 100 for volle Range. 0 → Shoot drops to melee.'},
      ]},
      {group:'Sockets', fields:[
        {n:'socketColor_1', l:'Socket 1 Color', t:'enum', e:_icEnums?.socketColor, d:0},
        {n:'socketColor_2', l:'Socket 2 Color', t:'enum', e:_icEnums?.socketColor, d:0},
        {n:'socketColor_3', l:'Socket 3 Color', t:'enum', e:_icEnums?.socketColor, d:0},
        {n:'socketBonus',   l:'Socket Bonus EnchantID', t:'number', d:0},
        {n:'GemProperties', l:'Gem Properties ID',      t:'number', d:0},
      ]},
      {group:'Spells (5 Slots)', fields:[
        {n:'spellid_1',      l:'Spell 1 ID',      t:'spellid', d:0, h:'z.B. 57353 = +10% XP (Heirloom-Bonus)'},
        {n:'spelltrigger_1', l:'Spell 1 Trigger', t:'number',  d:1, h:'0=OnUse, 1=OnEquip, 2=OnHit, 6=OnLearn'},
        {n:'spellid_2',      l:'Spell 2 ID',      t:'spellid', d:0},
        {n:'spelltrigger_2', l:'Spell 2 Trigger', t:'number',  d:1},
        {n:'spellid_3',      l:'Spell 3 ID',      t:'spellid', d:0},
        {n:'spelltrigger_3', l:'Spell 3 Trigger', t:'number',  d:1},
        {n:'spellid_4',      l:'Spell 4 ID',      t:'spellid', d:0},
        {n:'spelltrigger_4', l:'Spell 4 Trigger', t:'number',  d:1},
        {n:'spellid_5',      l:'Spell 5 ID',      t:'spellid', d:0},
        {n:'spelltrigger_5', l:'Spell 5 Trigger', t:'number',  d:1},
      ]},
      {group:'Container', fields:[
        {n:'ContainerSlots', l:'Bag Slots (only class=1)', t:'number', d:0},
        {n:'BagFamily',      l:'BagFamily Bitmask',       t:'number', d:0},
      ]},
      {group:'Other', fields:[
        {n:'itemset',         l:'Item Set ID',     t:'number', d:0},
        {n:'startquest',      l:'Start Quest ID',  t:'number', d:0},
        {n:'duration',        l:'Duration (s)',    t:'number', d:0},
        {n:'RandomProperty',  l:'Random Property', t:'number', d:0},
        {n:'RandomSuffix',    l:'Random Suffix',   t:'number', d:0},
        {n:'ItemLimitCategory', l:'Item Limit Category', t:'number', d:0},
      ]},
    ];
  }

  async function openItemCreateMode() {
    document.getElementById('editor-screen-landing').style.display = 'none';
    document.getElementById('editor-screen-editor').style.display  = 'none';
    document.getElementById('editor-screen-create').style.display  = '';
    await icLoadEnums();
    icNewItem();
    icLoadList();
    icLoadSettings();
  }

  async function icLoadEnums() {
    if (_icEnums) return;
    try {
      const r = await fetch(`${API}/item-create/enums`);
      const d = await r.json();
      if (d.ok) _icEnums = d.data;
    } catch(e) {}
  }

  function icBack() {
    document.getElementById('editor-screen-create').style.display = 'none';
    document.getElementById('editor-screen-landing').style.display = '';
  }

  async function icLoadSettings() {
    try {
      const r = await fetch(`${API}/item-create/settings`);
      const d = await r.json();
      if (d.ok) _icSettings = d.data;
    } catch(e) {}
  }

  async function icLoadList() {
    const box = document.getElementById('ic-list');
    box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">Loading…</div>';
    try {
      const r = await fetch(`${API}/item-create/list`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      if (!rows.length) {
        box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">No custom items yet.</div>';
        return;
      }
      box.innerHTML = rows.map(it => {
        const qc = QUALITY_COLOR[it.Quality||0]||'#fff';
        const safeName = (it.name||'?').replace(/'/g,"\\'").replace(/</g,'&lt;');
        return `<div style="padding:7px 9px;border-bottom:1px solid var(--border);font-size:0.8rem;background:${_icCurrentEntry===it.entry?'rgba(30,255,0,.08)':''};display:flex;align-items:center;gap:6px">
          <div onclick="icLoadItem(${it.entry})" style="flex:1;cursor:pointer;min-width:0">
            <div style="color:${qc};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}</div>
            <div style="color:var(--muted);font-size:0.7rem">#${it.entry} · iL${it.ItemLevel||0}</div>
          </div>
          <button onclick="icDeleteFromList(${it.entry},'${safeName}')" title="Delete"
            style="background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:3px 6px;cursor:pointer;font-size:0.78rem;flex-shrink:0">🗑</button>
        </div>`;
      }).join('');
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function icNewItem() {
    _icCurrentEntry = null;
    document.getElementById('ic-entry-badge').textContent = 'New ID will be assigned';
    document.getElementById('ic-status').textContent = '';
    try {
      const r = await fetch(`${API}/item-create/next-id`);
      const d = await r.json();
      if (d.ok) {
        document.getElementById('ic-entry-badge').textContent = `New Entry: #${d.data.next_id} (auto)`;
        _icCurrentEntry = d.data.next_id;
      }
    } catch(e) {}
    icRenderForm({});
  }

  async function icLoadItem(entry) {
    _icCurrentEntry = entry;
    document.getElementById('ic-entry-badge').textContent = `Edit: #${entry}`;
    document.getElementById('ic-status').textContent = '';
    try {
      const r = await fetch(`${API}/item/${entry}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      icRenderForm(d.data || {});
    } catch(e) { showToast('Server offline','error'); }
    icLoadList();
  }

  function _icRenderHeirloomPicker() {
    const tpls = _icEnums?.heirloomTemplates || [];
    // Left: existing item-named templates
    const groups = {};
    tpls.forEach((t, i) => (groups[t.group] = groups[t.group] || []).push({...t, _i:i}));
    let leftOpts = `<option value="">— Item-Template (SSD + SSV + Spell) —</option>`;
    for (const g of Object.keys(groups)) {
      leftOpts += `<optgroup label="${_icEsc(g)}">`;
      for (const t of groups[g]) {
        leftOpts += `<option value="${t._i}">${_icEsc(t.label)} · SSD=${t.ssd} SSV=${t.ssv}</option>`;
      }
      leftOpts += `</optgroup>`;
    }

    // Right: SSD-based templates (loaded async, level-aware)
    const lvlSel = (_icSsdLevel || 80);
    return `<div style="margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:0.7rem;color:var(--cyan);text-transform:uppercase;letter-spacing:.04em">⭐ Item-Template (Original-Items)</label>
          <select onchange="_icApplyHeirloomTemplate(this.value);this.value=''" style="${_icInputStyle()};border-color:var(--cyan)">
            ${leftOpts}
          </select>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label style="font-size:0.7rem;color:#1eff00;text-transform:uppercase;letter-spacing:.04em">🆕 SSD-Stat-Template</label>
            <label style="font-size:0.65rem;color:var(--muted)">Level
              <select id="ic-ssd-level" onchange="_icSetSsdLevel(this.value)"
                style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:monospace;font-size:0.7rem;padding:1px 4px;border-radius:3px">
                ${[1,30,50,60,70,80].map(l=>`<option value="${l}"${l===lvlSel?' selected':''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>
          <select id="ic-ssd-template-sel" onchange="_icApplySsdTemplate(this.value);this.value=''" style="${_icInputStyle()};border-color:#1eff00">
            <option value="">— loading…  (Level ${lvlSel}) —</option>
          </select>
        </div>
      </div>
    </div>`;
  }

  let _icSsdLevel = parseInt(localStorage.getItem('ic_ssd_level') || '80');
  let _icSsdTemplates = [];

  function _icSetSsdLevel(lvl) {
    _icSsdLevel = parseInt(lvl) || 80;
    try { localStorage.setItem('ic_ssd_level', String(_icSsdLevel)); } catch(e) {}
    _icLoadSsdTemplates();
  }

  async function _icLoadSsdTemplates() {
    const sel = document.getElementById('ic-ssd-template-sel');
    if (!sel) return;
    sel.innerHTML = `<option value="">— loading… —</option>`;
    try {
      const r = await fetch(`${API}/item-create/ssd-templates?level=${_icSsdLevel}`);
      const d = await r.json();
      if (!d.ok) { sel.innerHTML = `<option value="">Error: ${d.error}</option>`; return; }
      _icSsdTemplates = d.data.templates || [];
      const groups = {};
      _icSsdTemplates.forEach((t, i) => (groups[t.group] = groups[t.group] || []).push({...t, _i:i}));
      const order = ["Strength","Agility / AP","Intellect / Spell","Spirit / Healer","PvP / Resilience","Other"];
      let opts = `<option value="">— SSD-Stat-Template @ Level ${d.data.level} (only SSD) —</option>`;
      for (const g of order) {
        if (!groups[g]) continue;
        opts += `<optgroup label="${_icEsc(g)}">`;
        for (const t of groups[g]) {
          opts += `<option value="${t._i}">${_icEsc(t.label)}</option>`;
        }
        opts += `</optgroup>`;
      }
      sel.innerHTML = opts;
    } catch(e) { sel.innerHTML = `<option value="">Server offline</option>`; }
  }

  function _icApplySsdTemplate(idx) {
    if (idx === '') return;
    const t = _icSsdTemplates[parseInt(idx)];
    if (!t) return;
    const ssdEl = document.getElementById('ic-ScalingStatDistribution');
    const ssvEl = document.getElementById('ic-ScalingStatValue');
    if (ssdEl) ssdEl.value = t.ssd;
    if (ssvEl) { if (ssvEl.tagName === 'SELECT') _icSsvSetValue(ssvEl, t.canonical_ssv || 0); else ssvEl.value = t.canonical_ssv || 0; }
    // Quality = Heirloom
    const qEl = document.getElementById('ic-Quality');
    if (qEl) qEl.value = 7;
    showToast(`SSD #${t.ssd} + SSV ${t.canonical_ssv} applied`);
  }

  function _icApplyHeirloomTemplate(idx) {
    if (idx === '') return;
    const t = (_icEnums?.heirloomTemplates || [])[parseInt(idx)];
    if (!t) return;
    const ssdEl = document.getElementById('ic-ScalingStatDistribution');
    const ssvEl = document.getElementById('ic-ScalingStatValue');
    if (ssdEl) ssdEl.value = t.ssd;
    if (ssvEl) { if (ssvEl.tagName === 'SELECT') _icSsvSetValue(ssvEl, t.ssv); else ssvEl.value = t.ssv; }
    // Quality auto on 7 (Heirloom)
    const qEl = document.getElementById('ic-Quality');
    if (qEl) qEl.value = 7;
    // Spellid_1 + Trigger=1 (OnEquip) apply (also if 0 → clears existing template traces)
    const spEl  = document.getElementById('ic-spellid_1');
    const trEl  = document.getElementById('ic-spelltrigger_1');
    if (spEl) spEl.value = t.spellid_1 != null ? t.spellid_1 : 0;
    if (trEl) trEl.value = (t.spellid_1 && t.spellid_1 > 0) ? 1 : 0;
    showToast(`Template applied: ${t.label}`);
  }

  function _icRenderSubclass(value, classOverride) {
    let classVal;
    if (classOverride != null) {
      classVal = parseInt(classOverride);
    } else {
      const el = document.getElementById('ic-class');
      classVal = el ? parseInt(el.value) : parseInt(_icCurrentData?.class != null ? _icCurrentData.class : 4);
    }
    const subMap = (_icEnums?.subclass || {})[classVal] || (_icEnums?.subclass || {})[String(classVal)] || {};
    return _icRenderEnum('subclass', subMap, value);
  }

  function _icOnClassChange() {
    const wrap = document.getElementById('ic-subclass-wrap');
    if (wrap) wrap.innerHTML = _icRenderSubclass(0);
  }

  // ── Quick-fill preset bar (top of the create form) ──────────────────────────
  // Slot dropdown drives the InventoryType; the Equipment-type dropdown then
  // cascades to the subclasses valid for that slot and fills Class/Subclass/Material.
  function _icTypeOptions(group) {
    if (!group) return '<option value="">— n/a —</option>';
    return '<option value="">— Equipment type —</option>' +
      group.map((t, i) => `<option value="${i}">${_icEsc(t.label)}</option>`).join('');
  }

  function _icRenderPresetBar() {
    const slotOpts = '<option value="">— Slot —</option>' +
      IC_SLOTS.map((s, i) => `<option value="${i}">${_icEsc(s.label)}</option>`).join('');
    _icTypeGroup = IC_ET_ARMOR; // sensible default until a slot is picked
    return `<div style="background:var(--bg);border:1px solid #1eff00;border-radius:6px;padding:10px 14px;margin-bottom:10px">
      <div style="color:#1eff00;font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">✨ Quick fill</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">
        <div><label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Equipment slot</label>
          <select id="ic-preset-slot" onchange="icApplyPresetSlot()" style="${_icInputStyle()}">${slotOpts}</select></div>
        <div><label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Equipment type</label>
          <select id="ic-preset-armor" onchange="icApplyPresetArmor()" style="${_icInputStyle()}">${_icTypeOptions(IC_ET_ARMOR)}</select></div>
      </div>
      <div style="font-size:0.62rem;color:var(--muted);margin-top:6px">Auto-fills InventoryType · Class · Subclass · Material in the Basics below.</div>
    </div>`;
  }

  function icApplyPresetSlot() {
    const v = document.getElementById('ic-preset-slot').value;
    const slot = (v === '') ? null : IC_SLOTS[parseInt(v)];
    if (slot) {
      const inv = document.getElementById('ic-InventoryType');
      if (inv) inv.value = String(slot.inv);
      // slots with a fixed equipment type (e.g. Back = Cloth) fill it right away
      if (slot.auto) {
        const clsEl = document.getElementById('ic-class');
        if (clsEl) { clsEl.value = String(slot.auto.class); _icOnClassChange(); }
        const subEl = document.getElementById('ic-subclass');
        if (subEl) subEl.value = String(slot.auto.subclass);
        const matEl = document.getElementById('ic-Material');
        if (matEl) matEl.value = String(slot.auto.material);
      }
    }
    // re-scope the equipment-type dropdown to what fits this slot
    const group = slot ? slot.types : IC_ET_ARMOR;
    _icTypeGroup = group;
    const typeSel = document.getElementById('ic-preset-armor');
    if (typeSel) {
      typeSel.innerHTML = _icTypeOptions(group);
      typeSel.disabled = !group;
    }
    if (slot) showToast(`Slot → ${slot.label}`);
  }

  function icApplyPresetArmor() {
    const idx = document.getElementById('ic-preset-armor').value;
    if (idx === '' || !_icTypeGroup) return;
    const P = _icTypeGroup[parseInt(idx)];
    if (!P) return;
    const clsEl = document.getElementById('ic-class');
    if (clsEl) { clsEl.value = String(P.class); _icOnClassChange(); } // rebuild subclass options for the class
    const subEl = document.getElementById('ic-subclass');
    if (subEl) subEl.value = String(P.subclass);
    const matEl = document.getElementById('ic-Material');
    if (matEl) matEl.value = String(P.material);
    if (P.inv != null) { const inv = document.getElementById('ic-InventoryType'); if (inv) inv.value = String(P.inv); }
    showToast(`Type → ${P.label}`);
  }

  function icRenderForm(data) {
    _icCurrentData = data || {};
    const box = document.getElementById('ic-form');
    let html = _icRenderPresetBar();
    for (const grp of _icFields()) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${grp.group}</div>`;
      if (grp.group === 'Heirloom Scaling') html += _icRenderHeirloomPicker();
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">`;
      for (const f of grp.fields) {
        const v = data[f.n] != null ? data[f.n] : (f.d != null ? f.d : '');
        const hint = f.h ? `<div style="font-size:0.62rem;color:var(--muted);margin-top:2px">${f.h}</div>` : '';
        let inputHtml = '';
        if (f.t === 'displayid') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="ic-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="icPickDisplay()">🔍 Pick</button>
          </div>`;
        } else if (f.t === 'ssv_bitmask') {
          const masks = _icEnums?.ssvBitmasks || [];
          const curVal = parseInt(v) || 0;
          let opts = '';
          let matched = false;
          for (const m of masks) {
            const sel = (parseInt(m.value) === curVal) ? ' selected' : '';
            if (sel) matched = true;
            opts += `<option value="${m.value}"${sel}>${_icEsc(m.label)}</option>`;
          }
          // Custom option — if current value isn't in known list, prepend a Custom entry as selected
          if (!matched && curVal) {
            opts = `<option value="${curVal}" selected>${curVal} — Custom mask</option>` + opts;
          }
          opts += `<option value="__custom__">Custom mask (enter number…)</option>`;
          inputHtml = `<select id="ic-${f.n}" onchange="_icSsvMaskChange(this, 'ic-${f.n}')" style="${_icInputStyle()}">${opts}</select>`;
        } else if (f.t === 'spellid') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="ic-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="icPickSpell('${f.n}')">🔍 Pick</button>
          </div>`;
        } else if (f.t === 'enum') {
          const onchange = (f.n === 'class') ? ' onchange="_icOnClassChange()"' : '';
          inputHtml = _icRenderEnum(f.n, f.e || {}, v).replace('<select ', `<select${onchange} `);
        } else if (f.t === 'enum_sub') {
          const classFromData = (data && data.class != null) ? data.class : 4;
          inputHtml = `<div id="ic-subclass-wrap">${_icRenderSubclass(v, classFromData)}</div>`;
        } else if (f.t === 'bitmask') {
          inputHtml = _icRenderBitmask(f.n, f.e || {}, v);
        } else {
          const step = (f.t === 'float') ? ' step="0.01"' : '';
          const typ = (f.t === 'number' || f.t === 'float') ? 'number' : 'text';
          inputHtml = `<input id="ic-${f.n}" value="${_icEsc(v)}" type="${typ}"${step} style="${_icInputStyle()}">`;
        }
        html += `<div>
          <label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${f.l}</label>
          ${inputHtml}${hint}
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<div style="display:flex;gap:8px;margin-top:14px">
      <button class="e-btn e-btn-green" onclick="icSave()">💾 Save → DB + DBC + MPQ</button>
      ${_icCurrentEntry ? `<button class="e-btn e-btn-red" onclick="icDelete()">🗑 Delete</button>` : ''}
    </div>`;
    box.innerHTML = html;
    // Trigger SSD templates load if the picker is in the DOM
    if (document.getElementById('ic-ssd-template-sel')) _icLoadSsdTemplates();
  }

  function icPickDisplay() {
    openItemSearchModal('🖼 Clone display from an item', async (entry, name) => {
      try {
        const r = await fetch(`${API}/item/${entry}`);
        const d = await r.json();
        if (!d.ok) { showToast('Error while loading','error'); return; }
        document.getElementById('ic-displayid').value = d.data.displayid;
        showToast(`DisplayID ${d.data.displayid} from "${name}" applied`);
      } catch(e) { showToast('Server offline','error'); }
    });
  }

  function icPickSpell(fieldName) {
    openSpellSearchModal('🔍 Pick a spell', (sid, sn) => {
      const el = document.getElementById(`ic-${fieldName}`);
      if (el) el.value = sid;
      showToast(`Spell #${sid} "${sn}" applied`);
    });
  }

  async function icSave() {
    const payload = {entry: _icCurrentEntry};
    for (const grp of _icFields()) for (const f of grp.fields) {
      if (f.t === 'bitmask') {
        payload[f.n] = _icCollectBitmask(f.n);
        continue;
      }
      const el = document.getElementById(`ic-${f.n}`);
      if (!el) continue;
      let v = el.value;
      if (f.t === 'number' || f.t === 'displayid' || f.t === 'spellid' || f.t === 'enum' || f.t === 'enum_sub' || f.t === 'ssv_bitmask') {
        v = v === '' ? null : (parseInt(v) || 0);
      } else if (f.t === 'float') {
        v = v === '' ? null : (parseFloat(v) || 0);
      }
      payload[f.n] = v;
    }
    if (!payload.name) { showToast('Name required','error'); return; }
    document.getElementById('ic-status').textContent = 'Saving…';
    try {
      const r = await fetch(`${API}/item-create/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) {
        document.getElementById('ic-status').textContent = '';
        showToast(d.error||'Error','error'); return;
      }
      const msg = `✓ #${d.data.entry} saved · MPQ: ${d.data.mpq_path||'?'}`
                + (d.data.copied_to_client ? ' · Client-Copy ✓' : '');
      document.getElementById('ic-status').innerHTML = `<span style="color:#1eff00">${msg}</span>`;
      if (d.data.mpq_error) showToast(d.data.mpq_error, 'error');
      showToast(`Item #${d.data.entry} saved ✓`);
      icLoadList();
    } catch(e) { showToast('Server offline','error'); document.getElementById('ic-status').textContent = ''; }
  }

  async function icDelete() {
    if (!_icCurrentEntry) return;
    return icDeleteFromList(_icCurrentEntry, '');
  }

  async function icDeleteFromList(entry, name) {
    const label = name ? `"${name}" (#${entry})` : `#${entry}`;
    if (!await uiConfirm(`Delete item ${label} from the DB + Item.dbc and rebuild the MPQ patch?`,
        {title:'Delete custom item', okText:'Delete', danger:true})) return;
    try {
      const r = await fetch(`${API}/item-create/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({entry})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Item #${entry} removed ✓`);
      if (_icCurrentEntry === entry) icNewItem();
      icLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

  function icShowSettings() {
    const s = _icSettings || {};
    document.getElementById('ic-settings-modal')?.remove();
    const m = `<div id="ic-settings-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:520px;max-width:100%;padding:22px;position:relative">
        <button onclick="document.getElementById('ic-settings-modal').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="font-size:1rem;font-weight:600;color:#1eff00;margin-bottom:14px">⚙ Create Mode Settings</div>

        <label style="font-size:0.72rem;color:var(--muted);text-transform:uppercase">Client Data folder (e.g. C:\\WoW\\Data)</label>
        <input id="ic-set-client-path" value="${(s.client_data_path||'').replace(/"/g,'&quot;')}"
          placeholder="empty = build patch next to the tool"
          style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:6px 9px;margin:4px 0 4px">
        <div style="font-size:0.68rem;color:var(--muted);margin:0 0 12px">The MPQ is built in a <b>Patches\\</b> subfolder here, then copied up into Data\\ (if enabled below).</div>

        <label style="font-size:0.72rem;color:var(--muted);text-transform:uppercase">Patch filename</label>
        <input id="ic-set-patch-name" value="${(s.patch_name||'patch-Z.MPQ').replace(/"/g,'&quot;')}"
          style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:6px 9px;margin:4px 0 12px">

        <label style="font-size:0.78rem;color:var(--text);display:flex;align-items:center;gap:8px;margin:8px 0 14px">
          <input id="ic-set-auto-copy" type="checkbox" ${s.auto_copy_patch?'checked':''}> Copy patch to client automatically after save
        </label>

        <button class="e-btn e-btn-green" onclick="icSaveSettings()">💾 Save</button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', m);
  }

  async function icSaveSettings() {
    const payload = {
      patch_name:       document.getElementById('ic-set-patch-name')?.value || 'patch-Z.MPQ',
      client_data_path: document.getElementById('ic-set-client-path')?.value || '',
      auto_copy_patch:  document.getElementById('ic-set-auto-copy')?.checked || false,
    };
    try {
      const r = await fetch(`${API}/item-create/settings`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      _icSettings = d.data;
      showToast('Settings saved ✓');
      document.getElementById('ic-settings-modal')?.remove();
    } catch(e) { showToast('Server offline','error'); }
  }

