/* spell-creator-easy.js — beginner-friendly guided spell creator.
   Sits on top of the same /api/spell-create/* backend as the advanced creator.
   Pick a template → fill Basics → Casting → simple Effect builder → Save. */

  // Friendly "what happens" → spell_dbc Effect/Aura mapping.
  const SC_EASY_ACTIONS = [
    {key:'none',    label:'— nothing —',            eff:0,  aura:0},
    {key:'damage',  label:'Deal instant damage',    eff:2,  aura:0,   val:true,  valLabel:'Damage'},
    {key:'heal',    label:'Heal instantly',         eff:10, aura:0,   val:true,  valLabel:'Heal amount'},
    {key:'dot',     label:'Damage over time (DoT)', eff:6,  aura:3,   val:true,  period:true, dur:true, valLabel:'Damage per tick'},
    {key:'hot',     label:'Heal over time (HoT)',   eff:6,  aura:8,   val:true,  period:true, dur:true, valLabel:'Heal per tick'},
    {key:'slow',    label:'Slow movement',          eff:6,  aura:33,  val:true,  dur:true, valLabel:'Slow % (negative, e.g. -50)'},
    {key:'stun',    label:'Stun',                   eff:6,  aura:12,  dur:true},
    {key:'root',    label:'Root (immobilize)',      eff:6,  aura:26,  dur:true},
    {key:'silence', label:'Silence',                eff:6,  aura:27,  dur:true},
    {key:'stat',    label:'Modify a stat',          eff:6,  aura:29,  val:true,  misc:true, dur:true, valLabel:'Amount'},
    {key:'haste',   label:'Modify haste %',         eff:6,  aura:126, val:true,  dur:true, valLabel:'Haste %'},
    {key:'spow',    label:'Modify spell power',     eff:6,  aura:130, val:true,  dur:true, valLabel:'Spell power'},
    {key:'trigger', label:'Cast a spell instantly', eff:64, aura:0,   spell:true},
    {key:'proc',    label:'Proc — trigger a spell', eff:6,  aura:42,  spell:true, dur:true},
  ];
  const SC_EASY_TARGETS = [
    {key:'enemy',     label:'Enemy target',      a:6},
    {key:'self',      label:'Yourself',          a:1},
    {key:'ally',      label:'Friendly target',   a:21},
    {key:'aoe_enemy', label:'Enemies in an area',a:22, b:16},
    {key:'aoe_ally',  label:'Allies around you', a:24},
    {key:'pet',       label:'Your pet',          a:5},
  ];

  let _scEasyId       = null;   // assigned on save/new
  let _scEasyBase     = {};     // template "flavor" fields kept as-is
  let _scEasyEffects  = [];     // [{action,target,value,period,misc,spell}]
  let _scEasyHelperId = null;   // ID of the paired self-side helper spell (auto-split), or null

  function _sceAction(k){ return SC_EASY_ACTIONS.find(a=>a.key===k) || SC_EASY_ACTIONS[0]; }
  function _sceOpts(map, sel){
    return Object.entries(map||{}).map(([k,v])=>`<option value="${k}"${String(k)===String(sel)?' selected':''}>${_scEsc(v)}</option>`).join('');
  }
  // Ordered [[index,label],...] renderer — keeps duration options in time order
  // (plain objects would re-sort numeric keys and scramble the labels).
  function _sceDurOpts(list, sel){
    return (list||[]).map(([k,v])=>`<option value="${k}"${String(k)===String(sel)?' selected':''}>${_scEsc(v)}</option>`).join('');
  }
  function _sceLabelInfo(label, help){
    return `<label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${label}`
      + (help?` <span title="${_scEsc(help)}" style="display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border:1px solid var(--cyan);border-radius:50%;color:var(--cyan);font-size:0.6rem;font-weight:700;font-style:italic;cursor:help;vertical-align:middle;line-height:1">i</span>`:'')
      + `</label>`;
  }

  // ── Auto description ────────────────────────────────────────────────────────
  function _sceDurLabel(idx){
    const list = (_scEnums && _scEnums.durationList) || [];
    const f = list.find(([k])=>String(k)===String(idx));
    return f ? f[1] : '';
  }
  function _sceTickTxt(ms){
    const n = parseFloat(ms)||0; if(!n) return '';
    const s = n/1000; return (Number.isInteger(s)?s:parseFloat(s.toFixed(2)))+' sec';
  }
  function _sceSchoolName(){
    const v = document.getElementById('sce-SchoolMask')?.value;
    const m = (_scEnums && _scEnums.schoolMask) || {};
    return m[v] || m[String(v)] || 'Physical';
  }
  function _sceStatName(misc){
    const m = (_scEnums && _scEnums.miscStat) || {};
    return m[misc] || m[String(misc)] || 'a stat';
  }
  function _sceClause(row){
    const a = _sceAction(row.action); if (a.key==='none') return '';
    const school  = _sceSchoolName();
    const val     = (row.value==='' || row.value==null) ? '0' : row.value;
    const durLbl  = _sceDurLabel(row.dur);
    const durTxt  = (durLbl && durLbl!=='infinite') ? (' for '+durLbl) : '';
    const tick    = _sceTickTxt(row.period);
    const tgt     = row.target;
    const enemyWord = (tgt==='aoe_enemy') ? 'all enemies in the area' : 'the enemy';
    const enemyPoss = (tgt==='aoe_enemy') ? "enemies'" : "the enemy's";
    const toSelf    = (tgt==='self');
    const healWho   = toSelf ? 'you' : tgt==='pet' ? 'your pet' : tgt==='aoe_ally' ? 'all allies' : 'the target';
    const yourWord  = toSelf ? 'your' : "the target's";
    const amt = parseFloat(val)||0;
    switch (a.key){
      case 'damage':  return `deals ${val} ${school} damage to ${enemyWord}`;
      case 'heal':    return `heals ${healWho} for ${val}`;
      case 'dot':     return `deals ${val} ${school} damage every ${tick}${durTxt}`;
      case 'hot':     return `heals ${healWho} for ${val} every ${tick}${durTxt}`;
      case 'slow':    return `slows ${enemyPoss} movement by ${Math.abs(amt)}%${durTxt}`;
      case 'stun':    return `stuns ${enemyWord}${durTxt}`;
      case 'root':    return `roots ${enemyWord} in place${durTxt}`;
      case 'silence': return `silences ${enemyWord}${durTxt}`;
      case 'stat':    return `${amt<0?'decreases':'increases'} ${yourWord} ${_sceStatName(row.misc)} by ${Math.abs(amt)}${durTxt}`;
      case 'haste':   return `${amt<0?'decreases':'increases'} ${yourWord} haste by ${Math.abs(amt)}%${durTxt}`;
      case 'spow':    return `${amt<0?'decreases':'increases'} ${yourWord} spell power by ${Math.abs(amt)}${durTxt}`;
      case 'trigger': return row.spell ? `instantly casts spell #${row.spell}` : '';
      case 'proc':    return '';   // the "on hit" wording already covers the proc mechanic
    }
    return '';
  }
  // opts.auraOnly = build the aura icon (buff/debuff) tooltip text: only effects that
  // create an aura (DoT/HoT/slow/stun/stat/… ), and without the cast-framing
  // ("Instantly" / "on hit") that only makes sense for the spellbook description.
  function scEasyBuildDescription(opts){
    opts = opts || {};
    const auraOnly = !!opts.auraOnly;
    if (!opts.effects) _scEasyReadEffects();
    const src = opts.effects || _scEasyEffects;
    const isProc = !auraOnly && (document.getElementById('sce-ProcTypeMask')?.value || '0') !== '0';
    const enemy = [], self = [];
    let enemySeen = false, firstEnemyDamage = false;
    src.forEach(row=>{
      if (auraOnly && !_sceAction(row.action).aura) return;   // aura tooltip = only ongoing (aura) effects
      const c = _sceClause(row); if (!c) return;
      const offensive = (row.target==='enemy' || row.target==='aoe_enemy');
      if (offensive){ if(!enemySeen){ enemySeen=true; firstEnemyDamage=(row.action==='damage'); } enemy.push(c); }
      else self.push(c);
    });
    const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
    const parts = [];
    if (enemy.length){
      let s = enemy.join(' & ');
      if (!auraOnly && !isProc && firstEnemyDamage) s = 'instantly ' + s;   // "Instantly deals…"
      s = cap(s);
      if (!auraOnly && isProc) s += ' on hit';
      parts.push(s + '.');
    }
    if (self.length){
      const j = self.join(' & ');
      parts.push(enemy.length ? ('Additionally ' + j + '.') : (cap(j) + '.'));
    }
    return parts.join(' ');
  }
  // Aura icon (buff/debuff) tooltip — e.g. "Deals 15 Fire damage every 0.5 sec for 10 sec."
  function scEasyBuildAuraDescription(){ return scEasyBuildDescription({auraOnly:true}); }
  function scEasyMaybeAutoDesc(ev){
    const cb = document.getElementById('sce-autodesc');
    if (!cb || !cb.checked) return;
    // don't overwrite while the user is typing directly into the description box
    if (ev && ev.target && ev.target.id === 'sce-Description_Lang_enUS') return;
    const d = document.getElementById('sce-Description_Lang_enUS');
    if (d) d.value = scEasyBuildDescription();
  }

  async function openSpellEasyMode() {
    document.getElementById('spell-editor-screen-landing').style.display = 'none';
    document.getElementById('spell-editor-screen-create').style.display  = 'none';
    document.getElementById('spell-editor-screen-editor').style.display  = 'none';
    document.getElementById('spell-editor-screen-easy').style.display    = '';
    await scLoadEnums();
    await scLoadTemplates();
    scEasyNew();
    if (typeof scLoadList === 'function') scLoadList();   // fill the Custom Spells sidebar
  }
  function scEasyBack() {
    document.getElementById('spell-editor-screen-easy').style.display = 'none';
    document.getElementById('spell-editor-screen-landing').style.display = '';
  }

  function scEasyNew() {
    _scEasyId = null; _scEasyBase = {}; _scEasyHelperId = null;
    _scEasyEffects = [{action:'damage', target:'enemy', value:'', dur:'', period:'', misc:'', spell:''}];
    scEasyRenderForm({});
    scEasyRefreshId();
  }
  async function scEasyRefreshId() {
    const b = document.getElementById('sc-easy-idbadge');
    if (_scEasyId) { if (b) b.textContent = 'Editing #'+_scEasyId; return; }   // editing existing → keep its ID
    try {
      const r = await fetch(`${API}/spell-create/next-id`);
      const d = await r.json();
      if (d.ok && b) b.textContent = 'New ID: '+d.data.next_id;
    } catch(e) {}
  }
  // Open an existing custom spell in the guided editor (edits in place, keeps its ID).
  // If it's an auto-split spell (triggers a helper at ID+offset), the helper's self-effects
  // are merged back into the builder and the internal trigger row is hidden, so the user sees
  // the original logical effect list and a re-save re-splits cleanly.
  async function scEasyLoadSpell(id){
    try {
      const r = await fetch(`${API}/spell-create/clone/${id}`); const d = await r.json();
      if (!d.ok){ showToast(d.error||'Error loading spell','error'); return; }
      const mf = d.data;
      _scEasyId = id;                 // keep the real ID so Save overwrites in place
      _scEasyHelperId = null;
      // Detect an auto-split helper: a trigger effect (Effect 64) that casts a custom spell
      // sharing this spell's name → that's the self-side helper. Merge it back, hide the trigger.
      const mname = (mf.Name_Lang_enUS || '').trim();
      let triggerSlot = 0, hf = null;
      for (let n=1;n<=3;n++){
        if (parseInt(mf[`Effect_${n}`])!==64) continue;
        const trig = parseInt(mf[`EffectTriggerSpell_${n}`]||0);
        if (trig < 5000000 || trig === id || !mname) continue;
        try {
          const hr = await fetch(`${API}/spell-create/clone/${trig}`); const hd = await hr.json();
          if (hd.ok && (hd.data.Name_Lang_enUS||'').trim() === mname){ triggerSlot=n; hf=hd.data; _scEasyHelperId=trig; break; }
        } catch(e){}
      }
      if (triggerSlot){
        _scEasyBase = Object.assign({}, mf); delete _scEasyBase.ID;
        let combined = _scEasyRowsFromFields(mf, {skipSlot:triggerSlot})
                        .concat(_scEasyRowsFromFields(hf));
        _scEasyEffects = combined.length ? combined.slice(0,3)
                       : [{action:'damage',target:'enemy',value:'',dur:'',period:'',misc:'',spell:''}];
        scEasyRenderForm(mf);
        const cb = document.getElementById('sce-autodesc'); if (cb) cb.checked = true;   // keep tooltips in sync on re-save
      } else {
        _scEasySeed(mf);
      }
      _scEasyBase.ID = id;
      if (typeof scLoadList === 'function') scLoadList();   // refresh highlight
      showToast(`Loaded "${mf.Name_Lang_enUS||('#'+id)}" ✓ — editing in place`);
    } catch(e){ showToast('Server offline','error'); }
  }

  // ── Template grid ──────────────────────────────────────────────────────────
  function _scEasyTemplateGrid() {
    const cards = (_scTemplates||[]).map(t =>
      `<div onclick="scEasyPickTemplate('${t.key}')" style="cursor:pointer;background:var(--bg);border:1px solid var(--border);
        border-radius:7px;padding:8px 10px;transition:.12s"
        onmouseover="this.style.borderColor='#69ccf0'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="color:#69ccf0;font-size:0.82rem;font-weight:600">${_scEsc(t.label||t.key)}</div>
      </div>`).join('');
    return `<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="color:#69ccf0;font-size:0.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">✨ Start from a template</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
        <div onclick="scEasyNew()" style="cursor:pointer;background:var(--bg);border:1px dashed var(--border);border-radius:7px;padding:8px 10px"
          onmouseover="this.style.borderColor='#69ccf0'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="color:var(--muted);font-size:0.82rem;font-weight:600">▢ Blank spell</div>
        </div>
        ${cards}
      </div>
    </div>`;
  }
  // Seed the whole guided form from a set of spell_dbc field values (template OR clone).
  // Reverse-map a spell_dbc field set → effect-builder rows. opts.skipSlot omits one slot.
  function _scEasyRowsFromFields(f, opts) {
    opts = opts || {};
    const rows = [];
    for (let n=1;n<=3;n++){
      if (opts.skipSlot === n) continue;
      const eff = parseInt(f[`Effect_${n}`]||0), aura = parseInt(f[`EffectAura_${n}`]||0);
      if (!eff) continue;
      let act = SC_EASY_ACTIONS.find(a=>a.eff===eff && a.aura===aura)
             || SC_EASY_ACTIONS.find(a=>a.eff===eff && !a.aura && !aura) || _sceAction('none');
      const bp = parseInt(f[`EffectBasePoints_${n}`]||0);
      const ta = parseInt(f[`ImplicitTargetA_${n}`]||0);
      const tgt = SC_EASY_TARGETS.find(x=>x.a===ta) || SC_EASY_TARGETS[0];
      rows.push({action:act.key, target:tgt.key, value: act.val ? (bp+1) : '',
                 dur: act.dur ? (f.DurationIndex||'') : '',
                 period: f[`EffectAuraPeriod_${n}`]||'', misc: f[`EffectMiscValue_${n}`]||'', spell: f[`EffectTriggerSpell_${n}`]||''});
    }
    return rows;
  }
  function _scEasySeed(f) {
    f = f || {};
    _scEasyBase = Object.assign({}, f);
    delete _scEasyBase.ID;   // never overwrite the source spell's ID
    const rows = _scEasyRowsFromFields(f);
    _scEasyEffects = rows.length ? rows : [{action:'damage',target:'enemy',value:'',dur:'',period:'',misc:'',spell:''}];
    scEasyRenderForm(f);
  }
  function scEasyPickTemplate(key) {
    const t = (_scTemplates||[]).find(x=>x.key===key);
    if (t) _scEasySeed(t.fields || {});
  }

  // ── Guided form ────────────────────────────────────────────────────────────
  function scEasyRenderForm(data) {
    const e = _scEnums || {};
    const box = document.getElementById('sc-easy');
    const inp = (id,val,type,ph,step)=>`<input id="sce-${id}" value="${_scEsc(val!=null?val:'')}" type="${type||'text'}"${step?` step="${step}"`:''} placeholder="${ph||''}" style="${_scInputStyle()}">`;
    const sel = (id,map,val)=>`<select id="sce-${id}" style="${_scInputStyle()}">${_sceOpts(map,val)}</select>`;
    const selL = (id,list,val)=>`<select id="sce-${id}" style="${_scInputStyle()}">${_sceDurOpts(list,val)}</select>`;
    const field = (label,help,html)=>`<div>${_sceLabelInfo(label,help)}${html}</div>`;
    const section = (title,body)=>`<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
      <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${title}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">${body}</div></div>`;

    box.innerHTML = _scEasyTemplateGrid() + `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="entry-badge" id="sc-easy-idbadge">New ID</span>
      </div>` +
      section('1 · Basics',
        field('Name','The spell name in the spellbook & tooltips.', inp('Name_Lang_enUS', data.Name_Lang_enUS,'text','My Custom Spell')) +
        field('Rank / Subtext','Small grey text under the name, e.g. "Rank 1". Optional.', inp('NameSubtext_Lang_enUS', data.NameSubtext_Lang_enUS,'text','Rank 1')) +
        `<div style="grid-column:1/3">${_sceLabelInfo('Description','Tooltip text. $s1 = effect 1 value, $d = duration, $x1 = chain targets.')}${inp('Description_Lang_enUS', data.Description_Lang_enUS,'text','Deals $s1 Frost damage…')}</div>` +
        field('Spell Level','The level the spell is considered to be (scaling/requirements).', inp('SpellLevel', data.SpellLevel!=null?data.SpellLevel:1,'number')) +
        `<div>${_sceLabelInfo('Clone from spell','Copy EVERYTHING (school, cast, effects, icon, visual…) from an existing spell, then just tweak name & values.')}
           <div style="display:flex;gap:6px"><input id="sce-clone" type="number" placeholder="Spell ID" style="flex:1;${_scInputStyle()}">
           <button class="e-btn e-btn-small" onclick="scEasyClone()">🔍 Clone whole spell</button></div></div>` +
        field('SpellIcon ID','Which icon (SpellIcon.dbc ID). Clone fills this.', inp('SpellIconID', data.SpellIconID!=null?data.SpellIconID:1,'number')) +
        field('SpellVisual ID','Cast/impact animation (SpellVisual.dbc ID). Clone fills this.', inp('SpellVisualID_1', data.SpellVisualID_1!=null?data.SpellVisualID_1:0,'number'))
      ) +
      section('2 · Casting &amp; Cost',
        field('Cast Time','How long to cast. Instant = no cast bar.', selL('CastingTimeIndex', e.castTimeList, data.CastingTimeIndex!=null?data.CastingTimeIndex:1)) +
        field('Range','Max distance to the target.', selL('RangeIndex', e.rangeList, data.RangeIndex!=null?data.RangeIndex:6)) +
        field('Cooldown (ms)','Time before recast, in ms (1000 = 1 sec). 0 = none.', inp('RecoveryTime', data.RecoveryTime||0,'number')) +
        field('Category CD (ms)','Shared cooldown across a category. Usually 0.', inp('CategoryRecoveryTime', data.CategoryRecoveryTime||0,'number')) +
        field('Power Type','Which resource it costs (Mana, Rage, Energy…).', sel('PowerType', e.powerType, data.PowerType!=null?data.PowerType:0)) +
        field('Power Cost','Resource cost. Rage/Runic Power are stored ×10 (100 = 10 Rage).', inp('ManaCost', data.ManaCost||0,'number')) +
        field('Power per Sec','Resource drained per second while channeling. 0 for normal.', inp('ManaPerSecond', data.ManaPerSecond||0,'number')) +
        field('School','Damage school → determines resistance.', sel('SchoolMask', e.schoolMask, data.SchoolMask!=null?data.SchoolMask:1)) +
        field('Projectile Speed','Missile travel speed. 28 = Frostbolt. 0 = instant hit.', inp('Speed', data.Speed||0,'number','','0.01')) +
        field('Castable while moving','If ON, moving does NOT interrupt the cast (clears the movement-interrupt bit).',
          `<label style="display:flex;align-items:center;gap:6px;height:100%;cursor:pointer"><input type="checkbox" id="sce-move" ${(((data.InterruptFlags==null?15:data.InterruptFlags)&1)===0)?'checked':''}> <span style="color:var(--muted);font-size:0.72rem">yes, cast on the run</span></label>`)
      ) +
      `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em">3 · What the spell does</span>
          <div style="display:flex;align-items:center;gap:12px">
            <label title="Write the tooltip description automatically from the effects below. You can still edit it by hand afterwards." style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.66rem;color:var(--muted)"><input type="checkbox" id="sce-autodesc"> ✍ Auto description</label>
            <button class="e-btn e-btn-small" onclick="scEasyAddEffect()">＋ Add effect</button>
          </div>
        </div>
        <div id="sc-easy-effects"></div>
        <div style="font-size:0.64rem;color:var(--muted);margin-top:4px">Up to 3 effects. Each aura (DoT, slow, stun, buff…) has its own <b>Duration</b> column.</div>
      </div>` +
      `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">4 · Proc (optional — “on hit” style triggers)</div>
        <div style="font-size:0.66rem;color:var(--muted);margin-bottom:10px;line-height:1.4">
          A proc lets this spell (as a buff on you) automatically cast <b>another spell</b> when an event happens (e.g. a weapon that zaps enemies on hit).
          <b>What</b> gets triggered = add an effect above with <b>“Proc — trigger a spell”</b> and pick the spell there.
          The three fields here set <b>when &amp; how often</b> — they apply to the whole spell, not per effect.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">
          ${field('Proc on event','Which event fires the proc (e.g. “On your melee ability”). Leave “none” for normal spells.', `<select id="sce-ProcTypeMask" style="${_scInputStyle()}"><option value="0">— none —</option>${_sceOpts(e.procFlags, data.ProcTypeMask)}</select>`)}
          ${field('Proc Chance %','Chance (0–100) the proc fires when the event happens.', inp('ProcChance', data.ProcChance||0,'number'))}
          ${field('Proc Charges','How many times it can fire before it\'s used up. 0 = unlimited.', inp('ProcCharges', data.ProcCharges||0,'number'))}
        </div>
      </div>` +
      `<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        <button class="e-btn e-btn-green" onclick="scEasySave()">💾 Save → spell_dbc</button>
        <button class="e-btn" onclick="scRebuildMpq(this)" title="Build the client Spell.dbc into the MPQ patch so this spell shows its icon, cast bar, visual & tooltip client-side.">🔁 Rebuild MPQ (client-side)</button>
      </div>`;
    scEasyRenderEffects();
    scEasyRefreshId();
    // Live auto-description: regenerate whenever any effect/school/proc field changes
    if (!box._autoDescBound){
      box.addEventListener('input',  scEasyMaybeAutoDesc);
      box.addEventListener('change', scEasyMaybeAutoDesc);
      box._autoDescBound = true;
    }
  }

  // ── Effect builder rows ────────────────────────────────────────────────────
  function _sceCell(label, inputHtml){
    return `<div style="display:flex;flex-direction:column;gap:2px">
      <span style="font-size:0.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${label}</span>
      ${inputHtml}</div>`;
  }
  function scEasyRenderEffects() {
    const e = _scEnums || {};
    const cont = document.getElementById('sc-easy-effects');
    if (!cont) return;
    cont.innerHTML = _scEasyEffects.map((row,i)=>{
      const a = _sceAction(row.action);
      const actOpts = SC_EASY_ACTIONS.map(x=>`<option value="${x.key}"${x.key===row.action?' selected':''}>${_scEsc(x.label)}</option>`).join('');
      const tgtOpts = SC_EASY_TARGETS.map(x=>`<option value="${x.key}"${x.key===row.target?' selected':''}>${_scEsc(x.label)}</option>`).join('');
      let cells = _sceCell('Effect Type', `<select data-k="action" onchange="scEasyOnActionChange()" style="width:185px;${_scInputStyle()}">${actOpts}</select>`);
      cells += _sceCell('Target Type', `<select data-k="target" style="width:150px;${_scInputStyle()}">${tgtOpts}</select>`);
      if (a.val)    cells += _sceCell(a.valLabel||'Value', `<input data-k="value" value="${_scEsc(row.value)}" type="number" style="width:120px;${_scInputStyle()}">`);
      if (a.dur)    cells += _sceCell('Duration', `<select data-k="dur" style="width:110px;${_scInputStyle()}"><option value="">— none —</option>${_sceDurOpts(e.durationList, row.dur)}</select>`);
      if (a.period) cells += _sceCell('Tick (ms)', `<input data-k="period" value="${_scEsc(row.period)}" type="number" placeholder="3000" style="width:95px;${_scInputStyle()}">`);
      if (a.misc)   cells += _sceCell('Stat', `<select data-k="misc" style="width:120px;${_scInputStyle()}">${_sceOpts(e.miscStat, row.misc)}</select>`);
      if (a.spell)  cells += _sceCell('Triggered Spell', `<span style="display:inline-flex;gap:4px"><input data-k="spell" value="${_scEsc(row.spell)}" type="number" placeholder="ID" style="width:80px;${_scInputStyle()}"><button class="e-btn e-btn-small" onclick="scEasyPickEffectSpell(${i})">🔍</button></span>`);
      return `<div data-eff-row style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span style="color:var(--muted);font-size:0.72rem;padding-bottom:5px">#${i+1}</span>
        ${cells}
        <button class="e-btn e-btn-small e-btn-danger" onclick="scEasyRemoveEffect(${i})" style="margin-left:auto;margin-bottom:1px">🗑</button>
      </div>`;
    }).join('') || '<div style="color:var(--muted);font-size:0.75rem">No effects — click “＋ Add effect”.</div>';
  }
  function _scEasyReadEffects() {
    _scEasyEffects = [...document.querySelectorAll('#sc-easy-effects [data-eff-row]')].map(r=>({
      action: r.querySelector('[data-k="action"]')?.value || 'none',
      target: r.querySelector('[data-k="target"]')?.value || 'enemy',
      value:  r.querySelector('[data-k="value"]')?.value ?? '',
      dur:    r.querySelector('[data-k="dur"]')?.value ?? '',
      period: r.querySelector('[data-k="period"]')?.value ?? '',
      misc:   r.querySelector('[data-k="misc"]')?.value ?? '',
      spell:  r.querySelector('[data-k="spell"]')?.value ?? '',
    }));
  }
  function scEasyOnActionChange(){ _scEasyReadEffects(); scEasyRenderEffects(); }
  function scEasyAddEffect(){
    _scEasyReadEffects();
    if (_scEasyEffects.length >= 3){ showToast('A spell can have at most 3 effects','error'); return; }
    _scEasyEffects.push({action:'damage',target:'enemy',value:'',dur:'',period:'',misc:'',spell:''});
    scEasyRenderEffects();
  }
  function scEasyRemoveEffect(i){ _scEasyReadEffects(); _scEasyEffects.splice(i,1); scEasyRenderEffects(); }
  function scEasyPickEffectSpell(i){
    openSpellSearchModal('🔍 Pick spell to trigger', (id)=>{
      _scEasyReadEffects(); _scEasyEffects[i].spell = id; scEasyRenderEffects();
    });
  }
  function scEasyClone(){
    openSpellSearchModal('🎨 Clone a whole spell (copies everything)', async (id)=>{
      try {
        const r = await fetch(`${API}/spell-create/clone/${id}`); const d = await r.json();
        if (!d.ok) { showToast(d.error||'Error loading spell','error'); return; }
        _scEasyId = null; _scEasyHelperId = null;   // clone = brand-new spell (fresh ID on save)
        _scEasySeed(d.data);   // fill the whole form from the source spell — then just tweak
        scEasyRefreshId();
        showToast(`Cloned "${d.data.Name_Lang_enUS||('#'+id)}" ✓ — edit & save as a new spell`);
      } catch(e){ showToast('Server offline','error'); }
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function scEasySave() {
    _scEasyReadEffects();
    const g = id => document.getElementById('sce-'+id);
    const numOr = (id,dflt)=>{ const el=g(id); if(!el||el.value==='') return dflt; const n=parseFloat(el.value); return isNaN(n)?dflt:n; };
    const strOf = id => (g(id)?.value || '');
    if (!strOf('Name_Lang_enUS').trim()) { showToast('Name required','error'); return; }
    // Ensure a fresh custom ID (≥ 5,000,000) for new spells
    if (!_scEasyId) {
      try { const r = await fetch(`${API}/spell-create/next-id`); const d = await r.json(); if (d.ok) _scEasyId = d.data.next_id; } catch(e) {}
    }
    // Writes builder rows into a payload's 3 effect slots (clears them first).
    const applyEffects = (payload, rows) => {
      for (let n=1;n<=3;n++){
        payload[`Effect_${n}`]=0; payload[`EffectAura_${n}`]=0; payload[`EffectBasePoints_${n}`]=0;
        payload[`ImplicitTargetA_${n}`]=0; payload[`ImplicitTargetB_${n}`]=0; payload[`EffectDieSides_${n}`]=0;
        payload[`EffectAuraPeriod_${n}`]=0; payload[`EffectMiscValue_${n}`]=0; payload[`EffectTriggerSpell_${n}`]=0;
      }
      rows.slice(0,3).forEach((row,idx)=>{
        const n = idx+1; const a = _sceAction(row.action);
        if (a.key==='none') return;
        const tgt = SC_EASY_TARGETS.find(x=>x.key===row.target) || SC_EASY_TARGETS[0];
        payload[`Effect_${n}`] = a.eff; payload[`EffectAura_${n}`] = a.aura; payload[`ImplicitTargetA_${n}`] = tgt.a;
        if (tgt.b) payload[`ImplicitTargetB_${n}`] = tgt.b;
        // value = BasePoints + 1, with DieSides = 1 → exactly the number the user typed (no random roll)
        if (a.val) { payload[`EffectBasePoints_${n}`] = (parseInt(row.value)||0) - 1; payload[`EffectDieSides_${n}`] = 1; }
        if (a.period) payload[`EffectAuraPeriod_${n}`] = parseInt(row.period)||0;
        if (a.misc)   payload[`EffectMiscValue_${n}`]  = parseInt(row.misc)||0;
        if (a.spell)  payload[`EffectTriggerSpell_${n}`] = parseInt(row.spell)||0;
      });
    };
    const durIndexOf = rows => { const r = rows.find(x=>{ const a=_sceAction(x.action); return a.dur && x.dur; }); return r ? (parseInt(r.dur)||0) : 0; };

    // ── common fields (shared by the main spell and, on split, the self-helper) ──
    const p = Object.assign({}, _scEasyBase);
    p.ID = _scEasyId;
    p.Name_Lang_enUS = strOf('Name_Lang_enUS');
    p.NameSubtext_Lang_enUS = strOf('NameSubtext_Lang_enUS');
    p.Description_Lang_enUS = strOf('Description_Lang_enUS');
    p.SpellLevel = numOr('SpellLevel',1); p.BaseLevel = numOr('SpellLevel',1);
    p.SpellIconID = numOr('SpellIconID',1); p.SpellVisualID_1 = numOr('SpellVisualID_1',0);
    p.CastingTimeIndex = numOr('CastingTimeIndex',1); p.RangeIndex = numOr('RangeIndex',6);
    p.RecoveryTime = numOr('RecoveryTime',0); p.CategoryRecoveryTime = numOr('CategoryRecoveryTime',0);
    p.PowerType = numOr('PowerType',0); p.ManaCost = numOr('ManaCost',0); p.ManaPerSecond = numOr('ManaPerSecond',0);
    p.SchoolMask = numOr('SchoolMask',1); p.Speed = numOr('Speed',0);
    // InterruptFlags: keep the base value's other bits, toggle only the movement bit (0x01)
    { const _baseIF = (_scEasyBase.InterruptFlags!=null) ? (parseInt(_scEasyBase.InterruptFlags)||0) : 15;
      const _move = document.getElementById('sce-move');
      p.InterruptFlags = (_move && _move.checked) ? (_baseIF & ~1) : (_baseIF | 1); }
    p.ProcTypeMask = numOr('ProcTypeMask',0); p.ProcChance = numOr('ProcChance',0); p.ProcCharges = numOr('ProcCharges',0);

    // ── partition effects → decide whether to auto-split (enemy aura + self aura) ──
    const isSelf  = t => (t==='self'||t==='ally'||t==='aoe_ally'||t==='pet');
    const isEnemy = t => (t==='enemy'||t==='aoe_enemy');
    const hasAura = row => !!_sceAction(row.action).aura;
    const rows = _scEasyEffects.slice(0,3).filter(r => _sceAction(r.action).key !== 'none');
    const enemyAura = rows.filter(r => hasAura(r) && isEnemy(r.target));
    const selfAura  = rows.filter(r => hasAura(r) && isSelf(r.target));
    const doSplit = enemyAura.length > 0 && selfAura.length > 0;

    const setStatus = html => { const s=document.getElementById('sc-easy-status'); if(s) s.innerHTML = html; };
    const post = async payload => { const r = await fetch(`${API}/spell-create/save`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); return r.json(); };
    const nextId = async () => { try { const r=await fetch(`${API}/spell-create/next-id`); const d=await r.json(); return d.ok ? d.data.next_id : null; } catch(e){ return null; } };
    const autoDesc = document.getElementById('sce-autodesc')?.checked;

    setStatus('Saving…');
    try {
      if (doSplit) {
        const mainId = _scEasyId;
        // Reuse the paired helper's ID if we're editing a split spell; otherwise take the next
        // free ID. To guarantee it's free & sequential (main+1), reserve the main row first.
        let helperId = _scEasyHelperId;
        if (!helperId) {
          const reserve = Object.assign({}, p); applyEffects(reserve, rows.filter(r => !(hasAura(r) && isSelf(r.target))));
          const rr = await post(reserve); if (!rr.ok){ setStatus(''); showToast(rr.error||'Error','error'); return; }
          helperId = await nextId();
          if (!helperId || helperId <= mainId) helperId = mainId + 1;
        }
        // Helper spell B — the self side (own tooltip). Instant, self-targeted, no cost.
        const b = Object.assign({}, _scEasyBase, {
          ID: helperId,
          Name_Lang_enUS: p.Name_Lang_enUS, NameSubtext_Lang_enUS: p.NameSubtext_Lang_enUS,
          SchoolMask: p.SchoolMask, SpellLevel: p.SpellLevel, BaseLevel: p.SpellLevel,
          SpellIconID: p.SpellIconID, SpellVisualID_1: p.SpellVisualID_1,
          CastingTimeIndex: 1, RangeIndex: 1, RecoveryTime: 0, CategoryRecoveryTime: 0,
          PowerType: 0, ManaCost: 0, ManaPerSecond: 0, Speed: 0, InterruptFlags: 0,
          ProcTypeMask: 0, ProcChance: 0, ProcCharges: 0,
          Description_Lang_enUS: scEasyBuildDescription({auraOnly:true, effects:selfAura}),
          AuraDescription_Lang_enUS: scEasyBuildDescription({auraOnly:true, effects:selfAura}),
          DurationIndex: durIndexOf(selfAura),
        });
        applyEffects(b, selfAura);
        // Main spell A — enemy side + a trigger that casts the helper on yourself.
        const mainRows = rows.filter(r => !(hasAura(r) && isSelf(r.target)))
                             .concat([{action:'trigger', target:'self', value:'', dur:'', period:'', misc:'', spell:String(helperId)}]);
        p.AuraDescription_Lang_enUS = scEasyBuildDescription({auraOnly:true, effects:enemyAura});
        p.DurationIndex = durIndexOf(enemyAura);
        applyEffects(p, mainRows);

        const rb = await post(b); if (!rb.ok){ setStatus(''); showToast(rb.error||'Helper save failed','error'); return; }
        const ra = await post(p); if (!ra.ok){ setStatus(''); showToast(ra.error||'Error','error'); return; }
        _scEasyId = ra.data.ID; _scEasyHelperId = helperId;
        setStatus(`<span style="color:#1eff00">✓ Spell #${ra.data.ID} + self-spell #${helperId} saved (server reload required)</span>`);
        showToast(`Split spell saved ✓ — enemy #${ra.data.ID} + self #${helperId}`);
      } else {
        if (autoDesc) p.AuraDescription_Lang_enUS = scEasyBuildAuraDescription();
        p.DurationIndex = durIndexOf(rows);
        applyEffects(p, rows);
        const ra = await post(p); if (!ra.ok){ setStatus(''); showToast(ra.error||'Error','error'); return; }
        _scEasyId = ra.data.ID;
        // If this spell used to be split but no longer is, remove the now-orphan helper.
        if (_scEasyHelperId) {
          try { await fetch(`${API}/spell-create/delete`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ID: _scEasyHelperId})}); } catch(e){}
          _scEasyHelperId = null;
        }
        setStatus(`<span style="color:#1eff00">✓ Spell #${ra.data.ID} saved (server reload required)</span>`);
        showToast(`Spell #${ra.data.ID} saved ✓`);
      }
      if (typeof scLoadList === 'function') scLoadList();
    } catch(e){ showToast('Server offline','error'); setStatus(''); }
  }
