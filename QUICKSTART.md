# 🚀 Быстрый старт

## За 3 минуты

### 1. Установка (30 сек)
```bash
npm install
```

### 2. Конфигурация (1 мин)
```bash
cp .env.example .env
```

Отредактируйте `.env` и укажите минимум:
```bash
SENDGRID_API_KEY=SG.xxxxx
FROM_EMAIL=your@email.com
```

### 3. Запуск (10 сек)
```bash
npm start
```

Должно вывести:
```
✅ Server listening on port 3000
📧 SendGrid: configured
```

### 4. Проверка (30 сек)
```bash
# Health check
curl http://localhost:3000/health

# Отправка тестового письма
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","text":"Hello!"}'

# Веб-дашборд
open http://localhost:3000/
```

**Готово! 🎉**

---

## Дополнительно

### Telegram бот (опционально)
Добавьте в `.env`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_IDS=123456789
```

Отправьте `/start` вашему боту.

### Mailboxlayer (опционально)
Для продвинутой валидации email:
```bash
MAILBOXLAYER_API_KEY=your_key
```

### Docker
```bash
docker build -t sender .
docker run -p 3000:3000 --env-file .env sender
```

---

## Что дальше?

- 📖 Читайте [README.md](README.md) для полного описания
- 🏗️ Смотрите [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) для понимания структуры
- 📚 Изучайте [docs/API.md](docs/API.md) для работы с API
- 🤝 Читайте [CONTRIBUTING.md](CONTRIBUTING.md) для разработки

---

## Проблемы?

### Ошибка: "Cannot find module"
```bash
npm install
```

### Ошибка: "SENDGRID_API_KEY not set"
Добавьте ключ в `.env`:
```bash
SENDGRID_API_KEY=SG.xxxxx
```

### Порт занят
Измените порт в `.env`:
```bash
PORT=8080
```

### Другие проблемы
См. [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) → раздел "Troubleshooting"

---

**Нужна помощь? Откройте issue в репозитории!**
