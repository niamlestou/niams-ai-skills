# reports-skill

A Claude Code skill that turns research or analysis into a polished, self-contained HTML report (one file, no build step) from a bundled template: masthead, answer-first "Bottom line", optional charts, tables and phase cards, and a mandatory Sources section.

Ask Claude things like "make a report on our pricing" or "write up this audit". The report is saved to `Report/<Name>.html` at the root of the project you are working in.

## Install

Personal (all projects):

```bash
git clone https://github.com/niamlestou/reports-skill.git
cp -r reports-skill/skills/reports ~/.claude/skills/
```

Single project: copy `skills/reports` into that project's `.claude/skills/` instead.

## Use

> make a report on how our checkout converts

Claude reads `template.html`, does the research first, keeps only the sections the content needs, fills in today's date and cites its sources. Open the HTML file in any browser.

## Customize

Edit `skills/reports/template.html` to set your brand name (`[Brand]`) and footer line, or change the design. Edit `SKILL.md` to change the workflow.

## License

MIT
