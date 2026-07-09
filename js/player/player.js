/* player.js — extracted from ASP_Admin.html (verbatim) */
  let playerTab     = 'xp';
  let playerXpData  = [];
  let playerXpDirty = false;
  let playerClassData = [];
  let playerClassDirty = false;
  let playerRaceData  = [];
  let playerRaceDirty = false;
  let playerCreateData = [];
  let playerItemData   = [];
  let playerSpellData  = [];
  let playerModuleInited = false;

  // selected filters
  let pClassFilter = 1;
  let pRaceFilter  = 1;
  let pCIRace      = 1;
  let pCIClass     = 1;
  let _raceClassMap = {};   // {race: [classes]} from CharBaseInfo.dbc — for class dropdown filter

  function initPlayerModule() {
    if (playerModuleInited) return;
    playerModuleInited = true;
    renderPlayerTabs();
    loadPlayerTab('xp');
  }

  function renderPlayerTabs() {
    const tabs = [
      {id:'xp',      label:'📈 XP Curve'},
      {id:'class',   label:'⚔️ Class Stats'},
      {id:'race',    label:'🧬 Race Stats'},
      {id:'create',  label:'🏁 Start Character'},
      {id:'items',   label:'🎒 Start Items'},
      {id:'spells',  label:'✨ Start Spells'},
    ];
    const box = document.getElementById('player-tabs');
    if (!box) return;
    box.innerHTML = tabs.map(t => {
      const active = t.id === playerTab
        ? 'background:rgba(212,175,55,.18);border-color:var(--gold);color:var(--gold)'
        : 'background:var(--bg);border-color:var(--border);color:var(--muted)';
      return `<button onclick="loadPlayerTab('${t.id}')" style="border:1px solid;border-radius:5px;
        padding:5px 14px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:0.8rem;
        transition:.15s;${active}">${t.label}</button>`;
    }).join('');
  }

  async function loadPlayerTab(tab) {
    playerTab = tab;
    renderPlayerTabs();
    const box = document.getElementById('player-content');
    box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:20px 0">Loading…</div>';
    if (tab === 'xp')     await loadPlayerXP();
    else if (tab === 'class')  await loadPlayerClassStats();
    else if (tab === 'race')   await loadPlayerRaceStats();
    else if (tab === 'create') await loadPlayerCreateInfo();
    else if (tab === 'items')    await loadPlayerCreateItems();
    else if (tab === 'spells')   await loadPlayerCreateSpells();
  }

  // ── XP Kurve ─────────────────────────────────────────────────────────────

