'use strict';
const fs=require('fs');
const path=require('path');
const { DATA_DIR } = require('../config');

const TOKENS_FILE = path.join(DATA_DIR, 'tokens'); // по одному токену в строке (например: o4ko)
function readTokens(){
  try {
    const txt = fs.readFileSync(TOKENS_FILE, 'utf8');
    return new Set(txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
  } catch { return new Set(); }
}

module.exports={ readTokens, TOKENS_FILE };
