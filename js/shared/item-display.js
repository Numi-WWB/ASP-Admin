/* item-display.js — extracted from ASP_Admin.html (verbatim) */
  function qualityBg(q) {
    const map = {0:'rgba(80,80,80,.25)',1:'rgba(255,255,255,.06)',2:'rgba(30,255,0,.08)',
      3:'rgba(0,112,221,.12)',4:'rgba(163,53,238,.12)',5:'rgba(255,128,0,.12)',6:'rgba(230,204,128,.1)'};
    return map[q] || 'rgba(0,0,0,.3)';
  }

  function positionTooltip(tip, e) {
    // Use real measured size; flip side/vertical if it would clip the viewport.
    const pad = 8, gap = 14;
    const rect = tip.getBoundingClientRect();
    const tw = rect.width  || 240;
    const th = rect.height || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: prefer right of cursor, flip left if it would overflow
    let x = e.clientX + gap;
    if (x + tw + pad > vw) x = e.clientX - gap - tw;
    x = Math.max(pad, Math.min(x, vw - tw - pad));

    // Vertical: anchor near cursor, but if the tooltip is taller than fits below,
    // shift up so the bottom stays in view (clamped to top)
    let y = e.clientY - 10;
    if (y + th + pad > vh) y = vh - th - pad;
    y = Math.max(pad, y);

    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }

  function itemIcon(it, size=40) {
    if (!it) return '';
    const qc  = QUALITY_COLOR[it.Quality||0] || '#fff';
    const qBg = qualityBg(it.Quality||0);
    const lbl = (it.name||'').length > 7 ? it.name.slice(0,6)+'…' : (it.name||'?');
    return `<div style="width:${size}px;height:${size}px;background:${qBg};border:2px solid ${qc};border-radius:5px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;
      box-sizing:border-box;flex-shrink:0">
      <div style="font-size:${Math.max(size*0.13,7)}px;color:${qc};text-align:center;line-height:1.2;
        padding:0 2px;font-family:'Share Tech Mono',monospace;word-break:break-word">${lbl}</div>
      ${it.ItemLevel?`<div style="position:absolute;bottom:2px;right:2px;font-size:${Math.max(size*0.11,6)}px;
        color:rgba(255,255,255,.5);font-family:monospace">${it.ItemLevel}</div>`:''}
      ${(it.amount||1)>1?`<div style="position:absolute;bottom:2px;left:2px;font-size:${Math.max(size*0.12,7)}px;
        color:var(--gold);font-weight:700">${it.amount}</div>`:''}
    </div>`;
  }

  // ─── Slot render ────────────────────────────────────────────────────────
  const _itemFullCache = {};

  // ITEM_MOD_* type IDs from item_template.stat_typeN → tooltip label
  const ITEM_STAT_NAMES = {
    0:'Mana',1:'Health',3:'Agility',4:'Strength',5:'Intellect',6:'Spirit',7:'Stamina',
    12:'Defense Rating',13:'Dodge Rating',14:'Parry Rating',15:'Block Rating',
    16:'Melee Hit Rating',17:'Ranged Hit Rating',18:'Spell Hit Rating',
    19:'Melee Crit Rating',20:'Ranged Crit Rating',21:'Spell Crit Rating',
    28:'Melee Haste',29:'Ranged Haste',30:'Spell Haste',
    31:'Hit Rating',32:'Crit Rating',35:'Resilience',36:'Haste Rating',37:'Expertise Rating',
    38:'Attack Power',39:'Ranged Attack Power',
    41:'Healing',42:'Spell Damage',43:'Mana Regen',44:'Armor Penetration',
    45:'Spell Power',46:'Health Regen',47:'Spell Penetration',48:'Block Value'
  };
  const DMG_SCHOOL_NAMES = {0:'',1:'Holy',2:'Fire',3:'Nature',4:'Frost',5:'Shadow',6:'Arcane'};
  const INV_TYPE_NAMES = {1:'Head',2:'Neck',3:'Shoulder',4:'Shirt',5:'Chest',6:'Waist',7:'Legs',8:'Feet',
    9:'Wrist',10:'Hands',11:'Finger',12:'Trinket',13:'One-Hand',14:'Shield',15:'Ranged',
    16:'Back',17:'Two-Hand',18:'Bag',19:'Tabard',20:'Robe',21:'Main Hand',22:'Off Hand',
    23:'Held In Off-hand',24:'Ammo',25:'Thrown',26:'Ranged',28:'Relic'};
  const TT_BONDING = {1:'Bind on Pickup',2:'Bind on Equip',
    3:'Bind on Use',4:'Quest Item'};

  function _renderItemTooltipBody(it, full) {
    const qc    = QUALITY_COLOR[it.quality||0] || '#fff';
    const qName = ['Poor','Common','Uncommon','Rare','Epic','Legendary','Artifact','Heirloom'][it.quality||0] || '';
    const iconUrl = itemIconUrl(parseInt(it.id||0));
    const iconHtml = iconUrl
      ? `<img src="${iconUrl}" style="width:36px;height:36px;border:1px solid ${qc};border-radius:4px;object-fit:cover;flex-shrink:0" onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:36px;border:1px solid ${qc};border-radius:4px;background:rgba(0,0,0,.4);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1rem">⚔</div>`;

    let body = `
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px">
        ${iconHtml}
        <div style="flex:1;min-width:0">
          <div style="color:${qc};font-weight:600;line-height:1.25">${it.name||'?'}</div>
          ${qName ? `<div style="color:${qc};font-size:0.66rem;opacity:.7">${qName}</div>` : ''}
        </div>
      </div>`;

    if (full) {
      const grey = 'color:rgba(255,255,255,.55);font-size:0.72rem';
      const wht  = 'color:#fff;font-size:0.74rem';
      const grn  = 'color:#1eff00;font-size:0.72rem';
      const gold = 'color:var(--gold);font-size:0.72rem';

      // Bonding
      if (full.bonding && TT_BONDING[full.bonding])
        body += `<div style="${wht}">${TT_BONDING[full.bonding]}</div>`;
      // Bag slots
      if (full.ContainerSlots) body += `<div style="${wht}">${full.ContainerSlots} Bag Slots</div>`;
      // Slot type
      const invName = INV_TYPE_NAMES[full.InventoryType];
      if (invName && !full.ContainerSlots) body += `<div style="${wht}">${invName}</div>`;
      // Weapon damage
      const dmin = full.dmg_min1||0, dmax = full.dmg_max1||0, delay = full.delay||0;
      if (dmin || dmax) {
        const dt = DMG_SCHOOL_NAMES[full.dmg_type1||0];
        body += `<div style="${wht}">${dt?dt+' Damage: ':'Damage: '}${Math.round(dmin)} - ${Math.round(dmax)}</div>`;
        if (delay) body += `<div style="${wht}">Speed ${(delay/1000).toFixed(2)}</div>`;
        if (delay && (dmin||dmax)) {
          const dps = ((dmin+dmax)/2)/(delay/1000);
          body += `<div style="${grey}">(${dps.toFixed(1)} Damage per second)</div>`;
        }
      }
      // Heirloom/scaling items have no fixed stats — the server computes them
      // from ScalingStatDistribution/Value into full._heirloom.
      const hl = full._heirloom;
      const renderStat = (t, v) => {
        const sn = ITEM_STAT_NAMES[t];
        if (!sn || !v) return '';
        const isPrimary = [1,3,4,5,6,7].includes(t);
        return isPrimary
          ? `<div style="${wht}">${v>0?'+':''}${v} ${sn}</div>`
          : `<div style="${grn}">Equip: Increases ${sn} by ${v}.</div>`;
      };
      // Armor / Block
      const armorVal = full.armor || (hl && hl.armor) || 0;
      if (armorVal)  body += `<div style="${wht}">${armorVal} Armor</div>`;
      if (full.block)  body += `<div style="${wht}">${full.block} Block</div>`;
      // Stats (Strength, Stamina, ...) — raw fields, then scaled heirloom stats
      for (let i=1;i<=10;i++) body += renderStat(full[`stat_type${i}`]||0, full[`stat_value${i}`]||0);
      if (hl && hl.stats) {
        for (const s of hl.stats) body += renderStat(s.stat_id, s.value);
      }
      // Resistances
      const resMap = [['holy_res','Holy'],['fire_res','Fire'],['nature_res','Nature'],
        ['frost_res','Frost'],['shadow_res','Shadow'],['arcane_res','Arcane']];
      for (const [k,n] of resMap) if (full[k]) body += `<div style="${wht}">+${full[k]} ${n} Resistance</div>`;
      // Durability
      if (full.MaxDurability) body += `<div style="${wht}">Durability ${full.MaxDurability}/${full.MaxDurability}</div>`;
      // Required level
      const reqL = full.RequiredLevel || it.rlvl || 0;
      if (reqL > 0) body += `<div style="${wht}">Requires Level ${reqL}</div>`;
      // Item level
      if (full.ItemLevel || it.ilvl) body += `<div style="${gold}">Item Level ${full.ItemLevel||it.ilvl}</div>`;
      if (hl) body += `<div style="color:#e0a0ff;font-size:0.66rem;opacity:.85">✦ Heirloom — scaled to level ${hl.level}</div>`;
      // On-hit / on-use / on-equip spell effects
      if (full._spells && full._spells.length) {
        const TRIG = {0:'Use:', 1:'Equip:', 2:'Chance on hit:', 5:'Use:', 6:'Use:'};
        for (const sp of full._spells) {
          const txt = (sp.desc || sp.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,' ');
          if (!txt) continue;
          const label = TRIG[sp.trigger] || 'Equip:';
          body += `<div style="${grn};margin-top:3px;line-height:1.35">${label} ${txt}</div>`;
        }
      }
      // Sell price
      if (full.SellPrice) {
        const sp = full.SellPrice;
        const g = Math.floor(sp/10000), s = Math.floor((sp%10000)/100), c = sp%100;
        const parts = [];
        if (g) parts.push(`<span style="color:#ffd700">${g}g</span>`);
        if (s) parts.push(`<span style="color:#c7c7cf">${s}s</span>`);
        if (c) parts.push(`<span style="color:#c87533">${c}k</span>`);
        if (parts.length) body += `<div style="${grey}">Sell Price: ${parts.join(' ')}</div>`;
      }
      // Flavor text
      if (full.description) body += `<div style="color:#ffd200;font-size:0.7rem;font-style:italic;margin-top:3px">"${full.description}"</div>`;
    } else if (it.ilvl || it.rlvl) {
      if (it.ilvl) body += `<div style="color:var(--muted);font-size:0.72rem">Item Level <span style="color:var(--text)">${it.ilvl}</span></div>`;
      if (it.rlvl && parseInt(it.rlvl) > 0) body += `<div style="color:var(--muted);font-size:0.72rem">Req. Level <span style="color:var(--text)">${it.rlvl}</span></div>`;
    }
    if (parseInt(it.amount||1) > 1)
      body += `<div style="color:var(--gold);font-size:0.72rem">Count: ${it.amount}</div>`;

    body += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08);font-size:0.62rem;color:rgba(255,255,255,.3)">
      ID: ${it.id||'?'} · ${it.source==='dbc' ? '<span style="color:var(--gold)">📖 DBC (read-only)</span>' : '<span>Right Click → remove</span>'}
    </div>`;
    return body;
  }

  function showItemTooltip(e, it) {
    document.getElementById('bag-tooltip')?.remove();
    const qc = QUALITY_COLOR[it.quality||0] || '#fff';
    const tip = document.createElement('div');
    tip.id = 'bag-tooltip';
    tip.style.cssText = `position:fixed;z-index:2000;background:linear-gradient(135deg,#1c1408,#100a02);
      border:1px solid ${qc};border-radius:6px;padding:9px 11px;
      font-family:'Share Tech Mono',monospace;font-size:0.78rem;color:var(--text);
      pointer-events:none;min-width:200px;max-width:280px;
      box-shadow:0 4px 20px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.04)`;
    const entry = parseInt(it.id||0);
    tip.innerHTML = _renderItemTooltipBody(it, _itemFullCache[entry] || null);
    document.body.appendChild(tip);
    positionTooltip(tip, e);

    // Lazy-load full item data if not cached, then re-render in place
    if (entry && !_itemFullCache[entry]) {
      fetch(`${API}/item/${entry}`).then(r=>r.json()).then(d=>{
        if (!d.ok) return;
        _itemFullCache[entry] = d.data;
        // Only update if this tooltip is still the active one
        const live = document.getElementById('bag-tooltip');
        if (live === tip) live.innerHTML = _renderItemTooltipBody(it, d.data);
      }).catch(()=>{});
    }
  }

  // ─── Item Set search ──────────────────────────────────────────────────────

  const _spellIconCache = {};  // {spellId → iconName}
  const _itemIconCache  = {};  // {itemEntry → iconName}

  function itemIconUrl(entry) {
    const n = _itemIconCache[entry];
    return n ? `https://wow.zamimg.com/images/wow/icons/medium/${n}.jpg` : null;
  }

  async function loadItemIconsBatch(itemIds) {
    if (!itemIds || !itemIds.length) return;
    const missing = itemIds.filter(id => !_itemIconCache[id]);
    if (!missing.length) { applyItemIcons(); return; }
    try {
      const r = await fetch(`${API}/item/icons/bulk`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ids: missing})
      });
      const d = await r.json();
      if (d.ok) Object.assign(_itemIconCache, d.data);
    } catch(e) { /* silent fail — icons stay as text fallback */ }
    applyItemIcons();
  }

  function applyItemIcons() {
    // Update all <img data-item> elements in the current slot grid
    document.querySelectorAll('img[data-item]').forEach(img => {
      const entry = parseInt(img.dataset.item);
      const url   = itemIconUrl(entry);
      if (!url || img.src === url) return;
      img.src = url;
      img.style.display = 'block';
      const fallback = img.nextElementSibling;
      if (fallback) fallback.style.display = 'none';
    });
  }

  async function loadSpellIconsBatch(spellIds) {
    const missing = spellIds.filter(id => !_spellIconCache[id]);
    if (!missing.length) { applySpellIcons(); return; }
    try {
      const r = await fetch(`${API}/spell/icons/bulk`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ids: missing})
      });
      const d = await r.json();
      if (d.ok) Object.assign(_spellIconCache, d.data);
    } catch(e) {
      try {
        const r2 = await fetch(`${API}/spell/icons?ids=${missing.join(',')}`);
        const d2 = await r2.json();
        if (d2.ok) Object.assign(_spellIconCache, d2.data);
      } catch(e2) {}
    }
    applySpellIcons();
  }

  function applySpellIcons() {
    // Update existing img[data-spell] elements
    document.querySelectorAll('img[data-spell]').forEach(img => {
      const sid = parseInt(img.dataset.spell);
      const url = sbIconUrl(sid, false);
      if (!url || img.src === url) return;
      img.src = url;
      img.style.display = 'block';
      const fallback = img.nextElementSibling;
      if (fallback && fallback.tagName !== 'IMG') fallback.style.display = 'none';
    });
    // Inject icons into letter-only rows
    document.querySelectorAll('[data-spell-id]').forEach(row => {
      const sid = parseInt(row.dataset.spellId);
      const url = sbIconUrl(sid, false);
      if (!url) return;
      // Find the icon container (first child div with border-radius styling)
      const container = row.querySelector('div[style*="width:40px"]');
      if (!container) return;
      let img = container.querySelector('img[data-spell]');
      if (!img) {
        img = document.createElement('img');
        img.dataset.spell = sid;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        img.onerror = function() {
          this.style.display = 'none';
          const fb = this.nextElementSibling;
          if (fb) fb.style.display = 'flex';
        };
        container.insertBefore(img, container.firstChild);
      }
      if (img.src !== url) {
        img.src = url;
        const fallback = img.nextElementSibling;
        if (fallback && fallback.tagName !== 'IMG') fallback.style.display = 'none';
      }
    });
  }

  // ── Tooltip system ────────────────────────────────────────────────────────
  const _tooltipCache = {};  // {spellId → full tooltip data from /api/spell/tooltip/<id>}
  let   _spellTipEl   = null;
  let   _tipMoveHandler = null;

  function hideSpellTooltip() {
    if (_spellTipEl) { _spellTipEl.remove(); _spellTipEl = null; }
    if (_tipMoveHandler) { document.removeEventListener('mousemove', _tipMoveHandler); _tipMoveHandler = null; }
  }

  function _tipPosition(tip, e) {
    const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX + pad, y = e.clientY - h / 2;
    if (x + w > vw - 8) x = e.clientX - w - pad;
    if (y < 8)          y = 8;
    if (y + h > vh - 8) y = vh - h - 8;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }

  function _buildTooltip(data, fallbackColor) {
    // data from /api/spell/tooltip/<id>  OR  {name, color, icon, isSkill, rank}
    const color   = data.color || fallbackColor || '#FFD700';
    const icon    = data.icon  || '';
    const iconUrl = icon ? `https://wow.zamimg.com/images/wow/icons/medium/${icon.toLowerCase()}.jpg` : null;
    const name    = data.name  || `Spell #${data.id}`;
    const rank    = data.rank  || '';
    const desc    = (data.desc||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,'<br>');
    const res     = data.resource  || '';
    const cast    = data.cast_time || '';
    const rng     = data.range     || '';
    const cd      = data.cooldown  || '';
    const loading = data._loading;

    // Icon cell
    const iconHtml = iconUrl
      ? `<img src="${iconUrl}" width="36" height="36"
           style="border:1px solid rgba(255,255,255,.25);border-radius:3px;display:block;flex-shrink:0"
           onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:36px;flex-shrink:0;background:rgba(0,0,0,.4);
           border:1px solid rgba(255,255,255,.15);border-radius:3px;
           display:flex;align-items:center;justify-content:center;
           font-size:1rem;color:${color}">✦</div>`;

    // Stats row (resource | range  /  cast | cooldown)
    const statsLeft  = [res, rng].filter(Boolean).join('   ');
    const statsRight = [cast, cd].filter(Boolean).join('   ');
    const hasStats   = statsLeft || statsRight;

    return `
<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:${rank||hasStats||desc?'8px':'0'}">
  ${iconHtml}
  <div style="min-width:0">
    <div style="color:${color};font-size:0.92rem;font-weight:700;font-family:'Rajdhani',sans-serif;
      line-height:1.2;word-break:break-word">${name}</div>
    ${rank ? `<div style="color:#b8a038;font-size:0.72rem;margin-top:1px">${rank}</div>` : ''}
  </div>
</div>
${hasStats ? `
<div style="display:flex;justify-content:space-between;gap:12px;
  border-top:1px solid rgba(212,175,55,.2);padding-top:5px;margin-bottom:5px">
  <span style="color:#c8b048;font-size:0.72rem;font-family:'Share Tech Mono',monospace">${statsLeft}</span>
  <span style="color:#c8b048;font-size:0.72rem;font-family:'Share Tech Mono',monospace;text-align:right">${statsRight}</span>
</div>` : ''}
${desc ? `
<div style="color:#c8bfa0;font-size:0.75rem;line-height:1.5;font-family:'Share Tech Mono',monospace;
  ${hasStats?'':'border-top:1px solid rgba(212,175,55,.2);padding-top:5px;'}">${desc}</div>` : ''}
${loading ? `<div style="color:rgba(200,160,60,.3);font-size:0.68rem;margin-top:4px">Loading…</div>` : ''}
<div style="color:rgba(200,160,60,.25);font-size:0.6rem;margin-top:5px;font-family:monospace;
  border-top:1px solid rgba(212,175,55,.1);padding-top:4px">ID: ${data.id}</div>`;
  }

  function _showBuiltTooltip(data, e, fallbackColor) {
    hideSpellTooltip();
    _spellTipEl = document.createElement('div');
    _spellTipEl.dataset.spell = data.id;
    _spellTipEl.style.cssText = `
      position:fixed;z-index:9000;pointer-events:none;
      background:linear-gradient(135deg,#1c1408 0%,#100a02 60%,#080400 100%);
      border:1px solid;border-image:linear-gradient(135deg,#c8a840,#6b4e10,#c8a840) 1;
      border-radius:0;
      padding:10px 12px;
      min-width:200px;max-width:300px;
      box-shadow:0 0 0 1px rgba(0,0,0,.8),0 8px 32px rgba(0,0,0,.95),inset 0 1px 0 rgba(212,175,55,.08);
      font-family:'Share Tech Mono',monospace;
    `;
    // WoW tooltips use a bordered box — simulate with outline
    _spellTipEl.style.outline = '1px solid rgba(30,20,5,.9)';
    _spellTipEl.innerHTML = _buildTooltip(data, fallbackColor);
    document.body.appendChild(_spellTipEl);
    _tipPosition(_spellTipEl, e);
    _tipMoveHandler = ev => { if (_spellTipEl) _tipPosition(_spellTipEl, ev); };
    document.addEventListener('mousemove', _tipMoveHandler);
  }

  // Entry point: called on mouseenter of a spell/skill row
  async function sbShowTip(e, el) {
    const spellId  = parseInt(el.dataset.spellId);
    const isSkill  = el.dataset.isSkill === '1';
    const rowName  = el.dataset.name  || `#${spellId}`;
    const rowColor = el.dataset.color || '#FFD700';
    const rowRank  = el.dataset.rank  || '';

    if (isSkill) {
      const icon = (_spellIconCache[spellId] || '').toLowerCase();
      _showBuiltTooltip({
        id: spellId, name: rowName, color: rowColor, icon,
        rank: rowRank ? `Start value: ${rowRank}` : 'Starting ability',
      }, e, rowColor);
      return;
    }

    // Show immediate placeholder
    const preIcon = (_spellIconCache[spellId] || '').toLowerCase();
    _showBuiltTooltip({ id: spellId, name: rowName, color: rowColor, icon: preIcon, _loading: true }, e, rowColor);

    // Check cache
    if (_tooltipCache[spellId]) {
      _showBuiltTooltip(_tooltipCache[spellId], e, rowColor);
      return;
    }

    // Fetch rich tooltip data
    try {
      const r = await fetch(`${API}/spell/tooltip/${spellId}`);
      const d = await r.json();
      if (d.ok) {
        const td = d.data;
        // Use icon from cache if DBC not loaded yet
        if (!td.icon) td.icon = preIcon;
        if (!td.color) td.color = rowColor;
        _tooltipCache[spellId] = td;
        if (_spellTipEl && _spellTipEl.dataset.spell == spellId)
          _showBuiltTooltip(td, e, rowColor);
      }
    } catch(_) {}
  }
