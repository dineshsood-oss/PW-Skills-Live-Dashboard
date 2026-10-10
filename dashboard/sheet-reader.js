/* Reads the QA audit Google Sheet's Excel export into rows (one per audit). Used by refresh.mjs. */

dash.loader('audits', {
  description: 'Unzips the Excel export of the Google Sheet and reads every month tab as rows (one per audit), adding the tab name and sheet row number.',
  fn: async ({ answer }) => {
    const a = typeof answer === 'string' ? (() => { try { return JSON.parse(answer); } catch (e) { return { message: answer }; } })() : answer;
    if (!a || typeof a.content !== 'string') throw new Error((a && (a.error && (a.error.message || a.error) || a.message)) || 'Google Drive returned no file content');
    const bin = atob(a.content);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dv = new DataView(u8.buffer);
    const dec = new TextDecoder();
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('The export is not an Excel file');
    const entries = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
      const nlen = dv.getUint16(p + 28, true);
      entries[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = {
        method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true),
      };
      p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }
    const file = async (name) => {
      const f = entries[name];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = u8.slice(start, start + f.size);
      if (f.method === 0) return dec.decode(data);
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
    const attrs = (s) => { const o = {}; s.replace(/([\w:]+)="([^"]*)"/g, (m, k, v) => { o[k] = unxml(v); }); return o; };
    const texts = (s) => (s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => unxml(t.replace(/^<t\b[^>]*>|<\/t>$/g, ''))).join('');

    const shared = ((await file('xl/sharedStrings.xml')) || '').match(/<si>[\s\S]*?<\/si>|<si\/>/g) || [];
    const strings = shared.map(texts);
    const rels = {};
    ((await file('xl/_rels/workbook.xml.rels')) || '').replace(/<Relationship\b([^>]*)\/?>/g, (m, s) => { const r = attrs(s); rels[r.Id] = r.Target; });
    const sheets = [];
    ((await file('xl/workbook.xml')) || '').replace(/<sheet\b([^>]*)\/?>/g, (m, s) => { const r = attrs(s); sheets.push({ name: r.name, target: rels[r['r:id']] }); });

    const norm = (h) => String(h).toLowerCase().replace(/\s+/g, ' ').trim();
    const FIXED = {
      'enrolment date': 'enrolment_date', 'enrollment date': 'enrolment_date', 'date of enrolment': 'enrolment_date',
      'registered number': 'reg_number', 'reg number': 'reg_number', 'registration number': 'reg_number', 'reg no': 'reg_number',
      'final fees': 'final_fees', 'lc owner': 'lc_owner', 'counsellor': 'lc_owner', 'counsellor name': 'lc_owner',
      'qa name': 'qa_name', 'audited date': 'audited_date', 'audit date': 'audited_date', 'tt': 'talk_time', 'talk time': 'talk_time',
      'manager mail': 'manager', 'manager': 'manager', 'manager name': 'manager',
      'course enrolled': 'course_enrolled', 'course type': 'course_type',
      'ztp category': 'ztp_category', 'remarks': 'remarks', 'qa remarks': 'remarks', 'remarks qa': 'remarks',
      'manager remark': 'manager_remark', 'manager remarks': 'manager_remark', 'fatal/concerning': 'fatal', 'fatal / concerning': 'fatal',
    };
    const keyOf = (h) => { const n = norm(h); return FIXED[n] || (n.startsWith('course type') ? 'course_type' : null); };
    const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const pad = (n) => String(n).padStart(2, '0');
    const toDate = (v, numeric) => {
      if (v == null || v === '') return null;
      if (numeric || /^\d{5}(\.\d+)?$/.test(v)) {
        const d = new Date(Math.round((Number(v) - 25569) * 864e5));
        return isNaN(d) ? null : d.toISOString().slice(0, 10);
      }
      const s = String(v).trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
      m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2,4})$/);
      if (m && MON[m[2].toLowerCase()]) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(m[1])}`;
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
      if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
      return null;
    };
    const toSecs = (v, numeric) => {
      if (v == null || v === '') return null;
      if (numeric) return Math.round(Number(v) * 86400);
      const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      return m ? (m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) : null;
    };
    const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

    const rows = [];
    const columns = ['tab', 'sheet_row', 'enrolment_date', 'audited_date', 'reg_number', 'final_fees', 'manager', 'lc_owner', 'qa_name', 'talk_time_sec', 'course_enrolled', 'course_type', 'ztp_category', 'fatal', 'remarks', 'manager_remark'];
    for (const sh of sheets) {
      if (!sh.target) continue;
      const path = sh.target.startsWith('/') ? sh.target.slice(1) : 'xl/' + sh.target.replace(/^\.\//, '');
      const xml = await file(path);
      if (!xml) continue;
      const grid = [];
      (xml.match(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) || []).forEach((rx) => {
        const rnum = +(attrs(rx.match(/^<row\b([^>]*)/)[1]).r);
        const cells = [];
        rx.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, s, body) => {
          const at = attrs(s);
          let v = null; let numeric = false;
          if (body) {
            const vm = body.match(/<v>([\s\S]*?)<\/v>/);
            if (at.t === 's') v = vm ? strings[+vm[1]] : null;
            else if (at.t === 'inlineStr') v = texts(body);
            else if (vm) { v = unxml(vm[1]); numeric = !at.t || at.t === 'n'; }
          }
          cells[colIndex(at.r)] = { v, numeric };
        });
        grid.push({ rnum, cells });
      });
      // Headers can span several merged rows (group / sub-group / parameter): a merged cell holds its text
      // only in its top-left cell, so each column is named by the lowest header text above the first data row.
      const top = grid.slice(0, 8);
      let dateCol = -1;
      top.some((r) => r.cells.some((c, i) => { if (c && c.v != null && keyOf(c.v) === 'enrolment_date') { dateCol = i; return true; } return false; }));
      if (dateCol < 0) continue;
      let first = grid.findIndex((r, i) => i < 12 && r.cells[dateCol] && toDate(r.cells[dateCol].v, r.cells[dateCol].numeric));
      if (first < 0) first = grid.findIndex((r) => r.cells.some((c) => c && c.v != null && keyOf(c.v) === 'enrolment_date')) + 1;
      const width = Math.max(...grid.slice(0, first + 1).map((r) => r.cells.length));
      const keys = [];
      for (let i = 0; i < width; i++) {
        let h = '';
        for (let j = first - 1; j >= 0 && !h; j--) { const c = grid[j].cells[i]; if (c && c.v != null && String(c.v).trim()) h = String(c.v).replace(/\s+/g, ' ').trim(); }
        keys[i] = h ? (keyOf(h) || h) : '';
      }
      keys.forEach((k) => { if (k && k !== 'talk_time' && !columns.includes(k)) columns.push(k); });
      grid.slice(first).forEach((r) => {
        const o = { tab: sh.name, sheet_row: r.rnum };
        let filled = false;
        keys.forEach((k, i) => {
          if (!k) return;
          const c = r.cells[i];
          let v = c ? c.v : null;
          if (v != null && String(v).trim() === '') v = null;
          if (v != null) filled = true;
          if (k === 'enrolment_date' || k === 'audited_date') o[k] = toDate(v, c && c.numeric);
          else if (k === 'talk_time') o.talk_time_sec = toSecs(v, c && c.numeric);
          else if (k === 'final_fees') { const n = v == null ? NaN : Number(String(v).replace(/[₹,\s]/g, '')); o[k] = isNaN(n) ? null : n; }
          else o[k] = v == null ? null : String(v).trim();
        });
        // Sheets in a month-first locale saves a typed 01-10-2026 (1 Oct) as 10 Jan: an audit can't
        // predate its enrolment, so when swapping day and month gives a date on/after enrolment, use that.
        if (o.audited_date && o.enrolment_date && o.audited_date < o.enrolment_date) {
          const [y, mo, dd] = o.audited_date.split('-');
          const sw = +dd <= 12 ? `${y}-${dd}-${mo}` : null;
          if (sw && sw >= o.enrolment_date) o.audited_date = sw;
        }
        if (filled && (o.enrolment_date || o.lc_owner)) rows.push(o);
      });
    }
    return { columns, rows };
  },
});

