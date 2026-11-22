// Popup Recon - background recorder.
// Records browser-level events (new tabs, pop-up windows, navigations, focus jumps)
// for the tab you start recording on, plus every tab that tab spawns.
// Page-level events arrive from content-bridge.js.

const MAX_EVENTS = 20000;
let S = null;
let loading = null;
let saveTimer = null;

function fresh() {
  return { recording: false, tabs: [], rootTabId: null, rootUrl: null, startedAt: null, stoppedAt: null, truncated: false, events: [] };
}

function load() {
  if (!loading) {
    loading = chrome.storage.local.get('recon').then((d) => (S = d.recon || fresh()));
  }
  return loading;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ recon: S }), 400);
}

function saveNow() {
  clearTimeout(saveTimer);
  return chrome.storage.local.set({ recon: S });
}

function add(ev) {
  if (S.events.length >= MAX_EVENTS) {
    S.truncated = true;
    return;
  }
  S.events.push({ t: Date.now(), ...ev });
  save();
}

const tracked = (tabId) => S.recording && S.tabs.includes(tabId);

// The in-page recorder is injected ONLY while a recording is running,
// so with recording off the extension touches no page at all.
const MAIN_ID = 'recon-main';
async function setMainScript(on) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_ID] });
  if (on && !existing.length) {
    await chrome.scripting.registerContentScripts([{
      id: MAIN_ID, js: ['content-main.js'], matches: ['<all_urls>'], runAt: 'document_start',
      allFrames: true, matchOriginAsFallback: true, world: 'MAIN', persistAcrossSessions: true,
    }]);
  } else if (!on && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [MAIN_ID] });
  }
}
load().then(() => setMainScript(S.recording)).catch(() => {});

async function frameUrl(tabId, frameId) {
  try { return ((await chrome.webNavigation.getFrame({ tabId, frameId })) || {}).url || null; } catch { return null; }
}

function host(u) {
  try { return new URL(u).hostname; } catch { return ''; }
}

function stats() {
  const c = (type) => S.events.filter((e) => e.type === type).length;
  const rootHost = host(S.rootUrl);
  return {
    windowOpenCalls: c('window.open'),
    newTabs: S.events.filter((e) => e.type === 'tab.created' || e.type === 'popup.target').reduce((set, e) => set.add(e.tab), new Set()).size,
    currentTabHijacks: S.events.filter(
      (e) => e.type === 'nav.committed' && e.tab === S.rootTabId && e.frameId === 0 && host(e.url) && host(e.url) !== rootHost
    ).length,
    clicks: S.events.filter((e) => e.type === 'input' && e.ev === 'pointerdown' && e.trusted).length,
  };
}

function status() {
  return {
    recording: S.recording,
    rootUrl: S.rootUrl,
    rootTabId: S.rootTabId,
    tabs: S.tabs.length,
    count: S.events.length,
    startedAt: S.startedAt,
    truncated: S.truncated,
    stats: stats(),
  };
}

async function handle(msg, sender) {
  await load();
  switch (msg.kind) {
    case 'hello':
      return { record: !!sender.tab && tracked(sender.tab.id) };

    case 'events':
      if (sender.tab && tracked(sender.tab.id)) {
        for (const e of msg.events) add({ src: 'page', tab: sender.tab.id, frameId: sender.frameId, ...e });
      }
      return {};

    case 'status':
      return status();

    case 'start': {
      const tab = await chrome.tabs.get(msg.tabId);
      S = fresh();
      S.recording = true;
      S.tabs = [tab.id];
      S.rootTabId = tab.id;
      S.rootUrl = tab.url;
      S.startedAt = Date.now();
      add({ src: 'ext', type: 'recording.start', tab: tab.id, url: tab.url, userAgent: navigator.userAgent });
      try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        add({ src: 'browser', type: 'frames.at-start', tab: tab.id, frames: (frames || []).map((f) => ({ frameId: f.frameId, parent: f.parentFrameId, url: String(f.url).slice(0, 300) })) });
      } catch {}
      await setMainScript(true);
      await saveNow();
      return status();
    }

    case 'stop':
      if (S.recording) {
        add({ src: 'ext', type: 'recording.stop' });
        for (const t of S.tabs) chrome.tabs.sendMessage(t, { kind: 'stop' }).catch(() => {});
        S.recording = false;
        S.stoppedAt = Date.now();
        await saveNow();
      }
      await setMainScript(false);
      return status();

    case 'note':
      add({ src: 'user', type: 'note', text: String(msg.text || '').slice(0, 500) });
      return status();

    case 'snapshot':
      for (const t of S.tabs) chrome.tabs.sendMessage(t, { kind: 'snapshot' }).catch(() => {});
      add({ src: 'user', type: 'snapshot.requested' });
      return status();

    case 'export':
      await saveNow();
      return {
        report: {
          tool: 'popup-recon',
          version: chrome.runtime.getManifest().version,
          rootUrl: S.rootUrl,
          startedAt: S.startedAt,
          stoppedAt: S.stoppedAt,
          truncated: S.truncated,
          stats: stats(),
          events: S.events,
        },
      };

    case 'closePopups': {
      // Closes every tab the recorded site spawned, plus every pop-up-style window
      // (the small windows without a tab bar). Closing this way skips "Leave site?" prompts.
      const ids = new Set(S.tabs.filter((t) => t !== S.rootTabId));
      try {
        for (const w of await chrome.windows.getAll({ windowTypes: ['popup'], populate: true })) {
          for (const t of w.tabs || []) ids.add(t.id);
        }
      } catch {}
      let closed = 0;
      for (const id of ids) {
        try { await chrome.tabs.remove(id); closed++; } catch {}
      }
      return { ...status(), closed };
    }

    case 'clear':
      S = fresh();
      await saveNow();
      await setMainScript(false);
      return status();
  }
  return {};
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply, (err) => reply({ error: String(err) }));
  return true;
});

// ---- Browser-level observation (only for tracked tabs) ----

chrome.tabs.onCreated.addListener(async (tab) => {
  await load();
  if (!S.recording || tab.openerTabId == null || !S.tabs.includes(tab.openerTabId)) return;
  if (!S.tabs.includes(tab.id)) S.tabs.push(tab.id);
  let windowType = null;
  try { windowType = (await chrome.windows.get(tab.windowId)).type; } catch {}
  add({ src: 'browser', type: 'tab.created', tab: tab.id, opener: tab.openerTabId, url: tab.pendingUrl || tab.url, active: tab.active, windowId: tab.windowId, windowType });
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (d) => {
  await load();
  if (!S.recording || !S.tabs.includes(d.sourceTabId)) return;
  if (!S.tabs.includes(d.tabId)) S.tabs.push(d.tabId);
  const sourceFrameUrl = await frameUrl(d.sourceTabId, d.sourceFrameId);
  add({ src: 'browser', type: 'popup.target', tab: d.tabId, sourceTab: d.sourceTabId, sourceFrameId: d.sourceFrameId, sourceFrameUrl, url: d.url });
});

// Page loads that start but stall or fail (to catch "the site won't load").
chrome.webNavigation.onBeforeNavigate.addListener(async (d) => {
  await load();
  if (!tracked(d.tabId) || d.frameId !== 0) return;
  add({ src: 'browser', type: 'nav.start', tab: d.tabId, frameId: d.frameId, url: d.url });
});
chrome.webNavigation.onCompleted.addListener(async (d) => {
  await load();
  if (!tracked(d.tabId) || d.frameId !== 0) return;
  add({ src: 'browser', type: 'nav.completed', tab: d.tabId, url: d.url });
});
chrome.webNavigation.onErrorOccurred.addListener(async (d) => {
  await load();
  if (!tracked(d.tabId)) return;
  add({ src: 'browser', type: 'nav.error', tab: d.tabId, frameId: d.frameId, url: d.url, error: d.error });
});

chrome.webNavigation.onCommitted.addListener(async (d) => {
  await load();
  if (!tracked(d.tabId)) return;
  add({ src: 'browser', type: 'nav.committed', tab: d.tabId, frameId: d.frameId, parentFrameId: d.parentFrameId, url: d.url, transition: d.transitionType, qualifiers: d.transitionQualifiers });
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await load();
  if (!tracked(tabId)) return;
  add({ src: 'browser', type: 'tab.activated', tab: tabId, windowId, isRoot: tabId === S.rootTabId });
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await load();
  if (!S.recording || windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [active] = await chrome.tabs.query({ windowId, active: true });
    if (active && tracked(active.id)) add({ src: 'browser', type: 'window.focused', windowId, tab: active.id, isRoot: active.id === S.rootTabId });
  } catch {}
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await load();
  if (!tracked(tabId)) return;
  add({ src: 'browser', type: 'tab.closed', tab: tabId, isRoot: tabId === S.rootTabId });
});
