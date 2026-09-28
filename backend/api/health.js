const express = require('express');

const app = express();
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

module.exports = app;
