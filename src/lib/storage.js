'use strict';
const fs=require('fs');
const path=require('path');
const { DATA_DIR } = require('../config');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH              = path.join(DATA_DIR, 'db.json');
const CONFIG_PATH          = path.join(DATA_DIR, 'config.json');
const TAGS_CSV_PATH        = path.join(DATA_DIR, 'tags.csv');
const OPENED_NO_REPLY_PATH = path.join(DATA_DIR, 'opened_no_reply.txt');
const LOGS_DIR             = path.join(DATA_DIR, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const ACTIVITY_LOG         = path.join(DATA_DIR, 'activity.log');

if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ messages: [], subscribers: [], meta: { nextTag: 1 } }, null, 2));
}
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    followupDelayMinutes: 60,
    recordNoReplyDelayMinutes: 60
  }, null, 2));
}
if (!fs.existsSync(TAGS_CSV_PATH)) fs.writeFileSync(TAGS_CSV_PATH, 'tag,id,to,subject,createdAt\n');
if (!fs.existsSync(OPENED_NO_REPLY_PATH)) fs.writeFileSync(OPENED_NO_REPLY_PATH, '');

module.exports={DB_PATH,CONFIG_PATH,TAGS_CSV_PATH,OPENED_NO_REPLY_PATH,LOGS_DIR,ACTIVITY_LOG};
