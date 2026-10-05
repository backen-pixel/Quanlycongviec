/**
 * Đưa HST tenant slug=nextgo vào dùng trên cùng app (không xóa dữ liệu HST mặc định).
 * - Tạo admin cao nhất HST (role admin, có tenant_id, không company_id)
 * - Chuyển NV: email gốc → user clone; user cũ đổi +oldhst và tắt (giữ FK)
 * - Gắn fanpage NextGo (page_id unique) sang công ty HST mới + remap pipeline/owner
 *
 *   node scripts/provision-nextgo-ecosystem-live.js --dry-run
 *   node scripts/provision-nextgo-ecosystem-live.js --apply
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const spec = require('./lib/nextgoInstanceSpec');

const APPLY = process.argv.includes('--apply');
const ADMIN_EMAIL = 'quantri.hst@nextgo.vn';
const ADMIN_NAME = 'Quản trị hệ sinh thái NextGo';
const MAP_FILE = path.join(__dirname, '..', 'uploads', '_nextgo_clone_id_map.json');

const STAFF_EMAILS = [
  'bienanhphap@nextgo.vn',
  'haihien@nextgo.vn',
  'luonggiayen@gmail.com',
  'maithanhtruyen12@gmail.com',
  'ngoctrinh@nextgo.vn',
  'tranthingochan@nextgo.vn',
];

function norm(e) {
  return String(e || '').trim().toLowerCase();
}

function aliasOf(email) {
  const s = norm(email);
  const at = s.lastIndexOf('@');
  return `${s.slice(0, at)}+ngclone${s.slice(at)}`;
}

function oldHstOf(email) {
  const s = norm(email);
  const at = s.lastIndexOf('@');
  return `${s.slice(0, at)}+oldhst${s.slice(at)}`;
}

function mapId(maps, kind, oldId) {
  if (!oldId) return null;
  const m = Object.fromEntries(maps[kind] || []);
  return m[oldId] || null;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const maps = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')).maps || {};
  const tenantId = spec.CLONE_TENANT_ID;
  const newCompanyId = spec.CLONE_COMPANY_ID;

  console.log(APPLY ? '=== APPLY HST NextGo ===' : '=== DRY-RUN ===');
  console.log('Tenant', tenantId, 'company', newCompanyId);

  const { data: users, error: uErr } = await sb.from('users').select('id, email, full_name, role, is_active, company_id, tenant_id, password');
  if (uErr) throw uErr;
  const byEmail = new Map((users || []).map((u) => [norm(u.email), u]));

  let admin = byEmail.get(ADMIN_EMAIL);
  const adminPassword = admin ? null : `NgHst-${crypto.randomBytes(4).toString('hex')}`;
  if (!admin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    const row = {
      email: ADMIN_EMAIL,
      password: hash,
      full_name: ADMIN_NAME,
      role: 'admin',
      is_active: true,
      company_id: null,
      tenant_id: tenantId,
      notes: 'Admin cao nhất HST NextGo — provision-nextgo-ecosystem-live',
    };
    console.log('Tạo admin HST:', ADMIN_EMAIL);
    if (APPLY) {
      const { data, error } = await sb.from('users').insert(row).select('id, email').single();
      if (error) throw error;
      admin = data;
      await sb.from('user_companies').insert({
        user_id: admin.id,
        company_id: newCompanyId,
        is_primary: true,
      });
    }
  } else {
    console.log('Admin HST đã có:', ADMIN_EMAIL, 'active=', admin.is_active);
    if (APPLY) {
      await sb.from('users').update({
        role: 'admin',
        is_active: true,
        company_id: null,
        tenant_id: tenantId,
      }).eq('id', admin.id);
    }
  }

  const moved = [];
  for (const email of STAFF_EMAILS) {
    const src = byEmail.get(norm(email));
    const clone = byEmail.get(aliasOf(email));
    if (!src) {
      console.warn('  thiếu user nguồn', email);
      continue;
    }
    if (!clone) {
      console.warn('  thiếu user clone', aliasOf(email));
      continue;
    }
    if (norm(clone.email) === norm(email) && clone.is_active) {
      console.log('  đã chuyển', email);
      moved.push(email);
      continue;
    }
    console.log(`  chuyển ${email} → HST mới (cũ thành ${oldHstOf(email)})`);
    if (APPLY) {
      const { error: e1 } = await sb.from('users').update({
        email: oldHstOf(email),
        is_active: false,
        notes: `[old-hst NextGo] ${src.notes || ''}`.trim(),
      }).eq('id', src.id);
      if (e1) throw new Error(`${email} park cũ: ${e1.message}`);
      const { error: e2 } = await sb.from('users').update({
        email: norm(email),
        is_active: true,
        tenant_id: tenantId,
        company_id: newCompanyId,
        password: src.password || clone.password,
      }).eq('id', clone.id);
      if (e2) throw new Error(`${email} kích hoạt mới: ${e2.message}`);
    }
    moved.push(email);
    byEmail.set(oldHstOf(email), src);
    byEmail.delete(norm(email));
  }

  const { data: page, error: pErr } = await sb.from('facebook_pages')
    .select('*')
    .eq('page_id', '1102202982968909')
    .maybeSingle();
  if (pErr) throw pErr;
  if (!page) throw new Error('Không thấy fanpage NextGo');

  const fbPatch = {
    default_company_id: newCompanyId,
    default_pipeline_id: mapId(maps, 'pipeline', page.default_pipeline_id) || page.default_pipeline_id,
    default_stage_id: mapId(maps, 'crmStage', page.default_stage_id) || page.default_stage_id,
    default_source_id: mapId(maps, 'source', page.default_source_id) || page.default_source_id,
    default_lead_type_id: mapId(maps, 'leadType', page.default_lead_type_id) || page.default_lead_type_id,
    default_region_id: mapId(maps, 'region', page.default_region_id) || page.default_region_id,
    default_lead_owner_id: mapId(maps, 'user', page.default_lead_owner_id) || page.default_lead_owner_id,
  };
  console.log('Facebook page', page.page_name, '→ company HST mới', newCompanyId);
  if (APPLY) {
    const { error: fu } = await sb.from('facebook_pages').update(fbPatch).eq('id', page.id);
    if (fu) throw fu;
  }

  const feats = spec.TENANT_FEATURES.map((feature_key) => ({
    tenant_id: tenantId,
    feature_key,
    enabled: true,
    config: {},
  }));
  if (APPLY) {
    await sb.from('tenant_features').upsert(feats, { onConflict: 'tenant_id,feature_key' });
    await sb.from('tenants').update({ is_active: true }).eq('id', tenantId);
  }

  const result = {
    applied: APPLY,
    tenant_id: tenantId,
    company_id: newCompanyId,
    admin_email: ADMIN_EMAIL,
    admin_password: adminPassword,
    staff_moved: moved,
    facebook_page_id: page.page_id,
    note: 'User cũ +oldhst vẫn còn (tắt). Không xóa dữ liệu HST mặc định. Webhook URL không đổi (cùng app).',
  };
  if (APPLY) {
    const out = path.join(__dirname, '..', 'uploads', '_nextgo_instance_export', 'provision-live.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ ...result, admin_password: undefined }, null, 2));
  }
  console.log(JSON.stringify({ ...result, admin_password: adminPassword ? '(in console only)' : '(đã có user)' }, null, 2));
  if (adminPassword) {
    console.log('\n*** MẬT KHẨU ADMIN HST (chỉ hiện 1 lần) ***');
    console.log(ADMIN_EMAIL);
    console.log(adminPassword);
  }
  if (!APPLY) console.log('\nChưa ghi DB. Chạy lại với --apply');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
