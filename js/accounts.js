/* accounts.js — extracted from ASP_Admin.html (verbatim) */
  let acctData = {};

  async function searchAccounts() {
    const q = document.getElementById('acct-search-input').value.trim();
    if (!q) return;
    const box = document.getElementById('acct-search-results');
    box.style.display = '';
    box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem;padding:8px 0">Search…</div>';
    try {
      const r = await fetch(`${API}/account/search?q=${encodeURIComponent(q)}&limit=10`);
      const d = await r.json();
      if (!d.ok || !d.data.length) { box.innerHTML = '<div style="color:var(--muted);font-size:0.82rem">No results.</div>'; return; }
      let html = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">';
      for (const a of d.data) {
        const gm = a.gmlevel > 0 ? `<span style="color:var(--gold);font-size:0.7rem">★ GM ${a.gmlevel}</span>` : '';
        html += `<div onclick="openAccountDetail(${a.id})" style="cursor:pointer;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;gap:10px"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-weight:600;color:var(--text)">${a.username||'?'}</span>
          <span style="color:var(--muted);font-size:0.78rem">${a.email||''}</span>
          ${gm}
          <span style="color:var(--muted);font-size:0.72rem;margin-left:auto">ID ${a.id}</span>
        </div>`;
      }
      box.innerHTML = html + '</div>';
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function openAccountDetail(accountId) {
    if (!accountId) return;
    try {
      const r = await fetch(`${API}/account/${accountId}`);
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      acctData = d.data;
      renderAccountModal(acctData);
    } catch(e) { showToast('Server offline','error'); }
  }

  function renderAccountModal(a) {
    const existing = document.getElementById('account-modal');
    if (existing) existing.remove();
    const ban = a._ban;
    const gm  = a.gmlevel || 0;
    const chars = a._characters || [];
    let html = `<div id="account-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:24px;width:min(700px,100%);max-height:85vh;overflow-y:auto;position:relative">
        <button onclick="document.getElementById('account-modal').remove()" style="position:absolute;top:12px;right:14px;background:transparent;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem">✕</button>
        <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Account</div>
        <div style="font-size:1.1rem;font-weight:600;color:var(--gold);margin-bottom:16px">${a.username} <span style="font-size:0.78rem;color:var(--muted);font-weight:400">ID ${a.id}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px">
          <div>
            ${infoRow('E-Mail', a.email||'?')}
            ${infoRow('Reg. Mail', a.reg_mail||'?')}
            ${infoRow('Beitritt', a.joindate||'?')}
            ${infoRow('Last Login', a.last_login||'?')}
            ${infoRow('Letztes IP', a.last_ip||'?')}
            ${infoRow('Expansion', EXPANSION_NAMES[a.expansion]||a.expansion)}
            ${infoRow('Gesperrt', a.locked==='1' ? '<span style="color:var(--red)">Ja</span>' : '<span style="color:var(--green)">Nein</span>')}
            ${infoRow('Online', a.online==='1' ? '<span style="color:var(--green)">Ja</span>' : 'Nein')}
            ${infoRow('Spielzeit', formatPlaytime(parseInt(a.totaltime||0)))}
          </div>
          <div>
            <div style="margin-bottom:10px">
              <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px">GM level</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${[0,1,2,3,4].map(lvl => `<button onclick="setAccountGM(${a.id},${lvl})" style="padding:4px 10px;border-radius:4px;border:1px solid;cursor:pointer;font-size:0.78rem;font-family:monospace;${gm==lvl?'background:rgba(212,175,55,.2);border-color:var(--gold);color:var(--gold)':'background:var(--bg);border-color:var(--border);color:var(--muted)'}">${lvl===0?'Player':'GM '+lvl}</button>`).join('')}
              </div>
            </div>
            ${ban && ban.active==1 ? `<div style="padding:8px 10px;border-radius:5px;background:rgba(200,50,50,.12);border:1px solid var(--red);font-size:0.78rem;margin-bottom:8px">
              <div style="color:var(--red);font-weight:600;margin-bottom:4px">⛔ Gebannt</div>
              ${infoRow('Reason', ban.banreason||'?')}
              ${infoRow('By', ban.bannedby||'?')}
              <div style="margin-top:8px"><button class="e-btn" onclick="acctUnban(${a.id})" style="border-color:var(--green);background:rgba(50,200,50,.1)">🔓 Entbannen</button></div>
            </div>` : `<div style="margin-bottom:8px">
              <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px">Bannen</div>
              <div style="display:flex;gap:6px">
                <input id="ban-reason-input" type="text" placeholder="Reason…" style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.78rem;padding:5px 8px">
                <input id="ban-days-input" type="number" placeholder="Days (0=perm)" value="0" style="width:80px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.78rem;padding:5px 8px">
                <button class="e-btn" onclick="acctBan(${a.id})" style="border-color:var(--red);background:rgba(200,50,50,.1)">⛔ Ban</button>
              </div>
            </div>`}
          </div>
        </div>`;

    if (chars.length) {
      html += `<div style="border-top:1px solid var(--border);padding-top:14px"><div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Characters (${chars.length})</div>
        <div style="display:flex;flex-direction:column;gap:4px">`;
      for (const c of chars) {
        const raceN  = RACE_NAMES[c.race]   || `Race ${c.race}`;
        const classN = CLASS_NAMES_CHAR[c.class] || `Class ${c.class}`;
        const online = c.online ? '<span style="color:var(--green);font-size:0.7rem">● Online</span>' : '';
        html += `<div onclick="document.getElementById('account-modal').remove();loadCharacter(${c.guid})" style="cursor:pointer;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:5px;display:flex;gap:10px;align-items:center"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-weight:600;color:var(--text)">${c.name}</span>
          <span style="color:var(--muted);font-size:0.78rem">Lv.${c.level} ${raceN} ${classN}</span>
          ${online}
          <span style="color:var(--muted);font-size:0.72rem;margin-left:auto">GUID ${c.guid}</span>
        </div>`;
      }
      html += '</div></div>';
    }
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  async function setAccountGM(id, level) {
    try {
      const r = await fetch(`${API}/account/${id}/gmlevel`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`GM level set to ${level} ✓`);
      document.getElementById('account-modal')?.remove();
      openAccountDetail(id);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function acctBan(id) {
    const reason = document.getElementById('ban-reason-input')?.value || 'Banned by admin';
    const days   = parseInt(document.getElementById('ban-days-input')?.value || 0);
    try {
      const r = await fetch(`${API}/account/${id}/ban`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,duration_days:days})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Account ${id} banned ✓`);
      document.getElementById('account-modal')?.remove();
      openAccountDetail(id);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function acctUnban(id) {
    try {
      const r = await fetch(`${API}/account/${id}/unban`, {method:'POST'});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`Account ${id} unbanned ✓`);
      document.getElementById('account-modal')?.remove();
      openAccountDetail(id);
    } catch(e) { showToast('Server offline','error'); }
  }


