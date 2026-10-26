// First-party analytics collector + aggregator. Node 18+, no dependencies, works as a plain http handler or Express middleware.
//   import { createAnalytics } from './collector.mjs';
//   const analytics = createAnalytics({ file: 'data/analytics.jsonl', adminToken: process.env.ADMIN_TOKEN, events: [...], funnel: [...] });
//   http:    if (await analytics.handle(req, res)) return;        express: app.use(analytics.middleware)
// Stores anonymous rows only: random visitor/session ids, path, referrer origin, screen width, language, event name + slug + number.
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DAY = 864e5;
export const DEFAULT_EVENTS = ['ui_click', 'client_error', 'unhandled_rejection',
  'perf_ttfb', 'perf_fcp', 'perf_lcp', 'perf_cls', 'perf_inp'];
const LABEL = /^[\w .:/#-]*$/, ID = /^[a-z0-9-]{8,40}$/i;
const AI = /chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|claude\.ai|copilot\.microsoft\.com|deepseek\.com|you\.com|phind\.com/;
const SEARCH = /google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage/;
const SOCIAL = /facebook|instagram|t\.co|twitter|x\.com|reddit|tiktok|youtube|discord|linkedin|pinterest|threads|bsky|mastodon/;
const BOT = /bot|crawl|spider|slurp|preview|headless|python-requests|curl|wget|gptbot|claudebot|perplexity/i;

export const channelOf = (ref, utm = '') => {
  if (utm) return 'Campaign';
  if (!ref) return 'Direct';
  const host = (ref || '').replace(/^https?:\/\//, '').toLowerCase();
  if (AI.test(host)) return 'AI assistants';
  if (SEARCH.test(host)) return 'Organic search';
  if (SOCIAL.test(host)) return 'Social';
  return 'Referral';
};
export const deviceOf = (w) => (w < 640 ? 'Mobile' : w < 960 ? 'Tablet' : 'Desktop');
export const isEngaged = (s) => s.durationMs >= 10_000 || s.views >= 2;
const pct = (n, d) => (d ? n / d : null);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const tally = (items) => Object.entries(items.reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {})).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
export const percentile = (values, p) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const VITALS_GOOD = { lcp: 2500, inp: 200, cls: 100 }; // cls is stored x1000

/** Pure function: rows in, dashboard JSON out. Unit-testable without a server. */
export function summarize(rows, { days = 30, now = Date.now(), funnel = [] } = {}) {
  const from = now - days * DAY;
  const inRange = rows.filter((r) => r.t >= from && r.t <= now);
  const views = inRange.filter((r) => r.type === 'pageview');
  const events = inRange.filter((r) => r.type === 'event');
  const leaves = new Map(inRange.filter((r) => r.type === 'leave').map((r) => [r.sid, r.durationMs]));

  const sessions = new Map();
  for (const v of views) {
    const s = sessions.get(v.sid) || { sid: v.sid, vid: v.vid, views: 0, landing: v.path, ref: v.ref, utm: v.utm, src: v.src || '', w: v.w, lang: v.lang, t: v.t, durationMs: 0 };
    s.views++; if (v.ref && !s.ref) s.ref = v.ref; if (v.utm && !s.utm) { s.utm = v.utm; s.src = v.src || ''; } sessions.set(v.sid, s);
  }
  for (const s of sessions.values()) s.durationMs = leaves.get(s.sid) || 0;
  const all = [...sessions.values()];
  const engaged = all.filter(isEngaged);
  const firstSeen = new Map(); // visitor -> first pageview across ALL history
  for (const r of rows) if (r.type === 'pageview' && (!firstSeen.has(r.vid) || r.t < firstSeen.get(r.vid))) firstSeen.set(r.vid, r.t);
  const visitors = new Set(views.map((v) => v.vid));
  const newVisitors = [...visitors].filter((v) => firstSeen.get(v) >= from).length;

  const series = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = dayKey(now - d * DAY), dv = views.filter((v) => dayKey(v.t) === day);
    series.push({ day, pageviews: dv.length, visitors: new Set(dv.map((v) => v.vid)).size, sessions: new Set(dv.map((v) => v.sid)).size });
  }

  const sessionTable = (key) => {
    const g = {}; for (const s of all) (g[key(s)] ||= []).push(s);
    return Object.entries(g).map(([label, list]) => ({ label, sessions: list.length, avgMs: Math.round(list.reduce((a, s) => a + s.durationMs, 0) / list.length),
      engagedRate: pct(list.filter(isEngaged).length, list.length), bounceRate: pct(list.filter((s) => s.views === 1 && !isEngaged(s)).length, list.length) }))
      .sort((a, b) => b.sessions - a.sessions);
  };
  const host = (ref) => ref.replace(/^https?:\/\//, '');

  const named = events.filter((e) => !e.name.startsWith('perf_'));
  const featureRows = [...new Set(named.map((e) => `${e.name} ${e.label}`))].map((k) => {
    const list = named.filter((e) => `${e.name} ${e.label}` === k), sess = new Set(list.map((e) => e.sid)).size;
    return { name: list[0].name, label: list[0].label, events: list.length, sessions: sess, share: pct(sess, all.length) };
  }).sort((a, b) => b.events - a.events);

  const vitals = {};
  for (const e of events) if (e.name.startsWith('perf_') && e.value !== null) ((vitals[e.label || '/'] ||= {})[e.name] ||= []).push(e.value);
  const vitalsRows = Object.entries(vitals).map(([path, m]) => {
    const lcp = percentile(m.perf_lcp || [], 0.75), inp = percentile(m.perf_inp || [], 0.75), cls = percentile(m.perf_cls || [], 0.75);
    const checks = [[lcp, VITALS_GOOD.lcp], [inp, VITALS_GOOD.inp], [cls, VITALS_GOOD.cls]].filter(([v]) => v !== null);
    return { path, n: Math.max(...Object.values(m).map((a) => a.length)), lcpMs: lcp, inpMs: inp, clsX1000: cls,
      verdict: !checks.length ? 'No data' : checks.every(([v, g]) => v <= g) ? 'Good' : 'Needs work' };
  }).sort((a, b) => b.n - a.n);
  const perf = ['perf_ttfb', 'perf_fcp', 'perf_lcp', 'perf_inp', 'perf_cls'].map((metric) => {
    const v = events.filter((e) => e.name === metric && e.value !== null).map((e) => e.value);
    return { metric, n: v.length, p50: percentile(v, 0.5), p75: percentile(v, 0.75), p95: percentile(v, 0.95) };
  });

  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); // weekday x hour, UTC
  for (const v of views) { const d = new Date(v.t); heat[d.getUTCDay()][d.getUTCHours()]++; }

  const WEEK = 7 * DAY, retention = []; // weekly cohorts by first-seen week, last 8 weeks
  for (let w = 7; w >= 0; w--) {
    const start = now - (w + 1) * WEEK, end = now - w * WEEK;
    const cohort = [...firstSeen].filter(([, t]) => t >= start && t < end).map(([v]) => v);
    const back = [];
    for (let k = 0; k <= w; k++) {
      const a = start + k * WEEK, b = a + WEEK;
      const active = new Set(rows.filter((r) => r.type === 'pageview' && r.t >= a && r.t < b).map((r) => r.vid));
      back.push(pct(cohort.filter((v) => active.has(v)).length, cohort.length));
    }
    retention.push({ week: dayKey(start), size: cohort.length, retained: back });
  }
  const active = (ms) => new Set(rows.filter((r) => r.type === 'pageview' && r.t >= now - ms).map((r) => r.vid)).size;
  const dau = active(DAY), mau = active(30 * DAY);

  const steps = [{ label: 'Visitors', n: visitors.size }, { label: 'Engaged sessions', n: engaged.length }].concat(funnel.map((f) => ({
    label: f.label,
    n: f.path ? new Set(views.filter((v) => v.path === f.path).map((v) => v.sid)).size
      : new Set(events.filter((e) => e.name === f.event && (!f.eventLabel || e.label === f.eventLabel)).map((e) => e.sid)).size })));
  const errorEvents = events.filter((e) => e.name === 'client_error' || e.name === 'unhandled_rejection');

  return {
    generatedAt: now, days,
    totals: { pageviews: views.length, visitors: visitors.size, newVisitors, returningVisitors: visitors.size - newVisitors, sessions: all.length,
      pagesPerSession: all.length ? views.length / all.length : null, engagedRate: pct(engaged.length, all.length),
      bounceRate: pct(all.filter((s) => s.views === 1 && !isEngaged(s)).length, all.length),
      avgEngagementMs: all.length ? Math.round(all.reduce((a, s) => a + s.durationMs, 0) / all.length) : null,
      medianEngagementMs: percentile(all.map((s) => s.durationMs), 0.5), events: events.length, errors: errorEvents.length },
    series,
    channels: tally(all.map((s) => channelOf(s.ref, s.utm))),
    channelEngagement: sessionTable((s) => channelOf(s.ref, s.utm)),
    referrers: tally(all.filter((s) => s.ref).map((s) => host(s.ref))).slice(0, 15),
    campaigns: tally(all.filter((s) => s.utm).map((s) => s.utm)).slice(0, 15),
    links: tally(all.filter((s) => s.utm || s.src).map((s) => `${s.utm || '(none)'} · ${s.src || '(none)'}`)).slice(0, 25), // campaign · placement, from the referral link generator
    darkSocial: all.filter((s) => !s.ref && !s.utm && s.landing !== '/').length,
    pages: tally(views.map((v) => v.path)).slice(0, 25),
    landings: sessionTable((s) => s.landing).slice(0, 15),
    devices: sessionTable((s) => deviceOf(s.w)),
    languages: tally(all.map((s) => (s.lang || 'unknown').toLowerCase())).slice(0, 10),
    heat, retention, stickiness: { dau, mau, ratio: pct(dau, mau) },
    depth: tally(all.map((s) => (s.views >= 5 ? '5+ pages' : `${s.views} page${s.views > 1 ? 's' : ''}`))).sort((a, b) => a.label.localeCompare(b.label)),
    eventNames: tally(named.map((e) => e.name)), features: featureRows.slice(0, 40),
    funnel: steps, vitals: vitalsRows.slice(0, 25), performance: perf,
    errorsByMessage: tally(errorEvents.map((e) => e.label || '(no message)')).slice(0, 10),
  };
}

export function createAnalytics({ file = 'data/analytics.jsonl', adminToken = process.env.ADMIN_TOKEN, events = [], funnel = [], retentionDays = 400,
  perMinuteLimit = 120, trackPath = '/api/track', summaryPath = '/api/admin/summary',
  observationsFile = file.replace(/\.jsonl$/, '') + '-observations.jsonl', catalogFile = fileURLToPath(new URL('./metrics-catalog.json', import.meta.url)) } = {}) {
  const allowed = new Set([...DEFAULT_EVENTS, ...events]);
  let rows = [], loaded;
  const server = { minutes: new Map(), missing: new Map(), bots: new Map(), human: 0, botHits: 0 };
  const hits = new Map(); // ip -> [windowStart, count]
  const load = () => (loaded ||= readFile(file, 'utf8').then((text) => {
    const cutoff = Date.now() - retentionDays * DAY;
    rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.t >= cutoff);
  }).catch((e) => { if (e.code !== 'ENOENT') throw e; }));
  const persist = async (row) => { rows.push(row); await mkdir(dirname(file), { recursive: true }); await appendFile(file, JSON.stringify(row) + '\n'); };
  const limited = (ip) => { const n = Date.now(), h = hits.get(ip); if (!h || n - h[0] > 60_000) { hits.set(ip, [n, 1]); return false; } return ++h[1] > perMinuteLimit; };

  /** Validated by hand: unknown keys dropped, strings capped, ids and event names allowlisted. */
  const clean = (b) => {
    if (!b || typeof b !== 'object' || !ID.test(b.vid || '') || !ID.test(b.sid || '')) return null;
    const base = { t: Date.now(), type: b.type, vid: b.vid, sid: b.sid };
    if (b.type === 'pageview') return { ...base, path: String(b.path || '/').slice(0, 120), ref: String(b.ref || '').slice(0, 300), utm: String(b.utm || '').slice(0, 80), src: String(b.src || '').slice(0, 40),
      w: Math.max(0, Math.min(1e4, Math.round(+b.w) || 0)), lang: String(b.lang || '').slice(0, 20), loadMs: Number.isFinite(b.loadMs) ? Math.max(0, Math.min(12e4, b.loadMs)) : null };
    if (b.type === 'leave') return { ...base, durationMs: Math.max(0, Math.min(DAY, Math.round(+b.durationMs) || 0)) };
    if (b.type === 'event' && allowed.has(b.name) && LABEL.test(b.label ?? '')) return { ...base, name: b.name, label: String(b.label ?? '').slice(0, 60),
      value: Number.isFinite(b.value) ? Math.max(0, Math.min(1e7, Math.round(b.value))) : null };
    return null;
  };

  const readBody = (req, max = 4096) => new Promise((ok, no) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > max) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => ok(s)); req.on('error', no); });
  const isAdmin = (h) => { if (!adminToken || !h?.startsWith('Bearer ')) return false; const a = Buffer.from(h.slice(7)), b = Buffer.from(adminToken); return a.length === b.length && timingSafeEqual(a, b); };
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  /** Server-side facts: request volume, 5xx rate, latency, 404 referrers, bot share. Call once per request, before routing. */
  const observe = (req, res) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6, minute = Math.floor(Date.now() / 6e4), ua = req.headers['user-agent'] || '';
      const m = server.minutes.get(minute) || { n: 0, e5: 0, lat: [] };
      m.n++; if (res.statusCode >= 500) m.e5++; if (m.lat.length < 500) m.lat.push(ms); server.minutes.set(minute, m);
      for (const k of server.minutes.keys()) if (k < minute - 180) server.minutes.delete(k);
      if (BOT.test(ua)) { server.botHits++; const name = (ua.match(BOT)[0] || 'bot').toLowerCase(); server.bots.set(name, (server.bots.get(name) || 0) + 1); }
      else if ((req.headers.accept || '').includes('text/html')) server.human++;
      if (res.statusCode === 404 && server.missing.size < 200) {
        const k = `${(req.url || '').split('?')[0].slice(0, 120)} <- ${(req.headers.referer || '').slice(0, 120)}`;
        server.missing.set(k, (server.missing.get(k) || 0) + 1);
      }
    });
  };
  const serverFacts = (sessionsInHour) => {
    const minutes = [...server.minutes.values()], lat = minutes.flatMap((m) => m.lat);
    const n = minutes.reduce((a, m) => a + m.n, 0), e5 = minutes.reduce((a, m) => a + m.e5, 0);
    return { requests: n, errorRate5xx: pct(e5, n), p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), humanPageLoads: server.human, botHits: server.botHits,
      botShare: pct(server.botHits, server.botHits + server.human),
      crawlers: [...server.bots].map(([label, c]) => ({ label, n: c })).sort((a, b) => b.n - a.n).slice(0, 10),
      missing: [...server.missing].map(([k, c]) => ({ path: k.split(' <- ')[0], referrer: k.split(' <- ')[1] || '(none)', hits: c })).sort((a, b) => b.hits - a.hits).slice(0, 20),
      trackingGap: server.human ? Math.max(0, 1 - sessionsInHour / server.human) : null };
  };


  // ---- The 190-metric catalogue: what is measured live, what was imported, what still needs a source ----
  let catalog = null, observations = [], obsLoaded;
  const UNITS = new Set(['count', 'percent', 'USD', 'seconds', 'ms', 'score', 'ratio', 'bytes', 'days']);
  const loadCatalog = () => (catalog ||= readFile(catalogFile, 'utf8').then((t) => JSON.parse(t)));
  const loadObservations = () => (obsLoaded ||= readFile(observationsFile, 'utf8').then((t) => { observations = t.split('\n').filter(Boolean).map((l) => JSON.parse(l)); }).catch((e) => { if (e.code !== 'ENOENT') throw e; }));
  const p75 = (s, name) => s.performance.find((p) => p.metric === name)?.p75 ?? null;
  const ratio = (n, d) => (d ? n / d : null);
  const times = (v, k) => (v === null || v === undefined ? null : v * k);
  /** Catalogue id -> [value, unit] from the first-party summary. Only metrics this beacon and server truly measure appear here. */
  const liveValues = (s) => {
    const rated = s.vitals.filter((v) => v.verdict !== 'No data');
    const live = {
      sessions: [s.totals.sessions, 'count'], 'users-and-new-users': [s.totals.visitors, 'count'],
      'new-versus-returning-visitors': [times(ratio(s.totals.newVisitors, s.totals.visitors), 100), 'percent'],
      'sessions-by-channel-group': [s.channels.length, 'count'], 'referring-sites': [s.referrers.length, 'count'], 'dark-social-proxy': [s.darkSocial, 'count'],
      'traffic-from-ai-assistants': [s.channels.find((c) => c.label === 'AI assistants')?.n ?? 0, 'count'],
      'engagement-rate': [times(s.totals.engagedRate, 100), 'percent'], 'bounce-rate-ga4': [times(s.totals.bounceRate, 100), 'percent'],
      'average-engagement-time': [times(s.totals.avgEngagementMs, 0.001), 'seconds'], 'pages-per-session': [s.totals.pagesPerSession, 'ratio'],
      'micro-conversions': [s.totals.events, 'count'], 'active-users-and-stickiness': [times(s.stickiness.ratio, 100), 'percent'],
      'largest-contentful-paint-lcp': [p75(s, 'perf_lcp'), 'ms'], 'interaction-to-next-paint-inp': [p75(s, 'perf_inp'), 'ms'],
      'cumulative-layout-shift-cls': [times(p75(s, 'perf_cls'), 0.001), 'score'], 'time-to-first-byte-ttfb': [p75(s, 'perf_ttfb'), 'ms'], 'first-contentful-paint-fcp': [p75(s, 'perf_fcp'), 'ms'],
      'share-of-urls-passing-core-web-vitals': [rated.length ? rated.filter((v) => v.verdict === 'Good').length / rated.length * 100 : null, 'percent'],
      'javascript-errors-per-1-000-sessions': [s.totals.sessions ? s.totals.errors / s.totals.sessions * 1000 : null, 'ratio'],
      'funnel-conversion-by-step': [s.funnel.length > 2 && s.funnel[0].n ? s.funnel[s.funnel.length - 1].n / s.funnel[0].n * 100 : null, 'percent'],
    };
    if (s.server) Object.assign(live, {
      'server-error-rate-5xx': [times(s.server.errorRate5xx, 100), 'percent'], 'server-latency-at-p95': [s.server.p95, 'ms'],
      'bot-and-spam-traffic-share': [times(s.server.botShare, 100), 'percent'], 'crawl-stats': [s.server.crawlers.reduce((a, c) => a + c.n, 0), 'count'],
      'broken-links-and-404-hits': [s.server.missing.reduce((a, m) => a + m.hits, 0), 'count'], 'top-referrers-to-404-pages': [s.server.missing.filter((m) => m.referrer !== '(none)').length, 'count'],
      'tracking-health': [times(s.server.trackingGap, 100), 'percent'], 'ad-blocker-rate': [times(s.server.trackingGap, 100), 'percent'],
      'share-of-sessions-with-no-measurement': [times(s.server.trackingGap, 100), 'percent'],
    });
    return live;
  };
  /** Newest observation per metric+segment overlapping the window. "All" is the overall value; other segments are listed, never summed. */
  const catalogReport = async (days) => {
    const [list] = await Promise.all([loadCatalog(), loadObservations(), load()]);
    const now = Date.now(), from = now - days * DAY, summary = summarize(rows, { days, funnel });
    summary.server = serverFacts(new Set(rows.filter((r) => r.type === 'pageview' && r.t > now - 36e5).map((r) => r.sid)).size);
    const live = liveValues(summary), byKey = new Map();
    for (const o of observations) byKey.set(`${o.metric_id}|${o.period_start}|${o.period_end}|${o.segment}`, o); // re-import replaces
    const current = [...byKey.values()].filter((o) => Date.parse(o.period_end) >= from && Date.parse(o.period_start) <= now);
    return { generatedAt: now, days, units: [...UNITS], metrics: list.map((m) => {
      const l = live[m.id], obs = current.filter((o) => o.metric_id === m.id);
      const history = [...byKey.values()].filter((o) => o.metric_id === m.id).sort((a, b) => b.period_end.localeCompare(a.period_end)).slice(0, 12);
      const all = obs.find((o) => o.segment === 'All'), pick = all || obs[0];
      const base = { id: m.id, family: m.family, name: m.name, tier: m.tier, description: m.description, measure: m.measure, action: m.action, firstParty: m.first_party, history };
      if (l && l[0] !== null) return { ...base, status: 'measured', value: l[0], unit: l[1], source: 'First-party beacon and server', segments: [] };
      if (pick) return { ...base, status: 'imported', value: all ? all.value : null, unit: pick.unit, source: pick.source, period: [pick.period_start, pick.period_end], segments: obs.filter((o) => o.segment !== 'All').map((o) => ({ name: o.segment, value: o.value })) };
      return { ...base, status: l ? 'no-data' : 'needs-source', value: null, unit: null, source: null, segments: [] };
    }) };
  };
  const importObservations = async (body) => {
    const list = await loadCatalog(), ids = new Set(list.map((m) => m.id)), items = body && body.observations;
    if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error('Send between 1 and 200 observations.');
    const seen = new Set(), out = [], today = new Date().toISOString().slice(0, 10), date = /^\d{4}-\d{2}-\d{2}$/, text = /^[a-zA-Z0-9 ._/-]{1,80}$/;
    for (const o of items) {
      const segment = o.segment ?? 'All', unit = o.unit ?? 'count', key = `${o.metric_id}|${o.period_start}|${o.period_end}|${segment}`;
      if (!ids.has(o.metric_id)) throw new Error(`Unknown metric: ${String(o.metric_id).slice(0, 60)}`);
      if (!date.test(o.period_start) || !date.test(o.period_end) || o.period_end < o.period_start || o.period_end > today) throw new Error(`Bad dates for ${o.metric_id}. Use YYYY-MM-DD, end not in the future.`);
      if (typeof o.value !== 'number' || !Number.isFinite(o.value)) throw new Error(`Value for ${o.metric_id} must be a finite number.`);
      if (!UNITS.has(unit)) throw new Error(`Unit must be one of ${[...UNITS].join(', ')}.`);
      if (!text.test(o.source || '') || !text.test(segment)) throw new Error('Source and segment: 1-80 letters, numbers, spaces and . _ / -');
      if (seen.has(key)) throw new Error(`Duplicate entry for ${o.metric_id} in one request.`);
      seen.add(key); out.push({ metric_id: o.metric_id, period_start: o.period_start, period_end: o.period_end, segment, value: o.value, unit, source: o.source });
    }
    await loadObservations(); await mkdir(dirname(observationsFile), { recursive: true });
    await appendFile(observationsFile, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
    observations.push(...out);
    return out.length;
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === trackPath) {
      await load();
      if (limited(req.socket?.remoteAddress || '')) { res.writeHead(429).end(); return true; }
      try { const row = clean(JSON.parse(await readBody(req))); if (row) await persist(row); } catch { /* malformed beacon: ignore */ }
      res.writeHead(204).end(); return true;
    }
    if (req.method === 'GET' && url.pathname === summaryPath) {
      if (!adminToken) { json(res, 503, { error: 'Admin access is not configured. Set ADMIN_TOKEN.' }); return true; }
      if (!isAdmin(req.headers.authorization)) { json(res, 401, { error: 'Wrong admin token.' }); return true; }
      await load();
      const s = summarize(rows, { days: 30, funnel });
      s.server = serverFacts(new Set(rows.filter((r) => r.type === 'pageview' && r.t > Date.now() - 36e5).map((r) => r.sid)).size);
      json(res, 200, s); return true;
    }
    if (url.pathname === '/api/admin/metrics' || url.pathname === '/api/admin/metrics/import') {
      if (!adminToken) { json(res, 503, { error: 'Admin access is not configured. Set ADMIN_TOKEN.' }); return true; }
      if (!isAdmin(req.headers.authorization)) { json(res, 401, { error: 'Wrong admin token.' }); return true; }
      try {
        if (req.method === 'GET' && url.pathname === '/api/admin/metrics') json(res, 200, await catalogReport(30));
        else if (req.method === 'POST' && url.pathname === '/api/admin/metrics/import') json(res, 200, { imported: await importObservations(JSON.parse(await readBody(req, 60_000))) });
        else json(res, 405, { error: 'Method not allowed.' });
      } catch (e) { json(res, 400, { error: String(e.message || 'Bad request').slice(0, 200) }); }
      return true;
    }
    return false;
  }
  const middleware = (req, res, next) => { observe(req, res); handle(req, res).then((done) => done || next()).catch(next); };
  return { handle, middleware, observe, load, rows: () => rows, summarize: (o) => summarize(rows, { funnel, ...o }) };
}
