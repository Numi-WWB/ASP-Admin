/* playerbots.js — Playerbots tab (acore_playerbots content management).
   Subtabs: Texts · Speech · Gear · Enchants · Weights · Strategies · Dungeons.
   Backend: /api/pb/*  (see asp_server.py). Reuses the shared item/spell search
   modals (openItemSearchModal / openSpellSearchModal) for picking items/spells. */

// ── static label maps ────────────────────────────────────────────────────────
const PB_CLASSES = {1:'Warrior',2:'Paladin',3:'Hunter',4:'Rogue',5:'Priest',
                    6:'Death Knight',7:'Shaman',8:'Mage',9:'Warlock',11:'Druid'};
const PB_SAY_TYPES   = {0:'Say', 1:'Yell'};
const PB_FACTIONS    = {0:'Both', 1:'Alliance', 2:'Horde'};
const PB_GEAR_SLOTS  = {0:'Head',1:'Neck',2:'Shoulders',4:'Chest',5:'Waist',6:'Legs',7:'Feet',
                        8:'Wrists',9:'Hands',10:'Finger 1',11:'Finger 2',12:'Trinket 1',13:'Trinket 2',
                        14:'Back',15:'Main Hand',16:'Off Hand',17:'Ranged'};
const PB_ENCH_SLOTS  = {0:'Head',2:'Shoulders',4:'Chest',6:'Legs',7:'Feet',8:'Wrists',9:'Hands',
                        10:'Finger',11:'Finger 2',14:'Back',15:'Main Hand',16:'Off Hand',17:'Ranged'};
const PB_EXPANSIONS  = {0:'Classic', 1:'TBC', 2:'WotLK'};
const PB_DIFFICULTIES= {0:'Normal', 1:'Heroic'};
const PB_WS_FIELDS = [
  ['str','Strength'],['agi','Agility'],['sta','Stamina'],['int','Intellect'],['spi','Spirit'],
  ['atkpwr','Attack Power'],['feratkpwr','Feral AP'],['splpwr','Spell Power'],
  ['mledps','Melee DPS'],['rgddps','Ranged DPS'],
  ['critstrkrtng','Crit Rating'],['hitrtng','Hit Rating'],['hastertng','Haste Rating'],['exprtng','Expertise'],
  ['armorpenrtng','Armor Pen'],['defrtng','Defense'],['dodgertng','Dodge'],['parryrtng','Parry'],
  ['blockrtng','Block Rating'],['block','Block Value'],['armor','Armor'],['manargn','Mana Regen'],
  ['arcsplpwr','Arcane SP'],['firsplpwr','Fire SP'],['frosplpwr','Frost SP'],['shasplpwr','Shadow SP'],
];

const pbState = { texts:{newC:0}, speech:{newC:0}, gear:{}, enchants:{newC:0},
                  weights:{}, strategies:{newC:0}, dungeons:{newC:0} };

// ── tiny helpers ──────────────────────────────────────────────────────────────
function pbEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function pbGet(path){
  const r = await fetch(`${API}/pb/${path}`);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'error');
  return d.data;
}
async function pbPost(path, body){
  const r = await fetch(`${API}/pb/${path}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'error');
  return d.data;
}
function pbErr(e){ return `<div class="pb-empty" style="color:var(--red)">⚠ ${pbEsc(e.message||e)}</div>`; }
function pbOpts(map, sel){ return Object.entries(map).map(([k,v]) =>
  `<option value="${pbEsc(k)}"${String(k)===String(sel)?' selected':''}>${pbEsc(v)}</option>`).join(''); }
function pbClassOpts(sel, all){ return (all?'<option value="">All classes</option>':'') + pbOpts(PB_CLASSES, sel); }
function pbToggle(id){ const el=document.getElementById(id); if(el) el.style.display = el.style.display==='none'?'':'none'; }

function pbInit(sub){
  pbEnsureStyles();
  switch (sub){
    case 'texts':      return pbRenderTexts();
    case 'speech':     return pbRenderSpeech();
    case 'gear':       return pbRenderGear();
    case 'enchants':   return pbRenderEnchants();
    case 'weights':    return pbRenderWeights();
    case 'strategies': return pbRenderStrategies();
    case 'dungeons':   return pbRenderDungeons();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXTS  (ai_playerbot_texts + ai_playerbot_texts_chance)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderTexts(){
  const box = document.getElementById('pb-texts-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const names = await pbGet('texts/names');
    pbState.texts.names = names;
    box.innerHTML = `
      <div class="pb-grid">
        <aside class="pb-side">
          <input id="pb-texts-filter" class="pb-filter" placeholder="Filter categories…" oninput="pbFilterCats('texts')">
          <div class="pb-catlist" id="pb-texts-cats">${names.map(n=>pbCatItem(n,'texts')).join('')}</div>
        </aside>
        <section class="pb-main" id="pb-texts-main"><div class="pb-empty">← Pick a category to edit its lines</div></section>
      </div>`;
    if (pbState.texts.sel) pbTextsPick(pbState.texts.sel);
  }catch(e){ box.innerHTML = pbErr(e); }
}
function pbCatItem(n, kind){
  const chance = n.probability==null ? '—' : n.probability+'%';
  return `<div class="pb-cat" data-name="${pbEsc(n.name)}" onclick="pbCatClick('${kind}',this)">
    <span class="pb-cat-name">${pbEsc(n.name)}</span>
    <span class="pb-cat-meta">${n.cnt}× · <b>${chance}</b></span></div>`;
}
function pbCatClick(kind, el){
  el.parentNode.querySelectorAll('.pb-cat').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  if (kind==='texts') pbTextsPick(el.dataset.name); else pbSpeechPick(el.dataset.name);
}
function pbFilterCats(kind){
  const q = document.getElementById('pb-'+kind+'-filter').value.toLowerCase();
  document.querySelectorAll('#pb-'+kind+'-cats .pb-cat').forEach(c=>{
    c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
  });
}
async function pbTextsPick(name){
  pbState.texts.sel = name;
  const main = document.getElementById('pb-texts-main'); if(!main) return;
  main.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const rows = await pbGet('texts?name='+encodeURIComponent(name));
    pbState.texts.rows = rows;
    const cat = (pbState.texts.names||[]).find(n=>n.name===name) || {};
    const chance = cat.probability==null ? '' : cat.probability;
    main.innerHTML = `
      <div class="pb-main-head">
        <div><h3 class="pb-h3">${pbEsc(name)}</h3><span class="pb-sub">${rows.length} line(s) — bot picks one at random</span></div>
        <div class="pb-chance">Trigger chance
          <input type="number" min="0" max="100" id="pb-texts-chance" value="${chance}" class="pb-num">%
          <button class="e-btn e-btn-small" onclick="pbTextsSaveChance()">Set</button></div>
      </div>
      <div id="pb-texts-rows">${rows.map(pbTextRow).join('')}</div>
      <button class="e-btn e-btn-green e-btn-small" style="margin-top:10px" onclick="pbTextAddRow()">＋ Add line</button>`;
  }catch(e){ main.innerHTML = pbErr(e); }
}
function pbTextRow(r){
  const k = r.id;
  const locs = [1,2,3,4,5,6,7,8].map(i =>
    `<div class="pb-loc"><label>loc${i}</label><input class="pb-input" id="pb-tx-loc${i}-${k}" value="${pbEsc(r['text_loc'+i])}"></div>`).join('');
  return `<div class="pb-erow" id="pb-tx-row-${k}">
    <div class="pb-erow-main">
      <input class="pb-input pb-grow" id="pb-tx-text-${k}" value="${pbEsc(r.text)}" placeholder="English text">
      <select class="pb-sel" id="pb-tx-say-${k}" title="Chat type">${pbOpts(PB_SAY_TYPES, r.say_type)}</select>
      <input class="pb-num" id="pb-tx-reply-${k}" type="number" title="reply_type" value="${r.reply_type||0}">
      <button class="pb-iconbtn" title="Localizations" onclick="pbToggle('pb-tx-locs-${k}')">🌐</button>
      <button class="pb-iconbtn" title="Save" onclick="pbTextSave('${k}')">💾</button>
      <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbTextDelete('${k}')">🗑</button>
    </div>
    <div class="pb-locs" id="pb-tx-locs-${k}" style="display:none">${locs}</div>
  </div>`;
}
function pbTextAddRow(){
  const k = 'new'+(++pbState.texts.newC);
  document.getElementById('pb-texts-rows').insertAdjacentHTML('beforeend',
    pbTextRow({id:k, text:'', say_type:0, reply_type:0}));
}
async function pbTextSave(k){
  const g = id => document.getElementById(id);
  const body = { name: pbState.texts.sel, text: g('pb-tx-text-'+k).value,
    say_type: g('pb-tx-say-'+k).value, reply_type: g('pb-tx-reply-'+k).value||0 };
  for (let i=1;i<=8;i++) body['text_loc'+i] = g('pb-tx-loc'+i+'-'+k).value;
  if (!String(k).startsWith('new')) body.id = k;
  try{ await pbPost('texts/save', body); showToast('Saved ✓'); pbRenderTexts(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbTextDelete(k){
  if (String(k).startsWith('new')){ document.getElementById('pb-tx-row-'+k).remove(); return; }
  if (!confirm('Delete this line?')) return;
  try{ await pbPost('texts/delete', {id:k}); showToast('Deleted'); pbRenderTexts(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbTextsSaveChance(){
  const v = document.getElementById('pb-texts-chance').value;
  try{ await pbPost('texts/chance', {name:pbState.texts.sel, probability:v||0}); showToast('Chance saved ✓'); pbRenderTexts(); }
  catch(e){ showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPEECH  (playerbots_speech + playerbots_speech_probability)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderSpeech(){
  const box = document.getElementById('pb-speech-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const names = await pbGet('speech/names');
    pbState.speech.names = names;
    box.innerHTML = `
      <div class="pb-grid">
        <aside class="pb-side">
          <input id="pb-speech-filter" class="pb-filter" placeholder="Filter categories…" oninput="pbFilterCats('speech')">
          <div class="pb-catlist" id="pb-speech-cats">${names.map(n=>pbCatItem(n,'speech')).join('')}</div>
        </aside>
        <section class="pb-main" id="pb-speech-main"><div class="pb-empty">← Pick a category to edit its lines</div></section>
      </div>`;
    if (pbState.speech.sel) pbSpeechPick(pbState.speech.sel);
  }catch(e){ box.innerHTML = pbErr(e); }
}
async function pbSpeechPick(name){
  pbState.speech.sel = name;
  const main = document.getElementById('pb-speech-main'); if(!main) return;
  main.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const rows = await pbGet('speech?name='+encodeURIComponent(name));
    const cat = (pbState.speech.names||[]).find(n=>n.name===name) || {};
    const chance = cat.probability==null ? '' : cat.probability;
    main.innerHTML = `
      <div class="pb-main-head">
        <div><h3 class="pb-h3">${pbEsc(name)}</h3><span class="pb-sub">${rows.length} line(s)</span></div>
        <div class="pb-chance">Trigger chance
          <input type="number" min="0" max="100" id="pb-speech-chance" value="${chance}" class="pb-num">%
          <button class="e-btn e-btn-small" onclick="pbSpeechSaveChance()">Set</button></div>
      </div>
      <div id="pb-speech-rows">${rows.map(pbSpeechRow).join('')}</div>
      <button class="e-btn e-btn-green e-btn-small" style="margin-top:10px" onclick="pbSpeechAddRow()">＋ Add line</button>`;
  }catch(e){ main.innerHTML = pbErr(e); }
}
function pbSpeechRow(r){
  const k = r.id;
  return `<div class="pb-erow" id="pb-sp-row-${k}"><div class="pb-erow-main">
    <input class="pb-input pb-grow" id="pb-sp-text-${k}" value="${pbEsc(r.text)}" placeholder="Line — supports &lt;target&gt;">
    <select class="pb-sel" id="pb-sp-type-${k}" title="Say or Yell">
      <option value="say"${r.type==='say'?' selected':''}>💬 Say</option>
      <option value="yell"${r.type==='yell'?' selected':''}>📢 Yell</option></select>
    <button class="pb-iconbtn" title="Save" onclick="pbSpeechSave('${k}')">💾</button>
    <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbSpeechDelete('${k}')">🗑</button>
  </div></div>`;
}
function pbSpeechAddRow(){
  const k = 'new'+(++pbState.speech.newC);
  document.getElementById('pb-speech-rows').insertAdjacentHTML('beforeend', pbSpeechRow({id:k, text:'', type:'say'}));
}
async function pbSpeechSave(k){
  const g = id => document.getElementById(id);
  const body = { name: pbState.speech.sel, text: g('pb-sp-text-'+k).value, type: g('pb-sp-type-'+k).value };
  if (!String(k).startsWith('new')) body.id = k;
  try{ await pbPost('speech/save', body); showToast('Saved ✓'); pbRenderSpeech(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbSpeechDelete(k){
  if (String(k).startsWith('new')){ document.getElementById('pb-sp-row-'+k).remove(); return; }
  if (!confirm('Delete this line?')) return;
  try{ await pbPost('speech/delete', {id:k}); showToast('Deleted'); pbRenderSpeech(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbSpeechSaveChance(){
  const v = document.getElementById('pb-speech-chance').value;
  try{ await pbPost('speech/chance', {name:pbState.speech.sel, probability:v||0}); showToast('Chance saved ✓'); pbRenderSpeech(); }
  catch(e){ showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// GEAR  (playerbots_bis_gear)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderGear(){
  const box = document.getElementById('pb-gear-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const f = await pbGet('gear/filters');
    pbState.gear.filters = f;
    const classes = [...new Set(f.specs.map(s=>s.class))];
    const clsOpts = classes.map(c=>`<option value="${c}">${PB_CLASSES[c]||('Class '+c)}</option>`).join('');
    const phaseOpts = f.phases.map(p=>`<option value="${pbEsc(p)}">${pbEsc(p)}</option>`).join('');
    box.innerHTML = `
      <div class="pb-filterbar">
        <label>Class <select id="pb-gear-class" class="pb-sel" onchange="pbGearSpecs()">${clsOpts}</select></label>
        <label>Spec <select id="pb-gear-spec" class="pb-sel" onchange="pbGearReload()"></select></label>
        <label>Phase <select id="pb-gear-phase" class="pb-sel" onchange="pbGearRender()">${phaseOpts}</select></label>
      </div>
      <div id="pb-gear-slots"><div class="pb-empty">Select a class &amp; spec</div></div>`;
    pbGearSpecs();
  }catch(e){ box.innerHTML = pbErr(e); }
}
function pbGearSpecs(){
  const cls = +document.getElementById('pb-gear-class').value;
  const specs = pbState.gear.filters.specs.filter(s=>s.class===cls);
  document.getElementById('pb-gear-spec').innerHTML =
    specs.map(s=>`<option value="${s.tab}">${pbEsc(s.spec_name)}</option>`).join('');
  pbGearReload();
}
// Fetch every BiS row for the chosen class/spec, then derive the phases that
// actually exist for it and populate the phase dropdown (a spec rarely has all
// global phases). Filtering per phase happens client-side in pbGearRender().
async function pbGearReload(){
  const cls = document.getElementById('pb-gear-class').value;
  const tab = document.getElementById('pb-gear-spec').value;
  if (cls==='' || tab==='') return;
  const wrap = document.getElementById('pb-gear-slots');
  wrap.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const all = await pbGet(`gear?class=${cls}&tab=${tab}`);
    pbState.gear.all = all;
    const present = new Set(all.map(r=>r.phase));
    const ordered = pbState.gear.filters.phases.filter(p=>present.has(p));
    for (const p of present) if (!ordered.includes(p)) ordered.push(p); // any not in global list
    const sel = document.getElementById('pb-gear-phase');
    const keep = ordered.includes(sel.value) ? sel.value : (ordered[0] || '');
    sel.innerHTML = ordered.map(p=>`<option value="${pbEsc(p)}"${p===keep?' selected':''}>${pbEsc(p)}</option>`).join('')
      || '<option value="">— no data —</option>';
    pbGearRender();
  }catch(e){ wrap.innerHTML = pbErr(e); }
}
function pbGearRender(){
  const wrap = document.getElementById('pb-gear-slots'); if(!wrap) return;
  const phase = document.getElementById('pb-gear-phase').value;
  const rows = (pbState.gear.all || []).filter(r=>r.phase===phase);
  {
    pbState.gear.rows = rows;
    // group row indices by slot
    const bySlot = {};
    rows.forEach((r,i)=>{ (bySlot[r.slot] = bySlot[r.slot] || []).push(i); });
    // one card per equipment slot (fixed order), showing that slot's items for the phase
    const cards = Object.entries(PB_GEAR_SLOTS).map(([slot,label])=>{
      const idxs = bySlot[slot] || [];
      const body = idxs.length
        ? idxs.map(pbGearItemLine).join('')
        : '<div class="pb-dim" style="padding:4px 2px">— empty —</div>';
      return `<div class="pb-gcard">
        <div class="pb-gcard-head"><span>${pbEsc(label)}</span>
          <button class="pb-iconbtn" title="Add item to this slot" onclick="pbGearAdd(${slot})">＋</button></div>
        <div class="pb-gcard-body">${body}</div></div>`;
    }).join('');
    wrap.innerHTML = `<div class="pb-gslotgrid">${cards}</div>`;
    if (window.$WowheadPower && $WowheadPower.refreshLinks) $WowheadPower.refreshLinks();
  }
}
function pbGearItemLine(i){
  const r = pbState.gear.rows[i];
  const label = pbEsc(r.item_name) || ('#'+r.item_id);
  const facTag = r.faction ? ` · ${pbEsc(r.faction_name)}` : '';
  return `<div class="pb-gcard-row">
    <a class="pb-item pb-whlink" href="https://www.wowhead.com/wotlk/item=${r.item_id}"
       data-wowhead="item=${r.item_id}&domain=wotlk" target="_blank" rel="noopener">${label}</a>
    <span class="pb-dim pb-gcard-meta">GS≤${r.auto_gear_score_limit}${facTag}</span>
    <span class="pb-gcard-actions">
      <button class="pb-iconbtn" title="Change item" onclick="pbGearPick(${i})">✏</button>
      <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbGearDelete(${i})">🗑</button></span></div>`;
}
function pbGearPick(i){
  const r = pbState.gear.rows[i];
  openItemSearchModal('🛡 Pick item for '+r.slot_name, async (entry, name)=>{
    try{
      await pbPost('gear/save', { _pk:{class:r.class,tab:r.tab,slot:r.slot,faction:r.faction,auto_gear_score_limit:r.auto_gear_score_limit},
        item_id: entry, item_name: name, phase: r.phase });
      showToast('Saved ✓'); pbGearReload();
    }catch(e){ showToast(e.message,'error'); }
  });
}
async function pbGearDelete(i){
  const r = pbState.gear.rows[i];
  if (!confirm(`Delete ${r.slot_name} entry (${r.item_name||('#'+r.item_id)})?`)) return;
  try{ await pbPost('gear/delete', {_pk:{class:r.class,tab:r.tab,slot:r.slot,faction:r.faction,auto_gear_score_limit:r.auto_gear_score_limit}});
       showToast('Deleted'); pbGearReload(); }
  catch(e){ showToast(e.message,'error'); }
}
function pbGearAdd(slot){
  const cls = document.getElementById('pb-gear-class').value;
  const tab = document.getElementById('pb-gear-spec').value;
  const phase = document.getElementById('pb-gear-phase').value;
  const slotName = PB_GEAR_SLOTS[slot] || ('Slot '+slot);
  openItemSearchModal('🛡 Add item to '+slotName, async (entry, name)=>{
    // GS limit = current max in this spec + 1 so the new entry keeps a unique PK
    const maxGs = (pbState.gear.rows||[]).reduce((m,r)=>Math.max(m, r.auto_gear_score_limit||0), 0);
    try{
      await pbPost('gear/save', { class:cls, tab:tab, slot:slot, faction:0,
        auto_gear_score_limit: maxGs+1, phase:phase, item_id:entry, item_name:name });
      showToast('Added ✓'); pbGearReload();
    }catch(e){ showToast(e.message,'error'); }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ENCHANTS  (playerbots_enchants)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderEnchants(){
  const box = document.getElementById('pb-enchants-content'); if(!box) return;
  const cur = pbState.enchants.cls || '';
  box.innerHTML = `
    <div class="pb-filterbar">
      <label>Class <select id="pb-ench-class" class="pb-sel" onchange="pbEnchLoad()">${pbClassOpts(cur, true)}</select></label>
      <button class="e-btn e-btn-green e-btn-small" onclick="pbEnchAdd()">＋ Add enchant</button>
    </div>
    <div id="pb-ench-table"><div class="pb-loading">Loading…</div></div>`;
  pbEnchLoad();
}
function pbEnchSlotOpts(sel){
  let map = Object.assign({}, PB_ENCH_SLOTS);
  if (sel!=null && !(sel in map)) map[sel] = 'Slot '+sel;
  return pbOpts(map, sel);
}
async function pbEnchLoad(){
  const cls = document.getElementById('pb-ench-class').value;
  pbState.enchants.cls = cls;
  const t = document.getElementById('pb-ench-table');
  t.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const rows = await pbGet('enchants'+(cls?('?class='+cls):''));
    pbState.enchants.rows = rows;
    t.innerHTML = `<table class="pb-table"><thead><tr>
      <th>Class</th><th>Spec</th><th>Slot</th><th>Spell</th><th>Label</th><th></th></tr></thead>
      <tbody>${rows.map(pbEnchRow).join('') || '<tr><td colspan="6" class="pb-dim">No enchants.</td></tr>'}</tbody></table>`;
    if (typeof loadSpellIconsBatch === 'function')
      loadSpellIconsBatch(rows.map(r=>r.spellid));
  }catch(e){ t.innerHTML = pbErr(e); }
}
function pbEnchRow(r, i){
  return `<tr id="pb-en-row-${i}">
    <td><select class="pb-sel" id="pb-en-class-${i}">${pbOpts(PB_CLASSES, r.class)}</select></td>
    <td><input class="pb-num" id="pb-en-spec-${i}" type="number" value="${r.spec}" title="spec / talent-tab"></td>
    <td><select class="pb-sel" id="pb-en-slot-${i}">${pbEnchSlotOpts(r.slotid)}</select></td>
    <td><span class="pb-spell" data-spell-id="${r.spellid}" data-name="${pbEsc((r.name||'').trim())}"
           onmouseenter="sbShowTip(event,this)" onmouseleave="hideSpellTooltip()">
          <img class="pb-spellicon" data-spell="${r.spellid}" alt="">#<span id="pb-en-spell-${i}">${r.spellid}</span></span>
        <button class="pb-iconbtn" title="Pick spell" onclick="pbEnchPick(${i})">✏</button></td>
    <td><input class="pb-input" id="pb-en-name-${i}" value="${pbEsc((r.name||'').trim())}" placeholder="Label"></td>
    <td><button class="pb-iconbtn" title="Save" onclick="pbEnchSave(${i})">💾</button>
        <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbEnchDelete(${i})">🗑</button></td></tr>`;
}
function pbEnchPick(i){
  openSpellSearchModal('✨ Pick enchant spell', (sid, sname)=>{
    document.getElementById('pb-en-spell-'+i).textContent = sid;
    const nm = document.getElementById('pb-en-name-'+i);
    if (!nm.value && sname) nm.value = sname;
  });
}
function pbEnchGather(i){
  return { class: document.getElementById('pb-en-class-'+i).value,
    spec: document.getElementById('pb-en-spec-'+i).value,
    slotid: document.getElementById('pb-en-slot-'+i).value,
    spellid: document.getElementById('pb-en-spell-'+i).textContent,
    name: document.getElementById('pb-en-name-'+i).value };
}
async function pbEnchSave(i){
  const r = pbState.enchants.rows[i];
  const body = pbEnchGather(i);
  if (r && !r._new) body._pk = {class:r.class, spec:r.spec, spellid:r.spellid, slotid:r.slotid};
  try{ await pbPost('enchants/save', body); showToast('Saved ✓'); pbEnchLoad(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbEnchDelete(i){
  const r = pbState.enchants.rows[i];
  if (r && r._new){ document.getElementById('pb-en-row-'+i).remove(); return; }
  if (!confirm('Delete this enchant?')) return;
  try{ await pbPost('enchants/delete', {_pk:{class:r.class, spec:r.spec, spellid:r.spellid, slotid:r.slotid}});
       showToast('Deleted'); pbEnchLoad(); }
  catch(e){ showToast(e.message,'error'); }
}
function pbEnchAdd(){
  const cls = pbState.enchants.cls || 1;
  const r = { class:+cls||1, spec:0, slotid:15, spellid:0, name:'', _new:true };
  pbState.enchants.rows.push(r);
  const i = pbState.enchants.rows.length-1;
  const tbody = document.querySelector('#pb-ench-table tbody');
  if (tbody.querySelector('.pb-dim')) tbody.innerHTML = '';
  tbody.insertAdjacentHTML('beforeend', pbEnchRow(r, i));
}

// ══════════════════════════════════════════════════════════════════════════════
// WEIGHT SCALES  (playerbots_weightscales + _data)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderWeights(){
  const box = document.getElementById('pb-weights-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const scales = await pbGet('weights');
    pbState.weights.scales = scales;
    const list = scales.map(s=>`<div class="pb-cat" data-id="${s.id}" onclick="pbWeightsPick(${s.id},this)">
        <span class="pb-cat-name">${pbEsc(s.name)}</span>
        <span class="pb-cat-meta">${PB_CLASSES[s.class]||('Class '+s.class)}</span></div>`).join('');
    box.innerHTML = `
      <div class="pb-grid">
        <aside class="pb-side">
          <button class="e-btn e-btn-green e-btn-small" style="width:100%;margin-bottom:8px" onclick="pbWeightsNew()">＋ New scale</button>
          <div class="pb-catlist" id="pb-weights-cats">${list}</div>
        </aside>
        <section class="pb-main" id="pb-weights-main"><div class="pb-empty">← Pick a weight scale</div></section>
      </div>`;
    if (pbState.weights.sel!=null) pbWeightsPick(pbState.weights.sel);
  }catch(e){ box.innerHTML = pbErr(e); }
}
async function pbWeightsPick(id, el){
  pbState.weights.sel = id;
  if (el){ el.parentNode.querySelectorAll('.pb-cat').forEach(c=>c.classList.remove('sel')); el.classList.add('sel'); }
  const main = document.getElementById('pb-weights-main');
  main.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const s = (pbState.weights.scales||[]).find(x=>x.id===id) || {id:0, name:'', class:0};
    const data = id ? await pbGet('weights/data?id='+id) : {};
    pbWeightsForm(main, s, data);
  }catch(e){ main.innerHTML = pbErr(e); }
}
function pbWeightsNew(){
  pbState.weights.sel = 0;
  document.querySelectorAll('#pb-weights-cats .pb-cat').forEach(c=>c.classList.remove('sel'));
  pbWeightsForm(document.getElementById('pb-weights-main'), {id:0, name:'', class:1}, {});
}
function pbWeightsForm(main, s, data){
  const grid = PB_WS_FIELDS.map(([f,label]) =>
    `<div class="pb-wsfield"><label title="${f}">${label}</label>
       <input class="pb-num" id="pb-ws-f-${f}" type="number" value="${data[f]!=null?data[f]:''}" placeholder="0"></div>`).join('');
  main.innerHTML = `
    <div class="pb-main-head">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input class="pb-input" id="pb-ws-name" value="${pbEsc(s.name)}" placeholder="Scale name" style="width:180px">
        <select class="pb-sel" id="pb-ws-class">${pbClassOpts(s.class)}</select>
        <span class="pb-sub">${s.id?('#'+s.id):'new'}</span>
      </div>
      <div>
        <button class="e-btn e-btn-green e-btn-small" onclick="pbWeightsSave()">💾 Save</button>
        ${s.id?`<button class="e-btn e-btn-small pb-danger" onclick="pbWeightsDelete(${s.id})">🗑 Delete</button>`:''}
      </div>
    </div>
    <p class="pb-sub" style="margin:4px 0 10px">Relative stat value (0 = ignored). Empty = 0.</p>
    <div class="pb-wsgrid">${grid}</div>`;
}
async function pbWeightsSave(){
  const vals = {};
  PB_WS_FIELDS.forEach(([f]) => { const v = document.getElementById('pb-ws-f-'+f).value; if (v) vals[f] = v; });
  const body = { id: pbState.weights.sel||0, name: document.getElementById('pb-ws-name').value,
    class: document.getElementById('pb-ws-class').value, vals };
  try{ const d = await pbPost('weights/save', body); pbState.weights.sel = d.id; showToast('Saved ✓'); pbRenderWeights(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbWeightsDelete(id){
  if (!confirm('Delete this weight scale?')) return;
  try{ await pbPost('weights/delete', {id}); pbState.weights.sel = null; showToast('Deleted'); pbRenderWeights(); }
  catch(e){ showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM STRATEGIES  (playerbots_custom_strategy)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderStrategies(){
  const box = document.getElementById('pb-strategies-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const rows = await pbGet('strategies');
    pbState.strategies.rows = rows;
    box.innerHTML = `
      <p class="pb-sub" style="margin-bottom:10px">Format: <code>trigger&gt;action::param!weight,action::param!weight</code> —
         e.g. <code>critical health&gt;emote::helpme!99,say::critical health!98</code></p>
      <button class="e-btn e-btn-green e-btn-small" style="margin-bottom:10px" onclick="pbStratAdd()">＋ Add strategy</button>
      <table class="pb-table"><thead><tr>
        <th style="width:120px">Name</th><th style="width:60px">Idx</th><th style="width:70px">Owner</th><th>Action line</th><th></th>
      </tr></thead><tbody id="pb-strat-body">${rows.map(pbStratRow).join('')}</tbody></table>`;
  }catch(e){ box.innerHTML = pbErr(e); }
}
function pbStratRow(r){
  const k = r.id;
  return `<tr id="pb-st-row-${k}">
    <td><input class="pb-input" id="pb-st-name-${k}" value="${pbEsc(r.name)}"></td>
    <td><input class="pb-num" id="pb-st-idx-${k}" type="number" value="${r.idx!=null?r.idx:''}"></td>
    <td><input class="pb-num" id="pb-st-owner-${k}" type="number" value="${r.owner!=null?r.owner:''}" title="0 = global"></td>
    <td><input class="pb-input pb-grow" id="pb-st-action-${k}" value="${pbEsc(r.action_line)}"></td>
    <td><button class="pb-iconbtn" title="Save" onclick="pbStratSave('${k}')">💾</button>
        <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbStratDelete('${k}')">🗑</button></td></tr>`;
}
function pbStratAdd(){
  const k = 'new'+(++pbState.strategies.newC);
  document.getElementById('pb-strat-body').insertAdjacentHTML('afterbegin',
    pbStratRow({id:k, name:'say', idx:'', owner:0, action_line:''}));
}
async function pbStratSave(k){
  const g = id => document.getElementById(id);
  const body = { name:g('pb-st-name-'+k).value, idx:g('pb-st-idx-'+k).value,
    owner:g('pb-st-owner-'+k).value, action_line:g('pb-st-action-'+k).value };
  if (!String(k).startsWith('new')) body.id = k;
  try{ await pbPost('strategies/save', body); showToast('Saved ✓'); pbRenderStrategies(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbStratDelete(k){
  if (String(k).startsWith('new')){ document.getElementById('pb-st-row-'+k).remove(); return; }
  if (!confirm('Delete this strategy?')) return;
  try{ await pbPost('strategies/delete', {id:k}); showToast('Deleted'); pbRenderStrategies(); }
  catch(e){ showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DUNGEON SUGGESTIONS  (playerbots_dungeon_suggestion_definition)
// ══════════════════════════════════════════════════════════════════════════════
async function pbRenderDungeons(){
  const box = document.getElementById('pb-dungeons-content'); if(!box) return;
  box.innerHTML = '<div class="pb-loading">Loading…</div>';
  try{
    const rows = await pbGet('dungeons');
    pbState.dungeons.rows = rows;
    box.innerHTML = `
      <div class="pb-filterbar">
        <input id="pb-dg-filter" class="pb-filter" placeholder="Filter by name / slug…" oninput="pbDungeonFilter()" style="width:220px">
        <button class="e-btn e-btn-green e-btn-small" onclick="pbDungeonAdd()">＋ Add dungeon</button>
      </div>
      <table class="pb-table"><thead><tr>
        <th>Name</th><th style="width:70px">Slug</th><th style="width:90px">Expansion</th><th style="width:80px">Difficulty</th>
        <th style="width:55px">Min</th><th style="width:55px">Max</th><th>Comment</th><th></th>
      </tr></thead><tbody id="pb-dg-body">${rows.map(pbDungeonRow).join('')}</tbody></table>`;
  }catch(e){ box.innerHTML = pbErr(e); }
}
function pbDungeonRow(r){
  const k = r.id;
  return `<tr id="pb-dg-row-${k}" data-search="${pbEsc((r.name+' '+r.slug).toLowerCase())}">
    <td><input class="pb-input pb-grow" id="pb-dg-name-${k}" value="${pbEsc(r.name)}"></td>
    <td><input class="pb-input" id="pb-dg-slug-${k}" value="${pbEsc(r.slug)}" style="width:65px"></td>
    <td><select class="pb-sel" id="pb-dg-exp-${k}">${pbOpts(PB_EXPANSIONS, r.expansion)}</select></td>
    <td><select class="pb-sel" id="pb-dg-diff-${k}">${pbOpts(PB_DIFFICULTIES, r.difficulty)}</select></td>
    <td><input class="pb-num" id="pb-dg-min-${k}" type="number" value="${r.min_level!=null?r.min_level:''}"></td>
    <td><input class="pb-num" id="pb-dg-max-${k}" type="number" value="${r.max_level!=null?r.max_level:''}"></td>
    <td><input class="pb-input pb-grow" id="pb-dg-comment-${k}" value="${pbEsc(r.comment==null||r.comment==='None'?'':r.comment)}"></td>
    <td><button class="pb-iconbtn" title="Save" onclick="pbDungeonSave('${k}')">💾</button>
        <button class="pb-iconbtn pb-danger" title="Delete" onclick="pbDungeonDelete('${k}')">🗑</button></td></tr>`;
}
function pbDungeonFilter(){
  const q = document.getElementById('pb-dg-filter').value.toLowerCase();
  document.querySelectorAll('#pb-dg-body tr').forEach(tr=>{
    tr.style.display = (tr.dataset.search||'').includes(q) ? '' : 'none';
  });
}
function pbDungeonAdd(){
  const k = 'new'+(++pbState.dungeons.newC);
  document.getElementById('pb-dg-body').insertAdjacentHTML('afterbegin',
    pbDungeonRow({id:k, name:'', slug:'', expansion:0, difficulty:0, min_level:'', max_level:'', comment:''}));
}
async function pbDungeonSave(k){
  const g = id => document.getElementById(id);
  const body = { slug:g('pb-dg-slug-'+k).value, name:g('pb-dg-name-'+k).value,
    expansion:g('pb-dg-exp-'+k).value, difficulty:g('pb-dg-diff-'+k).value,
    min_level:g('pb-dg-min-'+k).value, max_level:g('pb-dg-max-'+k).value, comment:g('pb-dg-comment-'+k).value };
  if (!String(k).startsWith('new')) body.id = k;
  try{ await pbPost('dungeons/save', body); showToast('Saved ✓'); pbRenderDungeons(); }
  catch(e){ showToast(e.message,'error'); }
}
async function pbDungeonDelete(k){
  if (String(k).startsWith('new')){ document.getElementById('pb-dg-row-'+k).remove(); return; }
  if (!confirm('Delete this dungeon suggestion?')) return;
  try{ await pbPost('dungeons/delete', {id:k}); showToast('Deleted'); pbRenderDungeons(); }
  catch(e){ showToast(e.message,'error'); }
}

// ── styles (injected once) ────────────────────────────────────────────────────
function pbEnsureStyles(){
  if (document.getElementById('pb-styles')) return;
  const css = `
    #db-playerbots .pb-loading,#db-playerbots .pb-empty{color:var(--muted);text-align:center;padding:40px 0;font-size:0.85rem}
    #db-playerbots .pb-grid{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}
    #db-playerbots .pb-side{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px}
    #db-playerbots .pb-filter{width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;font-size:0.8rem;padding:6px 9px;margin-bottom:8px}
    #db-playerbots .pb-catlist{max-height:64vh;overflow-y:auto}
    #db-playerbots .pb-cat{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 9px;border-radius:6px;cursor:pointer;border:1px solid transparent}
    #db-playerbots .pb-cat:hover{background:var(--bg)}
    #db-playerbots .pb-cat.sel{background:var(--bg);border-color:var(--cyan)}
    #db-playerbots .pb-cat-name{font-size:0.82rem;color:var(--text);word-break:break-word}
    #db-playerbots .pb-cat-meta{font-size:0.7rem;color:var(--muted);white-space:nowrap}
    #db-playerbots .pb-main{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px;min-height:200px}
    #db-playerbots .pb-main-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:10px}
    #db-playerbots .pb-h3{margin:0;color:var(--gold);font-size:1rem}
    #db-playerbots .pb-sub{font-size:0.72rem;color:var(--muted)}
    #db-playerbots .pb-chance{font-size:0.75rem;color:var(--muted);display:flex;align-items:center;gap:6px}
    #db-playerbots .pb-erow{border-bottom:1px solid var(--border);padding:6px 0}
    #db-playerbots .pb-erow-main{display:flex;gap:6px;align-items:center}
    #db-playerbots .pb-input,#db-playerbots .pb-sel,#db-playerbots .pb-num{background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:inherit;font-size:0.8rem;padding:5px 7px}
    #db-playerbots .pb-grow{flex:1;min-width:80px}
    #db-playerbots .pb-num{width:64px}
    #db-playerbots .pb-iconbtn{background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);cursor:pointer;font-size:0.8rem;padding:4px 7px;line-height:1}
    #db-playerbots .pb-iconbtn:hover{border-color:var(--cyan)}
    #db-playerbots .pb-iconbtn.pb-danger:hover{border-color:var(--red);color:var(--red)}
    #db-playerbots .pb-locs{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:8px 0 4px 4px}
    #db-playerbots .pb-loc{display:flex;align-items:center;gap:6px}
    #db-playerbots .pb-loc label{font-size:0.68rem;color:var(--muted);width:34px}
    #db-playerbots .pb-loc .pb-input{flex:1}
    #db-playerbots .pb-filterbar,#db-playerbots .pb-addbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
    #db-playerbots .pb-addbar{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.75rem;color:var(--muted)}
    #db-playerbots .pb-filterbar label{font-size:0.75rem;color:var(--muted);display:flex;align-items:center;gap:5px}
    #db-playerbots .pb-table{width:100%;border-collapse:collapse;font-size:0.8rem}
    #db-playerbots .pb-table th{text-align:left;color:var(--muted);font-size:0.68rem;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--border)}
    #db-playerbots .pb-table td{padding:5px 8px;border-bottom:1px solid var(--border);vertical-align:middle}
    #db-playerbots .pb-table td .pb-input{width:100%;box-sizing:border-box}
    #db-playerbots .pb-table td:last-child{white-space:nowrap;width:1%;text-align:right}
    #db-playerbots .pb-dim{color:var(--muted);font-size:0.72rem}
    #db-playerbots .pb-item{color:var(--text)}
    #db-playerbots .pb-spell{display:inline-flex;align-items:center;gap:4px;cursor:help}
    #db-playerbots .pb-spellicon{width:18px;height:18px;border-radius:3px;vertical-align:middle}
    #db-playerbots .pb-wsgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
    #db-playerbots .pb-wsfield{display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:5px 8px}
    #db-playerbots .pb-wsfield label{font-size:0.74rem;color:var(--muted)}
    #db-playerbots .pb-wsfield .pb-num{width:60px}
    #db-playerbots .pb-gslotgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
    #db-playerbots .pb-gcard{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:10px 12px}
    #db-playerbots .pb-gcard-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border);color:var(--gold);font-size:0.82rem;font-weight:600}
    #db-playerbots .pb-gcard-row{display:flex;align-items:center;gap:8px;padding:4px 0}
    #db-playerbots .pb-gcard-row .pb-whlink{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cyan);text-decoration:none}
    #db-playerbots .pb-gcard-row .pb-whlink:hover{text-decoration:underline}
    #db-playerbots .pb-gcard-meta{white-space:nowrap;font-size:0.68rem}
    #db-playerbots .pb-gcard-actions{display:flex;gap:4px;flex-shrink:0}`;
  const st = document.createElement('style');
  st.id = 'pb-styles';
  st.textContent = css;
  document.head.appendChild(st);
}
