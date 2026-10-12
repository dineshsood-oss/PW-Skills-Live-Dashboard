/* QA Audit MIS — page logic: filters, navigation, charts, tables. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const RAG = { red: '#c0392b', amber: '#c98b06', orange: '#d9662b', green: '#2f7d4f' };
  const RAG_NAME = { red: 'RED', amber: 'AMBER', orange: 'ORANGE', green: 'GREEN' };
  const RAG_DEF = { red: '20+ missed', amber: '15+', orange: '10+', green: '0–9' };
  const fInt = d3.format(',');
  const fPct = d3.format('.0%');
  const f1 = d3.format('.1f');
  const enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const where = (k, v) => `${k}=${enc(v)}`;
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const mark = (e, source, field, wh) => { e.dataset.source = source; if (field) e.dataset.field = field; if (wh) e.dataset.where = wh; return e; };
  const fmtDate = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

  /* ---------- local UI state (page, sorts, alarm filters) ---------- */
  const ui = {
    page: 'overview', paramMetric: 'no', paramSort: ['rank', 1], paramQ: '', paramGroup: '',
    lcSort: ['avg_no', -1], lcQ: '', lcF: 'all',
    alQ: '', alLc: '', alT: '', alR: '', alLimit: 40,
    openGroups: new Set(['Product Details Pitched', 'Placement levels for eligible candidates']),
  };

  /* ---------- filters ---------- */
  const P = () => dash.params();
  const scopeKey = () => {
    const p = P();
    const m = p.month || 'all';
    return !p.bucket || p.bucket === 'all' || p.grain === 'all' ? `${m}|all|all` : `${m}|${p.grain}|${p.bucket}`;
  };
  const S = (id) => dash.data(id);
  const rowsOf = (id) => (S(id).status === 'ok' ? S(id).data : []);

  let defaultsApplied = false;
  const setDefaults = (summary) => {
    const months = summary.filter((r) => r.grain === 'all' && r.month !== 'all').map((r) => r.month).sort();
    if (!months.length) return;
    const now = new Date();
    const live = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    dash.setParams({ month: months.includes(live) ? live : months[months.length - 1], grain: 'day', bucket: 'all' });
  };

  $('#fMonth').addEventListener('change', (e) => dash.setParams({ month: e.target.value, bucket: 'all' }));
  $('#fGrain').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dash.setParams({ grain: b.dataset.g, bucket: 'all' });
  });
  $('#fBucket').addEventListener('change', (e) => dash.setParams({ bucket: e.target.value }));
  const step = (dir) => {
    const opts = [...$('#fBucket').options].map((o) => o.value);
    const i = opts.indexOf(P().bucket || 'all');
    const j = Math.min(opts.length - 1, Math.max(0, i + dir));
    if (j !== i) dash.setParams({ bucket: opts[j] });
  };
  $('#fPrev').addEventListener('click', () => step(-1));
  $('#fNext').addEventListener('click', () => step(1));
  $('#fReset').addEventListener('click', () => {
    dash.resetParams();
    Object.assign(ui, { alQ: '', alLc: '', alT: '', alR: '', alLimit: 40, lcQ: '', lcF: 'all', paramQ: '', paramGroup: '' });
    $('#alSearch').value = ''; $('#lcSearch').value = ''; $('#paramSearch').value = '';
    setDefaults(rowsOf('scope_summary'));
  });

  const drawFilters = (summary) => {
    const p = P();
    const months = summary.filter((r) => r.grain === 'all').sort((a, b) => (a.month === 'all' ? 1 : b.month === 'all' ? -1 : a.month.localeCompare(b.month)));
    const ms = $('#fMonth');
    ms.replaceChildren(...months.map((r) => new Option(r.month === 'all' ? 'All months (compare)' : r.label, r.month)));
    ms.value = p.month || 'all';
    $$('#fGrain button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === (p.grain || 'day'))));
    const grain = p.grain || 'day';
    const bs = $('#fBucket');
    const buckets = grain === 'all' ? [] : summary.filter((r) => r.month === (p.month || 'all') && r.grain === grain).sort((a, b) => a.bucket.localeCompare(b.bucket));
    bs.replaceChildren(new Option(grain === 'all' ? 'Whole month' : `All ${grain === 'day' ? 'days' : 'weeks'} in view`, 'all'), ...buckets.map((r) => new Option(`${r.label} · ${r.audits}`, r.bucket)));
    bs.value = p.bucket || 'all';
    bs.disabled = grain === 'all';
    const i = bs.selectedIndex;
    $('#fPrev').disabled = grain === 'all' || i <= 0;
    $('#fNext').disabled = grain === 'all' || i >= bs.options.length - 1;
  };

  /* ---------- navigation ---------- */
  const PAGES = ['overview', 'parameters', 'groups', 'counsellors', 'alarms', 'coaching', 'plan'];
  const show = (page, link = true) => {
    if (!PAGES.includes(page)) return;
    ui.page = page;
    $$('.qa-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.page === page)));
    PAGES.forEach((id) => {
      const s = document.getElementById(id);
      const on = id === page;
      if (on && s.hidden) { s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); }
      s.hidden = !on;
    });
    if (link) dash.setLink(page);
    draw();
  };
  $('.qa-tabs').addEventListener('click', (e) => { const t = e.target.closest('.qa-tab'); if (t) show(t.dataset.page); });
  $('.qa-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = PAGES.indexOf(ui.page) + (e.key === 'ArrowRight' ? 1 : -1);
    if (PAGES[i]) { show(PAGES[i]); document.getElementById('tab-' + PAGES[i]).focus(); }
  });
  const goAlarms = (opts) => {
    Object.assign(ui, { alQ: '', alLc: '', alT: '', alR: '', alLimit: 40 }, opts);
    $('#alSearch').value = ui.alQ;
    show('alarms');
  };

  /* ---------- tooltip ---------- */
  const tip = (box) => {
    let t = box.querySelector('.qa-tip');
    if (!t) { t = el('div', 'qa-tip'); box.append(t); }
    return {
      show(ev, head, rows) {
        t.replaceChildren(el('div', 't-head', head), ...rows.map(([c, name, val]) => {
          const r = el('div', 't-row'); const l = el('span');
          if (c) { const sw = el('i', 'sw'); sw.style.background = c; l.append(sw); }
          l.append(name); r.append(l, el('b', null, val)); return r;
        }));
        const b = box.getBoundingClientRect();
        let x = ev.clientX - b.left + 12; const y = ev.clientY - b.top + 12;
        t.style.opacity = 1;
        if (x + t.offsetWidth > b.width) x = Math.max(0, ev.clientX - b.left - t.offsetWidth - 12);
        t.style.left = x + 'px'; t.style.top = Math.min(y, Math.max(0, b.height - t.offsetHeight)) + 'px';
      },
      hide() { t.style.opacity = 0; },
    };
  };
  const failed = (box) => { box.replaceChildren(el('div', 'qa-fail', 'Failed to load')); };
  const textWidth = (svg, strs, cls) => {
    const g = svg.append('g').attr('class', 'tick').attr('opacity', 0);
    let w = 0;
    strs.forEach((s) => { const n = g.append('text').attr('class', cls || null).text(s).node(); w = Math.max(w, n.getComputedTextLength()); });
    g.remove();
    return w;
  };

  /* ---------- KPI tiles ---------- */
  const drawKpis = (root, row, scope) => {
    $$('[data-k]', root).forEach((e) => {
      const k = e.dataset.k;
      e.classList.remove('dash-skeleton');
      mark(e, 'scope_summary', k, where('scope', scope));
      if (!row) { e.textContent = '—'; return; }
      const v = row[k];
      e.textContent = v == null ? '—' : /pct/.test(k) ? fPct(v) : k === 'avg_no' || k === 'avg_talk_min' ? f1(v) : typeof v === 'number' ? fInt(v) : v;
    });
    $$('[data-d]', root).forEach((e) => {
      const k = e.dataset.d;
      e.replaceChildren();
      if (!row || row[k] == null) { e.textContent = row && row.grain !== 'all' ? 'first period in view' : (row && row.month !== 'all' ? 'first month on record' : ''); e.removeAttribute('data-source'); return; }
      const v = row[k];
      const better = k === 'd_audits' ? null : v < 0;
      const txt = k === 'd_audits' ? d3.format('+,')(v) : /pct/.test(k) ? `${v > 0 ? '+' : ''}${f1(v * 100)} pts` : d3.format('+.1f')(v);
      const s = mark(el('span', better == null || Math.abs(v) < 1e-9 ? '' : better ? 'good' : 'bad', txt), 'scope_summary', k, where('scope', row.scope));
      e.append(s, ` vs ${row.prev_label}`);
    });
  };

  /* ---------- overview: trend ---------- */
  const drawTrend = (summary, scope) => {
    const box = $('#trendChart');
    const p = P();
    const grain = p.grain === 'week' ? 'week' : 'day';
    const monthKey = p.month || 'all';
    const data = summary.filter((r) => r.month === monthKey && r.grain === grain).sort((a, b) => a.bucket.localeCompare(b.bucket));
    $('#trendNote').textContent = `Bars: total parameters marked NO per ${grain} (left axis). Line: average NO per audit (right axis). Click a bar to focus that ${grain}; click it again to clear.`;
    box.replaceChildren();
    if (!data.length) { box.append(el('div', 'qa-empty', 'No audits in this period yet.')); return; }
    const W = box.clientWidth || 600; const H = 280;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const maxA = d3.max(data, (d) => d.total_no) || 1;
    const maxN = d3.max(data, (d) => d.avg_no) || 1;
    const y = d3.scaleLinear([0, maxA * 1.1], [H - 28, 12]).nice();
    const y2 = d3.scaleLinear([0, Math.max(maxN * 1.15, 5)], [H - 28, 12]).nice();
    const ml = textWidth(svg, y.ticks(5).map(fInt)) + 12;
    const mr = textWidth(svg, y2.ticks(5).map((v) => f1(v))) + 12;
    const x = d3.scaleBand(data.map((d) => d.bucket), [ml, W - mr]).padding(0.25);
    const lab = (b) => (grain === 'week' ? b.slice(5) : d3.utcFormat('%d %b')(new Date(b + 'T00:00:00Z')));
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((W - ml - mr) / 52))));
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - ml - mr)).tickFormat('')).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fInt).tickSize(0).tickPadding(8)).attr('font-size', null).attr('font-family', null).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', `translate(${W - mr},0)`).call(d3.axisRight(y2).ticks(5).tickFormat((v) => f1(v)).tickSize(0).tickPadding(8)).attr('font-size', null).attr('font-family', null).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickFormat((b, i) => (i % every ? '' : lab(b)))).attr('font-size', null).attr('font-family', null);
    const sel = p.bucket && p.bucket !== 'all' && p.grain === grain ? p.bucket : null;
    const bw = Math.min(32, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    const BAR = dash.colors[0]; const LINE = RAG.red;
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(d.bucket) + off).attr('width', bw).attr('rx', 3)
      .attr('y', (d) => y(d.total_no)).attr('height', (d) => Math.max(0, y(0) - y(d.total_no)))
      .attr('fill', BAR).attr('opacity', (d) => (sel && d.bucket !== sel ? 0.28 : 0.85));
    if (data.length <= 16) svg.append('g').selectAll('text').data(data).join('text').attr('class', 'qa-axis-label').attr('text-anchor', 'middle')
      .attr('x', (d) => x(d.bucket) + x.bandwidth() / 2).attr('y', (d) => y(d.total_no) - 4).text((d) => fInt(d.total_no));
    const line = d3.line().x((d) => x(d.bucket) + x.bandwidth() / 2).y((d) => y2(d.avg_no));
    svg.append('path').datum(data).attr('fill', 'none').attr('stroke', LINE).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('d', line);
    svg.append('g').selectAll('circle').data(data).join('circle').attr('r', 3).attr('fill', LINE).attr('cx', (d) => x(d.bucket) + x.bandwidth() / 2).attr('cy', (d) => y2(d.avg_no));
    svg.append('text').attr('class', 'qa-axis-label').attr('x', ml).attr('y', 8).text('Total NO');
    svg.append('text').attr('class', 'qa-axis-label').attr('x', W - mr).attr('y', 8).attr('text-anchor', 'end').text('Avg NO / audit');
    const tt = tip(box);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('class', 'qa-clickable')
      .attr('x', (d) => x(d.bucket)).attr('width', x.bandwidth()).attr('y', 12).attr('height', H - 40).attr('fill', 'transparent')
      .on('mousemove', (ev, d) => tt.show(ev, d.label, [[BAR, 'Total NO marked', fInt(d.total_no)], [LINE, 'Avg NO / audit', f1(d.avg_no)], [null, 'Audits', fInt(d.audits)], [null, 'RED / AMBER', `${fInt(d.red)} / ${fInt(d.amber)}`]]))
      .on('mouseleave', () => tt.hide())
      .on('click', (ev, d) => dash.setParams(sel === d.bucket ? { bucket: 'all' } : { grain, bucket: d.bucket }));
    const lg = $('#trendLegend');
    lg.replaceChildren((() => { const s = el('span'); const i = el('i'); i.style.background = BAR; s.append(i, 'Total NO marked'); return s; })(), (() => { const s = el('span'); const i = el('i', 'line'); i.style.background = LINE; s.append(i, 'Avg NO per audit'); return s; })());
  };

  /* ---------- overview: RAG donut ---------- */
  const drawRag = (row, scope) => {
    const box = $('#ragChart');
    box.replaceChildren();
    if (!row) { box.append(el('div', 'qa-empty', 'No audits in this period.')); return; }
    const keys = ['red', 'amber', 'orange', 'green'];
    const size = Math.min(200, Math.max(150, box.clientWidth * 0.42));
    const svg = d3.select(box).append('svg').attr('width', size).attr('height', size).attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
    const arcs = d3.pie().sort(null).value((k) => row[k])(keys);
    const arc = d3.arc().innerRadius(size * 0.3).outerRadius(size / 2 - 2).padAngle(0.012).cornerRadius(3);
    const tt = tip(box);
    svg.selectAll('path').data(arcs).join('path').attr('class', 'qa-clickable').attr('d', arc).attr('fill', (d) => RAG[d.data])
      .on('mousemove', (ev, d) => tt.show(ev, `${RAG_NAME[d.data]} (${RAG_DEF[d.data]})`, [[RAG[d.data], 'Audits', `${fInt(row[d.data])} · ${fPct(row[d.data] / row.audits)}`]]))
      .on('mouseleave', () => tt.hide()).on('click', (ev, d) => goAlarms({ alR: d.data }));
    const c = svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').style('font-family', 'var(--font-anthropic-serif)').style('font-size', '26px').attr('fill', 'var(--color-fg)').text(fInt(row.audits));
    mark(c.node(), 'scope_summary', 'audits', where('scope', scope));
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.4em').attr('class', 'qa-axis-label').text('audits');
    const ul = el('ul');
    keys.forEach((k) => {
      const li = el('li'); const i = el('i'); i.style.background = RAG[k];
      const name = el('span', null, `${RAG_NAME[k]} · ${RAG_DEF[k]}`);
      const v = mark(el('b', null, `${fInt(row[k])} (${fPct(row[k] / row.audits)})`), 'scope_summary', k, where('scope', scope));
      li.append(i, name, v); li.title = `See ${RAG_NAME[k]} cases`;
      li.addEventListener('click', () => goAlarms({ alR: k }));
      ul.append(li);
    });
    box.append(ul);
  };

  const meter = (v, color) => {
    const m = el('div', 'qa-meter'); const t = el('div', 'track'); const f = el('div', 'fill');
    f.style.width = `${Math.round(v * 100)}%`; f.style.background = color || 'var(--color-fg)';
    t.append(f); m.append(t, el('span', null, fPct(v))); return m;
  };
  const pctColor = (v) => (v >= 0.75 ? RAG.red : v >= 0.5 ? RAG.orange : v >= 0.25 ? RAG.amber : RAG.green);

  const drawTop5 = (params) => {
    const tb = $('#top5 tbody');
    tb.replaceChildren(...params.slice(0, 5).map((r) => {
      const tr = el('tr', 'qa-clickable'); tr.dataset.key = r.row_id; tr.title = r.param;
      tr.append(el('td', 'wrap', short(r.param, 70)), el('td', null, r.group), el('td', 'num', fInt(r.no)));
      const td = el('td'); td.append(meter(r.pct_no, pctColor(r.pct_no))); tr.append(td);
      tr.addEventListener('click', () => { ui.paramQ = ''; show('parameters'); });
      return tr;
    }));
    if (!params.length) tb.append((() => { const tr = el('tr'); const td = el('td', 'qa-empty', 'No audits in this period.'); td.colSpan = 4; tr.append(td); return tr; })());
  };
  const drawGroupsMini = (groups) => {
    const tb = $('#groupsMini tbody');
    tb.replaceChildren(...groups.map((r) => {
      const tr = el('tr', 'qa-clickable'); tr.dataset.key = r.row_id;
      tr.append(el('td', null, r.group), el('td', 'num', fInt(r.no)));
      const td = el('td'); td.append(meter(r.pct_no, pctColor(r.pct_no))); tr.append(td);
      tr.addEventListener('click', () => { ui.openGroups.add(r.group); show('groups'); });
      return tr;
    }));
  };

  /* ---------- parameters ---------- */
  $('#paramMetric').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.paramMetric = b.dataset.m; $$('#paramMetric button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  $('#paramSearch').addEventListener('input', (e) => { ui.paramQ = e.target.value.toLowerCase(); draw(); });
  $('#paramGroup').addEventListener('change', (e) => { ui.paramGroup = e.target.value; draw(); });
  $('#paramTable thead').addEventListener('click', (e) => { const b = e.target.closest('button[data-sort]'); if (!b) return; const k = b.dataset.sort; ui.paramSort = [k, ui.paramSort[0] === k ? -ui.paramSort[1] : (['param', 'group', 'cause', 'rank'].includes(k) ? 1 : -1)]; draw(); });

  const drawParamChart = (params) => {
    const box = $('#paramChart');
    box.replaceChildren();
    if (!params.length) { box.append(el('div', 'qa-empty', 'No audits in this period.')); return; }
    const m = ui.paramMetric;
    const data = [...params].sort((a, b) => b[m] - a[m] || b.no - a.no);
    const W = box.clientWidth || 600; const rowH = 22; const H = data.length * rowH + 30;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const maxLab = W < 520 ? 26 : 46;
    const labs = data.map((d) => short(d.param, maxLab));
    const ml = Math.min(W * 0.48, textWidth(svg, labs) + 12);
    const fmt = m === 'no' ? fInt : fPct;
    const mr = textWidth(svg, data.map((d) => fmt(d[m]))) + 10;
    const x = d3.scaleLinear([0, m === 'no' ? d3.max(data, (d) => d.no) || 1 : 1], [ml, W - mr]);
    const y = d3.scaleBand(data.map((d) => d.param), [4, H - 26]).padding(0.28);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - 30)).tickFormat('')).call((g) => g.select('.domain').remove());
    svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(5).tickFormat(fmt).tickSize(0).tickPadding(6)).attr('font-size', null).attr('font-family', null).call((g) => g.select('.domain').remove());
    const tt = tip(box);
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('class', 'qa-clickable')
      .on('mousemove', (ev, d) => tt.show(ev, d.param, [[null, 'Group', d.group], [null, 'NO', fInt(d.no)], [null, 'YES', fInt(d.yes)], [null, 'N/A', fInt(d.na)], [null, '% NO of applicable', fPct(d.pct_no)], [null, 'Root cause', d.cause]]))
      .on('mouseleave', () => tt.hide())
      .on('click', (ev, d) => { ui.paramQ = d.param.toLowerCase(); $('#paramSearch').value = d.param; draw(); $('#paramTableCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    g.append('text').attr('x', ml - 8).attr('y', (d) => y(d.param) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('class', 'qa-axis-label').style('fill', 'var(--color-fg)').text((d) => short(d.param, maxLab));
    g.append('rect').attr('x', ml).attr('y', (d) => y(d.param)).attr('height', y.bandwidth()).attr('rx', 3)
      .attr('width', (d) => Math.max(0, x(d[m]) - ml)).attr('fill', (d) => (d.critical ? RAG.red : dash.colors[0]));
    g.append('text').attr('x', (d) => x(d[m]) + 5).attr('y', (d) => y(d.param) + y.bandwidth() / 2).attr('dy', '0.35em').attr('class', 'qa-axis-label').text((d) => fmt(d[m]));
  };

  const drawParamTable = (params, groups) => {
    const gs = $('#paramGroup');
    const cur = ui.paramGroup;
    gs.replaceChildren(new Option('All groups', ''), ...groups.map((g) => new Option(g.group, g.group)));
    gs.value = cur;
    const [k, dir] = ui.paramSort;
    const rows = params.filter((r) => (!ui.paramQ || r.param.toLowerCase().includes(ui.paramQ)) && (!ui.paramGroup || r.group === ui.paramGroup))
      .sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * dir);
    $$('#paramTable th').forEach((th) => { const b = th.querySelector('button'); th.setAttribute('aria-sort', b && b.dataset.sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    $('#paramTable tbody').replaceChildren(...rows.map((r) => {
      const tr = el('tr'); tr.dataset.key = r.row_id;
      const name = el('td', 'wrap', r.param);
      if (r.critical) name.append(' ', el('span', 'qa-pill crit', 'critical'));
      const td = el('td'); td.append(meter(r.pct_no, pctColor(r.pct_no)));
      tr.append(el('td', 'num', String(r.rank)), name, el('td', null, r.group), el('td', 'num', fInt(r.no)), el('td', 'num', fInt(r.yes)), el('td', 'num', fInt(r.na)), el('td', 'num', fInt(r.applicable)), td, el('td', null, r.cause));
      return tr;
    }));
  };

  /* ---------- groups ---------- */
  const drawGroups = (groups, params, scope) => {
    const box = $('#groupBlocks');
    box.replaceChildren();
    if (!groups.length) { box.append(el('div', 'qa-empty', 'No audits in this period.')); return; }
    groups.forEach((g) => {
      const wrap = el('div', 'qa-group'); wrap.id = 'group-' + g.group.replace(/[^a-z]+/gi, '-').toLowerCase();
      const btn = el('button'); btn.setAttribute('aria-expanded', String(ui.openGroups.has(g.group)));
      const name = el('span', 'g-name', g.group); name.append(el('small', null, `${g.sub_params} sub-parameters`));
      const num = el('span', 'g-num');
      num.append(mark(el('b', null, fInt(g.no)), 'scope_groups', 'no', `${where('scope', scope)}&${where('group', g.group)}`), ' NO · ', mark(el('b', null, fPct(g.pct_no)), 'scope_groups', 'pct_no', `${where('scope', scope)}&${where('group', g.group)}`), ' of applicable');
      btn.append(name, meter(g.pct_no, pctColor(g.pct_no)), num);
      const body = el('div'); body.hidden = !ui.openGroups.has(g.group);
      btn.addEventListener('click', () => { if (ui.openGroups.has(g.group)) ui.openGroups.delete(g.group); else ui.openGroups.add(g.group); body.hidden = !body.hidden; btn.setAttribute('aria-expanded', String(!body.hidden)); });
      const t = mark(el('table'), 'scope_params'); t.dataset.rowKey = 'row_id';
      const th = el('thead'); const hr = el('tr');
      [['param', 'Sub-parameter'], ['no', 'NO'], ['yes', 'YES'], ['na', 'N/A'], ['pct_no', '% NO of applicable'], ['cause', 'Root cause']].forEach(([f, l]) => { const c = el('th', ['no', 'yes', 'na'].includes(f) ? 'num' : '', l); c.dataset.field = f; hr.append(c); });
      th.append(hr);
      const tb = el('tbody');
      params.filter((p) => p.group === g.group).forEach((r) => {
        const tr = el('tr'); tr.dataset.key = r.row_id;
        const td = el('td'); td.append(meter(r.pct_no, pctColor(r.pct_no)));
        tr.append(el('td', 'wrap', r.param), el('td', 'num', fInt(r.no)), el('td', 'num', fInt(r.yes)), el('td', 'num', fInt(r.na)), td, el('td', null, r.cause));
        tb.append(tr);
      });
      t.append(th, tb); body.append(t);
      wrap.append(btn, body); box.append(wrap);
    });
  };

  /* ---------- counsellors ---------- */
  $('#lcSearch').addEventListener('input', (e) => { ui.lcQ = e.target.value.toLowerCase(); draw(); });
  $('#lcChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.lcF = b.dataset.f; draw(); });
  $('#lcTable thead').addEventListener('click', (e) => { const b = e.target.closest('button[data-sort]'); if (!b) return; const k = b.dataset.sort; ui.lcSort = [k, ui.lcSort[0] === k ? -ui.lcSort[1] : (['lc_owner', 'manager', 'worst_param'].includes(k) ? 1 : -1)]; draw(); });
  const ragBar = (r) => {
    const b = el('div', 'qa-ragbar'); b.title = ['red', 'amber', 'orange', 'green'].map((k) => `${RAG_NAME[k]} ${r[k]}`).join(' · ');
    ['red', 'amber', 'orange', 'green'].forEach((k) => { if (!r[k]) return; const s = el('span'); s.style.background = RAG[k]; s.style.flex = r[k]; b.append(s); });
    return b;
  };
  const drawCounsellors = (lcs) => {
    $$('#lcChips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === ui.lcF)));
    const [k, dir] = ui.lcSort;
    const rows = lcs.filter((r) => (!ui.lcQ || `${r.lc_owner} ${r.manager}`.toLowerCase().includes(ui.lcQ)) && (ui.lcF === 'all' || (ui.lcF === 'esc' ? r.escalate : r.red > 0)))
      .sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * dir || b.audits - a.audits);
    $$('#lcTable th').forEach((th) => { const b = th.querySelector('button'); th.setAttribute('aria-sort', b && b.dataset.sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    const tb = $('#lcTable tbody');
    tb.replaceChildren(...rows.map((r) => {
      const tr = el('tr', 'qa-clickable'); tr.dataset.key = r.row_id; tr.title = `See ${r.lc_owner}’s flagged cases`;
      const name = el('td', null, r.lc_owner);
      if (r.escalate) name.append(' ', el('span', 'qa-pill esc', 'escalate'));
      const mix = el('td'); mix.append(ragBar(r));
      tr.append(name, el('td', null, r.manager || '—'), el('td', 'num', fInt(r.audits)), el('td', 'num', fInt(r.total_no)), el('td', 'num', f1(r.avg_no)), mix, el('td', 'num', fInt(r.fatal)), el('td', 'num', fInt(r.flagged)), el('td', 'wrap', r.worst_param));
      tr.addEventListener('click', () => goAlarms({ alLc: r.lc_owner }));
      return tr;
    }));
    if (!rows.length) { const tr = el('tr'); const td = el('td', 'qa-empty', 'No counsellors match.'); td.colSpan = 9; tr.append(td); tb.append(tr); }
  };

  /* ---------- alarms ---------- */
  $('#alSearch').addEventListener('input', (e) => { ui.alQ = e.target.value.toLowerCase(); ui.alLimit = 40; draw(); });
  $('#alLc').addEventListener('change', (e) => { ui.alLc = e.target.value; ui.alLimit = 40; draw(); });
  $('#alTrig').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.alT = b.dataset.t; ui.alLimit = 40; draw(); });
  $('#alRag').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.alR = b.dataset.r; ui.alLimit = 40; draw(); });
  $('#alMore').addEventListener('click', () => { ui.alLimit += 60; draw(); });
  const drawAlarms = (audits, scope) => {
    $$('#alTrig button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === ui.alT)));
    $$('#alRag button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === ui.alR)));
    const inScope = audits.filter((a) => a.flagged && a.scopes.includes(scope));
    const names = [...new Set(inScope.map((a) => a.lc_owner))].sort();
    const ls = $('#alLc');
    ls.replaceChildren(new Option('All counsellors', ''), ...names.map((n) => new Option(n, n)));
    if (ui.alLc && !names.includes(ui.alLc)) ls.append(new Option(ui.alLc, ui.alLc));
    ls.value = ui.alLc;
    const rows = inScope.filter((a) => (!ui.alLc || a.lc_owner === ui.alLc) && (!ui.alT || a.triggers.includes(ui.alT)) && (!ui.alR || a.rag === ui.alR)
      && (!ui.alQ || [a.lc_owner, a.reg_number, a.course_enrolled, a.remarks, a.qa_name, a.manager, a.manager_remark].join(' ').toLowerCase().includes(ui.alQ)))
      .sort((a, b) => (b.severity === 'high') - (a.severity === 'high') || b.reasons.length - a.reasons.length || b.no - a.no || b.date.localeCompare(a.date));
    $('#alShown').textContent = `${fInt(rows.length)} case${rows.length === 1 ? '' : 's'} shown`;
    const box = $('#alarmList');
    box.replaceChildren(...rows.slice(0, ui.alLimit).map((a) => {
      const w = where('audit_id', a.audit_id);
      const c = el('article', 'qa-alarm' + (a.severity === 'high' ? '' : ' medium'));
      const top = el('div', 'a-top'); const left = el('div');
      const who = el('div', 'a-who'); who.append(mark(el('span', null, a.lc_owner), 'audits_scored', 'lc_owner', w), el('small', null, ` — reg #${a.reg_number || '—'}`));
      const meta = el('div', 'a-meta');
      const tt = a.talk_time_sec == null ? '' : ` · TT ${Math.floor(a.talk_time_sec / 60)}:${String(a.talk_time_sec % 60).padStart(2, '0')}`;
      meta.append(`Enrolled ${fmtDate(a.date)}${a.audited_date ? ` · audited ${fmtDate(a.audited_date)}` : ''} · QA: ${a.qa_name || '—'}${a.manager ? ` · Manager: ${a.manager}` : ''}${tt} · ${a.course_enrolled || '—'}${a.course_type ? ` (${a.course_type})` : ''} · NO: `, mark(el('b', 'n', String(a.no)), 'audits_scored', 'no', w), ` of ${a.applicable} applicable · tab ${a.tab} row ${a.sheet_row}`);
      left.append(who, meta);
      const pills = el('span');
      if (a.fatal) pills.append(mark(el('span', 'qa-pill esc', 'FATAL'), 'audits_scored', 'fatal', w), ' ');
      pills.append(mark(el('span', 'qa-pill ' + a.rag, RAG_NAME[a.rag]), 'audits_scored', 'rag', w));
      top.append(left, pills);
      const ul = el('ul'); a.reasons.forEach((r) => ul.append(el('li', null, r)));
      c.append(top, ul);
      if (a.remarks) c.append(el('div', 'a-remark', `QA remark: “${a.remarks}”`));
      if (a.manager_remark) c.append(el('div', 'a-remark', `Manager remark: “${a.manager_remark}”`));
      return c;
    }));
    if (!rows.length) box.append(el('div', 'qa-empty', inScope.length ? 'No flagged cases match these filters.' : 'No alarming cases in this period.'));
    $('#alMore').hidden = rows.length <= ui.alLimit;
  };

  /* ---------- coaching ---------- */
  const drawPareto = (params, row) => {
    const box = $('#paretoChart');
    box.replaceChildren();
    const data = params.filter((p) => p.no > 0);
    if (!data.length) { box.append(el('div', 'qa-empty', 'No misses in this period.')); return; }
    const cut = data.findIndex((d) => d.cum_share >= 0.8);
    const vital = cut + 1;
    $('#paretoNote').textContent = `${vital} of ${data.length} missed parameters account for 80% of all ${fInt(row ? row.total_no : 0)} NOs — concentrate training here first.`;
    const W = box.clientWidth || 600; const rowH = 22; const H = data.length * rowH + 34;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const maxLab = W < 520 ? 24 : 44;
    const ml = Math.min(W * 0.45, textWidth(svg, data.map((d) => short(d.param, maxLab))) + 12);
    const mr = textWidth(svg, ['cum 100%']) + 64;
    const x = d3.scaleLinear([0, d3.max(data, (d) => d.no)], [ml, W - mr]);
    const y = d3.scaleBand(data.map((d) => d.param), [18, H - 12]).padding(0.28);
    svg.append('text').attr('class', 'qa-axis-label').attr('x', W).attr('y', 10).attr('text-anchor', 'end').text('NO · running share');
    const tt = tip(box);
    const g = svg.append('g').selectAll('g').data(data).join('g')
      .on('mousemove', (ev, d) => tt.show(ev, d.param, [[null, 'NO', fInt(d.no)], [null, 'Share of all NOs', fPct(d.share_of_no)], [null, 'Running share', fPct(d.cum_share)], [null, 'Root cause', d.cause]]))
      .on('mouseleave', () => tt.hide());
    g.append('text').attr('x', ml - 8).attr('y', (d) => y(d.param) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('class', 'qa-axis-label').style('fill', (d, i) => (i < vital ? 'var(--color-fg)' : 'var(--color-fg-muted)')).text((d) => short(d.param, maxLab));
    g.append('rect').attr('x', ml).attr('y', (d) => y(d.param)).attr('height', y.bandwidth()).attr('rx', 3).attr('width', (d) => Math.max(0, x(d.no) - ml))
      .attr('fill', (d, i) => (i < vital ? dash.colors[0] : 'var(--cds-chart-muted)'));
    g.append('text').attr('x', (d) => x(d.no) + 5).attr('y', (d) => y(d.param) + y.bandwidth() / 2).attr('dy', '0.35em').attr('class', 'qa-axis-label')
      .text((d) => `${fInt(d.no)} · ${fPct(d.cum_share)}`);
    const ly = y(data[cut].param) + y.bandwidth() + (y.step() - y.bandwidth()) / 2;
    if (cut < data.length - 1) {
      svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', ly).attr('y2', ly).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', W).attr('y', ly - 4).attr('text-anchor', 'end').attr('class', 'qa-axis-label').style('fill', RAG.red).text('80% of NOs above this line');
    }
  };
  const drawCauses = (causes) => {
    $('#causeTable tbody').replaceChildren(...causes.map((r) => {
      const tr = el('tr'); tr.dataset.key = r.row_id;
      const td = el('td'); td.append(meter(r.share, dash.colors[0]));
      tr.append(el('td', null, r.cause), el('td', 'num', fInt(r.no)), td, el('td', 'wrap', r.params));
      return tr;
    }));
  };
  const drawCoach = (lcs, scope) => {
    const box = $('#coachList');
    const top = lcs.filter((r) => r.worst_count > 0).slice(0, 6);
    box.replaceChildren(...top.map((r) => {
      const w = where('row_id', r.row_id);
      const c = el('div', 'qa-coachcard');
      const n = el('div', 'c-name'); n.append(mark(el('span', null, r.lc_owner), 'scope_counsellors', 'lc_owner', w));
      const st = el('small'); st.append(mark(el('span', null, fInt(r.audits)), 'scope_counsellors', 'audits', w), ' audits · avg ', mark(el('span', null, f1(r.avg_no)), 'scope_counsellors', 'avg_no', w), ' NO');
      n.append(st);
      const miss = el('div', 'c-miss'); miss.append('Most-missed: “', mark(el('span', null, r.worst_param), 'scope_counsellors', 'worst_param', w), `” (${r.worst_count}×)`);
      const t = el('div', 'c-tip'); t.append(el('b', null, `${r.cause.toUpperCase()} — SUGGESTED COACHING ACTION`), r.tip);
      c.append(n, miss, t);
      return c;
    }));
    if (!top.length) box.append(el('div', 'qa-empty', 'No counsellor misses in this period.'));
  };

  /* ---------- action plan ---------- */
  const drawPlan = (row, params, lcs, causes, scope) => {
    const box = $('#goalCards');
    box.replaceChildren();
    if (!row) { box.append(el('div', 'qa-empty', 'No audits in this period.')); return; }
    const sw = where('scope', scope);
    const num = (src, field, wh, text) => mark(el('b', 'n', text), src, field, wh);
    const sum = (field, text) => num('scope_summary', field, sw, text);
    const goal = (title, urgent, descParts, items) => {
      const g = el('div', 'qa-goal' + (urgent ? ' urgent' : ''));
      const h = el('h3', null, title); if (urgent) h.append(el('span', 'qa-pill red', 'priority'));
      const p = el('p'); p.append(...descParts);
      g.append(h, p);
      if (items.length) { const ul = el('ul'); items.forEach((parts) => { const li = el('li'); li.append(...parts); ul.append(li); }); g.append(ul); }
      box.append(g);
    };
    const pw = (r) => `${sw}&${where('param', r.param)}`;
    goal('Goal 1 — RAG triage & priority audit review', false,
      [sum('red', fInt(row.red)), ' RED + ', sum('amber', fInt(row.amber)), ' AMBER audits (', sum('risk_pct', fPct(row.risk_pct)), ' of ', sum('audits', fInt(row.audits)), ` audits, ${row.label}) go to QA leads first, ahead of routine sampling.`],
      [['QA leads review all RED-rated calls (', sum('red', fInt(row.red)), ') and confirm root-cause tags within 48 hrs.'],
        ['Cross-check AMBER cases (', sum('amber', fInt(row.amber)), ') for repeat counsellor names; escalate per Goal 5.']]);
    const by = (cause, n) => params.filter((r) => r.cause === cause && r.no > 0).slice(0, n);
    const cz = (c) => causes.find((r) => r.cause === c);
    const comp = by('Compliance-disclosure gap', 3);
    if (comp.length) {
      const c = cz('Compliance-disclosure gap');
      goal('Goal 2 — Compliance-disclosure gap closure', true,
        [num('scope_causes', 'no', `${sw}&${where('cause', c.cause)}`, fInt(c.no)), ' NOs (', num('scope_causes', 'share', `${sw}&${where('cause', c.cause)}`, fPct(c.share)), ' of all misses) sit in this bucket — the highest mis-selling / dispute risk.'],
        comp.map((r) => [`Mandate scripted disclosure of “${short(r.param, 60)}” — missed in `, num('scope_params', 'pct_no', pw(r), fPct(r.pct_no)), ' of applicable calls (', num('scope_params', 'no', pw(r), fInt(r.no)), ` audits).${r.critical ? ' Hard-flag any skip in BOT 2.' : ''}`]));
    }
    const know = by('Knowledge gap', 3);
    if (know.length) {
      const c = cz('Knowledge gap');
      goal('Goal 3 — Knowledge-gap retraining', false,
        [num('scope_causes', 'no', `${sw}&${where('cause', c.cause)}`, fInt(c.no)), ' NOs come from counsellors not knowing the right information, not from script or discipline.'],
        know.map((r) => [`Refresh training on “${short(r.param, 60)}” — `, num('scope_params', 'pct_no', pw(r), fPct(r.pct_no)), ' miss rate (', num('scope_params', 'no', pw(r), fInt(r.no)), ' audits).']));
    }
    const sh = [...by('Script gap', 2), ...by('Habit gap', 2)];
    if (sh.length) {
      goal('Goal 4 — Script-gap & habit coaching', false, ['Fixes here are checklist / discipline changes, not new training content.'],
        sh.map((r) => [`“${short(r.param, 60)}” (${r.cause}) — `, num('scope_params', 'pct_no', pw(r), fPct(r.pct_no)), ' miss (', num('scope_params', 'no', pw(r), fInt(r.no)), ` audits). ${r.cause === 'Habit gap' ? 'Needs 1:1 call calibration, not a training deck.' : 'Add as a mandatory scripted checkpoint.'}`]));
    }
    const esc = lcs.filter((r) => r.escalate);
    goal('Goal 5 — Escalation per fatal / defaulter policy', true,
      esc.length ? [sum('escalations', fInt(row.escalations)), ' counsellor(s) showing repeat RED ratings in this period.'] : ['No repeat-RED counsellors in this period — monitor as new audits land.'],
      esc.map((r) => { const w = where('row_id', r.row_id); return [mark(el('b', null, r.lc_owner), 'scope_counsellors', 'lc_owner', w), r.manager ? ` (${r.manager})` : '', ' — ', num('scope_counsellors', 'red', w, fInt(r.red)), ' RED / ', num('scope_counsellors', 'audits', w, fInt(r.audits)), ' audits', ...(r.fatal ? [', ', num('scope_counsellors', 'fatal', w, fInt(r.fatal)), ' FATAL'] : []), '. Warning 1 → Warning 2 → RTHR (refer to HR) if the next audit repeats.']; }));
    goal('Goal 6 — Tracking improvement', false,
      ['Baseline for this period: ', sum('avg_no', f1(row.avg_no)), ' NO per audit', ...(row.d_avg_no == null ? ['.'] : [' (', sum('d_avg_no', d3.format('+.1f')(row.d_avg_no)), ` vs ${row.prev_label}).`]), ' Re-check after each D-1 upload and log the reading in the POA workbook at each formal review.'], []);
  };

  /* ---------- header ---------- */
  const drawHeader = (summary, row, scope) => {
    const all = summary.find((r) => r.scope === 'all|all|all');
    const latest = $('#latest');
    latest.textContent = all ? fmtDate(all.latest_date) : '—';
    const badge = $('#d1badge');
    badge.classList.remove('dash-skeleton', 'ok', 'warn');
    if (all) {
      const now = new Date(); const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      const last = all.latest_audited || all.latest_date;
      const ok = last >= yIso;
      badge.classList.add(ok ? 'ok' : 'warn');
      badge.textContent = ok ? 'D-1 audits uploaded' : `Awaiting D-1 upload (last audited ${fmtDate(last)})`;
      const la = $('#latestAudited');
      la.textContent = all.latest_audited ? fmtDate(all.latest_audited) : '—';
    }
    const take = $('#takeaway');
    take.replaceChildren();
    if (!row) { take.textContent = 'No audits in the selected period.'; return; }
    const w = where('scope', scope);
    take.append(`${row.label}: `, mark(el('b', 'n', fInt(row.audits)), 'scope_summary', 'audits', w), ' audits, ',
      mark(el('b', 'n', fPct(row.risk_pct)), 'scope_summary', 'risk_pct', w), ' at RED/AMBER, ',
      mark(el('b', 'n', f1(row.avg_no)), 'scope_summary', 'avg_no', w), ' NO per audit. Biggest driver: ',
      mark(el('b', null, row.top_cause), 'scope_summary', 'top_cause', w), '.', ...(row.fatal ? [' ', mark(el('b', 'n', fInt(row.fatal)), 'scope_summary', 'fatal', w), ' call(s) marked FATAL/Concerning.'] : []));
    const ac = $('#alarmCount'); ac.textContent = fInt(row.flagged); ac.dataset.where = w;
  };

  /* ---------- orchestration ---------- */
  const draw = () => {
    const st = S('scope_summary');
    const summary = rowsOf('scope_summary');
    if (st.status !== 'ok') {
      if (st.status === 'error' || st.status === 'connect' || st.status === 'declined' || S('audits').status === 'error') {
        ['#trendChart', '#ragChart', '#paramChart', '#paretoChart', '#alarmList', '#groupBlocks', '#goalCards', '#coachList'].forEach((s) => failed($(s)));
        $('#takeaway').textContent = S('audits').status === 'connect' ? 'Connect Google Drive to load the audit sheet.' : 'The audit sheet could not be read.';
      }
      return;
    }
    if (!defaultsApplied) { defaultsApplied = true; if (!P().month) { setDefaults(summary); return; } }
    const scope = scopeKey();
    const row = summary.find((r) => r.scope === scope) || null;
    drawFilters(summary);
    drawHeader(summary, row, scope);
    $('#fNote').textContent = row ? `${row.label} · ${fInt(row.audits)} audits · ${fInt(row.counsellors)} counsellors · ${fInt(row.qas)} QAs` : 'No audits in this period';
    const params = rowsOf('scope_params').filter((r) => r.scope === scope);
    const groups = rowsOf('scope_groups').filter((r) => r.scope === scope);
    const lcs = rowsOf('scope_counsellors').filter((r) => r.scope === scope);
    const causes = rowsOf('scope_causes').filter((r) => r.scope === scope);
    const page = document.getElementById(ui.page);
    if (ui.page === 'overview') { drawKpis(page, row, scope); drawTrend(summary, scope); drawRag(row, scope); drawTop5(params); drawGroupsMini(groups); }
    if (ui.page === 'parameters') { drawParamChart(params); drawParamTable(params, groups); }
    if (ui.page === 'groups') drawGroups(groups, params, scope);
    if (ui.page === 'counsellors') drawCounsellors(lcs);
    if (ui.page === 'alarms') { drawKpis(page, row, scope); drawAlarms(rowsOf('audits_scored'), scope); }
    if (ui.page === 'coaching') { drawPareto(params, row); drawCauses(causes); drawCoach(lcs, scope); }
    if (ui.page === 'plan') { drawKpis(page, row, scope); drawPlan(row, params, lcs, causes, scope); }
  };

  dash.onData(draw);
  const first = location.hash.slice(1);
  if (PAGES.includes(first)) show(first, false);
})();

