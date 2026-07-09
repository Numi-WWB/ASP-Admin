/* create-spells.js — extracted from ASP_Admin.html (verbatim) */
  let _spellSearchTimer    = null;
  let _sbRace   = 1;  // default Human
  let _sbClass  = 1;  // default Warrior
  let _sbSpec   = 0; // 0 = all specs, 1-3 = spec index
  let _sbPage   = 0;
  let _sbSpecMap = []; // [{name, spell_ids}] loaded from server per class
  // Source-type visibility (checkboxes top-right of the spellbook)
  let _sbSourceFilter = { action:true, cast:true, racial:true, skill:true, custom:true };
  const SB_PER_PAGE = 20;

  const ALLIANCE_RACES = [1,3,4,7,11];
  const HORDE_RACES    = [2,5,6,8,10];

  const CLASS_COLOR = {
    1:'#C79C6E',2:'#F58CBA',3:'#ABD473',4:'#FFF569',5:'#FFFFFF',
    6:'#C41F3B',7:'#0070DE',8:'#69CCF0',9:'#9482C9',11:'#FF7D0A'
  };

  // WoW 3.3.5 talent specs per class
  const CLASS_SPECS = {
    1: ['Arms','Fury','Protection'],
    2: ['Holy','Protection','Retribution'],
    3: ['Beast Mastery','Marksmanship','Survival'],
    4: ['Assassination','Combat','Subtlety'],
    5: ['Discipline','Holy','Shadow'],
    6: ['Blood','Frost','Unholy'],
    7: ['Elemental','Enhancement','Restoration'],
    8: ['Arcane','Fire','Frost'],
    9: ['Affliction','Demonology','Destruction'],
    11:['Balance','Feral Combat','Restoration']
  };

  const SOURCE_COLOR = {action:'#4dc843', cast:'#ff9900', custom:'#9482c9', racial:'#00bcd4', skill:'#5b8dd9'};
  const SOURCE_LABEL = {action:'Core', cast:'Auto-Cast', custom:'Custom', racial:'Racial', skill:'Skill'};

  async function loadPlayerCreateSpells() {
    await ensureRaceClassMap();
    // Make sure the talent-spec tabs are available for the (default) selected class
    if (_sbClass && !_sbSpecMap.length) await loadSpecMap(_sbClass);
    try {
      const r = await fetch(`${API}/player/createinfo/spells?race=${_sbRace||0}&class=${_sbClass||0}`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('player-content').innerHTML=`<div style="color:var(--red)">${d.error}</div>`; return; }
      playerSpellData = d.data;
      _sbPage = 0;
      renderSpellbook();
      // Load real icons after render
      const ids = [...new Set(d.data.map(s => s.Spell))];
      loadSpellIconsBatch(ids);
    } catch(e) { document.getElementById('player-content').innerHTML=`<div style="color:var(--red)">${e.message}</div>`; }
  }

  function sbFilteredSpells() {
    return playerSpellData.filter(s => {
      if (_sbSourceFilter[s._source] === false) return false;
      if (_sbRace !== 0) {
        const bit = 1 << (_sbRace - 1);
        if (s._race && s._race !== _sbRace) return false;
        if (!s._race && s.racemask !== 0 && !(s.racemask & bit)) return false;
      }
      if (_sbClass !== 0) {
        const bit = 1 << (_sbClass - 1);
        if (s._class && s._class !== _sbClass) return false;
        if (!s._class && s.classmask !== 0 && !(s.classmask & bit)) return false;
      }
      if (_sbSpec !== 0 && _sbSpecMap.length >= _sbSpec) {
        const specData = _sbSpecMap[_sbSpec - 1];
        if (specData && specData.spell_ids && specData.spell_ids.length > 0) {
          // Show spell if it's a talent of this spec OR is universal (racemask=0,classmask=0)
          const isSpecTalent = specData.spell_ids.includes(s.Spell);
          const isUniversal  = !s.racemask && !s.classmask && s._source !== 'racial';
          if (!isSpecTalent && !isUniversal) return false;
        }
      }
      return true;
    });
  }

  // ── Icon URL helper — uses API cache (loaded by loadSpellIconsBatch) ──────
  function sbIconUrl(spellId, isSkill) {
    // Skills: use icon_id from server data → resolve via spellicon cache
    // Spells: _spellIconCache populated by POST /api/spell/icons/bulk
    const cached = _spellIconCache[spellId];
    if (cached && cached !== 'inv_misc_questionmark')
      return `https://wow.zamimg.com/images/wow/icons/medium/${cached.toLowerCase()}.jpg`;
    return null;
  }

  function renderSpellbook() {
    const box       = document.getElementById('player-content');
    const filtered  = sbFilteredSpells();
    const pageCount = Math.max(1, Math.ceil(filtered.length / SB_PER_PAGE));
    if (_sbPage >= pageCount) _sbPage = 0;
    const pageSpells = filtered.slice(_sbPage * SB_PER_PAGE, (_sbPage+1)*SB_PER_PAGE);
    const specs      = _sbClass ? (CLASS_SPECS[_sbClass]||[]) : [];
    const raceName   = _sbRace  ? PLAYER_RACE_NAMES[_sbRace]  : null;
    const className  = _sbClass ? PLAYER_CLASS_NAMES[_sbClass] : null;
    const clsColor   = _sbClass ? (CLASS_COLOR[_sbClass]||'#fff') : 'var(--gold)';

    // ── Race portrait button ────────────────────────────────────────────────
    const raceBtn = (raceId) => {
      const nm = PLAYER_RACE_NAMES[raceId]||'?';
      const active = _sbRace === raceId;
      return `<div onclick="setSbRace(${raceId})" title="${nm}"
        style="width:44px;height:44px;border-radius:5px;cursor:pointer;
          background:${active?'rgba(212,175,55,.22)':'rgba(0,0,0,.4)'};
          border:2px solid ${active?'var(--gold)':'rgba(255,255,255,.1)'};
          display:flex;align-items:center;justify-content:center;
          font-family:'Share Tech Mono',monospace;font-size:0.65rem;font-weight:700;
          color:${active?'var(--gold)':'rgba(255,255,255,.38)'};transition:.12s;text-align:center"
        onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
        onmouseout="this.style.borderColor='${active?'var(--gold)':'rgba(255,255,255,.1)'}';this.style.color='${active?'var(--gold)':'rgba(255,255,255,.38)'}'">
        ${nm.slice(0,4)}</div>`;
    };

    // ── Class tab button ───────────────────────────────────────────────────
    const clsBtn = (id, nm) => {
      const active = _sbClass === id;
      const cc = id ? (CLASS_COLOR[id]||'#fff') : 'var(--gold)';
      return `<button onclick="setSbClass(${id})"
        style="border:1px solid ${active?cc:'rgba(255,255,255,.1)'};border-radius:4px;
          padding:4px 10px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:0.74rem;
          background:${active?cc+'18':'transparent'};color:${active?cc:'rgba(255,255,255,.4)'};
          white-space:nowrap;transition:.12s"
        onmouseover="this.style.borderColor='${cc}';this.style.color='${cc}'"
        onmouseout="this.style.borderColor='${active?cc:'rgba(255,255,255,.1)'}';this.style.color='${active?cc:'rgba(255,255,255,.4)'}'">
        ${nm}</button>`;
    };

    // ── Spec tab button (bottom bar) ────────────────────────────────────────
    const specBtn = (idx, nm) => {
      const active = _sbSpec === idx;
      return `<button onclick="setSbSpec(${idx})"
        style="border-bottom:2px solid ${active?clsColor:'transparent'};border-top:none;
          border-left:none;border-right:none;padding:6px 16px;cursor:pointer;
          font-family:'Share Tech Mono',monospace;font-size:0.74rem;background:transparent;
          color:${active?clsColor:'rgba(255,255,255,.35)'};transition:.12s;white-space:nowrap"
        onmouseover="this.style.color='${clsColor}'"
        onmouseout="this.style.color='${active?clsColor:'rgba(255,255,255,.35)'}'">
        ${nm}</button>`;
    };

    // ── Source-type checkbox (top-right) — unchecked hides that type ─────────
    const sourceCheck = (src, label) => {
      const on  = _sbSourceFilter[src] !== false;
      const col = SOURCE_COLOR[src] || '#ccc';
      return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;
        color:${on?col:'rgba(255,255,255,.3)'};user-select:none">
        <input type="checkbox" ${on?'checked':''} onchange="toggleSbSource('${src}')"
          style="accent-color:${col};cursor:pointer;margin:0;width:12px;height:12px">${label}</label>`;
    };

    // ── Spell list row ──────────────────────────────────────────────────────
    const spellRow = (s) => {
      const sc        = SOURCE_COLOR[s._source] || '#ccc';
      const nm        = s.spell_name || `#${s.Spell}`;
      const typeLabel = SOURCE_LABEL[s._source] || s._source || '';
      const note      = s.Note ? s.Note : '';
      const deletable = s._source === 'custom';
      const isSkill   = !!s._is_skill;
      // Use pre-resolved icon from server response, fallback to cache
      const preIcon   = s.icon || _spellIconCache[s.Spell] || '';
      if (preIcon && !_spellIconCache[s.Spell]) _spellIconCache[s.Spell] = preIcon;
      const iconUrl   = preIcon
        ? `https://wow.zamimg.com/images/wow/icons/medium/${preIcon.toLowerCase()}.jpg`
        : sbIconUrl(s.Spell, isSkill);

      const iconHtml = `
        <div style="width:40px;height:40px;flex-shrink:0;border:2px solid ${sc};border-radius:5px;
          overflow:hidden;background:rgba(0,0,0,.5);position:relative;box-shadow:0 0 6px ${sc}44">
          ${iconUrl
            ? `<img id="sicon-${s.Spell}" src="${iconUrl}" data-spell="${s.Spell}" data-icon="${s.icon_id||0}"
                style="width:100%;height:100%;object-fit:cover;display:block"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div style="${iconUrl?'display:none':'display:flex'};width:100%;height:100%;
            align-items:center;justify-content:center;font-size:1rem;color:${sc};
            font-family:'Rajdhani',sans-serif;font-weight:700">
            ${nm[0]||'?'}
          </div>
          <div style="position:absolute;bottom:1px;right:2px;font-size:0.38rem;
            color:rgba(255,255,255,.35);font-family:monospace">${s.Spell}</div>
        </div>`;

      return `<div
        data-spell-id="${s.Spell}" data-name="${nm.replace(/"/g,'&quot;')}"
        data-color="${sc}" data-is-skill="${isSkill?'1':'0'}" data-rank="${(note||'').replace(/"/g,'&quot;')}"
        style="display:flex;align-items:center;gap:10px;padding:5px 12px;
          border-bottom:1px solid rgba(139,100,20,.1);transition:background .1s;
          cursor:${deletable?'pointer':'default'}"
        onmouseenter="this.style.background='rgba(139,100,20,.12)';sbShowTip(event,this)"
        onmouseleave="this.style.background='';hideSpellTooltip()"
        ${deletable?`onclick="deleteCreateSpell(${s.racemask},${s.classmask},${s.Spell})"`:''}>

        ${iconHtml}

        <div style="flex:1;min-width:0">
          <div style="color:${sc};font-size:0.92rem;font-weight:700;font-family:'Rajdhani',sans-serif;
            line-height:1.2">${nm}</div>
          <div style="color:rgba(200,160,60,.45);font-size:0.62rem;font-family:'Share Tech Mono',monospace;
            white-space:nowrap">${note || typeLabel}</div>
        </div>

        <div style="font-size:0.58rem;color:${sc};opacity:.55;font-family:monospace;
          text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">${typeLabel}</div>

        ${deletable ? `<div title="Remove"
          style="color:var(--red);font-size:0.72rem;opacity:.6;flex-shrink:0;
            margin-left:4px;padding:2px 4px">✕</div>` : ''}
      </div>`;
    };

    // ── Render HTML ──────────────────────────────────────────────────────────
    box.innerHTML = `
    <div style="display:flex;flex-direction:column;
      background:linear-gradient(180deg,rgba(28,20,6,.98) 0%,rgba(18,12,2,.99) 100%);
      border:2px solid rgba(139,100,20,.55);border-radius:8px;overflow:hidden;
      box-shadow:0 4px 24px rgba(0,0,0,.7),inset 0 1px 0 rgba(212,175,55,.08)">

      <!-- ROW 1: Class tabs -->
      <div style="background:rgba(0,0,0,.45);border-bottom:1px solid rgba(139,100,20,.35);
        padding:6px 10px;display:flex;gap:5px;flex-wrap:wrap;align-items:center">
        ${Object.entries(PLAYER_CLASS_NAMES)
            .filter(([id]) => !_sbRace || validClassesFor(_sbRace).includes(parseInt(id)))
            .map(([id,n])=>clsBtn(parseInt(id),n)).join('')}
        <span style="margin-left:auto;color:#fff;font-weight:700;font-size:0.75rem;
          font-family:'Share Tech Mono',monospace">Set PlayerStart.CustomSpells to 1 in worldserver.conf!</span>
      </div>

      <!-- ROW 2: Main body -->
      <div style="display:flex">

        <!-- Alliance sidebar -->
        <div style="width:56px;flex-shrink:0;background:rgba(8,18,50,.65);
          border-right:1px solid rgba(70,90,160,.22);padding:8px 6px;
          display:flex;flex-direction:column;gap:5px;align-items:center">
          <div style="font-size:0.42rem;color:rgba(100,140,255,.55);text-transform:uppercase;
            letter-spacing:.1em;margin-bottom:2px;text-align:center">ALLI</div>
          ${ALLIANCE_RACES.map(raceBtn).join('')}
        </div>

        <!-- Center: spell list -->
        <div style="flex:1;display:flex;flex-direction:column;min-width:0">

          <!-- Header -->
          <div style="padding:6px 12px;border-bottom:1px solid rgba(139,100,20,.18);
            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <div style="font-family:'Share Tech Mono',monospace;font-size:0.72rem;
              color:rgba(200,160,60,.65);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${raceName?`<span style="color:var(--gold)">● ${raceName}</span>`:''}
              ${className?`<span style="color:${clsColor}">● ${className}</span>`:''}
              ${!raceName&&!className?`<span style="color:rgba(200,160,60,.4)">All Start Spells</span>`:''}
              <span style="opacity:.45">· ${filtered.length} Spells</span>
              ${_sbSpec && specs[_sbSpec-1] ? `<span style="color:${clsColor};opacity:.7">· ${specs[_sbSpec-1]}</span>` : ''}
            </div>
            <div style="font-size:0.6rem;display:flex;gap:10px;font-family:monospace;flex-wrap:wrap"
              title="Uncheck to hide that spell type from the book">
              ${sourceCheck('action','Core')}
              ${sourceCheck('cast','Auto-Cast')}
              ${sourceCheck('racial','Racial')}
              ${sourceCheck('skill','Skill')}
              ${sourceCheck('custom','Custom')}
            </div>
          </div>

          <!-- Spell rows -->
          <div style="overflow-y:auto;min-height:260px;max-height:380px">
            ${pageSpells.length
              ? pageSpells.map(spellRow).join('')
              : `<div style="text-align:center;padding:70px 20px;
                  color:rgba(200,160,60,.22);font-size:0.85rem;
                  font-family:'Share Tech Mono',monospace">
                  No Spells for this Selection.</div>`}
          </div>

          <!-- Pagination -->
          ${pageCount > 1 ? `
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:6px 14px;border-top:1px solid rgba(139,100,20,.15);
            font-family:'Share Tech Mono',monospace">
            <button onclick="setSbPage(${_sbPage-1})" ${_sbPage===0?'disabled':''}
              style="background:rgba(139,90,10,.18);border:1px solid rgba(139,100,20,.4);
                border-radius:4px;color:#e8d090;padding:3px 14px;cursor:pointer;
                font-size:0.7rem;opacity:${_sbPage===0?0.3:1}">◀ Back</button>
            <span style="color:rgba(200,160,60,.5);font-size:0.68rem">
              Page ${_sbPage+1} / ${pageCount}</span>
            <button onclick="setSbPage(${_sbPage+1})" ${_sbPage>=pageCount-1?'disabled':''}
              style="background:rgba(139,90,10,.18);border:1px solid rgba(139,100,20,.4);
                border-radius:4px;color:#e8d090;padding:3px 14px;cursor:pointer;
                font-size:0.7rem;opacity:${_sbPage>=pageCount-1?0.3:1}">Next ▶</button>
          </div>` : ''}

        </div>

        <!-- Horde sidebar -->
        <div style="width:56px;flex-shrink:0;background:rgba(50,8,8,.65);
          border-left:1px solid rgba(160,50,30,.22);padding:8px 6px;
          display:flex;flex-direction:column;gap:5px;align-items:center">
          <div style="font-size:0.42rem;color:rgba(200,70,50,.55);text-transform:uppercase;
            letter-spacing:.1em;margin-bottom:2px;text-align:center">HORDE</div>
          ${HORDE_RACES.map(raceBtn).join('')}
        </div>

      </div><!-- /body -->

      <!-- ROW 3: Search → click a result to add it for the selected race/class -->
      <div style="background:rgba(0,0,0,.5);border-top:1px solid rgba(139,100,20,.3);
        padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">

        <div style="flex:1;min-width:220px;position:relative">
          <input id="pcs-search-input" placeholder="🔍 Search a spell (Name or ID) — click a result to add it…"
            style="width:100%;background:rgba(0,0,0,.5);border:1px solid rgba(139,100,20,.4);
              border-radius:4px;color:#e8d090;font-family:'Share Tech Mono',monospace;font-size:0.8rem;
              padding:6px 10px;box-sizing:border-box"
            oninput="spellSearchDebounce()" autocomplete="off"
            onkeydown="if(event.key==='Escape')closeSpellDrop()">
          <div id="pcs-search-drop" style="display:none;position:absolute;bottom:100%;left:0;right:0;z-index:200;
            background:var(--panel);border:1px solid rgba(139,100,20,.4);border-radius:6px 6px 0 0;
            max-height:260px;overflow-y:auto;margin-bottom:2px"></div>
        </div>

        <div style="font-size:0.68rem;color:rgba(200,160,60,.55);font-family:'Share Tech Mono',monospace;
          white-space:nowrap;flex-shrink:0">
          Adds to:
          <b style="color:${_sbRace?'var(--gold)':'rgba(200,160,60,.4)'}">${raceName||'—'}</b>
          <b style="color:${clsColor}">${className||'—'}</b>
        </div>

        <div style="width:100%;font-size:0.6rem;color:rgba(200,160,60,.3);font-family:'Share Tech Mono',monospace">
          ${playerSpellData.length} spells total
          (${playerSpellData.filter(s=>s._source==='action').length} Core ·
           ${playerSpellData.filter(s=>s._source==='cast').length} Auto-Cast ·
           ${playerSpellData.filter(s=>s._source==='racial').length} Racial ·
           ${playerSpellData.filter(s=>s._source==='skill').length} Skill ·
           ${playerSpellData.filter(s=>s._source==='custom').length} Custom)
        </div>

      </div><!-- /search bar -->

      <!-- ROW 4: Spec tabs (bottom) -->
      ${specs.length ? `
      <div style="background:rgba(0,0,0,.6);border-top:1px solid rgba(139,100,20,.3);
        padding:0 8px;display:flex;align-items:center;gap:0">
        ${specBtn(0,'All Specs')}
        ${specs.map((n,i)=>specBtn(i+1,n)).join('')}
      </div>` : ''}

    </div>`;
  }


  function setSbRace(id)  {
    _sbRace = id;            // always keep a race selected (no toggle-off)
    _sbPage = 0;
    // If the current class isn't valid for this race, switch to the first valid one
    if (_sbClass && !validClassesFor(_sbRace).includes(_sbClass)) {
      _sbClass = validClassesFor(_sbRace)[0] || 0;
      _sbSpec = 0; _sbSpecMap = [];
    }
    if (_sbClass && !_sbSpecMap.length) loadSpecMap(_sbClass).then(() => loadPlayerCreateSpells());
    else loadPlayerCreateSpells();
  }
  function setSbClass(id) {
    _sbClass = id;           // always keep a class selected (no toggle-off)
    _sbSpec=0; _sbPage=0; _sbSpecMap=[];
    loadSpecMap(_sbClass).then(() => loadPlayerCreateSpells());
  }
  function toggleSbSource(src) {
    _sbSourceFilter[src] = !_sbSourceFilter[src];
    _sbPage = 0;
    renderSpellbook();       // client-side filter only — no reload needed
  }

  async function loadSpecMap(classId) {
    if (!classId) { _sbSpecMap = []; return; }
    try {
      const r = await fetch(`${API}/player/spells/specmap?class=${classId}`);
      const d = await r.json();
      _sbSpecMap = (d.ok && Array.isArray(d.data)) ? d.data : [];
    } catch(e) { _sbSpecMap = []; }
  }

  // ── Spell icon cache & batch loader ───────────────────────────────────────
  function setSbSpec(idx) { _sbSpec  = idx; _sbPage=0; renderSpellbook(); }
  function setSbPage(p) {
    const pc = Math.max(1, Math.ceil(sbFilteredSpells().length / SB_PER_PAGE));
    _sbPage = Math.max(0, Math.min(p, pc-1));
    renderSpellbook();
  }

  function spellSearchDebounce() {
    clearTimeout(_spellSearchTimer);
    _spellSearchTimer = setTimeout(spellDoSearch, 240);
  }

  function closeSpellDrop() {
    const d = document.getElementById('pcs-search-drop');
    if (d) d.style.display = 'none';
  }

  async function spellDoSearch() {
    const q    = document.getElementById('pcs-search-input')?.value.trim();
    const drop = document.getElementById('pcs-search-drop');
    if (!drop || !q) return;
    drop.style.display = '';
    drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">Search…</div>';
    try {
      const r = await fetch(`${API}/spell/search?q=${encodeURIComponent(q)}&limit=1000`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        drop.innerHTML='<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">No results.</div>';
        return;
      }
      const ids = [];
      drop.innerHTML = d.data.map(s => {
        const name = s.name || '?';
        const id   = s.ID || s.id;
        ids.push(id);
        const rankTxt = s.rank || '';
        const rank = rankTxt ? `<span style="color:rgba(200,160,60,.45);font-size:0.64rem">${rankTxt}</span>` : '';
        const iconUrl = sbIconUrl(id, false);
        return `<div onclick="addSpellFromSearch(${id},'${name.replace(/'/g,"\\'")}')"
          data-spell-id="${id}" data-name="${name.replace(/"/g,'&quot;')}" data-rank="${rankTxt.replace(/"/g,'&quot;')}"
          onmouseenter="this.style.background='rgba(139,100,20,.15)';sbShowTip(event,this)"
          onmouseleave="this.style.background='';hideSpellTooltip()"
          style="padding:4px 8px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);
            font-family:'Share Tech Mono',monospace;font-size:0.78rem;display:flex;gap:8px;align-items:center">
          <img data-spell="${id}" src="${iconUrl||''}"
            style="width:26px;height:26px;border-radius:3px;object-fit:cover;flex-shrink:0;${iconUrl?'':'display:none'}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div style="${iconUrl?'display:none':'display:flex'};width:26px;height:26px;background:rgba(148,130,201,.12);
            border:1px solid rgba(148,130,201,.3);border-radius:3px;align-items:center;justify-content:center;
            font-size:0.5rem;color:rgba(148,130,201,.6);flex-shrink:0;font-family:monospace">${id}</div>
          <span style="flex:1;min-width:0"><span style="color:#e8d090">${name}</span> ${rank}</span>
          <span style="color:rgba(200,160,60,.3);font-size:0.65rem;flex-shrink:0">#${id}</span>
        </div>`;
      }).join('');
      loadSpellIconsBatch(ids);   // fetch + inject icons for the search results
    } catch(e) {
      drop.innerHTML=`<div style="padding:6px 10px;color:var(--red);font-size:0.78rem">${e.message}</div>`;
    }
  }

  // Click a search result → add it as a start spell for the currently selected race/class
  async function addSpellFromSearch(id, name) {
    closeSpellDrop();
    const inp = document.getElementById('pcs-search-input');
    if (inp) inp.value = '';
    if (!_sbClass && !_sbRace) { showToast('Select a race/class first','error'); return; }
    const racemask  = RACE_MASK[_sbRace]   || 0;
    const classmask = CLASS_MASK[_sbClass] || 0;
    const who = `${_sbRace?PLAYER_RACE_NAMES[_sbRace]:''} ${_sbClass?PLAYER_CLASS_NAMES[_sbClass]:''}`.trim();
    try {
      const res = await fetch(`${API}/player/createinfo/spells/add`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({racemask, classmask, spell: id, Note: ''})
      });
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${name} added for ${who} ✓`);
      loadPlayerCreateSpells();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteCreateSpell(racemask, classmask, spell) {
    if (!confirm(`Custom Spell #${spell} remove?`)) return;
    try {
      const res = await fetch(`${API}/player/createinfo/spells/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({racemask, classmask, spell})
      });
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Spell #${spell} removed`);
      loadPlayerCreateSpells();
    } catch(e) { showToast('Server offline','error'); }
  }







