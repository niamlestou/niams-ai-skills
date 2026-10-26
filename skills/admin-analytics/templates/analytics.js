/*! First-party analytics beacon. Cookieless: random ids in storage, no IP, no fingerprint, no copied text or form input.
 *  Honors Do Not Track and Global Privacy Control (sends nothing). Skips /admin pages.
 *  Include on every page:  <script src="/analytics.js" defer data-endpoint="/api/track"></script>
 *  Custom event:           window.track('signup_click', 'hero')     or   <button data-track="hero-cta">
 */
(() => {
  const script = document.currentScript;
  const ENDPOINT = (script && script.dataset.endpoint) || '/api/track';
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  if (/^\/admin/.test(location.pathname)) return;

  const store = (area, key) => {
    try { const s = window[area]; return s.getItem(key) || (s.setItem(key, crypto.randomUUID()), s.getItem(key)); } catch { return crypto.randomUUID(); }
  };
  const vid = store('localStorage', 'fp_vid'), sid = store('sessionStorage', 'fp_sid');
  const send = (body) => {
    const data = JSON.stringify({ vid, sid, ...body });
    if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([data], { type: 'text/plain' })))) fetch(ENDPOINT, { method: 'POST', body: data, keepalive: true }).catch(() => {});
  };
  const clean = (s) => String(s ?? '').replace(/[^\w .:/#-]/g, '').slice(0, 60);

  let sent = 0;
  window.track = (name, label = '', value = null) => {
    if (sent++ >= 120) return; // per page load
    send({ type: 'event', name, label: clean(label), value: Number.isFinite(value) ? Math.max(0, Math.min(1e7, Math.round(value))) : null });
  };

  const refOrigin = () => { try { return document.referrer ? new URL(document.referrer).origin : ''; } catch { return ''; } };
  const params = new URLSearchParams(location.search);
  const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  const utm = slug(params.get('utm_campaign') || params.get('utm_source')), src = slug(params.get('utm_source')); // campaign label + placement (where the link lives)
  const external = refOrigin() && refOrigin() !== location.origin ? refOrigin() : '';
  const ref = external;

  const started = performance.now();
  let first = true, last = '';
  const pageview = () => {
    const path = (location.pathname || '/').slice(0, 120);
    if (path === last) return;
    last = path;
    const nav = performance.getEntriesByType('navigation')[0];
    send({ type: 'pageview', path, ref: first ? ref : '', utm: first ? utm : '', src: first ? src : '', w: Math.round(innerWidth), lang: navigator.language.slice(0, 20),
      loadMs: first && nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null });
    first = false;
  };
  const afterLoad = () => document.readyState === 'complete' ? pageview() : addEventListener('load', () => setTimeout(pageview), { once: true });
  afterLoad();
  for (const m of ['pushState', 'replaceState']) { const o = history[m]; history[m] = function () { const r = o.apply(this, arguments); setTimeout(pageview); return r; }; }
  addEventListener('popstate', pageview);
  addEventListener('pagehide', () => send({ type: 'leave', durationMs: Math.min(864e5, Math.round(performance.now() - started)) }));

  // Opt-in clicks: elements carrying data-track="slug". Nothing else about a click is read.
  document.addEventListener('click', (e) => {
    const tag = e.target.closest && e.target.closest('[data-track]');
    if (tag) window.track('ui_click', tag.getAttribute('data-track'));
  });

  // Failures (a few distinct messages per page load).
  const seen = new Set();
  const fail = (name, msg) => { const l = clean(msg); if (seen.size < 5 && !seen.has(l)) { seen.add(l); window.track(name, l); } };
  addEventListener('error', (e) => fail('client_error', e.message));
  addEventListener('unhandledrejection', (e) => fail('unhandled_rejection', (e.reason && e.reason.message) || e.reason));

  // Real-user performance, labelled with the page so vitals can be judged per URL.
  if ('PerformanceObserver' in window) {
    const v = { lcp: 0, cls: 0, inp: 0 };
    const watch = (type, read, extra) => { try { new PerformanceObserver((l) => l.getEntries().forEach(read)).observe({ type, buffered: true, ...extra }); } catch {} };
    watch('largest-contentful-paint', (e) => { v.lcp = e.startTime; });
    watch('layout-shift', (e) => { if (!e.hadRecentInput) v.cls += e.value; });
    watch('event', (e) => { if (e.interactionId) v.inp = Math.max(v.inp, e.duration); }, { durationThreshold: 40 }); // worst interaction approximates INP
    let done = false;
    const flush = () => {
      if (done) return; done = true;
      const nav = performance.getEntriesByType('navigation')[0], fcp = performance.getEntriesByName('first-contentful-paint')[0];
      if (nav && nav.responseStart > 0) window.track('perf_ttfb', last, nav.responseStart);
      if (fcp) window.track('perf_fcp', last, fcp.startTime);
      if (v.lcp) window.track('perf_lcp', last, v.lcp);
      window.track('perf_cls', last, v.cls * 1000);
      if (v.inp) window.track('perf_inp', last, v.inp);
    };
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    addEventListener('pagehide', flush);
  }
})();
