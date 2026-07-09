/* xp.js — extracted from ASP_Admin.html (verbatim) */
  async function loadPlayerXP() {
    try {
      const r = await fetch(`${API}/player/xp`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      playerXpData  = d.data;
      playerXpDirty = false;
      renderPlayerXP();
    } catch(e) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderPlayerXP() {
    const box = document.getElementById('player-content');
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <span style="font-size:0.82rem;color:var(--muted)">XP requirement per level (1–80) — <code>player_xp_for_level</code></span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <span id="player-xp-dirty" style="display:none;font-size:0.72rem;color:var(--orange)">● unsaved</span>
        <button class="e-btn" onclick="savePlayerXP()" style="background:rgba(100,200,100,.12);border-color:var(--green)">💾 Save</button>
      </div>
    </div>`;

    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px">`;
    for (const row of playerXpData) {
      html += `<div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:4px 8px">
        <span style="color:var(--muted);font-size:0.72rem;min-width:32px">Lv${row.Level}</span>
        <input type="number" id="pxp-${row.Level}" value="${row.Experience}"
          style="flex:1;width:0;background:transparent;border:none;border-bottom:1px solid var(--border);
                 color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;padding:2px 4px;outline:none"
          oninput="playerXpDirty=true;document.getElementById('player-xp-dirty').style.display=''">
      </div>`;
    }
    html += `</div>`;
    box.innerHTML = html;
  }

  async function savePlayerXP() {
    const rows = playerXpData.map(r => {
      const el = document.getElementById(`pxp-${r.Level}`);
      return {Level: r.Level, Experience: el ? parseInt(el.value)||0 : r.Experience};
    });
    try {
      const res = await fetch(`${API}/player/xp/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows)});
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      playerXpDirty = false;
      document.getElementById('player-xp-dirty').style.display = 'none';
      showToast(`${d.data.saved} XP-Entries saved ✓`);
    } catch(e) { showToast('Server offline','error'); }
  }

  // ── Classes-Stats ────────────────────────────────────────────────────────

