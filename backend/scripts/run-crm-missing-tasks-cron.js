#!/usr/bin/env node
/**
 * Chạy thủ công quét bổ sung nhiệm vụ CRM thiếu (cùng logic cron 12:30 / 18:00 VN).
 * Usage: node scripts/run-crm-missing-tasks-cron.js
 */
require('dotenv').config();

const { runOnce } = require('../src/jobs/crmMissingTasksCron');

runOnce()
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    process.exit(stats?.errors ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
