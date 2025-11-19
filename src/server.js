'use strict';

/**
 * Amvera Mailer — модульная версия
 * Основной сервер, который подключает все модули
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT } = require('./config');
const { initDB, writeDB } = require('./lib/helpers');

const app = express();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json({ limit: '10mb', type: ['application/json', 'application/*+json'] }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/*', limit: '1mb' }));

// ====== STATIC FILES ======
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// ====== ROUTES ======
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');
const metricsRoutes = require('./routes/metrics');

app.use('/api', apiRoutes);
app.use('/sendgrid', webhookRoutes);
app.use('/api', metricsRoutes);

// ====== HEALTH CHECK ======
app.get('/health', (_req, res) => res.json({ ok: true }));

// ====== SPA FALLBACK ======
app.get(/^\/(?!api|sendgrid|health).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ====== TELEGRAM BOT ======
const { initBot } = require('./bot/telegram');
const tgBroadcast = initBot();

// ====== SCHEDULER ======
const { startFollowupScheduler } = require('./scheduler/followup');
startFollowupScheduler(tgBroadcast);

// ====== GLOBAL ERROR HANDLING ======
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));
process.on('SIGTERM', () => {
  console.log('Got SIGTERM, shutting down gracefully');
  process.exit(0);
});

// ====== START SERVER ======
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`📁 Data directory: ${require('./config').DATA_DIR}`);
  console.log(`🌐 Base URL: ${require('./config').BASE_URL || 'not set'}`);
  console.log(`📧 SendGrid: ${require('./config').SENDGRID_API_KEY ? 'configured' : 'NOT configured'}`);
  console.log(`🤖 Telegram bot: ${require('./config').TELEGRAM_BOT_TOKEN ? 'enabled' : 'disabled'}`);
});
