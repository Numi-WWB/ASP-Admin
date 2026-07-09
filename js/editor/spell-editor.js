/* spell-editor.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let spellMode = 'basic';
  let spellData = {};
  let spellDirty = false;

  // ── DBC lookup tables for spell editor dropdowns ──────────────────────────
  // Populated once on first use from /api/spell/dbc-lookups
  let CAST_TIME_INDEX = {0:'Instant'};
  let DURATION_INDEX  = {0:'Instant'};
  let RANGE_INDEX     = {0:'Self'};
  let _dbcLookupsLoaded = false;

  async function ensureDbcLookups() {
    if (_dbcLookupsLoaded) return;
    try {
      const r = await fetch(`${API}/spell/dbc-lookups`);
      const d = await r.json();
      if (d.ok) {
        CAST_TIME_INDEX = d.data.cast_times || CAST_TIME_INDEX;
        DURATION_INDEX  = d.data.durations  || DURATION_INDEX;
        RANGE_INDEX     = d.data.ranges     || RANGE_INDEX;
        _dbcLookupsLoaded = true;
      }
    } catch(e) { /* use fallback values */ }
  }

  const SCHOOL_MASK = {0:'None',1:'Physical',2:'Holy',4:'Fire',8:'Nature',16:'Frost',32:'Shadow',64:'Arcane'};

  function goToSpellLanding() {
    document.getElementById('spell-editor-screen-landing').style.display = '';
    document.getElementById('spell-editor-screen-editor').style.display  = 'none';
    spellData = {}; spellDirty = false;
  }

  function openSpellEditor(mode) {
    spellMode = mode;
    document.getElementById('spell-editor-screen-landing').style.display = 'none';
    document.getElementById('spell-editor-screen-editor').style.display  = '';
  }

  async function searchSpells() {
    const q = document.getElementById('spell-search-input').value.trim();
    if (!q) return;
    const res = document.getElementById('spell-search-results');
    res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">Search…</div>';
    res.classList.add('open');
    try {
      const r = await fetch(`${API}/spell/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      if (!d.ok || !d.data.length) { res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">No results</div>'; return; }
      res.innerHTML = d.data.map(s => {
        const name = s.name || '(no Name)';
        const rank = s.rank ? `<span style="color:rgba(200,160,60,.5);font-size:0.68rem;margin-left:5px">${s.rank}</span>` : '';
        return `<div class="search-result-item" onclick="loadSpell(${s.ID})">
          <span style="color:var(--cyan)">${name}</span>${rank}
          <span class="search-result-id">#${s.ID}</span>
        </div>`;
      }).join('');
    } catch(e) { res.innerHTML = '<div style="padding:8px 12px;color:var(--red);font-size:0.78rem">Server offline</div>'; }
  }

  async function loadSpell(id) {
    document.getElementById('spell-search-results').classList.remove('open');
    await ensureDbcLookups();
    try {
      const r = await fetch(`${API}/spell/${id}`);
      if (!r.ok) { showToast(`Server-Error: ${r.status}`, 'error'); return; }
      const d = await r.json();
      if (!d.ok) { showToast(d.error || 'Spell not found', 'error'); return; }
      spellData = d.data;
      // Name may be in different fields
      const spellName = spellData.Name_Lang_enUS || spellData.spell_name || spellData.name || '';
      document.getElementById('spell-editor-form').innerHTML = renderSpellForm(spellData);
      document.getElementById('spell-entry-badge').textContent = `Spell #${id} — ${spellName}`;
      // Sidebar DBC info
      const info = document.getElementById('spell-dbc-info');
      if (info) {
        info.style.display = '';
        document.getElementById('spell-dbc-name').textContent = `#${id}  ${spellName}`;
        const school = SCHOOL_MASK[spellData.SchoolMask] || `SchoolMask ${spellData.SchoolMask||0}`;
        document.getElementById('spell-dbc-school').textContent = `School: ${school}  |  Mana: ${spellData.ManaCost||0}`;
        document.getElementById('spell-dbc-desc').textContent = spellData.Description_Lang_enUS || spellData.spell_desc || '';
      }
      spellDirty = false;
      document.getElementById('spell-dirty').style.display = 'none';
      showToast(`Spell #${id} loaded`);
    } catch(e) {
      console.error('loadSpell error:', e);
      showToast('Error while loading: ' + e.message, 'error');
    }
  }

  function renderSpellForm(data) {
    const v  = (k, def=0)  => data[k] !== undefined ? data[k] : def;
    const vs = (k, def='') => data[k] !== undefined ? String(data[k]) : def;
    if (!data.Name_Lang_enUS) data.Name_Lang_enUS = data.spell_name || data.name || '';
    if (!data.Description_Lang_enUS) data.Description_Lang_enUS = data.spell_desc || '';
    let html = '<div class="easy-form">';

    html += eSection('📋 spell_dbc — READ ONLY');
    html += eField('Name', 'se-Name_Lang_enUS', vs('Name_Lang_enUS'), 'text', true, '', true);
    html += eField('Description', 'se-Description_Lang_enUS', vs('Description_Lang_enUS'), 'text', true, '', true);
    html += eField('SchoolMask', 'se-SchoolMask', v('SchoolMask'), 'number', false, '1=Phys 2=Holy 4=Fire 8=Nature 16=Frost 32=Shadow 64=Arcane', true);
    html += eField('ManaCost', 'se-ManaCost', v('ManaCost'), 'number', false, '', true);
    html += eSelect('CastTime (DBC)', 'se-CastingTimeIndex', CAST_TIME_INDEX, v('CastingTimeIndex'));
    html += eSelect('Duration (DBC)', 'se-DurationIndex', DURATION_INDEX, v('DurationIndex'));
    html += eSelect('Range (DBC)', 'se-RangeIndex', RANGE_INDEX, v('RangeIndex'));
    html += '</div>';

    html += eSection('\u2694\uFE0F spell_threat');
    html += eField('Flat Threat Mod', 'se-flatMod', v('flatMod'), 'number', false, 'Fixed threat change');
    html += eField('Pct Threat Mod', 'se-pctMod', v('pctMod'), 'number', false, 'Percent override on total threat');
    html += '</div>';

    html += eSection('\u2728 spell_bonus_data \u2014 Damage Scaling');
    html += eField('Direct Bonus', 'se-direct_bonus', v('direct_bonus'), 'number', false, 'SP coefficient (0.0-2.0+)');
    html += eField('DoT Bonus', 'se-dot_bonus', v('dot_bonus'), 'number', false, 'SP coefficient for DoT');
    html += eField('AP Bonus', 'se-ap_bonus', v('ap_bonus'), 'number', false, 'AP coefficient, direct damage');
    html += eField('AP DoT Bonus', 'se-ap_dot_bonus', v('ap_dot_bonus'), 'number', false, 'AP coefficient, DoT');
    html += '</div>';

    html += eSection('\uD83C\uDFB2 spell_proc');
    html += eBitmask('ProcFlags', 'se-ProcFlags', PROCFLAGS_BITS, v('ProcFlags'), 'Trigger for the proc');
    html += eField('Chance (%)', 'se-Chance', v('Chance'), 'number', false, '0 = always on ProcFlags match');
    html += eField('ProcsPerMinute', 'se-ProcsPerMinute', v('ProcsPerMinute'), 'number', false, '0 = no PPM limit');
    html += eField('Cooldown (ms)', 'se-Cooldown', v('Cooldown'), 'number', false, 'Min interval between procs');
    html += eField('Charges', 'se-Charges', v('Charges'), 'number', false, '0 = unlimited');
    html += eSelect('SpellTypeMask', 'se-SpellTypeMask', SPELL_TYPEMASK, v('SpellTypeMask'));
    html += eSelect('SpellPhaseMask', 'se-SpellPhaseMask', SPELL_PHASEMASK, v('SpellPhaseMask'));
    html += eBitmask('HitMask', 'se-HitMask', HIT_MASK_BITS, v('HitMask'));
    html += '</div>';

    if (spellMode === 'full') {
      html += eSection('\u23F1 spell_cooldown_overrides');
      html += eField('RecoveryTime (ms)', 'se-RecoveryTime', v('RecoveryTime'), 'number', false, '-1 = no Override');
      html += eField('CategoryRecovery (ms)', 'se-CategoryRecoveryTime', v('CategoryRecoveryTime'), 'number', false, 'Category CD override');
      html += eField('StartRecovery (ms)', 'se-StartRecoveryTime', v('StartRecoveryTime'), 'number', false, 'GCD Override');
      html += eField('Comment', 'se-cd_Comment', vs('cd_Comment'), 'text', true);
      html += '</div>';

      html += eSection('\uD83D\uDD27 spell_template \u2014 Core');
      html += eField('Name (Override)', 'se-Name', vs('Name'), 'text', false, 'Custom name, overrides DBC');
      html += eSelect('Dispel Type', 'se-Dispel', SPELL_DISPEL, v('Dispel'));
      html += eSelect('Mechanic', 'se-Mechanic', SPELL_MECHANIC, v('Mechanic'));
      html += eSelect('Power Type', 'se-PowerType', SPELL_POWER_TYPE, v('PowerType'));
      html += eField('ManaCost (Override)', 'se-ManaCostTpl', v('ManaCostTpl') || v('ManaCost_tpl'), 'number', false, '0 = no Override');
      html += eField('ManaCost %', 'se-ManaCostPercentage', v('ManaCostPercentage'), 'number', false, '% of BaseMana');
      html += eField('ManaCostPerLevel', 'se-ManaCostPerlevel', v('ManaCostPerlevel'));
      html += eField('ManaPerSecond', 'se-ManaPerSecond', v('ManaPerSecond'));
      html += eSelect('CastTime Override', 'se-CastingTimeIndex_tpl', CAST_TIME_INDEX, v('CastingTimeIndex_tpl'));
      html += eSelect('Duration Override', 'se-DurationIndex_tpl', DURATION_INDEX, v('DurationIndex_tpl'));
      html += eSelect('Range Override', 'se-RangeIndex_tpl', RANGE_INDEX, v('RangeIndex_tpl'));
      html += eField('Speed', 'se-Speed', v('Speed'), 'number', false, 'Projectile speed');
      html += eField('SpellLevel', 'se-SpellLevel', v('SpellLevel'), 'number', false, 'Level at which learnable');
      html += eField('BaseLevel', 'se-BaseLevel', v('BaseLevel'), 'number', false, 'Base level for scaling');
      html += eField('MaxLevel', 'se-MaxLevel', v('MaxLevel'), 'number', false, '0 = unlimited');
      html += eField('MaxTargetLevel', 'se-MaxTargetLevel', v('MaxTargetLevel'));
      html += eField('MaxAffectedTargets', 'se-MaxAffectedTargets', v('MaxAffectedTargets'));
      html += eField('StackAmount', 'se-StackAmount', v('StackAmount'), 'number', false, 'Max Stack-Count');
      html += eField('ProcChance', 'se-ProcChance', v('ProcChance'), 'number', false, 'Base proc chance %');
      html += eField('ProcCharges', 'se-ProcCharges', v('ProcCharges'), 'number', false, '0 = unlimited');
      html += '</div>';

      html += eSection('\uD83C\uDFF7\uFE0F spell_template \u2014 Attributes');
      for (let ax = 0; ax < 8; ax++) {
        const k = ax === 0 ? 'Attributes' : 'AttributesEx' + ax;
        html += eField(k, 'se-' + k, v(k), 'number', false, ax === 0 ? 'Bitmask' : '');
      }
      html += '</div>';

      html += eSection('\uD83D\uDEAB spell_template \u2014 Interrupt Flags');
      html += eBitmask('InterruptFlags', 'se-InterruptFlags', SPELL_INTERRUPT_FLAGS, v('InterruptFlags'));
      html += eBitmask('AuraInterruptFlags', 'se-AuraInterruptFlags', SPELL_AURA_INTERRUPT, v('AuraInterruptFlags'), 'What breaks this aura');
      html += eBitmask('ChannelInterruptFlags', 'se-ChannelInterruptFlags', SPELL_CHANNEL_INTERRUPT, v('ChannelInterruptFlags'));
      html += eSelect('FacingCasterFlags', 'se-FacingCasterFlags', SPELL_FACING_FLAGS, v('FacingCasterFlags'));
      html += '</div>';

      html += eSection('\uD83D\uDC6A spell_template \u2014 Spell Family & Proc');
      html += eSelect('SpellFamilyName', 'se-SpellFamilyName', SPELL_FAMILY, v('SpellFamilyName'));
      html += eField('SpellFamilyFlags',  'se-SpellFamilyFlags',  v('SpellFamilyFlags'),  'number', false, 'Bitmask 32bit');
      html += eField('SpellFamilyFlags1', 'se-SpellFamilyFlags1', v('SpellFamilyFlags1'));
      html += eField('SpellFamilyFlags2', 'se-SpellFamilyFlags2', v('SpellFamilyFlags2'));
      html += '</div>';

      for (let i = 1; i <= 3; i++) {
        html += eSection('\u26A1 spell_template \u2014 Effect ' + i);
        html += eSelect('Effect' + i, 'se-Effect' + i, SPELL_EFFECT_NAMES, v('Effect' + i));
        html += eField('BasePoints' + i,          'se-EffectBasePoints' + i,         v('EffectBasePoints' + i),         'number', false, 'Base value of the effect');
        html += eField('DieSides' + i,            'se-EffectDieSides' + i,           v('EffectDieSides' + i),           'number', false, 'Die sides for variation');
        html += eField('RealPointsPerLevel' + i,  'se-EffectRealPointsPerLevel' + i, v('EffectRealPointsPerLevel' + i), 'number', false, 'Scaling per level');
        html += eField('PointsPerComboPoint' + i, 'se-EffectPointsPerComboPoint' + i,v('EffectPointsPerComboPoint' + i),'number', false, 'Bonus per combo point');
        html += eSelect('Aura' + i,               'se-EffectAura' + i,               SPELL_AURA_NAMES, v('EffectAura' + i));
        html += eField('AuraPeriod' + i,          'se-EffectAuraPeriod' + i,         v('EffectAuraPeriod' + i),         'number', false, 'Tick-Rate in ms');
        html += eField('ValueMultiplier' + i,     'se-EffectValueMultiplier' + i,    v('EffectValueMultiplier' + i),    'number', false, 'Additional multiplier');
        html += eField('BonusCoefficient' + i,    'se-EffectBonusCoefficient' + i,   v('EffectBonusCoefficient' + i),   'number', false, 'SP/AP coefficient in the effect');
        html += eSelect('TargetA' + i,            'se-EffectImplicitTargetA' + i,    SPELL_TARGETS, v('EffectImplicitTargetA' + i));
        html += eSelect('TargetB' + i,            'se-EffectImplicitTargetB' + i,    SPELL_TARGETS, v('EffectImplicitTargetB' + i));
        html += eField('RadiusIndex' + i,         'se-EffectRadiusIndex' + i,        v('EffectRadiusIndex' + i),        'number', false, '\u2192 spellradius_dbc');
        html += eField('ChainTarget' + i,         'se-EffectChainTarget' + i,        v('EffectChainTarget' + i),        'number', false, 'Count Chain-Targets');
        html += eField('MiscValue' + i,           'se-EffectMiscValue' + i,          v('EffectMiscValue' + i),          'number', false, 'Misc value (depends on aura type)');
        html += eField('MiscValueB' + i,          'se-EffectMiscValueB' + i,         v('EffectMiscValueB' + i));
        html += eField('TriggerSpell' + i,        'se-EffectTriggerSpell' + i,       v('EffectTriggerSpell' + i),       'number', false, 'Spell that is triggered');
        html += eField('ItemType' + i,            'se-EffectItemType' + i,           v('EffectItemType' + i),           'number', false, '\u2192 item_template.entry');
        html += '</div>';
      }

      html += eSection('\uD83D\uDCAC spell_template \u2014 Comment');
      html += eField('Comment', 'se-tpl_Comment', vs('tpl_Comment'), 'text', true);
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function newSpellOverride() {
    openSpellSearchModal('🔍 Pick a spell to override', (id) => loadSpell(parseInt(id)));
  }

  async function saveSpell() {
    if (!spellData.ID) { showToast('No Spell loaded','error'); return; }
    const id = spellData.ID;
    const payload = { ID: id };
    // Collect ALL se-prefixed inputs dynamically — backend filters by actual DB columns
    document.querySelectorAll('[id^="se-"]').forEach(el => {
      const key = el.id.slice(3);
      if (el.tagName === 'TEXTAREA' || el.type === 'text') {
        if (el.value !== '') payload[key] = el.value;
      } else {
        const n = parseFloat(el.value);
        if (!isNaN(n)) payload[key] = n;
      }
    });
    try {
      const r = await fetch(`${API}/spell/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      spellDirty = false;
      document.getElementById('spell-dirty').style.display = 'none';
      showToast(`Spell #${id} saved ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteSpell() {
    if (!spellData.ID) { showToast('No Spell loaded','error'); return; }
    const id = spellData.ID;
    if (!confirm(`All Overrides for Spell #${id} delete? (spell_dbc stays untouched)`)) return;
    try {
      const r = await fetch(`${API}/spell/${id}`, {method:'DELETE'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      document.getElementById('spell-editor-form').innerHTML = '<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0">Overrides deleted.</p>';
      document.getElementById('spell-entry-badge').textContent = 'No Spell loaded';
      document.getElementById('spell-dbc-info').style.display = 'none';
      spellData = {};
      showToast(`Spell #${id} Overrides deleted`);
    } catch(e) { showToast('Server offline','error'); }
  }

