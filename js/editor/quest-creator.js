/* quest-creator.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let _qcCurrentId = null;
  let _qcEnums = null;
  let _qcTemplates = null;

  function _qcFields() {
    const e = _qcEnums || {};
    const npcSlot = (n) => ([
      {n:`RequiredNpcOrGo${n}`,      l:`Required NPC/GO ${n}`, t:'npc_or_go', d:0, h:'Positiv = creature_template.entry, Negativ = gameobject_template.entry. 🔍 Pick NPC unten.'},
      {n:`RequiredNpcOrGoCount${n}`, l:`Count ${n}`,          t:'number', d:0},
    ]);
    const itemReqSlot = (n) => ([
      {n:`RequiredItemId${n}`,    l:`Required Item ${n}`, t:'item_pick', d:0},
      {n:`RequiredItemCount${n}`, l:`Count ${n}`,        t:'number', d:0},
    ]);
    const rewardItemSlot = (n) => ([
      {n:`RewardItem${n}`,   l:`Reward Item ${n}`,    t:'item_pick', d:0},
      {n:`RewardAmount${n}`, l:`Reward Count ${n}`,  t:'number', d:0},
    ]);
    const choiceItemSlot = (n) => ([
      {n:`RewardChoiceItemID${n}`,       l:`Choice Item ${n}`,   t:'item_pick', d:0},
      {n:`RewardChoiceItemQuantity${n}`, l:`Choice Count ${n}`, t:'number', d:0},
    ]);

    return [
      {group:'Basics', fields:[
        {n:'LogTitle',         l:'Quest Name',           t:'text'},
        {n:'QuestDescription', l:'Quest Description',    t:'textarea'},
        {n:'LogDescription',   l:'Log Description',      t:'textarea', h:'Text in the quest log overview'},
        {n:'AreaDescription',  l:'Area Description',     t:'textarea'},
        {n:'QuestCompletionLog', l:'Completion Log',     t:'textarea'},
        {n:'QuestType',        l:'Quest Type',           t:'enum', e:e.questType, d:2},
        {n:'QuestInfoID',      l:'Quest Info ID',        t:'enum', e:e.questInfoID, d:0},
        {n:'QuestSortID',      l:'Quest Sort',           t:'enum', e:e.questSortID, d:0},
      ]},
      {group:'Requirements', fields:[
        {n:'MinLevel',           l:'Min Level',         t:'number', d:1},
        {n:'QuestLevel',         l:'Quest Level (-1 = Player Lvl)', t:'number', d:1},
        {n:'MaxLevel',           l:'Max Level (0=∞)',   t:'number', d:0, h:'From quest_template_addon'},
        {n:'AllowableRaces',     l:'Allowable Races',   t:'bitmask', e:e.allowableRaces, d:0, h:'0 = All'},
        {n:'AllowableClasses',   l:'Allowable Classes', t:'bitmask', e:e.allowableClasses, d:0, h:'0 = All'},
        {n:'SuggestedGroupNum',  l:'Suggested Group Size', t:'number', d:0},
        {n:'TimeAllowed',        l:'Time Limit (s, 0=∞)', t:'number', d:0},
      ]},
      {group:'Flags', fields:[
        {n:'Flags',        l:'Quest Flags',          t:'bitmask', e:e.questFlags, d:0},
        {n:'SpecialFlags', l:'Special Flags (Addon)', t:'bitmask', e:e.specialFlags, d:0},
      ]},
      {group:'Quest-Kette', fields:[
        {n:'PrevQuestID',       l:'Predecessor Quest ID', t:'number', d:0},
        {n:'NextQuestID',       l:'Successor Quest ID', t:'number', d:0},
        {n:'ExclusiveGroup',    l:'Exclusive Group',    t:'number', d:0},
        {n:'BreadcrumbForQuestId', l:'Breadcrumb for Quest', t:'number', d:0},
        {n:'RewardNextQuest',   l:'Auto-Reward Next Quest', t:'number', d:0},
      ]},
      {group:'Objective Texts', fields:[
        {n:'ObjectiveText1', l:'Objective 1 Text', t:'text'},
        {n:'ObjectiveText2', l:'Objective 2 Text', t:'text'},
        {n:'ObjectiveText3', l:'Objective 3 Text', t:'text'},
        {n:'ObjectiveText4', l:'Objective 4 Text', t:'text'},
      ]},
      {group:'Required NPC/GameObject (Kill / Talk / Interact)', fields:
        [...npcSlot(1), ...npcSlot(2), ...npcSlot(3), ...npcSlot(4)]
      },
      {group:'Required Items (Collect)', fields:
        [...itemReqSlot(1), ...itemReqSlot(2), ...itemReqSlot(3),
         ...itemReqSlot(4), ...itemReqSlot(5), ...itemReqSlot(6)]
      },
      {group:'Reward — Money / XP / Honor', fields:[
        {n:'RewardMoney',           l:'Money (copper)',         t:'number', d:0, h:'10000 = 1 Gold'},
        {n:'RewardXPDifficulty',    l:'XP-Difficulty',         t:'enum', e:e.rewardXpDifficulty, d:0},
        {n:'RewardHonor',           l:'Honor Points',          t:'number', d:0},
        {n:'RewardArenaPoints',     l:'Arena Points',          t:'number', d:0},
        {n:'RewardTalents',         l:'Reward Talents',        t:'number', d:0},
        {n:'RewardTitle',           l:'Reward Title ID',       t:'number', d:0},
        {n:'RewardSpell',           l:'Reward Spell (learn)', t:'number', d:0},
        {n:'RewardDisplaySpell',    l:'Reward Display Spell',  t:'number', d:0},
        {n:'StartItem',             l:'Start Item (given on accept)', t:'item_pick', d:0},
      ]},
      {group:'Reward — Items (mandatory)', fields:
        [...rewardItemSlot(1), ...rewardItemSlot(2), ...rewardItemSlot(3), ...rewardItemSlot(4)]
      },
      {group:'Reward — Choice Items (player chooses 1)', fields:
        [...choiceItemSlot(1), ...choiceItemSlot(2), ...choiceItemSlot(3),
         ...choiceItemSlot(4), ...choiceItemSlot(5), ...choiceItemSlot(6)]
      },
      {group:'POI (Quest Marker on Map)', fields:[
        {n:'POIContinent', l:'POI Continent', t:'enum', e:e.continent, d:0},
        {n:'POIx',         l:'POI X',         t:'float', d:0},
        {n:'POIy',         l:'POI Y',         t:'float', d:0},
        {n:'POIPriority',  l:'POI Priority',  t:'number', d:0},
      ]},
      {group:'Reputation-Reward', fields:[
        {n:'RewardFactionID1', l:'Faction 1',  t:'number', d:0},
        {n:'RewardFactionValue1', l:'Value 1', t:'number', d:0},
        {n:'RewardFactionID2', l:'Faction 2',  t:'number', d:0},
        {n:'RewardFactionValue2', l:'Value 2', t:'number', d:0},
      ]},
      {group:'Reputation-Anforderung', fields:[
        {n:'RequiredMinRepFaction', l:'Min Rep Faction',  t:'number', d:0, h:'quest_template_addon'},
        {n:'RequiredMinRepValue',   l:'Min Rep Value',    t:'number', d:0},
        {n:'RequiredMaxRepFaction', l:'Max Rep Faction',  t:'number', d:0},
        {n:'RequiredMaxRepValue',   l:'Max Rep Value',    t:'number', d:0},
      ]},
      {group:'Other', fields:[
        {n:'SourceSpellID',         l:'Source Spell ID',       t:'spellid', d:0},
        {n:'RequiredSkillID',       l:'Required Skill ID',     t:'number', d:0},
        {n:'RequiredSkillPoints',   l:'Required Skill Points', t:'number', d:0},
        {n:'RewardMailTemplateID',  l:'Mail Template ID',      t:'number', d:0},
        {n:'RewardMailDelay',       l:'Mail Delay (s)',        t:'number', d:0},
        {n:'ProvidedItemCount',     l:'Provided Item Count',   t:'number', d:0},
        {n:'RequiredPlayerKills',   l:'Required Player Kills', t:'number', d:0},
      ]},
    ];
  }

  async function openQuestCreateMode() {
    document.getElementById('quest-editor-screen-landing').style.display = 'none';
    document.getElementById('quest-editor-screen-editor').style.display  = 'none';
    document.getElementById('quest-editor-screen-create').style.display  = '';
    await qcLoadEnums();
    await qcLoadTemplates();
    qcNewQuest();
    qcLoadList();
  }

  function qcBack() {
    document.getElementById('quest-editor-screen-create').style.display = 'none';
    document.getElementById('quest-editor-screen-landing').style.display = '';
  }

  async function qcLoadEnums() {
    if (_qcEnums) return;
    try {
      const r = await fetch(`${API}/quest-create/enums`);
      const d = await r.json();
      if (d.ok) _qcEnums = d.data;
    } catch(e) {}
  }

  async function qcLoadTemplates() {
    if (_qcTemplates) return;
    try {
      const r = await fetch(`${API}/quest-create/templates`);
      const d = await r.json();
      if (d.ok) _qcTemplates = d.data;
    } catch(e) {}
  }

  async function qcLoadList() {
    const box = document.getElementById('qc-list');
    box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">Loading…</div>';
    try {
      const r = await fetch(`${API}/quest-create/list`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      if (!rows.length) {
        box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">No custom quests yet.</div>';
        return;
      }
      box.innerHTML = rows.map(q => {
        const safeTitle = (q.title||'?').replace(/'/g,"\\'").replace(/</g,'&lt;');
        return `<div style="padding:7px 9px;border-bottom:1px solid var(--border);font-size:0.8rem;background:${_qcCurrentId===q.ID?'rgba(30,255,0,.08)':''};display:flex;align-items:center;gap:6px">
          <div onclick="qcLoadQuest(${q.ID})" style="flex:1;cursor:pointer;min-width:0">
            <div style="color:#ffd700;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeTitle}</div>
            <div style="color:var(--muted);font-size:0.7rem">#${q.ID} · L${q.QuestLevel||q.MinLevel}</div>
          </div>
          <button onclick="qcDeleteFromList(${q.ID},'${safeTitle}')" title="Delete"
            style="background:none;border:1px solid var(--red);color:var(--red);border-radius:4px;padding:3px 6px;cursor:pointer;font-size:0.78rem">🗑</button>
        </div>`;
      }).join('');
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function qcNewQuest() {
    _qcCurrentId = null;
    document.getElementById('qc-status').textContent = '';
    try {
      const r = await fetch(`${API}/quest-create/next-id`);
      const d = await r.json();
      if (d.ok) {
        _qcCurrentId = d.data.next_id;
        document.getElementById('qc-entry-badge').textContent = `New ID: #${_qcCurrentId} (auto)`;
      }
    } catch(e) {}
    qcRenderForm({});
  }

  async function qcLoadQuest(qid) {
    _qcCurrentId = qid;
    document.getElementById('qc-entry-badge').textContent = `Edit: #${qid}`;
    document.getElementById('qc-status').textContent = '';
    try {
      const r = await fetch(`${API}/quest-create/load/${qid}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      qcRenderForm(d.data || {});
    } catch(e) { showToast('Server offline','error'); }
    qcLoadList();
  }

  function _qcRenderTemplatePicker() {
    if (!_qcTemplates || !_qcTemplates.length) return '';
    let opts = `<option value="">— Choose quest template (overrides fields) —</option>`;
    for (const t of _qcTemplates) {
      opts += `<option value="${t.key}">${_icEsc(t.label)}</option>`;
    }
    return `<div style="margin-bottom:10px">
      <label style="font-size:0.7rem;color:#1eff00;text-transform:uppercase;letter-spacing:.04em">✨ Template</label>
      <select onchange="qcApplyTemplate(this.value);this.value=''" style="${_icInputStyle()};border-color:#1eff00">${opts}</select>
    </div>`;
  }

  function qcApplyTemplate(key) {
    if (!key) return;
    const t = (_qcTemplates || []).find(x => x.key === key);
    if (!t) return;
    for (const [k, v] of Object.entries(t.fields || {})) {
      const wrap = document.getElementById(`ic-${k}-checks`);
      if (wrap) {
        const allEl = document.getElementById(`ic-${k}-all`);
        if (allEl) { allEl.checked = false; _icToggleBitmaskAll(k, false); }
        wrap.querySelectorAll('input[data-bit]').forEach(cb => {
          const bit = parseInt(cb.dataset.bit);
          cb.checked = (parseInt(v) & bit) === bit;
        });
        continue;
      }
      const el = document.getElementById(`qc-${k}`);
      if (!el) continue;
      if (el.tagName === 'SELECT') {
        let found = false;
        for (const o of el.options) {
          if (String(o.value) === String(v)) { el.value = o.value; found = true; break; }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = String(v); opt.textContent = `${v} — (Template)`; opt.selected = true;
          el.appendChild(opt);
        }
      } else {
        el.value = v;
      }
    }
    showToast(`Template applied: ${t.label}`);
  }

  function qcRenderForm(data) {
    const box = document.getElementById('qc-form');
    let html = _qcRenderTemplatePicker();
    for (const grp of _qcFields()) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="color:var(--gold);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${grp.group}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px">`;
      for (const f of grp.fields) {
        const v = data[f.n] != null ? data[f.n] : (f.d != null ? f.d : '');
        const hint = f.h ? `<div style="font-size:0.62rem;color:var(--muted);margin-top:2px">${f.h}</div>` : '';
        let inputHtml = '';
        if (f.t === 'npc_or_go') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="qc-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="qcPickNpc('${f.n}')">🔍 Pick NPC</button>
          </div>`;
        } else if (f.t === 'item_pick') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="qc-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="qcPickItem('${f.n}')">🔍 Pick Item</button>
          </div>`;
        } else if (f.t === 'spellid') {
          inputHtml = `<div style="display:flex;gap:6px">
            <input id="qc-${f.n}" value="${_icEsc(v)}" type="number" style="flex:1;${_icInputStyle()}">
            <button class="e-btn e-btn-small" onclick="qcPickSpell('${f.n}')">🔍 Pick Spell</button>
          </div>`;
        } else if (f.t === 'enum') {
          inputHtml = _icRenderEnum(`qc-temp-${f.n}`, f.e || {}, v).replace(`id="ic-qc-temp-${f.n}"`, `id="qc-${f.n}"`);
        } else if (f.t === 'bitmask') {
          inputHtml = _icRenderBitmask(f.n, f.e || {}, v);
        } else if (f.t === 'textarea') {
          inputHtml = `<textarea id="qc-${f.n}" rows="3" style="${_icInputStyle()};resize:vertical;font-family:'Share Tech Mono',monospace">${_icEsc(v)}</textarea>`;
        } else {
          const step = (f.t === 'float') ? ' step="0.01"' : '';
          const typ = (f.t === 'number' || f.t === 'float') ? 'number' : 'text';
          inputHtml = `<input id="qc-${f.n}" value="${_icEsc(v)}" type="${typ}"${step} style="${_icInputStyle()}">`;
        }
        html += `<div>
          <label style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${f.l}</label>
          ${inputHtml}${hint}
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<div style="display:flex;gap:8px;margin-top:14px">
      <button class="e-btn e-btn-green" onclick="qcSave()">💾 Save → quest_template</button>
      ${_qcCurrentId ? `<button class="e-btn e-btn-red" onclick="qcDelete()">🗑 Delete</button>` : ''}
    </div>`;
    box.innerHTML = html;
  }

  function qcPickNpc(fieldName) {
    openCreatureSearchModal('🔍 Pick an NPC (creature)', (entry, name) => {
      const el = document.getElementById(`qc-${fieldName}`);
      if (el) el.value = entry;   // positive = creature; type a negative id manually for a gameobject
      showToast(`NPC #${entry} "${name}" applied`);
    });
  }

  function qcPickItem(fieldName) {
    openItemSearchModal('🔍 Pick an item', (entry, name) => {
      const el = document.getElementById(`qc-${fieldName}`);
      if (el) el.value = entry;
      showToast(`Item #${entry} "${name}" applied`);
    });
  }

  function qcPickSpell(fieldName) {
    openSpellSearchModal('🔍 Pick a spell', (sid, name) => {
      const el = document.getElementById(`qc-${fieldName}`);
      if (el) el.value = sid;
      showToast(`Spell #${sid} "${name}" applied`);
    });
  }

  async function qcSave() {
    const payload = {ID: _qcCurrentId};
    for (const grp of _qcFields()) for (const f of grp.fields) {
      if (f.t === 'bitmask') { payload[f.n] = _icCollectBitmask(f.n); continue; }
      const el = document.getElementById(`qc-${f.n}`);
      if (!el) continue;
      let v = el.value;
      if (f.t === 'number' || f.t === 'enum' || f.t === 'item_pick' || f.t === 'spellid' || f.t === 'npc_or_go') {
        v = v === '' ? null : (parseInt(v) || 0);
      } else if (f.t === 'float') {
        v = v === '' ? null : (parseFloat(v) || 0);
      }
      payload[f.n] = v;
    }
    if (!payload.LogTitle) { showToast('Quest Name required','error'); return; }
    document.getElementById('qc-status').textContent = 'Saving…';
    try {
      const r = await fetch(`${API}/quest-create/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!d.ok) {
        document.getElementById('qc-status').textContent = '';
        showToast(d.error||'Error','error'); return;
      }
      document.getElementById('qc-status').innerHTML = `<span style="color:#1eff00">✓ Quest #${d.data.ID} saved</span>`;
      showToast(`Quest #${d.data.ID} saved ✓ (Server reload required)`);
      qcLoadList();
    } catch(e) { showToast('Server offline','error'); document.getElementById('qc-status').textContent = ''; }
  }

  async function qcDelete() {
    if (!_qcCurrentId) return;
    return qcDeleteFromList(_qcCurrentId, '');
  }

  async function qcDeleteFromList(qid, title) {
    const label = title ? `"${title}" (#${qid})` : `#${qid}`;
    if (!confirm(`Quest ${label} from quest_template + addon + offer/request remove?`)) return;
    try {
      const r = await fetch(`${API}/quest-create/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ID: qid})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Quest #${qid} removed ✓`);
      if (_qcCurrentId === qid) qcNewQuest();
      qcLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

