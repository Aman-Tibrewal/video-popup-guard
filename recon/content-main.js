// Popup Recon - in-page recorder (runs in the page's own JavaScript world, in every frame).
// It only OBSERVES: every hooked function still does exactly what it did before.
// Events are queued until content-bridge.js says this tab is being recorded;
// on any other tab it switches itself off.

(() => {
  const EVT = '__popup_recon_evt';
  const CTL = '__popup_recon_ctl';

  // Keep native references before the page can touch them.
  const _dispatch = EventTarget.prototype.dispatchEvent;
  const _addListener = EventTarget.prototype.addEventListener;
  const _fnToString = Function.prototype.toString;
  const _CustomEvent = window.CustomEvent;
  const _stringify = JSON.stringify;
  const _parse = JSON.parse;
  const _getCS = window.getComputedStyle;
  const _now = Date.now;

  let state = 'pending'; // pending | on | off
  const queue = [];
  const counts = Object.create(null);
  const CAPS = { 'listener.add': 300, input: 3000, 'focus.in': 300, media: 1000, snapshot: 80 };

  let isTop = false;
  try { isTop = window.top === window; } catch {}

  function emit(ev) {
    try { _dispatch.call(document, new _CustomEvent(EVT, { detail: _stringify(ev) })); } catch {}
  }

  function send(type, data) {
    if (state === 'off') return;
    counts[type] = (counts[type] || 0) + 1;
    if (CAPS[type] && counts[type] > CAPS[type]) return;
    const ev = { t: _now(), type, frame: String(location.href).slice(0, 300), top: isTop, ...data };
    if (state === 'pending') {
      if (queue.length < 1500) queue.push(ev);
      return;
    }
    emit(ev);
  }

  _addListener.call(document, CTL, (e) => {
    let msg;
    try { msg = _parse(e.detail); } catch { return; }
    if (msg.cmd === 'on') {
      state = 'on';
      queue.splice(0).forEach(emit);
      setTimeout(() => snapshot('recording-confirmed'), 0);
    } else if (msg.cmd === 'off') {
      state = 'off';
      queue.length = 0;
    } else if (msg.cmd === 'snapshot') {
      snapshot('manual');
    }
  });

  // ---------- helpers ----------

  function stack() {
    const old = Error.stackTraceLimit;
    Error.stackTraceLimit = 25;
    const s = new Error().stack || '';
    Error.stackTraceLimit = old;
    return s
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && !l.includes('chrome-extension://'))
      .slice(0, 8)
      .map((l) => l.slice(0, 250));
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return { el: el && el.nodeName ? String(el.nodeName) : String(el) };
    let s = el.tagName.toLowerCase();
    if (el.id && typeof el.id === 'string') s += '#' + el.id.slice(0, 40);
    if (el.classList && el.classList.length) s += '.' + Array.from(el.classList).slice(0, 4).join('.');
    const out = { el: s.slice(0, 160) };
    try {
      const r = el.getBoundingClientRect();
      out.rect = [r.left, r.top, r.width, r.height].map(Math.round);
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      out.cover = Math.round(((Math.min(r.width, vw) * Math.min(r.height, vh)) / (vw * vh)) * 100) / 100;
      const cs = _getCS(el);
      out.z = cs.zIndex;
      out.pos = cs.position;
      out.op = cs.opacity;
      out.pe = cs.pointerEvents;
      out.vis = cs.visibility;
      out.bg = cs.backgroundColor;
      if (el.tagName === 'IFRAME') out.src = String(el.src || el.getAttribute('src') || '').slice(0, 200);
      if (el.tagName === 'A') { out.href = String(el.href || '').slice(0, 200); out.target = el.target; }
    } catch {}
    return out;
  }

  function isEditable(el) {
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
  }

  // Replace a function while keeping it looking native, so the page behaves as it normally would.
  const nativeOf = new WeakMap();
  function hook(obj, name, makeWrapper) {
    try {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      const w = makeWrapper(orig);
      nativeOf.set(w, orig);
      try { Object.defineProperty(w, 'name', { value: orig.name }); } catch {}
      try { Object.defineProperty(w, 'length', { value: orig.length }); } catch {}
      const d = Object.getOwnPropertyDescriptor(obj, name);
      if (d && 'value' in d) Object.defineProperty(obj, name, { ...d, value: w });
      else obj[name] = w;
    } catch {}
  }
  hook(Function.prototype, 'toString', () =>
    ({ toString() {
      return _fnToString.call(nativeOf.get(this) || this);
    } }).toString
  );

  // ---------- pop-up producers ----------

  hook(window, 'open', (orig) =>
    ({ open(url, target, features) {
      const st = state === 'off' ? null : stack();
      const res = orig.apply(this, arguments);
      if (st) {
        send('window.open', {
          url: String(url == null ? '' : url).slice(0, 300),
          target: String(target == null ? '' : target),
          features: String(features == null ? '' : features).slice(0, 200),
          returnedNull: res == null,
          active: describe(document.activeElement),
          userActivation: navigator.userActivation ? navigator.userActivation.isActive : null,
          stack: st,
        });
      }
      return res;
    } }).open
  );

  hook(HTMLAnchorElement.prototype, 'click', (orig) =>
    ({ click() {
      if (state !== 'off') send('anchor.click', { href: String(this.href || '').slice(0, 300), target: this.target, inDom: this.isConnected, stack: stack() });
      return orig.apply(this, arguments);
    } }).click
  );

  hook(EventTarget.prototype, 'dispatchEvent', (orig) =>
    ({ dispatchEvent(ev) {
      if (state !== 'off' && ev && /^(click|mousedown|mouseup|pointerdown|pointerup)$/.test(ev.type) && this && this.nodeType === 1) {
        send('synthetic.dispatch', { ev: ev.type, on: describe(this), stack: stack() });
      }
      return orig.apply(this, arguments);
    } }).dispatchEvent
  );

  hook(HTMLFormElement.prototype, 'submit', (orig) =>
    ({ submit() {
      if (state !== 'off') send('form.submit', { action: String(this.action || '').slice(0, 300), target: this.target, stack: stack() });
      return orig.apply(this, arguments);
    } }).submit
  );

  // ---------- who listens to clicks / keys on the whole page ----------

  const WATCH = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress', 'blur', 'focus', 'visibilitychange', 'contextmenu', 'beforeunload']);
  hook(EventTarget.prototype, 'addEventListener', (orig) =>
    ({ addEventListener(type, listener, opts) {
      if (state !== 'off') {
        try {
          if (WATCH.has(type) && (this === window || this === document || this === document.documentElement || this === document.body)) {
            const on = this === window ? 'window' : this === document ? 'document' : this === document.body ? 'body' : 'html';
            send('listener.add', { on, ev: type, capture: opts === true || !!(opts && opts.capture), stack: stack().slice(0, 4) });
          }
        } catch {}
      }
      return orig.apply(this, arguments);
    } }).addEventListener
  );

  // ---------- your clicks and key presses ----------

  const pending = new WeakMap();
  function trackInput(type, build) {
    _addListener.call(window, type, (e) => {
      if (state === 'off') return;
      const rec = build(e);
      pending.set(e, rec);
      setTimeout(() => {
        rec.reachedPageEnd = !!rec._reached;
        rec.defaultPrevented = e.defaultPrevented;
        delete rec._reached;
        send('input', rec);
      }, 0);
    }, true);
    _addListener.call(window, type, (e) => {
      const r = pending.get(e);
      if (r) r._reached = true;
    }, false);
  }

  let lastAutoSnap = 0;
  trackInput('pointerdown', (e) => {
    const rec = { ev: 'pointerdown', trusted: e.isTrusted, x: Math.round(e.clientX), y: Math.round(e.clientY), target: describe(e.target), active: describe(document.activeElement) };
    try { rec.under = document.elementsFromPoint(e.clientX, e.clientY).slice(0, 6).map(describe); } catch {}
    if (e.isTrusted && _now() - lastAutoSnap > 5000) {
      lastAutoSnap = _now();
      setTimeout(() => snapshot('after-click'), 50);
    }
    return rec;
  });
  trackInput('click', (e) => ({ ev: 'click', trusted: e.isTrusted, target: describe(e.target) }));
  trackInput('keydown', (e) => ({
    ev: 'keydown',
    trusted: e.isTrusted,
    key: isEditable(e.target) ? '[typed]' : e.key,
    target: describe(e.target),
    active: describe(document.activeElement),
    pageHasFocus: document.hasFocus(),
  }));

  // ---------- focus ----------

  _addListener.call(window, 'blur', (e) => { if (e.target === window) send('focus.window', { state: 'lost', active: describe(document.activeElement) }); }, true);
  _addListener.call(window, 'focus', (e) => { if (e.target === window) send('focus.window', { state: 'gained' }); }, true);
  _addListener.call(document, 'focusin', (e) => send('focus.in', { el: describe(e.target) }), true);
  _addListener.call(document, 'visibilitychange', () => send('visibility', { state: document.visibilityState }), true);

  // ---------- video ----------

  ['play', 'pause', 'seeking', 'ended', 'waiting', 'loadedmetadata', 'error'].forEach((t) =>
    _addListener.call(document, t, (e) => {
      const v = e.target;
      if (!v || !/^(VIDEO|AUDIO)$/.test(v.tagName || '')) return;
      send('media', { ev: t, el: describe(v), time: Math.round(v.currentTime || 0), dur: Math.round(v.duration) || null, paused: v.paused, src: String(v.currentSrc || v.src || '').slice(0, 150), stack: t === 'pause' || t === 'play' ? stack().slice(0, 4) : undefined });
    }, true)
  );
  _addListener.call(document, 'fullscreenchange', () => send('fullscreen', { el: describe(document.fullscreenElement) }), true);
  _addListener.call(document, 'fullscreenerror', (e) => send('fullscreen.error', { el: describe(e.target) }), true);

  // ---------- this frame navigating away ----------

  try {
    if (window.navigation) {
      _addListener.call(window.navigation, 'navigate', (e) => {
        send('navigate', { url: String(e.destination && e.destination.url || '').slice(0, 300), navType: e.navigationType, userInitiated: e.userInitiated, stack: stack() });
      });
    }
  } catch {}
  _addListener.call(window, 'pagehide', () => send('pagehide', {}), true);

  // ---------- page snapshot: players, frames, overlays, scripts ----------

  function snapshot(reason) {
    if (state !== 'on') return;
    try {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const videos = Array.from(document.querySelectorAll('video')).slice(0, 10).map((v) => ({
        ...describe(v), src: String(v.currentSrc || v.src || '').slice(0, 150), paused: v.paused, time: Math.round(v.currentTime || 0), dur: Math.round(v.duration) || null, controls: v.controls,
      }));
      const iframes = Array.from(document.querySelectorAll('iframe')).slice(0, 30).map((f) => ({
        ...describe(f), sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), allowFullscreen: f.hasAttribute('allowfullscreen'),
      }));

      const points = [[vw / 2, vh / 2]];
      for (const el of [...document.querySelectorAll('video'), ...document.querySelectorAll('iframe')].slice(0, 6)) {
        const r = el.getBoundingClientRect();
        if (r.width > 50 && r.height > 50) points.push([r.left + r.width / 2, r.top + r.height / 2]);
      }
      const underPoints = points.map(([x, y]) => ({ x: Math.round(x), y: Math.round(y), stack: document.elementsFromPoint(x, y).slice(0, 6).map(describe) }));

      const coverers = [];
      const all = document.body ? document.body.getElementsByTagName('*') : [];
      for (let i = 0; i < all.length && i < 8000 && coverers.length < 25; i++) {
        const el = all[i];
        const r = el.getBoundingClientRect();
        if (r.width * r.height < vw * vh * 0.2) continue;
        const cs = _getCS(el);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none') coverers.push(describe(el));
      }

      const hostCounts = {};
      for (const r of performance.getEntriesByType('resource')) {
        let h = '';
        try { h = new URL(r.name).hostname; } catch {}
        const k = h + ' [' + r.initiatorType + ']';
        hostCounts[k] = (hostCounts[k] || 0) + 1;
      }
      const resourceHosts = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 60);

      const scripts = Array.from(document.scripts).slice(0, 80).map((s) => {
        if (!s.src) return 'inline(' + (s.text || '').length + ' chars)';
        try { const u = new URL(s.src); return (u.hostname + u.pathname).slice(0, 150); } catch { return String(s.src).slice(0, 150); }
      });

      send('snapshot', {
        reason, vw, vh, title: String(document.title || '').slice(0, 120), videos, iframes, underPoints, coverers, resourceHosts, scripts,
        handlers: {
          windowOnclick: typeof window.onclick === 'function',
          documentOnclick: typeof document.onclick === 'function',
          bodyOnclick: !!(document.body && typeof document.body.onclick === 'function'),
          windowOnkeydown: typeof window.onkeydown === 'function',
          documentOnkeydown: typeof document.onkeydown === 'function',
        },
      });
    } catch (err) {
      send('snapshot.error', { reason, err: String(err).slice(0, 200) });
    }
  }

  _addListener.call(window, 'load', () => setTimeout(() => snapshot('load+3s'), 3000));
  send('frame.start', { referrer: String(document.referrer || '').slice(0, 300), readyState: document.readyState });
})();
