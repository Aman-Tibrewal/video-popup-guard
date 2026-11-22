const $ = (sel, root = document) => root.querySelector(sel);
let cfg = { enabled: true, mappings: [] };
const notes = new Map(); // mapping id -> short-lived message (e.g. "not a valid domain")
let focusAfterRender = null; // { id, field }

async function load() {
  const r = await chrome.storage.local.get('redirects');
  cfg = r.redirects || structuredClone(DEFAULT_REDIRECTS);
  render();
}

let savedTimer = null;
async function save() {
  await chrome.storage.local.set({ redirects: cfg });
  $('#saved').textContent = 'Saved';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('#saved').textContent = ''; }, 1500);
}

const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const find = (id) => cfg.mappings.find((m) => m.id === id);

function render() {
  $('#master').setAttribute('aria-checked', String(cfg.enabled));
  $('#list').classList.toggle('dim', !cfg.enabled);
  const errs = redirectProblems(cfg);
  const list = $('#list');
  list.innerHTML = '';
  if (!cfg.mappings.length) {
    const p = document.createElement('p');
    p.className = 'empty muted';
    p.textContent = 'No redirects yet. Click "Add redirect" to create one.';
    list.append(p);
  }
  for (const m of cfg.mappings) list.append(card(m, errs[m.id] || []));
  if (focusAfterRender) {
    const el = list.querySelector(`[data-id="${focusAfterRender.id}"] .${focusAfterRender.field}`);
    if (el) el.focus();
    focusAfterRender = null;
  }
}

function card(m, errs) {
  const el = document.createElement('section');
  el.className = 'card' + (m.enabled ? '' : ' off');
  el.dataset.id = m.id;
  el.innerHTML = `
    <div class="row">
      <button class="switch sm" role="switch" aria-label="Use this redirect"></button>
      <label class="target">Send to <input class="tgt" placeholder="working-domain.com" spellcheck="false" autocomplete="off"></label>
      <button class="act del">Delete</button>
    </div>
    <div class="body">
      <div class="label">Instead of these domains</div>
      <div class="chips"></div>
      <div class="row add" style="margin-top:8px">
        <input class="src" placeholder="dead-domain.com — separate several with commas" spellcheck="false" autocomplete="off">
        <button class="act addsrc">Add</button>
      </div>
    </div>
    <ul class="errs"></ul>`;

  const sw = $('.switch', el);
  sw.setAttribute('aria-checked', String(m.enabled));
  sw.onclick = () => { m.enabled = !m.enabled; save(); render(); };

  const tgt = $('.tgt', el);
  tgt.value = m.target || '';
  tgt.onchange = () => {
    const v = normDomain(tgt.value, false);
    if (v === null) { notes.set(m.id, `"${tgt.value.trim()}" isn't a valid domain.`); render(); return; }
    m.target = v;
    notes.delete(m.id);
    save();
    render();
  };
  tgt.onkeydown = (e) => { if (e.key === 'Enter') tgt.blur(); };

  $('.del', el).onclick = () => {
    if (!confirm(`Delete the redirect to ${m.target || '(no domain yet)'}?`)) return;
    cfg.mappings = cfg.mappings.filter((x) => x !== m);
    notes.delete(m.id);
    save();
    render();
  };

  const chips = $('.chips', el);
  if (!m.sources.length) {
    const none = document.createElement('span');
    none.className = 'muted';
    none.textContent = 'None yet';
    chips.append(none);
  }
  for (const s of m.sources) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const name = document.createElement('span');
    name.textContent = s;
    const x = document.createElement('button');
    x.title = `Remove ${s}`;
    x.setAttribute('aria-label', `Remove ${s}`);
    x.textContent = '×';
    x.onclick = () => { m.sources = m.sources.filter((d) => d !== s); save(); render(); };
    chip.append(name, x);
    chips.append(chip);
  }

  const src = $('.src', el);
  const addSources = () => {
    const bad = [];
    for (const part of src.value.split(/[\s,;]+/).filter(Boolean)) {
      const d = normDomain(part, true);
      if (!d) bad.push(part);
      else if (!m.sources.includes(d)) m.sources.push(d);
    }
    if (bad.length) notes.set(m.id, `Not valid domain${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}`);
    else notes.delete(m.id);
    focusAfterRender = { id: m.id, field: 'src' };
    save();
    render();
  };
  $('.addsrc', el).onclick = addSources;
  src.onkeydown = (e) => { if (e.key === 'Enter') addSources(); };

  const ul = $('.errs', el);
  for (const msg of [notes.get(m.id), ...errs].filter(Boolean)) {
    const li = document.createElement('li');
    li.textContent = msg;
    ul.append(li);
  }
  return el;
}

$('#master').onclick = () => { cfg.enabled = !cfg.enabled; save(); render(); };
$('#addMapping').onclick = () => {
  const m = { id: newId(), target: '', sources: [], enabled: true };
  cfg.mappings.push(m);
  focusAfterRender = { id: m.id, field: 'tgt' };
  render();
  save();
};

chrome.storage.onChanged.addListener((changes, area) => {
  // Keep in sync if the toolbar popup flips the switch while this page is open.
  if (area === 'local' && changes.redirects && changes.redirects.newValue) {
    const nv = changes.redirects.newValue;
    if (nv.enabled !== cfg.enabled) { cfg.enabled = nv.enabled; render(); }
  }
});

load();
