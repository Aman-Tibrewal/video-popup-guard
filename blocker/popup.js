const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
let tab = null;

const LABELS = [
  ['popup', 'Pop-ups faked'],
  ['tab', 'Hidden new tabs stopped'],
  ['closed', 'Stray tabs/windows closed'],
  ['overlay', 'Invisible layers removed'],
  ['redirect', 'Redirects reversed'],
];

function render(s, justTurnedOn) {
  $('switch').setAttribute('aria-checked', String(s.on));
  $('status').textContent = s.on ? 'Protection is ON' : 'Protection is off';
  $('keys').hidden = !s.on;

  const web = tab && /^https?:/.test(tab.url || '');
  $('reloadHint').hidden = !(justTurnedOn && web);
  $('reload').hidden = !(justTurnedOn && web);

  const c = s.counts || { total: 0 };
  $('counts').hidden = !s.on || !c.total;
  $('counts').innerHTML = '';
  if (c.total) {
    for (const [k, label] of LABELS) {
      if (!c[k]) continue;
      const a = document.createElement('span'); a.textContent = label;
      const b = document.createElement('span'); b.textContent = c[k];
      $('counts').append(a, b);
    }
    const a = document.createElement('span'); a.className = 'total'; a.textContent = 'Total on this page';
    const b = document.createElement('span'); b.className = 'total'; b.textContent = c.total;
    $('counts').append(a, b);
  }
}

async function refresh() {
  render(await send({ kind: 'getState', tabId: tab && tab.id }));
}

$('switch').onclick = async () => {
  const turnOn = $('switch').getAttribute('aria-checked') !== 'true';
  await send({ kind: 'setOn', on: turnOn });
  render(await send({ kind: 'getState', tabId: tab && tab.id }), turnOn);
  $('msg').textContent = '';
};
$('reload').onclick = () => { chrome.tabs.reload(tab.id); window.close(); };
$('closePopups').onclick = async () => {
  const r = await send({ kind: 'closePopups' });
  $('msg').textContent = `Closed ${r.closed || 0} pop-up window(s).`;
};

// ---- dead player domains ----
async function renderRedirects() {
  const { redirects } = await chrome.storage.local.get('redirects');
  const cfg = redirects || { enabled: false, mappings: [] };
  $('redirSwitch').setAttribute('aria-checked', String(!!cfg.enabled));
  const active = cfg.mappings.filter((m) => m.enabled && m.target && m.sources.length);
  const n = active.reduce((sum, m) => sum + m.sources.length, 0);
  $('redirSummary').textContent = !cfg.enabled
    ? 'Off: sites load as they are'
    : active.length === 1
      ? `${n} domain${n === 1 ? '' : 's'} → ${active[0].target}`
      : `${n} domain${n === 1 ? '' : 's'} in ${active.length} redirect${active.length === 1 ? '' : 's'}`;
}
$('redirSwitch').onclick = async () => {
  const { redirects } = await chrome.storage.local.get('redirects');
  if (!redirects) return;
  redirects.enabled = !redirects.enabled;
  await chrome.storage.local.set({ redirects });
  renderRedirects();
};
$('manage').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  await renderRedirects();
})();
