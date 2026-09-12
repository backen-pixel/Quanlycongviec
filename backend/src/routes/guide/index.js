const { Router } = require('express');

const r = Router();
r.use('/', require('./copilotkit'));
module.exports = r;
