/* classes.js — extracted from ASP_Admin.html (verbatim) */
  async function loadPlayerClassStats() {
    try {
      const r = await fetch(`${API}/player/classstats?class=${pClassFilter}`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      playerClassData  = d.data;
      playerClassDirty = false;
      renderPlayerClassStats();
    } catch(e) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderPlayerClassStats() {
    const box = document.getElementById('player-content');
    const STAT_COLS = ['BaseHP','BaseMana','Strength','Agility','Stamina','Intellect','Spirit'];

    // Class selector
    let sel = `<select onchange="pClassFilter=parseInt(this.value);loadPlayerClassStats()" style="background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 10px">`;
    for (const [id, name] of Object.entries(PLAYER_CLASS_NAMES)) {
      sel += `<option value="${id}" ${parseInt(id)===pClassFilter?'selected':''}>${name}</option>`;
    }
    sel += `</select>`;

    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      ${sel}
      <span style="font-size:0.78rem;color:var(--muted)">player_class_stats</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <span id="player-cls-dirty" style="display:none;font-size:0.72rem;color:var(--orange)">● unsaved</span>
        <button class="e-btn" onclick="savePlayerClassStats()" style="background:rgba(100,200,100,.12);border-color:var(--green)">💾 Save</button>
      </div>
    </div>`;

    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.78rem">
      <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 6px;white-space:nowrap">Level</th>
        ${STAT_COLS.map(c=>`<th style="text-align:right;padding:4px 6px;white-space:nowrap">${c}</th>`).join('')}
      </tr></thead><tbody>`;

    for (const row of playerClassData) {
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:3px 6px;color:var(--gold);font-size:0.72rem">${row.Level}</td>
        ${STAT_COLS.map(c => `<td style="padding:2px 4px;text-align:right">
          <input type="number" id="pcls-${row.Level}-${c}" value="${row[c]??0}"
            style="width:70px;background:transparent;border:none;border-bottom:1px solid transparent;
                   color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.75rem;
                   padding:1px 3px;text-align:right;outline:none"
            onfocus="this.style.borderBottomColor='var(--gold)'"
            onblur="this.style.borderBottomColor='transparent'"
            oninput="playerClassDirty=true;document.getElementById('player-cls-dirty').style.display=''">
        </td>`).join('')}
      </tr>`;
    }
    html += `</tbody></table></div>`;
    box.innerHTML = html;
  }

  async function savePlayerClassStats() {
    const STAT_COLS = ['BaseHP','BaseMana','Strength','Agility','Stamina','Intellect','Spirit'];
    const rows = playerClassData.map(row => {
      const obj = {Class: row.Class, Level: row.Level};
      for (const c of STAT_COLS) {
        const el = document.getElementById(`pcls-${row.Level}-${c}`);
        obj[c] = el ? parseInt(el.value)||0 : row[c];
      }
      return obj;
    });
    try {
      const res = await fetch(`${API}/player/classstats/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows)});
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      playerClassDirty = false;
      document.getElementById('player-cls-dirty').style.display = 'none';
      showToast(`${d.data.saved} Class stat rows saved ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  // ── Races-Stats ─────────────────────────────────────────────────────────

