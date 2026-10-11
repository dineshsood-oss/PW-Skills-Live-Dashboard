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
    const NUM = { intro_k: 46, intro_s: 47, probing_k: 48, probing_s: 49, career_k: 50, career_s: 51, need_k: 52, need_s: 53,
      fee: 54, obj_k: 55, obj_s: 56, closing_k: 57, closing_s: 58, soft: 59, dispo: 60 };
    const TEXT = { qa: 1, agent: 2, category: 4, am: 5, stage: 7, source: 8, course: 9, disposition: 33, intent: 34,
      fatal_error: 35, training: 37, concerning: 61, fatal_flag: 62, agent_name: 68, duration: 13 };
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
      for (const [k, i] of Object.entries(TEXT)) o[k] = (r[i] || '').split(/\s+/).filter(Boolean).join(' ');
      o.qa = o.qa.toLowerCase();
      o.agent = o.agent.toLowerCase();
      o.am = o.am.toLowerCase();
      o.score = num(r[63]);
      for (const [k, i] of Object.entries(NUM)) o[k] = num(r[i]);
      out.push(o);
    }
    return out;
  },
});
