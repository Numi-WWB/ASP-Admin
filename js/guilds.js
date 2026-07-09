/* guilds.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let guildData = {};

  async function searchGuilds() {
    const q = document.getElementById('guild-search-input').value.trim();
    if (!q) return;
    const box = document.getElementById('guild-search-results');
    box.style.display = '';
    box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:8px 0">Search…</div>';
    try {
      const r = await fetch(`${API}/guild/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!d.ok || !d.data.length) { box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem">No Guilds found.</div>'; return; }
      let html = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">';
      for (const g of d.data) {
        const gold = g.BankMoney ? `💰 ${Math.floor(g.BankMoney/10000)}g` : '';
        html += `<div onclick="openGuildDetail(${g.guildid})" style="cursor:pointer;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;gap:10px"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-weight:600;color:var(--gold)">🛡️ ${g.name}</span>
          <span style="color:var(--muted);font-size:0.78rem">Leader: ${g.leader_name||'?'}</span>
          <span style="color:var(--cyan);font-size:0.78rem">${g.member_count||0} members</span>
          ${gold ? `<span style="color:var(--green);font-size:0.75rem">${gold}</span>` : ''}
          <span style="color:var(--muted);font-size:0.72rem;margin-left:auto">ID ${g.guildid}</span>
        </div>`;
      }
      box.innerHTML = html + '</div>';
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function openGuildDetail(guildId) {
    try {
      const r = await fetch(`${API}/guild/${guildId}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      guildData = d.data;
      renderGuildModal(d.data);
    } catch(e) { showToast('Server offline','error'); }
  }

  function renderGuildModal(g) {
    document.getElementById('guild-modal')?.remove();
    const members = g._members || [];
    const ranks   = g._ranks   || [];
    const rankMap = {};
    ranks.forEach(r => rankMap[r.rid] = r.rname);
    const created = g.createdate ? new Date(g.createdate*1000).toLocaleDateString('en-GB') : '?';
    const bankGold = g.BankMoney ? Math.floor(g.BankMoney/10000) : 0;

    let html = `<div id="guild-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;width:100%;max-width:720px;max-height:85vh;overflow-y:auto;padding:24px;position:relative">
        <button onclick="document.getElementById('guild-modal').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer">✕</button>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
          <span style="font-size:1.3rem">🛡️</span>
          <div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--gold)">${g.name}</div>
            <div style="font-size:0.75rem;color:var(--muted)">ID ${g.guildid} · Leader: ${g._leader_name} · Founded: ${created}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <span style="color:var(--green);font-size:0.82rem">💰 ${bankGold}g</span>
            <span style="color:var(--cyan);font-size:0.82rem">👥 ${members.length}</span>
          </div>
        </div>

        <!-- Info / Motto editierbar -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div>
            <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Guild Info</div>
            <textarea id="guild-info-input" rows="2"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;padding:6px 8px;resize:none;box-sizing:border-box">${g.info||''}</textarea>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">MoTD</div>
            <textarea id="guild-motd-input" rows="2"
              style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.8rem;padding:6px 8px;resize:none;box-sizing:border-box">${g.motd||''}</textarea>
          </div>
        </div>
        <button class="e-btn" style="margin-bottom:18px" onclick="saveGuildInfo(${g.guildid})">💾 Info/MoTD save</button>

        <!-- Ranks -->
        ${ranks.length ? `<div style="margin-bottom:14px">
          <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Ranks (${ranks.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${ranks.map(rk=>`<span style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:0.78rem;color:var(--text)">${rk.rid}: ${rk.rname}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- Members -->
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Members (${members.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
          <thead><tr style="color:var(--muted);font-size:0.72rem;border-bottom:1px solid var(--border)">
            <th style="padding:5px 8px;text-align:left">Name</th>
            <th style="padding:5px 8px;text-align:center">Rank</th>
            <th style="padding:5px 8px;text-align:center">Level</th>
            <th style="padding:5px 8px;text-align:center">Status</th>
            <th style="padding:5px 8px;text-align:center">Actions</th>
          </tr></thead><tbody>`;
    for (const m of members) {
      const online = m.online ? `<span style="color:var(--green);font-size:0.72rem">● Online</span>` : `<span style="color:var(--muted);font-size:0.72rem">Offline</span>`;
      const rname = rankMap[m.rank] || `Rank ${m.rank}`;
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 8px">
          <span class="char-link" onclick="document.getElementById('guild-modal').remove();loadCharacter(${m.guid})" style="color:var(--cyan);cursor:pointer">${m.name}</span>
        </td>
        <td style="padding:5px 8px;text-align:center">
          <select onchange="setGuildMemberRank(${g.guildid},${m.guid},this.value)"
            style="background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.78rem;padding:2px 4px">
            ${ranks.map(rk=>`<option value="${rk.rid}"${rk.rid==m.rank?' selected':''}>${rk.rname}</option>`).join('')}
          </select>
        </td>
        <td style="padding:5px 8px;text-align:center;color:var(--muted)">${m.level}</td>
        <td style="padding:5px 8px;text-align:center">${online}</td>
        <td style="padding:5px 8px;text-align:center">
          <button class="e-btn e-btn-small e-btn-danger" onclick="kickGuildMember(${g.guildid},${m.guid},'${m.name}')">Kick</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  async function saveGuildInfo(guildId) {
    const info = document.getElementById('guild-info-input')?.value || '';
    const motd = document.getElementById('guild-motd-input')?.value || '';
    try {
      const r = await fetch(`${API}/guild/${guildId}/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({info,motd})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Guild saved ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function setGuildMemberRank(guildId, guid, rank) {
    try {
      await fetch(`${API}/guild/${guildId}/member/rank`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guid,rank:parseInt(rank)})});
      showToast('Rank changed ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function kickGuildMember(guildId, guid, name) {
    if (!confirm(`${name} remove from the guild?`)) return;
    try {
      const r = await fetch(`${API}/guild/${guildId}/member/kick`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guid})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${name} kicked ✓`);
      document.getElementById('guild-modal')?.remove();
      openGuildDetail(guildId);
    } catch(e) { showToast('Server offline','error'); }
  }


