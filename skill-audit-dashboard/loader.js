dash.loader('audits', {
  description: 'The sheet’s Form Responses 1 export (base64 CSV) as one row per audit, numbers typed, long text and lead links left out',
  fn: ({ answer }) => {
    const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
    if (!a || typeof a.content !== 'string') throw new Error('Google Drive returned no file content');
    const bin = atob(a.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = new TextDecoder('utf-8').decode(bytes);
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const TEXT = { qa: 'Email Address', agent: 'Agent Email ID', category: 'Category', am: 'Category AM Name',
      stage: 'Lead Stage as per LSQ', source: 'Lead Source', course: 'Course Name*', disposition: 'Lead Disposition Audit Type',
      intent: 'Intent of the Lead', fatal_error: 'Fatal Error Identified', training: 'Areas of Training Identified',
      concerning: 'Concerning Flag', fatal_flag: 'Fatal Flag', agent_name: 'Agent name', duration: 'Call Duration' };
    const NUM = {
      intro_k: 'Introduction & Purpose of the Call (Keep Doing)', intro_s: 'Introduction & Purpose of the Call (Stop Doing)',
      probing_k: 'Probing/Rapport Building (Keep Doing)', probing_s: 'Probing/Rapport Building (Stop Doing)',
      career_k: 'Career Counselling & Roadmap (Keep Doing)', career_s: 'Career Counselling & Roadmap (Stop Doing)',
      need_k: 'Need Mapping / Product Pitching (Keep Doing)', need_s: 'Need Mapping / Product Pitching (Stop Doing)',
      fee: 'Fee Structure & Payment Options', obj_k: 'Objection Handling (Keep Doing)', obj_s: 'Objection Handling (Stop Doing)',
      closing_k: 'Closing (Keep Doing)', closing_s: 'Closing (Stop Doing)', soft: 'Soft Skills (Quality)', dispo: 'Disposition as per NPF' };
    // The form's answer columns and the score columns share names: text takes the first match, scores the last.
    const norm = (s) => s.split('\n')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const head = (rows[0] || []).map(norm);
    const first = (h) => { const i = head.findIndex((x) => x.startsWith(norm(h))); return i < 0 ? null : i; };
    const last = (h) => { const i = head.lastIndexOf(norm(h)); return i < 0 ? null : i; };
    const tcol = Object.fromEntries(Object.entries(TEXT).map(([k, h]) => [k, first(h)]));
    const ncol = Object.fromEntries(Object.entries(NUM).map(([k, h]) => [k, last(h)]));
    const scol = last('Total Score') ?? last('Column 65');
    const missing = ['qa', 'agent', 'category'].filter((k) => tcol[k] == null).concat(scol == null ? ['score'] : []);
    if (head[0] !== 'timestamp' || missing.length) throw new Error('Unexpected sheet layout, missing: ' + (missing.join(', ') || 'Timestamp'));
    const get = (r, i) => (i == null ? '' : r[i] || '');
    const num = (v) => {
      const t = (v || '').trim().replace(/%$/, '').replace(/,/g, '');
      return t === '' || isNaN(Number(t)) ? null : Number(t);
    };
    const p2 = (n) => String(n).padStart(2, '0');
    const out = [];
    for (const r of rows.slice(1)) {
      const ts = (r[0] || '').trim();
      const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/);
      if (!m) continue;
      const date = `${m[3]}-${p2(m[1])}-${p2(m[2])}`;
      const o = { ts: `${date}T${p2(m[4])}:${m[5]}:${m[6]}`, date };
      for (const [k, i] of Object.entries(tcol)) o[k] = get(r, i).split(/\s+/).filter(Boolean).join(' ');
      o.qa = o.qa.toLowerCase();
      o.agent = o.agent.toLowerCase();
      o.am = o.am.toLowerCase();
      o.score = num(get(r, scol));
      for (const [k, i] of Object.entries(ncol)) o[k] = num(get(r, i));
      out.push(o);
    }
    return out;
  },
});
