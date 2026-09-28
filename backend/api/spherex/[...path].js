const express = require('express');
const cors = require('cors');
const spherexApi = require('../../spherex-api.cjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/spherex', spherexApi);

module.exports = app;
