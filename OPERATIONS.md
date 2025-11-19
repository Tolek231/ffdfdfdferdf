# Операции и деплой

## Локальный запуск
```bash
cp .env.example .env   # заполните значениями
npm ci || npm i
npm start
```

## Amvera
- Реальные значения ENV храните в Amvera (UI/конфиги).
- Вебхуки SendGrid:
  - Event Webhook → `POST {BASE_URL}/sendgrid/events`
  - Inbound Parse → `POST {BASE_URL}/sendgrid/inbound`
- Смонтируйте том `DATA_DIR` (по умолчанию `/data`).

## Резервное копирование
Бэкапьте каталог `DATA_DIR` (особенно `counters.json` и `tokens`).

## Диагностика
- `/health` — проверка живости.
- Логи Telegram для основных событий отправки/открытия.
