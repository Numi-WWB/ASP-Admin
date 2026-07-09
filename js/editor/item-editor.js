/* item-editor.js — extracted from ASP_Admin.html (verbatim) */
  const FIELD_GROUPS = [
    { key: 'basis', label: '⚔ Basics', open: true, fields: [
      { name: 'entry',       label: 'Entry ID',       type: 'number' },
      { name: 'name',        label: 'Name',           type: 'text', wide: true },
      { name: 'displayid',   label: 'Display ID',     type: 'number' },
      { name: 'Quality',     label: 'Quality',       type: 'select', options: QUALITY_NAMES },
      { name: 'class',       label: 'Class',         type: 'select', optObj: CLASS_NAMES },
      { name: 'subclass',    label: 'Subclass',      type: 'number' },
      { name: 'InventoryType', label: 'Inventory Type', type: 'select', optObj: INVTYPE_NAMES },
      { name: 'bonding',     label: 'Binding',        type: 'select', options: BONDING_NAMES },
      { name: 'Material',    label: 'Material',       type: 'select', optObj: MATERIAL_NAMES },
      { name: 'sheath',      label: 'Sheath',         type: 'select', optObj: SHEATH_NAMES },
      { name: 'BuyCount',    label: 'Buy Count',      type: 'number' },
      { name: 'BuyPrice',    label: 'Buy Price',      type: 'number' },
      { name: 'SellPrice',   label: 'Sell Price',     type: 'number' },
      { name: 'maxcount',    label: 'Max Count',      type: 'number' },
      { name: 'stackable',   label: 'Stackable',      type: 'number' },
      { name: 'ContainerSlots', label: 'Container Slots', type: 'number' },
      { name: 'description', label: 'Description',   type: 'text', wide: true },
      { name: 'SoundOverrideSubclass', label: 'Sound Override Subclass', type: 'number' },
    ]},
    { key: 'requirements', label: '📋 Requirements', open: false, fields: [
      { name: 'RequiredLevel',             label: 'Required Level',        type: 'number' },
      { name: 'ItemLevel',                 label: 'Item Level',            type: 'number' },
      { name: 'AllowableClass',            label: 'Allowable Class',       type: 'bitmask', bits: 'WOW_CLASS_BITS' },
      { name: 'AllowableRace',             label: 'Allowable Race',        type: 'bitmask', bits: 'WOW_RACE_BITS'  },
      { name: 'RequiredSkill',             label: 'Required Skill',        type: 'number' },
      { name: 'RequiredSkillRank',         label: 'Required Skill Rank',   type: 'number' },
      { name: 'requiredspell',             label: 'Required Spell',        type: 'number' },
      { name: 'requiredhonorrank',         label: 'Required Honor Rank',   type: 'number' },
      { name: 'RequiredCityRank',          label: 'Required City Rank',    type: 'number' },
      { name: 'RequiredReputationFaction', label: 'Rep Faction',           type: 'number' },
      { name: 'RequiredReputationRank',    label: 'Rep Rank',              type: 'select', optObj: REP_RANK_NAMES },
    ]},
    { key: 'stats', label: '📊 Stats', open: false, fields: [
      { name: 'stat_type1',  label: 'Stat 1 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value1', label: 'Stat 1 Value', type: 'number' },
      { name: 'stat_type2',  label: 'Stat 2 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value2', label: 'Stat 2 Value', type: 'number' },
      { name: 'stat_type3',  label: 'Stat 3 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value3', label: 'Stat 3 Value', type: 'number' },
      { name: 'stat_type4',  label: 'Stat 4 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value4', label: 'Stat 4 Value', type: 'number' },
      { name: 'stat_type5',  label: 'Stat 5 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value5', label: 'Stat 5 Value', type: 'number' },
      { name: 'stat_type6',  label: 'Stat 6 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value6', label: 'Stat 6 Value', type: 'number' },
      { name: 'stat_type7',  label: 'Stat 7 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value7', label: 'Stat 7 Value', type: 'number' },
      { name: 'stat_type8',  label: 'Stat 8 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value8', label: 'Stat 8 Value', type: 'number' },
      { name: 'stat_type9',  label: 'Stat 9 Type',  type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value9', label: 'Stat 9 Value', type: 'number' },
      { name: 'stat_type10', label: 'Stat 10 Type', type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value10',label: 'Stat 10 Value',type: 'number' },
      { name: 'ScalingStatDistribution', label: 'Scaling Stat Distribution', type: 'number' },
      { name: 'ScalingStatValue',        label: 'Scaling Stat Value',        type: 'number' },
    ]},
    { key: 'damage', label: '⚔ Damage & Armor', open: false, fields: [
      { name: 'dmg_min1',    label: 'DMG Min 1',  type: 'number' },
      { name: 'dmg_max1',    label: 'DMG Max 1',  type: 'number' },
      { name: 'dmg_type1',   label: 'DMG Type 1', type: 'select', optObj: DMG_TYPES },
      { name: 'dmg_min2',    label: 'DMG Min 2',  type: 'number' },
      { name: 'dmg_max2',    label: 'DMG Max 2',  type: 'number' },
      { name: 'dmg_type2',   label: 'DMG Type 2', type: 'select', optObj: DMG_TYPES },
      { name: 'delay',       label: 'Delay (ms)', type: 'number' },
      { name: 'armor',       label: 'Armor',      type: 'number' },
      { name: 'block',       label: 'Block',      type: 'number' },
      { name: 'ammo_type',   label: 'Ammo Type',  type: 'select', optObj: AMMO_TYPE_NAMES },
      { name: 'RangedModRange',        label: 'Ranged Mod Range', type: 'number' },
      { name: 'ArmorDamageModifier',   label: 'Armor DMG Modifier', type: 'number' },
    ]},
    { key: 'resistances', label: '🛡 Resistances', open: false, fields: [
      { name: 'holy_res',   label: 'Holy',   type: 'number' },
      { name: 'fire_res',   label: 'Fire',   type: 'number' },
      { name: 'nature_res', label: 'Nature', type: 'number' },
      { name: 'frost_res',  label: 'Frost',  type: 'number' },
      { name: 'shadow_res', label: 'Shadow', type: 'number' },
      { name: 'arcane_res', label: 'Arcane', type: 'number' },
    ]},
    { key: 'sockets', label: '💎 Sockets', open: false, fields: [
      { name: 'socketColor_1',   label: 'Socket Color 1',   type: 'select', optObj: SOCKET_COLOR_NAMES },
      { name: 'socketContent_1', label: 'Socket Content 1', type: 'number' },
      { name: 'socketColor_2',   label: 'Socket Color 2',   type: 'select', optObj: SOCKET_COLOR_NAMES },
      { name: 'socketContent_2', label: 'Socket Content 2', type: 'number' },
      { name: 'socketColor_3',   label: 'Socket Color 3',   type: 'select', optObj: SOCKET_COLOR_NAMES },
      { name: 'socketContent_3', label: 'Socket Content 3', type: 'number' },
      { name: 'socketBonus',     label: 'Socket Bonus',     type: 'number' },
      { name: 'GemProperties',   label: 'Gem Properties',   type: 'number' },
    ]},
    { key: 'spells', label: '✨ Spells (1–5)', open: false, fields: [
      { name: 'spellid_1',              label: 'Spell 1 ID',       type: 'number' },
      { name: 'spelltrigger_1',         label: 'Spell 1 Trigger',  type: 'select', optObj: TRIGGER_NAMES },
      { name: 'spellcharges_1',         label: 'Spell 1 Charges',  type: 'number' },
      { name: 'spellppmRate_1',         label: 'Spell 1 PPM',      type: 'number' },
      { name: 'spellcooldown_1',        label: 'Spell 1 CD (ms)',  type: 'number' },
      { name: 'spellcategory_1',        label: 'Spell 1 Cat',      type: 'number' },
      { name: 'spellcategorycooldown_1',label: 'Spell 1 Cat CD',   type: 'number' },
      { name: 'spellid_2',              label: 'Spell 2 ID',       type: 'number' },
      { name: 'spelltrigger_2',         label: 'Spell 2 Trigger',  type: 'select', optObj: TRIGGER_NAMES },
      { name: 'spellcharges_2',         label: 'Spell 2 Charges',  type: 'number' },
      { name: 'spellppmRate_2',         label: 'Spell 2 PPM',      type: 'number' },
      { name: 'spellcooldown_2',        label: 'Spell 2 CD (ms)',  type: 'number' },
      { name: 'spellcategory_2',        label: 'Spell 2 Cat',      type: 'number' },
      { name: 'spellcategorycooldown_2',label: 'Spell 2 Cat CD',   type: 'number' },
      { name: 'spellid_3',              label: 'Spell 3 ID',       type: 'number' },
      { name: 'spelltrigger_3',         label: 'Spell 3 Trigger',  type: 'select', optObj: TRIGGER_NAMES },
      { name: 'spellcharges_3',         label: 'Spell 3 Charges',  type: 'number' },
      { name: 'spellppmRate_3',         label: 'Spell 3 PPM',      type: 'number' },
      { name: 'spellcooldown_3',        label: 'Spell 3 CD (ms)',  type: 'number' },
      { name: 'spellcategory_3',        label: 'Spell 3 Cat',      type: 'number' },
      { name: 'spellcategorycooldown_3',label: 'Spell 3 Cat CD',   type: 'number' },
      { name: 'spellid_4',              label: 'Spell 4 ID',       type: 'number' },
      { name: 'spelltrigger_4',         label: 'Spell 4 Trigger',  type: 'select', optObj: TRIGGER_NAMES },
      { name: 'spellcharges_4',         label: 'Spell 4 Charges',  type: 'number' },
      { name: 'spellppmRate_4',         label: 'Spell 4 PPM',      type: 'number' },
      { name: 'spellcooldown_4',        label: 'Spell 4 CD (ms)',  type: 'number' },
      { name: 'spellcategory_4',        label: 'Spell 4 Cat',      type: 'number' },
      { name: 'spellcategorycooldown_4',label: 'Spell 4 Cat CD',   type: 'number' },
      { name: 'spellid_5',              label: 'Spell 5 ID',       type: 'number' },
      { name: 'spelltrigger_5',         label: 'Spell 5 Trigger',  type: 'select', optObj: TRIGGER_NAMES },
      { name: 'spellcharges_5',         label: 'Spell 5 Charges',  type: 'number' },
      { name: 'spellppmRate_5',         label: 'Spell 5 PPM',      type: 'number' },
      { name: 'spellcooldown_5',        label: 'Spell 5 CD (ms)',  type: 'number' },
      { name: 'spellcategory_5',        label: 'Spell 5 Cat',      type: 'number' },
      { name: 'spellcategorycooldown_5',label: 'Spell 5 Cat CD',   type: 'number' },
    ]},
    { key: 'flags', label: '🚩 Flags', open: false, fields: [
      { name: 'Flags',       label: 'Flags',        type: 'bitmask', bits: 'ITEM_FLAGS_BITS'  },
      { name: 'FlagsExtra',  label: 'Flags Extra',  type: 'bitmask', bits: 'ITEM_FLAGS2_BITS' },
      { name: 'flagsCustom', label: 'Flags Custom', type: 'number' },
    ]},
    { key: 'misc', label: '🗂 Misc', open: false, fields: [
      { name: 'PageText',       label: 'Page Text',        type: 'number' },
      { name: 'LanguageID',     label: 'Language ID',      type: 'select', optObj: LANGUAGE_NAMES },
      { name: 'PageMaterial',   label: 'Page Material',    type: 'select', optObj: PAGE_MATERIAL_NAMES },
      { name: 'startquest',     label: 'Start Quest',      type: 'number' },
      { name: 'lockid',         label: 'Lock ID',          type: 'number' },
      { name: 'RandomProperty', label: 'Random Property',  type: 'number' },
      { name: 'RandomSuffix',   label: 'Random Suffix',    type: 'number' },
      { name: 'itemset',        label: 'Item Set',         type: 'number' },
      { name: 'area',           label: 'Area',             type: 'number' },
      { name: 'Map',            label: 'Map',              type: 'number' },
      { name: 'BagFamily',      label: 'Bag Family',       type: 'select', optObj: BAG_FAMILY_NAMES },
      { name: 'TotemCategory',  label: 'Totem Category',   type: 'select', optObj: TOTEM_CAT_NAMES },
      { name: 'HolidayId',      label: 'Holiday ID',       type: 'number' },
      { name: 'FoodType',       label: 'Food Type',        type: 'select', optObj: FOOD_TYPE_NAMES },
    ]},
    { key: 'loot', label: '📦 Loot & Durability', open: false, fields: [
      { name: 'MaxDurability',          label: 'Max Durability',          type: 'number' },
      { name: 'minMoneyLoot',           label: 'Min Money Loot',          type: 'number' },
      { name: 'maxMoneyLoot',           label: 'Max Money Loot',          type: 'number' },
      { name: 'duration',               label: 'Duration',                type: 'number' },
      { name: 'ItemLimitCategory',      label: 'Item Limit Category',     type: 'number' },
      { name: 'RequiredDisenchantSkill',label: 'Req. Disenchant Skill',   type: 'number' },
      { name: 'DisenchantID',           label: 'Disenchant ID',           type: 'number' },
      { name: 'ScriptName',             label: 'Script Name',             type: 'text' },
      { name: 'VerifiedBuild',          label: 'Verified Build (readonly)',type: 'number', readonly: true },
    ]},
  ];

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────

  function makeSelect(options, val, fallbackObj) {
    let html = '';
    const obj = options || fallbackObj;
    // Helper: don't prepend key if label already starts with it
    const fmt = (k, label) => String(label).startsWith(String(k)) ? label : `${k} — ${label}`;
    if (Array.isArray(obj)) {
      obj.forEach((name, i) => {
        html += `<option value="${i}" ${i == val ? 'selected' : ''}>${fmt(i, name)}</option>`;
      });
    } else {
      const rawKeys = Object.keys(obj);
      const keys = rawKeys.map(k => parseInt(k)).sort((a,b)=>a-b);
      const hasVal = keys.includes(parseInt(val));
      if (!hasVal) html += `<option value="${val}" selected>${val}</option>`;
      keys.forEach(k => {
        const label = obj[k] !== undefined ? obj[k] : obj[String(k)];
        html += `<option value="${k}" ${k == parseInt(val) ? 'selected' : ''}>${fmt(k, label)}</option>`;
      });
    }
    return html;
  }

  function renderForm(data) {
    let html = '';
    FIELD_GROUPS.forEach(group => {
      const isOpen = group.open;
      html += `<div class="field-group ${isOpen ? '' : 'collapsed'}" id="fg-${group.key}">`;
      html += `<div class="field-group-header" onclick="toggleGroup('${group.key}')">`;
      html += `<span class="field-group-title">${group.label}</span>`;
      html += `<span class="field-group-chevron">▼</span>`;
      html += `</div><div class="field-group-body">`;

      group.fields.forEach(f => {
        const val = data[f.name] !== undefined ? data[f.name] : 0;
        const wideClass = f.wide ? ' e-field-wide' : '';
        html += `<div class="e-field${wideClass}"><label>${f.label}</label>`;
        html += renderField(f, val, data);
        html += `</div>`;
      });

      html += `</div></div>`;
    });
    return html;
  }

  function collectFormData() {
    const data = {};
    FIELD_GROUPS.forEach(group => {
      group.fields.forEach(f => {
        if (f.readonly) return;
        const el = document.getElementById('ef-' + f.name);
        if (!el) return;
        data[f.name] = f.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    return data;
  }

  function setFormData(data) {
    FIELD_GROUPS.forEach(group => {
      group.fields.forEach(f => {
        const el = document.getElementById('ef-' + f.name);
        if (!el) return;
        const val = data[f.name] !== undefined ? data[f.name] : 0;
        el.value = val;
      });
    });
  }

  function markDirty() {
    isDirty = true;
    document.getElementById('editor-dirty').style.display = '';
  }

  function setEntry(entry, name) {
    editorEntry = entry;
    const badge = document.getElementById('editor-entry-badge');
    badge.textContent = entry ? `Entry: ${entry}${name ? ' — ' + name : ''}` : 'No Item loaded';
    isDirty = false;
    document.getElementById('editor-dirty').style.display = 'none';
  }

  function toggleGroup(key) {
    document.getElementById('fg-' + key).classList.toggle('collapsed');
  }

  // ── Server Status ─────────────────────────────────────────────────────────

  async function checkServer() {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    try {
      const r = await fetch(API + '/status', { signal: AbortSignal.timeout(2000) });
      const d = await r.json();
      if (d.ok) {
        dot.className  = 'status-dot online';
        text.textContent = `Server online · ${d.data.item_count.toLocaleString()} Items`;
        return true;
      }
    } catch(e) {}
    dot.className  = 'status-dot offline';
    text.textContent = 'Server offline — start python asp_server.py or use !edit in the Item Tool';
    return false;
  }

  // ── Templates load ────────────────────────────────────────────────────────

  async function loadTemplates() {
    const list = document.getElementById('tpl-list');
    try {
      const r = await fetch(API + '/templates/item');
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        list.innerHTML = '<li style="color:var(--muted);font-size:0.75rem;padding:8px 10px;">No Templates found</li>';
        return;
      }
      // Categorize by weapon group
      const groups = {
        'Weapons':   ['sword_1h','sword_2h','axe_1h','axe_2h','mace_1h','mace_2h','dagger','staff','polearm','fist','bow','crossbow','gun','wand','thrown'],
        'Armor':  ['armor_plate','armor_mail','armor_leather','armor_cloth','shield','off_hand'],
        'Trinket':  ['trinket_dps','trinket_healer','trinket_tank','ring','neck','cloak'],
        'Other':['consumable_potion','quest_item'],
      };
      const bySubtype = {};
      d.data.forEach(t => bySubtype[t.subtype] = t);

      let html = '';
      for (const [grpName, subtypes] of Object.entries(groups)) {
        const matching = subtypes.filter(s => bySubtype[s]);
        if (!matching.length) continue;
        html += `<li class="tpl-group-label">${grpName}</li>`;
        matching.forEach(s => {
          const t = bySubtype[s];
          html += `<li onclick="applyTemplate('${t.subtype}')" data-subtype="${t.subtype}">${t.label}</li>`;
        });
      }
      list.innerHTML = html;
    } catch(e) {
      list.innerHTML = '<li style="color:var(--red);font-size:0.75rem;padding:8px 10px;">Server unreachable</li>';
    }
  }

  async function applyTemplate(subtype) {
    if (isDirty && !confirm('Discard unsaved changes?')) return;
    try {
      const r = await fetch(`${API}/templates/item/${subtype}`);
      const d = await r.json();
      if (!d.ok) { showToast('Template not found', 'error'); return; }

      // merge fields from all groups
      const flat = {};
      Object.values(d.data.fields).forEach(grp => Object.assign(flat, grp));

      // Render form if not present yet
      const form = document.getElementById('editor-form');
      if (!form.querySelector('.field-group')) {
        form.innerHTML = renderFormForMode(flat);
      } else {
        setFormData(flat);
      }

      // Mark template label in sidebar
      document.querySelectorAll('#tpl-list li[data-subtype]').forEach(li => {
        li.classList.toggle('active', li.dataset.subtype === subtype);
      });

      editorData = Object.assign({}, flat);
      setEntry(flat.entry || null, flat.name || null);
      isDirty = false;
      document.getElementById('editor-dirty').style.display = 'none';
      showToast(`Template "${d.data.label}" loaded`);
    } catch(e) {
      showToast('Error at Load the Template', 'error');
    }
  }

  // ── Item Search ────────────────────────────────────────────────────────────

  let searchTimeout = null;

  document.addEventListener('app:ready', () => {
    const inp = document.getElementById('item-search-input');
    if (inp) {
      inp.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          if (inp.value.trim().length >= 2) searchItems();
        }, 350);
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') searchItems(); });
    }
    document.addEventListener('click', e => {
      if (!e.target.closest('#search-results') && !e.target.closest('#item-search-input')) {
        document.getElementById('search-results').classList.remove('open');
      }
    });
  });

  async function searchItems() {
    const q = document.getElementById('item-search-input').value.trim();
    if (!q) return;
    const results = document.getElementById('search-results');
    results.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem;">Search…</div>';
    results.classList.add('open');
    try {
      const r = await fetch(`${API}/item/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        results.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem;">No results</div>';
        return;
      }
      const qColors = ['#9d9d9d','#ffffff','#1eff00','#0070dd','#a335ee','#ff8000','#e6cc80','#e6cc80'];
      results.innerHTML = d.data.map(item => `
        <div class="search-result-item" onclick="loadItem(${item.entry})">
          <span style="color:${qColors[item.Quality]||'#fff'}">${item.name}</span>
          <span class="search-result-id">#${item.entry} · ilvl ${item.ItemLevel}</span>
        </div>
      `).join('');
    } catch(e) {
      results.innerHTML = '<div style="padding:8px 12px;color:var(--red);font-size:0.78rem;">Server unreachable</div>';
    }
  }

  async function loadItem(entry) {
    if (isDirty && !confirm('Discard unsaved changes?')) return;
    document.getElementById('search-results').classList.remove('open');
    try {
      const r = await fetch(`${API}/item/${entry}`);
      const d = await r.json();
      if (!d.ok) { showToast('Item not found', 'error'); return; }

      const form = document.getElementById('editor-form');
      form.innerHTML = renderFormForMode(d.data);
      editorData = Object.assign({}, d.data);
      setEntry(entry, d.data.name);
      document.querySelectorAll('#tpl-list li[data-subtype]').forEach(li => li.classList.remove('active'));
      showToast(`Item #${entry} loaded`);
    } catch(e) {
      showToast('Error at Load of the Items', 'error');
    }
  }

  // ── New Item ────────────────────────────────────────────────────────────

  function newItem() {
    if (isDirty && !confirm('Discard unsaved changes?')) return;
    const emptyData = {};
    FIELD_GROUPS.forEach(g => g.fields.forEach(f => { emptyData[f.name] = 0; }));
    emptyData.name = 'New Item';
    emptyData.RequiredDisenchantSkill = -1;
    emptyData.spellcooldown_1 = emptyData.spellcooldown_2 = emptyData.spellcooldown_3 = emptyData.spellcooldown_4 = emptyData.spellcooldown_5 = -1;
    emptyData.spellcategorycooldown_1 = emptyData.spellcategorycooldown_2 = emptyData.spellcategorycooldown_3 = emptyData.spellcategorycooldown_4 = emptyData.spellcategorycooldown_5 = -1;
    emptyData.SoundOverrideSubclass = -1;
    emptyData.Material = -1;
    emptyData.stackable = 1;
    emptyData.BuyCount = 1;
    document.getElementById('editor-form').innerHTML = renderFormForMode(emptyData);
    editorData = Object.assign({}, emptyData);
    setEntry(null, null);
    document.getElementById('editor-entry-badge').textContent = 'New Item — Entry setzen';
    document.querySelectorAll('#tpl-list li[data-subtype]').forEach(li => li.classList.remove('active'));
    markDirty();
  }

  // ── Save ─────────────────────────────────────────────────────────────

  async function saveItem() {
    const data = collectFormDataForMode();
    if (!data.entry) { showToast('Entry ID must set be', 'error'); return; }
    try {
      const r = await fetch(`${API}/item/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error || 'Error at Save', 'error'); return; }
      editorEntry = data.entry;
      setEntry(data.entry, data.name);
      showToast(`Item #${data.entry} ${d.data.action === 'inserted' ? 'created' : 'saved'} ✓`);
    } catch(e) {
      showToast('Server unreachable', 'error');
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function deleteItem() {
    const entryEl = document.getElementById('ef-entry');
    const entry = entryEl ? parseInt(entryEl.value) : editorEntry;
    if (!entry) { showToast('No Item loaded', 'error'); return; }
    if (entry < 100000) { showToast(`Entry ${entry} < 100000 — delete refused`, 'error'); return; }
    if (!confirm(`Delete item #${entry}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`${API}/item/${entry}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.ok) { showToast(d.error || 'Error at Delete', 'error'); return; }
      document.getElementById('editor-form').innerHTML = '<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0;">Item deleted.</p>';
      setEntry(null, null);
      showToast(`Item #${entry} deleted`);
    } catch(e) {
      showToast('Server unreachable', 'error');
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function initEditor() {
    await checkServer();
    await loadTemplates();
  }

  // ── Mode Navigation ───────────────────────────────────────────────────────

  let currentMode = 'edit';

  function goToLanding() {
    document.getElementById('editor-screen-landing').style.display = '';
    document.getElementById('editor-screen-editor').style.display  = 'none';
    editorData = {};
    isDirty = false;
  }

  async function openEditorMode(mode, preserveData) {
    currentMode = mode;
    document.getElementById('editor-screen-landing').style.display = 'none';
    document.getElementById('editor-screen-editor').style.display  = '';

    // Mode badge
    const badgeEl = document.getElementById('editor-mode-badge');
    const badges = {
      easy: '<span class="mode-badge badge-easy">🟢 Easy Edit</span>',
      edit: '<span class="mode-badge badge-edit">🟡 Edit</span>',
      pro:  '<span class="mode-badge badge-pro">🟣 Edit Pro</span>',
    };
    badgeEl.innerHTML = badges[mode] || '';

    // Update switch menu — mark active mode
    ['easy','edit','pro'].forEach(m => {
      const el = document.getElementById('sm-' + m);
      if (el) el.classList.toggle('active-mode', m === mode);
    });

    if (preserveData && Object.keys(editorData).length > 0) {
      // Re-render form with existing data — no reset
      document.getElementById('editor-form').innerHTML = renderFormForMode(editorData);
      // keep entry badge
    } else {
      // Fresh start
      document.getElementById('editor-form').innerHTML =
        '<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0;">Choose a Item or loading a Template.</p>';
      setEntry(null, null);
      editorData = {};
    }

    await checkServer();
    await loadTemplates();
  }

  function toggleSwitchMenu() {
    const menu = document.getElementById('switch-mode-menu');
    menu.style.display = menu.style.display === 'none' ? '' : 'none';
  }

  function switchMode(newMode) {
    if (newMode === currentMode) {
      document.getElementById('switch-mode-menu').style.display = 'none';
      return;
    }
    // Save current form data
    const currentData = collectFormDataForMode();
    // Merge with editorData (editorData has all fields, form only visible ones)
    editorData = Object.assign({}, editorData, currentData);
    document.getElementById('switch-mode-menu').style.display = 'none';
    openEditorMode(newMode, true);
  }

  // Close Switch-Menu at Click outside
  document.addEventListener('click', e => {
    if (!e.target.closest('#switch-mode-btn') && !e.target.closest('#switch-mode-menu')) {
      const menu = document.getElementById('switch-mode-menu');
      if (menu) menu.style.display = 'none';
    }
  });

  // ── renderForm override for modes ────────────────────────────────────────

  // Easy Edit — only core fields, flat view
  const EASY_FIELDS = [
    { section: '⚔ Basics', fields: [
      { name: 'entry',         label: 'Entry ID',       type: 'number' },
      { name: 'name',          label: 'Name',           type: 'text' },
      { name: 'displayid',     label: 'Display ID',     type: 'number' },
      { name: 'Quality',       label: 'Quality',       type: 'select', options: QUALITY_NAMES },
      { name: 'class',         label: 'Class',         type: 'select', optObj: CLASS_NAMES },
      { name: 'subclass',      label: 'Subclass',      type: 'subclass' },
      { name: 'InventoryType', label: 'Slot',           type: 'select', optObj: INVTYPE_NAMES },
      { name: 'bonding',       label: 'Binding',        type: 'select', options: BONDING_NAMES },
    ]},
    { section: '📋 Level & Price', fields: [
      { name: 'ItemLevel',     label: 'Item Level',     type: 'number' },
      { name: 'RequiredLevel', label: 'Req. Level',     type: 'number' },
      { name: 'BuyPrice',      label: 'Buy Price',      type: 'number' },
      { name: 'SellPrice',     label: 'Sell Price',  type: 'number' },
      { name: 'stackable',     label: 'Stackable',      type: 'number' },
    ]},
    { section: '📊 Stats (1–3)', fields: [
      { name: 'stat_type1',  label: 'Stat 1',       type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value1', label: 'Value 1',       type: 'number' },
      { name: 'stat_type2',  label: 'Stat 2',       type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value2', label: 'Value 2',       type: 'number' },
      { name: 'stat_type3',  label: 'Stat 3',       type: 'select', optObj: STAT_NAMES },
      { name: 'stat_value3', label: 'Value 3',       type: 'number' },
    ]},
    { section: '⚔ Damage', fields: [
      { name: 'dmg_min1',  label: 'DMG Min',    type: 'number' },
      { name: 'dmg_max1',  label: 'DMG Max',    type: 'number' },
      { name: 'dmg_type1', label: 'Damage Type',type: 'select', optObj: DMG_TYPES },
      { name: 'delay',     label: 'Delay (ms)', type: 'number' },
      { name: 'armor',     label: 'Armor',    type: 'number' },
    ]},
    { section: '📦 Loot', fields: [
      { name: 'MaxDurability', label: 'Max Durability', type: 'number' },
      { name: 'description',   label: 'Description',   type: 'text' },
    ]},
  ];

  // Shared field renderer (used by renderForm, renderFormEasy, renderFormPro)
  function renderField(f, val, data, extraStyle) {
    const sty = extraStyle ? ` style="${extraStyle}"` : '';
    const ro  = f.readonly ? ' disabled' : '';
    const roI = f.readonly ? ' readonly' : '';
    if (f.name === 'class') {
      return `<select id="ef-class" onchange="updateSubclassSelect();markDirty();"${sty}${ro}>`
        + makeSelect(null, val, CLASS_NAMES) + `</select>`;
    }
    if (f.name === 'subclass' || f.type === 'subclass') {
      const classVal = data['class'] !== undefined ? data['class'] : 0;
      const subMap   = getSubclassOptions(classVal);
      const subKeys  = Object.keys(subMap).map(Number);
      if (subKeys.length) {
        return `<select id="ef-subclass" onchange="markDirty()"${sty}>`
          + makeSubclassSelect(classVal, val) + `</select>`;
      }
      return `<input type="number" id="ef-subclass" value="${val}" oninput="markDirty()"${sty}>`;
    }
    if (f.type === 'bitmask') {
      return eBitmask(f.label, `ef-${f.name}`, eval(f.bits), val);
    }
    if (f.type === 'select') {
      return `<select id="ef-${f.name}" onchange="markDirty()"${sty}${ro}>`
        + makeSelect(f.options || f.optObj, val) + `</select>`;
    }
    if (f.type === 'text') {
      const safe = String(val).replace(/"/g, '&quot;');
      return `<input type="text" id="ef-${f.name}" value="${safe}" oninput="markDirty()"${roI}>`;
    }
    return `<input type="number" id="ef-${f.name}" value="${val}" oninput="markDirty()"${roI}>`;
  }

  function renderFormEasy(data) {
    let html = '<div class="easy-form">';
    EASY_FIELDS.forEach(section => {
      html += `<div class="easy-section-title">${section.section}</div><div class="easy-grid">`;
      section.fields.forEach(f => {
        const val = data[f.name] !== undefined ? data[f.name] : 0;
        html += `<div class="e-field"><label>${f.label}</label>${renderField(f, val, data, 'font-size:0.82rem')}</div>`;
      });
      html += '</div>';
    });
    return html + '</div>';
  }

  // Pro mode: all groups open + raw field names visible
  function renderFormPro(data) {
    let html = '';
    FIELD_GROUPS.forEach(group => {
      html += `<div class="field-group" id="fg-${group.key}">`;
      html += `<div class="field-group-header" onclick="toggleGroup('${group.key}')">`;
      html += `<span class="field-group-title">${group.label}</span><span class="field-group-chevron">▼</span>`;
      html += `</div><div class="field-group-body">`;
      group.fields.forEach(f => {
        const val = data[f.name] !== undefined ? data[f.name] : 0;
        const wideClass = f.wide ? ' e-field-wide' : '';
        html += `<div class="e-field${wideClass}">`;
        html += `<label>${f.label} <span style="color:var(--border);font-size:0.6rem">${f.name}</span></label>`;
        html += renderField(f, val, data);
        html += `</div>`;
      });
      html += `</div></div>`;
    });
    return html;
  }

  // Wrapper: chooses render function based on current mode
  function renderFormForMode(data) {
    if (currentMode === 'easy') return renderFormEasy(data);
    if (currentMode === 'pro')  return renderFormPro(data);
    return renderForm(data);  // 'edit' → Default
  }

  // collectFormData for Easy-Mode (only EASY_FIELDS)
  function collectFormDataEasy() {
    const data = {};
    EASY_FIELDS.forEach(s => s.fields.forEach(f => {
      const el = document.getElementById('ef-' + f.name);
      if (!el) return;
      data[f.name] = f.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
    }));
    return data;
  }

  function collectFormDataForMode() {
    if (currentMode === 'easy') return collectFormDataEasy();
    return collectFormData();
  }


