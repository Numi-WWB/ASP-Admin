/* characters.js — extracted from ASP_Admin.html (verbatim) */
  let charData  = {};
  let charDirty = false;
  let charTab   = 'overview';
  let _charSearchTimer = null;

  function charSearchDebounce() {
    clearTimeout(_charSearchTimer);
    _charSearchTimer = setTimeout(searchCharacters, 350);
  }

  function goToCharLanding() {
    document.getElementById('char-landing').style.display = '';
    document.getElementById('char-detail').style.display  = 'none';
    charData  = {};
    charDirty = false;
  }

  async function searchCharacters() {
    const q = document.getElementById('char-search-input').value.trim();
    if (!q) return;
    const box = document.getElementById('char-search-results');
    box.style.display = '';
    box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:8px 0">Search…</div>';
    try {
      const r = await fetch(`${API}/character/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:8px 0">No results.</div>';
        return;
      }
      let html = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">';
      for (const c of d.data) {
        const raceN  = RACE_NAMES[c.race]  || `Race ${c.race}`;
        const classN = CLASS_NAMES_CHAR[c.class] || `Class ${c.class}`;
        const online = c.online ? '<span style="color:var(--green);font-size:0.7rem">● Online</span>' : '';
        html += `<div onclick="loadCharacter(${c.guid})" style="cursor:pointer;padding:7px 10px;
          background:var(--bg);border:1px solid var(--border);border-radius:6px;
          display:flex;align-items:center;gap:10px;transition:border-color .15s"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-weight:600;color:var(--gold);min-width:80px">${c.name}</span>
          <span style="color:var(--muted);font-size:0.8rem">Lv.${c.level} ${raceN} ${classN}</span>
          <span style="color:var(--muted);font-size:0.75rem;margin-left:auto">GUID ${c.guid}</span>
          ${online}
        </div>`;
      }
      box.innerHTML = html + '</div>';
    } catch(e) { box.innerHTML = `<div style="color:var(--red);font-size:0.82rem">${e.message}</div>`; }
  }

  async function loadCharacter(guid) {
    try {
      showToast(`Loading Character ${guid}…`);
      const r = await fetch(`${API}/character/${guid}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      charData  = d.data;
      charDirty = false;
      document.getElementById('char-landing').style.display = 'none';
      document.getElementById('char-detail').style.display  = '';
      const raceN  = RACE_NAMES[charData.race]   || `Race ${charData.race}`;
      const classN = CLASS_NAMES_CHAR[charData.class] || `Class ${charData.class}`;
      document.getElementById('char-detail-badge').textContent =
        `${charData.name}  ·  Lv.${charData.level} ${raceN} ${classN}  ·  GUID ${guid}`;
      document.getElementById('char-dirty').style.display = 'none';
      charTab = 'overview';
      renderCharDetail();
      showToast(`${charData.name} loaded`);
    } catch(e) { showToast('Server offline','error'); }
  }

  function renderCharDetail() {
    const tabs = ['overview','inventory','quests','spells','reputation','skills','auras','achievements','pvp','edit'];
    const tabLabels = {overview:'📊 Overview',inventory:'🎒 Inventory',
                       quests:'📜 Quests',spells:'✨ Spells',
                       reputation:'⚔️ Reputation',skills:'📚 Skills',
                       auras:'🌀 Auras',achievements:'🏆 Achievements',pvp:'⚔️ PvP',edit:'✏️ Edit'};
    let html = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px">`;
    tabs.forEach(t => {
      const active = t === charTab
        ? 'background:rgba(212,175,55,.18);border-color:var(--gold);color:var(--gold)'
        : 'background:var(--bg);border-color:var(--border);color:var(--muted)';
      html += `<button onclick="setCharTab('${t}')" style="border:1px solid;border-radius:5px;
        padding:5px 13px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:0.8rem;
        transition:.15s;${active}">${tabLabels[t]}</button>`;
    });
    html += '</div>';
    if (charTab === 'overview')      html += renderCharOverview();
    else if (charTab === 'edit')     html += renderCharEdit();
    else if (charTab === 'inventory')    html += `<div id="char-inventory-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading inventory…</div></div>`;
    else if (charTab === 'quests')       html += `<div id="char-quests-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Quests…</div></div>`;
    else if (charTab === 'spells')       html += `<div id="char-spells-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Spells…</div></div>`;
    else if (charTab === 'reputation')   html += `<div id="char-rep-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Reputation…</div></div>`;
    else if (charTab === 'skills')       html += `<div id="char-skills-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Skills…</div></div>`;
    else if (charTab === 'auras')        html += `<div id="char-auras-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Auras…</div></div>`;
    else if (charTab === 'achievements') html += `<div id="char-ach-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading Achievements…</div></div>`;
    else if (charTab === 'pvp')          html += `<div id="char-pvp-content"><div style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.85rem">Loading PvP…</div></div>`;
    document.getElementById('char-detail-form').innerHTML = html;
    if (charTab === 'inventory')    loadCharInventory();
    else if (charTab === 'quests')  loadCharQuests();
    else if (charTab === 'spells')  loadCharSpells();
    else if (charTab === 'reputation')   loadCharReputation();
    else if (charTab === 'skills')       loadCharSkills();
    else if (charTab === 'auras')        loadCharAuras();
    else if (charTab === 'achievements') loadCharAchievements();
    else if (charTab === 'pvp')          loadCharPvp();
  }

  function setCharTab(t) { charTab = t; renderCharDetail(); }

  function renderCharOverview() {
    const c  = charData;
    const acc = c._account || {};
    const stats = c._stats || {};
    const online = c.online ? '<span style="color:var(--green)">● Online</span>' : '<span style="color:var(--muted)">○ Offline</span>';
    const gold = c.money ? `${Math.floor(c.money/10000)}g ${Math.floor((c.money%10000)/100)}s ${c.money%100}c` : '0g';
    const banInfo = c._ban ? `<div style="margin-top:8px;padding:6px 10px;border-radius:5px;background:rgba(200,50,50,.12);border:1px solid var(--red);font-size:0.78rem;color:var(--red)">⛔ BANNED — ${c._ban.banreason||''} (by ${c._ban.bannedby||'?'})</div>` : '';

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`;

    // Character card
    html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Character</div>
      ${infoRow('Name', `<strong>${c.name}</strong>`)}
      ${infoRow('Level', c.level)}
      ${infoRow('Class', CLASS_NAMES_CHAR[c.class]||c.class)}
      ${infoRow('Race', RACE_NAMES[c.race]||c.race)}
      ${infoRow('Gender', GENDER_NAMES[c.gender]||c.gender)}
      ${infoRow('Gold', gold)}
      ${infoRow('Zone', c.zone)}
      ${infoRow('Map', c.map)}
      ${infoRow('Status', online)}
      ${infoRow('XP', c.xp)}
      ${infoRow('Spielzeit', formatPlaytime(c.totaltime))}
    </div>`;

    // Account card
    html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Account</div>
      ${infoRow('ID', acc.id||'?')}
      ${infoRow('Username', `<strong>${acc.username||'?'}</strong>`)}
      ${infoRow('E-Mail', acc.email||'?')}
      ${infoRow('GM Level', `<span style="color:${c._gmlevel>0?'var(--gold)':'var(--muted)'}">${c._gmlevel||0}</span>`)}
      ${infoRow('Expansion', EXPANSION_NAMES[acc.expansion]||acc.expansion)}
      ${infoRow('Last Login', acc.last_login||'?')}
      ${infoRow('Letztes IP', acc.last_ip||'?')}
      ${infoRow('Gesperrt', acc.locked==='1' ? '<span style="color:var(--red)">Ja</span>' : '<span style="color:var(--green)">Nein</span>')}
      ${banInfo}
    </div>`;

    // Stats card (if available)
    if (Object.keys(stats).length) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px">
        <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Stats</div>
        ${infoRow('HP', `${c.health} / ${stats.maxhealth||'?'}`)}
        ${infoRow('Mana', `${c.power1||0} / ${stats.maxpower1||'?'}`)}
        ${infoRow('Strength', stats.strength||0)}
        ${infoRow('Geschick', stats.agility||0)}
        ${infoRow('Stamina', stats.stamina||0)}
        ${infoRow('Intellect', stats.intellect||0)}
        ${infoRow('Spirit', stats.spirit||0)}
        ${infoRow('Armor', stats.armor||0)}
      </div>`;
    }

    // Equipped items
    if (c._equipped && c._equipped.length) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px">
        <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Equipped Items</div>
        <div style="display:flex;flex-direction:column;gap:3px">`;
      for (const it of c._equipped) {
        const slotN = EQUIP_SLOT[it.slot] || `Slot ${it.slot}`;
        const qc = QUALITY_COLOR[it.Quality] || '#fff';
        html += `<div style="display:flex;gap:8px;font-size:0.78rem;align-items:center">
          <span style="color:var(--muted);min-width:80px;font-size:0.72rem">${slotN}</span>
          <span style="color:${qc}">${it.name||`Item #${it.itemEntry}`}</span>
        </div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;

    // Quick actions
    html += `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid var(--border)">
      <button class="e-btn" onclick="setCharTab('edit')">✏️ Edit</button>
      <button class="e-btn" onclick="charGiveItem()" style="background:rgba(0,100,200,.12);border-color:var(--blue)">📦 Item give</button>
      <button class="e-btn" onclick="charAddSpell()" style="background:rgba(100,0,200,.12);border-color:var(--purple)">✨ Spell learn</button>
      <button class="e-btn" onclick="openAccountDetail(${charData.account})" style="background:rgba(200,170,50,.1);border-color:var(--gold)">🔑 Account open</button>
    </div>`;

    return html;
  }

  function infoRow(label, val) {
    return `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="color:var(--muted)">${label}</span>
      <span style="color:var(--text)">${val}</span>
    </div>`;
  }

  function formatPlaytime(seconds) {
    if (!seconds) return '0h';
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60);
    return `${h}h ${m}m`;
  }

  function renderCharEdit() {
    const c = charData;
    const inp = (id, val, type='number') =>
      `<input id="chf-${id}" type="${type}" value="${val??0}"
        style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;
               color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px"
        oninput="charMarkDirty()">`;
    const field = (label, id, val, type='number', hint='') =>
      `<div style="margin-bottom:8px"><label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:3px">${label}${hint?` <span style="font-size:0.68rem;opacity:.6">${hint}</span>`:''}</label>${inp(id,val,type)}</div>`;

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">`;

    html += `<div><div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Basics</div>
      ${field('Name','name',c.name,'text')}
      ${field('Level','level',c.level)}
      ${field('XP','xp',c.xp)}
      ${field('Gold (copper)','money',c.money,undefined,'100g = 1000000')}
      <label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:3px">Class</label>
      <select id="chf-class" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px;margin-bottom:8px" onchange="charMarkDirty()">
        ${Object.entries(CLASS_NAMES_CHAR).map(([k,v])=>`<option value="${k}"${c.class==k?' selected':''}>${v}</option>`).join('')}
      </select>
      <label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:3px">Race</label>
      <select id="chf-race" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px;margin-bottom:8px" onchange="charMarkDirty()">
        ${Object.entries(RACE_NAMES).map(([k,v])=>`<option value="${k}"${c.race==k?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>`;

    html += `<div><div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Position</div>
      ${field('Map','map',c.map)}
      ${field('Zone','zone',c.zone)}
      ${field('X','position_x',c.position_x)}
      ${field('Y','position_y',c.position_y)}
      ${field('Z','position_z',c.position_z)}
      ${field('Orientation','orientation',c.orientation)}
    </div>`;

    html += `<div><div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Misc</div>
      ${field('HP','health',c.health)}
      ${field('Mana (power1)','power1',c.power1)}
      ${field('Bonus Talents','extraBonusTalentCount',c.extraBonusTalentCount)}
      ${field('Grantable Levels','grantableLevels',c.grantableLevels)}
    </div>`;

    html += `</div>`;
    return html;
  }

  function charMarkDirty() {
    charDirty = true;
    document.getElementById('char-dirty').style.display = '';
  }

  async function saveCharacter() {
    if (!charData.guid) { showToast('No Character loaded','error'); return; }
    const guid = charData.guid;
    const get  = id => { const el=document.getElementById('chf-'+id); return el?el.value:undefined; };
    const payload = {};
    ['name'].forEach(f => { const v=get(f); if(v!==undefined) payload[f]=v; });
    ['level','xp','money','map','zone','health','power1','power2','power3','power4',
     'totalHonorPoints','todayHonorPoints','yesterdayHonorPoints','arenaPoints',
     'totalKills','todayKills','yesterdayKills',
     'extraBonusTalentCount','grantableLevels',
     'race','class','position_x','position_y','position_z','orientation'].forEach(f => {
      const v=get(f);
      if(v!==undefined && v!=='') payload[f]=parseFloat(v);
    });
    if (!Object.keys(payload).length) { showToast('No Changes','error'); return; }
    try {
      const r = await fetch(`${API}/character/${guid}/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      Object.assign(charData, payload);
      charDirty = false;
      document.getElementById('char-dirty').style.display = 'none';
      const raceN  = RACE_NAMES[charData.race]   || `Race ${charData.race}`;
      const classN = CLASS_NAMES_CHAR[charData.class] || `Class ${charData.class}`;
      document.getElementById('char-detail-badge').textContent =
        `${charData.name}  ·  Lv.${charData.level} ${raceN} ${classN}  ·  GUID ${guid}`;
      showToast(`${charData.name} saved ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadCharInventory() {
    const guid = charData.guid;
    try {
      const r = await fetch(`${API}/character/${guid}/inventory`);
      const d = await r.json();
      const box = document.getElementById('char-inventory-content');
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      if (!d.data.length) { box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px">Inventory empty.</div>'; return; }
      const bags = {};
      for (const it of d.data) {
        const key = it.bag ?? 0;
        if (!bags[key]) bags[key] = [];
        bags[key].push(it);
      }
      let html = '';
      for (const [bagId, items] of Object.entries(bags)) {
        const bagLabel = bagId == 0 ? 'Equipment & Backpack' : `Bag (bag guid ${bagId})`;
        html += `<div style="margin-bottom:14px"><div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${bagLabel}</div>
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
          <thead><tr style="color:var(--muted);font-size:0.72rem">
            <th style="text-align:left;padding:3px 6px">Slot</th>
            <th style="text-align:left;padding:3px 6px">Item</th>
            <th style="text-align:right;padding:3px 6px">Count</th>
            <th style="text-align:right;padding:3px 6px">iLvl</th>
            <th style="text-align:right;padding:3px 6px">Req</th>
          </tr></thead><tbody>`;
        for (const it of items) {
          const qc = QUALITY_COLOR[it.Quality] || '#fff';
          const slotN = (bagId == 0 && it.slot <= 18) ? (EQUIP_SLOT[it.slot]||it.slot) : it.slot;
          html += `<tr style="border-top:1px solid rgba(255,255,255,.04)">
            <td style="padding:3px 6px;color:var(--muted);font-size:0.72rem">${slotN}</td>
            <td style="padding:3px 6px;color:${qc}">${it.name||`#${it.itemEntry}`}</td>
            <td style="padding:3px 6px;text-align:right;color:var(--text)">${it.count||1}</td>
            <td style="padding:3px 6px;text-align:right;color:var(--muted)">${it.ItemLevel||'—'}</td>
            <td style="padding:3px 6px;text-align:right;color:var(--muted)">${it.RequiredLevel||'—'}</td>
          </tr>`;
        }
        html += `</tbody></table></div>`;
      }
      // Give item form
      html += `<div style="margin-top:14px;padding:12px;border:1px dashed var(--border);border-radius:6px">
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.07em">Item give</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="give-item-entry" type="number" placeholder="Item Entry ID" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:6px 10px">
          <input id="give-item-count" type="number" value="1" min="1" placeholder="Count" style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:6px 8px">
          <button class="e-btn" onclick="charGiveItem()" style="background:rgba(0,100,200,.12);border-color:var(--blue)">📦 Give</button>
        </div>
      </div>`;
      box.innerHTML = html;
    } catch(e) { document.getElementById('char-inventory-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function charGiveItem() {
    const guid = charData.guid;
    const entryEl = document.getElementById('give-item-entry');
    const countEl = document.getElementById('give-item-count');
    if (!entryEl) { setCharTab('inventory'); return; }
    const entry = parseInt(entryEl.value);
    const count = parseInt(countEl?.value||1);
    if (!entry) { showToast('Item Entry missing','error'); return; }
    try {
      const r = await fetch(`${API}/character/${guid}/give_item`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_entry:entry,count})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${d.data.name||'Item'} × ${count} given (Slot ${d.data.slot})`);
      loadCharInventory();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadCharQuests() {
    const guid = charData.guid;
    try {
      const r = await fetch(`${API}/character/${guid}/quests`);
      const d = await r.json();
      const box = document.getElementById('char-quests-content');
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      if (!d.data.length) { box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px">No active quests.</div>'; return; }
      const STATUS_COLOR = {0:'var(--orange)',1:'var(--green)',2:'var(--muted)',3:'var(--red)',4:'var(--red)'};
      let html = `<table style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead><tr style="color:var(--muted);font-size:0.72rem">
          <th style="text-align:left;padding:3px 8px">Quest</th>
          <th style="text-align:left;padding:3px 8px">Title</th>
          <th style="text-align:center;padding:3px 8px">Lvl</th>
          <th style="text-align:left;padding:3px 8px">Status</th>
        </tr></thead><tbody>`;
      for (const q of d.data) {
        const sc = STATUS_COLOR[q.status] || 'var(--text)';
        const sn = QUEST_STATUS[q.status] || q.status;
        html += `<tr style="border-top:1px solid rgba(255,255,255,.04)">
          <td style="padding:4px 8px;font-family:monospace;color:var(--cyan)">${q.quest}</td>
          <td style="padding:4px 8px;color:var(--text)">${q.Title||'—'}</td>
          <td style="padding:4px 8px;text-align:center;color:var(--muted)">${q.QuestLevel||'—'}</td>
          <td style="padding:4px 8px;color:${sc}">${sn}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      box.innerHTML = html;
    } catch(e) { document.getElementById('char-quests-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function loadCharSpells() {
    const guid = charData.guid;
    try {
      const r = await fetch(`${API}/character/${guid}/spells`);
      const d = await r.json();
      const box = document.getElementById('char-spells-content');
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      let html = `<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <input id="char-spell-search" type="text" placeholder="Filter…" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 10px" oninput="filterCharSpells(this.value)">
        <button class="e-btn" onclick="charAddSpell()" style="background:rgba(100,0,200,.12);border-color:var(--purple)">+ Spell learn</button>
      </div>
      <div id="char-spells-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px">`;
      for (const s of d.data) {
        const name = s.spell_name || `Spell #${s.spell}`;
        const rank = s.rank ? ` <span style="color:var(--muted);font-size:0.7rem">${s.rank}</span>` : '';
        const iconUrl = s.icon ? `https://wow.zamimg.com/images/wow/icons/medium/${s.icon}.jpg` : '';
        const iconHtml = iconUrl
          ? `<img src="${iconUrl}" style="width:20px;height:20px;border:1px solid var(--border);border-radius:3px;object-fit:cover;flex-shrink:0" onerror="this.style.visibility='hidden'">`
          : `<div style="width:20px;height:20px;border:1px solid var(--border);border-radius:3px;background:rgba(0,0,0,.3);flex-shrink:0"></div>`;
        html += `<div data-spell="${s.spell}" data-name="${name.toLowerCase()}"
            onmouseenter="charSpellHover(event, ${s.spell})"
            onmousemove="charSpellTipMove(event)"
            onmouseleave="charSpellTipHide()"
            style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg);border:1px solid var(--border);border-radius:5px;font-size:0.78rem;cursor:default">
          ${iconHtml}
          <span style="color:var(--cyan);font-family:monospace;min-width:50px">${s.spell}</span>
          <span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}${rank}</span>
          <button onclick="charRemoveSpell(${s.spell})" title="Remove" style="background:transparent;border:none;cursor:pointer;color:var(--red);font-size:0.7rem;padding:0 2px">✕</button>
        </div>`;
      }
      html += '</div>';
      box.innerHTML = html;
    } catch(e) { document.getElementById('char-spells-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  // ─── Spell hover tooltip (Char Spells tab) ────────────────────────────────
  const _charSpellTipCache = {};
  async function charSpellHover(e, sid) {
    // Show cached immediately or fetch fresh
    let data = _charSpellTipCache[sid];
    if (!data) {
      try {
        const r = await fetch(`${API}/spell/tooltip/${sid}`);
        const d = await r.json();
        if (!d.ok) return;
        data = d.data;
        _charSpellTipCache[sid] = data;
      } catch(_) { return; }
    }
    _charSpellShowTip(data, e);
  }
  function _charSpellShowTip(d, e) {
    document.getElementById('char-spell-tip')?.remove();
    const tip = document.createElement('div');
    tip.id = 'char-spell-tip';
    const color = d.color || '#FFD700';
    tip.style.cssText = `position:fixed;z-index:2000;background:linear-gradient(135deg,#0a1018,#050810);
      border:1px solid ${color};border-radius:6px;padding:10px 12px;
      font-family:'Share Tech Mono',monospace;font-size:0.78rem;color:var(--text);
      pointer-events:none;min-width:220px;max-width:340px;
      box-shadow:0 4px 20px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.04)`;
    const iconUrl = d.icon ? `https://wow.zamimg.com/images/wow/icons/medium/${d.icon}.jpg` : '';
    const iconH = iconUrl
      ? `<img src="${iconUrl}" style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:36px;border:1px solid ${color};border-radius:4px;background:rgba(0,0,0,.4);flex-shrink:0"></div>`;
    let body = `
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">
        ${iconH}
        <div style="flex:1;min-width:0">
          <div style="color:${color};font-weight:600;line-height:1.25">${d.name||'?'}</div>
          ${d.rank ? `<div style="color:${color};font-size:0.66rem;opacity:.7">${d.rank}</div>` : ''}
        </div>
      </div>`;
    const meta = [];
    if (d.resource)  meta.push(`<span style="color:#4a9eff">${d.resource}</span>`);
    if (d.range)     meta.push(`<span style="color:#fff">${d.range}</span>`);
    if (d.cast_time) meta.push(`<span style="color:#fff">${d.cast_time}</span>`);
    if (d.cooldown)  meta.push(`<span style="color:var(--gold)">${d.cooldown}</span>`);
    if (meta.length) body += `<div style="display:flex;flex-wrap:wrap;gap:6px 10px;font-size:0.72rem;margin-bottom:4px">${meta.join('')}</div>`;
    if (d.desc) {
      const dh = d.desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,'<br>');
      body += `<div style="color:#ffd200;font-size:0.74rem;font-style:italic;line-height:1.35">${dh}</div>`;
    }
    body += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08);font-size:0.62rem;color:rgba(255,255,255,.3)">ID: ${d.id||'?'}</div>`;
    tip.innerHTML = body;
    document.body.appendChild(tip);
    positionTooltip(tip, e);
  }
  function charSpellTipMove(e) {
    const t = document.getElementById('char-spell-tip');
    if (t) positionTooltip(t, e);
  }
  function charSpellTipHide() {
    document.getElementById('char-spell-tip')?.remove();
  }

  function filterCharSpells(q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('#char-spells-list [data-spell]').forEach(el => {
      const visible = !lq || el.dataset.name.includes(lq) || el.dataset.spell.includes(lq);
      el.style.display = visible ? '' : 'none';
    });
  }

  async function charRemoveSpell(spellId) {
    const guid = charData.guid;
    if (!confirm(`Spell #${spellId} remove?`)) return;
    try {
      const r = await fetch(`${API}/character/${guid}/spells/${spellId}`, {method:'DELETE'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Spell #${spellId} removed`);
      loadCharSpells();
    } catch(e) { showToast('Server offline','error'); }
  }

  function charAddSpell() {
    const guid = charData.guid;
    openSpellSearchModal('✨ Teach a spell', async (sid) => {
      try {
        const r = await fetch(`${API}/character/${guid}/spells/add`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spell_id:parseInt(sid)})});
        const d = await r.json();
        if (!d.ok) { showToast(d.error||'Error','error'); return; }
        showToast(d.data.action === 'already_known' ? `Spell #${sid} already known` : `Spell #${sid} learned ✓`);
        if (charTab === 'spells') loadCharSpells();
      } catch(e) { showToast('Server offline','error'); }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════

  const FACTION_STANDING = {'-42000':'Hated','-6000':'Hostile','-3000':'Unfriendly','0':'Neutral','3000':'Friendly','9000':'Honored','21000':'Revered','42000':'Exalted'};
  // WoW rep tiers: each tier has a span (start..end). Progress = position within current tier.
  const REP_TIERS = [
    {label:'Hated',      start:-42000, end:-6001, color:'var(--red)'},
    {label:'Hostile',    start:-6000,  end:-3001, color:'var(--red)'},
    {label:'Unfriendly', start:-3000,  end:-1,    color:'var(--orange)'},
    {label:'Neutral',    start:0,      end:2999,  color:'var(--muted)'},
    {label:'Friendly',   start:3000,   end:8999,  color:'var(--green)'},
    {label:'Honored',    start:9000,   end:20999, color:'var(--green)'},
    {label:'Revered',    start:21000,  end:41999, color:'var(--cyan)'},
    {label:'Exalted',    start:42000,  end:42999, color:'var(--gold)'},
  ];

  function factionLabel(standing) {
    for (const t of REP_TIERS) if (standing >= t.start && standing <= t.end) return t;
    return REP_TIERS[0];
  }

  function repProgress(standing) {
    const t = factionLabel(standing);
    const span = (t.end - t.start) || 1;
    const pct  = Math.max(0, Math.min(100, ((standing - t.start) / span) * 100));
    return {tier: t, pct: Math.round(pct),
            into: standing - t.start, span: t.end - t.start + 1};
  }

  async function loadCharReputation() {
    const box = document.getElementById('char-rep-content');
    if (!box) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/reputation`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      if (!d.data.length) { box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:30px 0">No reputation entries.</div>`; return; }
      let html = `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:10px">${d.data.length} factions — Click on Standing to the Edit</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Faction</th>
          <th style="padding:5px 8px;text-align:right">Standing</th>
          <th style="padding:5px 8px;text-align:center">Status</th>
          <th style="padding:5px 8px;text-align:center">Action</th>
        </tr></thead><tbody>`;
      for (const rep of d.data) {
        const p = repProgress(rep.standing);
        const fname = rep.faction_name || `Faction #${rep.faction}`;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)" id="rep-row-${rep.faction}">
          <td style="padding:5px 8px">
            <div style="color:var(--text)">${fname}</div>
            <div style="margin-top:3px;height:3px;background:var(--border);border-radius:2px">
              <div style="width:${p.pct}%;height:3px;background:${p.tier.color};border-radius:2px"></div>
            </div>
            <div style="margin-top:1px;font-size:0.62rem;color:var(--muted);font-family:monospace">${p.into}/${p.span}</div>
          </td>
          <td style="padding:5px 8px;text-align:right">
            <input type="number" value="${rep.standing}" min="-42000" max="42000" step="1"
              style="width:90px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:2px 6px;text-align:right"
              id="rep-val-${rep.faction}">
          </td>
          <td style="padding:5px 8px;text-align:center;color:${p.tier.color};font-size:0.78rem">${p.tier.label}</td>
          <td style="padding:5px 8px;text-align:center">
            <button class="e-btn e-btn-small" onclick="saveCharRep(${rep.faction})">💾</button>
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function saveCharRep(faction) {
    const input = document.getElementById(`rep-val-${faction}`);
    if (!input) return;
    const standing = parseInt(input.value);
    try {
      const r = await fetch(`${API}/character/${charData.guid}/reputation/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({faction,standing})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Reputation saved ✓');
      loadCharReputation();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadCharSkills() {
    const box = document.getElementById('char-skills-content');
    if (!box) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/skills`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      if (!d.data.length) { box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:30px 0">No Skills.</div>`; return; }
      let html = `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Skill</th>
          <th style="padding:5px 8px;text-align:center">ID</th>
          <th style="padding:5px 8px;text-align:center">Value</th>
          <th style="padding:5px 8px;text-align:center">Max</th>
          <th style="padding:5px 8px;text-align:center">Action</th>
        </tr></thead><tbody>`;
      for (const sk of d.data) {
        const pct = sk.max > 0 ? Math.round(sk.value/sk.max*100) : 0;
        const barColor = pct >= 100 ? 'var(--gold)' : pct >= 60 ? 'var(--green)' : 'var(--cyan)';
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
          <td style="padding:5px 8px">
            <div style="color:var(--text)">${sk.skill_name||'Skill'}</div>
            <div style="margin-top:3px;height:3px;background:var(--border);border-radius:2px">
              <div style="width:${pct}%;height:3px;background:${barColor};border-radius:2px"></div>
            </div>
          </td>
          <td style="padding:5px 8px;text-align:center;color:var(--muted);font-size:0.75rem">${sk.skill}</td>
          <td style="padding:5px 8px;text-align:center">
            <input type="number" value="${sk.value}" min="0" max="${sk.max}"
              style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:2px 6px;text-align:center"
              id="skill-val-${sk.skill}">
          </td>
          <td style="padding:5px 8px;text-align:center">
            <input type="number" value="${sk.max}" min="0" max="900"
              style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:2px 6px;text-align:center"
              id="skill-max-${sk.skill}">
          </td>
          <td style="padding:5px 8px;text-align:center">
            <button class="e-btn e-btn-small" onclick="saveCharSkill(${sk.skill})">💾</button>
          </td>
        </tr>`;
      }
      html += '</tbody></table>';
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function saveCharSkill(skillId) {
    const val = parseInt(document.getElementById(`skill-val-${skillId}`)?.value||0);
    const max = parseInt(document.getElementById(`skill-max-${skillId}`)?.value||0);
    try {
      const r = await fetch(`${API}/character/${charData.guid}/skills/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skill:skillId,value:val,max})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Skill saved ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadCharAuras() {
    const box = document.getElementById('char-auras-content');
    if (!box) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/auras`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      if (!d.data.length) { box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:30px 0">No active auras (Character offline or clean).</div>`; return; }
      let html = `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:10px">📖 Read-only — active auras at last logout</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
          <th style="padding:5px 8px;text-align:left">Spell</th>
          <th style="padding:5px 8px;text-align:center">ID</th>
          <th style="padding:5px 8px;text-align:center">Stacks</th>
          <th style="padding:5px 8px;text-align:center">Verbleibend</th>
        </tr></thead><tbody>`;
      for (const a of d.data) {
        const secs = a.remainTime > 0 ? `${Math.round(a.remainTime/1000)}s` : '∞';
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
          <td style="padding:5px 8px;color:var(--cyan)">${a.spell_name||'Spell'}</td>
          <td style="padding:5px 8px;text-align:center;color:var(--muted)">${a.spell}</td>
          <td style="padding:5px 8px;text-align:center;color:var(--text)">${a.stackCount||1}</td>
          <td style="padding:5px 8px;text-align:center;color:var(--muted)">${secs}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function loadCharPvp() {
    const box = document.getElementById('char-pvp-content');
    if (!box) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/pvp`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const h = d.data.honor || {};
      const teams = d.data.teams || [];
      const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const hdr = 'font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px';
      const inp = (id,val) => `<input id="chf-${id}" type="number" value="${val??0}"
        style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px" oninput="charMarkDirty()">`;
      const field = (label,id,val) => `<div style="margin-bottom:8px"><label style="font-size:0.75rem;color:var(--muted);display:block;margin-bottom:3px">${label}</label>${inp(id,val)}</div>`;
      const TEAM_LABEL = {2:'2v2', 3:'3v3', 5:'5v5'};

      let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">`;
      html += `<div><div style="${hdr}">Honor</div>
        ${field('Total Honor Points','totalHonorPoints',h.totalHonorPoints)}
        ${field('Today Honor Points','todayHonorPoints',h.todayHonorPoints)}
        ${field('Yesterday Honor Points','yesterdayHonorPoints',h.yesterdayHonorPoints)}
        ${field('Arena Points','arenaPoints',h.arenaPoints)}
      </div>`;
      html += `<div><div style="${hdr}">Honorable Kills</div>
        ${field('Total Kills','totalKills',h.totalKills)}
        ${field('Today Kills','todayKills',h.todayKills)}
        ${field('Yesterday Kills','yesterdayKills',h.yesterdayKills)}
      </div>`;
      html += `</div>`;

      html += `<div style="margin-top:18px"><div style="${hdr}">Arena Teams</div>`;
      if (!teams.length) {
        html += `<div style="color:var(--muted);font-size:0.82rem;padding:8px 0">Not in any arena team.</div>`;
      } else {
        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">`;
        for (const t of teams) {
          html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="color:var(--gold);font-weight:600">${TEAM_LABEL[t.type]||(t.type+'v'+t.type)}</span>
              <span style="color:var(--text);font-size:0.85rem">${esc(t.name)}</span>
            </div>
            ${infoRow('Team Rating', t.rating??0)}
            ${infoRow('Personal Rating', t.personalRating??0)}
            ${infoRow('Season (W/G)', `${t.seasonWins||0} / ${t.seasonGames||0}`)}
            ${infoRow('Week (W/G)', `${t.weekWins||0} / ${t.weekGames||0}`)}
          </div>`;
        }
        html += `</div>`;
      }
      html += `<div style="color:var(--muted);font-size:0.7rem;margin-top:8px">Arena team names & ratings are read-only (edit in the arena_team table). Honor & arena points above are saved with the top <b>Save</b> button.</div>`;
      html += `</div>`;
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function loadCharAchievements() {
    const box = document.getElementById('char-ach-content');
    if (!box) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/achievements`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const headerCount = d.data.length;
      let html = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <div style="font-size:0.72rem;color:var(--muted)">🏆 ${headerCount} Achievements</div>
          <div style="position:relative;flex:1;min-width:240px;max-width:420px">
            <input id="ach-add-input" placeholder="Search achievement (Name or ID)…" autocomplete="off"
              oninput="achSearchDebounce()" onkeydown="if(event.key==='Escape')closeAchDrop()"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;padding:5px 10px;box-sizing:border-box">
            <div id="ach-add-drop" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--panel);border:1px solid var(--border);border-radius:0 0 6px 6px;max-height:220px;overflow-y:auto"></div>
          </div>
          <button class="e-btn" onclick="charAddAchievement(null)" style="background:rgba(212,175,55,.12);border-color:var(--gold);color:var(--gold)">＋ Add</button>
        </div>`;
      if (!d.data.length) {
        html += `<div style="color:var(--muted);text-align:center;padding:30px 0">No Achievements.</div>`;
        box.innerHTML = html;
        return;
      }
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">`;
      for (const a of d.data) {
        const dt = a.date ? new Date(a.date*1000).toLocaleDateString('en-GB') : '?';
        html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;position:relative">
          <button onclick="charRemoveAchievement(${a.achievement})" title="Remove"
            style="position:absolute;top:4px;right:4px;background:transparent;border:none;cursor:pointer;color:var(--red);font-size:0.75rem;padding:2px 5px;line-height:1">✕</button>
          <div style="color:var(--gold);font-size:0.85rem;font-weight:600;padding-right:18px">${a.title||'Achievement'}</div>
          ${a.description ? `<div style="color:var(--muted);font-size:0.75rem;margin-top:3px">${a.description}</div>` : ''}
          <div style="color:var(--muted);font-size:0.72rem;margin-top:4px">ID ${a.achievement} · ${dt}</div>
        </div>`;
      }
      html += '</div>';
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  let _achSearchTimer = null;
  function achSearchDebounce() {
    clearTimeout(_achSearchTimer);
    _achSearchTimer = setTimeout(achDoSearch, 200);
  }
  function closeAchDrop() {
    const d = document.getElementById('ach-add-drop');
    if (d) d.style.display = 'none';
  }
  async function achDoSearch() {
    const inp  = document.getElementById('ach-add-input');
    const drop = document.getElementById('ach-add-drop');
    const q    = inp?.value.trim();
    if (!drop || !q) { closeAchDrop(); return; }
    drop.style.display = '';
    drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">Search…</div>';
    try {
      const r = await fetch(`${API}/achievement/search?q=${encodeURIComponent(q)}&limit=14`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">No results.</div>';
        return;
      }
      drop.innerHTML = d.data.map(a => `
        <div onclick="charAddAchievement(${a.ID})" style="padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:0.8rem"
          onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background=''">
          <div style="color:var(--gold)">${a.title||'Achievement'}</div>
          <div style="color:var(--muted);font-size:0.68rem">#${a.ID}</div>
        </div>`).join('');
    } catch(e) {
      drop.innerHTML = `<div style="padding:6px 10px;color:var(--red);font-size:0.78rem">${e.message}</div>`;
    }
  }
  async function charAddAchievement(aid) {
    if (aid == null) {
      const v = document.getElementById('ach-add-input')?.value.trim();
      if (!v || !/^\d+$/.test(v)) { showToast('Please enter an ID or choose from the list','error'); return; }
      aid = parseInt(v);
    }
    try {
      const r = await fetch(`${API}/character/${charData.guid}/achievements/add`,
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({achievement:aid})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(d.data.action==='already_have' ? `#${aid} already present` : `Achievement #${aid} added ✓`);
      closeAchDrop();
      const inp = document.getElementById('ach-add-input'); if (inp) inp.value = '';
      loadCharAchievements();
    } catch(e) { showToast('Server offline','error'); }
  }
  async function charRemoveAchievement(aid) {
    if (!confirm(`Achievement #${aid} remove?`)) return;
    try {
      const r = await fetch(`${API}/character/${charData.guid}/achievements/${aid}`,{method:'DELETE'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Achievement #${aid} removed`);
      loadCharAchievements();
    } catch(e) { showToast('Server offline','error'); }
  }


