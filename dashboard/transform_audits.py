"""Turn the "Form Responses 1" CSV export of the QA Call Audit sheet into the
dashboard's audits.json (one row object per audit, numbers typed, long text
and lead links left out).

Usage: python3 -I transform_audits.py <export.csv> <audits.json>
"""
import csv
import json
import sys
from datetime import datetime

NUM = {  # output column -> 0-based column in Form Responses 1
    'intro_k': 46, 'intro_s': 47, 'probing_k': 48, 'probing_s': 49,
    'career_k': 50, 'career_s': 51, 'need_k': 52, 'need_s': 53,
    'fee': 54, 'obj_k': 55, 'obj_s': 56, 'closing_k': 57, 'closing_s': 58,
    'soft': 59, 'dispo': 60,
}
TEXT = {
    'qa': 1, 'agent': 2, 'category': 4, 'am': 5, 'stage': 7, 'source': 8,
    'course': 9, 'disposition': 33, 'intent': 34, 'fatal_error': 35,
    'training': 37, 'concerning': 61, 'fatal_flag': 62, 'agent_name': 68,
    'duration': 13,
}


def num(v):
    v = (v or '').strip().rstrip('%').replace(',', '')
    try:
        return float(v)
    except ValueError:
        return None


def main(src, dst):
    rows = list(csv.reader(open(src, encoding='utf-8')))
    out = []
    for r in rows[1:]:
        r = r + [''] * (69 - len(r))
        ts = r[0].strip()
        if not ts:
            continue
        dt = datetime.strptime(ts, '%m/%d/%Y %H:%M:%S')
        row = {'ts': dt.strftime('%Y-%m-%dT%H:%M:%S'), 'date': dt.strftime('%Y-%m-%d')}
        for k, i in TEXT.items():
            row[k] = ' '.join(r[i].split())
        row['qa'] = row['qa'].lower()
        row['agent'] = row['agent'].lower()
        row['am'] = row['am'].lower()
        row['score'] = num(r[63])
        for k, i in NUM.items():
            row[k] = num(r[i])
        out.append(row)
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'audits written')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
