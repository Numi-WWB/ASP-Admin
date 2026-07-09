/* dbc-editor.js — extracted from ASP_Admin.html (verbatim) */
  async function icShowMpqEditor() {
    document.getElementById('ic-mpq-modal')?.remove();
    const m = `<div id="ic-mpq-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:720px;max-width:100%;max-height:85vh;overflow-y:auto;padding:22px;position:relative">
        <button onclick="document.getElementById('ic-mpq-modal').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="font-size:1rem;font-weight:600;color:var(--cyan);margin-bottom:6px">📦 MPQ-Editor</div>
        <div style="color:var(--muted);font-size:0.72rem;margin-bottom:14px">Files are placed in <code>mpq\\extras\\</code> and packed into the patch MPQ on rebuild.</div>

        <div style="font-size:0.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📂 MPQ contents (read from binary)</div>
        <div id="ic-mpq-inspect" style="margin-bottom:14px">
          <div style="color:var(--muted);font-size:0.78rem">Loading…</div>
        </div>

        <div style="font-size:0.7rem;color:var(--cyan);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📁 Extras (source for rebuild)</div>
        <div id="ic-mpq-files" style="margin-bottom:14px">
          <div style="color:var(--muted);font-size:0.78rem">Loading…</div>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px">
          <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Add / replace file</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <input id="ic-mpq-upload-path" placeholder="MPQ path (e.g. DBFilesClient\\Spell.dbc)"
              style="flex:1;min-width:240px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:6px 9px">
            <input id="ic-mpq-upload-file" type="file" style="font-size:0.75rem">
            <button class="e-btn e-btn-small" onclick="icMpqUpload()">＋ Upload</button>
          </div>
          <div style="font-size:0.65rem;color:var(--muted);margin-top:4px">When you pick a local file, the path is suggested automatically.</div>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
          <button class="e-btn e-btn-green" onclick="icRebuildMpq()">🔁 Rebuild MPQ</button>
          <span style="color:var(--muted);font-size:0.7rem;margin-left:10px">Changes take effect only after rebuild</span>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', m);
    // Auto-suggest path when file picked
    document.getElementById('ic-mpq-upload-file')?.addEventListener('change', e => {
      const f = e.target.files?.[0]; if (!f) return;
      const pathEl = document.getElementById('ic-mpq-upload-path');
      if (pathEl && !pathEl.value) {
        const ext = (f.name.split('.').pop()||'').toLowerCase();
        const prefix = ext === 'dbc' ? 'DBFilesClient\\' : ext === 'blp' ? 'Interface\\' : '';
        pathEl.value = prefix + f.name;
      }
    });
    icMpqLoadList();
    icMpqInspect();
  }

  async function icMpqInspect() {
    const box = document.getElementById('ic-mpq-inspect');
    if (!box) return;
    box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">Reading MPQ…</div>';
    try {
      const r = await fetch(`${API}/mpq/inspect`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red);font-size:0.78rem">${d.error}</div>`; return; }
      const files = d.data.files || [];
      if (!files.length) {
        box.innerHTML = '<div style="color:var(--muted);font-size:0.78rem">MPQ is empty or does not exist yet. First 🔁 Rebuild MPQ.</div>';
        return;
      }
      box.innerHTML = `<div style="font-size:0.65rem;color:var(--muted);margin-bottom:6px">${files.length} file(s) physically in <code>${d.data.mpq_path.replace(/</g,'&lt;')}</code></div>` +
        files.map(f => {
          const sizeKB = (f.size/1024).toFixed(1);
          const unknown = f.path.startsWith('<unknown');
          const isDbc = f.path.toLowerCase().endsWith('.dbc');
          const safePath = f.path.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
          const extractBtn = unknown ? '' :
            `<a href="${API}/mpq/extract?path=${encodeURIComponent(f.path)}" target="_blank"
                style="background:none;border:1px solid var(--gold);color:var(--gold);border-radius:4px;padding:3px 8px;font-size:0.72rem;text-decoration:none">⬇ Extract</a>`;
          const editBtn = (!unknown && isDbc)
            ? `<button onclick="icDbcEdit('${safePath}')"
                  style="background:none;border:1px solid var(--cyan);color:var(--cyan);border-radius:4px;padding:3px 8px;font-size:0.72rem;cursor:pointer">✏ Edit</button>`
            : '';
          return `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-size:0.78rem">
            <code style="flex:1;color:${unknown?'var(--muted)':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.path.replace(/</g,'&lt;')}</code>
            <span style="color:var(--muted);font-size:0.7rem;min-width:60px;text-align:right">${sizeKB} KB</span>
            ${editBtn}
            ${extractBtn}
          </div>`;
        }).join('');
    } catch(e) { box.innerHTML = `<div style="color:var(--red);font-size:0.78rem">${e.message}</div>`; }
  }

  // ─── DBC Inline Editor ────────────────────────────────────────────────────

  let _dbcState = null; // {path, page, pageSize, search, data, dirty:{idx:{field:value}}}

  async function icDbcEdit(path) {
    _dbcState = {path, page:0, pageSize:50, search:'', onlyCustom:false, dirty:{}};
    document.getElementById('ic-dbc-modal')?.remove();
    const m = `<div id="ic-dbc-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:950;display:flex;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--panel);border:1px solid var(--cyan);border-radius:10px;width:96vw;height:92vh;display:flex;flex-direction:column;padding:18px;position:relative">
        <button onclick="document.getElementById('ic-dbc-modal').remove()" style="position:absolute;top:10px;right:14px;background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer">✕</button>
        <div style="font-size:1rem;font-weight:600;color:var(--cyan);margin-bottom:4px">✏ DBC-Editor</div>
        <code style="color:var(--muted);font-size:0.78rem;margin-bottom:10px">${path.replace(/</g,'&lt;')}</code>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
          <input id="dbc-search" placeholder="Search: 60001-60010, 35273, 26383 (range, comma list)" value=""
            title="Separate multiple values with commas; range with a hyphen (60001-60010)"
            style="flex:1;min-width:320px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:6px 9px"
            onkeydown="if(event.key==='Enter')_dbcDoSearch()">
          <button class="e-btn e-btn-small" onclick="_dbcDoSearch()">🔍 Search</button>
          <button id="dbc-only-custom-btn" class="e-btn e-btn-small" onclick="_dbcToggleOnlyCustom()"
            title="Only show custom items (ID ≥ 60000)">⭐ Only Custom</button>
          <span id="dbc-pagination" style="color:var(--muted);font-size:0.75rem"></span>
          <button class="e-btn e-btn-small" onclick="_dbcPage(-1)">◀</button>
          <button class="e-btn e-btn-small" onclick="_dbcPage(1)">▶</button>
          <span id="dbc-dirty-counter" style="color:var(--orange);font-size:0.75rem"></span>
          <button class="e-btn e-btn-green" onclick="_dbcSave()">💾 Save + MPQ rebuild</button>
        </div>

        <div id="dbc-grid" style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:6px;background:var(--bg);font-family:'Share Tech Mono',monospace;font-size:0.78rem">
          <div style="color:var(--muted);padding:30px;text-align:center">Loading DBC…</div>
        </div>
        <div style="color:var(--muted);font-size:0.68rem;margin-top:6px">
          ℹ fields are editable as <b>uint32</b>. Columns with a detected string are marked green (value = offset in the string block; read-only).
          Item.dbc edits go directly to the server file; other DBCs land in <code>extras\\</code>. On save the MPQ is rebuilt automatically.
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', m);
    _dbcLoad();
  }

  async function _dbcLoad() {
    if (!_dbcState) return;
    const {path, page, pageSize, search, onlyCustom} = _dbcState;
    const grid = document.getElementById('dbc-grid');
    grid.innerHTML = '<div style="color:var(--muted);padding:30px;text-align:center">Loading DBC…</div>';
    // Reflect button visual state
    const btn = document.getElementById('dbc-only-custom-btn');
    if (btn) {
      if (onlyCustom) { btn.style.background = 'rgba(30,255,0,.18)'; btn.style.borderColor = '#1eff00'; btn.style.color = '#1eff00'; }
      else            { btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = ''; }
    }
    try {
      const url = `${API}/mpq/dbc/view?path=${encodeURIComponent(path)}&page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}&only_custom=${onlyCustom?1:0}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!d.ok) { grid.innerHTML = `<div style="color:var(--red);padding:30px">${d.error}</div>`; return; }
      _dbcState.data = d.data;
      _dbcRender();
    } catch(e) { grid.innerHTML = `<div style="color:var(--red);padding:30px">${e.message}</div>`; }
  }

  function _dbcRender() {
    const grid = document.getElementById('dbc-grid');
    const D = _dbcState.data;
    const nInt = D.n_int;
    const isStr = D.is_string_col || [];
    const pages = Math.max(1, Math.ceil(D.filtered_count / _dbcState.pageSize));
    document.getElementById('dbc-pagination').textContent =
      `${D.filtered_count} Records · Page ${D.page + 1}/${pages} · ${D.record_count} total in DBC`;
    _dbcUpdateDirtyCounter();

    const fieldNames = D.field_names || [];
    let html = `<table style="border-collapse:collapse;white-space:nowrap">
      <thead><tr style="position:sticky;top:0;background:var(--panel);z-index:5">
        <th style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--gold);text-align:right;min-width:60px;position:sticky;left:0;background:var(--panel);z-index:6">idx</th>`;
    for (let c = 0; c < nInt; c++) {
      const color = isStr[c] ? 'var(--green)' : 'var(--gold)';
      const name = fieldNames[c] || `F${c}`;
      html += `<th style="padding:5px 10px;border-bottom:1px solid var(--border);color:${color};text-align:right;min-width:100px">${name}${isStr[c]?' (str)':''}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (const rec of D.records) {
      const idx = rec._idx;
      const dirtyMap = _dbcState.dirty[idx] || {};
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:3px 8px;color:var(--muted);text-align:right;position:sticky;left:0;background:var(--bg);z-index:2">#${idx}</td>`;
      for (let c = 0; c < nInt; c++) {
        const val = dirtyMap[c] != null ? dirtyMap[c] : rec.values[c];
        const dirty = dirtyMap[c] != null;
        const isStrCol = isStr[c];
        const strVal = (rec.strings || {})[c];
        if (isStrCol) {
          const tip = strVal ? `title="${strVal.replace(/"/g,'&quot;')}"` : '';
          html += `<td ${tip} style="padding:3px 8px;text-align:right;color:var(--green);background:rgba(30,255,0,.05)">${val}${strVal?` <span style="color:var(--muted);font-size:0.7rem">→ "${strVal.length>15?strVal.slice(0,14)+'…':strVal}"</span>`:''}</td>`;
        } else {
          html += `<td style="padding:2px 4px;text-align:right">
            <input type="number" value="${val}" data-idx="${idx}" data-col="${c}" data-orig="${rec.values[c]}"
              oninput="_dbcCellEdit(this)"
              style="width:90px;background:${dirty?'rgba(255,140,0,.15)':'transparent'};border:1px solid ${dirty?'var(--orange)':'transparent'};color:${dirty?'var(--orange)':'var(--text)'};text-align:right;font-family:inherit;font-size:inherit;padding:2px 4px;border-radius:2px">
          </td>`;
        }
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    grid.innerHTML = html;
  }

  function _dbcCellEdit(el) {
    const idx = parseInt(el.dataset.idx);
    const col = parseInt(el.dataset.col);
    const orig = parseInt(el.dataset.orig);
    const val = parseInt(el.value) || 0;
    _dbcState.dirty[idx] = _dbcState.dirty[idx] || {};
    if (val === orig) {
      delete _dbcState.dirty[idx][col];
      if (!Object.keys(_dbcState.dirty[idx]).length) delete _dbcState.dirty[idx];
      el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.color = 'var(--text)';
    } else {
      _dbcState.dirty[idx][col] = val;
      el.style.background = 'rgba(255,140,0,.15)'; el.style.borderColor = 'var(--orange)'; el.style.color = 'var(--orange)';
    }
    _dbcUpdateDirtyCounter();
  }

  function _dbcUpdateDirtyCounter() {
    const total = Object.values(_dbcState.dirty).reduce((s,o) => s + Object.keys(o).length, 0);
    const el = document.getElementById('dbc-dirty-counter');
    if (el) el.textContent = total ? `● ${total} unsaved changes` : '';
  }

  function _dbcPage(delta) {
    if (!_dbcState?.data) return;
    const D = _dbcState.data;
    const pages = Math.max(1, Math.ceil(D.filtered_count / _dbcState.pageSize));
    const newPage = Math.max(0, Math.min(pages - 1, _dbcState.page + delta));
    if (newPage === _dbcState.page) return;
    _dbcState.page = newPage;
    _dbcLoad();
  }

  function _dbcDoSearch() {
    _dbcState.search = document.getElementById('dbc-search').value.trim();
    _dbcState.page = 0;
    _dbcLoad();
  }

  function _dbcToggleOnlyCustom() {
    _dbcState.onlyCustom = !_dbcState.onlyCustom;
    _dbcState.page = 0;
    _dbcLoad();
  }

  async function _dbcSave() {
    const changes = [];
    for (const idx of Object.keys(_dbcState.dirty)) {
      for (const col of Object.keys(_dbcState.dirty[idx])) {
        changes.push({idx: parseInt(idx), field: parseInt(col), value: _dbcState.dirty[idx][col]});
      }
    }
    if (!changes.length) { showToast('No Changes', 'error'); return; }
    if (!confirm(`${changes.length} Changes save + rebuild MPQ?`)) return;
    try {
      const r = await fetch(`${API}/mpq/dbc/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({path: _dbcState.path, changes})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`✓ ${d.data.applied} Changes saved · MPQ rebuilt`);
      _dbcState.dirty = {};
      _dbcLoad();
      // Refresh inspect view if open
      icMpqInspect();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function icMpqLoadList() {
    const box = document.getElementById('ic-mpq-files');
    if (!box) return;
    try {
      const r = await fetch(`${API}/mpq/list`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      box.innerHTML = `<div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${rows.length} File(en) in the MPQ</div>` +
        rows.map(f => {
          const sizeKB = (f.size / 1024).toFixed(1);
          const tag = f.source === 'server-dbc'
            ? `<span style="color:var(--gold);font-size:0.65rem;border:1px solid var(--gold);border-radius:3px;padding:1px 5px">server-dbc</span>`
            : `<span style="color:var(--cyan);font-size:0.65rem;border:1px solid var(--cyan);border-radius:3px;padding:1px 5px">extras</span>`;
          const lockHint = f.locked ? ' 🔒' : '';
          const delBtn = f.locked ? '' : `<button class="e-btn e-btn-small e-btn-danger" onclick="icMpqRemove('${f.path.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">🗑</button>`;
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-size:0.8rem">
            <code style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.path.replace(/</g,'&lt;')}${lockHint}</code>
            <span style="color:var(--muted);font-size:0.7rem;min-width:60px;text-align:right">${sizeKB} KB</span>
            ${tag}
            ${delBtn}
          </div>`;
        }).join('');
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function icMpqUpload() {
    const pathEl = document.getElementById('ic-mpq-upload-path');
    const fileEl = document.getElementById('ic-mpq-upload-file');
    const path = pathEl?.value.trim();
    const file = fileEl?.files?.[0];
    if (!path) { showToast('MPQ path missing','error'); return; }
    if (!file)  { showToast('Choose a file','error');   return; }
    const fd = new FormData();
    fd.append('path', path);
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/mpq/upload`, {method:'POST', body: fd});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${path} uploaded ✓`);
      pathEl.value = ''; fileEl.value = '';
      icMpqLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function icMpqRemove(path) {
    if (!confirm(`${path} remove from MPQ extras?`)) return;
    try {
      const r = await fetch(`${API}/mpq/remove`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({path})
      });
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${path} removed`);
      icMpqLoadList();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function icRebuildMpq() {
    document.getElementById('ic-status').textContent = 'Building MPQ…';
    try {
      const r = await fetch(`${API}/item-create/rebuild-mpq`, {method:'POST'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      const msg = `MPQ rebuilt: ${d.data.mpq_path}` + (d.data.copied_to_client ? ' · Client-Copy ✓' : '');
      document.getElementById('ic-status').innerHTML = `<span style="color:#1eff00">${msg}</span>`;
      showToast('MPQ rebuilt ✓');
      // Refresh MPQ editor views if open
      if (document.getElementById('ic-mpq-modal')) {
        icMpqInspect();
        icMpqLoadList();
      }
    } catch(e) { showToast('Server offline','error'); }
  }

