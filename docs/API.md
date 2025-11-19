# API (кратко)

## POST /api/send
Отправка письма.
- Body: JSON или `text/plain`
  - JSON: `{ email, subject?, text?, html?, token? }` (нужно `text` или `html`)
  - String: `"email;message"`
- Ответ: `{ ok: true, id, tag, to, sgMessageId }`

## GET /api/series?days=30&token=optional
Возвращает серии метрик по дням (sent, delivered, opens).

## POST /sendgrid/events
Вебхук событий SendGrid (`processed`, `delivered`, `open`).
- Тело: массив событий SG.
- Обновляет счётчики, шлёт уведомления в Telegram.

## POST /sendgrid/inbound
Inbound Parse вебхук — обработка входящих ответов.

## GET /health
Health-check.
