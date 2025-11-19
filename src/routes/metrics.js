'use strict';
const express = require('express');
const { readCounters } = require('../metrics/counters');
const { readTokens } = require('../lib/tokens');

const router = express.Router();

// GET /api/series - возвращает series за N дней
router.get('/series', (req, res) => {
  try {
    const days = Math.max(1, Math.min(3650, Number(req.query.days) || 30));
    const counters = readCounters();
    const token = (req.query.token || '').trim();
    const tokenSet = readTokens();
    
    let byDate = counters.byDate || {};
    if (token) {
      if (tokenSet.size && !tokenSet.has(token)) {
        byDate = {}; // неизвестный токен -> пустая статистика
      } else {
        byDate = (counters.byToken && counters.byToken[token] && counters.byToken[token].byDate) || {};
      }
    }
    
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const dates = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    
    const mkSeries = (key) => dates.map(date => ({ date, value: (byDate[date]?.[key] || 0) }));
    
    const payload = {
      period: dates[0] + ".." + dates[dates.length - 1],
      series: {
        sent: mkSeries('sent'),
        delivered: mkSeries('delivered'),
        opens: mkSeries('opens'),
        replies: dates.map(date => ({ date, value: 0 })), // берутся из local_extras.json на фронте
        bounces: dates.map(date => ({ date, value: 0 }))
      },
      industries: []
    };
    
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
