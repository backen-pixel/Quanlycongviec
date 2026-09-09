const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { listProjectConstructionLogs } = require('../helpers/projectConstructionLogs');

const r = Router();
r.use(auth);

// GET /api/management/project-logs?project_id=&kind=&q=&date_from=&date_to=&limit=&offset=
r.get('/', async (req, res) => {
  try {
    const result = await listProjectConstructionLogs(req, req.query || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result.data);
  } catch (e) {
    console.error('[project-logs]', e);
    res.status(500).json({ error: e.message || 'Không tải được nhật ký công trình' });
  }
});

module.exports = r;
