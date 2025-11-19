'use strict';
const fs = require('fs');
const path = require('path');
const { DB_PATH, CONFIG_PATH, TAGS_CSV_PATH, OPENED_NO_REPLY_PATH, LOGS_DIR, ACTIVITY_LOG } = require('./storage');

// Преобразование HTML → обычный текст (для text/plain части письма)
function stripHtmlToText(html) {
  if (!html) return '';
  const noStyle = String(html).replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const noScript = noStyle.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const withNewlines = noScript
    .replace(/<\/(p|div|h\d|li|br)>/gi, '\n')
    .replace(/<li>/gi, '• ');
  return withNewlines.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { messages: [], subscribers: [], meta: { nextTag: 1 } };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function initNextTag(db) {
  let max = 0;
  for (const m of db.messages || []) {
    const mt = m && m.tag && String(m.tag).match(/^T(\d+)$/);
    const n = mt ? Number(mt[1]) : 0;
    if (n > max) max = n;
  }
  db.meta = db.meta || {};
  if (!db.meta.nextTag || db.meta.nextTag <= max) db.meta.nextTag = max + 1;
}

// Initialize DB on module load
function initDB() {
  const db = readDB();
  initNextTag(db);
  writeDB(db);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { followupDelayMinutes: 60, recordNoReplyDelayMinutes: 60 };
  }
}

function appendTagCsv(tag, msg) {
  const line = `${tag},${msg.id},${JSON.stringify(msg.to).slice(1, -1)},${JSON.stringify(msg.subject || '').slice(1, -1)},${msg.createdAt}\n`;
  fs.appendFileSync(TAGS_CSV_PATH, line);
}

function tagString(n) {
  return 'T' + String(n).padStart(4, '0');
}

function rewriteOpenedNoReplyFile(db, cfg) {
  const now = Date.now();
  const delayMs = Math.max(0, Number(cfg.recordNoReplyDelayMinutes || 60)) * 60 * 1000;
  const lines = [];
  for (const m of db.messages) {
    if (m.openedAt && !m.repliedAt) {
      const openedMs = Date.parse(m.openedAt);
      if (!isNaN(openedMs) && (now - openedMs) >= delayMs) {
        lines.push(`${m.to}:${m.text}`);
      }
    }
  }
  fs.writeFileSync(OPENED_NO_REPLY_PATH, lines.join('\n'));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

function appendPerIdLog(msgOrId, line) {
  const id = typeof msgOrId === 'string' ? msgOrId : (msgOrId && msgOrId.id);
  if (!id) return;
  const row = `${new Date().toISOString()} [${id}] ${line}\n`;
  try {
    fs.appendFileSync(path.join(LOGS_DIR, `${id}.log`), row);
    fs.appendFileSync(ACTIVITY_LOG, row);
  } catch {}
}

function isHardBotUA(ua, regex) {
  return regex.test(ua || '');
}

function isSoftProxyUA(ua, regex) {
  return regex.test(ua || '');
}

// Detect analysis JSON with purely numeric keys like {"1":"subject","2":"body"}
function isBadNumericKeyJson(s) {
  if (!s) return false;
  s = String(s).trim();
  if (!(s.startsWith('{') && s.endsWith('}'))) return false;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (keys.length && keys.every(k => /^\d+$/.test(String(k)))) {
        return true;
      }
    }
  } catch {}
  return false;
}

module.exports = {
  stripHtmlToText,
  readDB,
  writeDB,
  initNextTag,
  initDB,
  readConfig,
  appendTagCsv,
  tagString,
  rewriteOpenedNoReplyFile,
  escapeHtml,
  appendPerIdLog,
  isHardBotUA,
  isSoftProxyUA,
  isBadNumericKeyJson,
};
