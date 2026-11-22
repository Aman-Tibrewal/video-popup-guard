// Popup Recon - bridge between the in-page recorder (content-main.js) and the background.
// Asks the background whether this tab is being recorded; if not, tells the in-page
// recorder to switch itself off so nothing is collected.

(() => {
  const EVT = '__popup_recon_evt';
  const CTL = '__popup_recon_ctl';
  let on = false;
  let batch = [];
  let flushTimer = null;

  const ctl = (cmd) => document.dispatchEvent(new CustomEvent(CTL, { detail: JSON.stringify({ cmd }) }));

  function flush() {
    flushTimer = null;
    if (!batch.length) return;
    const events = batch;
    batch = [];
    try { chrome.runtime.sendMessage({ kind: 'events', events }).catch(() => {}); } catch {}
  }

  document.addEventListener(EVT, (e) => {
    if (!on) return;
    try { batch.push(JSON.parse(e.detail)); } catch { return; }
    if (!flushTimer) flushTimer = setTimeout(flush, 300);
  }, true);

  window.addEventListener('pagehide', flush, true);

  try {
    chrome.runtime.sendMessage({ kind: 'hello' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.record) { ctl('off'); return; }
      on = true;
      ctl('on');
    });
  } catch {
    ctl('off');
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.kind === 'snapshot' && on) ctl('snapshot');
    if (msg.kind === 'stop') { flush(); on = false; ctl('off'); }
  });
})();
