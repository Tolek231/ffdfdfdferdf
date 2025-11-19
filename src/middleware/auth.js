'use strict';
const { CLIENT_API_TOKEN } = require('../config');

function requireClientToken(req, res, next) {
  if (!CLIENT_API_TOKEN) return next();
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token && token === CLIENT_API_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

module.exports = { requireClientToken };
