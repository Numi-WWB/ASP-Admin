/* npc-extras.js — extracted from ASP_Admin.html (verbatim) */
  function openNpcExtras() {
    if (!creatureData || !creatureData.entry) { showToast('No Creature loaded','error'); return; }
    showNpcExtras(creatureData.entry, creatureData.name || `#${creatureData.entry}`);
  }

  // ══════════════════════════════════════════════════════════════════════════

  let npcExtrasEntry = null;
  let npcExtrasTab   = 'vendor';

  function showNpcExtras(entry, name) {
    npcExtrasEntry = entry;
    document.getElementById('npc-extras-modal')?.remove();
    const tabs = {vendor:'🛒 Vendor',trainer:'🎓 Trainer',text:'💬 Texts',equip:'🗡️ Equip'};
    let tabHtml = Object.entries(tabs).map(([t,l]) =>
      `<button id="npc-tab-${t}" onclick="setNpcTab('${t}')"
        style="border:1px solid var(--border);border-radius:5px;padding:5px 12px;cursor:pointer;
               font-family:'Share Tech Mono',monospace;font-size:0.79rem;background:var(--bg);color:var(--muted)">${l}</button>`
    ).join('');

    const modal = `<div id="npc-extras-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:100%;max-width:700px;max-height:85vh;overflow-y:auto;padding:22px;position:relative">
        <button onclick="document.getElementById('npc-extras-modal').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="font-size:1rem;font-weight:600;color:var(--orange);margin-bottom:14px">🐉 NPC #${entry} — ${name}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px">${tabHtml}</div>
        <div id="npc-extras-content"><div style="color:var(--muted);text-align:center;padding:30px 0">Loading…</div></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modal);
    setNpcTab('vendor');
  }

  function setNpcTab(tab) {
    npcExtrasTab = tab;
    ['vendor','trainer','text','equip'].forEach(t => {
      const btn = document.getElementById(`npc-tab-${t}`);
      if (!btn) return;
      if (t === tab) { btn.style.borderColor='var(--orange)'; btn.style.color='var(--orange)'; btn.style.background='rgba(255,140,0,.12)'; }
      else           { btn.style.borderColor='var(--border)'; btn.style.color='var(--muted)';  btn.style.background='var(--bg)'; }
    });
    if (tab === 'vendor')  loadNpcVendor();
    else if (tab === 'trainer') loadNpcTrainer();
    else if (tab === 'text')    loadNpcText();
    else if (tab === 'equip')   loadNpcEquip();
  }

  async function loadNpcVendor() {
    const box = document.getElementById('npc-extras-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:0.82rem">Loading Vendor…</div>';
    try {
      const r = await fetch(`${API}/npc/vendor/${npcExtrasEntry}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      const QUAL_COL = ['var(--muted)','var(--text)','var(--green)','#0ae','var(--purple,#a335ee)','var(--orange)','var(--gold)'];
      let html = '';
      if (rows.length) {
        html += `<table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:14px">
          <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
            <th style="padding:4px 8px;text-align:left">Item</th>
            <th style="padding:4px 8px;text-align:center">ID</th>
            <th style="padding:4px 8px;text-align:center">Slot</th>
            <th style="padding:4px 8px;text-align:center">Max</th>
            <th style="padding:4px 8px;text-align:center">Action</th>
          </tr></thead><tbody>`;
        for (const v of rows) {
          const qc = QUAL_COL[v.Quality] || QUAL_COL[1];
          html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
            <td style="padding:4px 8px;color:${qc}">${v.name||'?'}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--muted)">${v.item}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--muted)">${v.slot}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--muted)">${v.maxcount}</td>
            <td style="padding:4px 8px;text-align:center">
              <button class="e-btn e-btn-small e-btn-danger" onclick="deleteVendorItem(${v.item})">🗑</button>
            </td>
          </tr>`;
        }
        html += '</tbody></table>';
      } else {
        html += `<div style="color:var(--muted);font-size:0.82rem;margin-bottom:12px">No vendor items.</div>`;
      }
      html += `<div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Add item</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="v-item-id" type="number" placeholder="Item ID"
            style="width:110px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <input id="v-slot" type="number" placeholder="Slot (0=auto)" value="0"
            style="width:100px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <input id="v-maxcount" type="number" placeholder="Max (0=∞)" value="0"
            style="width:100px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <button class="e-btn" onclick="addVendorItem()">＋ Add</button>
        </div>
      </div>`;
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function addVendorItem() {
    const item = parseInt(document.getElementById('v-item-id')?.value||0);
    const slot = parseInt(document.getElementById('v-slot')?.value||0);
    const maxcount = parseInt(document.getElementById('v-maxcount')?.value||0);
    if (!item) { showToast('Enter Item ID','error'); return; }
    try {
      const r = await fetch(`${API}/npc/vendor/add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:npcExtrasEntry,item,slot,maxcount,incrtime:0,ExtendedCost:0})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${d.data.name||'Item'} added ✓`);
      loadNpcVendor();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteVendorItem(itemId) {
    try {
      const r = await fetch(`${API}/npc/vendor/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:npcExtrasEntry,item:itemId})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Item removed');
      loadNpcVendor();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadNpcTrainer() {
    const box = document.getElementById('npc-extras-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:0.82rem">Loading Trainer…</div>';
    try {
      const r = await fetch(`${API}/npc/trainer/${npcExtrasEntry}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const spells = d.data.spells || [];
      const trainers = d.data.trainers || [];
      if (!trainers.length) {
        box.innerHTML = `<div style="color:var(--muted);text-align:center;padding:30px 0">No trainer link in creature_default_trainer.<br><span style="font-size:0.75rem">Trainer must be linked via creature_default_trainer.</span></div>`;
        return;
      }
      let html = `<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">Trainer-ID(s): ${trainers.map(t=>t.Id).join(', ')} · ${spells.length} Spells</div>`;
      if (spells.length) {
        html += `<table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:14px">
          <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
            <th style="padding:4px 8px;text-align:left">Spell</th>
            <th style="padding:4px 8px;text-align:center">ID</th>
            <th style="padding:4px 8px;text-align:center">Cost (copper)</th>
            <th style="padding:4px 8px;text-align:center">Req. Level</th>
            <th style="padding:4px 8px;text-align:center">Action</th>
          </tr></thead><tbody>`;
        for (const sp of spells) {
          html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
            <td style="padding:4px 8px;color:var(--cyan)">${sp.spell_name||'Spell'}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--muted)">${sp.SpellId}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--text)">${sp.MoneyCost}</td>
            <td style="padding:4px 8px;text-align:center;color:var(--muted)">${sp.ReqLevel||'-'}</td>
            <td style="padding:4px 8px;text-align:center">
              <button class="e-btn e-btn-small e-btn-danger" onclick="deleteTrainerSpell(${sp.TrainerId},${sp.SpellId})">🗑</button>
            </td>
          </tr>`;
        }
        html += '</tbody></table>';
      }
      const tid = trainers[0]?.Id || 0;
      html += `<div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Add spell (Trainer ${tid})</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="tr-spell-id" type="number" placeholder="Spell ID"
            style="width:110px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <input id="tr-cost" type="number" placeholder="Cost (copper)" value="0"
            style="width:140px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <input id="tr-reqlevel" type="number" placeholder="Req. Level" value="0"
            style="width:100px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <button class="e-btn" onclick="addTrainerSpell(${tid})">＋ Add</button>
        </div>
      </div>`;
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function addTrainerSpell(trainerId) {
    const spellId  = parseInt(document.getElementById('tr-spell-id')?.value||0);
    const cost     = parseInt(document.getElementById('tr-cost')?.value||0);
    const reqLevel = parseInt(document.getElementById('tr-reqlevel')?.value||0);
    if (!spellId) { showToast('Enter Spell ID','error'); return; }
    try {
      const r = await fetch(`${API}/npc/trainer/spell/add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({TrainerId:trainerId,SpellId:spellId,MoneyCost:cost,ReqLevel:reqLevel})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Spell added ✓');
      loadNpcTrainer();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteTrainerSpell(trainerId, spellId) {
    try {
      const r = await fetch(`${API}/npc/trainer/spell/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({TrainerId:trainerId,SpellId:spellId})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Spell removed');
      loadNpcTrainer();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadNpcText() {
    const box = document.getElementById('npc-extras-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:0.82rem">Loading texts…</div>';
    try {
      const r = await fetch(`${API}/creature/text/${npcExtrasEntry}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      const TEXT_TYPES = {0:'Say',1:'Yell',2:'Text Emote',3:'Boss Emote',4:'Whisper',5:'Boss Whisper',6:'Zone Yell',14:'Raid Boss Whisper'};
      let html = '';
      if (rows.length) {
        for (const t of rows) {
          const typeName = TEXT_TYPES[t.Type] || `Type ${t.Type}`;
          html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <span style="color:var(--muted);font-size:0.72rem">Group ${t.GroupID} · ID ${t.ID}</span>
              <span style="background:rgba(0,188,212,.12);border:1px solid var(--cyan);border-radius:4px;padding:1px 6px;font-size:0.72rem;color:var(--cyan)">${typeName}</span>
              <span style="color:var(--muted);font-size:0.72rem">Chance: ${t.Probability}%</span>
              <div style="margin-left:auto;display:flex;gap:4px">
                <button class="e-btn e-btn-small" onclick="saveNpcText(${t.GroupID},${t.ID})">💾</button>
                <button class="e-btn e-btn-small e-btn-danger" onclick="deleteNpcText(${t.GroupID},${t.ID})">🗑</button>
              </div>
            </div>
            <input id="ct-text-${t.GroupID}-${t.ID}" value="${(t.Text||'').replace(/"/g,'&quot;')}"
              style="width:100%;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px;box-sizing:border-box">
          </div>`;
        }
      } else {
        html += `<div style="color:var(--muted);font-size:0.82rem;margin-bottom:12px">No texts entered.</div>`;
      }
      html += `<div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Add text</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <input id="ct-new-text" placeholder="Text…"
            style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <input id="ct-new-group" type="number" value="0" placeholder="Group"
            style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <select id="ct-new-type"
            style="background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px">
            ${Object.entries(TEXT_TYPES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
          </select>
          <input id="ct-new-prob" type="number" value="100" min="1" max="100" placeholder="%"
            style="width:70px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px">
          <button class="e-btn" onclick="addNpcText()">＋ Add</button>
        </div>
      </div>`;
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function saveNpcText(groupId, id) {
    const textEl = document.getElementById(`ct-text-${groupId}-${id}`);
    if (!textEl) return;
    try {
      const r = await fetch(`${API}/creature/text/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CreatureID:npcExtrasEntry,GroupID:groupId,ID:id,Text:textEl.value})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Text saved ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteNpcText(groupId, id) {
    try {
      const r = await fetch(`${API}/creature/text/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CreatureID:npcExtrasEntry,GroupID:groupId,ID:id})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Text deleted');
      loadNpcText();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function addNpcText() {
    const text  = document.getElementById('ct-new-text')?.value.trim() || '';
    const group = parseInt(document.getElementById('ct-new-group')?.value||0);
    const type  = parseInt(document.getElementById('ct-new-type')?.value||0);
    const prob  = parseFloat(document.getElementById('ct-new-prob')?.value||100);
    if (!text) { showToast('Enter text','error'); return; }
    try {
      const r = await fetch(`${API}/creature/text/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CreatureID:npcExtrasEntry,GroupID:group,ID:-1,Text:text,Type:type,Probability:prob})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Text added ✓');
      loadNpcText();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadNpcEquip() {
    const box = document.getElementById('npc-extras-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:0.82rem">Loading Equip…</div>';
    try {
      const r = await fetch(`${API}/creature/equip/${npcExtrasEntry}`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      let html = `<div style="font-size:0.72rem;color:var(--muted);margin-bottom:10px">Which items the NPC visually carries (creature_equip_template)</div>`;
      if (rows.length) {
        for (const eq of rows) {
          html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:10px">
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px">Equip-Set ID ${eq.ID}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              ${[1,2,3].map(slot => {
                const iid = eq[`ItemID${slot}`]; const iname = eq[`item${slot}_name`]||'';
                return `<div>
                  <div style="font-size:0.7rem;color:var(--muted);margin-bottom:3px">Slot ${slot}</div>
                  <div style="display:flex;gap:4px">
                    <input id="eq-${eq.ID}-item${slot}" type="number" value="${iid||0}"
                      style="flex:1;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:4px 6px">
                  </div>
                  ${iname ? `<div style="font-size:0.7rem;color:var(--cyan);margin-top:2px">${iname}</div>` : ''}
                </div>`;
              }).join('')}
            </div>
            <button class="e-btn e-btn-small" style="margin-top:10px" onclick="saveNpcEquip(${eq.ID})">💾 Save</button>
          </div>`;
        }
      } else {
        html += `<div style="color:var(--muted);font-size:0.82rem;margin-bottom:12px">No equip template.</div>`;
        html += `<button class="e-btn" onclick="saveNpcEquipNew()">＋ Create equip set</button>`;
      }
      box.innerHTML = html;
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function saveNpcEquip(eid) {
    const i1 = parseInt(document.getElementById(`eq-${eid}-item1`)?.value||0);
    const i2 = parseInt(document.getElementById(`eq-${eid}-item2`)?.value||0);
    const i3 = parseInt(document.getElementById(`eq-${eid}-item3`)?.value||0);
    try {
      const r = await fetch(`${API}/creature/equip/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CreatureID:npcExtrasEntry,ID:eid,ItemID1:i1,ItemID2:i2,ItemID3:i3})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Equip saved ✓');
      loadNpcEquip();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function saveNpcEquipNew() {
    try {
      const r = await fetch(`${API}/creature/equip/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({CreatureID:npcExtrasEntry,ID:1,ItemID1:0,ItemID2:0,ItemID3:0})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Equip-Set created ✓');
      loadNpcEquip();
    } catch(e) { showToast('Server offline','error'); }
  }


