'use strict';

// Человекочитаемые тексты для причин отказа
const REASON_TEXT = {
  bad_syntax: 'невалидный синтаксис',
  bad_domain: 'домен не резолвится (нет MX/A/AAAA)',
  mailboxlayer_disposable: 'временная/одноразовая почта (disposable)',
  mailboxlayer_role: 'рольевой адрес (info@, admin@ и т.п.)',
  mailboxlayer_free_mail_blocked: 'блокируем бесплатные провайдеры по настройке',
  mailboxlayer_smtp_false: 'SMTP-проверка не прошла',
  mailboxlayer_catch_all: 'catch-all домен (настроено блокировать)',
  mailboxlayer_low_score: 'низкий Mailboxlayer score',
  mailboxlayer_unavailable: 'Mailboxlayer недоступен (не блокируем)',
};

module.exports = { REASON_TEXT };
