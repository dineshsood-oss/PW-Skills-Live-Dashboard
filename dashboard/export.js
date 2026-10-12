/* Download and Copy buttons: charts as PNG / clipboard image, tables as CSV / clipboard table (exactly the rows shown). */
(() => {
  const CHARTS = { trendCard: '#trendChart', ragCard: '#ragChart', paramChartCard: '#paramChart', paretoCard: '#paretoChart' };
  const TABLES = ['top5Card', 'groupsMiniCard', 'paramTableCard', 'counsellorCard', 'causeCard'];
  const XICON = {
    dl: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>',
    copy: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path></svg>',
  };
  const titleOf = (card) => { const h = card.querySelector('h2'); return (h.firstChild ? h.firstChild.textContent : h.textContent).trim(); };
  const period = () => { const n = document.getElementById('fNote'); return (n && n.textContent.split(' · ')[0]) || ''; };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export';
  const fileName = (card, ext) => `enrolled-audit_${slug(titleOf(card))}_${slug(period() || 'all')}.${ext}`;
  let downloadsNs;
  const getDownloads = () => (downloadsNs ??= (window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null)).catch(() => null));
  const say = (card, text, bad) => {
    const m = card.querySelector('.qa-xmsg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    clearTimeout(m._t);
    m._t = setTimeout(() => { m.textContent = ''; }, 4000);
  };
  const saveFile = async (card, filename, data) => {
    const dl = await getDownloads();
    if (!dl) { say(card, 'Downloads aren’t available in this view. Use Copy instead.', true); return; }
    try {
      await dl.save({ filename, data });
      say(card, 'Saved ' + filename);
    } catch (e) {
      const code = e && e.code;
      if (code === 'declined') say(card, 'Download cancelled');
      else if (code === 'rate_limited') say(card, 'Another download is waiting for your answer', true);
      else say(card, 'This download isn’t available here. Use Copy instead.', true);
    }
  };
  const copyBlobs = async (card, items, okText) => {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem(items)]);
      say(card, okText);
    } catch (e) {
      say(card, 'Copying isn’t allowed in this view. Use Download instead.', true);
    }
  };

  // Charts: redraw the SVG with resolved colours and fonts, then compose a PNG with title, period and legend.
  const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility'];
  const svgImage = (svg) => new Promise((resolve, reject) => {
    const vb = svg.viewBox.baseVal;
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((node, i) => {
      const cs = getComputedStyle(node);
      for (const pr of SVG_PROPS) { const v = cs.getPropertyValue(pr); if (v) dst[i].style.setProperty(pr, v); }
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vb.width);
    clone.setAttribute('height', vb.height);
    clone.style.removeProperty('max-width');
    const img = new Image();
    img.onload = () => resolve({ img, w: vb.width, h: vb.height });
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  });
  const legendOf = (card) => [
    ...[...card.querySelectorAll('.qa-legend > span')].map((s) => ({ i: s.querySelector('i'), text: s.textContent.trim() })),
    ...[...card.querySelectorAll('.qa-donut li')].map((li) => ({ i: li.querySelector('i'), text: [...li.children].filter((c) => c.tagName !== 'I').map((c) => c.textContent).join('  ') })),
  ].filter((x) => x.i).map((x) => ({ color: getComputedStyle(x.i).backgroundColor, text: x.text, line: x.i.classList.contains('line') }));
  const chartPng = async (card, sel) => {
    const svg = card.querySelector(`${sel} svg`);
    if (!svg) throw new Error('empty');
    const { img, w, h } = await svgImage(svg);
    const font = getComputedStyle(card).fontFamily;
    const legend = legendOf(card);
    const pad = 28, scale = 2, W = Math.max(w + pad * 2, 560), top = 96, foot = 34;
    const c = document.createElement('canvas');
    const probe = c.getContext('2d');
    probe.font = `12px ${font}`;
    let rowsN = legend.length ? 1 : 0, lx = pad;
    for (const it of legend) { const tw = probe.measureText(it.text).width; if (lx + tw + 24 > W - pad) { lx = pad; rowsN++; } lx += tw + 32; }
    const H = top + h + rowsN * 18 + (rowsN ? 16 : 0) + foot + 8;
    c.width = W * scale; c.height = H * scale;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5E5E6A'; g.font = `600 12px ${font}`; g.fillText('Skill Team · Enrolled Audit', pad, pad + 8);
    g.fillStyle = '#121218'; g.font = `600 20px ${font}`; g.fillText(titleOf(card), pad, pad + 34);
    g.fillStyle = '#5E5E6A'; g.font = `13px ${font}`; g.fillText(period(), pad, pad + 56);
    g.drawImage(img, (W - w) / 2, top, w, h);
    lx = pad; let ly = top + h + 22;
    g.font = `12px ${font}`;
    for (const it of legend) {
      const tw = g.measureText(it.text).width;
      if (lx + tw + 24 > W - pad) { lx = pad; ly += 18; }
      g.fillStyle = it.color;
      if (it.line) g.fillRect(lx, ly - 5, 12, 2); else g.fillRect(lx, ly - 9, 10, 10);
      g.fillStyle = '#3A3A44'; g.fillText(it.text, lx + 16, ly);
      lx += tw + 32;
    }
    g.fillStyle = '#8A8A96'; g.font = `11px ${font}`;
    g.fillText(`Source: PW Skills – QA Audit MIS · exported ${d3.timeFormat('%-d %b %Y, %H:%M')(new Date())}`, pad, H - 14);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  };

  // Tables: export exactly the rows shown (filters, sort and search applied).
  const tableRows = (card) => {
    const table = card.querySelector('table');
    if (!table) return null;
    const head = [...table.querySelectorAll('thead th')].map((th) => th.textContent.replace(/[▲▼↑↓]/g, '').trim());
    const body = [...table.querySelectorAll('tbody tr')].filter((tr) => tr.cells.length === head.length)
      .map((tr) => [...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    return { head, body };
  };
  const csvOf = ({ head, body }) => '﻿' + [head, ...body].map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
  const escHtml = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const emailTable = (card, { head, body }) => {
    const th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #3A3A44;font:600 12px Arial,sans-serif;color:#121218;background:#F4F3EF"';
    const td = 'style="padding:6px 10px;border-bottom:1px solid #E4E2DC;font:13px Arial,sans-serif;color:#1B1B22"';
    return `<p style="font:600 15px Arial,sans-serif;color:#121218;margin:0 0 4px">${escHtml(titleOf(card))}</p>`
      + `<p style="font:12px Arial,sans-serif;color:#5E5E6A;margin:0 0 8px">${escHtml(period())}</p>`
      + `<table style="border-collapse:collapse"><thead><tr>${head.map((x) => `<th ${th}>${escHtml(x)}</th>`).join('')}</tr></thead>`
      + `<tbody>${body.map((r) => `<tr>${r.map((v) => `<td ${td}>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  const mkBtn = (icon, text, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'qa-xbtn'; b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = XICON[icon];
    b.append(document.createTextNode(text));
    return b;
  };
  const busy = async (b, fn) => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } };
  const addBar = (card, buttons) => {
    const bar = document.createElement('div');
    bar.className = 'qa-export';
    const msg = document.createElement('div');
    msg.className = 'qa-xmsg'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    bar.append(...buttons, msg);
    card.classList.add('has-export');
    card.querySelector('h2').after(bar);
  };

  for (const [id, sel] of Object.entries(CHARTS)) {
    const card = document.getElementById(id);
    if (!card) continue;
    const name = titleOf(card);
    const d = mkBtn('dl', 'PNG', `Download ${name} as PNG`), cp = mkBtn('copy', 'Copy', `Copy ${name} as an image`);
    d.addEventListener('click', () => busy(d, async () => {
      try { await saveFile(card, fileName(card, 'png'), await chartPng(card, sel)); } catch (e) { say(card, 'Nothing to export for this period', true); }
    }));
    cp.addEventListener('click', () => busy(cp, async () => {
      const png = chartPng(card, sel);
      try { await png; } catch (e) { say(card, 'Nothing to export for this period', true); return; }
      await copyBlobs(card, { 'image/png': png }, 'Image copied. Paste it into your email.');
    }));
    addBar(card, [d, cp]);
  }
  for (const id of TABLES) {
    const card = document.getElementById(id);
    if (!card) continue;
    const name = titleOf(card);
    const d = mkBtn('dl', 'CSV', `Download ${name} as CSV`), cp = mkBtn('copy', 'Copy', `Copy ${name} as a table`);
    d.addEventListener('click', () => busy(d, async () => {
      const r = tableRows(card);
      if (!r || !r.body.length) { say(card, 'No rows to export for this period', true); return; }
      await saveFile(card, fileName(card, 'csv'), csvOf(r));
    }));
    cp.addEventListener('click', () => busy(cp, async () => {
      const r = tableRows(card);
      if (!r || !r.body.length) { say(card, 'No rows to export for this period', true); return; }
      const tsv = [r.head, ...r.body].map((x) => x.join('\t')).join('\n');
      await copyBlobs(card, { 'text/html': new Blob([emailTable(card, r)], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) }, 'Table copied. Paste it into your email.');
    }));
    addBar(card, [d, cp]);
  }
})();
