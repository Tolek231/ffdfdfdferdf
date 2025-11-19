'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR, BLOCKLIST_FILE } = require('../config');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPO_DND_DIR = path.join(REPO_ROOT, 'src', 'blacklists');

const DND_TXT_PATH_DATA = path.join(DATA_DIR, 'do_not_send.txt');
const DND_CSV_PATH_DATA = path.join(DATA_DIR, 'do_not_send.csv');
const DND_TXT_PATH_REPO = path.join(REPO_DND_DIR, 'do_not_send.txt');
const DND_CSV_PATH_REPO = path.join(REPO_DND_DIR, 'do_not_send.csv');

function readBlocklistSet() {
  const s = new Set();

  // helper
  const add = (str) => {
    const m = String(str || '')
      .match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g);
    if (!m) return;
    for (const e of m) s.add(e.toLowerCase());
  };

  try {
    if (BLOCKLIST_FILE && fs.existsSync(BLOCKLIST_FILE)) add(fs.readFileSync(BLOCKLIST_FILE, 'utf8'));
  } catch {}
  try {
    if (fs.existsSync(DND_TXT_PATH_REPO)) add(fs.readFileSync(DND_TXT_PATH_REPO, 'utf8'));
  } catch {}
  try {
    if (fs.existsSync(DND_CSV_PATH_REPO)) add(fs.readFileSync(DND_CSV_PATH_REPO, 'utf8'));
  } catch {}
  try {
    if (fs.existsSync(DND_TXT_PATH_DATA)) add(fs.readFileSync(DND_TXT_PATH_DATA, 'utf8'));
  } catch {}
  try {
    if (fs.existsSync(DND_CSV_PATH_DATA)) add(fs.readFileSync(DND_CSV_PATH_DATA, 'utf8'));
  } catch {}

  return s;
}

module.exports = { readBlocklistSet };
