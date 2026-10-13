# Skills Team Performance Audits dashboard

Live dashboard: https://claude.ai/artifact/29ze1kgytSTbMzE5kDs5rc

Source: Google Sheet "QA Call Audit Form || Skills 1.1 (Responses)", tab **Form Responses 1**
(`1YIBSVprq2vAEuE3LE5kZv1pqx23g8Mo-NRsGLg6ez4Q`).

- `index.html`: the dashboard page (Overview, Team levels, Counsellors, Quality parameters, Six Sigma lens).
- `loader.js`: turns the sheet's CSV export into one row per audit (used if the source is switched to live).
- `transform_audits.py`: the same transform, used by the 2-hourly refresh routine to build `audits.json`.

Refresh: a scheduled Claude routine ("Refresh Skills audit dashboard copy (every 2h)") runs every
2 hours inside the Claude session that has the Google Drive connector. It exports Form Responses 1 as
CSV, runs `transform_audits.py`, uploads `audits.json` to the dashboard and points the `audits` source
at it. Viewers therefore don't need access to the sheet (Gmail accounts included).

Keep the `audits` source as the saved copy. Switching it to a live query in Sources makes every viewer
read the sheet with their own Google access, so people outside PW see no data. The next refresh
switches it back.

Columns are matched by header name, so adding or moving sheet columns is safe; renaming a score
column header is not. Nine scored parameters (Objection handling included, out of 100); NA
parameters are left out, as in the sheet's Total Score.

Scoring constants (top of the script in `index.html`): pass mark / LSL 70%; performance categories Strugglers <60%, Levellers <70%, Movers <80%, Rockers 80%+;
parameter defect = score under 60% of its weight.
