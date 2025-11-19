'use strict';
const express = require('express');
const crypto = require('crypto');
const { validateEmailDeliverability } = require('../lib/emailValidator');
const { readDB, writeDB, initNextTag, tagString, appendTagCsv, appendPerIdLog } = require('../lib/helpers');
const { readTokens } = require('../lib/tokens');
const { readBlocklistSet } = require('../lib/blocklist');
const { sendMail } = require('../email/sendgrid');
const { incCounter } = require('../metrics/counters');
const { REASON_TEXT } = require('../lib/reasonTexts');
const { requireClientToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/send - отправка письма
router.post('/send', requireClientToken, async (req, res) => {
  try {
    let email, text, subject;
    let token = '';
    let html = '';
    
    if (typeof req.body === 'string') {
      const [e, ...rest] = req.body.split(';');
      email = (e || '').trim();
      text = rest.join(';').trim();
    } else {
      email = (req.body.email || '').trim();
      text = (req.body.text || '').trim();
      subject = (req.body.subject || '').trim();
      token = (req.body.token || '').trim();
      html = (req.body.html || '').toString();
    }
    
    if (!email || (!text && !html)) {
      return res.status(400).json({ error: 'email and text or html required' });
    }
    
    const tokenSet = readTokens();
    if (token && tokenSet.size && !tokenSet.has(token)) {
      return res.status(400).json({ error: 'unknown token' });
    }
    
    subject = subject || 'Сообщение от вашего бота';

    const db = readDB();
    const id = crypto.randomUUID();

    db.meta = db.meta || { nextTag: 1 };
    initNextTag(db);
    const tag = tagString(db.meta.nextTag);

    // блок-лист
    const block = readBlocklistSet();
    if (block.has(email.toLowerCase())) {
      return res.status(409).json({ error: 'email_in_blocklist' });
    }

    // валидация email
    const verdict = await validateEmailDeliverability(email);
    if (!verdict.ok) {
      const rtext = REASON_TEXT[verdict.reason] || verdict.reason || 'неизвестная причина';
      const hint = verdict?.meta?.did_you_mean ? ` (возможно: ${verdict.meta.did_you_mean})` : '';
      return res.status(400).json({ error: `invalid_email: ${rtext}${hint}` });
    }

    // Собираем короткий тег статуса для логов
    let mlInfo = '';
    if (verdict?.meta) {
      const ml = verdict.meta;
      mlInfo = ` [MBL: score=${ml.score ?? '—'}, smtp=${ml.smtp_check === false ? 'fail' : 'ok'}, disp=${ml.disposable ? 1 : 0}, role=${ml.role ? 1 : 0}]`;
    } else if (verdict?.reason) {
      let status = verdict.reason;
      if (/^mailboxlayer_unavailable_/i.test(status)) status = status.replace(/^mailboxlayer_unavailable_?/i, 'unavail_');
      if (/^mailboxlayer_error_/i.test(status)) status = status.replace(/^mailboxlayer_error_?/i, 'err_');
      mlInfo = ` [MBL: ${status}]`;
    }
    
    if (verdict?.ml_raw?.error) {
      console.warn('[MBL err]', JSON.stringify(verdict.ml_raw.error));
    }

    const { sgMessageId } = await sendMail({
      to: email,
      subject,
      text,
      html,
      customArgs: { app_id: id, app_tag: tag, app_token: token || undefined }
    });

    const record = {
      id,
      tag,
      token: (token || null),
      to: email,
      subject,
      text,
      sgMessageId,
      createdAt: new Date().toISOString(),
      openedAt: null,
      repliedAt: null,
      followupSentAt: null,
      sentLogged: false,
      openedLogged: false,
      openCount: 0,
      firstOpenAt: null,
      lastOpenAt: null
    };

    db.messages.push(record);
    db.meta.nextTag += 1;
    writeDB(db);

    appendTagCsv(tag, record);
    appendPerIdLog(record, `REQUEST to=${email} subject=${subject} text=${String(text).replace(/\s+/g, ' ').slice(0, 500)}${mlInfo}`);

    return res.json({
      ok: true,
      id,
      tag,
      to: email,
      sgMessageId,
      mbl: mlInfo.replace(/^ \[MBL: |\]$/g, '')
    });
  } catch (e) {
    console.error('API send error:', e);
    return res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
