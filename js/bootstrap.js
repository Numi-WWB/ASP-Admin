/* bootstrap.js — fetch + inject the per-tab HTML partials, then fire app:ready.
   Partials are injected AFTER load, so any handler that queries partial DOM
   (coverage bars, editor search inputs) listens for 'app:ready' instead of
   'DOMContentLoaded'. */
(function () {
  const PARTIALS = {
    'db-world':      '/partials/world.html',
    'db-characters': '/partials/characters.html',
    'db-player':     '/partials/player.html',
    'db-playerbots': '/partials/playerbots.html',
    'db-auth':       '/partials/auth.html',
    'db-editor':     '/partials/editor.html',
  };

  async function boot() {
    await Promise.all(Object.entries(PARTIALS).map(async ([id, url]) => {
      const el = document.getElementById(id);
      if (!el) { console.error('[bootstrap] missing container', id); return; }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        el.innerHTML = await res.text();
      } catch (e) {
        console.error('[bootstrap] failed to load', url, e);
        el.innerHTML = '<div style="color:var(--red);padding:30px">Failed to load ' + url + '</div>';
      }
    }));
    // partial DOM now exists → run deferred startup (coverage calc, editor search wiring)
    document.dispatchEvent(new Event('app:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
