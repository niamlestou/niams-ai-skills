---
name: admin-analytics
description: Add first-party, cookieless analytics to every page of a website or web app AND build a private admin dashboard for it, themed to the project's own colors and style. Use when the user asks for an admin dashboard, site analytics, "first-party analytics", site intelligence, traffic/engagement/vitals tracking, or to recreate the admin dashboard and analytics in one swoop in any project.
argument-hint: "[project path or notes, e.g. which funnel steps and events matter]"
---

# Admin analytics: tracking + dashboard in one pass

Installs the same first-party analytics and the same admin dashboard structure distilled from two earlier hand-built admin dashboards, restyled to the current project. Reference templates live in `~/.claude/skills/admin-analytics/templates/`. Read `references/spec.md` before changing the data model or adding views.

| File | Role |
|---|---|
| `templates/analytics.js` | Browser beacon for every page. Cookieless, honors DNT and GPC, SPA-aware. Records page views, time on page, opt-in `data-track` clicks, script errors and per-URL speed timings. |
| `templates/collector.mjs` | Node collector: validates and stores events, aggregates them, serves `POST /api/track` and `GET /api/admin/summary`, bearer-token gate. |
| `templates/metrics-catalog.json` | The 190-metric catalogue (id, family, tier, definition, how to measure, action trigger, first-party suitability). Copy it beside `collector.mjs`. |
| `templates/admin.html` `admin.css` `admin.js` | The dashboard: token gate, tab row with Export CSV, stat cards, line charts, bar lists, funnel, tables, heatmap, retention cohorts, the **Referral links** generator and the **All 190 metrics** catalogue. |

**The catalogue needs a small backend.** Live values, imports and the catalogue list all come from `collector.mjs` (`GET /api/admin/metrics`, `POST /api/admin/metrics/import`). On a static-only site the "All 190 metrics" view shows an empty state and says so. About 26 metrics are measured live by the beacon and server; the rest read "Needs a source" until a real measurement is imported. Never fill them with invented values.

**Referral links.** The generator (Referral links view) asks two things: where the link will be placed (becomes `utm_source`) and which campaign it belongs to (`utm_campaign`), plus an optional landing page, and builds `?utm_source=…&utm_medium=referral&utm_campaign=…` on the site's own origin. The beacon reads those tags on landing, so the same view ranks "campaign · placement" by sessions. Recent links are kept in the browser only.

## Steps

1. **Survey the project.** Find the stack (static HTML, Astro/Next/Vite, Express, Python, serverless), every page template or layout that should carry the beacon, the existing server or API entry, and any existing analytics (reuse its endpoint or replace it, never run two). Read `DESIGN.md`/`PRODUCT.md` if present, then the main stylesheet for colors, fonts and radii. Check `.gitignore` for a `data/` or similar folder to hold the event file.
2. **Install the beacon on every page.** Copy `analytics.js` to the public folder and add `<script src="/analytics.js" defer></script>` to the shared layout, or to each HTML page when there is no layout. Do not add it to admin pages (the beacon skips `/admin` itself). Mark important buttons with `data-track="slug"` and call `window.track('name', 'label')` for project-specific actions.
3. **Add the collector.**
   - **Node server (any framework):** copy `collector.mjs` and `metrics-catalog.json` beside the server, then `app.use(analytics.middleware)` for Express or `if (await analytics.handle(req, res)) return;` for plain `http`. Pass `events` (project-specific event names) and `funnel` steps (`{ label, path }` or `{ label, event, eventLabel }`) that describe the project's activation path.
   - **Serverless or other languages (Python, Go, Lambda, Workers):** port `collector.mjs` function by function: `clean` (validation), `summarize` (aggregation, keep the same JSON shape), `liveValues`/`catalogReport`/`importObservations` (the catalogue and its import API, same JSON shape), the bearer check, and the rate limit. Serve `metrics-catalog.json` as data. Store rows in the project's existing database or a file; keep them anonymous. The dashboard only depends on the `/api/admin/summary` JSON shape.
   - **Static-only hosting:** a collector needs a server. Add the smallest one (a Cloudflare Worker or Lambda port) or tell the user a backend is required.
   - Set `ADMIN_TOKEN` in the environment and document it in `.env.example`. Without it the dashboard answers 503 by design.
4. **Install the dashboard.** Copy `admin.html`, `admin.css`, `admin.js` to `/admin/` (serve `/admin/` as a static path). Replace `{{PROJECT_NAME}}` in `admin.html`. Keep the layout, class names and tab order identical across projects; only the theme and project-specific views change. Do not add per-view URLs, a date-range picker, a lock button or a hero gate: those were specific to one source dashboard and are deliberately left out.
5. **Theme it (the important part).** Edit only the `:root` token block at the top of `admin.css`:
   - `--bg --surface --surface-2 --line --text --muted --faint` from the project's page background, card, border and text colors. For a light project set `color-scheme: light` and light values.
   - `--accent` from the project's primary brand color and `--accent-ink` as readable text on it. `--tone-2/3/4` from its secondary palette (keep them distinguishable; respect project rules such as "no orange").
   - `--font`/`--display`/`--mono` from the project's fonts; link the same webfont in `admin.html`. `--radius` from its corner style (sharp 4px, soft 14px).
   - Replace the `.brand-mark` square with the project's logo (inline SVG or `<img>`).
   - If the project has a visual signature (paper texture, pixel icons, gradients), add a few lines of CSS for it at the bottom of `admin.css`. Do not change the layout.
6. **Project-specific views.** Edit the `VIEWS` array in `admin.js`: rename or drop views that do not apply (a site with no signup has no Conversion view), and add views for the project's own data (orders, jobs, model usage) using the same widget types: `kpis`, `trend`, `rank`, `funnel`, `table`, `heat`, `cohort`, `note`. Any extra data needs a matching field in `summarize` or an extra endpoint behind the same token.
7. **Verify (do not skip).**
   - Syntax-check the three JS files with `node --check`.
   - Start the project, load two pages in the browser and click a `data-track` element, then confirm rows appear in the event file: `pageview`, `ui_click`, `leave`, `perf_*`.
   - Open `/admin/`, unlock with a test token, visit every view, and confirm none is blank or throws (check the console). Check the 640px layout.
   - Create a referral link, open it, and confirm the Referral links view lists "campaign · placement". Open "All 190 metrics": 190 rows, filters work, a test import shows as Imported, a bad metric id is rejected.
   - Confirm a wrong token returns 401, no token configured returns 503, an unlisted event name is dropped, and a missing admin token never reaches the browser source.
8. **Report.** List the files added and edited, the env var to set, the funnel steps and events chosen, and what is not measured (see Honest limits). Do not deploy or push without being asked.

## Rules

- **Privacy is the product.** No cookies, no IPs, no fingerprints, no stored user agents, no copied text, no form values, no URL fragments or query strings except `utm_campaign` / `utm_source`. Event labels are short slugs matching `^[\w .:/#-]*$`.
- **Never invent numbers.** A metric with no data shows "—" or an empty state. A measured zero stays zero. Do not seed fake data in production; a seeded test file belongs in a scratch folder only.
- **Allowlist events.** Event names must be listed (`events` option plus the defaults), shared between beacon calls and the collector, so a typo never becomes unreviewed data.
- **Admin is private:** `noindex`, bearer-token gate with constant-time compare, token kept only in `sessionStorage`, `Cache-Control: no-store`, never linked from public pages.
- **Respect consent law.** First-party cookieless counting needs no banner in most places, but if the project already has a consent flow, honor its "denied" choice in the beacon too.
- Match the project's conventions (language, module style, lint rules) when porting, and add a small test for `summarize` when the project has a test runner.

## Honest limits to tell the user

Geography, ad cost, email stats, uptime and CRM figures need a third-party source and are not measured. Scroll depth, copy, outbound-click and time-to-first-interaction events are not recorded by default; add them with `window.track` if the project needs them. Session length comes from the page-leave beacon, so abrupt closes under-count. Blockers and Do Not Track hide some visitors; the "Tracking gap" card estimates how many.
