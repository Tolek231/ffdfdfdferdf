'use strict';
const { SENDGRID_API_KEY, FROM_EMAIL, FROM_NAME, REPLY_TO, PRIMARY_MODE } = require('../config');
const { stripHtmlToText, escapeHtml } = require('../lib/helpers');

async function sendMail({ to, subject, text, html, customArgs }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY not set');
  if (!FROM_EMAIL) throw new Error('FROM_EMAIL not set');

  // Если прислан готовый HTML — используем его, а text получаем из HTML при необходимости
  let htmlBody;
  if (html && String(html).trim()) {
    htmlBody = String(html);
    if (!text || !String(text).trim()) text = stripHtmlToText(htmlBody);
  } else {
    // минимальный HTML (если PRIMARY_MODE=1), но tracking остаётся включён
    htmlBody = PRIMARY_MODE
      ? `<div>${escapeHtml(text)}</div>`
      : `<p>${escapeHtml(text)}</p>`;
  }

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: htmlBody }
    ],
    tracking_settings: { open_tracking: { enable: true } },
    custom_args: customArgs || {}
  };
  if (REPLY_TO) payload.reply_to = { email: REPLY_TO };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) throw new Error(`SendGrid error ${resp.status}: ${await resp.text()}`);
  const sgMessageId = resp.headers.get('x-message-id') || undefined;
  return { sgMessageId };
}

module.exports = { sendMail };
