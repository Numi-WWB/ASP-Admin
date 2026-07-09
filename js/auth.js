/* auth.js — extracted from ASP_Admin.html (verbatim) */
  // ══════════════════════════════════════════════════════════════════════════

  let authInitialized = false;
  let _authData = null;
  let _authExpanded = {}; // realmid -> {motd:bool, bc:bool}
  let _ipbansExpanded = false;

  function initAuthModule() {
    if (authInitialized) return;
    authInitialized = true;
    loadAuthServer();
  }
  // Back-compat shim
  function setAuthTab(_t) { loadAuthServer(); }

  function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function _toggleSection(realmid, key) {
    _authExpanded[realmid] = _authExpanded[realmid] || {};
    _authExpanded[realmid][key] = !_authExpanded[realmid][key];
    renderAuthServer();
  }
  function _toggleIpBans() { _ipbansExpanded = !_ipbansExpanded; renderAuthServer(); }

  async function loadAuthServer() {
    const box = document.getElementById('auth-content');
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px 0">Loading server info…</div>';
    try {
      const r = await fetch(`${API}/auth/status`);
      const d = await r.json();
      if (!d.ok) { box.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      _authData = d.data;
      _authData.broadcasts_by_realm = _authData.broadcasts_by_realm || {};
      _authData.ipbans = _authData.ipbans || null;
      renderAuthServer();
    } catch(e) { box.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  function renderAuthServer() {
    const box = document.getElementById('auth-content');
    if (!_authData) return;
    const realms = _authData.realms || [];
    const motdMap = _authData.motd_by_realm || {};
    const uptime = _authData.uptime || [];

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Realms (${realms.length})</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.72rem;color:var(--muted)">host: localhost &nbsp;·&nbsp; user: acore &nbsp;·&nbsp; password: acore &nbsp;·&nbsp; port: 3306</div>
      </div>
      <button class="e-btn e-btn-gold" onclick="addRealmPrompt()">＋ Server add</button>
    </div>`;

    for (const r of realms) {
      const flag = r.flag === 0 ? `<span style="color:var(--green)">● Online</span>` :
                   r.flag === 1 ? `<span style="color:var(--red)">● Offline</span>` :
                   `<span style="color:var(--orange)">● Flag ${r.flag}</span>`;
      const exp = _authExpanded[r.id] || {};
      const motdText = motdMap[r.id] != null ? motdMap[r.id] : (motdMap[-1] || '');
      const inp = (k,v,w='100%') =>
        `<input id="rl-${r.id}-${k}" value="${_esc(v)}" style="width:${w};background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:5px 8px;box-sizing:border-box">`;
      const lbl = (t) => `<div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${t}</div>`;

      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="color:var(--gold);font-weight:600;font-size:1rem">${_esc(r.name)} <span style="color:var(--muted);font-size:0.72rem">#${r.id}</span></span>
          <div style="display:flex;gap:10px;align-items:center">${flag}
            <button class="e-btn e-btn-small e-btn-danger" onclick="deleteRealm(${r.id},'${_esc(r.name).replace(/'/g,"\\'")}')">🗑</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 14px;margin-bottom:10px">
          <div>${lbl('Name')}${inp('name', r.name)}</div>
          <div>${lbl('Address (Realmlist)')}${inp('address', r.address)}</div>
          <div>${lbl('Port')}${inp('port', r.port)}</div>
          <div>${lbl('Local Address')}${inp('localAddress', r.localAddress)}</div>
          <div>${lbl('Local Subnet')}${inp('localSubnetMask', r.localSubnetMask)}</div>
          <div>${lbl('Gamebuild')}${inp('gamebuild', r.gamebuild)}</div>
          <div>${lbl('Allowed Security Level')}${inp('allowedSecurityLevel', r.allowedSecurityLevel)}</div>
          <div>${lbl('Icon (0=Normal/1=PvP/4=RP)')}${inp('icon', r.icon)}</div>
          <div>${lbl('Timezone')}${inp('timezone', r.timezone)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="e-btn" style="background:rgba(100,200,100,.12);border-color:var(--green)" onclick="saveRealm(${r.id})">💾 Save</button>
          <span style="color:var(--muted);font-size:0.72rem;align-self:center">Build ${r.gamebuild} · Population: ${parseFloat(r.population||0).toFixed(2)}</span>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:8px">
          <div onclick="_toggleSection(${r.id},'motd')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:4px 0">
            <span style="color:var(--cyan);font-size:0.85rem">📢 MoTD ${motdText?'<span style=\"color:var(--muted);font-size:0.7rem\">(set)</span>':''}</span>
            <span style="color:var(--muted)">${exp.motd?'▼':'▶'}</span>
          </div>
          ${exp.motd ? `
          <div style="padding:8px 0">
            <textarea id="motd-${r.id}" rows="4" style="width:100%;background:var(--panel);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:0.82rem;padding:8px;resize:vertical;box-sizing:border-box">${_esc(motdText)}</textarea>
            <div style="margin-top:6px"><button class="e-btn e-btn-small" onclick="saveMotd(${r.id})">💾 MoTD save</button></div>
          </div>` : ''}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:6px">
          <div onclick="_toggleSection(${r.id},'bc')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:4px 0">
            <span style="color:var(--cyan);font-size:0.85rem">📣 Autobroadcast</span>
            <span style="color:var(--muted)">${exp.bc?'▼':'▶'}</span>
          </div>
          ${exp.bc ? `<div id="bc-section-${r.id}" style="padding:8px 0;color:var(--muted);font-size:0.78rem">Loading Broadcasts…</div>` : ''}
        </div>
      </div>`;
    }

    // Global IP-Bans
    html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-top:18px">
      <div onclick="_toggleIpBans()" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center">
        <span style="color:var(--red);font-weight:600;font-size:0.95rem">🚫 IP-Bans <span style="color:var(--muted);font-size:0.7rem">(global, all Realms)</span></span>
        <span style="color:var(--muted)">${_ipbansExpanded?'▼':'▶'}</span>
      </div>
      ${_ipbansExpanded ? `<div id="ipban-section" style="padding:10px 0;color:var(--muted);font-size:0.78rem">Loading…</div>` : ''}
    </div>`;

    // Uptime
    html += `<div style="margin-top:18px"><div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Uptime History</div>`;
    for (const u of uptime.slice(0,5)) {
      const start = new Date(u.starttime*1000).toLocaleString('en-GB');
      const hrs = Math.floor(u.uptime/3600);
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 11px;margin-bottom:5px;font-size:0.76rem">
        <div style="color:var(--text)">${start}</div>
        <div style="color:var(--muted)">${hrs}h Uptime · Max ${u.maxplayers} Player · ${_esc(u.revision||'')}</div>
      </div>`;
    }
    html += `</div>`;

    box.innerHTML = html;

    // Re-load broadcast sections that are expanded
    for (const r of realms) if (_authExpanded[r.id]?.bc) loadBroadcastFor(r.id);
    if (_ipbansExpanded) loadIpBansList();
  }

  async function saveRealm(id) {
    const f = (k) => document.getElementById(`rl-${id}-${k}`)?.value;
    const payload = {
      id,
      name: f('name'),
      address: f('address'),
      localAddress: f('localAddress'),
      localSubnetMask: f('localSubnetMask'),
      port: parseInt(f('port')||0),
      icon: parseInt(f('icon')||0),
      timezone: parseInt(f('timezone')||1),
      allowedSecurityLevel: parseInt(f('allowedSecurityLevel')||0),
      gamebuild: parseInt(f('gamebuild')||12340),
    };
    try {
      const r = await fetch(`${API}/auth/realm/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Realm saved ✓');
      loadAuthServer();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteRealm(id, name) {
    if (!confirm(`Realm "${name}" (#${id}) really delete?`)) return;
    try {
      const r = await fetch(`${API}/auth/realm/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Realm deleted');
      loadAuthServer();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function addRealmPrompt() {
    const name = prompt('Name of the new realm:'); if (!name) return;
    const address = prompt('Address (Realmlist-IP):', '127.0.0.1') || '127.0.0.1';
    const port = parseInt(prompt('Port:', '8085') || '8085');
    const gamebuild = parseInt(prompt('Gamebuild:', '12340') || '12340');
    try {
      const r = await fetch(`${API}/auth/realm/add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,address,port,gamebuild})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Realm added ✓');
      loadAuthServer();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function saveMotd(realmid) {
    const text = document.getElementById(`motd-${realmid}`)?.value || '';
    try {
      const r = await fetch(`${API}/auth/motd/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,realmid})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('MoTD saved ✓');
      _authData.motd_by_realm[realmid] = text;
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadBroadcastFor(realmid) {
    const sec = document.getElementById(`bc-section-${realmid}`); if (!sec) return;
    try {
      const r = await fetch(`${API}/auth/autobroadcast?realmid=${realmid}`);
      const d = await r.json();
      if (!d.ok) { sec.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      let html = '';
      for (const b of rows) {
        const tag = b.realmid === -1 ? '<span style="color:var(--muted);font-size:0.65rem">(global)</span>' : '';
        html += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span style="color:var(--muted);font-size:0.7rem;min-width:36px">#${b.id} ${tag}</span>
          <input value="${_esc(b.text)}" id="bc-text-${b.id}" style="flex:1;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:4px 7px">
          <input type="number" value="${b.weight}" id="bc-weight-${b.id}" style="width:60px;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:4px 7px">
          <button class="e-btn e-btn-small" onclick="saveBroadcast(${b.id},${realmid})">💾</button>
          <button class="e-btn e-btn-small e-btn-danger" onclick="deleteBroadcast(${b.id},${realmid})">🗑</button>
        </div>`;
      }
      html += `<div style="display:flex;gap:6px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border)">
        <input id="bc-new-text-${realmid}" placeholder="New Nachricht…" style="flex:1;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:5px 8px">
        <input id="bc-new-weight-${realmid}" type="number" value="1" min="1" style="width:60px;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:5px 8px">
        <button class="e-btn e-btn-small e-btn-gold" onclick="addBroadcast(${realmid})">＋</button>
      </div>`;
      sec.innerHTML = html;
    } catch(e) { sec.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function saveBroadcast(id, realmid) {
    const text = document.getElementById(`bc-text-${id}`)?.value || '';
    const weight = parseInt(document.getElementById(`bc-weight-${id}`)?.value || 1);
    try {
      const r = await fetch(`${API}/auth/autobroadcast/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,text,weight,realmid})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Broadcast saved ✓');
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteBroadcast(id, realmid) {
    if (!confirm(`Broadcast #${id} delete?`)) return;
    try {
      const r = await fetch(`${API}/auth/autobroadcast/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Broadcast deleted');
      loadBroadcastFor(realmid);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function addBroadcast(realmid) {
    const text = document.getElementById(`bc-new-text-${realmid}`)?.value.trim() || '';
    const weight = parseInt(document.getElementById(`bc-new-weight-${realmid}`)?.value || 1);
    if (!text) { showToast('Enter text','error'); return; }
    try {
      const r = await fetch(`${API}/auth/autobroadcast/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,weight,realmid})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast('Broadcast added ✓');
      loadBroadcastFor(realmid);
    } catch(e) { showToast('Server offline','error'); }
  }

  async function loadIpBansList() {
    const sec = document.getElementById('ipban-section'); if (!sec) return;
    try {
      const r = await fetch(`${API}/auth/ipban`);
      const d = await r.json();
      if (!d.ok) { sec.innerHTML = `<div style="color:var(--red)">${d.error}</div>`; return; }
      const rows = d.data || [];
      let html = '';
      if (rows.length) {
        html += `<table style="width:100%;border-collapse:collapse;font-size:0.78rem;margin-bottom:12px">
          <thead><tr style="color:var(--muted);font-size:0.7rem;border-bottom:1px solid var(--border)">
            <th style="padding:4px 6px;text-align:left">IP</th><th style="padding:4px 6px;text-align:left">Reason</th>
            <th style="padding:4px 6px;text-align:left">By</th><th style="padding:4px 6px;text-align:center">Date</th>
            <th style="padding:4px 6px;text-align:center">Action</th>
          </tr></thead><tbody>`;
        for (const b of rows) {
          const dt = new Date(b.bandate*1000).toLocaleDateString('en-GB');
          html += `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
            <td style="padding:4px 6px;color:var(--red);font-family:monospace">${_esc(b.ip)}</td>
            <td style="padding:4px 6px;color:var(--text)">${_esc(b.banreason)}</td>
            <td style="padding:4px 6px;color:var(--muted)">${_esc(b.bannedby)}</td>
            <td style="padding:4px 6px;text-align:center;color:var(--muted)">${dt}</td>
            <td style="padding:4px 6px;text-align:center"><button class="e-btn e-btn-small e-btn-danger" onclick="deleteIpBan('${_esc(b.ip)}')">Unban</button></td>
          </tr>`;
        }
        html += '</tbody></table>';
      } else {
        html += `<div style="color:var(--muted);font-size:0.8rem;margin-bottom:10px">No banned IPs.</div>`;
      }
      html += `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px dashed var(--border);padding-top:8px">
        <input id="ipban-ip" placeholder="IP-Adresse" style="width:150px;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:5px 8px">
        <input id="ipban-reason" placeholder="Reason" style="flex:1;min-width:140px;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:5px 8px">
        <input id="ipban-days" type="number" value="0" min="0" style="width:70px;background:var(--panel);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:0.8rem;padding:5px 8px">
        <button class="e-btn e-btn-small e-btn-danger" onclick="addIpBan()">🚫 Ban</button>
        <span style="color:var(--muted);font-size:0.68rem;width:100%">Days = 0 → permanent</span>
      </div>`;
      sec.innerHTML = html;
    } catch(e) { sec.innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
  }

  async function addIpBan() {
    const ip = document.getElementById('ipban-ip')?.value.trim() || '';
    const reason = document.getElementById('ipban-reason')?.value.trim() || 'Banned by admin';
    const days = parseInt(document.getElementById('ipban-days')?.value || 0);
    if (!ip) { showToast('Enter IP','error'); return; }
    try {
      const r = await fetch(`${API}/auth/ipban/add`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip,banreason:reason,duration_days:days})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${ip} gesperrt ✓`);
      loadIpBansList();
    } catch(e) { showToast('Server offline','error'); }
  }

  async function deleteIpBan(ip) {
    if (!confirm(`IP-Ban for ${ip} aufheben?`)) return;
    try {
      const r = await fetch(`${API}/auth/ipban/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip})});
      const d = await r.json();
      if (!d.ok) { showToast(d.error||'Error','error'); return; }
      showToast(`${ip} unbanned ✓`);
      loadIpBansList();
    } catch(e) { showToast('Server offline','error'); }
  }


