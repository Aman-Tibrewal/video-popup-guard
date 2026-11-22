// Dead player domains → working domain.
// Shared by background.js (builds browser redirect rules) and options.js (validation).
//
// Stored in chrome.storage.local as:
//   redirects: { enabled: true, mappings: [{ id, target: 'lulustream.com', sources: ['luluvido.com', 'luluvdo.com'], enabled: true }] }

const DEFAULT_REDIRECTS = {
  enabled: true,
  mappings: [{ id: 'lulu', target: 'lulustream.com', sources: ['luluvido.com', 'luluvdo.com'], enabled: true }],
};

// Turns "https://www.Example.com/e/abc" into "example.com".
// Returns '' for empty input and null for something that isn't a domain.
function normDomain(input, stripWww) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (stripWww) s = s.replace(/^www\./, '');
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(s) ? s : null;
}

// Problems per mapping id: missing pieces, a domain used twice, or redirects that would loop.
function redirectProblems(cfg) {
  const errs = {};
  const owner = new Map();
  const bare = (d) => String(d || '').replace(/^www\./, '');
  const targets = new Set((cfg.mappings || []).filter((m) => m.enabled && m.target).map((m) => bare(m.target)));
  for (const m of cfg.mappings || []) {
    const e = [];
    if (!m.target) e.push('Add the working domain these should go to.');
    if (!(m.sources || []).length) e.push('Add at least one domain to redirect.');
    for (const s of m.sources || []) {
      if (m.target && s === bare(m.target)) e.push(`${s} can't redirect to itself.`);
      else if (m.enabled && targets.has(s)) e.push(`${s} is the destination of another redirect, so this would loop.`);
      if (owner.has(s)) e.push(`${s} is already in another redirect.`);
      else owner.set(s, m.id);
    }
    errs[m.id] = e;
  }
  return errs;
}

// Browser redirect rules (declarativeNetRequest) for every enabled, valid mapping.
// The redirect happens before the dead domain is even looked up, keeping the
// same path, so /e/VIDEO_ID on the dead domain loads /e/VIDEO_ID on the working one.
function buildRedirectRules(cfg) {
  if (!cfg || !cfg.enabled) return [];
  const errs = redirectProblems(cfg);
  const used = new Set();
  const rules = [];
  for (const m of cfg.mappings || []) {
    if (!m.enabled || !m.target || (errs[m.id] || []).length) continue;
    const sources = (m.sources || []).filter((s) => !used.has(s));
    sources.forEach((s) => used.add(s));
    if (!sources.length) continue;
    rules.push({
      id: rules.length + 1,
      priority: 1,
      action: { type: 'redirect', redirect: { transform: { host: m.target } } },
      condition: { requestDomains: sources, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }
  return rules;
}
