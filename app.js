/* ─────────────────────────────────────────
   CookBook — app.js v3
   Light theme · Apple Music rows · No emoji
   ───────────────────────────────────────── */

const DB_NAME = 'cookbookDB';
const DB_VER  = 3;
const STORE   = 'state';

const DEFAULT_STATE = {
  meals: [],
  modules: [
    { id: 'protein',   name: 'Protein',   ingredients: [] },
    { id: 'base',      name: 'Base',      ingredients: [] },
    { id: 'vegetable', name: 'Vegetable', ingredients: [] },
    { id: 'sauce',     name: 'Sauce',     ingredients: [] },
  ],
  shoppingList: [],
};

let state   = JSON.parse(JSON.stringify(DEFAULT_STATE));
let view    = 'home';
let sortMode = 'random';
let searchOpen = false;
let sortOpen   = false;

let wizard = {
  active: false, editingId: null,
  photo: '', name: '', selections: {}, rating: 7, note: '',
  steps: [], stepIndex: 0,
};

/* ── DB ── */
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, DB_VER);
  r.onupgradeneeded = () => {
    if (!r.result.objectStoreNames.contains(STORE))
      r.result.createObjectStore(STORE);
  };
  r.onsuccess = () => res(r.result);
  r.onerror   = () => rej(r.error);
});

async function loadState() {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get('appState');
  return new Promise(ok => {
    req.onsuccess = () => {
      if (req.result) state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), req.result);
      ok();
    };
    req.onerror = () => ok();
  });
}

async function saveState() {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(state, 'appState');
  return new Promise(ok => { tx.oncomplete = ok; });
}

/* ── Helpers ── */
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random();

const ratingColor = r =>
  r <= 3 ? '#60a5fa' : r <= 6 ? '#f59e0b' : r <= 8 ? '#f97316' : '#ef4444';

const ratingWord = r =>
  r <= 2 ? 'Terrible' : r <= 4 ? 'Not great' : r <= 6 ? 'Decent' : r <= 8 ? 'Good' : r <= 9 ? 'Great' : 'Perfect';

const shuffle = a => [...a].sort(() => Math.random() - 0.5);

const getMod = id => state.modules.find(m => m.id === id);

function ingredientsFlat(meal) {
  return Object.values(meal.selections || {}).flat();
}

const checkSVG = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 5,9 10,3"/></svg>`;

const plateSVG = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="8"/><line x1="24" y1="6" x2="24" y2="10"/></svg>`;

/* ── Render ── */
function render() {
  updateNav();
  updateTopbar();
  if (wizard.active) return;
  const app = document.getElementById('app');
  if (view === 'home')     renderHome(app);
  if (view === 'shopping') renderShopping(app);
  if (view === 'settings') renderSettings(app);
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === view)
  );
}

function updateTopbar() {
  const tb = document.getElementById('topbar');
  const hc = document.getElementById('home-controls');
  if (wizard.active) { tb.classList.add('hidden'); return; }
  tb.classList.remove('hidden');
  hc.classList.toggle('hidden', view !== 'home');
}

/* ── HOME ── */
function renderHome(app) {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  let meals = [...state.meals].filter(m => !q || m.name.toLowerCase().includes(q));
  if (!meals.length) {
    app.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke-width="1.5" stroke-linecap="round">${plateSVG}</svg>
        </div>
        <h2>Nothing logged yet</h2>
        <p>Tap Add to log your first meal</p>
      </div>`;
    return;
  }

  const sorted = (arr, mode) => {
    if (mode === 'random') return shuffle(arr);
    if (mode === 'date')   return [...arr].sort((a,b) => b.date.localeCompare(a.date));
    if (mode === 'rating') return [...arr].sort((a,b) => b.rating - a.rating);
    if (mode === 'az')     return [...arr].sort((a,b) => a.name.localeCompare(b.name));
    return arr;
  };

  const cardHTML = m => {
    const color = ratingColor(m.rating);
    return `<div class="album-card" data-id="${m.id}">
      <div class="album-thumb">
        ${m.photo
          ? `<img src="${m.photo}" alt="${m.name}" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="album-thumb-placeholder">${plateSVG}</div>`}
        <span class="album-rating-badge" style="background:${color}">${m.rating}/10</span>
      </div>
      <div class="album-info">
        <div class="album-name">${m.name}</div>
        <div class="album-date">${m.date}</div>
      </div>
    </div>`;
  };

  const rowHTML = (title, items) => {
    if (!items.length) return '';
    return `<div class="home-section">
      <div class="section-header">
        <span class="section-title">${title}</span>
        <span class="section-count">${items.length}</span>
      </div>
      <div class="cards-row">${items.map(cardHTML).join('')}</div>
    </div>`;
  };

  const recent   = sorted([...meals], 'date').slice(0, 10);
  const topRated = sorted([...meals], 'rating').filter(m => m.rating >= 7).slice(0, 10);
  const all      = sorted([...meals], sortMode);

  let html = '';
  if (!q) {
    html += rowHTML('Recently Added', recent);
    if (topRated.length) html += rowHTML('Top Rated', topRated);
    html += rowHTML('All Meals', all);
  } else {
    html += rowHTML(`Results for "${q}"`, meals);
  }

  app.innerHTML = html;

  app.querySelectorAll('.album-card').forEach(c =>
    c.addEventListener('click', () => openDetail(c.dataset.id))
  );
}

/* ── DETAIL MODAL ── */
function openDetail(id) {
  const m = state.meals.find(x => x.id === id);
  if (!m) return;
  const overlay = document.getElementById('detail-overlay');
  const modal   = document.getElementById('detail-modal');
  const color   = ratingColor(m.rating);
  const sel     = m.selections || {};

  const modsHTML = state.modules
    .filter(mod => (sel[mod.id] || []).length)
    .map(mod => `<div class="modal-mod-row">
      <span class="modal-mod-label">${mod.name}</span>
      <span>${sel[mod.id].join(', ')}</span>
    </div>`).join('');

  modal.innerHTML = `
    <div class="modal-drag"></div>
    ${m.photo
      ? `<img class="modal-photo" src="${m.photo}" alt="${m.name}">`
      : `<div class="modal-photo-empty">${plateSVG}</div>`}
    <div class="modal-body">
      <h2 class="modal-title">${m.name}</h2>
      <div class="modal-meta">
        <span class="modal-date">${m.date}</span>
        <span class="rating-badge" style="background:${color}">${m.rating}/10 · ${ratingWord(m.rating)}</span>
      </div>
      ${modsHTML ? `<div class="modal-block">
        <div class="modal-block-title">Ingredients</div>
        ${modsHTML}
      </div>` : ''}
      ${m.note ? `<div class="modal-block">
        <div class="modal-block-title">Notes</div>
        <p class="modal-note">"${m.note}"</p>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn-modal" id="md-edit">Edit</button>
      <button class="btn-modal danger" id="md-del">Delete</button>
      <button class="btn-modal primary" id="md-close">Close</button>
    </div>`;

  overlay.classList.remove('hidden');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDetail(); });
  modal.querySelector('#md-close').onclick = closeDetail;
  modal.querySelector('#md-edit').onclick  = () => { closeDetail(); startWizard(id); };
  modal.querySelector('#md-del').onclick   = async () => {
    if (!confirm('Delete this meal?')) return;
    state.meals = state.meals.filter(x => x.id !== id);
    await saveState();
    closeDetail();
    renderHome(document.getElementById('app'));
  };
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.add('hidden');
}

/* ── WIZARD ── */
function buildSteps() {
  const steps = ['photo', 'name'];
  state.modules.forEach(mod => { if (mod.ingredients.length) steps.push('mod:' + mod.id); });
  steps.push('rating', 'note');
  return steps;
}

function startWizard(editId) {
  wizard.active    = true;
  wizard.editingId = editId;
  wizard.steps     = buildSteps();
  wizard.stepIndex = 0;

  if (editId) {
    const m = state.meals.find(x => x.id === editId);
    if (m) {
      wizard.photo      = m.photo || '';
      wizard.name       = m.name || '';
      wizard.selections = JSON.parse(JSON.stringify(m.selections || {}));
      wizard.rating     = m.rating || 7;
      wizard.note       = m.note || '';
    }
  } else {
    wizard.photo = ''; wizard.name = '';
    wizard.selections = {}; wizard.rating = 7; wizard.note = '';
  }

  renderWizard();
  updateTopbar();
}

function renderWizard() {
  const app = document.getElementById('app');
  const dots = wizard.steps.map((_, i) => {
    const cls = i === wizard.stepIndex ? 'active' : i < wizard.stepIndex ? 'done' : '';
    return `<div class="wiz-dot ${cls}"></div>`;
  }).join('');

  app.innerHTML = `
    <div class="wizard" id="wizard">
      <div class="wizard-header">
        <button class="wiz-back" id="wiz-back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="10,3 5,8 10,13"/>
          </svg>
        </button>
        <div class="wiz-progress">${dots}</div>
        <button class="wiz-skip" id="wiz-skip">Skip</button>
      </div>
      <div class="wizard-body" id="wiz-body"></div>
      <div class="wizard-footer">
        <button class="btn-next" id="wiz-next">Continue</button>
      </div>
    </div>`;

  document.getElementById('wiz-back').onclick = wizBack;
  document.getElementById('wiz-skip').onclick = () => wizNext(true);
  document.getElementById('wiz-next').onclick = () => wizNext(false);

  renderStep();
}

function renderStep() {
  const body    = document.getElementById('wiz-body');
  const nextBtn = document.getElementById('wiz-next');
  const skipBtn = document.getElementById('wiz-skip');
  const key     = wizard.steps[wizard.stepIndex];
  const isLast  = wizard.stepIndex === wizard.steps.length - 1;

  // Update dots
  document.querySelectorAll('.wiz-dot').forEach((d, i) => {
    d.className = 'wiz-dot' + (i === wizard.stepIndex ? ' active' : i < wizard.stepIndex ? ' done' : '');
  });

  nextBtn.textContent = isLast ? 'Save meal' : 'Continue';
  skipBtn.classList.toggle('hidden', key === 'photo' || key === 'rating');

  body.innerHTML = buildStepHTML(key);
  bindStep(key);

  // Animate
  const step = body.querySelector('.wizard-step');
  if (step) {
    step.style.cssText = 'opacity:0;transform:translateX(30px)';
    requestAnimationFrame(() => {
      step.style.cssText = 'opacity:1;transform:translateX(0);transition:all 0.25s cubic-bezier(0.4,0,0.2,1)';
    });
  }
}

function buildStepHTML(key) {
  const idx = wizard.stepIndex + 1;

  if (key === 'photo') {
    return `<div class="wizard-step active">
      <div class="step-eyebrow">Step ${idx} of ${wizard.steps.length}</div>
      <div class="step-title">Add a photo</div>
      <div class="photo-drop" id="photo-drop">
        ${wizard.photo
          ? `<img src="${wizard.photo}" alt="meal">`
          : `<div class="photo-hint">
              <div class="photo-hint-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <p>Tap to take or pick a photo</p>
            </div>`}
        <input type="file" id="photo-file" accept="image/*" capture="environment">
        ${wizard.photo ? `<button class="photo-change-btn" id="photo-change">Change photo</button>` : ''}
      </div>
    </div>`;
  }

  if (key === 'name') {
    return `<div class="wizard-step active">
      <div class="step-eyebrow">Step ${idx} of ${wizard.steps.length}</div>
      <div class="step-title">What did you cook?</div>
      <input class="name-big" id="name-in" type="text"
        placeholder="Meal name…" value="${wizard.name}"
        autocomplete="off" autocapitalize="words" spellcheck="false">
    </div>`;
  }

  if (key.startsWith('mod:')) {
    const modId = key.split(':')[1];
    const mod   = getMod(modId);
    if (!mod) return '<div class="wizard-step active"></div>';
    const sel   = wizard.selections[modId] || [];

    const items = mod.ingredients.map(ing => `
      <div class="ingredient-row ${sel.includes(ing) ? 'selected' : ''}" data-ing="${ing}">
        <div class="ing-check">${checkSVG}</div>
        <span>${ing}</span>
      </div>`).join('');

    return `<div class="wizard-step active">
      <div class="step-eyebrow">Step ${idx} of ${wizard.steps.length}</div>
      <div class="module-eyebrow-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <div class="step-title">${mod.name}</div>
      <div class="ingredient-list" id="ing-list">${items}</div>
      <div class="add-row">
        <input type="text" id="new-ing" placeholder="Add ingredient…" autocapitalize="words">
        <button id="add-ing-btn">Add</button>
      </div>
    </div>`;
  }

  if (key === 'rating') {
    const c = ratingColor(wizard.rating);
    return `<div class="wizard-step active">
      <div class="step-eyebrow">Step ${idx} of ${wizard.steps.length}</div>
      <div class="step-title">Rate this meal</div>
      <div class="rating-big">
        <div class="rating-num" id="r-num" style="color:${c}">${wizard.rating}</div>
        <div class="rating-word" id="r-word" style="color:${c}">${ratingWord(wizard.rating)}</div>
      </div>
      <div class="slider-wrap">
        <input type="range" class="rating-range" id="r-slider" min="1" max="10" value="${wizard.rating}">
      </div>
      <div class="rating-scale"><span>1</span><span>5</span><span>10</span></div>
    </div>`;
  }

  if (key === 'note') {
    return `<div class="wizard-step active">
      <div class="step-eyebrow">Step ${idx} of ${wizard.steps.length}</div>
      <div class="step-title">Any notes?</div>
      <textarea class="note-area" id="note-in"
        placeholder="Too salty? Perfect balance? What would you change next time…">${wizard.note}</textarea>
    </div>`;
  }

  return '<div class="wizard-step active"></div>';
}

function bindStep(key) {
  if (key === 'photo') {
    const drop   = document.getElementById('photo-drop');
    const fileIn = document.getElementById('photo-file');
    const chgBtn = document.getElementById('photo-change');
    const trigger = () => fileIn.click();

    drop.addEventListener('click', e => { if (e.target !== chgBtn) trigger(); });
    if (chgBtn) chgBtn.addEventListener('click', trigger);

    fileIn.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        wizard.photo = ev.target.result;
        // Patch just the image area without full re-render
        const d = document.getElementById('photo-drop');
        d.innerHTML = `<img src="${wizard.photo}" alt="meal">
          <input type="file" id="photo-file" accept="image/*" capture="environment">
          <button class="photo-change-btn" id="photo-change">Change photo</button>`;
        bindStep('photo');
      };
      r.readAsDataURL(f);
    });
  }

  if (key === 'name') {
    const inp = document.getElementById('name-in');
    inp.addEventListener('input', e => { wizard.name = e.target.value; });
    setTimeout(() => inp.focus(), 80);
  }

  if (key.startsWith('mod:')) {
    const modId = key.split(':')[1];
    if (!wizard.selections[modId]) wizard.selections[modId] = [];

    document.querySelectorAll('.ingredient-row').forEach(el => {
      el.addEventListener('click', () => {
        const ing = el.dataset.ing;
        const arr = wizard.selections[modId];
        const idx = arr.indexOf(ing);
        if (idx === -1) arr.push(ing); else arr.splice(idx, 1);
        const now = arr.includes(ing);
        el.classList.toggle('selected', now);
        el.querySelector('.ing-check').innerHTML = now ? checkSVG : '';
      });
    });

    const addBtn = document.getElementById('add-ing-btn');
    const addIn  = document.getElementById('new-ing');

    const doAdd = async () => {
      const val = addIn.value.trim().toLowerCase();
      if (!val) return;
      const mod = getMod(modId);
      if (!mod.ingredients.includes(val)) { mod.ingredients.push(val); await saveState(); }
      if (!wizard.selections[modId].includes(val)) wizard.selections[modId].push(val);
      addIn.value = '';

      const list = document.getElementById('ing-list');
      const el   = document.createElement('div');
      el.className = 'ingredient-row selected';
      el.dataset.ing = val;
      el.innerHTML = `<div class="ing-check">${checkSVG}</div><span>${val}</span>`;
      el.addEventListener('click', () => {
        const arr = wizard.selections[modId];
        const i   = arr.indexOf(val);
        if (i === -1) arr.push(val); else arr.splice(i, 1);
        const now = arr.includes(val);
        el.classList.toggle('selected', now);
        el.querySelector('.ing-check').innerHTML = now ? checkSVG : '';
      });
      list.appendChild(el);
    };

    addBtn.addEventListener('click', doAdd);
    addIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  }

  if (key === 'rating') {
    document.getElementById('r-slider').addEventListener('input', e => {
      const r = +e.target.value;
      wizard.rating = r;
      const c = ratingColor(r);
      document.getElementById('r-num').textContent  = r;
      document.getElementById('r-num').style.color  = c;
      document.getElementById('r-word').textContent = ratingWord(r);
      document.getElementById('r-word').style.color = c;
    });
  }

  if (key === 'note') {
    document.getElementById('note-in').addEventListener('input', e => { wizard.note = e.target.value; });
  }
}

function wizBack() {
  if (wizard.stepIndex === 0) {
    wizard.active = false;
    view = 'home';
    render();
    return;
  }
  wizard.stepIndex--;
  renderStep();
}

async function wizNext(skip) {
  const key    = wizard.steps[wizard.stepIndex];
  const isLast = wizard.stepIndex === wizard.steps.length - 1;

  if (!skip && key === 'name' && !wizard.name.trim()) {
    const inp = document.getElementById('name-in');
    if (inp) { inp.style.borderColor = '#ef4444'; inp.focus(); }
    return;
  }

  if (isLast) { await saveMeal(); return; }
  wizard.stepIndex++;
  renderStep();
}

async function saveMeal() {
  const meal = {
    id:         wizard.editingId || uid(),
    name:       wizard.name.trim() || 'Unnamed',
    photo:      wizard.photo,
    date:       wizard.editingId
                  ? (state.meals.find(x => x.id === wizard.editingId)?.date || today())
                  : today(),
    selections: wizard.selections,
    rating:     wizard.rating,
    note:       wizard.note.trim(),
  };

  if (wizard.editingId) state.meals = state.meals.map(x => x.id === wizard.editingId ? meal : x);
  else state.meals.push(meal);

  await saveState();
  wizard.active = false;
  wizard.editingId = null;
  view = 'home';
  render();
}

const today = () => new Date().toISOString().slice(0, 10);

/* ── SHOPPING ── */
function renderShopping(app) {
  const opts = state.meals.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

  const listHTML = (() => {
    if (!state.shoppingList.length)
      return '<p style="color:var(--text3);font-size:.88rem;padding:14px 20px 0">Your list is empty.</p>';
    const byDay = {};
    state.shoppingList.forEach((g, gi) => {
      (byDay[g.day] = byDay[g.day] || []).push({ g, gi });
    });
    return Object.entries(byDay).map(([day, groups]) => `
      <div class="day-section">
        <div class="day-label">${day}</div>
        ${groups.map(({ g, gi }) => `
          <div class="meal-card">
            <div class="meal-card-head">${g.meal}</div>
            ${g.items.map((it, ii) => `
              <div class="shop-row ${it.checked ? 'checked' : ''}" data-gi="${gi}" data-ii="${ii}">
                <div class="shop-check">${checkSVG}</div>
                <span class="shop-name ${it.checked ? 'done' : ''}">${it.name}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`).join('');
  })();

  app.innerHTML = `
    <div class="page-wrap">
      <div class="page-head">
        <h1 class="page-h1">Shopping</h1>
        <p class="page-sub">Plan meals and track ingredients</p>
      </div>

      <div class="card-block">
        <h3>Plan a meal</h3>
        <div class="field-row">
          <select id="meal-pick"><option value="">Select a meal…</option>${opts}</select>
        </div>
        <div class="field-row">
          <input type="text" id="day-pick" placeholder="Day (e.g. Monday)">
          <button class="btn-teal" id="plan-add">Add</button>
        </div>
      </div>

      <div class="card-block">
        <h3>Add manually</h3>
        <div class="field-row">
          <input type="text" id="m-day" placeholder="Day">
          <input type="text" id="m-meal" placeholder="Meal name">
        </div>
        <div class="field-row">
          <input type="text" id="m-item" placeholder="Ingredient">
          <button class="btn-teal" id="m-add">Add</button>
        </div>
      </div>

      ${listHTML}
      ${state.shoppingList.length ? `<button class="btn-clear" id="clear-list">Clear list</button>` : ''}
    </div>`;

  app.querySelectorAll('.shop-row').forEach(el => {
    el.addEventListener('click', async () => {
      const gi = +el.dataset.gi, ii = +el.dataset.ii;
      state.shoppingList[gi].items[ii].checked = !state.shoppingList[gi].items[ii].checked;
      await saveState();
      renderShopping(app);
    });
  });

  app.querySelector('#plan-add').addEventListener('click', async () => {
    const id   = app.querySelector('#meal-pick').value;
    const day  = app.querySelector('#day-pick').value.trim();
    const meal = state.meals.find(m => m.id === id);
    if (!meal || !day) return;
    const items = ingredientsFlat(meal).map(n => ({ name: n, checked: false }));
    if (!items.length) return alert('This meal has no ingredients logged.');
    state.shoppingList.push({ day, meal: meal.name, items });
    await saveState();
    renderShopping(app);
  });

  app.querySelector('#m-add').addEventListener('click', async () => {
    const day  = app.querySelector('#m-day').value.trim();
    const meal = app.querySelector('#m-meal').value.trim();
    const item = app.querySelector('#m-item').value.trim();
    if (!day || !meal || !item) return;
    let g = state.shoppingList.find(x => x.day === day && x.meal === meal);
    if (!g) { g = { day, meal, items: [] }; state.shoppingList.push(g); }
    g.items.push({ name: item, checked: false });
    await saveState();
    renderShopping(app);
  });

  app.querySelector('#clear-list')?.addEventListener('click', async () => {
    if (!confirm('Clear the entire shopping list?')) return;
    state.shoppingList = [];
    await saveState();
    renderShopping(app);
  });
}

/* ── SETTINGS ── */
function renderSettings(app) {
  const modsHTML = state.modules.map(mod => `
    <div class="settings-mod" id="smod-${mod.id}">
      <div class="settings-mod-head" data-mod="${mod.id}">
        <div class="mod-head-left">
          <div class="mod-dot"></div>
          <span class="mod-name">${mod.name}</span>
          <span class="mod-count">${mod.ingredients.length} items</span>
        </div>
        <svg class="mod-chevron" viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4,6 8,10 12,6"/>
        </svg>
      </div>
      <div class="settings-mod-body hidden" id="smb-${mod.id}">
        <div class="settings-chips" id="schips-${mod.id}">
          ${mod.ingredients.map((ing, i) => `
            <span class="settings-chip">
              ${ing}
              <button class="chip-del" data-mod="${mod.id}" data-i="${i}">
                <svg viewBox="0 0 8 8" fill="none" stroke-linecap="round"><line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/></svg>
              </button>
            </span>`).join('')}
        </div>
        <div class="add-row">
          <input type="text" id="sadd-${mod.id}" placeholder="Add ingredient…" autocapitalize="words">
          <button data-addm="${mod.id}">Add</button>
        </div>
        <button class="btn-del-mod" data-delm="${mod.id}">Delete module</button>
      </div>
    </div>`).join('');

  app.innerHTML = `
    <div class="page-wrap">
      <div class="page-head">
        <h1 class="page-h1">Settings</h1>
      </div>

      ${modsHTML}

      <div class="new-mod-card">
        <h3>New module</h3>
        <div class="add-row" style="margin-bottom:0">
          <input type="text" id="nm-name" placeholder="Module name (e.g. Salad)" autocapitalize="words">
          <button id="nm-create" class="btn-teal">Create</button>
        </div>
      </div>

      <div class="data-card">
        <h3>Data</h3>
        <div class="data-btns">
          <button class="btn-outline" id="exp-btn">Export JSON</button>
          <label class="btn-outline" style="cursor:pointer">
            Import JSON
            <input type="file" id="imp-in" accept="application/json" style="display:none">
          </label>
        </div>
      </div>

      <div class="about-card">
        <div class="about-logo">Cook<span>Book</span></div>
        <div class="about-v">Version 3.0 · Offline PWA</div>
      </div>
    </div>`;

  // Toggle module bodies
  app.querySelectorAll('.settings-mod-head').forEach(h => {
    h.addEventListener('click', () => {
      const body = document.getElementById('smb-' + h.dataset.mod);
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      h.classList.toggle('open', !open);
    });
  });

  // Delete ingredient chip
  app.querySelectorAll('.chip-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const mod = getMod(btn.dataset.mod);
      mod.ingredients.splice(+btn.dataset.i, 1);
      await saveState();
      renderSettings(app);
    });
  });

  // Add ingredient
  app.querySelectorAll('[data-addm]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modId = btn.dataset.addm;
      const inp   = app.querySelector(`#sadd-${modId}`);
      const val   = inp.value.trim().toLowerCase();
      if (!val) return;
      const mod = getMod(modId);
      if (!mod.ingredients.includes(val)) { mod.ingredients.push(val); await saveState(); renderSettings(app); }
    });
  });

  // Delete module
  app.querySelectorAll('[data-delm]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this module and all its ingredients?')) return;
      state.modules = state.modules.filter(m => m.id !== btn.dataset.delm);
      await saveState();
      renderSettings(app);
    });
  });

  // Create module
  app.querySelector('#nm-create').addEventListener('click', async () => {
    const name = app.querySelector('#nm-name').value.trim();
    if (!name) return;
    state.modules.push({
      id: name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name, ingredients: [],
    });
    await saveState();
    renderSettings(app);
  });

  // Export
  app.querySelector('#exp-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cookbook-backup.json';
    a.click();
  });

  // Import
  app.querySelector('#imp-in').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(await f.text()));
      await saveState();
      renderSettings(app);
      alert('Import successful.');
    } catch { alert('Invalid file.'); }
  });
}

/* ── SEARCH & SORT ── */
document.getElementById('search-btn').addEventListener('click', () => {
  searchOpen = !searchOpen;
  const bar = document.getElementById('search-bar');
  bar.classList.toggle('hidden', !searchOpen);
  document.getElementById('app').classList.toggle('search-open', searchOpen);
  if (searchOpen) setTimeout(() => bar.querySelector('input').focus(), 50);
  else { bar.querySelector('input').value = ''; renderHome(document.getElementById('app')); }
});

document.getElementById('sort-btn').addEventListener('click', e => {
  e.stopPropagation();
  sortOpen = !sortOpen;
  document.getElementById('sort-sheet').classList.toggle('hidden', !sortOpen);
});

document.querySelectorAll('.sort-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    sortMode = btn.dataset.sort;
    document.querySelectorAll('.sort-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sortOpen = false;
    document.getElementById('sort-sheet').classList.add('hidden');
    if (view === 'home') renderHome(document.getElementById('app'));
  });
});

document.getElementById('search-input').addEventListener('input', () => {
  if (view === 'home') renderHome(document.getElementById('app'));
});

document.addEventListener('click', e => {
  if (sortOpen && !e.target.closest('#sort-sheet') && !e.target.closest('#sort-btn')) {
    sortOpen = false;
    document.getElementById('sort-sheet').classList.add('hidden');
  }
});

/* ── NAV ── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'add') { startWizard(null); return; }
    wizard.active = false;
    view = tab;
    render();
  });
});

/* ── SERVICE WORKER ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ── BOOT ── */
(async () => { await loadState(); render(); })();
