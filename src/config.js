'use strict';
const path = require('path');
const os = require('os');

const toBool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};
const toNum = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: toNum(process.env.PORT, 3000),
  DATA_DIR: process.env.DATA_DIR || path.join(os.tmpdir(), 'amvera-mailer-data'),
  BASE_URL: process.env.BASE_URL || '',

  PRIMARY_MODE: toBool(process.env.PRIMARY_MODE, false),
  STRICT_DELIVERED: toBool(process.env.STRICT_DELIVERED, true),
  DEBUG_EVENTS: toBool(process.env.DEBUG_EVENTS, false),

  OPEN_PROXY_MIN_SECONDS: toNum(process.env.OPEN_PROXY_MIN_SECONDS, 20),
  OPEN_MIN_OPENS_SOFT: toNum(process.env.OPEN_MIN_OPENS_SOFT, 2),
  OPEN_HARD_IGNORE_UA: process.env.OPEN_HARD_IGNORE_UA || '(Proofpoint|Barracuda|Mimecast|urlresolver|spider|crawler|facebookexternalhit|Slackbot|Twitterbot|Discordbot|python-requests|curl|wget)',
  OPEN_SOFT_PROXY_UA: process.env.OPEN_SOFT_PROXY_UA || '(GoogleImageProxy|CFNetwork)',

  // SendGrid
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  FROM_EMAIL: process.env.FROM_EMAIL || '',
  FROM_NAME: process.env.FROM_NAME || 'Mailer',
  REPLY_TO: process.env.REPLY_TO || '',
  REPLY_TO_NAME: process.env.REPLY_TO_NAME || '',
  SENDGRID_WEBHOOK_SECRET: process.env.SENDGRID_WEBHOOK_SECRET || '',

  // Inbound parse
  INBOUND_PARSE_SECRET: process.env.INBOUND_PARSE_SECRET || '',

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_ADMIN_IDS: (process.env.TELEGRAM_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Client API
  CLIENT_API_TOKEN: process.env.CLIENT_API_TOKEN || '',

  // Followup
  FOLLOWUP_TEXT: process.env.FOLLOWUP_TEXT || 'Вы открыли письмо, но не ответили. Прошёл уже 1 час.',

  // Blocklist
  BLOCKLIST_FILE: process.env.BLOCKLIST_FILE || '',
};
