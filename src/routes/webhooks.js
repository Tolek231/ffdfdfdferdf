'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { readDB, writeDB, readConfig, rewriteOpenedNoReplyFile, appendPerIdLog, isHardBotUA, isSoftProxyUA } = require('../lib/helpers');
const { incCounter } = require('../metrics/counters');
const { DATA_DIR, DEBUG_EVENTS, INBOUND_PARSE_SECRET, OPEN_PROXY_MIN_SECONDS, OPEN_MIN_OPENS_SOFT, OPEN_HARD_IGNORE_UA, OPEN_SOFT_PROXY_UA } = require('../config');

const router = express.Router();

// Регулярные выражения для фильтрации UA
const HARD_IGNORE_UA_REGEX = new RegExp(OPEN_HARD_IGNORE_UA, 'i');
const SOFT_PROXY_UA_REGEX = new RegExp(OPEN_SOFT_PROXY_UA, 'i');

// POST /sendgrid/events - вебхук событий SendGrid
router.post('/events', express.json({ type: '*/*' }), (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [];
    if (!events.length) return res.json({ ok: true });

    const db = readDB();
    let touched = false;

    if (DEBUG_EVENTS) {
      try {
        fs.appendFileSync(path.join(DATA_DIR, 'events.log'), JSON.stringify(events) + '\n');
      } catch {}
    }

    for (const ev of events) {
      const type = ev.event;
      const msgId = ev.sg_message_id || ev.sg_message_id_legacy || ev['sg_message_id'] || ev.message_id;
      const appId = ev.custom_args?.app_id || ev.custom_args?.['app_id'];
      const appTag = ev.custom_args?.app_tag || ev.custom_args?.['app_tag'];
      const email = (ev.email || '').toLowerCase();

      // найти письмо
      let m = null;
      if (appId) m = db.messages.find(x => x.id === appId);
      if (!m && appTag) m = db.messages.find(x => x.tag === appTag);
      if (!m && msgId) m = db.messages.find(x => x.sgMessageId && x.sgMessageId === msgId);
      if (!m && email) {
        m = db.messages.filter(x => x.to.toLowerCase() === email)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      }
      
      if (!m) {
        if (DEBUG_EVENTS) appendPerIdLog({ id: 'unknown', to: email }, `EVENT ${type} email=${email}`);
        continue;
      }

      // processed
      if ((type === 'processed') && !m.sentLogged) {
        m.sentLogged = true;
        m.sentAt = ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : new Date().toISOString();
        m.sentStatus = type;
        touched = true;
        appendPerIdLog(m, `SENDGRID_${type.toUpperCase()} to=${m.to}`);
        try {
          incCounter('sent', ev.timestamp ? new Date(Number(ev.timestamp) * 1000) : new Date(), m.token || null);
        } catch {}
      }

      // delivered
      if (type === 'delivered' && !m.deliveredLogged) {
        const tsDate = ev.timestamp ? new Date(Number(ev.timestamp) * 1000) : new Date();
        m.deliveredLogged = true;
        m.deliveredAt = tsDate.toISOString();
        m.deliveryStatus = 'delivered';
        m.deliveryUpdatedAt = tsDate.toISOString();
        touched = true;
        try {
          incCounter('delivered', tsDate, m.token || null);
        } catch {}
        appendPerIdLog(m, `DELIVERED_CONFIRM to=${m.to}`);
      }

      // bounce/dropped/blocked/deferred
      if (type === 'bounce' || type === 'dropped' || type === 'blocked' || type === 'deferred') {
        const reason = ev.reason || ev.response || ev['smtp-id'] || '';
        const tsDate = ev.timestamp ? new Date(Number(ev.timestamp) * 1000) : new Date();
        m.deliveryStatus = type;
        m.deliveryUpdatedAt = tsDate.toISOString();
        if (reason) m.deliveryReason = reason;
        touched = true;
        appendPerIdLog(m, `FAIL SendGrid: ${type}${reason ? ` — ${reason}` : ''}`);
        continue;
      }

      // open
      if (type === 'open') {
        const ua = ev.useragent || '';
        const ts = ev.timestamp ? Number(ev.timestamp) * 1000 : Date.now();

        if (isHardBotUA(ua, HARD_IGNORE_UA_REGEX)) {
          if (DEBUG_EVENTS) appendPerIdLog(m, `OPEN_IGNORE_HARD_UA ua="${ua.slice(0, 120)}"`);
          continue;
        }

        m.openCount = (m.openCount || 0) + 1;
        if (!m.firstOpenAt) m.firstOpenAt = new Date(ts).toISOString();
        m.lastOpenAt = new Date(ts).toISOString();
        touched = true;

        if (m.openedAt) continue;

        const sentTs = m.sentAt ? Date.parse(m.sentAt) : 0;
        const ageSec = sentTs ? Math.floor((ts - sentTs) / 1000) : 0;
        const softUA = isSoftProxyUA(ua, SOFT_PROXY_UA_REGEX);

        const realOpen =
          (!softUA) ||
          (softUA && (ageSec >= OPEN_PROXY_MIN_SECONDS)) ||
          (softUA && (m.openCount >= OPEN_MIN_OPENS_SOFT));

        if (!realOpen) {
          if (DEBUG_EVENTS) appendPerIdLog(m, `OPEN_DEFER ua="${ua.slice(0, 120)}" age=${ageSec}s count=${m.openCount}`);
          continue;
        }

        m.openedAt = new Date(ts).toISOString();
        m.openedLogged = true;
        touched = true;
        appendPerIdLog(m, `OPEN_CONFIRMED ua="${ua.slice(0, 120)}" age=${ageSec}s count=${m.openCount}`);
        try {
          incCounter('opens', ts ? new Date(ts) : new Date(), m.token || null);
        } catch {}
      }
    }

    if (touched) {
      writeDB(db);
      const cfg = readConfig();
      rewriteOpenedNoReplyFile(db, cfg);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('events handler error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /sendgrid/inbound - вебхук входящих писем
router.post('/inbound', (req, res) => {
  try {
    if ((req.query.secret || '') !== (INBOUND_PARSE_SECRET || '')) {
      return res.status(403).json({ error: 'wrong secret' });
    }
    
    const payload = req.body || {};
    const headers = payload.headers || {};
    const inReplyTo = headers['In-Reply-To'] || payload['in-reply-to'] || '';
    const references = headers['References'] || payload['references'] || '';

    const db = readDB();
    const allRefs = String(inReplyTo) + ' ' + String(references);
    const match = allRefs.match(/<([A-Za-z0-9\-\._]+@.*?)>/);
    const toEmail = (payload.to && payload.to[0] && payload.to[0].email) || payload.to || '';

    let updated = false;
    let msgMatched = null;

    if (match) {
      const refId = match[1];
      const m = db.messages.find(m => (m.sgMessageId && refId.includes(m.sgMessageId)));
      if (m) {
        m.repliedAt = new Date().toISOString();
        updated = true;
        msgMatched = m;
      }
    }
    
    if (!updated && toEmail) {
      const candidates = db.messages
        .filter(m => m.to.toLowerCase() === String(toEmail).toLowerCase() && !m.repliedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (candidates[0]) {
        candidates[0].repliedAt = new Date().toISOString();
        updated = true;
        msgMatched = candidates[0];
      }
    }

    if (updated) {
      writeDB(db);
      const cfg = readConfig();
      rewriteOpenedNoReplyFile(db, cfg);
      if (msgMatched) {
        appendPerIdLog(msgMatched, `REPLY received`);
      }
    }
    
    return res.json({ ok: true, matched: updated });
  } catch (e) {
    console.error('inbound handler error:', e);
    return res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
