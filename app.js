/* ─────────────────────────────────────────
   CookBook — app.js
   ───────────────────────────────────────── */

const DB_NAME = 'cookbookDB';
const DB_VER  = 2;
const STORE   = 'state';

// ── Default state ──
const DEFAULT_STATE = {
  meals: [],
  modules: [
    { id: 'protein',   name: 'Protein',   emoji: '🥩', ingredients: [] },
    { id: 'base',      name: 'Base',      emoji: '🍝', ingredients: [] },
    { id: 'vegetable', name: 'Vegetable', emoji: '🥦', ingredients: [] },
    { id: 'sauce',     name: 'Sauce',     emoji: '🫙', ingredients: [] },
  ],
  shoppingList: [],
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let view  = 'home';
let sortMode = 'random';
let searchOpen = false;
let sortOpen = false;
let deferredPrompt = null;

// ── Wizard state (not persisted) ──
let wizard = {
  active: false,
  editingId: null,
  photo: '',       // base64
  name: '',
  selections: {},  // { moduleId: [ingr, ...] }
  rating: 7,
  note: '',
  steps: [],       // built dynamically
  stepIndex: 0,
};

/* ─── IndexedDB ─── */
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, DB_VER);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  r.onsuccess = () => res(r.result);
  r.onerror   = () => rej(r.error);
});

async function loadState() {
  const db  = await openDB();
  const tx  = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get('appState');
  return new Promise(ok => {
    req.onsuccess = () => {
      const saved = req.result;
      if (saved) {
        // Merge — keep defaults for missing keys
        state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), saved);
      }
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

/* ─── Helpers ─── */
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random();

const ratingColor = r =>
  r <= 3 ? '#60a5fa' :
  r <= 6 ? '#fbbf24' :
  r <= 8 ? '#f97316' : '#ef4444';

const ratingLabel = r =>
  r <= 2 ? 'Terrible' :
  r <= 4 ? 'Not great' :
  r <= 6 ? 'Decent' :
  r <= 8 ? 'Good' :
  r <= 9 ? 'Great' : '🔥 Perfect';

const shuffle = a => [...a].sort(() => Math.random() - 0.5);

function getModuleById(id) {
  return state.modules.find(m => m.id === id);
}

function ingredientsFlat(meal) {
  const sel = meal.selections || {};
  return Object.values(sel).flat();
}

/* ─── Render dispatcher ─── */
function render() {
  updateNav();
  updateTopbar();
  if (wizard.active) return; // wizard handles its own rendering
  const app = document.getElementById('app');
  if (view === 'home')     renderHome(app);
  if (view === 'shopping') renderShopping(app);
  if (view === 'settings') renderSettings(app);
  if (view === 'add')      startWizard(null);
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === view);
  });
}

function updateTopbar() {
  const topbar = document.getElementById('topbar');
  const homeControls = document.getElementById('home-controls');
  if (view === 'home') {
    topbar.classList.remove('hidden');
    homeControls.classList.remove('hidden');
  } else if (wizard.active) {
    topbar.classList.add('hidden');
    homeControls.classList.add('hidden');
  } else {
    topbar.classList.remove('hidden');
    homeControls.classList.add('hidden');
  }
}

/* ─── HOME ─── */
function renderHome(app) {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();

  let meals = [...state.meals].filter(m =>
    !q || m.name.toLowerCase().includes(q)
  );

  if (sortMode === 'random') meals = shuffle(meals);
  if (sortMode === 'date')   meals.sort((a, b) => b.date.localeCompare(a.date));
  if (sortMode === 'rating') meals.sort((a, b) => b.rating - a.rating);
  if (sortMode === 'az')     meals.sort((a, b) => a.name.localeCompare(b.name));

  if (!meals.length) {
    app.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🍽️</span>
        <h2>No meals yet</h2>
        <p>Tap <strong>+</strong> to log your first meal</p>
      </div>`;
    return;
  }

  app.innerHTML = `<div class="album-grid">${meals.map(m => {
    const photo = m.photo || '';
    const color = ratingColor(m.rating);
    return `<div class="album-card" data-id="${m.id}">
      <div class="album-placeholder">🍽️</div>
      ${photo ? `<img src="${photo}" alt="${m.name}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="album-overlay">
        <div class="album-name">${m.name}</div>
        <span class="album-rating" style="background:${color}">${m.rating}/10</span>
      </div>
    </div>`;
  }).join('')}</div>`;

  app.querySelectorAll('.album-card').forEach(c =>
    c.addEventListener('click', () => openDetail(c.dataset.id))
  );
}

/* ─── DETAIL MODAL ─── */
function openDetail(id) {
  const m = state.meals.find(x => x.id === id);
  if (!m) return;

  const overlay = document.getElementById('detail-overlay');
  const modal   = document.getElementById('detail-modal');
  const color   = ratingColor(m.rating);
  const sel     = m.selections || {};

  const modulesHtml = state.modules
    .filter(mod => (sel[mod.id] || []).length > 0)
    .map(mod => `
      <div class="modal-module-row">
        <span class="modal-module-label">${mod.emoji} ${mod.name}</span>
        <span>${sel[mod.id].join(', ')}</span>
      </div>`)
    .join('');

  modal.innerHTML = `
    ${m.photo
      ? `<img class="modal-photo" src="${m.photo}" alt="${m.name}">`
      : `<div class="modal-photo-placeholder">🍽️</div>`}
    <div class="modal-body">
      <h2 class="modal-title">${m.name}</h2>
      <div class="modal-meta">
        <span class="modal-date">📅 ${m.date}</span>
        <span class="album-rating" style="background:${color}">${m.rating}/10</span>
      </div>
      ${modulesHtml ? `<div class="modal-section">
        <div class="modal-section-title">Ingredients</div>
        ${modulesHtml}
      </div>` : ''}
      ${m.note ? `<div class="modal-section">
        <div class="modal-section-title">Notes</div>
        <p class="modal-note">"${m.note}"</p>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn-edit" id="modal-edit">✏️ Edit</button>
      <button class="btn-delete" id="modal-delete">🗑</button>
      <button class="btn-close" id="modal-close">✕</button>
    </div>`;

  overlay.classList.remove('hidden');

  modal.querySelector('#modal-close').onclick  = closeDetail;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDetail(); });

  modal.querySelector('#modal-edit').onclick = () => {
    closeDetail();
    startWizard(id);
  };

  modal.querySelector('#modal-delete').onclick = async () => {
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

/* ─── WIZARD ─── */
function buildWizardSteps() {
  // Always: photo, name
  // Then one step per module that has ingredients
  // Then: rating, note
  const steps = ['photo', 'name'];
  state.modules.forEach(mod => {
    if (mod.ingredients.length > 0) steps.push('module:' + mod.id);
  });
  steps.push('rating', 'note');
  return steps;
}

function startWizard(editId) {
  wizard.active    = true;
  wizard.editingId = editId;
  wizard.steps     = buildWizardSteps();
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
    wizard.photo      = '';
    wizard.name       = '';
    wizard.selections = {};
    wizard.rating     = 7;
    wizard.note       = '';
  }

  renderWizard();
  updateTopbar();
}

function renderWizard() {
  const app = document.getElementById('app');

  // Build wizard shell
  const totalSteps = wizard.steps.length;
  const dotsHtml = wizard.steps.map((_, i) => {
    const cls = i === wizard.stepIndex ? 'active' : i < wizard.stepIndex ? 'done' : '';
    return `<div class="wizard-dot ${cls}"></div>`;
  }).join('');

  app.innerHTML = `
    <div class="wizard" id="wizard">
      <div class="wizard-header">
        <button class="wizard-back" id="wiz-back">←</button>
        <div class="wizard-progress">${dotsHtml}</div>
        <button class="wizard-skip" id="wiz-skip">Skip</button>
      </div>
      <div class="wizard-body" id="wiz-body"></div>
      <div class="wizard-footer">
        <button class="btn-next" id="wiz-next">Continue</button>
      </div>
    </div>`;

  document.getElementById('wiz-back').onclick = wizardBack;
  document.getElementById('wiz-skip').onclick = wizardSkip;
  document.getElementById('wiz-next').onclick = wizardNext;

  renderWizardStep();
}

function renderWizardStep() {
  const body     = document.getElementById('wiz-body');
  const nextBtn  = document.getElementById('wiz-next');
  const skipBtn  = document.getElementById('wiz-skip');
  const stepKey  = wizard.steps[wizard.stepIndex];
  const isLast   = wizard.stepIndex === wizard.steps.length - 1;

  // Update dots
  document.querySelectorAll('.wizard-dot').forEach((d, i) => {
    d.className = 'wizard-dot' +
      (i === wizard.stepIndex ? ' active' : i < wizard.stepIndex ? ' done' : '');
  });

  nextBtn.textContent = isLast ? '💾 Save meal' : 'Continue';
  skipBtn.classList.toggle('hidden', stepKey === 'photo' || stepKey === 'rating');

  body.innerHTML = buildStepHTML(stepKey);
  bindStepEvents(stepKey);

  // Animate in
  const step = body.querySelector('.wizard-step');
  if (step) {
    step.style.opacity = '0';
    step.style.transform = 'translateX(30px)';
    requestAnimationFrame(() => {
      step.style.transition = 'all 0.25s cubic-bezier(0.4,0,0.2,1)';
      step.style.opacity = '1';
      step.style.transform = 'translateX(0)';
    });
  }
}

function buildStepHTML(stepKey) {
  if (stepKey === 'photo') {
    const hasPhoto = !!wizard.photo;
    return `<div class="wizard-step active">
      <div class="step-label">Step ${wizard.stepIndex + 1}</div>
      <div class="step-title">Add a photo</div>
      <div class="photo-area" id="photo-area">
        ${hasPhoto
          ? `<img src="${wizard.photo}" alt="meal photo" id="photo-preview">`
          : `<div class="photo-placeholder">
               <div class="ph-icon">📸</div>
               <p>Tap to take or pick a photo</p>
             </div>`}
        <input type="file" id="photo-input" accept="image/*" capture="environment">
        ${hasPhoto ? `<button class="photo-change" id="photo-change-btn">Change photo</button>` : ''}
      </div>
    </div>`;
  }

  if (stepKey === 'name') {
    return `<div class="wizard-step active">
      <div class="step-label">Step ${wizard.stepIndex + 1}</div>
      <div class="step-title">What did you cook?</div>
      <input class="name-input-big" id="name-input" type="text"
        placeholder="Meal name…" value="${wizard.name}" autocomplete="off" autocapitalize="words">
    </div>`;
  }

  if (stepKey.startsWith('module:')) {
    const modId = stepKey.split(':')[1];
    const mod   = getModuleById(modId);
    if (!mod) return '<div class="wizard-step active"></div>';
    const selected = wizard.selections[modId] || [];

    const itemsHtml = mod.ingredients.map(ing => {
      const sel = selected.includes(ing);
      return `<div class="ingredient-item ${sel ? 'selected' : ''}" data-ing="${ing}">
        <div class="ingredient-check">${sel ? '✓' : ''}</div>
        <span>${ing}</span>
      </div>`;
    }).join('');

    return `<div class="wizard-step active">
      <div class="step-label">Step ${wizard.stepIndex + 1}</div>
      <span class="module-step-emoji">${mod.emoji}</span>
      <div class="step-title">${mod.name}</div>
      <div class="ingredient-list" id="ingredient-list">${itemsHtml}</div>
      <div class="add-ingredient-row">
        <input type="text" id="new-ing-input" placeholder="Add ingredient…" autocapitalize="words">
        <button id="new-ing-btn">Add</button>
      </div>
    </div>`;
  }

  if (stepKey === 'rating') {
    const r     = wizard.rating;
    const color = ratingColor(r);
    return `<div class="wizard-step active">
      <div class="step-label">Step ${wizard.stepIndex + 1}</div>
      <div class="step-title">Rate it</div>
      <div class="rating-display">
        <div class="rating-number" id="rating-number" style="color:${color}">${r}</div>
        <div class="rating-label" id="rating-label" style="color:${color}">${ratingLabel(r)}</div>
      </div>
      <div class="rating-slider-wrap">
        <input type="range" class="big-slider" id="rating-slider"
          min="1" max="10" value="${r}"
          style="--track-color:${color}">
      </div>
      <div class="rating-ticks">
        <span>1</span><span>5</span><span>10</span>
      </div>
    </div>`;
  }

  if (stepKey === 'note') {
    return `<div class="wizard-step active">
      <div class="step-label">Step ${wizard.stepIndex + 1}</div>
      <div class="step-title">Any notes?</div>
      <textarea class="note-textarea" id="note-input"
        placeholder="Too salty? Perfect balance? What would you change…"
        rows="6">${wizard.note}</textarea>
    </div>`;
  }

  return '<div class="wizard-step active"></div>';
}

function bindStepEvents(stepKey) {
  if (stepKey === 'photo') {
    const area   = document.getElementById('photo-area');
    const input  = document.getElementById('photo-input');
    const change = document.getElementById('photo-change-btn');

    const triggerPick = () => input.click();
    area.addEventListener('click', e => {
      if (e.target === change) return;
      triggerPick();
    });
    if (change) change.addEventListener('click', triggerPick);

    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        wizard.photo = ev.target.result;
        // Update preview without re-rendering whole step
        const area = document.getElementById('photo-area');
        area.innerHTML = `
          <img src="${wizard.photo}" alt="meal photo" id="photo-preview">
          <input type="file" id="photo-input" accept="image/*" capture="environment">
          <button class="photo-change" id="photo-change-btn">Change photo</button>`;
        bindStepEvents('photo');
      };
      reader.readAsDataURL(file);
    });
  }

  if (stepKey === 'name') {
    const input = document.getElementById('name-input');
    input.addEventListener('input', e => { wizard.name = e.target.value; });
    setTimeout(() => input.focus(), 50);
  }

  if (stepKey.startsWith('module:')) {
    const modId = stepKey.split(':')[1];
    if (!wizard.selections[modId]) wizard.selections[modId] = [];

    document.querySelectorAll('.ingredient-item').forEach(el => {
      el.addEventListener('click', () => {
        const ing = el.dataset.ing;
        const arr = wizard.selections[modId];
        const idx = arr.indexOf(ing);
        if (idx === -1) arr.push(ing);
        else arr.splice(idx, 1);

        const sel = arr.includes(ing) || idx === -1 && arr.includes(ing);
        const isNowSelected = wizard.selections[modId].includes(ing);
        el.classList.toggle('selected', isNowSelected);
        el.querySelector('.ingredient-check').textContent = isNowSelected ? '✓' : '';
      });
    });

    const addBtn = document.getElementById('new-ing-btn');
    const addInput = document.getElementById('new-ing-input');

    addBtn.addEventListener('click', async () => {
      const val = addInput.value.trim().toLowerCase();
      if (!val) return;
      const mod = getModuleById(modId);
      if (!mod.ingredients.includes(val)) {
        mod.ingredients.push(val);
        await saveState();
      }
      if (!wizard.selections[modId].includes(val)) {
        wizard.selections[modId].push(val);
      }
      addInput.value = '';

      // Add to list visually
      const list = document.getElementById('ingredient-list');
      const el = document.createElement('div');
      el.className = 'ingredient-item selected';
      el.dataset.ing = val;
      el.innerHTML = `<div class="ingredient-check">✓</div><span>${val}</span>`;
      el.addEventListener('click', () => {
        const arr = wizard.selections[modId];
        const idx = arr.indexOf(val);
        if (idx === -1) arr.push(val);
        else arr.splice(idx, 1);
        const isNow = wizard.selections[modId].includes(val);
        el.classList.toggle('selected', isNow);
        el.querySelector('.ingredient-check').textContent = isNow ? '✓' : '';
      });
      list.appendChild(el);
    });

    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });
  }

  if (stepKey === 'rating') {
    const slider = document.getElementById('rating-slider');
    slider.addEventListener('input', e => {
      const r = +e.target.value;
      wizard.rating = r;
      const color = ratingColor(r);
      document.getElementById('rating-number').textContent = r;
      document.getElementById('rating-number').style.color = color;
      document.getElementById('rating-label').textContent = ratingLabel(r);
      document.getElementById('rating-label').style.color = color;
    });
  }

  if (stepKey === 'note') {
    const ta = document.getElementById('note-input');
    ta.addEventListener('input', e => { wizard.note = e.target.value; });
  }
}

function wizardBack() {
  if (wizard.stepIndex === 0) {
    // Exit wizard
    wizard.active = false;
    view = 'home';
    render();
    return;
  }
  wizard.stepIndex--;
  renderWizardStep();
}

function wizardSkip() {
  wizardNext(true);
}

async function wizardNext(skip = false) {
  const stepKey = wizard.steps[wizard.stepIndex];

  // Validate current step
  if (!skip) {
    if (stepKey === 'name' && !wizard.name.trim()) {
      const input = document.getElementById('name-input');
      if (input) { input.style.borderColor = '#ef4444'; input.focus(); }
      return;
    }
  }

  const isLast = wizard.stepIndex === wizard.steps.length - 1;

  if (isLast) {
    await saveMeal();
    return;
  }

  wizard.stepIndex++;
  renderWizardStep();
}

async function saveMeal() {
  const meal = {
    id:         wizard.editingId || uid(),
    name:       wizard.name.trim() || 'Unnamed meal',
    photo:      wizard.photo,
    date:       wizard.editingId
                  ? (state.meals.find(x => x.id === wizard.editingId)?.date || new Date().toISOString().slice(0,10))
                  : new Date().toISOString().slice(0,10),
    selections: wizard.selections,
    rating:     wizard.rating,
    note:       wizard.note.trim(),
  };

  if (wizard.editingId) {
    state.meals = state.meals.map(x => x.id === wizard.editingId ? meal : x);
  } else {
    state.meals.push(meal);
  }

  await saveState();
  wizard.active    = false;
  wizard.editingId = null;
  view = 'home';
  render();
}

/* ─── SHOPPING ─── */
function renderShopping(app) {
  const allMealOptions = state.meals
    .map(m => `<option value="${m.id}">${m.name}</option>`)
    .join('');

  const listHtml = (() => {
    if (!state.shoppingList.length) return '<p style="color:var(--text3);font-size:.88rem;padding:0 16px 8px">Your list is empty.</p>';
    const byDay = {};
    state.shoppingList.forEach((g, gi) => {
      (byDay[g.day] = byDay[g.day] || []).push({ g, gi });
    });
    return Object.entries(byDay).map(([day, groups]) => `
      <div class="day-group">
        <div class="day-label">📅 ${day}</div>
        ${groups.map(({ g, gi }) => `
          <div class="meal-group">
            <div class="meal-group-header">🍽️ ${g.meal}</div>
            ${g.items.map((it, ii) => `
              <div class="shop-item" data-gi="${gi}" data-ii="${ii}">
                <input type="checkbox" ${it.checked ? 'checked' : ''} readonly>
                <span class="shop-item-name ${it.checked ? 'done' : ''}">${it.name}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>`).join('');
  })();

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Shopping</h1>
      <p class="page-subtitle">Plan meals and build your list</p>
    </div>

    <div class="section-card">
      <h3>📋 Plan a meal</h3>
      <div class="input-row" style="margin-bottom:8px">
        <select id="meal-pick"><option value="">Select a meal…</option>${allMealOptions}</select>
      </div>
      <div class="input-row">
        <input type="text" id="day-pick" placeholder="Day (e.g. Monday)">
        <button class="btn-add-inline" id="plan-add">Add</button>
      </div>
    </div>

    <div class="section-card">
      <h3>✏️ Add manually</h3>
      <div class="input-row" style="margin-bottom:8px">
        <input type="text" id="m-day" placeholder="Day">
        <input type="text" id="m-meal" placeholder="Meal name">
      </div>
      <div class="input-row">
        <input type="text" id="m-item" placeholder="Ingredient">
        <button class="btn-add-inline" id="m-add">Add</button>
      </div>
    </div>

    ${listHtml}
    ${state.shoppingList.length ? `<button class="btn-danger-full" id="clear-list">🗑 Clear list</button>` : ''}
  `;

  // Checkboxes
  app.querySelectorAll('.shop-item').forEach(el => {
    el.addEventListener('click', async () => {
      const gi = +el.dataset.gi, ii = +el.dataset.ii;
      state.shoppingList[gi].items[ii].checked = !state.shoppingList[gi].items[ii].checked;
      await saveState();
      renderShopping(app);
    });
  });

  // Plan add
  app.querySelector('#plan-add').addEventListener('click', async () => {
    const id  = app.querySelector('#meal-pick').value;
    const day = app.querySelector('#day-pick').value.trim();
    const meal = state.meals.find(m => m.id === id);
    if (!meal || !day) return;
    const items = ingredientsFlat(meal).map(n => ({ name: n, checked: false }));
    if (!items.length) return alert('This meal has no ingredients in its modules.');
    state.shoppingList.push({ day, meal: meal.name, items });
    await saveState();
    renderShopping(app);
  });

  // Manual add
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

  // Clear
  app.querySelector('#clear-list')?.addEventListener('click', async () => {
    if (!confirm('Clear the entire shopping list?')) return;
    state.shoppingList = [];
    await saveState();
    renderShopping(app);
  });
}

/* ─── SETTINGS ─── */
function renderSettings(app) {
  const modulesHtml = state.modules.map(mod => `
    <div class="settings-module" id="mod-${mod.id}">
      <div class="settings-module-header">
        <span class="settings-module-name">
          ${mod.emoji} ${mod.name}
          <span class="settings-module-count">${mod.ingredients.length} items</span>
        </span>
        <span style="color:var(--text3);font-size:0.85rem">▼</span>
      </div>
      <div class="settings-module-body hidden" id="mod-body-${mod.id}">
        <div class="settings-chip-list" id="chips-${mod.id}">
          ${mod.ingredients.map((ing, idx) => `
            <span class="settings-chip">
              ${ing}
              <button class="settings-chip-del" data-mod="${mod.id}" data-idx="${idx}">✕</button>
            </span>`).join('')}
        </div>
        <div class="add-ingredient-row">
          <input type="text" id="add-ing-${mod.id}" placeholder="Add ingredient…" autocapitalize="words">
          <button data-addmod="${mod.id}">Add</button>
        </div>
        <button class="settings-del-module" data-delmod="${mod.id}">🗑 Delete this module</button>
      </div>
    </div>`).join('');

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    ${modulesHtml}

    <div class="new-module-card">
      <h3>+ New module</h3>
      <div class="input-row" style="margin-bottom:8px">
        <input type="text" id="new-mod-emoji" placeholder="Emoji (e.g. 🥗)" style="max-width:80px;text-align:center">
        <input type="text" id="new-mod-name" placeholder="Module name (e.g. Salad)" autocapitalize="words">
      </div>
      <button class="btn-add-inline" id="create-module" style="width:100%;margin-top:4px">Create module</button>
    </div>

    <div class="data-card">
      <h3>Data</h3>
      <div class="data-btns">
        <button class="btn-secondary" id="export-btn">📤 Export</button>
        <label class="btn-secondary" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
          📥 Import
          <input type="file" id="import-input" accept="application/json" style="display:none">
        </label>
      </div>
    </div>

    <div class="about-card">
      <div class="about-logo">Cook<span>Book</span></div>
      <div class="about-version">Version 2.0 · Offline PWA</div>
    </div>
  `;

  // Toggle module bodies
  app.querySelectorAll('.settings-module-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      body.classList.toggle('hidden');
      h.querySelector('span:last-child').textContent =
        body.classList.contains('hidden') ? '▼' : '▲';
    });
  });

  // Delete ingredient
  app.querySelectorAll('.settings-chip-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const modId = btn.dataset.mod;
      const idx   = +btn.dataset.idx;
      const mod   = getModuleById(modId);
      mod.ingredients.splice(idx, 1);
      await saveState();
      renderSettings(app);
    });
  });

  // Add ingredient to module
  app.querySelectorAll('[data-addmod]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modId = btn.dataset.addmod;
      const input = app.querySelector(`#add-ing-${modId}`);
      const val   = input.value.trim().toLowerCase();
      if (!val) return;
      const mod = getModuleById(modId);
      if (!mod.ingredients.includes(val)) {
        mod.ingredients.push(val);
        await saveState();
        renderSettings(app);
      }
    });
  });

  // Delete module
  app.querySelectorAll('[data-delmod]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modId = btn.dataset.delmod;
      if (!confirm('Delete this module and all its ingredients?')) return;
      state.modules = state.modules.filter(m => m.id !== modId);
      await saveState();
      renderSettings(app);
    });
  });

  // Create new module
  app.querySelector('#create-module').addEventListener('click', async () => {
    const emoji = app.querySelector('#new-mod-emoji').value.trim() || '📦';
    const name  = app.querySelector('#new-mod-name').value.trim();
    if (!name) return;
    const newMod = {
      id:          name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name:        name,
      emoji:       emoji,
      ingredients: [],
    };
    state.modules.push(newMod);
    await saveState();
    renderSettings(app);
  });

  // Export
  app.querySelector('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'cookbook-export.json';
    a.click();
  });

  // Import
  app.querySelector('#import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), imported);
      await saveState();
      renderSettings(app);
      alert('Import successful!');
    } catch {
      alert('Invalid file.');
    }
  });
}

/* ─── SORT & SEARCH ─── */
document.getElementById('sort-btn').addEventListener('click', () => {
  sortOpen = !sortOpen;
  document.getElementById('sort-sheet').classList.toggle('hidden', !sortOpen);
});

document.getElementById('search-btn').addEventListener('click', () => {
  searchOpen = !searchOpen;
  const bar = document.getElementById('search-bar');
  bar.classList.toggle('hidden', !searchOpen);
  document.getElementById('app').classList.toggle('search-open', searchOpen);
  if (searchOpen) setTimeout(() => bar.querySelector('input').focus(), 50);
  else {
    bar.querySelector('input').value = '';
    renderHome(document.getElementById('app'));
  }
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

// Close sort sheet on outside click
document.addEventListener('click', e => {
  if (sortOpen && !e.target.closest('#sort-sheet') && !e.target.closest('#sort-btn')) {
    sortOpen = false;
    document.getElementById('sort-sheet').classList.add('hidden');
  }
});

/* ─── NAV ─── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'add') {
      startWizard(null);
      return;
    }
    wizard.active = false;
    view = tab;
    render();
  });
});

/* ─── PWA INSTALL ─── */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});

/* ─── SERVICE WORKER ─── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {})
  );
}

/* ─── BOOT ─── */
(async () => {
  await loadState();
  render();
})();
