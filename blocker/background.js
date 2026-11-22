// Video Popup Guard - background.
// - The ON/OFF switch (registers the in-page layer only while ON).
// - Badge: "ON", or the number of things blocked on the current tab.
// - Safety net: closes new tabs/windows a page opens to a different site.
// - Redirect guard: if a video page is sent to another site, it goes back.
// - Routes keyboard commands to the frame that holds the video.

importScripts('redirect-rules.js');

const MAIN_ID = 'vpg-main';
const GREEN = '#15803d';
const ORANGE = '#c2410c';
// Navigations you start yourself; these are never "corrected".
const USER_TRANSITIONS = new Set(['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated', 'reload', 'start_page', 'auto_toplevel']);

let on = false;
// Per-tab state, kept in session storage so it survives the service worker sleeping.
let T = { counts: {}, info: {}, frames: {}, exempt: {}, pending: {} };

const SLD2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'net.in', 'org.in', 'co.jp', 'co.nz', 'com.br', 'com.mx', 'co.za', 'com.sg', 'com.my', 'com.tr', 'com.cn', 'com.hk', 'co.id', 'com.ar', 'co.kr', 'com.ph', 'com.pk', 'com.vn']);
function site(host) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  const p = host.split('.');
  if (p.length <= 2) return host;
  return SLD2.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}
function siteOf(url) {
  try { return site(new URL(url).hostname); } catch { return ''; }
}
const isWeb = (u) => /^https?:/i.test(String(u || ''));

const ready = (async () => {
  on = !!(await chrome.storage.local.get('on')).on;
  const s = await chrome.storage.session.get('T');
  if (s.T) T = { counts: {}, info: {}, frames: {}, exempt: {}, pending: {}, ...s.T };
  await syncMainScript();
  await refreshAllBadges();
  await applyRedirects();
})();

// ---- dead player domains → working domain (independent of the pop-up switch) ----
let redirectChain = Promise.resolve();
function applyRedirects() {
  const run = async () => {
    let { redirects } = await chrome.storage.local.get('redirects');
    if (!redirects) {
      redirects = DEFAULT_REDIRECTS;
      await chrome.storage.local.set({ redirects });
    }
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: buildRedirectRules(redirects),
    });
  };
  redirectChain = redirectChain.then(run, run);
  return redirectChain;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.redirects) applyRedirects().catch(() => {});
});

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.session.set({ T }), 300);
}

async function syncMainScript() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_ID] });
  if (on && !existing.length) {
    await chrome.scripting.registerContentScripts([{
      id: MAIN_ID, js: ['blocker-main.js'], matches: ['<all_urls>'], runAt: 'document_start',
      allFrames: true, matchOriginAsFallback: true, world: 'MAIN', persistAcrossSessions: true,
    }]);
  } else if (!on && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [MAIN_ID] });
  }
}

// ---- badge ----
async function badge(tabId) {
  const n = (T.counts[tabId] && T.counts[tabId].total) || 0;
  try {
    await chrome.action.setBadgeText({ tabId, text: on ? (n ? String(n) : 'ON') : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: n ? ORANGE : GREEN });
  } catch {}
}
async function refreshAllBadges() {
  try {
    await chrome.action.setBadgeText({ text: on ? 'ON' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: GREEN });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch {}
  for (const t of await chrome.tabs.query({})) badge(t.id);
}
function count(tabId, what) {
  if (tabId == null || tabId < 0) return;
  const c = (T.counts[tabId] ||= { total: 0 });
  c[what] = (c[what] || 0) + 1;
  c.total++;
  persist();
  badge(tabId);
}

// ---- which frame holds the video ----
const hasVideo = (tabId) => Object.values(T.frames[tabId] || {}).some((a) => a > 0);
function primaryFrame(tabId) {
  let best = null;
  let ba = 0;
  for (const [fid, a] of Object.entries(T.frames[tabId] || {})) if (a > ba) { ba = a; best = Number(fid); }
  return best;
}

// ---- messages from pages and from the popup ----
async function handle(m, sender) {
  await ready;
  const tabId = sender.tab ? sender.tab.id : m.tabId;
  switch (m.kind) {
    case 'hello':
      return { on, tabHasVideo: hasVideo(tabId) };

    case 'blocked':
      if (on) count(tabId, m.what);
      return {};

    case 'video': {
      const had = hasVideo(tabId);
      const f = (T.frames[tabId] ||= {});
      if (m.area > 0) f[sender.frameId] = m.area;
      else delete f[sender.frameId];
      if (hasVideo(tabId)) (T.info[tabId] ||= {}).hadVideo = true;
      persist();
      if (!had && hasVideo(tabId)) chrome.tabs.sendMessage(tabId, { kind: 'state', tabHasVideo: true }).catch(() => {});
      return {};
    }

    case 'cmd': {
      if (m.cmd === 'exitfs') {
        chrome.tabs.sendMessage(tabId, { kind: 'cmd', cmd: 'exitfs' }).catch(() => {});
      } else {
        const fid = primaryFrame(tabId);
        if (fid != null) chrome.tabs.sendMessage(tabId, { kind: 'cmd', cmd: m.cmd }, { frameId: fid }).catch(() => {});
      }
      return {};
    }

    case 'userNav':
      T.exempt[tabId] = { url: m.url, t: Date.now() };
      persist();
      return {};

    // ---- popup ----
    case 'getState':
      return { on, counts: T.counts[m.tabId] || { total: 0 } };

    case 'setOn': {
      on = !!m.on;
      await chrome.storage.local.set({ on });
      await syncMainScript();
      for (const t of await chrome.tabs.query({})) chrome.tabs.sendMessage(t.id, { kind: 'state', on }).catch(() => {});
      await refreshAllBadges();
      return { on };
    }

    case 'closePopups': {
      let closed = 0;
      for (const w of await chrome.windows.getAll({ windowTypes: ['popup'], populate: true })) {
        for (const t of w.tabs || []) { try { await chrome.tabs.remove(t.id); closed++; } catch {} }
      }
      return { closed };
    }
  }
  return {};
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  handle(m, sender).then(reply, (e) => reply({ error: String(e) }));
  return true;
});

// ---- safety net: close tabs/windows a page opens to a different site ----
async function closeUnwanted(tabId, openerId) {
  try { await chrome.tabs.remove(tabId); } catch { return; }
  count(openerId, 'closed');
  try {
    const o = await chrome.tabs.get(openerId);
    await chrome.windows.update(o.windowId, { focused: true });
    await chrome.tabs.update(openerId, { active: true });
  } catch {}
}
async function judgeNewTab(tabId, openerId, url) {
  await ready;
  if (!on) return;
  let opener;
  let tab;
  try { opener = await chrome.tabs.get(openerId); tab = await chrome.tabs.get(tabId); } catch { return; }
  const openerSite = siteOf(opener.url || opener.pendingUrl);
  let isPopupWindow = false;
  try { isPopupWindow = (await chrome.windows.get(tab.windowId)).type === 'popup'; } catch {}
  const u = url || tab.pendingUrl || tab.url || '';
  if (isWeb(u)) {
    if (siteOf(u) === openerSite && !isPopupWindow) return; // e.g. you Cmd-clicked another video on the same site
    return closeUnwanted(tabId, openerId);
  }
  if (isPopupWindow) return closeUnwanted(tabId, openerId); // blank pop-up windows are always ads
  T.pending[tabId] = { openerId, openerSite, until: Date.now() + 20000 }; // blank tab: judge its first real address
  persist();
}
chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => judgeNewTab(d.tabId, d.sourceTabId, d.url));
chrome.tabs.onCreated.addListener(async (tab) => {
  // Fallback for pop-up windows that skip the event above.
  if (tab.openerTabId == null) return;
  await ready;
  if (!on) return;
  try {
    if ((await chrome.windows.get(tab.windowId)).type === 'popup') setTimeout(() => judgeNewTab(tab.id, tab.openerTabId, ''), 400);
  } catch {}
});
chrome.webNavigation.onBeforeNavigate.addListener(async (d) => {
  if (d.frameId !== 0) return;
  await ready;
  const p = T.pending[d.tabId];
  if (!p || !isWeb(d.url)) return;
  delete T.pending[d.tabId];
  persist();
  if (!on || Date.now() > p.until) return;
  if (siteOf(d.url) !== p.openerSite) closeUnwanted(d.tabId, p.openerId);
});

// ---- redirect guard + per-page reset ----
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  await ready;
  const prev = T.info[d.tabId];
  if (on && prev && prev.hadVideo && prev.url && isWeb(d.url) && siteOf(d.url) !== siteOf(prev.url)) {
    const q = d.transitionQualifiers || [];
    const ex = T.exempt[d.tabId];
    const yours = USER_TRANSITIONS.has(d.transitionType) || q.includes('from_address_bar') || q.includes('forward_back')
      || (ex && Date.now() - ex.t < 5000 && siteOf(ex.url) === siteOf(d.url));
    const recent = (prev.guards || []).filter((t) => Date.now() - t < 60000);
    if (!yours && recent.length < 3) {
      prev.guards = [...recent, Date.now()];
      prev.restoring = true;
      persist();
      count(d.tabId, 'redirect');
      chrome.tabs.update(d.tabId, { url: prev.url }).catch(() => {});
      return;
    }
  }
  const keepCounts = prev && prev.restoring && siteOf(d.url) === siteOf(prev.url);
  T.info[d.tabId] = { url: d.url, hadVideo: false, guards: keepCounts ? prev.guards : [] };
  T.frames[d.tabId] = {};
  if (!keepCounts) delete T.counts[d.tabId];
  persist();
  badge(d.tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  for (const k of ['counts', 'info', 'frames', 'exempt', 'pending']) delete T[k][tabId];
  persist();
});
