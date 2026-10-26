# Admin analytics spec

Distilled from two hand-built admin dashboards (a Python/Supabase site and a TypeScript/Express game). Both are tied to their own stacks; this skill keeps what they share.

## Data model (anonymous rows)

| Row | Fields |
|---|---|
| `pageview` | `t, vid, sid, path, ref (origin only, first touch), utm (campaign or source), w (screen width), lang, loadMs` |
| `leave` | `t, vid, sid, durationMs` (sent on pagehide; powers engagement time) |
| `event` | `t, vid, sid, name (allowlisted), label (slug), value (integer or null)` |

`vid` is a random id in `localStorage` (a returning visitor), `sid` a random id in `sessionStorage` (one visit). Neither is derived from IP or device. Do Not Track and Global Privacy Control send nothing at all. The referrer is the external origin of the current page load only (not remembered across visits).

## Default events (the collector's allowlist)

`ui_click` (label = `data-track` slug), `client_error`, `unhandled_rejection` (label = sanitized message), and timings `perf_ttfb`, `perf_fcp`, `perf_lcp`, `perf_inp` (ms, label = page path) and `perf_cls` (score x 1000). Project events are added through the collector's `events` option.

## Definitions (keep identical across projects)

- **Engaged session:** at least 10 s on site or 2 or more page views. **Bounce:** one page view and not engaged.
- **Channel:** Direct (no referrer, no UTM), Organic search, Social, AI assistants (ChatGPT, Perplexity, Gemini, Claude, Copilot, DeepSeek, You, Phind), Referral, Campaign (UTM only).
- **Device:** width under 640 Mobile, under 960 Tablet, otherwise Desktop.
- **Dark social proxy:** direct sessions that land on a deep page (not `/`).
- **Core Web Vitals:** p75 per URL. Good means LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. INP uses the worst interaction as a stand-in for the 98th-percentile rule.
- **Stickiness:** daily active visitors divided by monthly active visitors. **Cohorts:** first-seen week, last 8 weeks, share active in each later week.
- **Tracking gap:** one minus beacon sessions over server human page loads in the last hour (blockers, DNT, JS off).
- **Funnel** steps count unique sessions, not people, and are not conversion rates.

## Dashboard structure (identical in every project)

Gate card (brand, token field, Back to site), then a top bar (brand, Back office label, live updated time, Refresh, Back to site), a page head (eyebrow "Last 30 days" and title), a pill tab row with Export CSV beside it, stat cards, and an auto-fill card grid (330 px minimum). The window is fixed at 30 days. Tabs: Overview, Website & SEO, First-party signals, Engagement, Funnel & health, Referral links, All 190 metrics; the chosen tab is remembered per browser tab. Charts always carry exact numbers (tooltips, an `aria-label` with values), a labeled scale, and 12 px minimum axis text.

Left out on purpose because only one source dashboard had them: vertical navigation with per-view URLs, a 7/30/90-day picker, a Lock button, scroll-depth, copy, outbound-click and first-interaction events, cross-visit referrer memory, and the model-usage, GA4 and Search Console views. Project-specific panels (game economy, model usage, orders) go in as new `VIEWS` entries with new fields in the summary JSON.

## Security checklist

Bearer token from `ADMIN_TOKEN`, constant-time compare, 503 when unset, 401 when wrong, `Cache-Control: no-store`, CORS closed by default, body size cap (4 KB), per-IP rate limit on `/api/track`, text rendered with `textContent` only, validated and truncated fields, admin path `noindex` and excluded from tracking.

## Metric catalogue (needs the backend)

This view and its import API existed in only one of the two source dashboards. It is kept because the owner asked for it. To drop it: delete the `catalog` view from `VIEWS`, the `draw.catalog` function, the catalogue block in `collector.mjs` and `metrics-catalog.json`.

`metrics-catalog.json` holds 190 definitions in 10 families (traffic, engagement, conversion, speed, SEO, content, retention, channels, quality, trust), tiered Core, Strong or Niche, each with a description, how to measure it, an action trigger and a first-party suitability verdict. Status per metric: **Measured live** (computed from beacon and server rows, ~26), **Imported** (a real reading posted to `POST /api/admin/metrics/import`), **Needs a source** (no data: ad cost, email, uptime, CRM, surveys, Search Console), **No data yet** (measured kind, but nothing recorded in the window). A measured zero stays zero. Imports: up to 200 observations and 60 KB per request; units count, percent (0 to 100), USD, seconds, ms, score, ratio, bytes, days; dates YYYY-MM-DD with no future end; duplicate metric/range/segment rejected inside one request, re-importing replaces. "All" is the overall value; other segments are listed and never summed. Some catalogue entries describe features a site may not have (cart, call center); keep them listed with no value.

## Referral links

Two inputs: where the link will be placed (`utm_source`) and the campaign (`utm_campaign`), plus an optional landing path. Values are lowercased, spaces become hyphens, anything outside `a-z 0-9 _ -` is dropped, 40 characters max. `utm_medium` is always `referral`. The beacon sends `utm` (campaign, else source) and `src` (placement); sessions with either count as the Campaign channel, and the dashboard ranks "campaign · placement".
