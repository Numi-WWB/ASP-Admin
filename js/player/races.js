/* races.js — extracted from ASP_Admin.html (verbatim) */
  async function loadPlayerRaceStats() {
    try {
      const r = await fetch(`${API}/player/racestats`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      playerRaceData  = d.data;
      playerRaceDirty = false;
      renderPlayerRaceStats();
    } catch(e) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderPlayerRaceStats() {
    const box = document.getElementById('player-content');
    const STAT_COLS = ['Strength','Agility','Stamina','Intellect','Spirit'];
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span style="font-size:0.82rem;color:var(--muted)">Race base stats — <code>player_race_stats</code></span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <span id="player-race-dirty" style="display:none;font-size:0.72rem;color:var(--orange)">● unsaved</span>
        <button class="e-btn" onclick="savePlayerRaceStats()" style="background:rgba(100,200,100,.12);border-color:var(--green)">💾 Save</button>
      </div>
    </div>`;

    html += `<table style="border-collapse:collapse;font-size:0.82rem">
      <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 10px">Race</th>
        ${STAT_COLS.map(c=>`<th style="text-align:right;padding:4px 8px">${c}</th>`).join('')}
      </tr></thead><tbody>`;

    for (const row of playerRaceData) {
      const raceName = PLAYER_RACE_NAMES[row.Race] || `Race ${row.Race}`;
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 10px;color:var(--gold);white-space:nowrap">${raceName}</td>
        ${STAT_COLS.map(c => `<td style="padding:3px 6px;text-align:right">
          <input type="number" id="prace-${row.Race}-${c}" value="${row[c]??0}"
            style="width:60px;background:transparent;border:none;border-bottom:1px solid transparent;
                   color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;
                   padding:1px 3px;text-align:right;outline:none"
            onfocus="this.style.borderBottomColor='var(--gold)'"
            onblur="this.style.borderBottomColor='transparent'"
            oninput="playerRaceDirty=true;document.getElementById('player-race-dirty').style.display=''">
        </td>`).join('')}
      </tr>`;
    }
    html += `</tbody></table>`;
    box.innerHTML = html;
  }

  async function savePlayerRaceStats() {
    const STAT_COLS = ['Strength','Agility','Stamina','Intellect','Spirit'];
    const rows = playerRaceData.map(row => {
      const obj = {Race: row.Race};
      for (const c of STAT_COLS) {
        const el = document.getElementById(`prace-${row.Race}-${c}`);
        obj[c] = el ? parseInt(el.value)||0 : row[c];
      }
      return obj;
    });
    try {
      const res = await fetch(`${API}/player/racestats/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows)});
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      playerRaceDirty = false;
      document.getElementById('player-race-dirty').style.display = 'none';
      showToast(`Race stats saved ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  // ── Start Character ───────────────────────────────────────────────────────

