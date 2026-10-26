---
name: referral-links
description: Generate the UTM referral-link suite for a site/app/project and register it. Use when the user says "referral links", "run the referral skill", or announces a new site/app/project to promote.
---

# Referral link suite

Keeps one registry of **Sources** (places a link is embedded) and **Projects** (destinations). Every project is also a source, so each new project cross-promotes all the others.

## Registry (edit this section; it is the source of truth)

Sources (utm_source slug -> utm_campaign):
- linkedin -> profile
- newsletter -> email
- example.com (example) -> crosspromo

Projects:
- https://example.com

(Example entries. Replace them with your own sources and projects; the skill keeps this list up to date as you add projects.)

## Link format

`<project-url>/?utm_source=<slug>&utm_medium=referral&utm_campaign=<campaign>`

A link never points a project at itself (skip the source whose slug is that project's own).

## Procedure

1. Get the project URL (ask if not given). Normalize to `https://host`.
2. Print a table of one link per source, minus the project's own.
3. Add the project to **Projects**, and add it to **Sources** as `host (slug) -> crosspromo` (slug = name without TLD, lowercase, no punctuation).
4. Backfill: for every other existing project, print the one new link from this project as a source, so the user can embed it there.
5. Note that deep pages work too (`/about?utm_...`), and that vary `utm_campaign` per placement (post, footer, bio) to compare placements.
6. Only if the project is a repo you are in and reads utm params (check for an analytics/admin campaigns panel): say whether it tracks them. Don't change code unasked.
