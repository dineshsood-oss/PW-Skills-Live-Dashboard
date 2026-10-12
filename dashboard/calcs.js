/* QA Audit MIS — loader + calculations.
   The Google Sheet has one tab per month (Sep-2026, Oct-2026, …). Each tab:
   row 1 = headers, one row per audit, D-1 rows appended daily. */

/* ---------- 1. one row per audit, scored ---------- */
dash.calc('audits_scored', {
  inputs: ['audits'],
  title: 'Scored audits',
  description: 'Each audit with its YES / NO / N/A counts, RAG band (the sheet’s ZTP Category, else NO-count bands 20+/15+/10+), FATAL/Concerning mark and BOT 2 alarm triggers.',
  fn: (audits) => {
    const FIXED = ['tab', 'sheet_row', 'enrolment_date', 'audited_date', 'reg_number', 'final_fees', 'manager', 'lc_owner', 'qa_name', 'talk_time_sec', 'course_enrolled', 'course_type', 'ztp_category', 'fatal', 'remarks', 'manager_remark'];
    const norm = (h) => String(h).toLowerCase().replace(/\s+/g, ' ').trim();
    const CRITICAL = ['40% Marks for Placement Eligibility', 'Full time roll for all levels with level wise packages', 'only 5 oppurtunity over 3 months Pitched', 'Correct Loan Tenure Pitched', 'Cibil Impact if missed Pitched'];
    const RISK_WORDS = ['not disclosed', 'not covered', 'no call found', 'discrepancy', 'misled', 'mis-sold', 'mis sold', 'false', 'complaint', 'not clearly explained', 'should have been', 'not check', 'not checked', 'eligibility not check', 'missed', 'no proper', 'not informed', 'incorrect', 'wrong info'];
    const isoWeek = (s) => {
      const d = new Date(s + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
      const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
      const wk = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
      return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
    };
    const monday = (s) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    // the 24 template parameters, so small header edits (spacing, case) still map to the same parameter
    const CANON = ['Right Certification Pitched (Microsoft, NSDC)  For Offline- No Microsoft Certificate || For Online Basic- No Microsoft Certificate', 'Class Duration', 'Class Date and Timinigs', 'PW Talk', 'Right Instructors Pitched', 'Career Gap Eligibility Less than 2 yrs & Graduation Check', 'All 4Stages Briefed, Along with Marks and and weightage to each stage', 'AI Interview and Human Led interview', 'Attendence 60% For Certification', '40% Marks for Placement Eligibility', 'Remedial test', 'Readiness Scores of all three level', 'Internships of all three level with upto Stinpends', 'Full time roll for all levels with level wise packages', 'Job nature of all levels', 'Improving your Rediness Score Pitched', 'only 5 oppurtunity over 3 months Pitched', 'Payment Type', 'DP Pitched', 'Correct DP Pitched', 'Correct Loan Tenure Pitched', 'Cibil Impact if missed Pitched', '30 Calender day refund valid pitched', '10K non refundable regeistration fee'];
    const canon = {};
    CANON.forEach((c) => { canon[norm(c)] = c; });
    const params = [];
    audits.forEach((r) => Object.keys(r).forEach((k) => { if (!FIXED.includes(k) && !params.includes(k)) params.push(k); }));
    const nameOf = {};
    params.forEach((k) => { nameOf[k] = canon[norm(k)] || (norm(k).startsWith('right certification pitched') ? CANON[0] : k); });
    return audits.filter((r) => r.enrolment_date).map((r) => {
      const answers = {};
      let no = 0, yes = 0, na = 0;
      params.forEach((p) => {
        const v = r[p] == null ? '' : String(r[p]).trim();
        const u = v.toUpperCase();
        answers[nameOf[p]] = u === 'NO' || u === 'YES' ? u : (u === 'NA' || u === 'N/A' ? 'NA' : v);
        if (u === 'NO') no++; else if (u === 'YES') yes++; else if (u === 'NA' || u === 'N/A') na++;
      });
      const z = String(r.ztp_category || '').trim().toLowerCase();
      const rag = ['red', 'amber', 'orange', 'green'].includes(z) ? z : (no >= 20 ? 'red' : no >= 15 ? 'amber' : no >= 10 ? 'orange' : 'green');
      const reasons = [];
      const triggers = [];
      if (rag === 'red' || rag === 'amber') { reasons.push(`Audit score is ${rag.toUpperCase()} (${no} parameters missed).`); triggers.push('Low audit score (RED/AMBER)'); }
      const critical = CRITICAL.filter((p) => answers[p] === 'NO');
      critical.forEach((p) => reasons.push(`Critical compliance parameter missed: “${p}”`));
      if (critical.length) triggers.push('Critical parameter missed');
      const remark = String(r.remarks || '').toLowerCase();
      const hit = RISK_WORDS.find((k) => remark.includes(k));
      if (hit) { reasons.push(`QA remark language flags risk (“…${hit}…”).`); triggers.push('Risk language in remarks'); }
      const fatal = String(r.fatal || '').trim().toUpperCase() === 'YES';
      if (fatal) { reasons.unshift('QA marked this call FATAL / Concerning.'); triggers.push('Marked FATAL/Concerning'); }
      const date = r.enrolment_date;
      const month = date.slice(0, 7);
      const week = isoWeek(date);
      return {
        audit_id: `${r.tab}#${r.sheet_row}`, tab: r.tab, sheet_row: r.sheet_row,
        date, month, week, week_start: monday(date),
        lc_owner: r.lc_owner || '(blank)', manager: r.manager || '', qa_name: r.qa_name || '', reg_number: r.reg_number || '',
        audited_date: r.audited_date || '', talk_time_sec: r.talk_time_sec == null ? null : r.talk_time_sec, fatal,
        course_enrolled: r.course_enrolled || '', course_type: r.course_type || '', remarks: r.remarks || '', manager_remark: r.manager_remark || '',
        ztp_category: r.ztp_category || '', rag, no, yes, na, applicable: no + yes,
        critical_missed: critical.length, reasons, triggers, flagged: reasons.length > 0,
        severity: (fatal || rag === 'red' || rag === 'amber' || critical.length) ? 'high' : (reasons.length ? 'medium' : ''),
        answers,
        scopes: [`${month}|all|all`, `${month}|day|${date}`, `${month}|week|${week}`, 'all|all|all', `all|day|${date}`, `all|week|${week}`],
      };
    });
  },
});

/* ---------- 2. per scope × parameter ---------- */
dash.calc('scope_params', {
  inputs: ['audits_scored'],
  title: 'Parameter misses by period',
  description: 'For every period (month, day, week) and parameter: NO, YES and N/A counts, % NO of applicable (YES+NO), share of all NOs and the BOT 2 root-cause bucket.',
  fn: (audits_scored) => {
    const GROUPS = {
      'Product Details Pitched': ['Right Certification Pitched (Microsoft, NSDC)  For Offline- No Microsoft Certificate || For Online Basic- No Microsoft Certificate', 'Class Duration', 'Class Date and Timinigs', 'PW Talk', 'Right Instructors Pitched'],
      'Placement Structure Stages': ['Career Gap Eligibility Less than 2 yrs & Graduation Check', 'All 4Stages Briefed, Along with Marks and and weightage to each stage', 'AI Interview and Human Led interview'],
      'Certification/Placement Eligibility Process': ['Attendence 60% For Certification', '40% Marks for Placement Eligibility', 'Remedial test'],
      'Placement levels for eligible candidates': ['Readiness Scores of all three level', 'Internships of all three level with upto Stinpends', 'Full time roll for all levels with level wise packages', 'Job nature of all levels', 'Improving your Rediness Score Pitched', 'only 5 oppurtunity over 3 months Pitched'],
      'Payment details': ['Payment Type', 'DP Pitched', 'Correct DP Pitched', 'Correct Loan Tenure Pitched', 'Cibil Impact if missed Pitched'],
      'Refund Details': ['30 Calender day refund valid pitched', '10K non refundable regeistration fee'],
    };
    const LIB = {
      'Right Certification Pitched (Microsoft, NSDC)  For Offline- No Microsoft Certificate || For Online Basic- No Microsoft Certificate': ['Knowledge gap', 'Retrain on the certification matrix by course/mode (Offline vs Online-Basic vs Pro) — counsellors are pitching the wrong certificate body.'],
      'Class Duration': ['Script gap', 'Add class duration as a mandatory checklist line in the pitch script, read out before payment discussion.'],
      'Class Date and Timinigs': ['Script gap', 'Make date/timing confirmation a scripted checkpoint before enrolment closes.'],
      'PW Talk': ['Habit gap', 'Coach on consistently walking the customer through the PW Talk session — this is a discipline miss, not a knowledge gap.'],
      'Right Instructors Pitched': ['Knowledge gap', 'Refresh instructor-mapping sheet training so counsellors quote the correct faculty per batch.'],
      'Career Gap Eligibility Less than 2 yrs & Graduation Check': ['Compliance-disclosure gap', 'Eligibility screening must happen before pitching placement — build a hard stop in the call flow.'],
      'All 4Stages Briefed, Along with Marks and and weightage to each stage': ['Script gap', 'Biggest driver of placement mis-selling risk — mandate a scripted 4-stage + weightage walkthrough, QA to spot-check daily.'],
      'AI Interview and Human Led interview': ['Script gap', 'Add AI + human interview explanation as a scripted sub-step under placement stages.'],
      'Attendence 60% For Certification': ['Compliance-disclosure gap', 'Attendance eligibility must be disclosed up front — retrain on certification eligibility rules.'],
      '40% Marks for Placement Eligibility': ['Compliance-disclosure gap', 'High-risk miss: customers enrol without knowing the placement marks threshold. Escalate for scripted mandatory disclosure + QA hard-flag.', true],
      'Remedial test': ['Knowledge gap', 'Refresh training on remedial-test provisions so counsellors don’t skip this eligibility detail.'],
      'Readiness Scores of all three level': ['Knowledge gap', 'Coach on explaining the readiness-score system across all 3 placement levels, not just one.'],
      'Internships of all three level with upto Stinpends': ['Script gap', 'Internship + stipend structure should be a standard talking point across all levels, not level-1 only.'],
      'Full time roll for all levels with level wise packages': ['Compliance-disclosure gap', 'Package expectations must be pitched accurately by level — a miss here drives post-sale disputes.', true],
      'Job nature of all levels': ['Knowledge gap', 'Retrain on job-role/nature descriptions for each placement level.'],
      'Improving your Rediness Score Pitched': ['Script gap', 'Add readiness-score improvement path as a scripted retention/expectation-setting line.'],
      'only 5 oppurtunity over 3 months Pitched': ['Compliance-disclosure gap', 'Customers must be told placement opportunities are capped (5 over 3 months) — omitting this is a top driver of post-enrolment complaints.', true],
      'Payment Type': ['Script gap', 'Confirm and log payment type (EMI/OneShot) as a mandatory field before closing the call.'],
      'DP Pitched': ['Script gap', 'Down-payment terms should be a scripted checkpoint, not left implicit.'],
      'Correct DP Pitched': ['Knowledge gap', 'Refresh DP-slab training — counsellors are quoting incorrect down-payment figures.'],
      'Correct Loan Tenure Pitched': ['Compliance-disclosure gap', 'Loan tenure must be pitched accurately — incorrect tenure is a financial mis-selling risk needing urgent retraining.', true],
      'Cibil Impact if missed Pitched': ['Compliance-disclosure gap', 'CIBIL-impact disclosure is trust-critical — mandate this line in every EMI conversation, QA to hard-flag any skip.', true],
      '30 Calender day refund valid pitched': ['Compliance-disclosure gap', 'Refund window must be disclosed at point of sale to avoid disputes — retrain and add to mandatory script.'],
      '10K non refundable regeistration fee': ['Compliance-disclosure gap', 'Non-refundable component must be clearly stated before payment — high dispute risk if skipped.'],
    };
    const groupOf = {};
    Object.entries(GROUPS).forEach(([g, ps]) => ps.forEach((p) => { groupOf[p] = g; }));
    const order = [];
    const by = new Map();
    audits_scored.forEach((a) => a.scopes.forEach((s) => {
      if (!by.has(s)) by.set(s, {});
      const m = by.get(s);
      Object.entries(a.answers).forEach(([p, v]) => {
        if (!order.includes(p)) order.push(p);
        const t = m[p] || (m[p] = { no: 0, yes: 0, na: 0 });
        if (v === 'NO') t.no++; else if (v === 'YES') t.yes++; else if (v === 'NA') t.na++;
      });
    }));
    const out = [];
    by.forEach((m, scope) => {
      const list = order.map((p) => ({ p, ...(m[p] || { no: 0, yes: 0, na: 0 }) }));
      const total = list.reduce((s, x) => s + x.no, 0);
      list.sort((a, b) => b.no - a.no || order.indexOf(a.p) - order.indexOf(b.p));
      let cum = 0;
      list.forEach((x, i) => {
        cum += x.no;
        const lib = LIB[x.p] || ['Uncategorised', 'Review pitch-checklist adherence in the next call-calibration session.'];
        out.push({
          row_id: `${scope}~${x.p}`, scope, param: x.p, group: groupOf[x.p] || 'Other',
          cause: lib[0], tip: lib[1], critical: !!lib[2],
          no: x.no, yes: x.yes, na: x.na, applicable: x.no + x.yes,
          pct_no: x.no + x.yes ? x.no / (x.no + x.yes) : 0,
          share_of_no: total ? x.no / total : 0, cum_share: total ? cum / total : 0, rank: i + 1,
        });
      });
    });
    return out;
  },
});

/* ---------- 3. per scope × parameter group ---------- */
dash.calc('scope_groups', {
  inputs: ['scope_params'],
  title: 'Parameter-group misses by period',
  description: 'The six top-level parameter groups per period: NO count and % NO of applicable, summed from their sub-parameters.',
  fn: (scope_params) => {
    const ORDER = ['Product Details Pitched', 'Placement Structure Stages', 'Certification/Placement Eligibility Process', 'Placement levels for eligible candidates', 'Payment details', 'Refund Details', 'Other'];
    const m = new Map();
    scope_params.forEach((r) => {
      const k = `${r.scope}~${r.group}`;
      const t = m.get(k) || { row_id: k, scope: r.scope, group: r.group, no: 0, yes: 0, na: 0, applicable: 0, sub_params: 0 };
      t.no += r.no; t.yes += r.yes; t.na += r.na; t.applicable += r.applicable; t.sub_params++;
      m.set(k, t);
    });
    return [...m.values()].map((t) => ({ ...t, pct_no: t.applicable ? t.no / t.applicable : 0, order: ORDER.indexOf(t.group) }))
      .sort((a, b) => a.order - b.order);
  },
});

/* ---------- 4. per scope × root cause ---------- */
dash.calc('scope_causes', {
  inputs: ['scope_params'],
  title: 'Root-cause buckets by period',
  description: 'NOs per period grouped into the four BOT 2 root-cause buckets (script, knowledge, habit, compliance-disclosure), with the parameters driving each.',
  fn: (scope_params) => {
    const m = new Map();
    const totals = new Map();
    scope_params.forEach((r) => {
      totals.set(r.scope, (totals.get(r.scope) || 0) + r.no);
      if (!r.no) return;
      const k = `${r.scope}~${r.cause}`;
      const t = m.get(k) || { row_id: k, scope: r.scope, cause: r.cause, no: 0, list: [] };
      t.no += r.no; t.list.push([r.param, r.no]);
      m.set(k, t);
    });
    return [...m.values()].map((t) => {
      t.list.sort((a, b) => b[1] - a[1]);
      return { row_id: t.row_id, scope: t.scope, cause: t.cause, no: t.no, share: totals.get(t.scope) ? t.no / totals.get(t.scope) : 0,
        params: t.list.map((x) => x[0]).join(' · '), top_param: t.list[0][0], param_count: t.list.length };
    }).sort((a, b) => b.no - a.no);
  },
});

/* ---------- 5. per scope × counsellor ---------- */
dash.calc('scope_counsellors', {
  inputs: ['audits_scored', 'scope_params'],
  title: 'Counsellor summary by period',
  description: 'Each counsellor (LC owner) per period: audits, total and average NO, RAG mix, most-missed parameter with its coaching tip, and escalation (2+ RED audits; if nobody has 2, the 5 worst with a RED).',
  fn: (audits_scored, scope_params) => {
    const lib = {};
    scope_params.forEach((r) => { if (!lib[r.param]) lib[r.param] = [r.cause, r.tip]; });
    const m = new Map();
    audits_scored.forEach((a) => a.scopes.forEach((s) => {
      const k = `${s}~${a.lc_owner}`;
      const t = m.get(k) || { row_id: k, scope: s, lc_owner: a.lc_owner, managers: {}, fatal: 0, audits: 0, total_no: 0, red: 0, amber: 0, orange: 0, green: 0, flagged: 0, miss: {} };
      t.audits++; t.total_no += a.no; t[a.rag]++; if (a.flagged) t.flagged++; if (a.fatal) t.fatal++;
      if (a.manager) t.managers[a.manager] = (t.managers[a.manager] || 0) + 1;
      Object.entries(a.answers).forEach(([p, v]) => { if (v === 'NO') t.miss[p] = (t.miss[p] || 0) + 1; });
      m.set(k, t);
    }));
    const rows = [...m.values()].map((t) => {
      const worst = Object.entries(t.miss).sort((a, b) => b[1] - a[1])[0];
      const l = worst ? (lib[worst[0]] || ['General', 'Review pitch-checklist adherence in the next call-calibration session.']) : ['', ''];
      const mg = Object.entries(t.managers).sort((a, b) => b[1] - a[1])[0];
      return { row_id: t.row_id, scope: t.scope, lc_owner: t.lc_owner, manager: mg ? mg[0] : '', fatal: t.fatal, audits: t.audits, total_no: t.total_no,
        avg_no: t.total_no / t.audits, red: t.red, amber: t.amber, orange: t.orange, green: t.green,
        risk_share: (t.red + t.amber) / t.audits, flagged: t.flagged,
        worst_param: worst ? worst[0] : '—', worst_count: worst ? worst[1] : 0, cause: l[0], tip: l[1], escalate: false, rank: 0 };
    });
    const byScope = new Map();
    rows.forEach((r) => { if (!byScope.has(r.scope)) byScope.set(r.scope, []); byScope.get(r.scope).push(r); });
    byScope.forEach((list) => {
      list.sort((a, b) => b.avg_no - a.avg_no || b.audits - a.audits);
      list.forEach((r, i) => { r.rank = i + 1; });
      const twoRed = list.filter((r) => r.red >= 2);
      (twoRed.length ? twoRed : list.filter((r) => r.red >= 1).slice(0, 5)).forEach((r) => { r.escalate = true; });
    });
    return rows.sort((a, b) => a.rank - b.rank);
  },
});

/* ---------- 6. per scope headline ---------- */
dash.calc('scope_summary', {
  inputs: ['audits_scored', 'scope_causes', 'scope_counsellors'],
  title: 'Headline figures by period',
  description: 'Per month, day and week: audits, NOs, avg NO per audit, RAG mix, flagged cases, top root cause, escalations, and the change from the previous period of the same kind.',
  fn: (audits_scored, scope_causes, scope_counsellors) => {
    const m = new Map();
    audits_scored.forEach((a) => a.scopes.forEach((s) => {
      const t = m.get(s) || { scope: s, audits: 0, total_no: 0, total_yes: 0, total_na: 0, red: 0, amber: 0, orange: 0, green: 0, flagged: 0, fatal: 0, tt_sum: 0, tt_n: 0, latest_audited: '', trig: {}, latest_date: '', first_date: '9999', week_start: a.week_start, counsellors: new Set(), qas: new Set() };
      t.audits++; t.total_no += a.no; t.total_yes += a.yes; t.total_na += a.na; t[a.rag]++;
      if (a.flagged) t.flagged++;
      if (a.fatal) t.fatal++;
      if (a.talk_time_sec != null) { t.tt_sum += a.talk_time_sec; t.tt_n++; }
      if (a.audited_date > t.latest_audited) t.latest_audited = a.audited_date;
      a.triggers.forEach((x) => { t.trig[x] = (t.trig[x] || 0) + 1; });
      if (a.date > t.latest_date) t.latest_date = a.date;
      if (a.date < t.first_date) t.first_date = a.date;
      t.counsellors.add(a.lc_owner); if (a.qa_name) t.qas.add(a.qa_name);
      m.set(s, t);
    }));
    const topCause = {};
    scope_causes.forEach((c) => { if (!topCause[c.scope] || c.no > topCause[c.scope].no) topCause[c.scope] = c; });
    const esc = {};
    scope_counsellors.forEach((c) => { if (c.escalate) esc[c.scope] = (esc[c.scope] || 0) + 1; });
    const fmtD = (s, y) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: y ? 'numeric' : undefined, timeZone: 'UTC' });
    const rows = [...m.values()].map((t) => {
      const [month, grain, bucket] = t.scope.split('|');
      const top = Object.entries(t.trig).sort((a, b) => b[1] - a[1])[0];
      let label;
      if (grain === 'day') label = fmtD(bucket, true);
      else if (grain === 'week') { const end = new Date(t.week_start + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 6); label = `${bucket.slice(5)} · ${fmtD(t.week_start)} – ${fmtD(end.toISOString().slice(0, 10))}`; }
      else label = month === 'all' ? 'All months' : new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return {
        scope: t.scope, month, grain, bucket, label, audits: t.audits, total_no: t.total_no, total_yes: t.total_yes, total_na: t.total_na,
        avg_no: t.total_no / t.audits, red: t.red, amber: t.amber, orange: t.orange, green: t.green,
        risk_count: t.red + t.amber, risk_pct: (t.red + t.amber) / t.audits,
        flagged: t.flagged, flagged_pct: t.flagged / t.audits, fatal: t.fatal,
        avg_talk_min: t.tt_n ? t.tt_sum / t.tt_n / 60 : null, latest_audited: t.latest_audited || null, top_trigger: top ? top[0] : '—',
        top_cause: topCause[t.scope] ? topCause[t.scope].cause : '—', top_cause_no: topCause[t.scope] ? topCause[t.scope].no : 0,
        top_cause_share: topCause[t.scope] ? topCause[t.scope].share : 0,
        escalations: esc[t.scope] || 0, counsellors: t.counsellors.size, qas: t.qas.size,
        latest_date: t.latest_date, first_date: t.first_date,
      };
    });
    const series = new Map();
    rows.forEach((r) => {
      const k = r.grain === 'all' ? (r.month === 'all' ? 'ALL' : 'months') : `${r.month}|${r.grain}`;
      if (!series.has(k)) series.set(k, []);
      series.get(k).push(r);
    });
    series.forEach((list) => {
      list.sort((a, b) => (a.grain === 'all' ? a.month.localeCompare(b.month) : a.bucket.localeCompare(b.bucket)));
      list.forEach((r, i) => {
        const p = list[i - 1];
        r.prev_label = p ? p.label : null;
        r.d_audits = p ? r.audits - p.audits : null;
        r.d_avg_no = p ? r.avg_no - p.avg_no : null;
        r.d_risk_pct = p ? r.risk_pct - p.risk_pct : null;
        r.d_flagged_pct = p ? r.flagged_pct - p.flagged_pct : null;
      });
    });
    return rows;
  },
});

