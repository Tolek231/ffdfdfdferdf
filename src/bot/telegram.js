'use strict';
const crypto = require('crypto');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_IDS, BASE_URL } = require('../config');
const { readDB, writeDB, initNextTag, tagString, appendPerIdLog } = require('../lib/helpers');
const { readTokens } = require('../lib/tokens');
const { readBlocklistSet } = require('../lib/blocklist');
const { parseCSV } = require('../lib/csvParser');
const { validateEmailDeliverability } = require('../lib/emailValidator');
const { sendMail } = require('../email/sendgrid');
const { REASON_TEXT } = require('../lib/reasonTexts');

let bot = null;
let tgBroadcast = () => {};

function initBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not set — bot disabled (OK).');
    return tgBroadcast;
  }

  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  if (!global.pendingBatches) global.pendingBatches = new Map();
  const pendingBatches = global.pendingBatches;

  let DEFAULT_SEND_DELAY_MS = 400;
  const sendDelayByChat = new Map();
  const getSendDelay = (chatId) => sendDelayByChat.get(String(chatId)) ?? DEFAULT_SEND_DELAY_MS;

  // Broadcast function
  tgBroadcast = (text) => {
    if (!bot) return;
    const db = readDB();
    const targets = new Set([...TELEGRAM_ADMIN_IDS, ...db.subscribers]);
    for (const id of targets) {
      bot.sendMessage(id, text, { disable_web_page_preview: true }).catch(() => {});
    }
  };

  // /start command
  bot.onText(/^\/start\b/i, (msg) => {
    const chatId = String(msg.chat.id);
    const db = readDB();
    if (!db.subscribers.includes(chatId)) {
      db.subscribers.push(chatId);
      writeDB(db);
    }
    const apiUrl = `${BASE_URL || ''}/api/send`;
    const howTo = [
      'Привет! Я бот-логер ✉️',
      `API: \`${apiUrl}\``,
      'Форматы: JSON { "email", "text" } или text/plain "email;Текст".',
      'Логи: ✅ подтверждение от SendGrid, 👁️ первое реальное открытие.',
      '',
      'Пришлите CSV-файл с колонками emails и analysis — затем пришлите токен (кабинет).'
    ].join('\n');
    bot.sendMessage(chatId, howTo, { parse_mode: 'Markdown' }).catch(() => {});
  });

  // Register handlers ONCE
  if (!global.__tgHandlersRegistered) {
    global.__tgHandlersRegistered = true;

    // CSV upload handler
    bot.on('document', async (msg) => {
      try {
        const chatId = String(msg.chat.id);
        const doc = msg.document;
        if (!doc) return;
        const name = (doc.file_name || '').toLowerCase();
        if (!name.endsWith('.csv')) return;

        await bot.sendMessage(chatId, `📥 Получил файл: ${doc.file_name}\nПарсю CSV...`);

        const file = await bot.getFile(doc.file_id);
        const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const resp = await fetch(url);
        const buf = Buffer.from(await resp.arrayBuffer());

        const { toSend, errors } = parseCSV(buf);

        if (errors && errors.length) {
          await bot.sendMessage(chatId, `⚠️ Ошибки парсинга: ${errors.slice(0, 3).map(e => e.message).join('; ')}`);
        }

        if (!toSend.length) {
          await bot.sendMessage(chatId, `В CSV нет валидных пар email+analysis.`);
          return;
        }

        pendingBatches.set(chatId, { toSend, createdAt: Date.now(), abort: false });
        await bot.sendMessage(chatId, '✍️ Пришлите *токен* (кабинет), чтобы я учёл статистику по нему и начал рассылку.', { parse_mode: 'Markdown' });
      } catch (err) {
        try {
          await bot.sendMessage(String(msg.chat.id), `⚠️ Ошибка обработки CSV: ${err.message || err}`);
        } catch {}
      }
    });

    // Handle token after CSV upload
    bot.on('message', async (msg) => {
      try {
        const chatId = String(msg.chat.id);
        if (!msg.text) return;
        if (String(msg.text).startsWith('/')) return;
        if (!pendingBatches.has(chatId)) return;

        const token = String(msg.text).trim();
        const batch = pendingBatches.get(chatId);
        const { toSend } = batch;

        // вычесть глобальный блок-лист и убрать дубли
        const block = readBlocklistSet();
        const seen = new Set();
        const pending = [];
        let preSkippedBlock = 0, preSkippedDup = 0;

        for (const it of toSend) {
          const e = String(it.email || '').trim().toLowerCase();
          if (!e) continue;
          if (block.has(e)) {
            preSkippedBlock++;
            continue;
          }
          if (seen.has(e)) {
            preSkippedDup++;
            continue;
          }
          seen.add(e);
          pending.push(it);
        }

        // validate token
        let tokenWarn = '';
        try {
          const set = readTokens();
          if (set.size && !set.has(token)) {
            tokenWarn = '⚠️ Такой токен не найден в конфиге. Я всё равно продолжу и учту статистику по этому значению.';
          }
        } catch (e) {}

        await bot.sendMessage(
          chatId,
          `🚀 Начинаю отправку ${pending.length} писем с токеном: ${token}\n` +
          (preSkippedBlock ? `🧱 в блоклисте: ${preSkippedBlock}\n` : '') +
          (preSkippedDup ? `🔁 дубликатов в CSV: ${preSkippedDup}\n` : '') +
          (tokenWarn || '')
        );

        let ok = 0, fail = 0, skipped = 0;
        for (const item of pending) {
          if (batch.abort) {
            break;
          }
          try {
            const email = item.email;
            const text = item.text;
            const html = item.html;
            let subject = (item.subject && String(item.subject).trim()) || 'Сообщение от вашего бота';

            if (!email || (!text && !html)) throw new Error('email and text or html required');

            // валидация email
            const verdict = await validateEmailDeliverability(email);
            if (!verdict.ok) {
              const hint = verdict?.meta?.did_you_mean ? ` (возможно, имелся в виду: ${verdict.meta.did_you_mean})` : '';
              const rtext = REASON_TEXT[verdict.reason] || verdict.reason || 'неизвестная причина';

              try {
                await bot.sendMessage(chatId, `⛔️ Пропускаю ${email}: ${rtext}${hint}`);
              } catch {}

              appendPerIdLog?.({ to: email, id: 'N/A', token }, `SKIP invalid_email: ${verdict.reason}`);

              console.info(JSON.stringify({
                evt: 'email_skip_invalid',
                to: email,
                to_domain: email.split('@')[1]?.toLowerCase() || '',
                reason: verdict.reason,
                score: verdict?.meta?.score ?? null,
                disposable: verdict?.meta?.disposable ?? null,
                role: verdict?.meta?.role ?? null,
                catch_all: verdict?.meta?.catch_all ?? null,
                smtp_check: verdict?.meta?.smtp_check ?? null,
                did_you_mean: verdict?.meta?.did_you_mean ?? null,
                token,
                ts: new Date().toISOString(),
              }));

              skipped += 1;
              continue;
            }

            // Mailboxlayer info
            const ml = verdict?.meta || null;
            let mlInfo = '';
            if (ml) {
              mlInfo = ` [MBL: score=${ml.score ?? '—'}, smtp=${ml.smtp_check === false ? 'fail' : 'ok'}, disp=${ml.disposable ? 1 : 0}, role=${ml.role ? 1 : 0}]`;
            } else {
              let status = 'unknown';
              if (verdict?.reason) {
                if (/^mailboxlayer_unavailable_/i.test(verdict.reason)) {
                  status = verdict.reason.replace(/^mailboxlayer_unavailable_?/i, 'unavail_');
                } else if (/^mailboxlayer_error_/i.test(verdict.reason)) {
                  status = verdict.reason.replace(/^mailboxlayer_error_?/i, 'err_');
                } else {
                  status = verdict.reason;
                }
              } else {
                status = 'unavail';
              }
              mlInfo = ` [MBL: ${status}]`;
              if (verdict?.ml_raw?.error) {
                console.warn('[MBL err]', JSON.stringify(verdict.ml_raw.error));
              }
            }

            const db = readDB();
            initNextTag(db);
            const id = crypto.randomUUID();
            const tag = tagString(db.meta.nextTag);

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
              deliveryStatus: null,
              openProxySuspect: false
            };
            db.messages.push(record);
            db.meta.nextTag += 1;
            writeDB(db);

            appendPerIdLog(record, `OK tag=${record.tag}${mlInfo}`);
            tgBroadcast(`✅ Отправлено (#${record.tag}) → ${record.to}${token ? ` — кабинет: ${token}` : ''}${mlInfo}`);
            ok += 1;
          } catch (e) {
            fail += 1;
            await bot.sendMessage(chatId, `❌ ${item.email}: ${e.message || e}`);
          }
          await new Promise(r => setTimeout(r, getSendDelay(chatId)));
        }

        pendingBatches.delete(chatId);
        await bot.sendMessage(chatId, (batch.abort ? `Остановлено.\n✅ отправлено: ${ok}\n⛔️ ошибок: ${fail}\n🚫 пропущено (плохой email): ${skipped}` : `Готово.\n✅ отправлено: ${ok}\n⛔️ ошибок: ${fail}\n🚫 пропущено (плохой email): ${skipped}`));
      } catch (err) {
        try {
          await bot.sendMessage(String(msg.chat.id), `⚠️ Ошибка отправки по токену: ${err.message || err}`);
        } catch {}
      }
    });

    // Commands: /delay and /stop
    bot.onText(/^\/delay\s+(\d+)\s*(ms|s)?$/i, (msg, match) => {
      const chatId = String(msg.chat.id);
      const value = parseInt(match[1], 10);
      const unit = (match[2] || 's').toLowerCase();
      let ms = value * (unit === 'ms' ? 1 : 1000);
      if (!Number.isFinite(ms) || ms < 0) ms = 0;
      sendDelayByChat.set(chatId, ms);
      bot.sendMessage(chatId, `⏱ Задержка между письмами установлена: ${ms} мс`).catch(() => {});
    });

    bot.onText(/^\/stop\b/i, (msg) => {
      const chatId = String(msg.chat.id);
      const batch = pendingBatches.get(chatId);
      if (batch) {
        batch.abort = true;
        bot.sendMessage(chatId, '⛔️ Останавливаю текущую рассылку...').catch(() => {});
      } else {
        bot.sendMessage(chatId, 'Нет активной рассылки.').catch(() => {});
      }
    });
  }

  bot.on('polling_error', err => console.error('TG polling_error:', err?.message || err));
  bot.on('webhook_error', err => console.error('TG webhook_error:', err?.message || err));

  return tgBroadcast;
}

module.exports = { initBot };
