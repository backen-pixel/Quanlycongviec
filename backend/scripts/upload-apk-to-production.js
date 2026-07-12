/**
 * Upload APK lên server production (Render) — tương đương web admin.
 *
 *   node scripts/upload-apk-to-production.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const axios = require('axios');
const FormData = require('form-data');

const DEFAULT_API = (
  process.env.UPLOAD_API_URL
  || process.env.PUBLIC_API_URL
  || 'https://tubep-backend.onrender.com'
).replace(/\/$/, '');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

async function login(base, email, password) {
  const { data } = await axios.post(`${base}/api/auth/login`, { email, password });
  if (!data.token) throw new Error('Login không trả token');
  return data.token;
}

async function getAdminToken(base) {
  if (process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN) {
    return process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN;
  }
  if (process.env.JWT_SECRET) {
    const { supabase } = require('../src/config/supabase');
    const { data: user } = await supabase
      .from('users')
      .select('id, email, role, full_name, company_id, department_id')
      .eq('role', 'admin')
      .neq('is_active', false)
      .order('email')
      .limit(1)
      .maybeSingle();
    if (user) {
      const jwt = require('jsonwebtoken');
      return jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        company_id: user.company_id || null,
        department_id: user.department_id || null,
        crm_region_ids: [],
      }, process.env.JWT_SECRET);
    }
  }
  const email = process.env.UPLOAD_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.UPLOAD_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Thiếu credentials. Cần JWT_SECRET + Supabase, hoặc UPLOAD_ADMIN_EMAIL/PASSWORD, hoặc UPLOAD_AUTH_TOKEN.',
    );
  }
  console.log('> Đăng nhập admin...');
  return login(base, email, password);
}

async function uploadRelease(base, token, releaseId, filePath, meta) {
  const fd = new FormData();
  fd.append('version', meta.version);
  fd.append('version_code', String(meta.versionCode));
  fd.append('channel', meta.channel || 'production');
  fd.append('is_mandatory', String(meta.mandatory === true));
  fd.append('is_active', 'true');
  if (meta.releaseNotes) fd.append('release_notes', meta.releaseNotes);
  fd.append(
    'file',
    fs.createReadStream(filePath),
    {
      filename: path.basename(filePath),
      contentType: 'application/vnd.android.package-archive',
    },
  );

  const { data } = await axios.put(`${base}/api/app-updates/releases/${releaseId}`, fd, {
    headers: { ...fd.getHeaders(), Authorization: `Bearer ${token}` },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 600000,
  });
  return data;
}

async function main() {
  const args = parseArgs();
  const releaseId = args.release || args.release_id || 'ba91d47e-a8e7-4e4f-bb86-a435afe9d3d7';
  const filePath = args.file
    || path.join(__dirname, '../uploads/app-releases/crm-mobile-v2/crm-mobile-v2-2.0.23-code24-release.apk');
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error('Không thấy file APK:', abs);
    process.exit(1);
  }

  const base = (args.api || DEFAULT_API).replace(/\/$/, '');
  const version = args.version || '2.0.23';
  const versionCode = parseInt(args.version_code || args.versionCode || '24', 10);
  const fileSize = fs.statSync(abs).size;

  const token = await getAdminToken(base);
  console.log(`> Upload ${path.basename(abs)} (${(fileSize / 1024 / 1024).toFixed(2)} MB) → ${base}`);

  const updated = await uploadRelease(base, token, releaseId, abs, {
    version,
    versionCode,
    channel: args.channel || 'production',
    mandatory: args.mandatory === true || args.mandatory === 'true',
    releaseNotes: args.notes || args.release_notes || '',
  });

  console.log('✓ Upload thành công');
  console.log('  version :', updated.version, `(code ${updated.version_code})`);
  console.log('  size    :', updated.file_size);
  console.log('  file_url:', updated.file_url);

  const dl = `${base}/api/app-updates/download/${releaseId}`;
  const head = await axios.head(dl);
  console.log('> Download HEAD', head.status, head.headers['content-length'], head.headers['content-type']);
  if (head.status !== 200) process.exit(2);
  console.log('✓ APK đã sẵn sàng trên production.');
}

main().catch((e) => {
  console.error('❌', e.response?.data?.error || e.message || e);
  process.exit(1);
});
