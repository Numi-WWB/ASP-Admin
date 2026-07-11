/* glyph-editor.js — beginner-friendly Glyph editor.
   Edits GlyphProperties.dbc (client + server data/dbc) via /api/glyph/*, and the glyph's
   EFFECT spell (what it actually does) by patching Spell.dbc via /api/glyph/effect/*.
   Layout: class bar on top → Major/Minor toggle → left glyph list + right editor GUI.
   Glyphs are DBC-driven, so saving rebuilds the client MPQ (like the Talent editor).
   All functions are global (called from inline onclick), prefixed `glyph`/`_glyph`. */

  let _glyph = {
    classes: [],
    classMask: 0,        // 0 = none selected yet
    type: 'major',       // 'major' | 'minor'
    list: [],            // current filtered list
    selectedId: null,    // currently open glyph id (null = none / create mode)
    loaded: false,
    edit: null,          // selected glyph detail
    effect: null,        // effect breakdown of the selected glyph's spell
    create: null,        // create-form buffer
  };

  function _glyphIcon(name){
    return name ? `https://wow.zamimg.com/images/wow/icons/medium/${String(name).toLowerCase()}.jpg` : '';
  }
  function _glyphEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _glyphClass(mask){ return _glyph.classes.find(c => c.mask === mask) || {name:'?',color:'#888'}; }

  // ── SpellModOp (what a modifier glyph changes) — AzerothCore enum ────────────
  const GLYPH_SPELLMODOPS = [
    {v:0,  label:'Damage / Healing'},
    {v:1,  label:'Duration'},
    {v:2,  label:'Threat'},
    {v:3,  label:'Effect 1 value'},
    {v:4,  label:'Charges / Stacks'},
    {v:5,  label:'Range'},
    {v:6,  label:'Radius'},
    {v:7,  label:'Critical chance'},
    {v:8,  label:'All effect values'},
    {v:10, label:'Casting time'},
    {v:11, label:'Cooldown'},
    {v:12, label:'Effect 2 value'},
    {v:14, label:'Power cost (mana/rage/energy)'},
    {v:15, label:'Critical damage bonus'},
    {v:17, label:'Jump / chain targets'},
    {v:18, label:'Chance of success'},
    {v:19, label:'Activation time'},
    {v:20, label:'Damage multiplier'},
    {v:21, label:'Global cooldown'},
    {v:22, label:'Periodic (DoT/HoT)'},
    {v:23, label:'Effect 3 value'},
    {v:24, label:'Bonus multiplier'},
  ];
  function _glyphModopLabel(v){ const o = GLYPH_SPELLMODOPS.find(x=>x.v===v); return o?o.label:('SpellModOp '+v); }
  // Stat "buff" options — grant the player a flat stat when the glyph is socketed.
  const GLYPH_STATS = [
    {v:'spellpower', label:'Spell Power'}, {v:'attackpower', label:'Attack Power'},
    {v:'stamina', label:'Stamina'}, {v:'strength', label:'Strength'}, {v:'agility', label:'Agility'},
    {v:'intellect', label:'Intellect'}, {v:'spirit', label:'Spirit'},
    {v:'crit', label:'Crit rating — all'}, {v:'crit_spell', label:'Crit rating — spell'}, {v:'crit_melee', label:'Crit rating — melee'}, {v:'crit_ranged', label:'Crit rating — ranged'},
    {v:'haste', label:'Haste rating — all'}, {v:'haste_spell', label:'Haste rating — spell'}, {v:'haste_melee', label:'Haste rating — melee'}, {v:'haste_ranged', label:'Haste rating — ranged'},
    {v:'hit', label:'Hit rating — all'}, {v:'expertise', label:'Expertise rating'}, {v:'armorpen', label:'Armor Penetration'},
    {v:'dodge', label:'Dodge rating'}, {v:'parry', label:'Parry rating'}, {v:'armor', label:'Armor'},
  ];
  function _glyphStatLabel(v){ const o = GLYPH_STATS.find(x=>x.v===v); return o?o.label:v; }
  function _glyphStatUnit(v){ const o = GLYPH_STATS.find(x=>x.v===v); return (o && o.unit) ? o.unit : ''; }
  // SpellModOps whose value is in milliseconds → show a friendly time hint
  const _GLYPH_MS_MODOPS = new Set([1,10,11,19,21]);
  const AURA_ADD_FLAT = 107, AURA_ADD_PCT = 108;

  // ── Glyph templates (derived from the real 3.3.5 glyphs — the common editable patterns) ──
  // Each seeds the "create glyph effect spell" form: direction, property (SpellModOp), type, amount.
  const GLYPH_CREATE_TEMPLATES = [
    {key:'cooldown', label:'⏱ Reduce cooldown',      desc:'Lower a spell\'s cooldown (e.g. Glyph of Starfall)', dir:'dec', modop:11, type:'flat', amount:5000,  unit:'ms'},
    {key:'duration', label:'⏳ Change duration',      desc:'Longer/shorter effect (e.g. Glyph of Rip)',          dir:'inc', modop:1,  type:'flat', amount:60000, unit:'ms'},
    {key:'cost',     label:'💧 Reduce cost',          desc:'Cheaper mana/rage/energy (e.g. Glyph of Moonfire)',  dir:'dec', modop:14, type:'pct',  amount:50,    unit:'%'},
    {key:'damage',   label:'🔥 More damage / healing', desc:'Boost damage & healing (e.g. Glyph of Mangle)',      dir:'inc', modop:0,  type:'pct',  amount:20,    unit:'%'},
    {key:'periodic', label:'🐍 Stronger DoT / HoT',    desc:'Boost periodic damage/healing (e.g. Glyph of Insect Swarm)', dir:'inc', modop:22, type:'pct', amount:20, unit:'%'},
    {key:'range',    label:'🎯 More range',            desc:'Cast from further away (e.g. Glyph of Hammer of Justice)', dir:'inc', modop:5, type:'flat', amount:5, unit:'yd'},
    {key:'radius',   label:'💥 Bigger AoE radius',     desc:'Larger area of effect (e.g. Glyph of Blink)',        dir:'inc', modop:6,  type:'flat', amount:5,     unit:'yd'},
    {key:'crit',     label:'✨ More crit chance',      desc:'Higher critical chance (e.g. Glyph of Eviscerate)',  dir:'inc', modop:7,  type:'flat', amount:5,     unit:'%'},
    {key:'targets',  label:'👥 Extra targets',         desc:'Hit additional targets (e.g. Glyph of Chain Heal)',  dir:'inc', modop:17, type:'flat', amount:1,     unit:'targets'},
    {key:'threat',   label:'🛡 More / less threat',    desc:'Tank & threat glyphs (e.g. Glyph of Barbaric Insults)', dir:'inc', modop:2, type:'pct', amount:100, unit:'%'},
    {key:'casttime', label:'⚡ Faster cast',           desc:'Reduce casting time (e.g. Glyph of Healing Touch)',  dir:'dec', modop:10, type:'flat', amount:500,   unit:'ms'},
  ];
  const _GLYPH_UNIT_HINT = { 'ms':true };  // ms units get the "= X sec/min" live hint

  function _glyphMsHint(ms){
    ms = Math.abs(ms|0); if (!ms) return '';
    const s = ms/1000;
    if (s >= 60){ const m = Math.floor(s/60), r = s%60; return ` (= ${m}:${String(r).padStart(2,'0')} min)`; }
    return ` (= ${s}s)`;
  }

  // ── Offline spell tooltip (reuses /api/spell/tooltip — no internet needed) ────
  const _glyphTipCache = {};
  async function glyphSpellHover(e, sid){
    sid = parseInt(sid); if (!sid) return;
    let d = _glyphTipCache[sid];
    if (!d){
      try { const r = await fetch(`${API}/spell/tooltip/${sid}`); const j = await r.json(); if (!j.ok) return; d = j.data; _glyphTipCache[sid] = d; }
      catch(_){ return; }
    }
    document.getElementById('glyph-spell-tip')?.remove();
    const color = d.color || '#FFD700';
    const tip = document.createElement('div');
    tip.id = 'glyph-spell-tip';
    tip.style.cssText = `position:fixed;z-index:3000;background:linear-gradient(135deg,#0a1018,#050810);border:1px solid ${color};border-radius:6px;padding:10px 12px;font-family:'Share Tech Mono',monospace;font-size:0.78rem;color:var(--text);pointer-events:none;min-width:220px;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.85)`;
    const iconUrl = d.icon ? _glyphIcon(d.icon) : '';
    const iconH = iconUrl
      ? `<img src="${iconUrl}" style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;background:rgba(0,0,0,.4);flex-shrink:0"></div>`;
    let body = `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">${iconH}<div style="flex:1;min-width:0"><div style="color:${color};font-weight:600;line-height:1.25">${_glyphEsc(d.name)||'?'}</div>${d.rank?`<div style="color:${color};font-size:0.66rem;opacity:.7">${_glyphEsc(d.rank)}</div>`:''}</div></div>`;
    if (d.desc){ const dh = _glyphEsc(d.desc).replace(/\r?\n/g,'<br>'); body += `<div style="color:#ffd200;font-size:0.74rem;font-style:italic;line-height:1.35">${dh}</div>`; }
    body += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08);font-size:0.62rem;color:rgba(255,255,255,.3)">Spell ID: ${d.id||sid}</div>`;
    tip.innerHTML = body;
    document.body.appendChild(tip);
    positionTooltip(tip, e);
  }
  function glyphTipMove(e){ const t = document.getElementById('glyph-spell-tip'); if (t) positionTooltip(t, e); }
  function glyphTipHide(){ document.getElementById('glyph-spell-tip')?.remove(); }

  // ── Init ────────────────────────────────────────────────────────────────────
  async function initGlyphEditor(){
    if (_glyph.loaded) return;
    _glyph.loaded = true;
    try {
      const r = await fetch(`${API}/glyph/classes`); const d = await r.json();
      _glyph.classes = d.ok ? d.data : [];
    } catch(e){ _glyph.classes = []; }
    glyphRenderClassbar();
    glyphRenderTypebar();
  }

  function glyphRenderClassbar(){
    const bar = document.getElementById('glyph-classbar');
    if (!bar) return;
    bar.innerHTML = _glyph.classes.map(c => {
      const on = c.mask === _glyph.classMask;
      return `<button onclick="glyphSelectClass(${c.mask})" style="border:1px solid ${on?c.color:'var(--border)'};
        background:${on?c.color+'22':'var(--bg)'};color:${on?c.color:'var(--muted)'};border-radius:6px;
        padding:6px 13px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:0.82rem;font-weight:${on?'600':'400'}">
        ${_glyphEsc(c.name)}</button>`;
    }).join('');
  }

  function glyphRenderTypebar(){
    const maj = document.getElementById('glyph-type-major');
    const min = document.getElementById('glyph-type-minor');
    if (!maj || !min) return;
    maj.className = 'e-btn' + (_glyph.type === 'major' ? ' e-btn-green' : '');
    min.className = 'e-btn' + (_glyph.type === 'minor' ? ' e-btn-green' : '');
  }

  function glyphSelectClass(mask){
    _glyph.classMask = mask;
    glyphRenderClassbar();
    glyphLoadList();
  }

  function glyphSelectType(type){
    _glyph.type = type;
    glyphRenderTypebar();
    if (_glyph.classMask) glyphLoadList();
  }

  // ── List (left panel) ────────────────────────────────────────────────────────
  async function glyphLoadList(){
    const box = document.getElementById('glyph-list');
    if (!box) return;
    if (!_glyph.classMask){ box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0">Pick a class above…</div>`; return; }
    box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0">Loading…</div>`;
    try {
      const r = await fetch(`${API}/glyph/list?class=${_glyph.classMask}&type=${_glyph.type}`);
      const d = await r.json();
      _glyph.list = d.ok ? d.data : [];
    } catch(e){ _glyph.list = []; }
    glyphRenderList();
  }

  function glyphRenderList(){
    const box = document.getElementById('glyph-list');
    if (!box) return;
    const cls = _glyphClass(_glyph.classMask);
    if (!_glyph.list.length){
      box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:40px 0">No ${_glyph.type === 'minor' ? 'Minor' : 'Major'} glyphs for ${_glyphEsc(cls.name)}.</div>`;
      return;
    }
    box.innerHTML = _glyph.list.map(g => {
      const on = g.id === _glyph.selectedId;
      const iconUrl = g.icon ? _glyphIcon(g.icon) : '';
      const iconH = iconUrl
        ? `<img src="${iconUrl}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,.12)" onerror="this.style.visibility='hidden'">`
        : `<div style="width:32px;height:32px;border-radius:4px;background:rgba(0,0,0,.3);flex-shrink:0;border:1px solid rgba(255,255,255,.08)"></div>`;
      const badge = g.custom ? `<span style="font-size:0.6rem;color:#1eff00;border:1px solid #1eff0055;border-radius:3px;padding:0 4px;margin-left:4px">CUSTOM</span>` : '';
      return `<div onclick="glyphSelectGlyph(${g.id})"
        onmouseenter="glyphSpellHover(event,${g.spellId})" onmousemove="glyphTipMove(event)" onmouseleave="glyphTipHide()"
        style="display:flex;gap:9px;align-items:center;padding:7px 9px;cursor:pointer;border-radius:6px;margin-bottom:3px;
        border:1px solid ${on?cls.color:'transparent'};background:${on?cls.color+'18':'transparent'}"
        onmouseover="if(${g.id}!==${_glyph.selectedId||-1})this.style.background='rgba(255,255,255,.05)'"
        onmouseout="if(${g.id}!==${_glyph.selectedId||-1})this.style.background='transparent'">
        ${iconH}
        <div style="flex:1;min-width:0">
          <div style="color:var(--text);font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_glyphEsc(g.name)}${badge}</div>
          <div style="color:var(--muted);font-size:0.66rem">GP #${g.id} · Spell ${g.spellId}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Editor (right panel) ──────────────────────────────────────────────────────
  async function glyphSelectGlyph(id){
    _glyph.selectedId = id;
    _glyph.create = null;
    _glyph.effect = null;
    glyphRenderList();
    const pane = document.getElementById('glyph-editor');
    pane.innerHTML = `<div style="color:var(--muted);text-align:center;padding:60px 0">Loading glyph…</div>`;
    try {
      const r = await fetch(`${API}/glyph/${id}`); const d = await r.json();
      if (!d.ok){ pane.innerHTML = `<div style="color:var(--red);padding:20px">${_glyphEsc(d.error)}</div>`; return; }
      _glyph.edit = d.data;
      glyphRenderEditor();
      glyphLoadEffect(d.data.spellId);
    } catch(e){ pane.innerHTML = `<div style="color:var(--red);padding:20px">Server offline</div>`; }
  }

  function glyphRenderEditor(){
    const g = _glyph.edit;
    const pane = document.getElementById('glyph-editor');
    if (!g || !pane) return;
    const cls = _glyphClass(g.classMask);
    const iconUrl = g.icon ? _glyphIcon(g.icon) : '';
    const usageWarn = g.usage > 0
      ? `<div style="margin:10px 0;padding:8px 11px;border:1px solid #e0a52055;background:#e0a52012;border-radius:6px;color:#e0a520;font-size:0.76rem">
           ⚠️ <b>${g.usage}</b> characters/bots currently use this glyph. Renaming is safe (id-based);
           changing its effect applies to all of them automatically.</div>`
      : `<div style="margin:10px 0;color:var(--muted);font-size:0.74rem">No character currently uses this glyph.</div>`;
    pane.innerHTML = `
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:6px">
        ${iconUrl?`<img src="${iconUrl}" style="width:44px;height:44px;border-radius:6px;object-fit:cover;border:1px solid ${cls.color}66">`:''}
        <div>
          <h3 style="margin:0;color:${cls.color}">${_glyphEsc(g.name)}</h3>
          <div style="color:var(--muted);font-size:0.72rem">${_glyphEsc(cls.name)} · ${g.minor?'🔸 Minor':'🔷 Major'} · GlyphProperties #${g.id}${g.custom?' · <span style="color:#1eff00">CUSTOM</span>':''}</div>
        </div>
      </div>
      ${usageWarn}

      <!-- ── Section 1: identity (GlyphProperties.dbc) ── -->
      <div style="margin-top:8px;padding:12px 14px;border:1px solid var(--border);border-radius:8px">
        <div style="color:var(--gold);font-size:0.8rem;font-weight:600;margin-bottom:8px">📖 Glyph identity <span style="color:var(--muted);font-weight:400;font-size:0.7rem">· GlyphProperties.dbc</span></div>

        <label style="display:block;color:var(--muted);font-size:0.74rem">Name (glyph item name)</label>
        <input id="glyph-f-name" type="text" value="${_glyphEsc(g.name)}" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:inherit">
        ${g.itemEntry?`<div style="color:var(--muted);font-size:0.66rem;margin-top:3px">→ item_template #${g.itemEntry} (server DB, no MPQ needed)</div>`
          :`<div style="color:#e0a520;font-size:0.66rem;margin-top:3px">⚠️ No glyph item found — the rename is applied to the effect spell only.</div>`}

        <label style="display:block;margin-top:12px;color:var(--muted);font-size:0.74rem">Effect spell (what the glyph does)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <div id="glyph-f-spell-view" style="flex:1;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;font-size:0.82rem"
               onmouseenter="glyphSpellHover(event,${g.spellId})" onmousemove="glyphTipMove(event)" onmouseleave="glyphTipHide()">
            ${g.spellId?`<span style="color:var(--text)">${_glyphEsc(g.spellName||('Spell #'+g.spellId))}</span> <span style="color:var(--muted)">#${g.spellId}</span>`:'<span style="color:var(--muted)">— none —</span>'}
          </div>
          <button class="e-btn" onclick="glyphPickSpell('edit')">🔍 Choose</button>
          <button class="e-btn" onclick="glyphOpenSpellCreator('edit')">✨ New</button>
        </div>

        <div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:var(--muted);font-size:0.74rem">Icon ID</span>
          <input id="glyph-f-icon" type="number" value="${g.iconId||0}" style="width:90px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
          <button class="e-btn" onclick="glyphOpenIconPicker('edit')">🔍 Search icon</button>
          <span style="color:var(--muted);font-size:0.66rem">(SpellIcon.dbc)</span>
        </div>

        <div style="display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap">
          <button class="e-btn e-btn-green" onclick="glyphSave(this)">💾 Save + Patch</button>
          ${g.custom?`<button class="e-btn" style="color:var(--red);border-color:var(--red)" onclick="glyphDelete(this)">🗑 Delete</button>`:''}
          <span id="glyph-edit-status" style="color:var(--muted);font-size:0.76rem"></span>
        </div>
      </div>

      <!-- ── Section 2: effect (Spell.dbc) ── -->
      <div id="glyph-effect-box" style="margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:8px">
        <div style="color:var(--gold);font-size:0.8rem;font-weight:600;margin-bottom:4px">⚙️ Glyph effect <span style="color:var(--muted);font-weight:400;font-size:0.7rem">· Spell.dbc — what it increases/decreases</span></div>
        <div id="glyph-effect-body"><div style="color:var(--muted);padding:14px 0">Loading effect…</div></div>
      </div>`;
  }

  // ── Effect editor (Section 2) ─────────────────────────────────────────────────
  async function glyphLoadEffect(spellId){
    const body = document.getElementById('glyph-effect-body');
    if (!body) return;
    try {
      const r = await fetch(`${API}/glyph/effect/${spellId}`); const d = await r.json();
      if (!d.ok){ body.innerHTML = `<div style="color:var(--muted);padding:8px 0">No editable effect data for this spell.</div>`; return; }
      _glyph.effect = d.data;
      glyphRenderEffect();
    } catch(e){ body.innerHTML = `<div style="color:var(--red);padding:8px 0">Failed to load effect.</div>`; }
  }

  // Save the edited custom effect via the slot builder → rebuilds the spell (+ proc) in place.
  async function glyphEffectRebuild(btn){
    const b = _glyph.builder; if (!b) return;
    const comps = glyphBuilderComponents();
    if (!comps.length){ showToast('Set at least one effect slot','error'); return; }
    for (const x of comps){
      if (x.type === 'modifier' && !x.targetSpellId){ showToast('A modifier needs the spell it affects','error'); return; }
      if (x.type === 'proc' && !x.triggerSpellId){ showToast('The proc/spread needs a trigger spell','error'); return; }
      if (x.type === 'buff' && (x.duration|0)>0 && !x.triggerSpellId){ showToast('A temporary buff needs the spell that grants it','error'); return; }
    }
    const status = document.getElementById('glyph-effect-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳ Building…'; }
    if (status) status.textContent = 'Rebuilding effect + patching MPQ…';
    try {
      const r = await fetch(`${API}/glyph/effect-rebuild`, {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ spellId:b.spellId, name:b.name, iconId:b.iconId, description:glyphBuilderDesc(), components:comps })});
      const d = await r.json();
      if (!d.ok){ if(status) status.textContent=''; showToast(d.error||'Rebuild failed','error'); return; }
      if (status) status.innerHTML = `<span style="color:#1eff00">✓ rebuilt · MPQ patched — restart server</span>`;
      showToast('Glyph effect rebuilt ✓');
      _glyphTipCache[b.spellId] = undefined;
      glyphLoadList();
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '💾 Save effect + Patch'; } }
  }

  // ── Description generator (auto tooltip text from the modifier effects) ───────
  const _GLYPH_MODOP_PHRASE = {
    0:'the damage and healing', 1:'the duration', 2:'the threat', 5:'the range',
    6:'the radius', 7:'the critical strike chance', 10:'the casting time', 11:'the cooldown',
    14:'the cost', 15:'the critical damage', 19:'the activation time', 20:'the damage',
    21:'the global cooldown', 22:'the periodic effect', 24:'the bonus',
  };
  function _glyphModopPhrase(modop){ return _GLYPH_MODOP_PHRASE[modop] || ('the ' + _glyphModopLabel(modop).toLowerCase()); }
  function _glyphMsPhrase(ms){
    ms = Math.abs(ms|0); const s = ms/1000;
    if (s >= 60){ const m = s/60; return (Number.isInteger(m)?m:parseFloat(m.toFixed(1))) + ' min'; }
    return (Number.isInteger(s)?s:parseFloat(s.toFixed(1))) + ' sec';
  }
  function _glyphClauseTxt(s){
    if (!s.effect) return '';
    const isMod = (s.effect === 6 && (s.aura === AURA_ADD_FLAT || s.aura === AURA_ADD_PCT));
    if (!isMod) return '';
    const dec = s.value < 0, amt = Math.abs(s.value), pct = (s.aura === AURA_ADD_PCT);
    const verb = dec ? 'reduces' : 'increases';
    let amtTxt = pct ? (amt + '%') : (_GLYPH_MS_MODOPS.has(s.modop) ? _glyphMsPhrase(amt) : String(amt));
    return `${verb} ${_glyphModopPhrase(s.modop)} by ${amtTxt}`;
  }
  function glyphBuildDescription(slots){
    const cl = slots.map(_glyphClauseTxt).filter(Boolean);
    if (!cl.length) return '';
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    let s = (cl.length === 1) ? cl[0] : (cl.slice(0,-1).join(', ') + ', and ' + cl[cl.length-1]);
    return cap(s) + '.';
  }

  // ── Effect editor (Section 2) — up to 3 effects, auto description, live preview ─
  function glyphRenderEffect(){
    const fx = _glyph.effect;
    const body = document.getElementById('glyph-effect-body');
    if (!fx || !body) return;
    // ── Custom effect spell → the beginner slot builder (same as create), saved via rebuild. ──
    if (fx.custom && fx.components){
      const slots = [0,1,2].map(i => fx.components[i] || {type:'none'});
      _glyph.builder = { slots, boxId:'glyph-edit-slots', previewId:'glyph-edit-preview',
                         spellId: fx.spellId, name:(_glyph.edit && _glyph.edit.name) || fx.name, iconId: fx.iconId||0 };
      body.innerHTML = `
        <p style="color:var(--muted);font-size:0.72rem;margin:0 0 10px;line-height:1.4">
          3 effect slots — set each to a modifier or a proc/spread. Saving rebuilds this custom spell (and its proc) and
          patches <code>Spell.dbc</code> — <b>server restart</b> needed.</p>
        <div id="glyph-edit-slots"></div>
        <div style="margin-top:12px">
          <div style="color:var(--muted);font-size:0.7rem;margin-bottom:4px">🔎 In-game tooltip preview</div>
          <div id="glyph-edit-preview" style="background:linear-gradient(135deg,#0a1018,#050810);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:#1eff00;font-size:0.78rem;font-style:italic;min-height:20px"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
          <button class="e-btn e-btn-green" onclick="glyphEffectRebuild(this)">💾 Save effect + Patch</button>
          <span id="glyph-effect-status" style="color:var(--muted);font-size:0.76rem"></span>
        </div>`;
      glyphBuilderRender();
      return;
    }
    const modops = GLYPH_SPELLMODOPS.map(o => `<option value="${o.v}">${o.label}</option>`).join('');
    const activeCount = fx.slots.filter(s => s.effect !== 0).length;

    let html = `<p style="color:var(--muted);font-size:0.72rem;margin:0 0 10px;line-height:1.4">
      A glyph is a passive aura that <b>modifies</b> another spell. Add up to 3 effects (e.g. increase duration
      <i>and</i> reduce cooldown). Saving patches <code>Spell.dbc</code> (server + client MPQ) — <b>server restart</b> needed.</p>`;

    html += `<div id="glyph-fx-slots">`;
    for (const s of fx.slots){
      if (s.effect === 0) continue;
      html += _glyphSlotHtml(s, modops);
    }
    html += `</div>`;

    if (activeCount < 3){
      html += `<button class="e-btn" style="margin-bottom:12px" onclick="glyphEffectAddSlot()">➕ Add effect</button>`;
    }

    // Auto description + editable tooltip text (state kept on the model across add/remove)
    html += `
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--muted);font-size:0.74rem;margin-bottom:6px">
          <input type="checkbox" id="glyph-autodesc" ${fx.autodesc?'checked':''} onchange="glyphEffectOnInput()"> ✍ Auto description <span style="font-size:0.66rem">(rewrite the tooltip text from the effects above)</span>
        </label>
        <textarea id="glyph-desc" rows="2" oninput="glyphEffectRenderPreview()" placeholder="Tooltip text shown in-game…"
          style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:inherit;resize:vertical">${_glyphEsc(fx.desc||'')}</textarea>
      </div>

      <div id="glyph-preview" style="margin-top:12px"></div>

      <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
        <button class="e-btn e-btn-green" onclick="glyphEffectSave(this)">💾 Save effect + Patch</button>
        <span id="glyph-effect-status" style="color:var(--muted);font-size:0.76rem"></span>
      </div>`;
    body.innerHTML = html;

    // preselect modop dropdowns + hints
    body.querySelectorAll('#glyph-fx-slots [data-slot]').forEach(row => {
      const s = fx.slots.find(x => x.slot === parseInt(row.getAttribute('data-slot')));
      const modop = row.querySelector('.gfx-modop');
      if (modop && s) modop.value = String(s.modop);
      const amt = row.querySelector('.gfx-amt'); if (amt) glyphEffectAmountHint(amt);
    });
    glyphEffectRenderPreview();
  }

  function _glyphSlotHtml(s, modops){
    // treat "APPLY_AURA + add-flat/pct modifier" (and freshly-added slots) as the friendly editor
    const modifier = (s.effect === 6 && (s.aura === AURA_ADD_FLAT || s.aura === AURA_ADD_PCT || s.aura === 0));
    let inner;
    if (modifier){
      const dec = s.value < 0, amt = Math.abs(s.value), pct = (s.aura === AURA_ADD_PCT);
      inner = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Direction</label>
            <select class="gfx-dir" onchange="glyphEffectOnInput()" style="padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
              <option value="inc" ${!dec?'selected':''}>Increase</option><option value="dec" ${dec?'selected':''}>Decrease</option></select></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Property</label>
            <select class="gfx-modop" onchange="glyphEffectAmountHint(this);glyphEffectOnInput()" style="padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">${modops}</select></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Amount</label>
            <input class="gfx-amt" type="number" value="${amt}" oninput="glyphEffectAmountHint(this);glyphEffectOnInput()" style="width:110px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Type</label>
            <select class="gfx-type" onchange="glyphEffectAmountHint(this);glyphEffectOnInput()" style="padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
              <option value="flat" ${!pct?'selected':''}>Flat</option><option value="pct" ${pct?'selected':''}>Percent %</option></select></div>
          <span class="gfx-hint" style="color:var(--muted);font-size:0.68rem;padding-bottom:8px"></span>
        </div>`;
    } else {
      const note = (s.aura === 4)
        ? `⚙️ <b>Scripted effect</b> (DUMMY aura). This glyph's real behaviour — e.g. <i>"after using Shield Slam…"</i> or other conditional / on-action logic — lives in the server's <b>C++ code</b>, not the DBC. That's why there's no simple Increase/Decrease here: you can tweak the raw value, but the trigger itself can't be created in this editor.`
        : (s.aura === 42)
        ? `🎯 <b>Proc effect</b> (triggers a spell on an event). The trigger conditions (ProcFlags) live outside this effect; edit the raw value / trigger spell only if you know the setup.`
        : `Advanced effect (aura ${s.aura}). Not a simple flat/percent modifier, so it edits the raw value. Its behaviour may be handled by a C++ script and is not covered by the auto description.`;
      inner = `
        <div style="color:#e0a520;font-size:0.68rem;margin-bottom:8px;line-height:1.4">${note}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Effect</label>
            <input class="gfx-effect" type="number" value="${s.effect}" style="width:80px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Aura</label>
            <input class="gfx-aura" type="number" value="${s.aura}" style="width:80px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Misc (SpellModOp)</label>
            <input class="gfx-modop-raw" type="number" value="${s.modop}" style="width:110px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          <div><label style="display:block;color:var(--muted);font-size:0.68rem">Value</label>
            <input class="gfx-value-raw" type="number" value="${s.value}" style="width:120px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
        </div>`;
    }
    return `<div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px" data-slot="${s.slot}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="color:var(--muted);font-size:0.7rem">Effect ${s.slot}</span>
        <button class="e-btn" style="padding:2px 8px;font-size:0.7rem;color:var(--red);border-color:var(--red)" onclick="glyphEffectRemoveSlot(${s.slot})">✕ Remove</button>
      </div>${inner}</div>`;
  }

  // Read the current DOM rows back into _glyph.effect (keeps edits across add/remove).
  function glyphEffectSyncModel(){
    const fx = _glyph.effect; if (!fx) return;
    const ta = document.getElementById('glyph-desc'); if (ta) fx.desc = ta.value;
    const cb = document.getElementById('glyph-autodesc'); if (cb) fx.autodesc = cb.checked;
    document.querySelectorAll('#glyph-fx-slots [data-slot]').forEach(row => {
      const slot = parseInt(row.getAttribute('data-slot'));
      const s = fx.slots.find(x => x.slot === slot); if (!s) return;
      const modopSel = row.querySelector('.gfx-modop');
      if (modopSel){
        const dir = row.querySelector('.gfx-dir').value;
        const amt = Math.abs(parseInt(row.querySelector('.gfx-amt').value || '0'));
        s.effect = 6;
        s.aura = (row.querySelector('.gfx-type').value === 'pct' ? AURA_ADD_PCT : AURA_ADD_FLAT);
        s.modop = parseInt(modopSel.value);
        s.value = (dir === 'dec' ? -amt : amt);
      } else {
        s.effect = parseInt(row.querySelector('.gfx-effect').value || '0');
        s.aura   = parseInt(row.querySelector('.gfx-aura').value || '0');
        s.modop  = parseInt(row.querySelector('.gfx-modop-raw').value || '0');
        s.value  = parseInt(row.querySelector('.gfx-value-raw').value || '0');
      }
    });
  }

  function glyphEffectAddSlot(){
    glyphEffectSyncModel();
    const empty = _glyph.effect.slots.find(s => s.effect === 0);
    if (!empty){ showToast('A glyph can have at most 3 effects','error'); return; }
    empty.effect = 6; empty.aura = AURA_ADD_FLAT; empty.modop = 1; empty.value = 0;  // default: +duration
    glyphRenderEffect();
    glyphEffectOnInput();
  }
  function glyphEffectRemoveSlot(slot){
    glyphEffectSyncModel();
    const s = _glyph.effect.slots.find(x => x.slot === slot);
    if (s){ s.effect = 0; s.aura = 0; s.modop = 0; s.value = 0; }
    glyphRenderEffect();
    glyphEffectOnInput();
  }

  // live "= X min" hint for ms-based modops
  function glyphEffectAmountHint(el){
    const row = el.closest('[data-slot]'); if (!row) return;
    const hint = row.querySelector('.gfx-hint'); if (!hint) return;
    const modop = parseInt(row.querySelector('.gfx-modop')?.value || '0');
    const type = row.querySelector('.gfx-type')?.value;
    const amt = parseInt(row.querySelector('.gfx-amt')?.value || '0');
    if (type === 'flat' && _GLYPH_MS_MODOPS.has(modop)) hint.textContent = _glyphMsHint(amt);
    else if (type === 'pct') hint.textContent = '(percent)';
    else hint.textContent = '';
  }

  // On any effect edit: regenerate the description (if auto is on) + refresh the preview.
  function glyphEffectOnInput(){
    glyphEffectSyncModel();
    if (document.getElementById('glyph-autodesc')?.checked){
      const ta = document.getElementById('glyph-desc');
      const gen = glyphBuildDescription(_glyph.effect.slots);
      // Only overwrite when we could actually generate text — a scripted/dummy glyph produces
      // no clause, and we must not wipe its real tooltip.
      if (ta && gen){ ta.value = gen; _glyph.effect.desc = gen; }
    }
    glyphEffectRenderPreview();
  }

  // WoW-style glyph tooltip preview (icon + name + green effect text).
  function glyphEffectRenderPreview(){
    const box = document.getElementById('glyph-preview');
    if (!box) return;
    const g = _glyph.edit || {};
    const desc = document.getElementById('glyph-desc')?.value || '';
    const iconUrl = g.icon ? _glyphIcon(g.icon) : (_glyph.effect?.icon ? _glyphIcon(_glyph.effect.icon) : '');
    box.innerHTML = `
      <div style="color:var(--muted);font-size:0.7rem;margin-bottom:5px">🔎 In-game tooltip preview</div>
      <div style="max-width:320px;background:#05070c;border:1px solid #2a3550;border-radius:5px;padding:9px 11px;font-family:Arial,sans-serif">
        <div style="display:flex;gap:8px;align-items:center">
          ${iconUrl?`<img src="${iconUrl}" style="width:30px;height:30px;border-radius:3px;border:1px solid #3a4a6a;object-fit:cover" onerror="this.style.visibility='hidden'">`:''}
          <div style="color:#ffffff;font-weight:600;font-size:0.9rem">${_glyphEsc(g.name||_glyph.effect?.name||'Glyph')}</div>
        </div>
        <div style="color:#ffd100;font-size:0.72rem;margin-top:3px">${g.minor?'Minor Glyph':'Major Glyph'}</div>
        ${desc?`<div style="color:#1eff00;font-size:0.8rem;margin-top:6px;line-height:1.35">${_glyphEsc(desc)}</div>`
              :`<div style="color:#666;font-size:0.78rem;margin-top:6px;font-style:italic">No tooltip text — add effects and enable ✍ Auto description, or type your own.</div>`}
      </div>`;
  }

  async function glyphEffectSave(btn){
    const fx = _glyph.effect; if (!fx) return;
    glyphEffectSyncModel();
    const slots = fx.slots.map(s => ({ slot: s.slot, effect: s.effect, aura: s.aura, modop: s.modop, value: s.value }));
    const description = document.getElementById('glyph-desc')?.value ?? '';
    const status = document.getElementById('glyph-effect-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳ Building…'; }
    if (status) status.textContent = 'Patching Spell.dbc + rebuilding MPQ…';
    try {
      const r = await fetch(`${API}/glyph/effect/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spellId: fx.spellId, slots, description})});
      const d = await r.json();
      if (!d.ok){ if(status) status.textContent=''; showToast(d.error||'Effect save failed','error'); return; }
      const bak = d.data.backup_created ? ' (.bak created)' : '';
      if (status) status.innerHTML = `<span style="color:#1eff00">✓ effect patched${bak} · MPQ rebuilt — restart server</span>`;
      showToast(`Glyph effect saved + patched ✓${bak}`);
      _glyphTipCache[fx.spellId] = undefined; // refresh tooltip next hover
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '💾 Save effect + Patch'; } }
  }

  // ── Spell picker (reuses the shared modal) ────────────────────────────────────
  function glyphPickSpell(mode){
    openSpellSearchModal('🔍 Choose effect spell', (id, name) => {
      if (mode === 'create' && _glyph.create){
        _glyph.create.spellId = id; _glyph.create.spellName = name;
        _glyphRefreshCreateSpellView(id, name);
      } else if (_glyph.edit){
        _glyph.edit.spellId = id; _glyph.edit.spellName = name;
        const v = document.getElementById('glyph-f-spell-view');
        if (v) v.innerHTML = `<span style="color:var(--text)">${_glyphEsc(name)}</span> <span style="color:var(--muted)">#${id}</span>`;
        glyphLoadEffect(id); // reload effect breakdown for the newly chosen spell
      }
    });
  }

  // ── Icon picker modal ─────────────────────────────────────────────────────────
  function glyphOpenIconPicker(mode){
    const overlay = document.createElement('div');
    overlay.id = 'glyph-iconpicker';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:linear-gradient(135deg,#0c141d,#070b12);border:1px solid var(--gold);border-radius:10px;padding:18px 20px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.85)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="margin:0;color:var(--gold)">🔍 Pick an icon</h3>
          <button class="e-btn" onclick="document.getElementById('glyph-iconpicker').remove()">✕</button>
        </div>
        <input id="gip-q" type="text" placeholder="Search icons by name (e.g. fire, shield, frost)…" oninput="glyphIconSearchDebounced(this.value)"
          style="width:100%;padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);margin-bottom:10px">
        <div id="gip-grid" style="overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px;padding-right:4px">
          <div style="color:var(--muted);grid-column:1/-1;padding:20px;text-align:center">Type to search…</div>
        </div>
      </div>`;
    overlay.dataset.mode = mode;
    document.body.appendChild(overlay);
    glyphIconSearch(''); // show an initial batch
  }
  let _glyphIconTimer = null;
  function glyphIconSearchDebounced(q){ clearTimeout(_glyphIconTimer); _glyphIconTimer = setTimeout(() => glyphIconSearch(q), 220); }
  async function glyphIconSearch(q){
    const grid = document.getElementById('gip-grid'); if (!grid) return;
    try {
      const r = await fetch(`${API}/glyph/icons?q=${encodeURIComponent(q||'')}&limit=200`);
      const d = await r.json();
      if (!d.ok || !d.data.length){ grid.innerHTML = `<div style="color:var(--muted);grid-column:1/-1;padding:20px;text-align:center">No icons found.</div>`; return; }
      grid.innerHTML = d.data.map(ic => `
        <div title="${_glyphEsc(ic.name)} (#${ic.id})" onclick="glyphIconPick(${ic.id})"
          style="width:44px;height:44px;border-radius:5px;overflow:hidden;cursor:pointer;border:1px solid var(--border);background:rgba(0,0,0,.3)"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <img src="${_glyphIcon(ic.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.visibility='hidden'">
        </div>`).join('');
    } catch(e){ grid.innerHTML = `<div style="color:var(--red);grid-column:1/-1;padding:20px;text-align:center">Search failed.</div>`; }
  }
  function glyphIconPick(iconId){
    const overlay = document.getElementById('glyph-iconpicker');
    const mode = overlay?.dataset.mode;
    if (mode === 'create'){
      _glyph.create.iconId = iconId;
      const inp = document.getElementById('glyph-c-icon'); if (inp) inp.value = iconId;
    } else {
      const inp = document.getElementById('glyph-f-icon'); if (inp) inp.value = iconId;
    }
    overlay?.remove();
  }

  // ── Save (edit existing) ──────────────────────────────────────────────────────
  async function glyphSave(btn, force){
    const g = _glyph.edit; if (!g) return;
    const name  = document.getElementById('glyph-f-name')?.value.trim();
    const iconId= parseInt(document.getElementById('glyph-f-icon')?.value || '0') || 0;
    // Major/Minor is set by the list toggle you came in through — kept as-is (not editable here).
    const payload = { id: g.id, name, spellId: g.spellId, iconId, itemEntry: g.itemEntry, force: !!force };
    const status = document.getElementById('glyph-edit-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳ Building…'; }
    if (status) status.textContent = 'Writing GlyphProperties.dbc + rebuilding MPQ…';
    try {
      const r = await fetch(`${API}/glyph/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok){
        if (status) status.textContent = '';
        if (/Safety stop/i.test(d.error||'') && !force){
          const okc = await uiConfirm(d.error + '\n\nSave anyway?', {title:'Safety stop', okText:'Force save', danger:true});
          if (btn){ btn.disabled = false; btn.textContent = '💾 Save + Patch'; }
          if (okc) return glyphSave(btn, true);
          return;
        }
        showToast(d.error || 'Save failed','error'); return;
      }
      const bak = d.data.backup_created ? ' (.bak created)' : '';
      if (status) status.innerHTML = `<span style="color:#1eff00">✓ saved${bak} · MPQ rebuilt — restart server + relog</span>`;
      showToast(`Glyph saved + patched ✓${bak}`);
      glyphLoadList();
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '💾 Save + Patch'; } }
  }

  async function glyphDelete(btn){
    const g = _glyph.edit; if (!g || !g.custom) return;
    const okc = await uiConfirm(`Delete custom glyph "${g.name}" (GP #${g.id}) and its item? `
      + `${g.usage>0?`\n\n⚠️ ${g.usage} characters/bots use it — run "🤖 Repair Bots" afterwards.`:''}`,
      {title:'Delete glyph', okText:'Delete', danger:true});
    if (!okc) return;
    if (btn){ btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      const r = await fetch(`${API}/glyph/delete`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:g.id})});
      const d = await r.json();
      if (!d.ok){ showToast(d.error||'Delete failed','error'); return; }
      showToast('Glyph deleted + MPQ rebuilt ✓');
      _glyph.selectedId = null; _glyph.edit = null;
      document.getElementById('glyph-editor').innerHTML = `<div style="color:var(--muted);text-align:center;padding:60px 0">Glyph deleted.</div>`;
      glyphLoadList();
    } catch(e){ showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '🗑 Delete'; } }
  }

  // ── Add Glyph (create form in the right pane) ─────────────────────────────────
  function glyphOpenCreate(){
    _glyph.selectedId = null; _glyph.edit = null; _glyph.effect = null;
    _glyph.create = { classMask: _glyph.classMask || 0, minor: (_glyph.type==='minor'), name:'', spellId:0, spellName:'', iconId:0,
                      effectMode:'build',
                      slots:[ {type:'proc', triggerSpellId:0, triggerName:'', radius:20, payload:'real'},
                              {type:'none'}, {type:'none'} ] };
    glyphRenderList();
    glyphRenderCreate();
  }

  function glyphRenderCreate(){
    const c = _glyph.create;
    const pane = document.getElementById('glyph-editor');
    if (!c || !pane) return;
    const classOpts = _glyph.classes.map(cl =>
      `<option value="${cl.mask}" ${cl.mask===c.classMask?'selected':''}>${_glyphEsc(cl.name)}</option>`).join('');
    // Major/Minor is inherited from the list toggle you are on (point 5) — shown read-only.
    pane.innerHTML = `
      <h3 style="margin:0 0 4px;color:var(--gold)">➕ Create new glyph</h3>
      <p style="color:var(--muted);font-size:0.76rem;margin:0 0 14px">Creates a <code>GlyphProperties</code> id, a learn spell and a glyph item. The <b>effect spell</b> is the actual behaviour (choose an existing one or create a new glyph-safe spell).</p>

      <label style="display:block;color:var(--muted);font-size:0.74rem">Class</label>
      <select id="glyph-c-class" onchange="_glyph.create.classMask=parseInt(this.value)" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">${classOpts}</select>

      <div style="margin-top:12px;color:var(--muted);font-size:0.74rem">
        Type: <b style="color:var(--text)">${c.minor?'🔸 Minor':'🔷 Major'}</b>
        <span style="font-size:0.66rem">(set by the Major/Minor button above — switch it there)</span>
      </div>

      <label style="display:block;margin-top:12px;color:var(--muted);font-size:0.74rem">Name</label>
      <input id="glyph-c-name" type="text" placeholder="e.g. Glyph of ..." value="${_glyphEsc(c.name)}" oninput="_glyph.create.name=this.value" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">

      <label style="display:block;margin-top:14px;color:var(--muted);font-size:0.74rem">Effect</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="glyph-c-eff-build"  class="e-btn e-btn-green" onclick="glyphCreateEffectMode('build')">🛠 Build custom</button>
        <button id="glyph-c-eff-choose" class="e-btn"            onclick="glyphCreateEffectMode('choose')">🔍 Choose existing</button>
      </div>

      <div id="glyph-c-choose" style="display:none;margin-top:10px">
        <div style="display:flex;gap:8px;align-items:center">
          <div id="glyph-c-spell-view" style="flex:1;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;font-size:0.82rem">
            <span style="color:var(--muted)">— none chosen —</span>
          </div>
          <button class="e-btn" onclick="glyphPickSpell('create')">🔍 Choose</button>
        </div>
      </div>

      <div id="glyph-c-build" style="margin-top:10px">
        <p style="color:var(--muted);font-size:0.7rem;margin:0 0 8px;line-height:1.4">3 effect slots — set each to a modifier or a proc/spread (or leave empty). The tooltip is written automatically.</p>
        <div id="glyph-c-slots"></div>
        <div style="margin-top:12px">
          <div style="color:var(--muted);font-size:0.7rem;margin-bottom:4px">🔎 In-game tooltip preview</div>
          <div id="glyph-c-preview" style="background:linear-gradient(135deg,#0a1018,#050810);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:#1eff00;font-size:0.78rem;font-style:italic;min-height:20px"></div>
        </div>
      </div>

      <div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="color:var(--muted);font-size:0.74rem">Icon ID</span>
        <input id="glyph-c-icon" type="number" value="${c.iconId||0}" oninput="_glyph.create.iconId=parseInt(this.value)||0" style="width:90px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
        <button class="e-btn" onclick="glyphOpenIconPicker('create')">🔍 Search icon</button>
        <span style="color:var(--muted);font-size:0.66rem">(optional — defaults to the effect spell's icon)</span>
      </div>

      <div style="display:flex;gap:8px;margin-top:18px;align-items:center;flex-wrap:wrap">
        <button class="e-btn e-btn-green" onclick="glyphCreate(this)">➕ Create glyph + Patch</button>
        <span id="glyph-create-status" style="color:var(--muted);font-size:0.76rem"></span>
      </div>
      <div id="glyph-create-result"></div>`;
    _glyph.builder = { slots: _glyph.create.slots, boxId:'glyph-c-slots', previewId:'glyph-c-preview' };
    glyphBuilderRender();
  }

  // ── Inline effect builder (create form) ───────────────────────────────────────
  function glyphCreateEffectMode(mode){
    const c = _glyph.create; if (!c) return;
    c.effectMode = mode;
    document.getElementById('glyph-c-build').style.display  = (mode === 'build')  ? '' : 'none';
    document.getElementById('glyph-c-choose').style.display = (mode === 'choose') ? '' : 'none';
    document.getElementById('glyph-c-eff-build').className  = 'e-btn' + (mode === 'build'  ? ' e-btn-green' : '');
    document.getElementById('glyph-c-eff-choose').className = 'e-btn' + (mode === 'choose' ? ' e-btn-green' : '');
  }
  // ── Shared slot builder — used by BOTH the create form and the edit effect editor. ──
  // _glyph.builder = { slots:[3], boxId, previewId }.  glyphCreateRenderPreview is kept as an
  // alias so older call sites still work.
  function glyphSlotType(i, type){
    const slots = _glyph.builder.slots;
    if (type === 'proc' && slots.some((s, j) => j !== i && s.type === 'proc')){
      showToast('Only one proc/spread per glyph','error'); glyphBuilderRender(); return;
    }
    if (type === 'modifier') slots[i] = {type:'modifier', dir:'inc', modop:11, mtype:'flat', amount:5000, targetSpellId:0, targetName:''};
    else if (type === 'buff') slots[i] = {type:'buff', stat:'spellpower', amount:50, duration:0, triggerSpellId:0, triggerName:''};
    else if (type === 'proc') slots[i] = {type:'proc', triggerSpellId:0, triggerName:'', radius:20, payload:'real'};
    else slots[i] = {type:'none'};
    glyphBuilderRender();
  }
  function glyphBuilderRender(){
    const b = _glyph.builder; if (!b) return;
    const box = document.getElementById(b.boxId); if (!box) { glyphBuilderPreview(); return; }
    const modops = GLYPH_SPELLMODOPS.map(o => `<option value="${o.v}">${o.label}</option>`).join('');
    box.innerHTML = (b.slots || []).map((c, i) => {
      const typeSel = `<select onchange="glyphSlotType(${i}, this.value)" style="padding:4px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.74rem">
          <option value="none" ${c.type==='none'?'selected':''}>— empty —</option>
          <option value="modifier" ${c.type==='modifier'?'selected':''}>🔧 Modifier</option>
          <option value="buff" ${c.type==='buff'?'selected':''}>🌟 Buff (stats)</option>
          <option value="proc" ${c.type==='proc'?'selected':''}>🎯 Proc / spread</option>
        </select>`;
      const head = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:${c.type==='none'?'0':'8px'}">
          <span style="color:#69ccf0;font-size:0.72rem;font-weight:600;min-width:56px">Effect ${i+1}</span>${typeSel}</div>`;
      let body = '';
      if (c.type === 'modifier'){
        body = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Direction</label>
              <select onchange="_glyph.builder.slots[${i}].dir=this.value;glyphBuilderPreview()" style="padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                <option value="inc" ${c.dir!=='dec'?'selected':''}>Increase</option><option value="dec" ${c.dir==='dec'?'selected':''}>Decrease</option></select></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Property</label>
              <select onchange="_glyph.builder.slots[${i}].modop=parseInt(this.value);glyphBuilderPreview()" style="padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)" data-modop="${c.modop}">${modops}</select></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Type</label>
              <select onchange="_glyph.builder.slots[${i}].mtype=this.value;glyphBuilderPreview()" style="padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                <option value="flat" ${c.mtype!=='pct'?'selected':''}>Flat</option><option value="pct" ${c.mtype==='pct'?'selected':''}>%</option></select></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Amount</label>
              <input type="number" value="${c.amount}" oninput="_glyph.builder.slots[${i}].amount=parseInt(this.value)||0;glyphBuilderPreview()" style="width:100px;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <span style="color:var(--muted);font-size:0.66rem">Affects:</span>
            <div style="flex:1;font-size:0.76rem">${c.targetName ? `<span style="color:var(--text)">${_glyphEsc(c.targetName)}</span> <span style="color:var(--muted)">#${c.targetSpellId}</span>` : '<span style="color:#e0a520">⚠ pick the spell it modifies</span>'}</div>
            <button class="e-btn" style="padding:3px 9px" onclick="glyphBuilderPickTarget(${i})">🔍 Spell</button>
          </div>`;
      } else if (c.type === 'buff'){
        const stats = GLYPH_STATS.map(o => `<option value="${o.v}">${o.label}</option>`).join('');
        const temp = (c.duration|0) > 0;
        body = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Stat</label>
              <select onchange="_glyph.builder.slots[${i}].stat=this.value;glyphBuilderPreview()" style="padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)" data-stat="${c.stat}">${stats}</select></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Amount</label>
              <input type="number" value="${c.amount}" oninput="_glyph.builder.slots[${i}].amount=parseInt(this.value)||0;glyphBuilderPreview()" style="width:90px;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Duration (sec)</label>
              <input type="number" value="${c.duration||0}" oninput="_glyph.builder.slots[${i}].duration=parseInt(this.value)||0;glyphBuilderRender()" title="0 = permanent while socketed" style="width:100px;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
          </div>
          ${temp ? `<div style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <span style="color:var(--muted);font-size:0.66rem">On cast of:</span>
            <div style="flex:1;font-size:0.76rem">${c.triggerName ? `<span style="color:var(--text)">${_glyphEsc(c.triggerName)}</span> <span style="color:var(--muted)">#${c.triggerSpellId}</span>` : '<span style="color:#e0a520">⚠ pick the spell that grants it (e.g. Moonfire)</span>'}</div>
            <button class="e-btn" style="padding:3px 9px" onclick="glyphBuilderPickTrigger(${i})">🔍 Spell</button></div>`
          : `<div style="color:var(--muted);font-size:0.64rem;margin-top:4px">0 sec = permanent (always on while socketed). Set a duration for a temporary buff on cast.</div>`}`;
      } else if (c.type === 'proc'){
        body = `<div style="display:flex;gap:8px;align-items:center">
            <span style="color:var(--muted);font-size:0.66rem">Trigger:</span>
            <div style="flex:1;font-size:0.76rem">${c.triggerName ? `<span style="color:var(--text)">${_glyphEsc(c.triggerName)}</span> <span style="color:var(--muted)">#${c.triggerSpellId}</span>` : '<span style="color:#e0a520">⚠ pick the trigger spell (e.g. Moonfire)</span>'}</div>
            <button class="e-btn" style="padding:3px 9px" onclick="glyphBuilderPickTrigger(${i})">🔍 Spell</button>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-end;margin-top:8px;flex-wrap:wrap">
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Radius (yd)</label>
              <input type="number" value="${c.radius}" oninput="_glyph.builder.slots[${i}].radius=parseInt(this.value)||20;glyphBuilderPreview()" style="width:80px;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)"></div>
            <div><label style="display:block;color:var(--muted);font-size:0.66rem">Each enemy gets</label>
              <select onchange="_glyph.builder.slots[${i}].payload=this.value" style="padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                <option value="real" ${c.payload!=='copy'?'selected':''}>🌟 The real spell</option><option value="copy" ${c.payload==='copy'?'selected':''}>🛡 Damage copy</option></select></div>
          </div>`;
      }
      const border = c.type === 'none' ? 'var(--border)' : '#69ccf055';
      return `<div style="border:1px solid ${border};border-radius:6px;padding:9px 11px;margin-bottom:8px">${head}${body}</div>`;
    }).join('');
    box.querySelectorAll('select[data-modop]').forEach(sel => { sel.value = sel.getAttribute('data-modop'); });
    box.querySelectorAll('select[data-stat]').forEach(sel => { sel.value = sel.getAttribute('data-stat'); });
    glyphBuilderPreview();
  }
  function glyphBuilderPickTarget(i){
    openSpellSearchModal('🔍 Which spell does this modify?', (id, name) => {
      _glyph.builder.slots[i].targetSpellId = id; _glyph.builder.slots[i].targetName = name;
      glyphBuilderRender();
    });
  }
  function glyphBuilderPickTrigger(i){
    openSpellSearchModal('🔍 Choose the trigger spell', (id, name) => {
      _glyph.builder.slots[i].triggerSpellId = id; _glyph.builder.slots[i].triggerName = name;
      glyphBuilderRender();
    });
  }
  function glyphBuilderDesc(){
    const parts = [];
    for (const c of (_glyph.builder.slots || [])){
      if (c.type === 'modifier'){
        const verb = c.dir === 'dec' ? 'Reduces' : 'Increases';
        const prop = _glyphModopPhrase(c.modop) + (c.targetName ? ` of ${c.targetName}` : '');
        const amt = c.mtype === 'pct' ? (c.amount + '%') : (_GLYPH_MS_MODOPS.has(c.modop) ? _glyphMsPhrase(c.amount) : String(c.amount));
        parts.push(`${verb} ${prop} by ${amt}.`);
      } else if (c.type === 'buff'){
        const stat = _glyphStatLabel(c.stat).toLowerCase(), amt = `${c.amount}${_glyphStatUnit(c.stat)}`;
        if ((c.duration|0) > 0)
          parts.push(`When you cast ${c.triggerName || 'a spell'}, gain ${amt} ${stat} for ${c.duration} sec.`);
        else
          parts.push(`Increases your ${stat} by ${amt}.`);
      } else if (c.type === 'proc'){
        parts.push(`When you cast ${c.triggerName || 'a spell'}, it also strikes all enemies within ${c.radius} yards of your target.`);
      }
    }
    return parts.join(' ');
  }
  function glyphBuilderComponents(){ return (_glyph.builder.slots || []).filter(s => s.type && s.type !== 'none'); }
  function glyphBuilderPreview(){
    const b = _glyph.builder; if (!b) return;
    const el = document.getElementById(b.previewId); if (!el) return;
    const t = glyphBuilderDesc();
    el.textContent = t || '(set an effect to see the tooltip)';
    el.style.color = t ? '#1eff00' : 'var(--muted)';
  }
  // legacy aliases (create form)
  function glyphRenderSlots(){ glyphBuilderRender(); }
  function glyphCreateRenderPreview(){ glyphBuilderPreview(); }
  function glyphCreateBuildDesc(){ return glyphBuilderDesc(); }

  function _glyphRefreshCreateSpellView(id, name){
    const v = document.getElementById('glyph-c-spell-view');
    if (v) v.innerHTML = `<span style="color:var(--text)">${_glyphEsc(name)}</span> <span style="color:var(--muted)">#${id}</span>`;
  }

  async function glyphCreate(btn){
    const c = _glyph.create; if (!c) return;
    c.name = (document.getElementById('glyph-c-name')?.value || c.name).trim();
    if (!c.classMask){ showToast('Choose a class','error'); return; }
    if (!c.name){ showToast('Enter a name','error'); return; }
    const status = document.getElementById('glyph-create-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳ Building…'; }
    try {
      // Build mode → assemble the combined effect spell first, then create the glyph around it.
      if (c.effectMode === 'build'){
        const comps = (c.slots || []).filter(s => s.type && s.type !== 'none');
        if (!comps.length){ showToast('Set at least one effect slot','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
        for (const x of comps){
          if (x.type === 'modifier' && !x.targetSpellId){ showToast('A modifier needs the spell it affects','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
          if (x.type === 'proc' && !x.triggerSpellId){ showToast('The proc/spread needs a trigger spell','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
          if (x.type === 'buff' && (x.duration|0)>0 && !x.triggerSpellId){ showToast('A temporary buff needs the spell that grants it','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
        }
        if (status) status.textContent = 'Building combined effect spell…';
        const br = await fetch(`${API}/glyph/effect-build`, {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ name:c.name, iconId:c.iconId||0, description:glyphCreateBuildDesc(), components:comps })});
        const bd = await br.json();
        if (!bd.ok){ if(status) status.textContent=''; showToast(bd.error||'Effect build failed','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
        c.spellId = bd.data.effectSpellId;
      }
      if (!c.spellId){ showToast('Choose or build an effect spell','error'); if(btn){btn.disabled=false;btn.textContent='➕ Create glyph + Patch';} return; }
      if (status) status.textContent = 'Creating glyph + rebuilding MPQ…';
      const r = await fetch(`${API}/glyph/create`, {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ classMask:c.classMask, minor:c.minor, name:c.name, spellId:c.spellId, iconId:c.iconId||0 })});
      const d = await r.json();
      if (!d.ok){ if(status) status.textContent=''; showToast(d.error||'Create failed','error'); return; }
      if (status) status.innerHTML = `<span style="color:#1eff00">✓ GP #${d.data.glyphId} · item #${d.data.itemEntry} · MPQ rebuilt</span>`;
      showToast(`Glyph created ✓ (GP #${d.data.glyphId})`);
      const res = document.getElementById('glyph-create-result');
      if (res && d.data.playerbot_note){
        res.innerHTML = `<div style="margin-top:14px;padding:10px 12px;border:1px solid #4a9eff44;background:#4a9eff10;border-radius:6px;color:#9cc4ff;font-size:0.74rem;line-height:1.45">
          🤖 <b>Playerbots note:</b> ${_glyphEsc(d.data.playerbot_note)}</div>`;
      }
      _glyph.classMask = c.classMask; _glyph.type = c.minor ? 'minor' : 'major';
      glyphRenderClassbar(); glyphRenderTypebar(); glyphLoadList();
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '➕ Create glyph + Patch'; } }
  }

  // ── Constrained glyph-spell creator (passive aura modifier only) ──────────────
  function glyphOpenSpellCreator(mode){
    const modeIsCreate = (mode === 'create');
    const overlay = document.createElement('div');
    overlay.id = 'glyph-spellcreator';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
    const modops = GLYPH_SPELLMODOPS.map(o => `<option value="${o.v}">${o.label}</option>`).join('');
    _glyph.procTrigger = null;
    overlay.dataset.linkMode = modeIsCreate ? 'create' : 'edit';
    overlay.dataset.mode = 'modifier';
    overlay.innerHTML = `
      <div style="background:linear-gradient(135deg,#0c141d,#070b12);border:1px solid var(--gold);border-radius:10px;padding:20px 22px;max-width:520px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.85)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="margin:0;color:var(--gold)">✨ Create glyph effect spell</h3>
          <button class="e-btn" onclick="document.getElementById('glyph-spellcreator').remove()">✕</button>
        </div>

        <!-- mode toggle -->
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="gsc-tab-modifier" class="e-btn e-btn-green" onclick="glyphSpellCreatorMode('modifier')">🔧 Modifier</button>
          <button id="gsc-tab-proc" class="e-btn" onclick="glyphSpellCreatorMode('proc')">🎯 Proc / spread</button>
        </div>

        <label style="display:block;color:var(--muted);font-size:0.74rem">Name</label>
        <input id="gsc-name" type="text" placeholder="e.g. Glyph of ..." style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">

        <!-- ── MODIFIER MODE ── -->
        <div id="gsc-modifier">
          <p style="color:var(--muted);font-size:0.72rem;margin:12px 0 10px;line-height:1.4">
            A <b>passive</b> aura that <b>modifies</b> another spell (duration, cooldown, cost, …). Start from a template, then tweak.
          </p>
          <div style="background:rgba(105,204,240,.05);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px">
            <div style="color:#69ccf0;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">✨ Start from a template</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;max-height:170px;overflow-y:auto">
              ${GLYPH_CREATE_TEMPLATES.map(t => `
                <div onclick="glyphSpellCreatorPickTemplate('${t.key}')" title="${_glyphEsc(t.desc)}"
                  style="cursor:pointer;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 9px;transition:.12s"
                  onmouseover="this.style.borderColor='#69ccf0'" onmouseout="this.style.borderColor='var(--border)'">
                  <div style="color:#69ccf0;font-size:0.76rem;font-weight:600">${_glyphEsc(t.label)}</div>
                </div>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:130px">
              <label style="display:block;color:var(--muted);font-size:0.74rem">Direction</label>
              <select id="gsc-dir" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
                <option value="inc">Increase</option><option value="dec">Decrease</option>
              </select>
            </div>
            <div style="flex:1;min-width:130px">
              <label style="display:block;color:var(--muted);font-size:0.74rem">Property</label>
              <select id="gsc-modop" onchange="glyphSpellCreatorHint()" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">${modops}</select>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:130px">
              <label style="display:block;color:var(--muted);font-size:0.74rem">Type</label>
              <select id="gsc-type" onchange="glyphSpellCreatorHint()" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
                <option value="flat">Flat</option><option value="pct">Percent %</option>
              </select>
            </div>
            <div style="flex:1;min-width:130px">
              <label style="display:block;color:var(--muted);font-size:0.74rem">Amount <span id="gsc-hint" style="color:#69ccf0;font-size:0.66rem"></span></label>
              <input id="gsc-amt" type="number" value="10" oninput="glyphSpellCreatorHint()" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
            </div>
          </div>
          <details style="margin-top:12px">
            <summary style="color:var(--muted);font-size:0.74rem;cursor:pointer">⚙️ Advanced: which spell it affects (SpellFamily + class mask)</summary>
            <div style="display:flex;gap:10px;margin-top:8px">
              <div style="width:130px">
                <label style="display:block;color:var(--muted);font-size:0.7rem">SpellFamily</label>
                <input id="gsc-family" type="number" value="0" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
              </div>
              <div style="flex:1">
                <label style="display:block;color:var(--muted);font-size:0.7rem">ClassMask A / B / C</label>
                <div style="display:flex;gap:6px">
                  <input id="gsc-mask-a" type="number" value="0" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                  <input id="gsc-mask-b" type="number" value="0" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                  <input id="gsc-mask-c" type="number" value="0" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                </div>
              </div>
            </div>
            <p style="color:var(--muted);font-size:0.66rem;margin:6px 0 0">Without a family/mask a %/flat modifier affects no specific spell. Read these off the target spell.</p>
          </details>
        </div>

        <!-- ── PROC / SPREAD MODE ── -->
        <div id="gsc-proc" style="display:none">
          <p style="color:var(--muted);font-size:0.72rem;margin:12px 0 10px;line-height:1.4">
            <b>When you cast a spell, hit every enemy near your target too.</b> Pure DB (a server-side proc) — no script,
            works for all players. Loop-safe by construction.
          </p>
          <label style="display:block;color:var(--muted);font-size:0.74rem">Trigger spell (procs when you cast this)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <div id="gsc-proc-trigger-view" style="flex:1;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;font-size:0.82rem">
              <span style="color:var(--muted)">— none chosen (e.g. Moonfire) —</span>
            </div>
            <button class="e-btn" onclick="glyphProcPickTrigger()">🔍 Choose</button>
          </div>
          <label style="display:block;margin-top:12px;color:var(--muted);font-size:0.74rem">Each enemy gets</label>
          <div style="display:flex;gap:16px;margin-top:4px;flex-wrap:wrap">
            <label style="color:var(--muted);font-size:0.78rem;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="gsc-proc-payload" value="real" checked onchange="glyphProcPayloadToggle()"> 🌟 The real spell (authentic)</label>
            <label style="color:var(--muted);font-size:0.78rem;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="gsc-proc-payload" value="copy" onchange="glyphProcPayloadToggle()"> 🛡 A damage copy (always safe)</label>
          </div>
          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:110px">
              <label style="display:block;color:var(--muted);font-size:0.74rem">Radius (yd)</label>
              <input id="gsc-proc-radius" type="number" value="20" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
            </div>
            <div id="gsc-proc-copyfields" style="display:none;gap:10px;flex:2;min-width:230px">
              <div style="flex:1;min-width:100px">
                <label style="display:block;color:var(--muted);font-size:0.74rem">Damage / target</label>
                <input id="gsc-proc-damage" type="number" placeholder="(copy trigger)" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
              </div>
              <div style="flex:1;min-width:100px">
                <label style="display:block;color:var(--muted);font-size:0.74rem">School</label>
                <select id="gsc-proc-school" style="width:100%;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text)">
                  <option value="0">(copy trigger)</option><option value="1">Physical</option><option value="2">Holy</option>
                  <option value="4">Fire</option><option value="8">Nature</option><option value="16">Frost</option>
                  <option value="32">Shadow</option><option value="64">Arcane</option>
                </select>
              </div>
            </div>
          </div>
          <p id="gsc-proc-note" style="color:var(--muted);font-size:0.66rem;margin:8px 0 0;line-height:1.4"></p>
        </div>

        <div style="display:flex;gap:8px;margin-top:16px;align-items:center">
          <button class="e-btn e-btn-green" onclick="glyphSpellCreatorSave(this)">✨ Create + link</button>
          <span id="gsc-status" style="color:var(--muted);font-size:0.74rem"></span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function glyphSpellCreatorMode(m){
    const ov = document.getElementById('glyph-spellcreator'); if (!ov) return;
    ov.dataset.mode = m;
    document.getElementById('gsc-modifier').style.display = (m === 'modifier') ? '' : 'none';
    document.getElementById('gsc-proc').style.display     = (m === 'proc') ? '' : 'none';
    document.getElementById('gsc-tab-modifier').className = 'e-btn' + (m === 'modifier' ? ' e-btn-green' : '');
    document.getElementById('gsc-tab-proc').className     = 'e-btn' + (m === 'proc' ? ' e-btn-green' : '');
    if (m === 'proc') glyphProcPayloadToggle();
  }

  function glyphProcPickTrigger(){
    openSpellSearchModal('🔍 Choose the trigger spell', (id, name) => {
      _glyph.procTrigger = { id, name };
      const v = document.getElementById('gsc-proc-trigger-view');
      if (v) v.innerHTML = `<span style="color:var(--text)">${_glyphEsc(name)}</span> <span style="color:var(--muted)">#${id}</span>`;
    });
  }

  function _glyphProcPayload(){ return document.querySelector('input[name="gsc-proc-payload"]:checked')?.value || 'real'; }
  function glyphProcPayloadToggle(){
    const real = _glyphProcPayload() === 'real';
    const cf = document.getElementById('gsc-proc-copyfields');
    if (cf) cf.style.display = real ? 'none' : 'flex';
    const note = document.getElementById('gsc-proc-note');
    if (note) note.innerHTML = real
      ? 'Casts the <b>real</b> trigger spell on each nearby enemy — exact damage, DoT, visual & debuff, and it auto-scales. A 250&nbsp;ms proc cooldown prevents any loop.'
      : 'Builds an <b>AoE copy</b> of the trigger\'s damage + DoT + visual (100% loop-safe). Leave damage/school empty to copy the trigger\'s values.';
  }

  // Seed the create form from a glyph template.
  function glyphSpellCreatorPickTemplate(key){
    const t = GLYPH_CREATE_TEMPLATES.find(x => x.key === key); if (!t) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('gsc-dir', t.dir); set('gsc-modop', String(t.modop)); set('gsc-type', t.type); set('gsc-amt', t.amount);
    // suggest a name only if the field is still empty
    const nm = document.getElementById('gsc-name');
    if (nm && !nm.value.trim()) nm.value = 'Glyph of ';
    glyphSpellCreatorHint();
  }

  // Live unit hint next to the Amount field (ms → "= X sec", %, yd, targets).
  function glyphSpellCreatorHint(){
    const hint = document.getElementById('gsc-hint'); if (!hint) return;
    const modop = parseInt(document.getElementById('gsc-modop')?.value || '0');
    const type = document.getElementById('gsc-type')?.value;
    const amt = parseInt(document.getElementById('gsc-amt')?.value || '0');
    if (type === 'pct'){ hint.textContent = '(%)'; return; }
    if (_GLYPH_MS_MODOPS.has(modop)){ hint.textContent = 'ms' + _glyphMsHint(amt); return; }
    if (modop === 5 || modop === 6){ hint.textContent = '(yards)'; return; }
    if (modop === 17){ hint.textContent = '(targets)'; return; }
    hint.textContent = '';
  }

  // Link a freshly-created effect spell into the glyph create-form or the edit-form.
  function _glyphLinkEffectSpell(sid, name, linkMode){
    if (linkMode === 'create' && _glyph.create){
      _glyph.create.spellId = sid; _glyph.create.spellName = name;
      _glyphRefreshCreateSpellView(sid, name);
    } else if (_glyph.edit){
      _glyph.edit.spellId = sid; _glyph.edit.spellName = name;
      const v = document.getElementById('glyph-f-spell-view');
      if (v) v.innerHTML = `<span style="color:var(--text)">${_glyphEsc(name)}</span> <span style="color:var(--muted)">#${sid}</span>`;
      glyphLoadEffect(sid);
    }
  }

  async function glyphSpellCreatorSave(btn){
    const ov = document.getElementById('glyph-spellcreator');
    const mode = ov?.dataset.mode || 'modifier';
    const linkMode = ov?.dataset.linkMode || 'edit';
    const name  = document.getElementById('gsc-name')?.value.trim();
    if (!name){ showToast('Enter a name','error'); return; }
    const status = document.getElementById('gsc-status');
    if (btn){ btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      if (mode === 'proc'){
        // ── Proc / spread glyph (pure DB) ──
        if (!_glyph.procTrigger){ showToast('Choose the trigger spell','error'); return; }
        const radius = parseInt(document.getElementById('gsc-proc-radius')?.value || '20') || 20;
        const damage = parseInt(document.getElementById('gsc-proc-damage')?.value || '0') || 0;
        const school = parseInt(document.getElementById('gsc-proc-school')?.value || '0') || 0;
        const payload = _glyphProcPayload();
        if (status) status.textContent = 'Building proc + AoE spell + spell_proc…';
        const r = await fetch(`${API}/glyph/proc-create`, {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ name, triggerSpellId: _glyph.procTrigger.id, radius, damage, school, payload })});
        const d = await r.json();
        if (!d.ok){ if(status) status.textContent=''; showToast(d.error||'Proc create failed','error'); return; }
        showToast(`Proc glyph spell #${d.data.procSpellId} created ✓ (fires on ${d.data.triggerName})`);
        if (d.data.warning) showToast(d.data.warning, 'info');
        _glyphLinkEffectSpell(d.data.procSpellId, name, linkMode);
        ov?.remove();
        return;
      }

      // ── Modifier glyph (default) ──
      const dir   = document.getElementById('gsc-dir')?.value;
      const type  = document.getElementById('gsc-type')?.value;
      const modop = parseInt(document.getElementById('gsc-modop')?.value || '0');
      const amt   = Math.abs(parseInt(document.getElementById('gsc-amt')?.value || '0'));
      const value = (dir === 'dec' ? -amt : amt);
      const family= parseInt(document.getElementById('gsc-family')?.value || '0');
      const mA = parseInt(document.getElementById('gsc-mask-a')?.value || '0');
      const mB = parseInt(document.getElementById('gsc-mask-b')?.value || '0');
      const mC = parseInt(document.getElementById('gsc-mask-c')?.value || '0');
      const nr = await fetch(`${API}/spell-create/next-id`); const nd = await nr.json();
      if (!nd.ok){ showToast('Could not get a spell id','error'); return; }
      const sid = nd.data.next_id;
      const payload = {
        ID: sid, Name_Lang_enUS: name,
        Attributes: 64, CastingTimeIndex: 1, ManaCost: 0, PowerType: 0, DurationIndex: 0, SchoolMask: 1,
        Effect_1: 6, EffectAura_1: (type === 'pct' ? AURA_ADD_PCT : AURA_ADD_FLAT),
        EffectMiscValue_1: modop, EffectBasePoints_1: (value - 1), EffectDieSides_1: 1,
        ImplicitTargetA_1: 1,
        SpellClassSet: family,
        EffectSpellClassMaskA_1: mA, EffectSpellClassMaskB_1: mB, EffectSpellClassMaskC_1: mC,
      };
      if (status) status.textContent = 'Saving spell…';
      const r = await fetch(`${API}/spell-create/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok){ if(status) status.textContent=''; showToast(d.error||'Spell save failed','error'); return; }
      showToast(`Glyph effect spell #${sid} created ✓`);
      _glyphLinkEffectSpell(sid, name, linkMode);
      ov?.remove();
    } catch(e){ if(status) status.textContent=''; showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '✨ Create + link'; } }
  }

  // ── Repair bots (clear invalid glyph ids in character_glyphs) ─────────────────
  async function glyphRepairBots(btn){
    const okc = await uiConfirm('Scans all character_glyphs (including playerbots) and clears glyph ids '
      + 'that no longer exist in GlyphProperties (sets them to 0). Continue?', {title:'Repair bots', okText:'Repair'});
    if (!okc) return;
    if (btn){ btn.disabled = true; btn.textContent = '⏳…'; }
    try {
      const r = await fetch(`${API}/glyph/repair-bots`, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const d = await r.json();
      if (!d.ok){ showToast(d.error||'Repair failed','error'); return; }
      showToast(`Done ✓ ${d.data.fixed_rows} rows cleaned (${d.data.cleared_glyphs} glyphs reset)`);
    } catch(e){ showToast('Server offline','error'); }
    finally { if (btn){ btn.disabled = false; btn.textContent = '🤖 Repair Bots'; } }
  }
