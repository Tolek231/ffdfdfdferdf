// src/lib/emailValidator.js
'use strict';
const { execFile } = require('child_process');
const dns = require('dns').promises;
const punycode = require('punycode');
const http = require('http');
const https = require('https');
const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });


const fs = require('fs');
const path = require('path');

// === загрузка локального конфига (не критично) ===
function loadCfg() {
  try {
    const p = path.join(__dirname, '..', 'config', 'emailValidation.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}
const CFG = loadCfg();

// === DNS: берём таймаут/TTL из repo-конфига (не ENV) ===
const DIG_TIMEOUT_MS = Number(CFG?.dns?.digTimeoutMs ?? 1200);
const CACHE_TTL_MS   = Number(CFG?.dns?.domainCacheTtlMs ?? 300000);

// === КОНФИГ MAILBOXLAYER (из ENV или файла) ===
const MBL = {
  ENABLED: CFG?.mailboxlayer?.enabled ?? true,
  KEY: process.env.MAILBOXLAYER_API_KEY || '',
  MODE: CFG?.mailboxlayer?.mode || 'legacy',
  PROTOCOL: CFG?.mailboxlayer?.protocol || 'http',
  TIMEOUT_MS: CFG?.mailboxlayer?.timeoutMs || 7000,
  MIN_SCORE: CFG?.mailboxlayer?.minScore ?? 0,
  BLOCK_DISPOSABLE: CFG?.mailboxlayer?.block?.disposable ?? true,
  BLOCK_ROLE: CFG?.mailboxlayer?.block?.role ?? false,
  ACCEPT_FREE: CFG?.mailboxlayer?.acceptFree ?? true,
  BLOCK_CATCHALL: CFG?.mailboxlayer?.block?.catchAll ?? false
};

const MARKETPLACE_URL = 'https://api.apilayer.com/email_verification/check';
const LEGACY_URL_HTTP  = 'http://apilayer.net/api/check';
const LEGACY_URL_HTTPS = 'https://apilayer.net/api/check';

// === внутренние кэши ===
const domainCache  = new Map(); // domain -> { ok:boolean, ts:number }
const mailboxCache = new Map(); // email  -> { res: object, ts:number }

// ==== утилиты ====
function normalizeDomain(domain) {
  const d = String(domain || '').trim().replace(/\.+$/, '');
  if (!d) return '';
  try { return punycode.toASCII(d); } catch { return ''; }
}

function isValidEmailSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  email = email.trim();
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return false;

  const local = email.slice(0, at);
  let domain  = email.slice(at + 1);

  if (/[^\x20-\x7E]/.test(email) || /\s/.test(email)) return false;
  if (!/^[A-Za-z0-9._%+-]{1,64}$/.test(local)) return false;

  domain = normalizeDomain(domain);
  if (!domain) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const L of labels) {
    if (!/^[A-Za-z0-9-]{1,63}$/.test(L)) return false;
    if (L.startsWith('-') || L.endsWith('-')) return false;
  }
  if (labels[labels.length - 1].length < 2) return false;
  return true;
}

function cacheGet(map, key, ttlMs) {
  const v = map.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > ttlMs) { map.delete(key); return null; }
  return v.res ?? v.ok ?? null;
}
function cachePut(map, key, value) {
  map.set(key, { res: value, ok: value, ts: Date.now() });
}

// dig + DNS
function digShort(args, timeoutMs = DIG_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = execFile('dig', ['+short', ...args], { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve('');
      resolve(String(stdout || ''));
    });
    if (!child) resolve('');
  });
}

async function checkDomainWithDig(domain) {
  domain = normalizeDomain(domain);
  if (!domain) return false;

  const cached = cacheGet(domainCache, domain, CACHE_TTL_MS);
  if (cached !== null) return cached;

  // MX
  let out = await digShort(['MX', domain]);
  if (/\S/.test(out)) { cachePut(domainCache, domain, true); return true; }

  // A/AAAA
  out = await digShort(['A', domain]);
  if (!/\S/.test(out)) out = await digShort(['AAAA', domain]);
  if (/\S/.test(out)) { cachePut(domainCache, domain, true); return true; }

  // fallback на Node DNS
  try { const mx = await dns.resolveMx(domain); if (mx?.length) { cachePut(domainCache, domain, true); return true; } } catch {}
  try { const any = await dns.resolveAny(domain); if (any?.length) { cachePut(domainCache, domain, true); return true; } } catch {}

  cachePut(domainCache, domain, false);
  return false;
}

// ==== HTTP helper ====
function httpGetJsonWithHeaders(url, headers = {}, timeoutMs) {
  const isHttps = url.startsWith('https');
  const lib   = isHttps ? https : http;
  const agent = isHttps ? httpsAgent : httpAgent;

  // Базовые заголовки: просим JSON и отключаем компрессию
  const baseHeaders = {
    'Accept': 'application/json',
    'Accept-Encoding': 'identity', // ← важно: без gzip/deflate
    'User-Agent': 'WandleadSender/1.0'
  };
  const finalHeaders = { ...baseHeaders, ...headers };

  return new Promise((resolve) => {
    const req = lib.request(
      url,
      { method: 'GET', headers: finalHeaders, timeout: timeoutMs, agent },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ct = String(res.headers['content-type'] || '');
          const sc = res.statusCode || 0;

          // если это не JSON — сразу диагностируем
          if (!ct.includes('application/json')) {
            return resolve({ ok: false, err: `bad_json_ct_${ct.split(';')[0]||'unknown'}_sc_${sc}` });
          }
          try {
            resolve({ ok: true, json: JSON.parse(data) });
          } catch {
            resolve({ ok: false, err: `bad_json_sc_${sc}` });
          }
        });
      }
    );

    req.on('timeout', () => { req.destroy(new Error('timeout')); resolve({ ok: false, err: 'timeout' }); });
    req.on('error',   () => resolve({ ok: false, err: 'network_error' }));
    req.end();
  });
}

function isOkML(json) { return json && !json.error; }

// ==== Mailboxlayer lookup (только HTTPS; без ENV) ====
async function mailboxLayerLookup(email) {
  if (!MBL.ENABLED) return null;
  if (!MBL.KEY) return { __mbl_err: 'no_key' };

  const cached = cacheGet(mailboxCache, email, 24*60*60*1000);
  if (cached) return cached;

  const mode = String(MBL.MODE || 'legacy').toLowerCase();
  let url, headers = {};

  if (mode === 'marketplace') {
    // Новый API marketplace: HTTPS + header apikey, БЕЗ access_key в query
    const params = new URLSearchParams({ email, smtp: '1', format: '1' });
    url = `${MARKETPLACE_URL}?${params.toString()}`;
    headers = { apikey: MBL.KEY };
  } else {
    // Legacy: apilayer.net + access_key в query, протокол управляется конфигом
    const base = (MBL.PROTOCOL || 'http') === 'https' ? LEGACY_URL_HTTPS : LEGACY_URL_HTTP;
    const params = new URLSearchParams({ access_key: MBL.KEY, email, smtp: '1', format: '1' }); // без catch_all
    url = `${base}?${params.toString()}`;
    headers = {}; // без apikey
  }

  const r = await httpGetJsonWithHeaders(url, headers, MBL.TIMEOUT_MS);
  if (!r || r.ok !== true) return { __mbl_err: r?.err || 'unknown' };

  const json = r.json;
  if (isOkML(json)) cachePut(mailboxCache, email, json);
  return json;
}


function pickML(ml) {
  return {
    score: ml.score,
    disposable: ml.disposable,
    role: ml.role,
    free: ml.free,
    catch_all: ml.catch_all,
    smtp_check: ml.smtp_check,
    did_you_mean: ml.did_you_mean || null,
  };
}

/**
 * 1) синтаксис → 2) DNS → 3) Mailboxlayer (если включен)
 */
async function validateEmailDeliverability(email) {
  if (!global.__mblOnce) {
  global.__mblOnce = true;
  console.log('[MBL] effective mode=%s proto=%s timeoutMs=%s',
    (MBL.MODE || 'legacy'),
    (MBL.PROTOCOL || 'http'),
    MBL.TIMEOUT_MS
  );
}
  if (!isValidEmailSyntax(email)) return { ok: false, reason: 'bad_syntax' };

  const domain = normalizeDomain(email.split('@')[1]);
  const domainOK = await checkDomainWithDig(domain);
  if (!domainOK) return { ok: false, reason: 'bad_domain' };

  if (MBL.ENABLED && MBL.KEY) {
    const ml = await mailboxLayerLookup(email);
    if (ml && !ml.error && !ml.__mbl_err) {
      // бизнес-правила
      if (MBL.BLOCK_DISPOSABLE && ml.disposable === true)
        return { ok: false, reason: 'mailboxlayer_disposable', meta: pickML(ml) };
      if (MBL.BLOCK_ROLE && ml.role === true)
        return { ok: false, reason: 'mailboxlayer_role', meta: pickML(ml) };
      if (!MBL.ACCEPT_FREE && ml.free === true)
        return { ok: false, reason: 'mailboxlayer_free_mail_blocked', meta: pickML(ml) };
      const domainLC = domain.toLowerCase();
      const BIG = new Set([
        'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com',
        'yahoo.com','icloud.com','me.com','proton.me','protonmail.com',
        'yandex.ru','yandex.com','mail.ru','bk.ru','inbox.ru','list.ru'
      ]);
      if (ml.smtp_check === false && !BIG.has(domainLC)) {
        return { ok: false, reason: 'mailboxlayer_smtp_false', meta: pickML(ml) };
      }
      // для BIG-доменов — пропускаем (только лог/мета), без блока
      if (MBL.BLOCK_CATCHALL && ml.catch_all === true)
        return { ok: false, reason: 'mailboxlayer_catch_all', meta: pickML(ml) };
      if (typeof ml.score === 'number' && ml.score < MBL.MIN_SCORE)
        return { ok: false, reason: 'mailboxlayer_low_score', meta: pickML(ml) };

      return { ok: true, meta: pickML(ml) };
    }

    // различаем: ошибка API vs недоступность сети/парсинга
    if (ml && ml.error) {
      const code = ml.error?.code || ml.error?.type || 'api_error';
      return { ok: true, reason: `mailboxlayer_error_${code}`, ml_raw: ml };
    }
    const why = ml && ml.__mbl_err ? `mailboxlayer_unavailable_${ml.__mbl_err}` : 'mailboxlayer_unavailable';
    return { ok: true, reason: why };
  }

  return { ok: true };
}

module.exports = {
  isValidEmailSyntax,
  checkDomainWithDig,
  validateEmailDeliverability,
  normalizeDomain,
};
