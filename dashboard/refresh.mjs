// Turns a Google Drive download_file_content answer (Excel export of the audit sheet)
// into the rows file the dashboard reads: node refresh.mjs <answer.json> <out.json>
import fs from 'fs';
import path from 'path';
const [,, answerPath, outPath] = process.argv;
let loader = null;
globalThis.dash = { loader: (id, o) => { if (id === 'audits') loader = o; }, calc: () => {} };
eval(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'sheet-reader.js'), 'utf8'));
const answer = JSON.parse(fs.readFileSync(answerPath, 'utf8'));
const out = await loader.fn({ answer });
fs.writeFileSync(outPath, JSON.stringify(out));
const tabs = {};
out.rows.forEach((r) => { tabs[r.tab] = (tabs[r.tab] || 0) + 1; });
console.log(JSON.stringify({ rows: out.rows.length, columns: out.columns.length, tabs }));
