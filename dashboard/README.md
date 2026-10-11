# PW Skills — QA Audit MIS (live dashboard)

Source for the claude.ai Dashboard artifact that replaces the static
`qa_audit_mis_dashboard.html`. Data is read live from a Google Sheet.

## Google Sheet layout (QA team format)
- One tab per month, named like `Sep-2026`, `Oct-2026`.
- Header block of up to 3 merged rows (group → sub-group → parameter); each column is named by the
  lowest header text above the first audit row, so merged cells are handled automatically.
- Recognised columns: Registered number, Final fees, Enrolment date, Manager Mail, LC owner, QA Name,
  Audited Date, TT, Course Enrolled, Course Type || Basic/Pre/Pro, Remarks QA, Manager Remark,
  ZTP Category, FATAL/Concerning. Every other column is an audit parameter (YES / NO / NA).
- Tabs may differ (e.g. Oct-2026 has no Refund columns); missing parameters are simply not counted.
- Periods follow Enrolment date; the D-1 upload check uses Audited Date.

## Files
- `index.html` — page markup and styles.
- `calcs.js` — loader (unzips the sheet's Excel export, reads every month tab) and the BOT 1/2/3 calculations.
- `app.js` — filters (month, day/week, step through periods), page navigation, charts and tables.

## Data refresh (no Google login needed by viewers)
Viewers read a rows file attached to the dashboard, not the sheet. A scheduled routine refreshes it:
1. Google Drive `download_file_content` with fileId `1waJ54P4ciUFPocZtZ6BEfqnsGKYbDn345ww5Nl_QHGs`,
   exportMimeType `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (the large
   result is saved to a tool-results file).
2. `node dashboard/refresh.mjs <that file> <out>/audit_rows.json` (uses `sheet-reader.js`).
3. Upload `audit_rows.json` to the artifact's asset store, then update `datasets/audits`:
   `source.url` = the new `/_blob/<id>`, `updated` = now, `lastAttempt`; delete the previous blob.
