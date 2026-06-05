#!/usr/bin/env node
/**
 * In FCM_SA_JSON một dòng để dán vào Render → Environment (Secret).
 * Nguồn: secrets/firebase-sa.json hoặc FCM_SA_JSON_PATH hiện tại.
 *
 * Usage: node scripts/print-fcm-env.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let sa;
if (process.env.FCM_SA_JSON) {
  sa = JSON.parse(process.env.FCM_SA_JSON);
} else {
  const p = path.join(__dirname, '../secrets/firebase-sa.json');
  if (!fs.existsSync(p)) {
    console.error('Không tìm thấy secrets/firebase-sa.json hoặc FCM_SA_JSON trong .env');
    process.exit(1);
  }
  sa = JSON.parse(fs.readFileSync(p, 'utf8'));
}

console.log('');
console.log('=== Render: thêm biến FCM_SA_JSON (Secret) ===');
console.log('project_id:', sa.project_id);
console.log('');
console.log(JSON.stringify(sa));
console.log('');
