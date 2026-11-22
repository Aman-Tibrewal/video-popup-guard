const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
let activeTab = null;

function host(u) {
  try { return new URL(u).hostname; } catch { return u || ''; }
}

function render(s) {
  const recording = s.recording;
  $('dot').classList.toggle('rec', recording);
  $('title').textContent = recording ? 'Recording' : 'Popup Recon';

  const canRecordHere = activeTab && /^https?:/.test(activeTab.url || '');
  if (recording) {
    $('sub').textContent = `On ${host(s.rootUrl)} · ${s.tabs} tab(s) tracked`;
  } else if (s.count) {
    $('sub').textContent = `Stopped. Recording of ${host(s.rootUrl)} is ready to export.`;
  } else {
    $('sub').textContent = canRecordHere ? 'Open the site (home or listing page), then press Start.' : 'Open the site first (this tab is not a website).';
  }

  $('start').hidden = recording || !canRecordHere;
  $('startNote').hidden = $('start').hidden;
  $('recControls').hidden = !recording;
  $('export').hidden = !s.count;
  $('clear').hidden = !s.count || recording;

  if (s.count) {
    const st = s.stats;
    $('stats').hidden = false;
    $('stats').innerHTML = '';
    const rows = [
      ['Your clicks', st.clicks],
      ['Pop-up attempts (window.open)', st.windowOpenCalls],
      ['New tabs / windows opened', st.newTabs],
      ['Video tab sent elsewhere', st.currentTabHijacks],
      ['Events recorded', s.count + (s.truncated ? ' (full)' : '')],
    ];
    for (const [k, v] of rows) {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('strong'); b.textContent = v;
      $('stats').append(a, b);
    }
  } else {
    $('stats').hidden = true;
  }
}

async function refresh() {
  render(await send({ kind: 'status' }));
}

$('start').onclick = async () => {
  render(await send({ kind: 'start', tabId: activeTab.id }));
  $('msg').textContent = 'Recording. Now click into a video (or reload this page yourself). This popup can be closed.';
};
$('stop').onclick = async () => render(await send({ kind: 'stop' }));
$('snap').onclick = async () => { render(await send({ kind: 'snapshot' })); $('msg').textContent = 'Snapshot taken.'; };
$('addNote').onclick = async () => {
  const text = $('note').value.trim();
  if (!text) return;
  render(await send({ kind: 'note', text }));
  $('note').value = '';
  $('msg').textContent = 'Note added.';
};
$('note').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addNote').click(); });
$('closePopups').onclick = async () => {
  const s = await send({ kind: 'closePopups' });
  render(s);
  $('msg').textContent = `Closed ${s.closed} pop-up(s).`;
};
$('clear').onclick = async () => {
  if (!confirm('Delete the current recording?')) return;
  render(await send({ kind: 'clear' }));
  $('msg').textContent = '';
};
$('export').onclick = async () => {
  const { report } = await send({ kind: 'export' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recon-${host(report.rootUrl) || 'site'}-${stamp}.json`;
  a.click();
  $('msg').textContent = 'Saved to your Downloads folder.';
};

(async () => {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refresh();
  setInterval(refresh, 1500);
})();
