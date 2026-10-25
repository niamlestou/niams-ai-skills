---
name: reports
description: Make a report as a self-contained HTML file from the saved report template. Use whenever the user asks for a report, plan, analysis, roadmap, audit or write-up, e.g. "make a report on X", "write me a report", "report on this".
---

# Reports

Every report is built from the template, never from scratch.

Template: `template.html` in this skill's folder (`~/.claude/skills/reports/`).
Output folder: a `Report` folder at the root of the project being worked on (the git root, else the current working directory). Create it if missing. Never save into another project's folder. Filename: `<Name>.html`.

## Steps

1. **Read the whole template** (about 1,440 lines; read in pages). Its top comment block lists the 28 sections (00 Masthead through 28 Sources) and how to use them. Its footer and script are part of the format.
2. **Do the research or analysis first.** Gather real facts from the files, data or sources the user points to. Don't invent figures, quotes or sources; if something is unknown, say so in the report.
3. **Copy the template** to the output path with `cp`, then edit the copy. Never overwrite the template. If the target name already exists, ask before replacing it.
4. **Choose sections to fit the content. Most reports need only a handful.** The template is a menu, not a checklist: include a section only if the content calls for it, and delete every other section along with its `<li>` in the Contents `<nav class="toc">`. Never pad a report to use more sections. Always keep 00 Masthead, 01 Bottom line (first, answer-first) and 28 Sources. Keep each section `id` and its Contents link in step. To repeat an element (card, row, phase, rule), copy a block from the same section.
5. **Set the date everywhere.** Get today's date from the system (`date "+%B %-d, %Y"`), never from memory or the template. Write it as Month D, YYYY in all three places: the masthead's `brandline` (the `[Month D, YYYY]` slot), the footer, and the Sources line "Checked <date>". Also update `<title>`, the masthead (type, prepared for, scope, builds on) and the footer's report title. Fill every `[bracketed]` placeholder (including the brand and footer lines; ask the user for the brand name if unknown); replace the numbers the template marks as "sample" in charts and calculators with real ones, or delete that section.
   **Always cite sources.** Section 28 Sources is mandatory and sits at the bottom. List every file, page, dataset, tool output or earlier report the findings rest on, grouped under `<h4>` headings, each as a link (`https://` URL for web pages, `file:///` path for local files) or plain text if there is no link. The "Checked" paragraph says which figures were carried over from other reports. Cite only what was actually read; do not invent sources. If a report used none, say so in that paragraph instead of deleting the section.
6. **Keep the design as is.** Violet and azure only. Leave the `<style>` blocks and the `<script>` unchanged, except for edits the content needs, such as chart data. Tick persistence keys off `document.title`, so make the title unique per report.
7. **Style of writing.** Lead with the point, then the evidence. Short paragraphs of three or four sentences. Plain words. Use `<strong>` for the one phrase a skimmer must catch, and `<code>` for names and commands.
8. **Check it.** Confirm the date matches today in all three places and Sources has real entries. Grep the file for leftover `[` placeholders (`grep -n "\[[A-Z]" file`), and for `sample`. Confirm every Contents `href` matches a section `id`. Open it in the browser pane if available to check that it renders and that the layout holds at narrow width.
9. **Tell the user** the file path and a two-line summary of the headline finding. Don't paste the report into chat.

## Notes

- Existing reports in the project's Report folder (e.g. `Deployment Plan.html`) show the template used well. Skim one if the structure is unclear.
- If the user asks for another format (Word, PDF, doc), use this template only if they want it as HTML; otherwise ask or follow their format.
