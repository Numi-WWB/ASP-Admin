/* create-info.js — extracted from ASP_Admin.html (verbatim) */
  async function loadPlayerCreateInfo() {
    try {
      const r = await fetch(`${API}/player/createinfo`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      playerCreateData = d.data;
      renderPlayerCreateInfo();
    } catch(e) { document.getElementById('player-content').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderPlayerCreateInfo() {
    const box = document.getElementById('player-content');
    const MAP_NAMES = {0:'Eastern Kingdoms',1:'Kalimdor',530:'Outland',571:'Northrend'};

    let html = `<div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px">
      Start position per Race/Class — <code>playercreateinfo</code>
    </div>`;

    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.78rem">
      <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:4px 8px">Race</th>
        <th style="text-align:left;padding:4px 8px">Class</th>
        <th style="text-align:right;padding:4px 8px">Map</th>
        <th style="text-align:right;padding:4px 8px">Zone</th>
        <th style="text-align:right;padding:4px 8px">X</th>
        <th style="text-align:right;padding:4px 8px">Y</th>
        <th style="text-align:right;padding:4px 8px">Z</th>
        <th style="text-align:center;padding:4px 8px">Action</th>
      </tr></thead><tbody>`;

    for (const row of playerCreateData) {
      const rn = PLAYER_RACE_NAMES[row.race]   || `Race ${row.race}`;
      const cn = PLAYER_CLASS_NAMES[row.class] || `Class ${row.class}`;
      const mapN = MAP_NAMES[row.map] || `Map ${row.map}`;
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)" id="pci-row-${row.race}-${row.class}">
        <td style="padding:4px 8px;color:var(--gold)">${rn}</td>
        <td style="padding:4px 8px;color:var(--cyan)">${cn}</td>
        <td style="padding:4px 6px;text-align:right">
          <input type="number" id="pci-map-${row.race}-${row.class}" value="${row.map}"
            style="width:50px;${inlineInput()}" oninput="pciMarkDirty(this)">
        </td>
        <td style="padding:4px 6px;text-align:right">
          <input type="number" id="pci-zone-${row.race}-${row.class}" value="${row.zone}"
            style="width:55px;${inlineInput()}" oninput="pciMarkDirty(this)">
        </td>
        <td style="padding:4px 6px;text-align:right">
          <input type="number" step="0.01" id="pci-x-${row.race}-${row.class}" value="${(row.position_x||0).toFixed(2)}"
            style="width:80px;${inlineInput()}" oninput="pciMarkDirty(this)">
        </td>
        <td style="padding:4px 6px;text-align:right">
          <input type="number" step="0.01" id="pci-y-${row.race}-${row.class}" value="${(row.position_y||0).toFixed(2)}"
            style="width:80px;${inlineInput()}" oninput="pciMarkDirty(this)">
        </td>
        <td style="padding:4px 6px;text-align:right">
          <input type="number" step="0.01" id="pci-z-${row.race}-${row.class}" value="${(row.position_z||0).toFixed(2)}"
            style="width:65px;${inlineInput()}" oninput="pciMarkDirty(this)">
        </td>
        <td style="padding:4px 8px;text-align:center">
          <button class="e-btn" onclick="savePlayerCreateRow(${row.race},${row.class})"
            style="font-size:0.72rem;padding:3px 8px">💾</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    box.innerHTML = html;
  }

  function inlineInput() {
    return `background:transparent;border:none;border-bottom:1px solid var(--border);
            color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.75rem;
            padding:1px 3px;text-align:right;outline:none`;
  }

  function pciMarkDirty(el) { el.style.borderBottomColor = 'var(--gold)'; }

  async function savePlayerCreateRow(race, cls) {
    const g = (id) => { const el = document.getElementById(id); return el ? parseFloat(el.value)||0 : 0; };
    const payload = {
      race, class: cls,
      map:        g(`pci-map-${race}-${cls}`),
      zone:       g(`pci-zone-${race}-${cls}`),
      position_x: g(`pci-x-${race}-${cls}`),
      position_y: g(`pci-y-${race}-${cls}`),
      position_z: g(`pci-z-${race}-${cls}`),
    };
    try {
      const res = await fetch(`${API}/player/createinfo/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await res.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${PLAYER_RACE_NAMES[race]||race} ${PLAYER_CLASS_NAMES[cls]||cls} saved ✓`);
      // reset border color
      ['map','zone','x','y','z'].forEach(f => {
        const el = document.getElementById(`pci-${f}-${race}-${cls}`);
        if (el) el.style.borderBottomColor = 'var(--border)';
      });
    } catch(e) { showToast('Server offline','error'); }
  }

  // ── Start Items ──────────────────────────────────────────────────────────

