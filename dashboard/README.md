# PW Skills — QA Audit MIS (live dashboard)

Source for the claude.ai Dashboard artifact that replaces the static
`qa_audit_mis_dashboard.html`. Data is read live from a Google Sheet.

## Google Sheet layout
- One tab per month, named like `Sep-2026`, `Oct-2026`, `Nov-2026`.
- Row 1 of every tab is the header row:
  `Enrolment Date | Reg Number | Final Fees | LC Owner | QA Name | Course Enrolled | Course Type | ZTP Category | Remarks | <24 parameter columns…>`
- Parameter cells: `YES` / `NO` / `NA` (Payment Type holds the payment mode).
- `ZTP Category`: `Red` / `Amber` / `Orange` / `Green` (blank → derived from NO count: 20+/15+/10+).
- Each morning the QA team appends the previous day's (D-1) audits to the current month tab.
- New month: duplicate last month's tab, rename it (e.g. `Nov-2026`) and clear the rows below the header.

## Files
- `index.html` — page markup and styles.
- `calcs.js` — loader (unzips the sheet's Excel export, reads every month tab) and the BOT 1/2/3 calculations.
- `app.js` — filters (month, day/week, step through periods), page navigation, charts and tables.
