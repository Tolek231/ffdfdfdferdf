'use strict';
const { readDB, writeDB, readConfig, rewriteOpenedNoReplyFile, appendPerIdLog } = require('../lib/helpers');
const { sendMail } = require('../email/sendgrid');
const { FOLLOWUP_TEXT } = require('../config');

async function runFollowupScheduler(tgBroadcast) {
  try {
    const db = readDB();
    const cfg = readConfig();

    const followupsEnabled = !!cfg.enableFollowup;
    const followupDelayMs = Math.max(0, Number(cfg.followupDelayMinutes || 60)) * 60 * 1000;

    // поддерживаем файл «открыто, но не ответили»
    rewriteOpenedNoReplyFile(db, cfg);

    // повторная отправка (если открыто и нет ответа)
    const now = Date.now();
    const due = followupsEnabled ? db.messages.filter(m =>
      !m.followupSentAt &&
      m.openedAt && !m.repliedAt &&
      (now - Date.parse(m.createdAt) >= followupDelayMs)
    ) : [];

    for (const m of due) {
      await sendMail({
        to: m.to,
        subject: `Re: ${m.subject}`,
        text: FOLLOWUP_TEXT,
        customArgs: { app_id: m.id, app_tag: m.tag }
      });
      m.followupSentAt = new Date().toISOString();
      tgBroadcast(`🔁 Повтор отправлен по письму #${m.tag} → ${m.to}`);
      appendPerIdLog(m, `FOLLOWUP_SENT`);
    }

    if (due.length) writeDB(db);
  } catch (e) {
    console.error('scheduler error:', e);
    if (tgBroadcast) tgBroadcast(`⚠️ Ошибка планировщика: ${String(e)}`);
  }
}

function startFollowupScheduler(tgBroadcast) {
  setInterval(() => runFollowupScheduler(tgBroadcast), 60 * 1000);
}

module.exports = { startFollowupScheduler };
