/* smartai-editor.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  const SAI_EVENT_TYPES = {0:'IC_TIMER_IN_COMBAT',1:'HEALTH_PCT',2:'MANA_PCT',3:'AGGRO',4:'KILL',5:'DEATH',6:'EVADE',7:'SPELLHIT',8:'RANGE',9:'OOC_TIMER',10:'HP_PCT_TARGET',11:'FRIENDLY_HP',12:'FRIENDLY_IS_CC',13:'FRIENDLY_MISSING_BUFF',14:'SUMMONED_UNIT',15:'ACCEPT_QUEST',16:'REWARD_QUEST',17:'REACH_WP',18:'RANGE_CHECK',19:'DAMAGED',20:'DAMAGED_TARGET',21:'MOVEMENTINFORM',22:'SUMMON_DESPAWNED',23:'WAYPOINT_STARTED',24:'WAYPOINT_REACHED',25:'WAYPOINT_PAUSED',26:'WAYPOINT_RESUMED',27:'WAYPOINT_STOPPED',28:'WAYPOINT_ENDED',29:'TIMER_OOC',30:'ENTER_LOS',31:'LEAVE_LOS',32:'START_ESCORTQUEST',33:'ESCORT_PAUSED',34:'RESPAWN',35:'TARGET_HP',36:'TARGET_CASTING',37:'FRIENDLY_HEALTH',38:'OC_TIMER_REPEAT',39:'TEXT_OVER',40:'RECEIVE_HEAL',41:'JUST_SUMMONED',42:'WAYPOINT_DATA_REACHED',43:'INSTANCE_STATE',44:'AREA_CAST',45:'SPELLHIT_TARGET',46:'RANGE2',47:'COUNTER_SET',48:'SCENE_START',49:'SCENE_TRIGGER',50:'SCENE_CANCEL',51:'SCENE_COMPLETE',52:'SUMMONED_UNIT_DIES',53:'ON_SPELL_CLICK',54:'FRIENDLY_HEALTH_PCT',55:'DISTANCE_CREATURE',56:'DISTANCE_PLAYER',57:'MAP_OBJECT_STATE',58:'MISSED_ATTACKS',59:'RECEIVE_EMOTE',73:'UPDATE',74:'RESET',75:'JUST_CREATED',77:'GOSSIP_SELECT',79:'GOSSIP_HELLO'};
  const SAI_ACTION_TYPES = {0:'NONE',1:'TALK',2:'SET_FACTION',3:'MORPH_TO',4:'SOUND',5:'PLAY_EMOTE',6:'FAIL_QUEST',7:'OFFER_QUEST',8:'SET_REACT_STATE',9:'ACTIVATE_GOBJECT',10:'RANDOM_EMOTE',11:'CAST',12:'SUMMON_CREATURE',13:'THREAT_SINGLE_PCT',14:'THREAT_ALL_PCT',15:'CALL_AREAEXPLOREDOREVENTHAPPENS',16:'SET_INGAME_PHASE_GROUP',17:'SET_ACCESS',18:'SET_ACTIVE',19:'ATTACK_START',20:'SUMMON_GO',21:'KILL_UNIT',22:'ACTIVATE_TAXI',23:'WP_START',24:'WP_PAUSE',25:'WP_STOP',26:'ADD_ITEM',27:'SET_RUN',28:'SET_DISABLE_GRAVITY',29:'TELEPORT',30:'SET_COUNTER',31:'STORE_TARGET_LIST',32:'WP_RESUME',33:'CLOSE_GOSSIP',34:'TRIGGER_TIMED_EVENT',35:'REMOVE_TIMED_EVENT',36:'ADD_AURA',37:'OVERRIDE_SCRIPT_BASE_OBJECT',38:'RESET_SCRIPT_BASE_OBJECT',39:'CALL_SCRIPT_RESET',40:'SET_RANGED_MOVEMENT_DIST',41:'SET_UNIT_FIELD_BYTES_1',42:'REMOVE_UNIT_FIELD_BYTES_1',43:'INTERRUPT_SPELL',44:'SEND_GO_CUSTOM_ANIM',45:'SET_DYNAMIC_FLAG',46:'ADD_DYNAMIC_FLAG',47:'REMOVE_DYNAMIC_FLAG',48:'JUMP_TO_POS',49:'SEND_GOSSIP_MENU',50:'GO_SET_LOOT_STATE',51:'SEND_TARGET_RANDOM_SOUND',52:'SET_MOVEMENT_SPEED',53:'SET_SWIM_SPEED',54:'TELEPORT_PLAYER',55:'TRIGGER_RANDOM_TIMED_EVENT',56:'REMOVE_ALL_AURAS',57:'CAST_CUSTOM',58:'PLAYMOVIE',59:'MOVE_TO_POS',60:'ENABLE_TEMP_GOBJ',61:'EQUIP',62:'CLOSE_MENU',63:'TEXT_EMOTE',64:'SEND_GLOBAL_SOUND',65:'SET_CAN_FLY',66:'REMOVE_AURAS_BY_TYPE',67:'SET_SIGHT_DIST',68:'FLEE',69:'ADD_THREAT',70:'LOAD_EQUIPMENT',71:'TRIGGER_RANDOM_TIMED_EVENT2',72:'PURCHASE_ITEM',73:'SET_MOVEMENT_INVERT',74:'SEND_CHAT_MESSAGE',75:'PLAY_ANIMKIT',76:'SCENE_PLAY',77:'SCENE_CANCEL',78:'SPAWN_SPAWNGROUP',79:'DESPAWN_SPAWNGROUP',80:'RESPAWN_BY_SPAWNID',81:'INVOKER_CAST',82:'GAME_EVENT_STOP',83:'GAME_EVENT_START',84:'START_CLOSEST_WAYPOINT',85:'MOVE_OFFSET',86:'RANDOM_SOUND',87:'CORPSE_DELAY',88:'DISABLE_EVADE',89:'GO_SET_GO_STATE',90:'SET_CAN_BE_SEEN',91:'WP_FLEE_ON_HP_PCT',92:'MOVE_FORWARD',93:'SET_VISIBILITY_DIST',94:'SET_HOVER',95:'EVADE',96:'FLEE_FOR_ASSIST',97:'CALL_GROUPEVENTHAPPENS',98:'COMBINED_CONDITION',99:'SET_ATTACK_DIST',100:'SET_UNIT_FLAG',101:'REMOVE_UNIT_FLAG',102:'PLAYTEXTFILE',103:'JUMP_TO_POS_NO_GRAVITY',104:'SEND_CHAT_MESSAGE2',105:'SET_FIND_TARGET_FIELD',106:'SEND_CHAT_CRIT',107:'SET_ORIENTATION',108:'SENDDIRECTION_TELE',109:'MOVE_TO_TARGET',110:'SET_ROOTED',111:'PREVENT_DURABILITY_LOSS',112:'APPLY_MOVEMENT_GENERATOR',113:'CREATE_CONVERSATION',114:'SEND_CHAT_MESSAGE3'};
  const SAI_TARGET_TYPES = {0:'NONE',1:'SELF',2:'VICTIM',3:'HOSTILE_SECOND_AGGRO',4:'HOSTILE_LAST_AGGRO',5:'HOSTILE_RANDOM',6:'HOSTILE_RANDOM_NOT_TOP',7:'ACTION_INVOKER',8:'POSITION',9:'CREATURE_RANGE',10:'CREATURE_GUID',11:'CREATURE_DISTANCE',12:'STORED',13:'CLOSEST_CREATURE',14:'CLOSEST_PLAYER',15:'ACTION_INVOKER_VEHICLE',16:'OWNER_OR_SUMMONER',17:'THREAT_LIST',18:'CLOSEST_ENEMY',19:'CLOSEST_FRIENDLY',20:'LOOT_RECIPIENTS',21:'FARTHEST',22:'VEHICLE_PASSENGER',23:'PLAYER_RANGE',24:'PLAYER_DISTANCE',25:'PLAYER_GUID',26:'STORED_2'};
  const SAI_SOURCE_TYPES = {0:'Creature Template',1:'Creature GUID (Spawn)',2:'GameObject Template',3:'GameObject GUID',9:'Areatrigger',10:'ScriptEvent'};

  let saiEntry = null;
  let saiSourceType = 0;
  let saiData = [];

  async function loadSmartAI() {
    const entryInput = document.getElementById('sai-entry-input');
    const srcSelect  = document.getElementById('sai-source-select');
    if (!entryInput) return;
    saiEntry      = parseInt(entryInput.value);
    saiSourceType = parseInt(srcSelect?.value||0);
    if (!saiEntry) { showToast('Enter Entry/GUID','error'); return; }
    const box = document.getElementById('sai-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0">Loading SmartAI…</div>';
    try {
      const r = await fetch(`${API}/smartai/${saiEntry}?source_type=${saiSourceType}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      saiData = d.data || [];
      renderSAITable();
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderSAITable() {
    const box = document.getElementById('sai-content');
    const srcLabel = SAI_SOURCE_TYPES[saiSourceType] || `Source ${saiSourceType}`;
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:0.82rem;color:var(--muted)">${srcLabel} <span style="color:var(--gold)">#${saiEntry}</span> · ${saiData.length} Events</div>
      <div style="display:flex;gap:6px">
        <button class="e-btn e-btn-small e-btn-danger" onclick="deleteAllSAI()" ${!saiData.length?'disabled':''}>🗑 Delete all</button>
        <button class="e-btn e-btn-small e-btn-gold" onclick="addSAIRow()">＋ Event</button>
      </div>
    </div>`;
    if (saiData.length) {
      html += `<div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;min-width:700px">
          <thead><tr style="color:var(--muted);font-size:0.7rem;border-bottom:1px solid var(--border)">
            <th style="padding:4px 6px;text-align:center">ID</th>
            <th style="padding:4px 6px;text-align:center">Link</th>
            <th style="padding:4px 8px;text-align:left">Event Type</th>
            <th style="padding:4px 6px;text-align:center">Chance</th>
            <th style="padding:4px 6px;text-align:center">P1–P4</th>
            <th style="padding:4px 8px;text-align:left">Action Type</th>
            <th style="padding:4px 6px;text-align:center">A1–A3</th>
            <th style="padding:4px 8px;text-align:left">Target</th>
            <th style="padding:4px 8px;text-align:left">Comment</th>
            <th style="padding:4px 6px;text-align:center">Akt.</th>
          </tr></thead><tbody>`;
      for (const s of saiData) {
        const evLabel  = SAI_EVENT_TYPES[s.event_type]  || `Ev ${s.event_type}`;
        const actLabel = SAI_ACTION_TYPES[s.action_type] || `Act ${s.action_type}`;
        const tgtLabel = SAI_TARGET_TYPES[s.target_type] || `Tgt ${s.target_type}`;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)" id="sai-row-${s.id}">
          <td style="padding:4px 6px;text-align:center;color:var(--muted)">${s.id}</td>
          <td style="padding:4px 6px;text-align:center;color:var(--muted)">${s.link||0}</td>
          <td style="padding:4px 8px;color:var(--cyan);white-space:nowrap">${evLabel}
            <div style="color:var(--muted);font-size:0.68rem">(${s.event_type})</div>
          </td>
          <td style="padding:4px 6px;text-align:center;color:var(--text)">${s.event_chance}%</td>
          <td style="padding:4px 6px;text-align:center;color:var(--muted);font-size:0.72rem">${s.event_param1}|${s.event_param2}|${s.event_param3}|${s.event_param4}</td>
          <td style="padding:4px 8px;color:var(--orange);white-space:nowrap">${actLabel}
            <div style="color:var(--muted);font-size:0.68rem">(${s.action_type})</div>
          </td>
          <td style="padding:4px 6px;text-align:center;color:var(--muted);font-size:0.72rem">${s.action_param1}|${s.action_param2}|${s.action_param3}</td>
          <td style="padding:4px 8px;color:var(--green);white-space:nowrap;font-size:0.75rem">${tgtLabel}</td>
          <td style="padding:4px 8px;color:var(--muted);font-size:0.75rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.comment||''}">${s.comment||'—'}</td>
          <td style="padding:4px 6px;text-align:center;white-space:nowrap">
            <button class="e-btn e-btn-small" onclick="editSAIRow(${s.id})" style="margin-right:3px">✏️</button>
            <button class="e-btn e-btn-small e-btn-danger" onclick="deleteSAIRow(${s.id})">🗑</button>
          </td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    } else {
      html += `<div style="color:var(--muted);font-size:0.82rem;margin-bottom:14px">No SmartAI entries for this entry.</div>`;
    }
    box.innerHTML = html;
  }

  function buildSAIForm(existing) {
    const ev  = existing || {};
    const makeSelect = (id, map, val, style='') =>
      `<select id="${id}" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.78rem;padding:4px 6px;${style}">
        ${Object.entries(map).map(([v,l])=>`<option value="${v}"${parseInt(v)===(val??'')?' selected':''}>${v}: ${l}</option>`).join('')}
      </select>`;
    const numInput = (id, val, ph='', w='70px') =>
      `<input id="${id}" type="number" value="${val??0}" placeholder="${ph}" style="width:${w};background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.78rem;padding:4px 6px">`;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div><div style="font-size:0.7rem;color:var(--muted);margin-bottom:4px">ID</div>${numInput('sai-f-id',ev.id??saiData.length,'ID','100%')}</div>
        <div><div style="font-size:0.7rem;color:var(--muted);margin-bottom:4px">Link</div>${numInput('sai-f-link',ev.link??0,'','100%')}</div>
        <div><div style="font-size:0.7rem;color:var(--muted);margin-bottom:4px">Chance %</div>${numInput('sai-f-chance',ev.event_chance??100,'','100%')}</div>
      </div>
      <div style="margin-bottom:10px"><div style="font-size:0.7rem;color:var(--cyan);margin-bottom:4px;text-transform:uppercase">Event</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${makeSelect('sai-f-event', SAI_EVENT_TYPES, ev.event_type??0,'flex:1;min-width:200px')}
          ${numInput('sai-f-ep1',ev.event_param1??0,'P1')} ${numInput('sai-f-ep2',ev.event_param2??0,'P2')}
          ${numInput('sai-f-ep3',ev.event_param3??0,'P3')} ${numInput('sai-f-ep4',ev.event_param4??0,'P4')}
        </div>
      </div>
      <div style="margin-bottom:10px"><div style="font-size:0.7rem;color:var(--orange);margin-bottom:4px;text-transform:uppercase">Action</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${makeSelect('sai-f-action', SAI_ACTION_TYPES, ev.action_type??0,'flex:1;min-width:200px')}
          ${numInput('sai-f-ap1',ev.action_param1??0,'P1')} ${numInput('sai-f-ap2',ev.action_param2??0,'P2')}
          ${numInput('sai-f-ap3',ev.action_param3??0,'P3')} ${numInput('sai-f-ap4',ev.action_param4??0,'P4')}
          ${numInput('sai-f-ap5',ev.action_param5??0,'P5')} ${numInput('sai-f-ap6',ev.action_param6??0,'P6')}
        </div>
      </div>
      <div style="margin-bottom:10px"><div style="font-size:0.7rem;color:var(--green);margin-bottom:4px;text-transform:uppercase">Target</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${makeSelect('sai-f-target', SAI_TARGET_TYPES, ev.target_type??0,'flex:1;min-width:180px')}
          ${numInput('sai-f-tp1',ev.target_param1??0,'P1')} ${numInput('sai-f-tp2',ev.target_param2??0,'P2')}
          ${numInput('sai-f-tp3',ev.target_param3??0,'P3')}
          ${numInput('sai-f-tx',ev.target_x??0,'X')} ${numInput('sai-f-ty',ev.target_y??0,'Y')} ${numInput('sai-f-tz',ev.target_z??0,'Z')}
        </div>
      </div>
      <div><div style="font-size:0.7rem;color:var(--muted);margin-bottom:4px">Comment</div>
        <input id="sai-f-comment" value="${(ev.comment||'').replace(/"/g,'&quot;')}" placeholder="Description this Events…"
          style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px;box-sizing:border-box">
      </div>`;
  }

  function readSAIForm() {
    const g = id => document.getElementById(id);
    return {
      id: parseInt(g('sai-f-id')?.value||0),
      link: parseInt(g('sai-f-link')?.value||0),
      event_type: parseInt(g('sai-f-event')?.value||0),
      event_chance: parseInt(g('sai-f-chance')?.value||100),
      event_flags: 0,
      event_param1: parseInt(g('sai-f-ep1')?.value||0), event_param2: parseInt(g('sai-f-ep2')?.value||0),
      event_param3: parseInt(g('sai-f-ep3')?.value||0), event_param4: parseInt(g('sai-f-ep4')?.value||0),
      action_type: parseInt(g('sai-f-action')?.value||0),
      action_param1: parseInt(g('sai-f-ap1')?.value||0), action_param2: parseInt(g('sai-f-ap2')?.value||0),
      action_param3: parseInt(g('sai-f-ap3')?.value||0), action_param4: parseInt(g('sai-f-ap4')?.value||0),
      action_param5: parseInt(g('sai-f-ap5')?.value||0), action_param6: parseInt(g('sai-f-ap6')?.value||0),
      target_type: parseInt(g('sai-f-target')?.value||0),
      target_param1: parseInt(g('sai-f-tp1')?.value||0), target_param2: parseInt(g('sai-f-tp2')?.value||0),
      target_param3: parseInt(g('sai-f-tp3')?.value||0),
      target_x: parseFloat(g('sai-f-tx')?.value||0), target_y: parseFloat(g('sai-f-ty')?.value||0),
      target_z: parseFloat(g('sai-f-tz')?.value||0), target_o: 0,
      comment: g('sai-f-comment')?.value || '',
    };
  }

  function showSAIModal(title, existing, onSave) {
    document.getElementById('sai-form-modal')?.remove();
    const modal = `<div id="sai-form-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:100%;max-width:800px;max-height:90vh;overflow-y:auto;padding:24px;position:relative">
        <button onclick="document.getElementById('sai-form-modal').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="font-size:1rem;font-weight:600;color:var(--gold);margin-bottom:16px">🤖 ${title}</div>
        ${buildSAIForm(existing)}
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="e-btn" style="background:rgba(100,200,100,.12);border-color:var(--green)" onclick="${onSave}">💾 Save</button>
          <button class="e-btn" onclick="document.getElementById('sai-form-modal').remove()">Cancel</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modal);
  }

  function addSAIRow() {
    showSAIModal('New SmartAI Event', null, 'saveSAINew()');
  }

  function editSAIRow(id) {
    const ev = saiData.find(s => s.id === id);
    if (!ev) return;
    showSAIModal(`Edit event #${id}`, ev, `saveSAIEdit(${id})`);
  }

  async function saveSAINew() {
    const payload = readSAIForm();
    payload.entryorguid = saiEntry;
    payload.source_type = saiSourceType;
    try {
      const r = await fetch(`${API}/smartai/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('SmartAI Event saved ✓');
      document.getElementById('sai-form-modal')?.remove();
      loadSmartAI();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function saveSAIEdit(id) {
    const payload = readSAIForm();
    payload.entryorguid = saiEntry;
    payload.source_type = saiSourceType;
    payload.id = id;
    try {
      const r = await fetch(`${API}/smartai/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Event refreshed ✓');
      document.getElementById('sai-form-modal')?.remove();
      loadSmartAI();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteSAIRow(id) {
    if (!confirm(`SmartAI Event #${id} delete?`)) return;
    try {
      const r = await fetch(`${API}/smartai/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryorguid:saiEntry,source_type:saiSourceType,id})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Event deleted');
      loadSmartAI();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteAllSAI() {
    if (!confirm(`ALL SmartAI events for entry ${saiEntry} delete?`)) return;
    try {
      const r = await fetch(`${API}/smartai/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryorguid:saiEntry,source_type:saiSourceType})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${d.data.rows} Events deleted`);
      loadSmartAI();
    } catch(e) { showToast('Server offline','error'); }
  }

