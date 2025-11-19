'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');

function readCounters() {
  try {
    return JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
  } catch {
    return { byDate: {}, byToken: {}, updatedAt: null };
  }
}

function writeCounters(c) {
  try {
    c.updatedAt = new Date().toISOString();
    fs.writeFileSync(COUNTERS_FILE, JSON.stringify(c, null, 2), 'utf8');
  } catch {}
}

function incCounter(key, when, token) {
  try {
    const c = readCounters();
    const day = (when ? new Date(when) : new Date()).toISOString().slice(0, 10);
    c.byDate[day] = c.byDate[day] || { sent: 0, delivered: 0, opens: 0 };
    if (token) {
      c.byToken = c.byToken || {};
      c.byToken[token] = c.byToken[token] || { byDate: {} };
      c.byToken[token].byDate[day] = c.byToken[token].byDate[day] || { sent: 0, delivered: 0, opens: 0 };
    }
    if (key in c.byDate[day]) c.byDate[day][key] += 1;
    if (token) {
      if (key in c.byToken[token].byDate[day]) c.byToken[token].byDate[day][key] += 1;
    }
    writeCounters(c);
  } catch (e) {
    console.error('incCounter error', e);
  }
}

module.exports = { readCounters, writeCounters, incCounter };
