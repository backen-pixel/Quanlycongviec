const { spawnSync } = require('child_process');
const axios = require('axios');
const path = require('path');

const base = (process.env.UPLOAD_API_URL || 'https://tubep-backend.onrender.com').replace(/\/$/, '');
const releaseId = process.argv[2];
const apk = process.argv[3];
const version = process.argv[4] || '1.0.57';
const versionCode = process.argv[5] || '60';
const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || '12', 10);

if (!releaseId || !apk) {
  console.error('Usage: node retry-upload-apk.js <releaseId> <apkPath> [version] [versionCode]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const h = await axios.get(`${base}/api/health`, { timeout: 25000, validateStatus: () => true });
      console.log(`\n[${i}/${maxAttempts}] health → ${h.status}`);
      if (h.status !== 200) {
        await sleep(30000);
        continue;
      }

      const r = spawnSync(
        process.execPath,
        [
          path.join(__dirname, 'upload-apk-to-production.js'),
          '--release', releaseId,
          '--file', apk,
          '--version', version,
          '--version-code', versionCode,
        ],
        { stdio: 'inherit', cwd: path.join(__dirname, '..'), env: process.env },
      );
      if (r.status === 0) {
        console.log('\n✓ Upload hoàn tất.');
        process.exit(0);
      }
    } catch (e) {
      console.log(`[${i}/${maxAttempts}] lỗi:`, e.message);
    }
    await sleep(30000);
  }
  console.error('\n❌ Hết số lần thử upload.');
  process.exit(1);
})();
