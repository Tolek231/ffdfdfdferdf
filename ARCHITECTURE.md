# Архитектура

## Структура проекта

```
src/
├── server.js              # Главный файл сервера
├── config.js              # Конфигурация из ENV
├── routes/                # HTTP маршруты
│   ├── api.js            # POST /api/send
│   ├── webhooks.js       # POST /sendgrid/events, /sendgrid/inbound
│   └── metrics.js        # GET /api/series
├── bot/                   # Telegram бот
│   └── telegram.js       # Инициализация и обработчики бота
├── email/                 # Отправка писем
│   └── sendgrid.js       # Интеграция с SendGrid API
├── lib/                   # Утилиты
│   ├── helpers.js        # Общие функции
│   ├── storage.js        # Пути к файлам данных
│   ├── tokens.js         # Работа с токенами
│   ├── blocklist.js      # Блок-лист email
│   ├── csvParser.js      # Парсинг CSV файлов
│   ├── emailValidator.js # Валидация email (DNS + Mailboxlayer)
│   └── reasonTexts.js    # Тексты причин отказа
├── metrics/               # Метрики и счётчики
│   └── counters.js       # Счётчики sent/delivered/opens
├── middleware/            # Express middleware
│   └── auth.js           # Проверка CLIENT_API_TOKEN
├── scheduler/             # Фоновые задачи
│   └── followup.js       # Повторная отправка писем
└── blacklists/            # Блок-листы
    └── do_not_send.csv   # Email для блокировки
```

## Поток событий

### 1. Отправка письма
- Клиент → `POST /api/send` (routes/api.js)
- Проверка токена (middleware/auth.js)
- Проверка блок-листа (lib/blocklist.js)
- Валидация email (lib/emailValidator.js)
- Отправка через SendGrid (email/sendgrid.js)
- Сохранение в DB (lib/storage.js)

### 2. Обработка событий SendGrid
- SendGrid → `POST /sendgrid/events` (routes/webhooks.js)
- События: `processed`, `delivered`, `open`, `bounce`
- Обновление счётчиков (metrics/counters.js)
- Уведомления в Telegram (bot/telegram.js)

### 3. Входящие ответы
- Email → SendGrid Inbound Parse → `POST /sendgrid/inbound` (routes/webhooks.js)
- Поиск оригинального письма по Message-ID
- Отметка `repliedAt` в DB

### 4. Метрики для фронтенда
- Фронт → `GET /api/series?days=30&token=xxx` (routes/metrics.js)
- Чтение counters.json (metrics/counters.js)
- Возврат серий по датам

## Данные

### Файлы в DATA_DIR
- `db.json` — основная БД (messages, subscribers, meta)
- `counters.json` — агрегаты по датам/токенам
- `tokens` — список токенов кабинетов (по одному в строке)
- `config.json` — настройки (followupDelayMinutes и т.д.)
- `tags.csv` — CSV-лог отправленных писем
- `opened_no_reply.txt` — письма, открытые без ответа
- `logs/` — логи по каждому письму (по ID)
- `activity.log` — общий лог активности

## Конфигурация

Все настройки читаются из ENV переменных через `src/config.js`:
- SendGrid: `SENDGRID_API_KEY`, `FROM_EMAIL`, `FROM_NAME`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`
- Mailboxlayer: `MAILBOXLAYER_API_KEY`
- Безопасность: `CLIENT_API_TOKEN`, `INBOUND_PARSE_SECRET`

Дополнительные настройки в `src/config/emailValidation.json`.
