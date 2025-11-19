# Структура проекта

## Корневая директория

```
.
├── src/                    # Исходный код
├── public/                 # Статические файлы (веб-дашборд)
├── scripts/                # Вспомогательные скрипты
├── docs/                   # Документация
├── .github/                # GitHub Actions
├── package.json            # Зависимости Node.js
├── Dockerfile              # Docker-образ
├── .env.example            # Пример конфигурации
└── README.md               # Главная документация
```

## Директория src/

### Главные файлы
- **server.js** — точка входа, инициализация Express и всех модулей
- **config.js** — чтение конфигурации из ENV переменных

### routes/ — HTTP маршруты
- **api.js** — `POST /api/send` (отправка писем)
- **webhooks.js** — вебхуки SendGrid (events, inbound)
- **metrics.js** — `GET /api/series` (метрики для дашборда)

### bot/ — Telegram бот
- **telegram.js** — инициализация бота, обработка команд и CSV

### email/ — Отправка писем
- **sendgrid.js** — интеграция с SendGrid API

### lib/ — Утилиты и библиотеки
- **helpers.js** — общие функции (DB, HTML, логи)
- **storage.js** — пути к файлам данных
- **tokens.js** — работа с токенами кабинетов
- **blocklist.js** — чтение блок-листов
- **csvParser.js** — парсинг CSV с умным определением кодировки
- **emailValidator.js** — валидация email (DNS + Mailboxlayer)
- **reasonTexts.js** — человекочитаемые тексты ошибок

### metrics/ — Метрики
- **counters.js** — счётчики sent/delivered/opens по датам и токенам

### middleware/ — Express middleware
- **auth.js** — проверка CLIENT_API_TOKEN

### scheduler/ — Фоновые задачи
- **followup.js** — автоматическая повторная отправка писем

### blacklists/ — Блок-листы
- **do_not_send.csv** — email-адреса для блокировки

### config/ — Конфигурационные файлы
- **emailValidation.json** — настройки валидации email

## Директория public/

- **index.html** — веб-дашборд с метриками
- **public-tg.html** — Telegram Mini App
- **local_extras.json** — дополнительные данные для дашборда

## Директория docs/

- **API.md** — описание HTTP API

## Файлы данных (DATA_DIR)

Создаются автоматически при первом запуске:

```
DATA_DIR/
├── db.json                 # Основная БД
├── counters.json           # Счётчики метрик
├── tokens                  # Список токенов
├── config.json             # Настройки
├── tags.csv                # CSV-лог отправок
├── opened_no_reply.txt     # Открытые без ответа
├── activity.log            # Общий лог
└── logs/                   # Логи по каждому письму
    └── {uuid}.log
```

## Потоки данных

### Отправка письма
```
Client → routes/api.js → lib/emailValidator.js → email/sendgrid.js → SendGrid
                      ↓
                lib/storage.js (db.json)
```

### Обработка событий
```
SendGrid → routes/webhooks.js → metrics/counters.js → counters.json
                              ↓
                        bot/telegram.js (уведомления)
```

### Метрики для дашборда
```
public/index.html → routes/metrics.js → metrics/counters.js → counters.json
```

### Telegram рассылка
```
User → bot/telegram.js → lib/csvParser.js → lib/emailValidator.js → email/sendgrid.js
```

## Модульность

Каждый модуль независим и экспортирует только необходимые функции:
- Легко тестировать
- Легко заменять реализацию
- Понятная структура зависимостей
- Нет дублирования кода

## Расширение функциональности

### Добавить новый роут
1. Создать файл в `src/routes/`
2. Подключить в `src/server.js`

### Добавить новый источник данных
1. Создать модуль в `src/lib/`
2. Использовать в нужных роутах

### Изменить логику отправки
1. Отредактировать `src/email/sendgrid.js`
2. Или создать альтернативный модуль

### Добавить новую метрику
1. Расширить `src/metrics/counters.js`
2. Обновить `src/routes/metrics.js`
