// Video Popup Guard - in-page layer (runs in the page's own JavaScript world, in every frame).
// Registered only while the toolbar switch is ON.
//
// 1. Fake pop-ups: window.open returns a fake window that reports success; nothing opens.
// 2. Hidden forms / programmatic link clicks that would open a new tab are dropped.
// 3. Invisible layers over a video become click-through.
// 4. Ad scripts' page-wide click/key listeners still run, but can no longer swallow your input.
// 5. Video keyboard shortcuts are handled here, directly on the <video>.

(() => {
  const EVT = '__vpg_e';
  const CTL = '__vpg_c';
  const W = window;

  // ---- natives, captured before any page script runs ----
  const _dispatch = EventTarget.prototype.dispatchEvent;
  const _add = EventTarget.prototype.addEventListener;
  const _fnToString = Function.prototype.toString;
  const _CustomEvent = W.CustomEvent;
  const _stringify = JSON.stringify;
  const _parse = JSON.parse;
  const _getCS = W.getComputedStyle;
  const _now = Date.now;
  const _setTimeout = W.setTimeout;
  const _setInterval = W.setInterval;
  const _Proxy = W.Proxy;
  const _Reflect = W.Reflect;

  let active = true;        // switched off live when the toolbar switch is turned off
  let tabHasVideo = false;  // true when any frame in this tab has a real video

  function send(msg) {
    try { _dispatch.call(document, new _CustomEvent(EVT, { detail: _stringify(msg) })); } catch {}
  }
  const blocked = (what) => send({ kind: 'blocked', what });

  _add.call(document, CTL, (e) => {
    let m;
    try { m = _parse(e.detail); } catch { return; }
    if (m.kind === 'state') {
      if ('on' in m) active = !!m.on;
      if ('tabHasVideo' in m) tabHasVideo = !!m.tabHasVideo;
    } else if (m.kind === 'cmd') {
      runRemote(m.cmd);
    }
  });

  // ---- site helpers ----
  const SLD2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'net.in', 'org.in', 'co.jp', 'co.nz', 'com.br', 'com.mx', 'co.za', 'com.sg', 'com.my', 'com.tr', 'com.cn', 'com.hk', 'co.id', 'com.ar', 'co.kr', 'com.ph', 'com.pk', 'com.vn']);
  function site(host) {
    host = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host;
    const p = host.split('.');
    if (p.length <= 2) return host;
    return SLD2.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
  }
  function hostOf(u) {
    try { return new URL(String(u).replace(/^blob:/, '')).hostname; } catch { return ''; }
  }
  let frameSite = site(location.hostname);
  if (!frameSite) { try { frameSite = site(hostOf(W.origin)); } catch {} }
  let topSite = frameSite;
  try {
    const ao = location.ancestorOrigins;
    if (ao && ao.length) topSite = site(hostOf(ao[ao.length - 1]));
  } catch {}

  // Video players and common libraries whose listeners are left completely alone.
  const SAFE = new Set(['jwpcdn.com', 'jwplayer.com', 'jwpsrv.com', 'jwplatform.com', 'jwpltx.com', 'zencdn.net', 'videojs.com', 'plyr.io', 'gstatic.com', 'googleapis.com', 'cloudflare.com', 'jsdelivr.net', 'unpkg.com', 'jquery.com', 'bootstrapcdn.com', 'youtube.com', 'ytimg.com', 'vimeo.com', 'vimeocdn.com', 'dailymotion.com', 'dmcdn.net', 'fluidplayer.com', 'flowplayer.com', 'clappr.io']);

  function stackUrls() {
    const old = Error.stackTraceLimit;
    Error.stackTraceLimit = 40;
    const s = new Error().stack || '';
    Error.stackTraceLimit = old;
    const out = [];
    for (const line of s.split('\n')) {
      if (line.includes('chrome-extension://')) continue;
      const m = line.match(/((?:blob:)?https?:\/\/[^\s)]+?)(?::\d+)+\)?\s*$/);
      if (m) out.push(m[1]);
    }
    return out;
  }
  function isAdScript(url) {
    const s = site(hostOf(url));
    return !!s && s !== frameSite && s !== topSite && !SAFE.has(s);
  }
  const calledByAd = () => stackUrls().some(isAdScript);

  // ---- make replaced functions look and behave like built-ins ----
  const nativeOf = new WeakMap();
  function disguise(fn, orig) {
    nativeOf.set(fn, orig);
    try { Object.defineProperty(fn, 'name', { value: orig.name }); } catch {}
    try { Object.defineProperty(fn, 'length', { value: orig.length }); } catch {}
    return fn;
  }
  function hook(obj, name, make) {
    try {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      const w = disguise(make(orig), orig);
      const d = Object.getOwnPropertyDescriptor(obj, name);
      if (d && 'value' in d) Object.defineProperty(obj, name, { ...d, value: w });
      else obj[name] = w;
    } catch {}
  }
  hook(Function.prototype, 'toString', () => ({ toString() { return _fnToString.call(nativeOf.get(this) || this); } }).toString);

  // ---- 1. fake pop-up windows ----
  let DEEP;
  DEEP = new _Proxy(function () {}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (typeof p === 'symbol' || p === 'then') return undefined;
      if (p === 'length') return 0;
      return DEEP;
    },
    apply() { return DEEP; },
    construct() { return DEEP; },
    set() { return true; },
  });
  function sink(base) {
    return new _Proxy(base, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p === 'symbol' || p === 'then') return undefined;
        return DEEP;
      },
      set(t, p, v) { t[p] = v; return true; },
    });
  }
  function fakeWindow(url, name) {
    let href = 'about:blank';
    try { if (url) href = new URL(String(url), location.href).href; } catch {}
    const loc = sink({
      get href() { return href; }, set href(v) { href = String(v); },
      assign(v) { href = String(v); }, replace(v) { href = String(v); }, reload() {},
      toString() { return href; },
      get host() { return hostOf(href); }, get hostname() { return hostOf(href); },
    });
    const doc = sink({
      write() {}, writeln() {}, open() { return doc; }, close() {},
      readyState: 'complete', title: '', cookie: '', body: DEEP, head: DEEP, documentElement: DEEP,
      createElement() { return DEEP; }, getElementById() { return null; }, querySelector() { return null; },
      get URL() { return href; }, get location() { return loc; }, set location(v) { href = String(v); },
    });
    const fw = {
      closed: false, name: String(name || ''), opener: W, length: 0,
      focus() {}, blur() {}, close() { fw.closed = true; },
      moveTo() {}, moveBy() {}, resizeTo() {}, resizeBy() {}, scrollTo() {}, postMessage() {}, stop() {}, print() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      get location() { return loc; }, set location(v) { href = String(v); },
      document: doc, navigator: W.navigator, screen: W.screen,
      innerWidth: 800, innerHeight: 600, outerWidth: 800, outerHeight: 600, screenX: 0, screenY: 0,
    };
    const p = sink(fw);
    fw.window = p; fw.self = p; fw.top = p; fw.parent = p; fw.frames = p;
    return p;
  }

  hook(W, 'open', (orig) => ({
    open(url, target, features) {
      if (!active) return orig.apply(this, arguments);
      blocked('popup');
      return fakeWindow(url, target);
    },
  }).open);

  // Ad scripts grab a clean window.open from a fresh blank iframe; patch those too.
  const patchedWins = new WeakSet();
  function patchWin(w) {
    try {
      if (!w || patchedWins.has(w)) return;
      patchedWins.add(w);
      if (w.open !== W.open) Object.defineProperty(w, 'open', { value: W.open, writable: true, configurable: true, enumerable: true });
    } catch {}
  }
  for (const proto of [HTMLIFrameElement.prototype, W.HTMLFrameElement && HTMLFrameElement.prototype]) {
    if (!proto) continue;
    for (const prop of ['contentWindow', 'contentDocument']) {
      try {
        const d = Object.getOwnPropertyDescriptor(proto, prop);
        if (!d || !d.get) continue;
        const g = d.get;
        const holder = prop === 'contentWindow'
          ? { get contentWindow() { const r = g.call(this); patchWin(r); return r; } }
          : { get contentDocument() { const r = g.call(this); try { patchWin(r && r.defaultView); } catch {} return r; } };
        const ng = disguise(Object.getOwnPropertyDescriptor(holder, prop).get, g);
        Object.defineProperty(proto, prop, { ...d, get: ng });
      } catch {}
    }
  }

  // ---- 2. hidden forms and scripted link clicks that open new tabs ----
  function opensNewTab(target) {
    const t = String(target || '').toLowerCase();
    if (!t || t === '_self' || t === '_parent' || t === '_top') return false;
    if (t === '_blank' || t === '_new') return true;
    try { if (document.querySelector('iframe[name="' + CSS.escape(t) + '"],frame[name="' + CSS.escape(t) + '"]')) return false; } catch {}
    return true;
  }
  hook(HTMLFormElement.prototype, 'submit', (orig) => ({
    submit() {
      if (active && opensNewTab(this.getAttribute('target'))) { blocked('tab'); return; }
      return orig.apply(this, arguments);
    },
  }).submit);
  hook(HTMLFormElement.prototype, 'requestSubmit', (orig) => ({
    requestSubmit(submitter) {
      const t = (submitter && submitter.getAttribute && submitter.getAttribute('formtarget')) || this.getAttribute('target');
      if (active && opensNewTab(t)) { blocked('tab'); return; }
      return orig.apply(this, arguments);
    },
  }).requestSubmit);
  _add.call(W, 'submit', (e) => {
    if (!active || e.isTrusted) return;
    const f = e.target;
    if (f && f.getAttribute && opensNewTab(f.getAttribute('target'))) { e.preventDefault(); blocked('tab'); }
  }, true);

  hook(HTMLAnchorElement.prototype, 'click', (orig) => ({
    click() {
      if (active && opensNewTab(this.getAttribute('target'))) { blocked('tab'); return; }
      return orig.apply(this, arguments);
    },
  }).click);
  hook(EventTarget.prototype, 'dispatchEvent', (orig) => ({
    dispatchEvent(ev) {
      if (active && ev && (ev.type === 'click' || ev.type === 'auxclick') && this && this.nodeType === 1 && this.closest) {
        const a = this.closest('a[href]');
        if (a && (opensNewTab(a.getAttribute('target')) || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) {
          blocked('tab');
          return true;
        }
      }
      return orig.apply(this, arguments);
    },
  }).dispatchEvent);

  // ---- 4. ad scripts' page-wide input listeners can't swallow your input ----
  const INPUT = new Set(['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress']);
  const isGlobal = (t) => t === W || t === document || t === document.documentElement || t === document.body;
  const NOOP = ({ preventDefault() {} }).preventDefault;
  function defused(ev) {
    return new _Proxy(ev, {
      get(t, p) {
        if (p === 'preventDefault' || p === 'stopPropagation' || p === 'stopImmediatePropagation') return NOOP;
        if (p === 'defaultPrevented' || p === 'cancelBubble') return false;
        if (p === 'returnValue') return true;
        const v = _Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, p, v) {
        if (p === 'returnValue' || p === 'cancelBubble') return true;
        return _Reflect.set(t, p, v, t);
      },
    });
  }
  const wrappers = new WeakMap();
  const captureOf = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));
  hook(EventTarget.prototype, 'addEventListener', (orig) => ({
    addEventListener(type, listener, opts) {
      try {
        if (active && listener && INPUT.has(type) && isGlobal(this) && calledByAd()) {
          const key = type + '|' + captureOf(opts);
          let m = wrappers.get(listener);
          if (!m) { m = new Map(); wrappers.set(listener, m); }
          let w = m.get(key);
          if (!w) {
            const L = listener;
            w = function (ev) {
              const e2 = active ? defused(ev) : ev;
              return typeof L === 'function' ? L.call(this, e2) : L.handleEvent && L.handleEvent(e2);
            };
            m.set(key, w);
          }
          return orig.call(this, type, w, opts);
        }
      } catch {}
      return orig.apply(this, arguments);
    },
  }).addEventListener);
  hook(EventTarget.prototype, 'removeEventListener', (orig) => ({
    removeEventListener(type, listener, opts) {
      try {
        const m = listener && wrappers.get(listener);
        const w = m && m.get(type + '|' + captureOf(opts));
        if (w) orig.call(this, type, w, opts);
      } catch {}
      return orig.apply(this, arguments);
    },
  }).removeEventListener);

  // ---- video helpers ----
  const MIN_AREA = 160 * 90;
  const videos = () => Array.from(document.getElementsByTagName('video'));
  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, W.innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, W.innerHeight) - Math.max(r.top, 0));
    return w * h;
  }
  function mainVideo() {
    let best = null;
    let ba = 0;
    for (const v of videos()) {
      const a = visibleArea(v);
      if (a > ba) { ba = a; best = v; }
    }
    return ba >= MIN_AREA ? best : null;
  }

  // ---- 3. invisible layers over the video become click-through ----
  const handled = new WeakSet();
  function transparent(cs) {
    if (parseFloat(cs.opacity) < 0.05) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
    const bg = cs.backgroundColor;
    if (bg === 'transparent') return true;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length >= 4 && parseFloat(parts[3]) === 0;
  }
  function hasContent(el) {
    if (el.querySelector('img,video,canvas,svg,iframe,button,input,select,textarea,picture,object,embed')) return true;
    return (el.textContent || '').trim().length > 0;
  }
  function isOverlay(el, v, vr) {
    if (!el || el.nodeType !== 1 || el === v || el.contains(v) || handled.has(el)) return false;
    if (/^(VIDEO|IFRAME|HTML|BODY|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return false;
    const r = el.getBoundingClientRect();
    const ix = Math.max(0, Math.min(r.right, vr.right) - Math.max(r.left, vr.left));
    const iy = Math.max(0, Math.min(r.bottom, vr.bottom) - Math.max(r.top, vr.top));
    if (ix * iy < 0.6 * vr.width * vr.height) return false;
    const cs = _getCS(el);
    if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none') return false;
    return transparent(cs) && !hasContent(el);
  }
  function makeClickThrough(el) {
    handled.add(el);
    try { el.style.setProperty('pointer-events', 'none', 'important'); } catch {}
    blocked('overlay');
  }
  function scanOverlays() {
    if (!active) return;
    for (const v of videos()) {
      const vr = v.getBoundingClientRect();
      if (vr.width * vr.height < MIN_AREA) continue;
      const pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
      for (const [fx, fy] of pts) {
        const x = vr.left + vr.width * fx;
        const y = vr.top + vr.height * fy;
        if (x < 0 || y < 0 || x > W.innerWidth || y > W.innerHeight) continue;
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === v || el.contains(v)) break;
          if (isOverlay(el, v, vr)) makeClickThrough(el);
        }
      }
    }
  }
  let scanTimer = null;
  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = _setTimeout(() => { scanTimer = null; try { scanOverlays(); } catch {} }, 120);
  };
  try {
    new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  } catch {}

  // Fallback: a click that still lands on an invisible layer is taken away from it
  // and turned into play/pause on the video.
  let gesture = null;
  function overlayVideoFor(el) {
    for (const v of videos()) {
      const vr = v.getBoundingClientRect();
      if (vr.width * vr.height >= MIN_AREA && isOverlay(el, v, vr)) return v;
    }
    return null;
  }
  _add.call(W, 'pointerdown', (e) => {
    if (!active || !e.isTrusted || e.button !== 0) return;
    const v = overlayVideoFor(e.target);
    if (!v) return;
    makeClickThrough(e.target);
    gesture = { video: v, until: _now() + 1500 };
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  for (const t of ['mousedown', 'pointerup', 'mouseup', 'click']) {
    _add.call(W, t, (e) => {
      if (!gesture || !e.isTrusted) return;
      if (_now() > gesture.until) { gesture = null; return; }
      e.stopImmediatePropagation();
      e.preventDefault();
      if (t === 'click') { const v = gesture.video; gesture = null; runLocal('toggle', v); }
    }, true);
  }

  // ---- 5. keyboard: the blocker owns the video keys ----
  const KEYS = { ' ': 'toggle', k: 'toggle', K: 'toggle', ArrowLeft: 'back', ArrowRight: 'fwd', ArrowUp: 'volup', ArrowDown: 'voldown', f: 'fs', F: 'fs', m: 'mute', M: 'mute' };
  const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
  const swallowed = new Set();

  function playerRoot(v) {
    const vr = v.getBoundingClientRect();
    let el = v;
    let best = v;
    while ((el = el.parentElement) && el !== document.body && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      if (r.width <= vr.width * 1.15 + 2 && r.height <= vr.height * 1.3 + 2) best = el;
      else break;
    }
    return best;
  }
  const looksFullscreen = () => W !== W.top && W.innerWidth >= screen.width - 1 && W.innerHeight >= screen.height - 1;
  function toggleFullscreen(v) {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (looksFullscreen()) { send({ kind: 'cmd', cmd: 'exitfs' }); return; }
    const root = playerRoot(v);
    root.requestFullscreen().catch(() => { v.requestFullscreen().catch(() => {}); });
  }
  function outerFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    let best = null;
    let ba = 0;
    for (const f of document.querySelectorAll('iframe')) {
      const a = visibleArea(f);
      if (a > ba) { ba = a; best = f; }
    }
    if (best) best.requestFullscreen().catch(() => {});
  }
  function runLocal(cmd, v) {
    try {
      switch (cmd) {
        case 'toggle':
          if (v.paused || v.ended) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
          break;
        case 'back': v.currentTime = Math.max(0, v.currentTime - 10); break;
        case 'fwd': v.currentTime = isFinite(v.duration) ? Math.min(v.duration, v.currentTime + 10) : v.currentTime + 10; break;
        case 'volup': v.muted = false; v.volume = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10); break;
        case 'voldown': v.volume = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10); break;
        case 'mute': v.muted = !v.muted; break;
        case 'fs': toggleFullscreen(v); break;
      }
    } catch {}
  }
  function runRemote(cmd) {
    if (cmd === 'exitfs') { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); return; }
    const v = mainVideo();
    if (v && cmd !== 'fs') runLocal(cmd, v);
  }

  _add.call(W, 'keydown', (e) => {
    if (!active || !e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
    const cmd = KEYS[e.key];
    if (!cmd || isEditable(e.target) || isEditable(document.activeElement)) return;
    const v = mainVideo();
    if (!v && !tabHasVideo) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    swallowed.add(e.code);
    if (e.repeat && (cmd === 'toggle' || cmd === 'fs' || cmd === 'mute')) return;
    if (v) runLocal(cmd, v);
    else if (cmd === 'fs') outerFullscreen();
    else send({ kind: 'cmd', cmd });
  }, true);
  for (const t of ['keypress', 'keyup']) {
    _add.call(W, t, (e) => {
      if (!e.isTrusted || !swallowed.has(e.code)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (t === 'keyup') swallowed.delete(e.code);
    }, true);
  }

  // ---- tell the extension where the video is (for routing keys across frames) ----
  let lastReported = -1;
  function reportVideo() {
    const v = mainVideo();
    const area = v ? Math.round(visibleArea(v) / 1000) * 1000 : 0;
    if (area !== lastReported) { lastReported = area; send({ kind: 'video', area }); }
  }
  _setInterval(() => {
    if (!active || !document.getElementsByTagName('video').length) return;
    try { reportVideo(); scanOverlays(); } catch {}
  }, 1000);
  _add.call(document, 'loadedmetadata', () => { try { reportVideo(); } catch {} }, true);

  // ---- top frame: note navigations you started yourself (so they're never "corrected") ----
  try {
    if (W === W.top && W.navigation) {
      _add.call(W.navigation, 'navigate', (e) => {
        if (e.userInitiated && e.destination) send({ kind: 'userNav', url: String(e.destination.url) });
      });
    }
  } catch {}
})();
