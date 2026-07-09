/* nav.js — extracted from ASP_Admin.html (verbatim) */
  function showDB(id, btn) {
    document.querySelectorAll('.db-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('db-' + id).classList.add('active');
    btn.classList.add('active');
  }

  function showSub(db, page, btn) {
    const dbEl = document.getElementById('db-' + db);
    dbEl.querySelectorAll('.sub-page').forEach(s => s.classList.remove('active'));
    dbEl.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(db + '-' + page).classList.add('active');
    btn.classList.add('active');
  }

  function toggle(header) {
    header.closest('.section').classList.toggle('collapsed');
  }

  function toggleFields(header) {
    const card = header.closest('.table-card');
    const list = card.querySelector('.fields-list');
    if (!list) return;
    list.classList.toggle('open');
    const tog = card.querySelector('.fields-toggle');
    if (tog) tog.textContent = list.classList.contains('open') ? '▼ Hide' : '▶ Important fields';
  }

  // ── Coverage Score Calculation ────────────────────────────────────────────
  // Formula: (Tables + fields + Links + Core tables%) / 400 * 100
  function pctColor(p) {
    if (p >= 80) return 'var(--green)';
    if (p >= 60) return 'var(--cyan)';
    if (p >= 40) return 'var(--gold)';
    if (p >= 20) return 'var(--orange)';
    return 'var(--red)';
  }

  function calcCoverage() {
    const cards = [
      { id: 'cov-items',     scoreId: 'cov-items-score' },
      { id: 'cov-spells',    scoreId: 'cov-spells-score' },
      { id: 'cov-quests',    scoreId: 'cov-quests-score' },
      { id: 'cov-creatures', scoreId: 'cov-creatures-score' },
      { id: 'cov-misc',      scoreId: 'cov-misc-score' },
    ];

    let totalPct = 0, cardCount = 0;

    cards.forEach(({ id, scoreId }) => {
      const card = document.getElementById(id);
      const scoreEl = document.getElementById(scoreId);
      if (!card || !scoreEl) return;

      const tab  = parseFloat(card.dataset.tab)  || 0;
      const feld = parseFloat(card.dataset.feld) || 0;
      const verk = parseFloat(card.dataset.verk) || 0;
      const dok  = parseFloat(card.dataset.kernDok)   || 0;
      const tot  = parseFloat(card.dataset.kernTotal) || 1;

      const kern = Math.floor((dok / tot) * 100);
      const total = Math.floor((tab + feld + verk + kern) / 400 * 100);

      scoreEl.textContent = total + '%';
      scoreEl.style.color = pctColor(total);
      totalPct += total;
      cardCount++;
    });

    // Refresh total % in header (average of all World sections)
    if (cardCount > 0) {
      const avg = Math.floor(totalPct / cardCount);
      const headerScore = document.getElementById('header-total');
      if (headerScore) {
        headerScore.textContent = avg + '%';
        headerScore.style.color = pctColor(avg);
      }
    }
  }

  document.addEventListener('app:ready', calcCoverage);

