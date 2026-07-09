/* helpers.js — extracted from ASP_Admin.html (verbatim) */
  function showToast(msg, type = 'success') {
    let t = document.getElementById('editor-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'editor-toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  // In-app confirm dialog (replaces the native browser confirm()). Returns a Promise<boolean>.
  function uiConfirm(message, opts = {}) {
    const { title = 'Please confirm', okText = 'OK', cancelText = 'Cancel', danger = true } = opts;
    return new Promise(resolve => {
      document.getElementById('ui-confirm-overlay')?.remove();
      const ov = document.createElement('div');
      ov.id = 'ui-confirm-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
      const okBg = danger ? 'var(--red,#e0304a)' : 'var(--green,#1eff00)';
      const okFg = danger ? '#fff' : '#000';
      ov.innerHTML = `
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:440px;max-width:100%;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.6)">
          <div style="font-size:0.98rem;font-weight:600;color:var(--gold);margin-bottom:12px">${_icEsc(title)}</div>
          <div style="font-size:0.85rem;color:var(--text);line-height:1.5;margin-bottom:20px;white-space:pre-wrap">${_icEsc(message)}</div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="ui-confirm-cancel" style="background:var(--panel);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px 18px;font-size:0.82rem;cursor:pointer">${_icEsc(cancelText)}</button>
            <button id="ui-confirm-ok" style="background:${okBg};border:none;border-radius:6px;color:${okFg};padding:8px 20px;font-size:0.82rem;font-weight:600;cursor:pointer">${_icEsc(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const done = val => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      const onKey = ev => { if (ev.key === 'Escape') done(false); if (ev.key === 'Enter') done(true); };
      ov.querySelector('#ui-confirm-ok').onclick = () => done(true);
      ov.querySelector('#ui-confirm-cancel').onclick = () => done(false);
      ov.onclick = ev => { if (ev.target === ov) done(false); };
      document.addEventListener('keydown', onKey);
      ov.querySelector('#ui-confirm-ok').focus();
    });
  }

  function _icInputStyle() {
    return "width:100%;box-sizing:border-box;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.82rem;padding:5px 8px";
  }

  function _icEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  function _icRenderEnum(id, enumMap, value) {
    let opts = '';
    const keys = Object.keys(enumMap || {}).sort((a,b)=>parseInt(a)-parseInt(b));
    for (const k of keys) {
      const sel = (parseInt(value) === parseInt(k)) ? ' selected' : '';
      opts += `<option value="${k}"${sel}>${k} — ${_icEsc(enumMap[k])}</option>`;
    }
    return `<select id="ic-${id}" style="${_icInputStyle()}">${opts}</select>`;
  }

  function _icRenderBitmask(id, enumMap, value) {
    const v = (value == null || value === '' || value === -1) ? -1 : parseInt(value);
    const allMode = (v === -1);
    let checks = '';
    const keys = Object.keys(enumMap || {}).sort((a,b)=>parseInt(a)-parseInt(b));
    for (const k of keys) {
      const bit = parseInt(k);
      const on = !allMode && (v & bit) === bit;
      checks += `<label style="display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:3px;padding:2px 6px;margin:2px;font-size:0.7rem;cursor:pointer">
        <input type="checkbox" data-bit="${bit}" data-bm="${id}" ${on?'checked':''} style="margin:0">
        <span>${_icEsc(enumMap[k])}</span>
      </label>`;
    }
    return `<div id="ic-${id}-wrap" data-bitmask-id="${id}">
      <label style="display:inline-flex;align-items:center;gap:4px;margin-bottom:4px;font-size:0.7rem;color:var(--cyan)">
        <input type="checkbox" id="ic-${id}-all" ${allMode?'checked':''} onchange="_icToggleBitmaskAll('${id}',this.checked)" style="margin:0"> All (-1)
      </label>
      <div id="ic-${id}-checks" style="display:flex;flex-wrap:wrap;max-height:110px;overflow-y:auto;border:1px dashed rgba(255,255,255,.06);border-radius:4px;padding:3px;${allMode?'opacity:.4;pointer-events:none':''}">
        ${checks}
      </div>
    </div>`;
  }

  function _icToggleBitmaskAll(id, allChecked) {
    const cont = document.getElementById(`ic-${id}-checks`);
    if (cont) {
      cont.style.opacity = allChecked ? '.4' : '1';
      cont.style.pointerEvents = allChecked ? 'none' : '';
    }
  }

  function _icCollectBitmask(id) {
    const allEl = document.getElementById(`ic-${id}-all`);
    if (allEl?.checked) return -1;
    let mask = 0;
    document.querySelectorAll(`#ic-${id}-checks input[data-bit]`).forEach(cb => {
      if (cb.checked) mask |= parseInt(cb.dataset.bit);
    });
    return mask;
  }

  function _icSsvMaskChange(sel, inputId) {
    if (sel.value !== '__custom__') return;
    const raw = prompt('Custom SSV bitmask (number):', '');
    const num = parseInt(raw);
    if (!raw || isNaN(num)) {
      // revert to first option
      sel.selectedIndex = 0;
      return;
    }
    _icSsvSetValue(sel, num);
  }
  function _icSsvSetValue(sel, num) {
    // Match existing option or add custom one at top
    let found = false;
    for (const o of sel.options) {
      if (o.value !== '__custom__' && parseInt(o.value) === num) {
        sel.value = o.value; found = true; break;
      }
    }
    if (!found) {
      // Remove any existing "Custom mask" custom-value option (first one)
      if (sel.options[0] && sel.options[0].textContent.includes('Custom mask') && sel.options[0].value !== '__custom__') {
        sel.remove(0);
      }
      const opt = document.createElement('option');
      opt.value = String(num);
      opt.textContent = `${num} — Custom mask`;
      opt.selected = true;
      sel.insertBefore(opt, sel.firstChild);
    }
  }

  function eField(label, id, val, type='number', wide=false, hint='', readonly=false) {
    const w = wide ? ' e-field-wide' : '';
    const ro = readonly ? ' readonly style="color:var(--muted)"' : '';
    let inner = `<input type="${type}" id="${id}" value="${String(val).replace(/"/g,'&quot;')}" oninput="markAnyDirty('${id}')"${ro}>`;
    const h = hint ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:2px">${hint}</div>` : '';
    return `<div class="e-field${w}"><label>${label}</label>${inner}${h}</div>`;
  }

  function eTextarea(label, id, val, rows=3) {
    const safe = String(val||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="e-field e-field-wide"><label>${label}</label>`+
      `<textarea id="${id}" rows="${rows}" oninput="markAnyDirty('${id}')" `+
      `style="resize:vertical;background:var(--bg);color:var(--text);border:1px solid var(--border);`+
      `border-radius:6px;padding:6px;width:100%;font-size:0.82rem;font-family:inherit">${safe}</textarea></div>`;
  }

  function eSelect(label, id, optObj, val, hint='') {
    const keys = Object.keys(optObj).map(Number).sort((a,b)=>a-b);
    let opts = keys.map(k => `<option value="${k}" ${k==val?'selected':''}>${k} — ${optObj[k]}</option>`).join('');
    const h = hint ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:2px">${hint}</div>` : '';
    return `<div class="e-field"><label>${label}</label><select id="${id}" onchange="markAnyDirty('${id}')">${opts}</select>${h}</div>`;
  }

  function eSelectStr(label, id, options, val, hint='') {
    let opts = options.map(o => `<option value="${o}" ${o===val?'selected':''}>${o||'(Default)'}</option>`).join('');
    const h = hint ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:2px">${hint}</div>` : '';
    return `<div class="e-field"><label>${label}</label><select id="${id}" onchange="markAnyDirty('${id}')">${opts}</select>${h}</div>`;
  }

  // ── Bitmask-Widget ──────────────────────────────────────────────────────
  function eBitmask(label, id, bits, val, hint='') {
    const num = parseInt(val) || 0;
    let cbHtml = '';
    // Special -1 "All" option
    if ('-1' in bits || bits['-1']) {
      const allLabel = bits['-1'] || bits[-1] || 'All';
      cbHtml += `<label><input type="checkbox" data-bit="-1" ${num === -1 ? 'checked' : ''} onchange="updateBitmask('${id}')"> ${allLabel}</label>`;
      cbHtml += '<hr class="bp-sep">';
    }
    Object.entries(bits).forEach(([bit, name]) => {
      const b = parseInt(bit);
      if (b < 0) return; // -1 already handled above
      const checked = num !== -1 && (num & b) !== 0;
      cbHtml += `<label><input type="checkbox" data-bit="${b}" ${checked ? 'checked' : ''} onchange="updateBitmask('${id}')"> ${name}</label>`;
    });
    const h = hint ? `<div class="e-field-hint">${hint}</div>` : '';
    const display = num === -1 ? 'All' : (num === 0 ? 'No' : `${num}`);
    return `<div class="e-field">
      <label>${label}</label>
      <div class="bitmask-wrap">
        <input type="number" id="${id}" value="${num}" oninput="syncBitmaskPopover('${id}');markAnyDirty('${id}')">
        <button type="button" class="bitmask-btn" onclick="toggleBitmaskPopover('${id}-pop')" title="Selection">☰ ${display}</button>
        <div id="${id}-pop" class="bitmask-popover" style="display:none">${cbHtml}</div>
      </div>${h}</div>`;
  }

  function updateBitmask(id) {
    const pop = document.getElementById(id + '-pop');
    const inp = document.getElementById(id);
    const btn = pop ? pop.previousElementSibling : null;
    if (!pop || !inp) return;
    const allCb = pop.querySelector('input[data-bit="-1"]');
    let val = 0;
    if (allCb && allCb.checked) {
      val = -1;
      pop.querySelectorAll('input[type=checkbox]').forEach(cb => { if (cb.dataset.bit !== '-1') cb.checked = false; });
    } else {
      pop.querySelectorAll('input[type=checkbox]').forEach(cb => {
        const b = parseInt(cb.dataset.bit);
        if (b > 0 && cb.checked) val |= b;
      });
    }
    inp.value = val;
    if (btn) btn.textContent = `☰ ${val === -1 ? 'All' : (val === 0 ? 'No' : val)}`;
    markAnyDirty(id);
  }

  function syncBitmaskPopover(id) {
    const pop = document.getElementById(id + '-pop');
    const inp = document.getElementById(id);
    const btn = pop ? pop.previousElementSibling : null;
    if (!pop || !inp) return;
    const num = parseInt(inp.value) || 0;
    pop.querySelectorAll('input[type=checkbox]').forEach(cb => {
      const b = parseInt(cb.dataset.bit);
      if (b === -1) cb.checked = num === -1;
      else cb.checked = num !== -1 && (num & b) !== 0;
    });
    if (btn) btn.textContent = `☰ ${num === -1 ? 'All' : (num === 0 ? 'No' : num)}`;
  }

  function toggleBitmaskPopover(popId) {
    const pop = document.getElementById(popId);
    if (!pop) return;
    const isOpen = pop.style.display !== 'none';
    document.querySelectorAll('.bitmask-popover').forEach(p => p.style.display = 'none');
    if (!isOpen) pop.style.display = 'block';
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.bitmask-wrap')) {
      document.querySelectorAll('.bitmask-popover').forEach(p => p.style.display = 'none');
    }
  });

  function eSection(title) {
    return `<div class="easy-section-title">${title}</div><div class="easy-grid">`;
  }

  function markAnyDirty(id) {
    if (id.startsWith('se-')) { spellDirty = true; const el = document.getElementById('spell-dirty'); if(el) el.style.display=''; }
    else if (id.startsWith('qe-')) { questDirty = true; const el = document.getElementById('quest-dirty'); if(el) el.style.display=''; }
    else if (id.startsWith('ce-')) { creatureDirty = true; const el = document.getElementById('creature-dirty'); if(el) el.style.display=''; }
    else markDirty();
  }

  function setupSearchInput(inputId, searchFn, dropdownId) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    let timer = null;
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (inp.value.trim().length >= 2) searchFn(); }, 350);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') searchFn(); });
    document.addEventListener('click', e => {
      if (!e.target.closest('#'+inputId) && !e.target.closest('#'+dropdownId)) {
        const d = document.getElementById(dropdownId);
        if (d) d.classList.remove('open');
      }
    });
  }

  document.addEventListener('app:ready', () => {
    setupSearchInput('spell-search-input',    searchSpells,    'spell-search-results');
    setupSearchInput('quest-search-input',    searchQuests,    'quest-search-results');
    setupSearchInput('creature-search-input', searchCreatures, 'creature-search-results');
  });

