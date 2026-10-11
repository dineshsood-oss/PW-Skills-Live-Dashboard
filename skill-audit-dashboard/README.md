# Skills Team Performance Audits dashboard

Live dashboard: https://claude.ai/artifact/29ze1kgytSTbMzE5kDs5rc

Source: Google Sheet "QA Call Audit Form || Skills 1.1 (Responses)", tab **Form Responses 1**
(`1YIBSVprq2vAEuE3LE5kZv1pqx23g8Mo-NRsGLg6ez4Q`).

- `index.html`: the dashboard page (Overview, Team levels, Counsellors, Quality parameters, Six Sigma lens).
- `loader.js`: turns the sheet's CSV export into one row per audit (used if the source is switched to live).
- `transform_audits.py`: the same transform, used by the 2-hourly refresh routine to build `audits.json`.

Refresh: a scheduled Claude routine runs every 2 hours. It exports Form Responses 1 as CSV, runs
`transform_audits.py`, uploads `audits.json` to the dashboard and points the `audits` source at it.
Viewers therefore don't need access to the sheet.

Scoring constants (top of the script in `index.html`): pass mark / LSL 70%, Top band 80%+,
parameter defect = score under 60% of its weight.
