/* create-items.js — extracted from ASP_Admin.html (verbatim) */
  const EQUIP_SLOT_DEFS = [
    {key:'head',     label:'Head',       col:'L', invTypes:[1]},
    {key:'neck',     label:'Neck',       col:'L', invTypes:[2]},
    {key:'shoulder', label:'Shoulders',  col:'L', invTypes:[3]},
    {key:'back',     label:'Back',     col:'L', invTypes:[16]},
    {key:'chest',    label:'Chest',      col:'L', invTypes:[5,20]},
    {key:'shirt',    label:'Shirt',      col:'L', invTypes:[4]},
    {key:'tabard',   label:'Tabard', col:'L', invTypes:[19]},
    {key:'wrist',    label:'Wrists',     col:'L', invTypes:[9]},
    {key:'hands',    label:'Hands',      col:'R', invTypes:[10]},
    {key:'waist',    label:'Belt',     col:'R', invTypes:[6]},
    {key:'legs',     label:'Legs',      col:'R', invTypes:[7]},
    {key:'feet',     label:'Feet',       col:'R', invTypes:[8]},
    {key:'ring1',    label:'Ring',       col:'R', invTypes:[11]},
    {key:'ring2',    label:'Ring',       col:'R', invTypes:[11]},
    {key:'trinket1', label:'Trinket',    col:'R', invTypes:[12]},
    {key:'trinket2', label:'Trinket',    col:'R', invTypes:[12]},
    {key:'mainhand', label:'Main Hand',  col:'B', invTypes:[13,17,21]},
    {key:'offhand',  label:'Off Hand',  col:'B', invTypes:[14,22,23]},
    {key:'ranged',   label:'Ranged',     col:'B', invTypes:[15,25,26,28]},
    {key:'ammo',     label:'Ammo',   col:'B', invTypes:[24]},
  ];

  let equipState   = {};
  let bagPackSlots = [];
  let bagBagSlots  = [null, null, null, null];

  // Active slot for slot-bound search
  // {type:'equip'|'bag'|'pack', key, idx, invTypes:[]}
  let _activeSlot  = null;

  // Dragged item from search: {itemid, name, Quality, InventoryType, ItemLevel, RequiredLevel, amount}
  let _dragItem    = null;

  // Item search state
  let _pciSelected = null;
  let _pciTimer    = null;

  // Item set search state
  let _pciSetTimer  = null;
  let _pciSetLoaded = null;

  function selectorStyle() {
    return `background:var(--bg);border:1px solid var(--border);border-radius:5px;
            color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 10px`;
  }

  function assignItemsToSlots(items) {
    equipState = {};
    EQUIP_SLOT_DEFS.forEach(s => { equipState[s.key] = null; });
    bagPackSlots = [];
    bagBagSlots  = [null, null, null, null];

    for (const it of items) {
      const inv = it.InventoryType !== undefined ? it.InventoryType : 0;
      if (inv === 18) {
        const free = bagBagSlots.findIndex(s => s === null);
        if (free !== -1) { bagBagSlots[free] = it; continue; }
      }
      let placed = false;
      for (const def of EQUIP_SLOT_DEFS) {
        if (def.invTypes.includes(inv) && equipState[def.key] === null) {
          equipState[def.key] = it;
          placed = true;
          break;
        }
      }
      if (!placed) bagPackSlots.push(it);
    }
  }

  async function loadPlayerCreateItems() {
    const box = document.getElementById('player-content');
    await ensureRaceClassMap();
    try {
      const url = `${API}/player/createinfo/items?race=${pCIRace}&class=${pCIClass}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }

      // New API returns {outfit:[], custom:[], data:[]}
      // Legacy fallback: if data is plain array
      const outfit = d.data?.outfit || [];
      const custom = d.data?.custom || [];
      playerItemData = [...outfit, ...custom];

      assignItemsToSlots(playerItemData);
      renderPlayerCreateItems();
      // Load item icons asynchronously after render
      const allItemIds = [...new Set(playerItemData.map(it => it.itemid).filter(Boolean))];
      loadItemIconsBatch(allItemIds);
    } catch(e) {
      box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`;
    }
  }

  async function debugShowRawItems() {
    const panel = document.getElementById('pci-debug-panel');
    if (!panel) return;
    if (panel.style.display !== 'none') { panel.style.display='none'; return; }
    panel.style.display = '';
    panel.textContent = 'Loading raw DB data…';
    try {
      const r = await fetch(`${API}/player/createinfo/items/raw`);
      const d = await r.json();
      if (!d.ok) { panel.textContent = 'Error: ' + d.error; return; }
      const groups = d.data.race_class_groups || [];
      const sample = d.data.sample || [];
      let html = `<div style="color:var(--cyan);margin-bottom:4px">Race/Class groups in DB (${groups.length}):</div>`;
      html += groups.map(g => `<span style="margin-right:12px">race=${g.race} cls=${g.class}: <b style="color:var(--text)">${g.cnt}</b> Items</span>`).join('') || 'Empty';
      html += `<div style="color:var(--cyan);margin:6px 0 4px">First Items:</div>`;
      html += sample.slice(0,20).map(i => `<div>race=${i.race} cls=${i.class} · #${i.itemid} ${i.name||'?'} (invType=${i.InventoryType||0})</div>`).join('');
      panel.innerHTML = html;
    } catch(e) { panel.textContent = 'Server-Error: ' + e.message; }
  }


  function renderEquipSlotEl(key) {
    const def  = EQUIP_SLOT_DEFS.find(d => d.key === key);
    const item = equipState[key];
    const qc   = item ? (QUALITY_COLOR[item.Quality||0]||'#fff') : 'rgba(255,255,255,.15)';
    const qBg  = item ? qualityBg(item.Quality||0) : 'rgba(0,0,0,.3)';
    const isActive = _activeSlot && _activeSlot.type==='equip' && _activeSlot.key===key;
    const border = isActive ? 'var(--gold)' : qc;

    const tt = item
      ? `data-name="${(item.name||'').replace(/"/g,'&quot;')}" data-id="${item.itemid||''}" data-quality="${item.Quality||0}" data-ilvl="${item.ItemLevel||0}" data-rlvl="${item.RequiredLevel||0}" data-amount="${item.amount||1}" data-source="${item._source||''}"`
      : '';

    const dragData = item
      ? `draggable="true" ondragstart="slotDragStart(event,'equip','${key}')"`
      : '';

    let inner = '';
    if (item) {
      const iconUrl = item.icon
        ? `https://wow.zamimg.com/images/wow/icons/medium/${item.icon}.jpg`
        : (itemIconUrl(item.itemid) || null);
      if (iconUrl) {
        inner = `<img data-item="${item.itemid}" src="${iconUrl}"
          style="width:100%;height:100%;object-fit:cover;display:block;border-radius:3px"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
            font-size:0.48rem;color:${qc};text-align:center;padding:2px;
            font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
            ${(item.name||'').length>8?item.name.slice(0,7)+'…':item.name}</div>`;
      } else {
        inner = `<div data-item="${item.itemid}"
          style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;
            font-size:0.48rem;color:${qc};text-align:center;padding:2px;
            font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
            ${(item.name||'').length>8?item.name.slice(0,7)+'…':item.name}</div>`;
      }
      if (item.ItemLevel) inner += `<div style="position:absolute;bottom:1px;right:2px;
        font-size:0.42rem;color:rgba(255,255,255,.7);font-family:monospace;
        text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none">${item.ItemLevel}</div>`;
      if ((item.amount||1) > 1) inner += `<div style="position:absolute;bottom:1px;left:2px;
        font-size:0.48rem;color:var(--gold);font-weight:700;
        text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none">${item.amount}</div>`;
    } else {
      inner = `<div style="font-size:0.42rem;color:rgba(255,255,255,.2);text-align:center;
        text-transform:uppercase;font-family:'Share Tech Mono',monospace;line-height:1.2;
        padding:2px">${def.label}</div>`;
    }

    return `<div class="e-slot${item?' e-slot-filled':''}" data-slotkey="${key}" ${dragData} ${tt}
      onclick="clickSlot('equip','${key}')"
      ondragover="event.preventDefault()" ondrop="slotDrop(event,'equip','${key}')"
      oncontextmenu="event.preventDefault();removeSlotItem('equip','${key}')"
      style="width:52px;height:52px;border:2px solid ${border};border-radius:5px;background:${qBg};
             display:flex;flex-direction:column;align-items:center;justify-content:center;
             cursor:pointer;box-sizing:border-box;position:relative;overflow:hidden;
             transition:border-color .15s;${isActive?'box-shadow:0 0 8px var(--gold)':''}">
      ${inner}
    </div>`;
  }

  function renderBagSlotEl(idx) {
    const item = bagBagSlots[idx];
    const qc   = item ? (QUALITY_COLOR[item.Quality||0]||'#fff') : 'rgba(255,255,255,.15)';
    const qBg  = item ? qualityBg(item.Quality||0) : 'rgba(0,0,0,.25)';
    const isActive = _activeSlot && _activeSlot.type==='bag' && _activeSlot.idx===idx;
    const border = isActive ? 'var(--gold)' : qc;

    const tt = item
      ? `data-name="${(item.name||'').replace(/"/g,'&quot;')}" data-id="${item.itemid||''}" data-quality="${item.Quality||0}" data-ilvl="${item.ItemLevel||0}" data-rlvl="${item.RequiredLevel||0}" data-amount="${item.amount||1}" data-source="${item._source||''}"`
      : '';

    let inner = '';
    if (item) {
      const iconUrl = item.icon
        ? `https://wow.zamimg.com/images/wow/icons/medium/${item.icon}.jpg`
        : (itemIconUrl(item.itemid) || null);
      if (iconUrl) {
        inner = `<img data-item="${item.itemid}" src="${iconUrl}"
          style="width:100%;height:100%;object-fit:cover;display:block;border-radius:3px"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
            font-size:0.48rem;color:${qc};text-align:center;padding:2px;
            font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
            ${(item.name||'').length>8?item.name.slice(0,7)+'…':item.name}</div>`;
      } else {
        inner = `<div data-item="${item.itemid}"
          style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;
            font-size:0.48rem;color:${qc};text-align:center;padding:2px;
            font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
            ${(item.name||'').length>8?item.name.slice(0,7)+'…':item.name}</div>`;
      }
    } else {
      inner = `<div style="font-size:0.45rem;color:${isActive?'var(--gold)':'rgba(255,255,255,.2)'};
        text-align:center;font-family:'Share Tech Mono',monospace;line-height:1.2;padding:2px">
        Bag ${idx+1}</div>`;
    }

    return `<div class="b-slot${item?' b-slot-filled':''}" data-bagidx="${idx}" ${tt}
      onclick="clickSlot('bag',${idx})"
      ondragover="event.preventDefault()" ondrop="slotDrop(event,'bag',${idx})"
      oncontextmenu="event.preventDefault();removeSlotItem('bag',${idx})"
      style="width:52px;height:52px;border:2px dashed ${border};border-radius:5px;background:${qBg};
             display:flex;flex-direction:column;align-items:center;justify-content:center;
             cursor:pointer;box-sizing:border-box;position:relative;overflow:hidden;
             ${isActive?'box-shadow:0 0 8px var(--gold)':''}">
      ${inner}
    </div>`;
  }

  function renderPackGrid() {
    const PACK_SIZE = 16;
    let html = '';
    for (let i = 0; i < PACK_SIZE; i++) {
      const item = bagPackSlots[i] || null;
      const qc   = item ? (QUALITY_COLOR[item.Quality||0]||'#fff') : 'rgba(255,255,255,.1)';
      const qBg  = item ? qualityBg(item.Quality||0) : 'rgba(0,0,0,.2)';
      const isActive = _activeSlot && _activeSlot.type==='pack' && _activeSlot.idx===i;
      const border = isActive ? 'var(--gold)' : (item ? qc : 'rgba(255,255,255,.08)');
      const tt = item
        ? `data-name="${(item.name||'').replace(/"/g,'&quot;')}" data-id="${item.itemid||''}" data-quality="${item.Quality||0}" data-ilvl="${item.ItemLevel||0}" data-rlvl="${item.RequiredLevel||0}" data-amount="${item.amount||1}" data-source="${item._source||''}"`
        : '';

      if (item) {
        const iconUrl = item.icon
          ? `https://wow.zamimg.com/images/wow/icons/medium/${item.icon}.jpg`
          : (itemIconUrl(item.itemid) || null);
        let inner = '';
        if (iconUrl) {
          inner = `<img data-item="${item.itemid}" src="${iconUrl}"
            style="width:100%;height:100%;object-fit:cover;display:block;border-radius:3px"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;
              font-size:0.45rem;color:${qc};text-align:center;padding:2px;
              font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
              ${(item.name||'').length>8?item.name.slice(0,7)+'…':(item.name||'?')}</div>`;
        } else {
          inner = `<div data-item="${item.itemid}"
            style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;
              font-size:0.45rem;color:${qc};text-align:center;padding:2px;
              font-family:'Share Tech Mono',monospace;word-break:break-word;line-height:1.2">
              ${(item.name||'').length>8?item.name.slice(0,7)+'…':(item.name||'?')}</div>`;
        }
        if (item.ItemLevel) inner += `<div style="position:absolute;bottom:1px;right:2px;
          font-size:0.4rem;color:rgba(255,255,255,.7);font-family:monospace;
          text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none">${item.ItemLevel}</div>`;
        if ((item.amount||1) > 1) inner += `<div style="position:absolute;bottom:1px;left:2px;
          font-size:0.45rem;color:var(--gold);font-weight:700;
          text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none">${item.amount}</div>`;

        html += `<div class="p-slot p-slot-filled" draggable="true" data-packidx="${i}" ${tt}
          ondragstart="packDragStart(event,${i})"
          ondragover="event.preventDefault()" ondrop="packDrop(event,${i})"
          onclick="clickSlot('pack',${i})"
          oncontextmenu="event.preventDefault();removeSlotItem('pack',${i})"
          style="width:52px;height:52px;border:2px solid ${border};border-radius:5px;background:${qBg};
                 display:flex;flex-direction:column;align-items:center;justify-content:center;
                 cursor:grab;box-sizing:border-box;position:relative;overflow:hidden;
                 ${isActive?'box-shadow:0 0 8px var(--gold)':''}">
          ${inner}
        </div>`;
      } else {
        html += `<div class="p-slot p-slot-empty" data-packidx="${i}" ${tt}
          ondragover="event.preventDefault()" ondrop="packDrop(event,${i})"
          onclick="clickSlot('pack',${i})"
          style="width:52px;height:52px;border:1px solid ${border};border-radius:5px;background:${qBg};
                 cursor:pointer;box-sizing:border-box;${isActive?'box-shadow:0 0 8px var(--gold)':''}">
        </div>`;
      }
    }
    return html;
  }

  async function ensureRaceClassMap() {
    if (Object.keys(_raceClassMap).length) return;
    try {
      const r = await fetch(`${API}/player/raceclass`);
      const d = await r.json();
      if (d.ok) _raceClassMap = d.data || {};
    } catch(e) {}
  }

  function validClassesFor(race) {
    const v = _raceClassMap[race] || _raceClassMap[String(race)];
    return (v && v.length) ? v : Object.keys(PLAYER_CLASS_NAMES).map(Number);
  }

  function pciSetRace(v) {
    pCIRace = parseInt(v);
    const valid = validClassesFor(pCIRace);
    if (!valid.includes(pCIClass)) pCIClass = valid[0];
    loadPlayerCreateItems();
  }

  function pciAddFromSearch(src) {
    _dragItem = null;
    // Try DBC first (writes to CharStartOutfit.dbc → appears ingame)
    fetch(`${API}/player/outfit/add`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        race: pCIRace, class: pCIClass, itemid: src.itemid,
        inv_type:   src.InventoryType != null ? src.InventoryType : undefined,
        display_id: src.displayid     != null ? src.displayid     : undefined,
      })
    }).then(r=>r.json()).then(d=>{
      if (d.ok) {
        showToast(`${src.name||'Item'} added to DBC ✓`);
        loadPlayerCreateItems();
        return;
      }
      // Fallback: bag item (playercreateinfo_item)
      return fetch(`${API}/player/createinfo/items/add`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({race: pCIRace, class: pCIClass, itemid: src.itemid, amount: src.amount||1})
      }).then(r2=>r2.json()).then(d2=>{
        if (!d2.ok) { showToast(d2.error||'Error','error'); return; }
        showToast(`${src.name||'Item'} added (Bag)`);
        loadPlayerCreateItems();
      });
    }).catch(()=>showToast('Server offline','error'));
  }

  function renderPlayerCreateItems() {
    const box = document.getElementById('player-content');

    const sel = (map, val, onchange) => {
      let s = `<select onchange="${onchange}" style="${selectorStyle()}">`;
      for (const [id,name] of Object.entries(map)) s += `<option value="${id}"${parseInt(id)===val?' selected':''}>${name}</option>`;
      return s + '</select>';
    };
    const clsMap = {};
    validClassesFor(pCIRace).forEach(c => { if (PLAYER_CLASS_NAMES[c]) clsMap[c] = PLAYER_CLASS_NAMES[c]; });
    const raceSel = sel(PLAYER_RACE_NAMES, pCIRace,  'pciSetRace(this.value)');
    const clsSel  = sel(clsMap, pCIClass, 'pCIClass=parseInt(this.value);loadPlayerCreateItems()');

    const leftSlots  = EQUIP_SLOT_DEFS.filter(d=>d.col==='L');
    const rightSlots = EQUIP_SLOT_DEFS.filter(d=>d.col==='R');
    const botSlots   = EQUIP_SLOT_DEFS.filter(d=>d.col==='B');

    box.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${raceSel} ${clsSel}
      <span style="font-size:0.74rem;color:var(--muted)">${playerItemData.length} Items · playercreateinfo_item</span>
      <span style="font-size:0.68rem;color:var(--muted);margin-left:4px">Click on slot = Search · Right Click = Remove</span>
      <button class="e-btn" onclick="debugShowRawItems()" style="border-color:var(--muted);color:var(--muted);font-size:0.65rem;padding:2px 8px;margin-left:auto">🔍 DB-Debug</button>
    </div>
    <div id="pci-debug-panel" style="display:none;margin-bottom:10px;padding:8px 10px;background:rgba(0,0,0,.4);border:1px solid var(--border);border-radius:6px;font-size:0.72rem;font-family:monospace;color:var(--muted);max-height:150px;overflow-y:auto"></div>

    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">

      <!-- ══ LEFT: C-Screen ══ -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
          <span style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">🧍 Equipment</span>
          <button class="e-btn" onclick="pciOpenCopyModal('equipment','Equipment')" style="font-size:0.62rem;padding:1px 8px">📋 Copy to</button>
        </div>
        <div id="cscreen-frame" style="display:inline-flex;flex-direction:column;gap:4px;
          background:rgba(0,0,0,.45);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="display:flex;gap:6px;align-items:stretch">
            <div style="display:flex;flex-direction:column;gap:4px" id="equip-col-L">
              ${leftSlots.map(d=>renderEquipSlotEl(d.key)).join('')}
            </div>
            <!-- Silhouette -->
            <div style="width:100px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);
                        border-radius:6px;display:flex;flex-direction:column;align-items:center;
                        justify-content:center;gap:4px">
              <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)"></div>
              <div style="width:40px;height:50px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:4px 4px 0 0"></div>
              <div style="display:flex;gap:4px">
                <div style="width:17px;height:34px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:0 0 4px 4px"></div>
                <div style="width:17px;height:34px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:0 0 4px 4px"></div>
              </div>
              <div style="font-size:0.52rem;color:rgba(255,255,255,.18);font-family:'Share Tech Mono',monospace;
                          text-transform:uppercase;letter-spacing:.04em;margin-top:4px;text-align:center">
                ${(PLAYER_RACE_NAMES[pCIRace]||'?').slice(0,8)}<br>${(PLAYER_CLASS_NAMES[pCIClass]||'?').slice(0,8)}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px" id="equip-col-R">
              ${rightSlots.map(d=>renderEquipSlotEl(d.key)).join('')}
            </div>
          </div>
          <div style="display:flex;gap:4px;justify-content:center;margin-top:2px" id="equip-col-B">
            ${botSlots.map(d=>renderEquipSlotEl(d.key)).join('')}
          </div>
        </div>
      </div>

      <!-- ══ MIDDLE: Bags + Pack ══ -->
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
            <span style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">🎒 Bags</span>
            <button class="e-btn" onclick="pciOpenCopyModal('bags','Bags')" style="font-size:0.62rem;padding:1px 8px">📋 Copy to</button>
          </div>
          <div id="bag-slots-row" style="display:flex;gap:4px">
            ${[0,1,2,3].map(i=>renderBagSlotEl(i)).join('')}
          </div>
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
            <span style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">📦 Backpack</span>
            <button class="e-btn" onclick="pciOpenCopyModal('backpack','Backpack')" style="font-size:0.62rem;padding:1px 8px">📋 Copy to</button>
          </div>
          <div id="pci-pack-grid" style="display:grid;grid-template-columns:repeat(4,52px);gap:4px;
            background:rgba(0,0,0,.35);border:2px solid var(--border);border-radius:8px;padding:8px;width:fit-content">
            ${renderPackGrid()}
          </div>
        </div>
      </div>

      <!-- ══ RIGHT: Search panels ══ -->
      <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:8px">

        <!-- Slot hint banner -->
        <div id="pci-slot-hint" style="display:none;padding:6px 10px;background:rgba(212,175,55,.1);
          border:1px solid var(--gold);border-radius:6px;font-size:0.74rem;color:var(--gold)">
          Slot: <span id="pci-slot-hint-text"></span>
          <button onclick="clearActiveSlot()" style="background:none;border:none;color:var(--muted);
            cursor:pointer;float:right;font-size:0.8rem">✕</button>
        </div>

        <!-- Item search -->
        <div style="background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:0.68rem;color:var(--cyan);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">🔍 Search Item</div>
          <div style="position:relative;margin-bottom:8px">
            <input id="pci-add-search" placeholder="Name or ID…"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                     color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;
                     padding:5px 8px;box-sizing:border-box"
              oninput="pciSearchDebounce()" autocomplete="off"
              onkeydown="if(event.key==='Escape')closePciDropdown()">
            <div id="pci-search-drop" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;
              background:var(--panel);border:1px solid var(--border);border-radius:0 0 6px 6px;
              max-height:200px;overflow-y:auto"></div>
          </div>
          <!-- Draggable item preview -->
          <div id="pci-drag-area" style="min-height:52px;background:rgba(0,0,0,.2);border:1px dashed rgba(255,255,255,.1);
            border-radius:6px;display:flex;align-items:center;gap:8px;padding:6px;margin-bottom:8px">
            <div id="pci-drag-icon" style="display:none"></div>
            <div id="pci-drag-info" style="font-size:0.72rem;color:var(--muted)">Item select → drag here or to slot</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="pci-add-amount" type="number" value="1" min="1"
              style="width:50px;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                     color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;padding:4px 6px;text-align:center">
            <span style="font-size:0.7rem;color:var(--muted)">Count</span>
            <button class="e-btn" onclick="addCreateItemToSlot()" style="border-color:var(--cyan);color:var(--cyan);margin-left:auto">＋ Add</button>
          </div>
        </div>

        <!-- Item Set search -->
        <div style="background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="font-size:0.68rem;color:var(--gold);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">🎽 Item Set</div>
          <div style="position:relative;margin-bottom:8px">
            <input id="pci-set-search" placeholder="Set-Name or ID…"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;
                     color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;
                     padding:5px 8px;box-sizing:border-box"
              oninput="pciSetSearchDebounce()" autocomplete="off"
              onkeydown="if(event.key==='Escape')closePciSetDrop()">
            <div id="pci-set-drop" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;
              background:var(--panel);border:1px solid var(--border);border-radius:0 0 6px 6px;
              max-height:180px;overflow-y:auto"></div>
          </div>
          <div id="pci-set-info" style="font-size:0.74rem;color:var(--muted);margin-bottom:6px">No Set selected</div>
          <div id="pci-set-items" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px"></div>
          <button id="pci-set-add-btn" class="e-btn" onclick="addSetToStartItems()"
            style="border-color:var(--gold);color:var(--gold);width:100%;display:none;font-size:0.74rem">
            ＋ All Set-Items add
          </button>
        </div>

        <!-- Saved items (persistent across reloads & race/class changes) -->
        <div id="pci-saved-panel"
          ondragover="event.preventDefault()" ondrop="pciSavedDrop(event)"
          style="background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:0.68rem;color:var(--cyan);text-transform:uppercase;letter-spacing:.07em">⭐ Saved</div>
            <div style="font-size:0.65rem;color:var(--muted)">Drag in to Save · Right Click = remove</div>
          </div>
          <div id="pci-saved-grid"
            style="display:flex;flex-wrap:wrap;gap:4px;min-height:54px;
                   padding:6px;border:1px dashed rgba(255,255,255,.08);border-radius:5px"></div>
        </div>

      </div><!-- /search panels -->
    </div>`;

    attachItemSlotEvents();
    _pciLoadSaved();
    renderPciSaved();
  }

  // ─── Slot interaction ────────────────────────────────────────────────────

  function clickSlot(type, keyOrIdx) {
    _activeSlot = {type, key: type==='equip' ? keyOrIdx : null, idx: type!=='equip' ? keyOrIdx : null};
    // Update hint
    const hint = document.getElementById('pci-slot-hint');
    const htxt = document.getElementById('pci-slot-hint-text');
    if (hint && htxt) {
      hint.style.display = '';
      const def = type==='equip' ? EQUIP_SLOT_DEFS.find(d=>d.key===keyOrIdx) : null;
      const slotName = type==='equip' ? def.label : (type==='bag' ? `Bag ${keyOrIdx+1}` : `Backpack-Slot ${keyOrIdx+1}`);
      htxt.textContent = slotName;
    }
    // Focus search
    const inp = document.getElementById('pci-add-search');
    if (inp) { inp.focus(); inp.select(); }
    // Re-render to show active highlight
    reRenderSlots();
  }

  function clearActiveSlot() {
    _activeSlot = null;
    const hint = document.getElementById('pci-slot-hint');
    if (hint) hint.style.display = 'none';
    reRenderSlots();
  }

  function reRenderSlots() {
    // Re-render all slot areas without full reload
    const leftSlots  = EQUIP_SLOT_DEFS.filter(d=>d.col==='L');
    const rightSlots = EQUIP_SLOT_DEFS.filter(d=>d.col==='R');
    const botSlots   = EQUIP_SLOT_DEFS.filter(d=>d.col==='B');
    const colL = document.getElementById('equip-col-L');
    const colR = document.getElementById('equip-col-R');
    const colB = document.getElementById('equip-col-B');
    const bagRow = document.getElementById('bag-slots-row');
    const packGrid = document.getElementById('pci-pack-grid');
    if (colL) colL.innerHTML = leftSlots.map(d=>renderEquipSlotEl(d.key)).join('');
    if (colR) colR.innerHTML = rightSlots.map(d=>renderEquipSlotEl(d.key)).join('');
    if (colB) colB.innerHTML = botSlots.map(d=>renderEquipSlotEl(d.key)).join('');
    if (bagRow) bagRow.innerHTML = [0,1,2,3].map(i=>renderBagSlotEl(i)).join('');
    if (packGrid) packGrid.innerHTML = renderPackGrid();
    attachItemSlotEvents();
  }

  function slotDragStart(e, type, key) {
    const item = type==='equip' ? equipState[key] : null;
    if (!item) { e.preventDefault(); return; }
    _dragItem = {...item, _fromType:'equip', _fromKey:key};
    e.dataTransfer.effectAllowed = 'move';
  }

  function packDragStart(e, idx) {
    const item = bagPackSlots[idx];
    if (!item) { e.preventDefault(); return; }
    _dragItem = {...item, _fromType:'pack', _fromIdx:idx};
    e.dataTransfer.effectAllowed = 'move';
  }

  function slotDrop(e, type, keyOrIdx) {
    e.preventDefault();
    if (!_dragItem) return;
    const src = _dragItem;
    // From search → add to start items (DB places item by its type; target slot is visual)
    if (src._fromType === 'search') { pciAddFromSearch(src); return; }
    // Remove from source
    if (src._fromType==='equip') { equipState[src._fromKey] = null; }
    else if (src._fromType==='pack') { bagPackSlots[src._fromIdx] = null; }
    else if (src._fromType==='bag') { bagBagSlots[src._fromIdx] = null; }
    // Don't place, just refresh — actual DB state is what counts
    // Instead: call add API for target, remove from source in DB, reload
    const invType = src.InventoryType || 0;
    if (type === 'bag' && invType !== 18) {
      showToast('Only Bags (InventoryType 18) in Bags-Slots','error');
      _dragItem = null; reRenderSlots(); return;
    }
    _dragItem = null;
    // Already in DB, just visual rearrangement — reload to get fresh state
    loadPlayerCreateItems();
  }

  function packDrop(e, tgtIdx) {
    e.preventDefault();
    if (!_dragItem) return;
    const src = _dragItem;
    if (src._fromType === 'pack') {
      const tgtItem = bagPackSlots[tgtIdx];
      const srcItem = bagPackSlots[src._fromIdx];
      // If both items exist and both are DBC-sourced → swap in CharStartOutfit.dbc
      // (so order is persisted; reload from server returns new order)
      if (tgtItem && srcItem
          && tgtItem._source === 'dbc' && srcItem._source === 'dbc'
          && tgtItem.itemid !== srcItem.itemid) {
        _dragItem = null;
        // Optimistic visual swap so it feels instant
        bagPackSlots[tgtIdx] = srcItem;
        bagPackSlots[src._fromIdx] = tgtItem;
        reRenderSlots();
        fetch(`${API}/player/outfit/swap`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({race: pCIRace, class: pCIClass,
                                itemid_a: srcItem.itemid, itemid_b: tgtItem.itemid})
        }).then(r=>r.json()).then(d=>{
          if (!d.ok) { showToast(d.error||'Swap failed','error'); }
          loadPlayerCreateItems();
        }).catch(()=>{ showToast('Server offline','error'); loadPlayerCreateItems(); });
        return;
      }
      // Non-DBC or empty target → visual-only swap (not persisted, no DB-Order)
      const tmp = bagPackSlots[tgtIdx];
      bagPackSlots[tgtIdx] = bagPackSlots[src._fromIdx];
      bagPackSlots[src._fromIdx] = tmp;
      _dragItem = null;
      reRenderSlots();
    } else if (src._fromType === 'search') {
      pciAddFromSearch(src);
    } else {
      _dragItem = null;
      loadPlayerCreateItems();
    }
  }

  function removeSlotItem(type, keyOrIdx) {
    let item = null;
    if (type === 'equip') item = equipState[keyOrIdx];
    else if (type === 'bag') item = bagBagSlots[keyOrIdx];
    else if (type === 'pack') item = bagPackSlots[keyOrIdx];
    if (!item) return;
    if (item._source === 'dbc') {
      deleteOutfitItem(item.race ?? pCIRace, item.class ?? pCIClass, item.itemid);
    } else {
      deleteCreateItem(item.race ?? pCIRace, item.class ?? pCIClass, item.itemid);
    }
  }

  async function deleteOutfitItem(race, cls, itemid) {
    try {
      const res = await fetch(`${API}/player/outfit/remove`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({race, class: cls, itemid})
      });
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`DBC Item #${itemid} removed`);
      loadPlayerCreateItems();
    } catch(e) { showToast('Server offline','error'); }
  }

  // ─── Saved items panel (localStorage, persistent across reloads) ─────────

  const PCI_SAVED_KEY = 'asp_pci_saved_v1';
  let _pciSavedItems = [];

  function _pciLoadSaved() {
    try { _pciSavedItems = JSON.parse(localStorage.getItem(PCI_SAVED_KEY) || '[]'); }
    catch(e) { _pciSavedItems = []; }
  }
  function _pciStoreSaved() {
    try { localStorage.setItem(PCI_SAVED_KEY, JSON.stringify(_pciSavedItems)); } catch(e) {}
  }

  function renderPciSaved() {
    const grid = document.getElementById('pci-saved-grid');
    if (!grid) return;
    if (!_pciSavedItems.length) {
      grid.innerHTML = `<div style="color:rgba(255,255,255,.25);font-size:0.7rem;align-self:center;padding:0 6px">Nothing saved yet</div>`;
      return;
    }
    grid.innerHTML = _pciSavedItems.map((it, i) => {
      const qc  = QUALITY_COLOR[it.Quality||0] || '#fff';
      const qBg = qualityBg(it.Quality||0);
      const iconUrl = it.icon ? `https://wow.zamimg.com/images/wow/icons/medium/${it.icon}.jpg`
                              : (itemIconUrl(it.itemid) || null);
      // Always render an <img data-item> placeholder; icons are batch-loaded below.
      const inner = `<img data-item="${it.itemid}" src="${iconUrl||''}"
          style="width:100%;height:100%;object-fit:cover;border-radius:3px;${iconUrl?'':'display:none'}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div style="${iconUrl?'display:none':'display:flex'};width:100%;height:100%;align-items:center;justify-content:center;
          font-size:0.5rem;color:${qc};text-align:center;line-height:1.1;padding:2px;font-family:'Share Tech Mono',monospace">${((it.name||'').slice(0,8))}</div>`;
      return `<div draggable="true"
        ondragstart="pciSavedDragStart(event,${i})"
        oncontextmenu="event.preventDefault();pciSavedRemove(${i})"
        onmouseenter="showItemTooltip(event,{name:'${(it.name||'').replace(/'/g,"\\'")}',id:${it.itemid},quality:${it.Quality||0},ilvl:${it.ItemLevel||0},rlvl:${it.RequiredLevel||0}})"
        onmousemove="const t=document.getElementById('bag-tooltip');if(t)positionTooltip(t,event)"
        onmouseleave="document.getElementById('bag-tooltip')?.remove()"
        style="width:38px;height:38px;background:${qBg};border:1.5px solid ${qc};border-radius:4px;
               cursor:grab;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
        ${inner}
      </div>`;
    }).join('');
    // Batch-load icons for saved items (they store no icon name), then inject.
    const ids = _pciSavedItems.map(it => it.itemid).filter(Boolean);
    if (ids.length && typeof loadItemIconsBatch === 'function') {
      loadItemIconsBatch(ids).then(_applyPciSavedIcons);
    }
  }

  function _applyPciSavedIcons() {
    const grid = document.getElementById('pci-saved-grid');
    if (!grid) return;
    _pciSavedItems.forEach(it => {
      const url = it.icon ? `https://wow.zamimg.com/images/wow/icons/medium/${it.icon}.jpg`
                          : itemIconUrl(it.itemid);
      if (!url) return;
      const img = grid.querySelector(`img[data-item="${it.itemid}"]`);
      if (img && img.getAttribute('src') !== url) {
        img.src = url;
        img.style.display = 'block';
        const fb = img.nextElementSibling;
        if (fb) fb.style.display = 'none';
      }
    });
  }

  function pciSavedDragStart(e, idx) {
    const it = _pciSavedItems[idx]; if (!it) { e.preventDefault(); return; }
    _dragItem = {...it, _fromType:'search'}; // reuse search drop pipeline
    e.dataTransfer.effectAllowed = 'copy';
  }

  function pciSavedDrop(e) {
    e.preventDefault();
    if (!_dragItem) return;
    const it = _dragItem;
    if (!it.itemid) { _dragItem = null; return; }
    if (_pciSavedItems.some(s => s.itemid === it.itemid)) {
      showToast('Already saved', 'error');
      _dragItem = null; return;
    }
    _pciSavedItems.push({
      itemid: it.itemid,
      name: it.name || `Item #${it.itemid}`,
      Quality: it.Quality||0, ItemLevel: it.ItemLevel||0, RequiredLevel: it.RequiredLevel||0,
      InventoryType: it.InventoryType||0, icon: it.icon || '', displayid: it.displayid || 0
    });
    _pciStoreSaved();
    renderPciSaved();
    _dragItem = null;
    showToast(`${it.name||'Item'} saved ⭐`);
  }

  function pciSavedRemove(idx) {
    _pciSavedItems.splice(idx, 1);
    _pciStoreSaved();
    renderPciSaved();
  }

  // ─── Item search ─────────────────────────────────────────────────────────

  function pciSearchDebounce() {
    clearTimeout(_pciTimer);
    _pciTimer = setTimeout(pciDoSearch, 200);
  }

  async function pciDoSearch() {
    const inp  = document.getElementById('pci-add-search');
    const drop = document.getElementById('pci-search-drop');
    const q    = inp?.value.trim();
    if (!drop || !q) return;
    drop.style.display = '';
    drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">Search…</div>';
    try {
      const r = await fetch(`${API}/item/search?q=${encodeURIComponent(q)}&limit=14`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">No results.</div>';
        return;
      }
      drop.innerHTML = d.data.map(it => {
        const qc = QUALITY_COLOR[it.Quality||0] || '#fff';
        const esc = (it.name||'').replace(/'/g,"\\'");
        return `<div onclick="pciSelectItem(${it.entry},'${esc}',${it.Quality||0},${it.InventoryType||0},${it.ItemLevel||0},${it.RequiredLevel||0})"
          data-name="${(it.name||'').replace(/"/g,'&quot;')}" data-id="${it.entry}" data-quality="${it.Quality||0}" data-ilvl="${it.ItemLevel||0}" data-rlvl="${it.RequiredLevel||0}"
          onmouseenter="pciDropHover(event,this)" onmousemove="pciDropMove(event)" onmouseleave="pciDropLeave()"
          style="padding:5px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);
                 font-family:'Share Tech Mono',monospace;font-size:0.8rem;display:flex;gap:8px;align-items:center"
          onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background=''">
          <div data-icon="${it.entry}" style="width:28px;height:28px;background:${qualityBg(it.Quality||0)};border:1px solid ${qc};border-radius:4px;
            display:flex;align-items:center;justify-content:center;font-size:0.52rem;color:${qc};
            font-family:monospace;flex-shrink:0;overflow:hidden;background-size:cover;background-position:center">${it.ItemLevel||''}</div>
          <div style="flex:1;min-width:0">
            <div style="color:${qc};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.name||'?'}</div>
            <div style="color:var(--muted);font-size:0.68rem">#${it.entry} · iType:${it.InventoryType||0}</div>
          </div>
        </div>`;
      }).join('');
      // Lazy-load icons for the search results
      loadItemIconsBatch(d.data.map(it=>it.entry)).then(()=>{
        d.data.forEach(it => {
          const url = itemIconUrl(it.entry);
          const el = drop.querySelector(`[data-icon="${it.entry}"]`);
          if (url && el) {
            el.style.backgroundImage = `url(${url})`;
            el.textContent = '';
          }
        });
      });
    } catch(e) {
      drop.innerHTML = `<div style="padding:6px 10px;color:var(--red);font-size:0.78rem">${e.message}</div>`;
    }
  }

  function pciSelectItem(entry, name, quality, invType, ilvl, rlvl) {
    _pciSelected = {entry, name, quality, invType, ilvl, rlvl};
    const inp = document.getElementById('pci-add-search');
    if (inp) inp.value = name;
    closePciDropdown();

    // Show draggable icon in drag area
    const iconEl = document.getElementById('pci-drag-icon');
    const infoEl = document.getElementById('pci-drag-info');
    if (iconEl && infoEl) {
      const qc  = QUALITY_COLOR[quality||0] || '#fff';
      const qBg = qualityBg(quality||0);
      const lbl = name.length > 8 ? name.slice(0,7)+'…' : name;
      iconEl.style.display = '';
      iconEl.innerHTML = `<div draggable="true" id="pci-drag-chip"
        ondragstart="searchItemDragStart(event)"
        style="width:48px;height:48px;background:${qBg};border:2px solid ${qc};border-radius:5px;
               display:flex;flex-direction:column;align-items:center;justify-content:center;
               cursor:grab;flex-shrink:0;position:relative">
        <div style="font-size:0.5rem;color:${qc};text-align:center;line-height:1.2;
                    padding:0 2px;font-family:'Share Tech Mono',monospace;word-break:break-word">${lbl}</div>
        ${ilvl?`<div style="position:absolute;bottom:2px;right:2px;font-size:0.48rem;color:rgba(255,255,255,.5);font-family:monospace">${ilvl}</div>`:''}
      </div>`;
      infoEl.innerHTML = `<div>
        <div style="color:${qc};font-weight:600;font-size:0.8rem">${name}</div>
        <div style="color:var(--muted);font-size:0.68rem">#${entry} · iL${ilvl||'?'} · Req${rlvl||1}</div>
        <div style="color:rgba(255,255,255,.3);font-size:0.65rem;margin-top:2px">Drag to slot OR ＋ click</div>
      </div>`;
      const chip = document.getElementById('pci-drag-chip');
      if (chip) {
        chip.addEventListener('mouseenter', ev => showItemTooltip(ev, {name, id:entry, quality, ilvl, rlvl}));
        chip.addEventListener('mousemove', ev => { const t=document.getElementById('bag-tooltip'); if(t) positionTooltip(t,ev); });
        chip.addEventListener('mouseleave', () => document.getElementById('bag-tooltip')?.remove());
      }
    }
  }

  function searchItemDragStart(e) {
    if (!_pciSelected) { e.preventDefault(); return; }
    _dragItem = {
      name: _pciSelected.name,
      itemid: _pciSelected.entry,
      Quality: _pciSelected.quality,
      InventoryType: _pciSelected.invType,
      ItemLevel: _pciSelected.ilvl,
      RequiredLevel: _pciSelected.rlvl,
      amount: parseInt(document.getElementById('pci-add-amount')?.value||1),
      race: pCIRace, class: pCIClass,
      _fromType: 'search'
    };
    e.dataTransfer.effectAllowed = 'copy';
  }

  function closePciDropdown() {
    const d = document.getElementById('pci-search-drop');
    if (d) d.style.display = 'none';
    pciDropLeave();
  }

  function pciDropHover(e, el) {
    showItemTooltip(e, {
      name:    el.dataset.name,
      id:      el.dataset.id,
      quality: parseInt(el.dataset.quality||0),
      ilvl:    el.dataset.ilvl,
      rlvl:    el.dataset.rlvl
    });
  }
  function pciDropMove(e) {
    const t = document.getElementById('bag-tooltip');
    if (t) positionTooltip(t, e);
  }
  function pciDropLeave() {
    document.getElementById('bag-tooltip')?.remove();
  }

  // ─── Add / Delete ─────────────────────────────────────────────────────────

  async function addCreateItemToSlot() {
    if (!_pciSelected) { showToast('First choose an item from search','error'); return; }
    const amount = parseInt(document.getElementById('pci-add-amount')?.value||1);
    const itemid = _pciSelected.entry;
    try {
      // Try DBC first (appears ingame)
      let res = await fetch(`${API}/player/outfit/add`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({race: pCIRace, class: pCIClass, itemid})
      });
      let d = await res.json();
      if (!d.ok) {
        // Fallback: bag item
        res = await fetch(`${API}/player/createinfo/items/add`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({race: pCIRace, class: pCIClass, itemid, amount})
        });
        d = await res.json();
        if (!d.ok) { showToast(d.error||'Error','error'); return; }
        showToast(`${d.data.name||'Item'} (Bag) ✓`);
      } else {
        showToast(`${d.data.name||'Item'} → DBC ✓`);
      }
      _pciSelected = null;
      clearActiveSlot();
      loadPlayerCreateItems();
    } catch(e) { showToast('Server offline','error'); }
  }

  // Keep old name for drag-drop drops that call it
  async function addCreateItem() { await addCreateItemToSlot(); }

  async function deleteCreateItem(race, cls, itemid) {
    try {
      const res = await fetch(`${API}/player/createinfo/items/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({race, class: cls, itemid})
      });
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Item #${itemid} removed`);
      loadPlayerCreateItems();
    } catch(e) { showToast('Server offline','error'); }
  }

  // ─── Attach slot events (tooltips) ───────────────────────────────────────

  function attachItemSlotEvents() {
    // Rich local item tooltip (fetches full item_template data → works for custom items too)
    document.querySelectorAll('.e-slot-filled,.b-slot-filled,.p-slot-filled').forEach(el => {
      el.addEventListener('mouseenter', ev => showItemTooltip(ev, {
        name: el.dataset.name, id: el.dataset.id,
        quality: parseInt(el.dataset.quality||0),
        ilvl: el.dataset.ilvl, rlvl: el.dataset.rlvl,
        amount: el.dataset.amount,
        source: el.dataset.source
      }));
      el.addEventListener('mousemove', ev => { const t=document.getElementById('bag-tooltip'); if(t) positionTooltip(t,ev); });
      el.addEventListener('mouseleave', () => document.getElementById('bag-tooltip')?.remove());
    });
  }

  // Cache full item data fetched on tooltip hover so we don't refetch
  function pciSetSearchDebounce() {
    clearTimeout(_pciSetTimer);
    _pciSetTimer = setTimeout(pciSetDoSearch, 260);
  }

  function closePciSetDrop() {
    const d = document.getElementById('pci-set-drop');
    if (d) d.style.display = 'none';
  }

  async function pciSetDoSearch() {
    const q    = document.getElementById('pci-set-search')?.value.trim();
    const drop = document.getElementById('pci-set-drop');
    if (!drop || !q) return;
    drop.style.display = '';
    drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">Search…</div>';
    try {
      const r = await fetch(`${API}/itemset/search?q=${encodeURIComponent(q)}&limit=12`);
      const d = await r.json();
      if (!d.ok || !d.data.length) {
        drop.innerHTML = '<div style="padding:6px 10px;color:var(--muted);font-size:0.78rem">No Sets.</div>';
        return;
      }
      drop.innerHTML = d.data.map(s =>
        `<div onclick="pciSetSelect(${s.ID},'${(s.name||'').replace(/'/g,"\\'")}');closePciSetDrop()"
          style="padding:6px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);
                 font-family:'Share Tech Mono',monospace;font-size:0.8rem"
          onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background=''">
          <span style="color:var(--gold)">${s.name||'?'}</span>
          <span style="color:var(--muted);font-size:0.7rem;margin-left:8px">#${s.ID}</span>
        </div>`
      ).join('');
    } catch(e) {
      drop.innerHTML = `<div style="padding:6px 10px;color:var(--red);font-size:0.78rem">${e.message}</div>`;
    }
  }

  async function pciSetSelect(setId, setName) {
    const inp = document.getElementById('pci-set-search');
    if (inp) inp.value = setName;
    const infoEl  = document.getElementById('pci-set-info');
    const itemsEl = document.getElementById('pci-set-items');
    const btnEl   = document.getElementById('pci-set-add-btn');
    if (infoEl) infoEl.textContent = 'Loading…';
    if (itemsEl) itemsEl.innerHTML = '';
    if (btnEl) btnEl.style.display = 'none';
    try {
      const r = await fetch(`${API}/itemset/${setId}`);
      const d = await r.json();
      if (!d.ok) { if(infoEl) infoEl.textContent = d.error; return; }
      _pciSetLoaded = d.data;
      const items = d.data._items || [];
      if (infoEl) infoEl.innerHTML = `<span style="color:var(--gold);font-weight:600">${d.data.Name_Lang_enUS||'?'}</span><span style="color:var(--muted);margin-left:6px">· ${items.length} Items</span>`;
      if (itemsEl) {
        itemsEl.innerHTML = items.map(it => {
          const qc = QUALITY_COLOR[it.Quality||0]||'#fff';
          const lbl = (it.name||'?').length>12?it.name.slice(0,11)+'…':it.name;
          return `<div title="${it.name} (#${it.entry})"
            style="padding:2px 6px;background:rgba(0,0,0,.3);border:1px solid ${qc};border-radius:3px;
                   font-size:0.65rem;color:${qc};font-family:'Share Tech Mono',monospace;cursor:default">${lbl}</div>`;
        }).join('');
      }
      if (btnEl && items.length) { btnEl.style.display=''; btnEl.textContent=`＋ ${items.length} Items add`; }
    } catch(e) { if(infoEl) infoEl.textContent = e.message; }
  }

  async function addSetToStartItems() {
    if (!_pciSetLoaded) return;
    const items = _pciSetLoaded._items || [];
    if (!items.length) { showToast('No items in the set','error'); return; }
    let added = 0, skipped = 0;
    for (const it of items) {
      try {
        const res = await fetch(`${API}/player/createinfo/items/add`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({race: pCIRace, class: pCIClass, itemid: it.entry, amount: 1})
        });
        const d = await res.json();
        if (d.ok) added++; else skipped++;
      } catch { skipped++; }
    }
    showToast(`${added} Items added${skipped?`, ${skipped} skipped`:''} ✓`);
    loadPlayerCreateItems();
  }

  // ─── Copy start items to other race/class combos ──────────────────────────
  let _pciCopyItems   = [];
  let _pciCopySection = '';

  function _pciSectionItems(section) {
    if (section === 'equipment') return Object.values(equipState).filter(Boolean);
    if (section === 'bags')      return bagBagSlots.filter(Boolean);
    if (section === 'backpack')  return bagPackSlots.filter(Boolean);
    return [];
  }

  function pciOpenCopyModal(section, label) {
    _pciCopyItems   = _pciSectionItems(section);
    _pciCopySection = section;
    if (!_pciCopyItems.length) { showToast(`No items in ${label}`, 'error'); return; }
    const col = (title, cls, map) => `
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:0.72rem;color:var(--gold);text-transform:uppercase;letter-spacing:.05em">${title}</span>
          <span style="font-size:0.64rem">
            <a onclick="pciCopyToggleAll('${cls}',true)"  style="cursor:pointer;color:var(--cyan)">all</a> ·
            <a onclick="pciCopyToggleAll('${cls}',false)" style="cursor:pointer;color:var(--muted)">none</a>
          </span>
        </div>
        <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:1px;
          border:1px solid var(--border);border-radius:6px;padding:6px;background:var(--bg)">
          ${Object.entries(map).map(([id,n])=>`
            <label style="display:flex;align-items:center;gap:7px;font-size:0.8rem;color:var(--text);cursor:pointer;padding:2px 4px">
              <input type="checkbox" class="${cls}" value="${id}" style="cursor:pointer">${n}</label>`).join('')}
        </div>
      </div>`;
    const overlay = document.createElement('div');
    overlay.id = 'pci-copy-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;width:560px;max-width:96vw;box-shadow:0 10px 40px rgba(0,0,0,.7)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="color:var(--gold);font-size:1rem;font-weight:600">📋 Copy ${label} to…</div>
          <button onclick="document.getElementById('pci-copy-modal').remove()"
            style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        </div>
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:14px">
          ${_pciCopyItems.length} item(s) → every selected Race × Class (invalid combos are skipped)
        </div>
        <div style="display:flex;gap:16px">
          ${col('Races','pci-copy-race',PLAYER_RACE_NAMES)}
          ${col('Classes','pci-copy-class',PLAYER_CLASS_NAMES)}
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:0.78rem;color:var(--text);cursor:pointer">
          <input type="checkbox" id="pci-copy-clear" checked style="cursor:pointer">
          🧹 Clear each target's ${label} first (overwrite — items land in their proper slots)
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button class="e-btn" onclick="document.getElementById('pci-copy-modal').remove()">Cancel</button>
          <button class="e-btn e-btn-green" onclick="pciDoCopy()">📋 Copy</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function pciCopyToggleAll(cls, on) {
    document.querySelectorAll('.'+cls).forEach(c => { c.checked = on; });
  }

  async function pciDoCopy() {
    const races   = [...document.querySelectorAll('.pci-copy-race:checked')].map(c=>parseInt(c.value));
    const classes = [...document.querySelectorAll('.pci-copy-class:checked')].map(c=>parseInt(c.value));
    const clearFirst = !!document.getElementById('pci-copy-clear')?.checked;
    if (!races.length || !classes.length) { showToast('Select at least one race and class','error'); return; }
    const items   = _pciCopyItems;
    const section = _pciCopySection;
    document.getElementById('pci-copy-modal')?.remove();
    showToast('Copying…');
    // Guarantee the race/class map is present so invalid combos are reliably skipped
    // (validClassesFor() would otherwise fall back to "all classes" if it's missing).
    await ensureRaceClassMap();
    const clearTarget = async (r, c) => {
      // wipe the target's items for this section so copies land in the right slots
      if (section === 'equipment')
        await fetch(`${API}/player/outfit/clear`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({race:r,class:c,scope:'equipped'})}).catch(()=>{});
      else if (section === 'bags')
        await fetch(`${API}/player/outfit/clear`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({race:r,class:c,scope:'bags'})}).catch(()=>{});
      else if (section === 'backpack')
        await fetch(`${API}/player/createinfo/items/clear`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({race:r,class:c})}).catch(()=>{});
    };
    let added=0, failed=0, skipped=0;
    for (const r of races) {
      const valid = validClassesFor(r);
      for (const c of classes) {
        if (!valid.includes(c)) { skipped++; continue; }
        if (r === pCIRace && c === pCIClass) { skipped++; continue; } // never copy onto the source
        if (clearFirst) await clearTarget(r, c);
        for (const it of items) {
          if (!it || !it.itemid) continue;
          // Equipped gear → CharStartOutfit.dbc; bag/backpack → playercreateinfo_item
          const dbc = (it._source === 'dbc') || (it._source == null && section === 'equipment');
          const url  = dbc ? `${API}/player/outfit/add` : `${API}/player/createinfo/items/add`;
          const body = dbc
            ? { race:r, class:c, itemid:it.itemid, inv_type: it.InventoryType, display_id: it.displayid, dedupe: true }
            : { race:r, class:c, itemid:it.itemid, amount: it.amount||1 };
          try {
            const res = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
            const d = await res.json();
            if (d.ok) added++; else failed++;
          } catch { failed++; }
        }
      }
    }
    showToast(`Copied ${added} item(s)${failed?`, ${failed} failed`:''}${skipped?`, ${skipped} invalid combo(s) skipped`:''} ✓`);
    loadPlayerCreateItems();
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#pci-search-drop') && !e.target.matches('#pci-add-search')) closePciDropdown();
    if (!e.target.closest('#pci-set-drop')    && !e.target.matches('#pci-set-search'))  closePciSetDrop();
    if (!e.target.closest('#pcs-search-drop') && !e.target.matches('#pcs-search-input')) closeSpellDrop();
  });


  // ── Start Spells ─────────────────────────────────────────────────────────

