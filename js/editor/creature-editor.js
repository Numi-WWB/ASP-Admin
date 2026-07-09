/* creature-editor.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let creatureMode = 'easy';
  let creatureData = {};
  let creatureDirty = false;

  const CREATURE_TYPES  = {1:'Beast',2:'Dragon',3:'Demon',4:'Elemental',5:'Ghost',6:'Undead',7:'Humanoid',8:'Critter',9:'Mechanical',10:'Not Specified',11:'Totem',12:'Non-combat Pet',13:'Gas Cloud'};
  const MOVE_TYPES      = {0:'Stationary',1:'Random',2:'Waypoints'};
  const DMG_SCHOOLS     = {0:'Physical',1:'Holy',2:'Fire',3:'Nature',4:'Frost',5:'Shadow',6:'Arcane'};
  const AI_NAME_OPTIONS = ['','SmartAI','AggressorAI','CombatAI','NullCreatureAI','ReactorAI','GuardAI'];

  function goToCreatureLanding() {
    document.getElementById('creature-editor-screen-landing').style.display = '';
    document.getElementById('creature-editor-screen-editor').style.display  = 'none';
    creatureData = {}; creatureDirty = false;
  }

  function openCreatureEditor(mode) {
    creatureMode = mode;
    document.getElementById('creature-editor-screen-landing').style.display = 'none';
    document.getElementById('creature-editor-screen-editor').style.display  = '';
  }

  async function searchCreatures() {
    const q = document.getElementById('creature-search-input').value.trim();
    if (!q) return;
    const res = document.getElementById('creature-search-results');
    res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">Search…</div>';
    res.classList.add('open');
    try {
      const r = await fetch(`${API}/creature/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      if (!d.ok || !d.data.length) { res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">No results</div>'; return; }
      res.innerHTML = d.data.map(ct => `
        <div class="search-result-item" onclick="loadCreature(${ct.entry})">
          <span style="color:var(--orange)">${ct.name}</span>
          <span class="search-result-id">#${ct.entry} · Lvl ${ct.minlevel}–${ct.maxlevel}</span>
        </div>`).join('');
    } catch(e) { res.innerHTML = '<div style="padding:8px 12px;color:var(--red);font-size:0.78rem">Server offline</div>'; }
  }

  async function loadCreature(entry) {
    document.getElementById('creature-search-results').classList.remove('open');
    try {
      const r = await fetch(`${API}/creature/${entry}`);
      const d = await r.json();
      if (!d.ok) { showToast('Creature not found','error'); return; }
      creatureData = d.data;
      document.getElementById('creature-editor-form').innerHTML = renderCreatureForm(creatureData);
      document.getElementById('creature-entry-badge').textContent = `#${entry} — ${creatureData.name||''}`;
      creatureDirty = false;
      document.getElementById('creature-dirty').style.display = 'none';
      const extrasBtn = document.getElementById('creature-npc-extras-btn');
      if (extrasBtn) extrasBtn.style.display = '';
      showToast(`Creature #${entry} loaded`);
    } catch(e) { showToast('Error while loading','error'); }
  }

  function renderCreatureForm(data) {
    const v  = (k, def=0)  => data[k] !== undefined ? data[k] : def;
    const vs = (k, def='') => data[k] !== undefined ? String(data[k]) : def;
    const flt = (k, def=0) => data[k] !== undefined ? parseFloat(data[k]) : def;
    let html = '<div class="easy-form">';

    // ── Identity ──────────────────────────────────────────────────────────
    html += eSection('🐉 Identity');
    html += eField('Entry', 'ce-entry', v('entry'), 'number');
    html += eField('Name', 'ce-name', vs('name'), 'text', true);
    html += eField('Subname (Title)', 'ce-subname', vs('subname'), 'text', false, 'e.g. "Innkeeper", "Captain"');
    html += eField('Icon Name', 'ce-IconName', vs('IconName'), 'text', false, 'Cursor: Speak/Attack/…');
    html += eField('Gossip Menu ID', 'ce-gossip_menu_id', v('gossip_menu_id'), 'number', false, '→ gossip_menu.MenuID');
    html += '</div>';

    // ── Level & Flags ──────────────────────────────────────────────────────
    html += eSection('⚔️ Level & Flags');
    html += eField('Min Level', 'ce-minlevel', v('minlevel'), 'number');
    html += eField('Max Level', 'ce-maxlevel', v('maxlevel'), 'number');
    html += eField('Faction', 'ce-faction', v('faction'), 'number', false, '→ factiontemplate_dbc.ID (35=Friendly)');
    html += eSelect('Type', 'ce-type', CREATURE_TYPES, v('type'));
    html += eBitmask('NPC Flag', 'ce-npcflag', NPC_FLAG_BITS, v('npcflag'), 'Functions of the NPC');
    html += eBitmask('Type Flags', 'ce-type_flags', TYPE_FLAG_BITS, v('type_flags'));
    html += eSelect('Unit Class', 'ce-unit_class', UNIT_CLASS_NAMES, v('unit_class'));
    html += eSelect('Racial Leader', 'ce-RacialLeader', {0:'Nein',1:'Ja'}, v('RacialLeader'));
    html += '</div>';

    // ── Movement & Scale ──────────────────────────────────────────────────
    html += eSection('🏃 Movement & Scale');
    html += eField('Speed Walk', 'ce-speed_walk', flt('speed_walk',1.0), 'number', false, '1.0 = Normal');
    html += eField('Speed Run', 'ce-speed_run', flt('speed_run',1.14286), 'number', false, '1.14286 = Normal');
    html += eField('Scale', 'ce-scale', flt('scale',1.0), 'number', false, '1.0 = Normal');
    html += eSelect('Movement Type', 'ce-MovementType', MOVE_TYPES, v('MovementType'));
    html += eField('Hover Height', 'ce-HoverHeight', flt('HoverHeight',1.0));
    html += '</div>';

    // ── Combat ──────────────────────────────────────────────────────────────
    html += eSection('⚔️ Combat');
    html += eField('Base Attack Time (ms)', 'ce-BaseAttackTime', v('BaseAttackTime',2000), 'number', false, '2000 = 2.0s');
    html += eField('Range Attack Time (ms)', 'ce-RangeAttackTime', v('RangeAttackTime',2000));
    html += eSelect('Dmg School', 'ce-dmgschool', DMG_SCHOOLS, v('dmgschool'));
    html += eField('Base Variance', 'ce-BaseVariance', flt('BaseVariance',1.0), 'number', false, 'Random variation on damage (0–1)');
    html += eField('Range Variance', 'ce-RangeVariance', flt('RangeVariance',1.0));
    html += '</div>';

    // ── HP / Mana / Armor ────────────────────────────────────────────────
    html += eSection('📊 HP · Mana · Armor · Damage');
    html += eField('BaseHealthFormula', 'ce-BaseHealthFormula', flt('BaseHealthFormula',1.0), 'number', false, 'Multiplier on base HP from creature_classlevelstats');
    html += eField('BaseManaFormula', 'ce-BaseManaFormula', flt('BaseManaFormula',1.0));
    html += eField('ModHealth', 'ce-ModHealth', flt('ModHealth',1.0), 'number', false, 'Additional HP multiplier');
    html += eField('ModMana', 'ce-ModMana', flt('ModMana',1.0));
    html += eField('ModArmor', 'ce-ModArmor', flt('ModArmor',1.0));
    html += eField('ModDamage', 'ce-ModDamage', flt('ModDamage',1.0));
    html += '</div>';

    // ── Loot ───────────────────────────────────────────────────────────────
    html += eSection('💰 Loot & Gold');
    html += eField('Loot ID', 'ce-lootid', v('lootid'), 'number', false, '→ creature_loot_template.Entry');
    html += eField('Pickpocket Loot', 'ce-pickpocketloot', v('pickpocketloot'), 'number', false, '→ pickpocketing_loot_template');
    html += eField('Skin Loot', 'ce-skinloot', v('skinloot'), 'number', false, '→ skinning_loot_template');
    html += eField('Min Gold (copper)', 'ce-mingold', v('mingold'));
    html += eField('Max Gold (copper)', 'ce-maxgold', v('maxgold'));
    html += '</div>';

    // ── AI & Script ────────────────────────────────────────────────────────
    html += eSection('🤖 AI & Script');
    html += eSelectStr('AIName', 'ce-AIName', AI_NAME_OPTIONS, vs('AIName'), 'SmartAI = default for SAI-driven NPCs');
    html += eField('ScriptName', 'ce-ScriptName', vs('ScriptName'), 'text', true, 'C++ script name for complex bosses (overrides AIName)');
    html += eField('StringId', 'ce-StringId', vs('StringId'), 'text', false, 'Identifier for script references');
    html += '</div>';

    if (creatureMode === 'full') {
      // ── Spells ──────────────────────────────────────────────────────────
      html += eSection('🔮 Spells (1–8)');
      for (let i=1;i<=8;i++) html += eField(`Spell ${i}`, `ce-spell${i}`, v(`spell${i}`), 'number', false, '→ spell_dbc.ID');
      html += eField('PetSpellDataId', 'ce-PetSpellDataId', v('PetSpellDataId'), 'number', false, '→ creaturespelldata_dbc.ID');
      html += eField('VehicleId', 'ce-VehicleId', v('VehicleId'), 'number', false, '→ vehicle_dbc.ID (0=no Vehicle)');
      html += eField('Family', 'ce-family', v('family'), 'number', false, '→ creaturefamily_dbc.ID (hunter pet family)');
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function newCreature() {
    const id = prompt('Entry ID (≥ 100000 for Custom):');
    if (!id || isNaN(id)) return;
    creatureData = { entry: parseInt(id), minlevel: 1, maxlevel: 1, faction: 35,
      speed_walk: 1.0, speed_run: 1.14286, scale: 1.0,
      BaseHealthFormula: 1.0, BaseManaFormula: 1.0,
      ModHealth: 1.0, ModMana: 1.0, ModArmor: 1.0, ModDamage: 1.0,
      BaseAttackTime: 2000, RangeAttackTime: 2000,
      BaseVariance: 1.0, RangeVariance: 1.0,
      HoverHeight: 1.0, AIName: 'SmartAI' };
    document.getElementById('creature-editor-form').innerHTML = renderCreatureForm(creatureData);
    document.getElementById('creature-entry-badge').textContent = `New Creature #${id}`;
    creatureDirty = true;
    document.getElementById('creature-dirty').style.display = '';
  }

  async function saveCreature() {
    const entryEl = document.getElementById('ce-entry');
    if (!entryEl) { showToast('No Creature loaded','error'); return; }
    const entry = parseInt(entryEl.value);
    if (!entry) { showToast('Entry missing','error'); return; }

    const payload = {};
    const numFields = ['entry','gossip_menu_id','minlevel','maxlevel','faction','npcflag','type','type_flags',
      'unit_class','RacialLeader','MovementType','BaseAttackTime','RangeAttackTime','dmgschool',
      'lootid','pickpocketloot','skinloot','mingold','maxgold','PetSpellDataId','VehicleId','family'];
    for (let i=1;i<=8;i++) numFields.push(`spell${i}`);
    const fltFields = ['speed_walk','speed_run','scale','HoverHeight','BaseVariance','RangeVariance',
      'BaseHealthFormula','BaseManaFormula','ModHealth','ModMana','ModArmor','ModDamage'];
    const txtFields = ['name','subname','IconName','AIName','ScriptName','StringId'];

    numFields.forEach(f => { const el=document.getElementById('ce-'+f); if(el) payload[f]=parseInt(el.value)||0; });
    fltFields.forEach(f => { const el=document.getElementById('ce-'+f); if(el) payload[f]=parseFloat(el.value)||0; });
    txtFields.forEach(f => { const el=document.getElementById('ce-'+f); if(el) payload[f]=el.value; });
    payload.entry = entry;

    try {
      const r = await fetch(`${API}/creature/save`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      creatureDirty = false;
      document.getElementById('creature-dirty').style.display = 'none';
      document.getElementById('creature-entry-badge').textContent = `#${entry} — ${payload.name||''}`;
      showToast(`Creature #${entry} ${d.data.action==='inserted'?'created':'saved'} ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteCreature() {
    const entry = creatureData.entry;
    if (!entry) { showToast('No Creature loaded','error'); return; }
    if (entry < 100000) { showToast(`Entry ${entry} < 100000 — delete refused`,'error'); return; }
    if (!confirm(`creature_template #${entry} really delete?`)) return;
    try {
      const r = await fetch(`${API}/creature/${entry}`, {method:'DELETE'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      document.getElementById('creature-editor-form').innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0">Creature deleted.</p>';
      document.getElementById('creature-entry-badge').textContent = 'No Creature loaded';
      creatureData = {};
      showToast(`Creature #${entry} deleted`);
    } catch(e) { showToast('Server offline','error'); }
  }

