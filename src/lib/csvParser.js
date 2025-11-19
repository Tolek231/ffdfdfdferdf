'use strict';
const iconv = require('iconv-lite');
const Papa = require('papaparse');
const { isBadNumericKeyJson } = require('./helpers');

// Smart-decode buffer: prefer UTF-8, fallback to win1251 if many replacement chars
function smartDecode(buf) {
  let utf8 = buf.toString('utf-8');
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  const cyr = (utf8.match(/[А-Яа-яЁё]/g) || []).length;

  if (bad > 0 || cyr === 0) {
    try {
      const w = iconv.decode(buf, 'win1251');
      const wCyr = (w.match(/[А-Яа-яЁё]/g) || []).length;
      if (wCyr > cyr) return w;
    } catch {}
  }
  return utf8;
}

function parseCSV(buffer) {
  const text = smartDecode(buffer);
  const header = (text.split(/\r?\n/)[0] || '');
  const delimiter = (header.split(';').length > header.split(',').length) ? ';' : ',';

  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter });

  const rows = (parsed.data || []).filter(r =>
    r && (r.emails || r.Emails || r.EMAILS) && (r.analysis || r.Analysis || r.ANALYSIS)
  );

  const toSend = [];
  for (const r of rows) {
    const emailsRaw = String(r.emails || r.Emails || r.EMAILS || '').trim();
    const analysisRaw = String(r.analysis || r.Analysis || r.ANALYSIS || '').trim();

    // Skip rows where analysis is a JSON with numeric keys only
    if (isBadNumericKeyJson(analysisRaw)) {
      continue;
    }
    if (!emailsRaw || !analysisRaw) continue;

    // extract subject from analysis if line starts with "Subject:"
    let subject = null;
    let body = analysisRaw;
    const m = analysisRaw.match(/^\s*Subject:\s*(.+)\s*$/mi);
    if (m) {
      subject = m[1].trim();
      body = analysisRaw.replace(/^\s*Subject:.*(\r?\n)?/mi, '').trim();
    }

    // if analysis looks like JSON with subject/body
    if (/^\s*\{/.test(analysisRaw)) {
      try {
        const obj = JSON.parse(analysisRaw);
        if (obj && (obj.body || obj.text)) {
          body = String(obj.body || obj.text);
        }
        if (obj && obj.subject && !subject) {
          subject = String(obj.subject);
        }
      } catch {}
    }

    // strip surrounding ``` fences if present
    body = body.replace(/^```[a-zA-Z0-9]*\s*/m, '').replace(/\s*```$/m, '').trim();

    // split multiple emails by ; , or whitespace
    const emails = emailsRaw.split(/[;, \t\r\n]+/).map(s => s.trim()).filter(Boolean);
    for (const e of emails) {
      toSend.push({ email: e, text: body, subject });
    }
  }

  return { toSend, errors: parsed.errors || [] };
}

module.exports = { parseCSV, smartDecode };
