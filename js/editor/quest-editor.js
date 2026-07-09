/* quest-editor.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let questMode = 'easy';
  let questData = {};
  let questDirty = false;

  const QUEST_TYPES    = {0:'Group',1:'Daily',2:'Normal',3:'PvP',4:'Weekly',6:'Raid',8:'Dungeon'};
  const QUEST_FLAGS    = {0:'None',2:'Shareable',4:'NoGoldAtMax',8:'Hidden',32:'Epic',128:'Auto-Rewarded',512:'Daily',1024:'Raid',4096:'Weekly'};

  function goToQuestLanding() {
    document.getElementById('quest-editor-screen-landing').style.display = '';
    document.getElementById('quest-editor-screen-editor').style.display  = 'none';
    questData = {}; questDirty = false;
  }

  function openQuestEditor(mode) {
    questMode = mode;
    document.getElementById('quest-editor-screen-landing').style.display = 'none';
    document.getElementById('quest-editor-screen-editor').style.display  = '';
  }

  async function searchQuests() {
    const q = document.getElementById('quest-search-input').value.trim();
    if (!q) return;
    const res = document.getElementById('quest-search-results');
    res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">Search…</div>';
    res.classList.add('open');
    try {
      const r = await fetch(`${API}/quest/search?q=${encodeURIComponent(q)}&limit=20`);
      const d = await r.json();
      if (!d.ok || !d.data.length) { res.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-size:0.78rem">No results</div>'; return; }
      res.innerHTML = d.data.map(qt => `
        <div class="search-result-item" onclick="loadQuest(${qt.ID})">
          <span style="color:var(--green)">${qt.LogTitle||'(no title)'}</span>
          <span class="search-result-id">#${qt.ID} · Lvl ${qt.QuestLevel}</span>
        </div>`).join('');
    } catch(e) { res.innerHTML = '<div style="padding:8px 12px;color:var(--red);font-size:0.78rem">Server offline</div>'; }
  }

  async function loadQuest(id) {
    document.getElementById('quest-search-results').classList.remove('open');
    try {
      const r = await fetch(`${API}/quest/${id}`);
      const d = await r.json();
      if (!d.ok) { showToast('Quest not found','error'); return; }
      questData = d.data;
      document.getElementById('quest-editor-form').innerHTML = renderQuestForm(questData);
      document.getElementById('quest-entry-badge').textContent = `Quest #${id} — ${questData.LogTitle||''}`;
      questDirty = false;
      document.getElementById('quest-dirty').style.display = 'none';
      showToast(`Quest #${id} loaded`);
    } catch(e) { showToast('Error at Load','error'); }
  }

  function renderQuestForm(data) {
    const v  = (k, def=0)  => data[k] !== undefined ? data[k] : def;
    const vs = (k, def='') => data[k] !== undefined ? String(data[k]) : def;
    // Normalize name field (server returns Name_Lang_enUS after mapping)
    if (!data.Name_Lang_enUS) data.Name_Lang_enUS = data.spell_name || data.name || '';
    if (!data.Description_Lang_enUS) data.Description_Lang_enUS = data.spell_desc || '';
    let html = '<div class="easy-form">';

    // ── Basics ─────────────────────────────────────────────────────────────
    html += eSection('📋 Basics');
    html += eField('ID', 'qe-ID', v('ID'), 'number');
    html += eSelect('Quest Type', 'qe-QuestType', QUEST_TYPES, v('QuestType'));
    html += eField('Quest Level', 'qe-QuestLevel', v('QuestLevel'), 'number', false, '-1 = player level');
    html += eField('Min Level', 'qe-MinLevel', v('MinLevel'), 'number');
    html += eField('Max Level', 'qe-MaxLevel', v('MaxLevel'), 'number', false, '0 = no Maximum');
    html += eBitmask('Flags', 'qe-Flags', QUEST_FLAG_BITS, v('Flags'));
    html += eBitmask('Special Flags', 'qe-SpecialFlags', QUEST_SFLAG, v('SpecialFlags'));
    html += eField('QuestSortID', 'qe-QuestSortID', v('QuestSortID'), 'number', false, '→ questsort_dbc (zone/instance category)');
    html += '</div>';

    // ── Texts ─────────────────────────────────────────────────────────────
    html += '<div class="easy-section-title">📝 Texts</div>';
    html += eTextarea('Log Title', 'qe-LogTitle', vs('LogTitle'), 2);
    html += eTextarea('Log Description', 'qe-LogDescription', vs('LogDescription'), 4);
    html += eTextarea('Quest Description (accept dialog)', 'qe-QuestDescription', vs('QuestDescription'), 4);
    html += eTextarea('Area Description (Zone-Note)', 'qe-AreaDescription', vs('AreaDescription'), 2);
    html += eTextarea('Completion Log (all Objectives fulfills)', 'qe-QuestCompletionLog', vs('QuestCompletionLog'), 3);

    // ── Objectives ────────────────────────────────────────────────────────
    html += eSection('🎯 Kill / Interact Objectives (1–4)');
    for (let i=1; i<=4; i++) {
      html += eField(`NPC/GO ${i}`, `qe-RequiredNpcOrGo${i}`, v(`RequiredNpcOrGo${i}`), 'number', false, 'pos=creature, neg=gameobject');
      html += eField(`Count ${i}`, `qe-RequiredNpcOrGoCount${i}`, v(`RequiredNpcOrGoCount${i}`));
      html += eField(`Text ${i}`, `qe-ObjectiveText${i}`, vs(`ObjectiveText${i}`), 'text', true);
    }
    html += '</div>';

    // ── Collect items ─────────────────────────────────────────────────────
    html += eSection('📦 Collect Items (1–6)');
    for (let i=1; i<=6; i++) {
      html += eField(`Item ${i}`, `qe-RequiredItemId${i}`, v(`RequiredItemId${i}`), 'number', false, '→ item_template.entry');
      html += eField(`Amount ${i}`, `qe-RequiredItemCount${i}`, v(`RequiredItemCount${i}`));
    }
    html += '</div>';

    // ── Rewards ───────────────────────────────────────────────────────────
    html += eSection('🏆 Rewards');
    html += eField('XP Difficulty', 'qe-RewardXPDifficulty', v('RewardXPDifficulty'), 'number', false, '0–9 → questxp_dbc Tier');
    html += eField('Gold (copper)', 'qe-RewardMoney', v('RewardMoney'), 'number');
    html += eField('Bonus Gold at Max-Lvl', 'qe-RewardBonusMoney', v('RewardBonusMoney'), 'number');
    html += eField('Spell Reward', 'qe-RewardSpell', v('RewardSpell'), 'number', false, '→ spell_dbc.ID');
    html += eField('Title Reward', 'qe-RewardTitle', v('RewardTitle'), 'number', false, '→ CharTitles.dbc.ID');
    html += eField('Talent Points', 'qe-RewardTalents', v('RewardTalents'));
    html += '</div>';

    html += eSection('🎁 Fixed Item Rewards (1–4)');
    for (let i=1; i<=4; i++) {
      html += eField(`Item ${i}`, `qe-RewardItemId${i}`, v(`RewardItemId${i}`), 'number', false, '→ item_template.entry');
      html += eField(`Amount ${i}`, `qe-RewardItemCount${i}`, v(`RewardItemCount${i}`));
    }
    html += '</div>';

    html += eSection('🎁 Selectable Item-Rewards (1–6)');
    for (let i=1; i<=6; i++) {
      html += eField(`Item ${i}`, `qe-RewardChoiceItemId${i}`, v(`RewardChoiceItemId${i}`), 'number', false, '→ item_template.entry');
      html += eField(`Amount ${i}`, `qe-RewardChoiceItemCount${i}`, v(`RewardChoiceItemCount${i}`));
    }
    html += '</div>';

    if (questMode === 'full') {
      // ── Reputation ────────────────────────────────────────────────────────
      html += eSection('⚖️ Reputation Rewards (1–5)');
      for (let i=1; i<=5; i++) {
        html += eField(`Faction ${i}`, `qe-RewardFactionId${i}`, v(`RewardFactionId${i}`), 'number', false, '→ faction_dbc.ID');
        html += eField(`Value ${i}`, `qe-RewardFactionValue${i}`, v(`RewardFactionValue${i}`));
      }
      html += '</div>';

      // ── quest_template_addon ──────────────────────────────────────────────
      html += eSection('🔗 Chaining (quest_template_addon)');
      html += eField('PrevQuestID', 'qe-PrevQuestID', v('PrevQuestID'), 'number', false, 'This quest requires completion of quest ID');
      html += eField('NextQuestID', 'qe-NextQuestID', v('NextQuestID'), 'number', false, 'This quest unlocks quest ID');
      html += eField('ExclusiveGroup', 'qe-ExclusiveGroup', v('ExclusiveGroup'), 'number', false, 'Only one quest from the group possible');
      html += eField('BreadcrumbForQuestId', 'qe-BreadcrumbForQuestId', v('BreadcrumbForQuestId'), 'number', false, 'Breadcrumb quest for ID');
      html += eBitmask('AllowableClasses', 'qe-AllowableClasses', WOW_CLASS_BITS, v('AllowableClasses'), '0=All Classes');
      html += eField('SourceSpellID', 'qe-SourceSpellID', v('SourceSpellID'), 'number', false, '→ spell_dbc.ID · Quest started via spell');
      html += '</div>';

      // ── Portraits & Scripts ────────────────────────────────────────────────
      html += eSection('⚙️ Portraits & Scripts');
      html += eField('PortraitGiver', 'qe-PortraitGiver', v('PortraitGiver'), 'number', false, '→ creature_template.entry · Geber-Portrait');
      html += eField('PortraitTurnIn', 'qe-PortraitTurnIn', v('PortraitTurnIn'), 'number', false, '→ creature_template.entry · turn-in portrait');
      html += eField('StartScript', 'qe-StartScript', v('StartScript'), 'number', false, '→ quest_start_scripts');
      html += eField('CompleteScript', 'qe-CompleteScript', v('CompleteScript'), 'number', false, '→ quest_end_scripts');
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function newQuest() {
    const id = prompt('Quest ID:');
    if (!id || isNaN(id)) return;
    questData = { ID: parseInt(id), QuestType: 2, QuestLevel: 1, MinLevel: 0, MaxLevel: 0, Flags: 0, SpecialFlags: 0 };
    document.getElementById('quest-editor-form').innerHTML = renderQuestForm(questData);
    document.getElementById('quest-entry-badge').textContent = `New Quest #${id}`;
    questDirty = true;
    document.getElementById('quest-dirty').style.display = '';
  }

  async function saveQuest() {
    const idEl = document.getElementById('qe-ID');
    if (!idEl) { showToast('No Quest loaded','error'); return; }
    const questId = parseInt(idEl.value);
    if (!questId) { showToast('ID missing','error'); return; }

    const payload = {};
    const numKeys = ['ID','QuestType','QuestLevel','MinLevel','MaxLevel','Flags','SpecialFlags','QuestSortID',
      'RewardXPDifficulty','RewardMoney','RewardBonusMoney','RewardSpell','RewardTitle','RewardTalents',
      'PortraitGiver','PortraitTurnIn','StartScript','CompleteScript',
      'PrevQuestID','NextQuestID','ExclusiveGroup','BreadcrumbForQuestId','AllowableClasses','SourceSpellID'];
    const taKeys = ['LogTitle','LogDescription','QuestDescription','AreaDescription','QuestCompletionLog'];
    for (let i=1;i<=4;i++) numKeys.push(`RequiredNpcOrGo${i}`,`RequiredNpcOrGoCount${i}`);
    for (let i=1;i<=4;i++) numKeys.push(`ObjectiveText${i}`);
    for (let i=1;i<=6;i++) numKeys.push(`RequiredItemId${i}`,`RequiredItemCount${i}`);
    for (let i=1;i<=4;i++) numKeys.push(`RewardItemId${i}`,`RewardItemCount${i}`);
    for (let i=1;i<=6;i++) numKeys.push(`RewardChoiceItemId${i}`,`RewardChoiceItemCount${i}`);
    for (let i=1;i<=5;i++) numKeys.push(`RewardFactionId${i}`,`RewardFactionValue${i}`);

    numKeys.forEach(k => { const el=document.getElementById('qe-'+k); if(el) payload[k]= el.type==='text'? el.value : (parseFloat(el.value)||0); });
    taKeys.forEach(k => { const el=document.getElementById('qe-'+k); if(el) payload[k]=el.value; });
    payload.ID = questId;

    try {
      const r = await fetch(`${API}/quest/save`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      questDirty = false;
      document.getElementById('quest-dirty').style.display = 'none';
      document.getElementById('quest-entry-badge').textContent = `Quest #${questId} — ${payload.LogTitle||''}`;
      showToast(`Quest #${questId} ${d.data.action==='inserted'?'created':'saved'} ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteQuest() {
    const id = questData.ID;
    if (!id) { showToast('No Quest loaded','error'); return; }
    if (!confirm(`Quest #${id} really delete?`)) return;
    try {
      const r = await fetch(`${API}/quest/${id}`, {method:'DELETE'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      document.getElementById('quest-editor-form').innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0">Quest deleted.</p>';
      document.getElementById('quest-entry-badge').textContent = 'No Quest loaded';
      questData = {};
      showToast(`Quest #${id} deleted`);
    } catch(e) { showToast('Server offline','error'); }
  }

