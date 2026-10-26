# Niam's AI skills

Three [Claude Code](https://claude.com/claude-code) skills I use across my projects. Each is a folder in `skills/` with a `SKILL.md` that Claude loads when the task matches.

| Skill | What it does |
|---|---|
| [`reports`](skills/reports) | Turns research or analysis into a polished, self-contained HTML report. |
| [`admin-analytics`](skills/admin-analytics) | Adds first-party, cookieless analytics to every page of a site and builds a private admin dashboard themed to the project. |
| [`referral-links`](skills/referral-links) | Generates a UTM referral-link set for a site or project and keeps a registry so every new project cross-promotes the others. |

## reports

Ask for "a report on our pricing" or "write up this audit". Claude does the research first, then fills a bundled template: masthead, answer-first Bottom line, optional charts, tables and phase cards, and a mandatory Sources section. The result is one HTML file saved to `Report/<Name>.html` at the root of the project you are in. No build step; open it in any browser.

## admin-analytics

Ask for "an admin dashboard and analytics for this site". Claude surveys the project, then installs the pieces in one pass:

- **Tracking script** on every page: page views, time on page, sessions, opt-in `data-track` clicks, script errors and per-URL speed timings. Cookieless, no IP addresses, honors Do Not Track and Global Privacy Control.
- **Collector** (Node, no dependencies): validates and stores anonymous events, builds the numbers, and serves a token-protected API. Other stacks port it from the same spec.
- **Admin dashboard** at `/admin/`: Overview, Website & SEO, First-party signals, Engagement, Funnel & health, a **referral link generator** (two fields: where the link goes, which campaign), and a searchable **190-metric catalogue** with an import box for outside measurements. Layout is fixed; colors, fonts and corners are re-themed from the project.

The catalogue and the live numbers need a small backend (the collector). On a static-only site those views show an empty state. Metrics that need another tool (ad cost, email, uptime, CRM) read "Needs a source" and are never filled with invented values.

## referral-links

Say "referral links" or announce a new project. The skill keeps a registry of sources (places a link is embedded) and projects (destinations), prints one tagged link per source (`?utm_source=…&utm_medium=referral&utm_campaign=…`), skips a project's link to itself, and lists the new link each existing project should embed. The registry in `SKILL.md` ships with example entries; replace them with your own. Pairs with `admin-analytics`, whose dashboard has a link generator and ranks visits by campaign and placement.

## Install

```bash
git clone https://github.com/niamlestou/niams-ai-skills.git
cp -r niams-ai-skills/skills/reports ~/.claude/skills/
cp -r niams-ai-skills/skills/admin-analytics ~/.claude/skills/
cp -r niams-ai-skills/skills/referral-links ~/.claude/skills/
```

Install any one alone by copying just that folder. For a single project, copy into that project's `.claude/skills/` instead.

## Use

> make a report on how our checkout converts

> add an admin dashboard and first-party analytics to this site

## Customize

- `reports`: edit `skills/reports/template.html` (set the `[Brand]` and footer lines) or `SKILL.md`.
- `admin-analytics`: the look lives in the `:root` token block of `templates/admin.css`; panels live in the `VIEWS` list in `templates/admin.js`; the data model is in `references/spec.md`.

- `referral-links`: edit the Registry section at the top of `SKILL.md`.

## License

MIT
