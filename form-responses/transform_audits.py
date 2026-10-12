"""Turn the "Form Responses 1" CSV export of the QA Call Audit sheet into the
dashboard's audits.json (one row object per audit, numbers typed, long text
and lead links left out).

Columns are found by header name, so inserting or removing columns in the
sheet doesn't break it. The form's answer columns and the score columns share
names, so text fields take the first matching header and score fields the last.

Usage: python3 -I transform_audits.py <export.csv> <audits.json>
"""
import csv
import json
import re
import sys
from datetime import datetime

TEXT = {  # output field -> header (first match)
    'qa': 'Email Address', 'agent': 'Agent Email ID', 'category': 'Category',
    'am': 'Category AM Name', 'stage': 'Lead Stage as per LSQ', 'source': 'Lead Source',
    'course': 'Course Name*', 'disposition': 'Lead Disposition Audit Type',
    'intent': 'Intent of the Lead', 'fatal_error': 'Fatal Error Identified',
    'training': 'Areas of Training Identified', 'concerning': 'Concerning Flag',
    'fatal_flag': 'Fatal Flag', 'agent_name': 'Agent name', 'duration': 'Call Duration',
}
NUM = {  # output field -> header (last match: the score block)
    'intro_k': 'Introduction & Purpose of the Call (Keep Doing)',
    'intro_s': 'Introduction & Purpose of the Call (Stop Doing)',
    'probing_k': 'Probing/Rapport Building (Keep Doing)',
    'probing_s': 'Probing/Rapport Building (Stop Doing)',
    'career_k': 'Career Counselling & Roadmap (Keep Doing)',
    'career_s': 'Career Counselling & Roadmap (Stop Doing)',
    'need_k': 'Need Mapping / Product Pitching (Keep Doing)',
    'need_s': 'Need Mapping / Product Pitching (Stop Doing)',
    'fee': 'Fee Structure & Payment Options',
    'obj_k': 'Objection Handling (Keep Doing)',
    'obj_s': 'Objection Handling (Stop Doing)',
    'closing_k': 'Closing (Keep Doing)', 'closing_s': 'Closing (Stop Doing)',
    'soft': 'Soft Skills (Quality)', 'dispo': 'Disposition as per NPF',
}
SCORE = ['Total Score', 'Column 65']


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.split('\n')[0].lower())


def num(v):
    v = (v or '').strip().rstrip('%').replace(',', '')
    try:
        return float(v)
    except ValueError:
        return None


def main(src, dst):
    rows = list(csv.reader(open(src, encoding='utf-8')))
    head = [norm(h) for h in rows[0]]
    first = lambda h: next((i for i, x in enumerate(head) if x.startswith(norm(h))), None)
    last = lambda h: next((i for i in range(len(head) - 1, -1, -1) if head[i] == norm(h)), None)
    tcol = {k: first(h) for k, h in TEXT.items()}
    ncol = {k: last(h) for k, h in NUM.items()}
    scol = next((c for c in (last(h) for h in SCORE) if c is not None), None)
    missing = [k for k in ('qa', 'agent', 'category') if tcol[k] is None] + ([] if scol is not None else ['score'])
    if head[0] != 'timestamp' or missing:
        sys.exit('Unexpected sheet layout, missing: ' + ', '.join(missing or ['Timestamp']))
    get = lambda r, i: r[i] if i is not None and i < len(r) else ''
    out = []
    for r in rows[1:]:
        ts = get(r, 0).strip()
        if not ts:
            continue
        dt = datetime.strptime(ts, '%m/%d/%Y %H:%M:%S')
        row = {'ts': dt.strftime('%Y-%m-%dT%H:%M:%S'), 'date': dt.strftime('%Y-%m-%d')}
        for k, i in tcol.items():
            row[k] = ' '.join(get(r, i).split())
        row['qa'] = row['qa'].lower()
        row['agent'] = row['agent'].lower()
        row['am'] = row['am'].lower()
        row['score'] = num(get(r, scol))
        for k, i in ncol.items():
            row[k] = num(get(r, i))
        out.append(row)
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'audits written')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
