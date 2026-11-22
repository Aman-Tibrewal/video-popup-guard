// Video Popup Guard - bridge between the in-page layer (blocker-main.js) and the background.
// Does nothing unless the switch is ON.

(() => {
  const EVT = '__vpg_e';
  const CTL = '__vpg_c';
  const toPage = (msg) => document.dispatchEvent(new CustomEvent(CTL, { detail: JSON.stringify(msg) }));

  document.addEventListener(EVT, (e) => {
    let m;
    try { m = JSON.parse(e.detail); } catch { return; }
    try { chrome.runtime.sendMessage(m).catch(() => {}); } catch {}
  }, true);

  chrome.runtime.onMessage.addListener((m) => {
    if (m && (m.kind === 'state' || m.kind === 'cmd')) toPage(m);
  });

  chrome.storage.local.get('on').then((r) => {
    if (!r.on) return;
    chrome.runtime.sendMessage({ kind: 'hello' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      toPage({ kind: 'state', tabHasVideo: !!resp.tabHasVideo });
    });
  }).catch(() => {});
})();
