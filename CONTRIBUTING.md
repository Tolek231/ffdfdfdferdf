# Руководство для разработчиков

## Правила разработки

### Коммиты
- Используйте атомарные коммиты: `type(scope): summary`
- Примеры:
  - `feat(api): add email validation`
  - `fix(bot): handle CSV parsing errors`
  - `docs(readme): update installation guide`
  - `refactor(routes): split monolithic server`

### Перед коммитом
1. Убедитесь, что `npm start` запускается без ошибок
2. Проверьте, что все тесты проходят (если есть)
3. Проверьте форматирование кода
4. Обновите документацию, если изменили API

### Стиль кода
- Используйте `'use strict';` в начале каждого файла
- 2 пробела для отступов
- Точка с запятой обязательна
- Константы в UPPER_CASE
- Функции в camelCase
- Модули экспортируют объект с функциями

## Структура проекта

См. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) для детального описания.

### Где что лежит
- **src/server.js** — точка входа, инициализация
- **src/routes/** — HTTP маршруты (api, webhooks, metrics)
- **src/bot/** — Telegram бот
- **src/email/** — отправка писем
- **src/lib/** — утилиты и библиотеки
- **src/metrics/** — счётчики и метрики
- **src/middleware/** — Express middleware
- **src/scheduler/** — фоновые задачи

## Добавление новой функциональности

### Новый HTTP эндпоинт
1. Создайте функцию в соответствующем файле `src/routes/`
2. Или создайте новый файл роутов
3. Подключите в `src/server.js`
4. Обновите `docs/API.md`

Пример:
```javascript
// src/routes/myroute.js
const express = require('express');
const router = express.Router();

router.get('/my-endpoint', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
```

```javascript
// src/server.js
const myRoute = require('./routes/myroute');
app.use('/api', myRoute);
```

### Новая утилита
1. Создайте файл в `src/lib/`
2. Экспортируйте функции через `module.exports`
3. Импортируйте где нужно

Пример:
```javascript
// src/lib/myutil.js
'use strict';

function myFunction(arg) {
  return arg.toUpperCase();
}

module.exports = { myFunction };
```

### Новая метрика
1. Добавьте поле в `src/metrics/counters.js`
2. Обновите `incCounter()` для учёта новой метрики
3. Обновите `src/routes/metrics.js` для возврата данных
4. Обновите фронтенд в `public/index.html`

## Тестирование

### Локальное тестирование
```bash
# Запуск сервера
npm start

# Проверка health
curl http://localhost:3000/health

# Отправка тестового письма
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","text":"Test"}'
```

### Проверка Telegram бота
1. Отправьте `/start` боту
2. Загрузите тестовый CSV
3. Отправьте токен
4. Проверьте логи

## Безопасность

### Никогда не коммитьте
- ❌ API ключи
- ❌ Токены
- ❌ Пароли
- ❌ Реальные email-адреса
- ❌ Файл `.env`

### Всегда используйте
- ✅ `.env.example` для примеров
- ✅ Плейсхолдеры типа `__SET_ME__`
- ✅ ENV переменные для секретов
- ✅ `.gitignore` для чувствительных файлов

## Документация

### Обновляйте при изменениях
- `README.md` — общее описание
- `ARCHITECTURE.md` — архитектура
- `docs/API.md` — API эндпоинты
- `PROJECT_STRUCTURE.md` — структура файлов

### Комментарии в коде
- Комментируйте сложную логику
- Объясняйте "почему", а не "что"
- Используйте JSDoc для функций

Пример:
```javascript
/**
 * Validates email deliverability using DNS and Mailboxlayer
 * @param {string} email - Email address to validate
 * @returns {Promise<{ok: boolean, reason?: string, meta?: object}>}
 */
async function validateEmailDeliverability(email) {
  // ...
}
```

## Обработка ошибок

### Всегда оборачивайте в try-catch
```javascript
router.post('/endpoint', async (req, res) => {
  try {
    // ваш код
    res.json({ ok: true });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: String(e) });
  }
});
```

### Логируйте ошибки
```javascript
console.error('Error in function:', e);
appendPerIdLog(record, `ERROR: ${e.message}`);
```

## Вопросы?

Если что-то непонятно:
1. Прочитайте документацию в `docs/`
2. Посмотрите примеры в существующем коде
3. Спросите в команде
4. Откройте issue
