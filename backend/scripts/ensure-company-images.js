/**
 * Tạo kho ảnh chung (_Kho ảnh chung) trên Google Drive + drive_roots cho một công ty.
 *
 *   node scripts/ensure-company-images.js --company-id <uuid>
 *   node scripts/ensure-company-images.js --name "Phúc Đạt"
 *   node scripts/ensure-company-images.js --name "Phúc Đạt" --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const driveOrgPath = require('../src/helpers/driveOrgPath');
const gdrive = require('../src/services/googleDrive');

const dryRun = process.argv.includes('--dry-run');
const companyIdArg = (() => {
  const i = process.argv.indexOf('--company-id');
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
})();
const nameArg = (() => {
  const i = process.argv.indexOf('--name');
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
})();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findCompany() {
  if (companyIdArg) {
    const { data, error } = await sb.from('companies').select('id, name').eq('id', companyIdArg).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Không tìm thấy công ty id=${companyIdArg}`);
    return data;
  }
  if (nameArg) {
    const { data, error } = await sb
      .from('companies')
      .select('id, name')
      .or(`name.ilike.%${nameArg}%,short_name.ilike.%${nameArg}%`)
      .order('name')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Không tìm thấy công ty khớp «${nameArg}»`);
    return data;
  }
  throw new Error('Cần --company-id <uuid> hoặc --name "Tên công ty"');
}

async function upsertCompanyImagesRoot(sp, companyId) {
  const { data: existing } = await sb
    .from('drive_roots')
    .select('*')
    .eq('google_folder_id', sp.google_folder_id)
    .maybeSingle();

  if (existing) {
    if (dryRun) return { root: existing, created: false };
    const { data: updated, error } = await sb
      .from('drive_roots')
      .update({
        module_key: 'crm',
        shared_kind: 'company_images',
        company_id: companyId,
        region_id: null,
        name: sp.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { root: updated, created: false };
  }

  if (dryRun) {
    return {
      root: { name: sp.name, google_folder_id: sp.google_folder_id, shared_kind: 'company_images' },
      created: true,
    };
  }

  const { data: inserted, error } = await sb
    .from('drive_roots')
    .insert({
      scope: 'shared',
      owner_id: null,
      name: sp.name,
      google_folder_id: sp.google_folder_id,
      module_key: 'crm',
      shared_kind: 'company_images',
      company_id: companyId,
      region_id: null,
      created_by: null,
    })
    .select()
    .single();
  if (error) throw error;
  return { root: inserted, created: true };
}

async function grantCompanyAcl(rootId, companyId) {
  if (dryRun) return;
  await sb.from('drive_acl').upsert(
    {
      target_type: 'root',
      target_id: rootId,
      principal_type: 'company',
      principal_id: companyId,
      role: 'editor',
      granted_by: null,
    },
    { onConflict: 'target_type,target_id,principal_type,principal_id' },
  );
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!gdrive.isConfigured()) {
    throw new Error('Google Drive chưa cấu hình (GDRIVE_* trong .env)');
  }

  const company = await findCompany();
  console.log(`Công ty: ${company.name} (${company.id})`);

  const { data: existingKho } = await sb
    .from('drive_roots')
    .select('id, name, google_folder_id')
    .eq('shared_kind', 'company_images')
    .eq('company_id', company.id)
    .maybeSingle();

  if (existingKho) {
    console.log('Đã có kho ảnh trong DB:');
    console.log(`  root_id: ${existingKho.id}`);
    console.log(`  name: ${existingKho.name}`);
    console.log(`  google_folder_id: ${existingKho.google_folder_id}`);
    if (!dryRun) await grantCompanyAcl(existingKho.id, company.id);
    return;
  }

  console.log(dryRun ? '(dry-run) Sẽ tạo path Drive…' : 'Đang tạo thư mục trên Google Drive…');
  const sp = await driveOrgPath.ensureCompanyImagesPath({ companyId: company.id, moduleKey: 'crm' });
  console.log('Google Drive path:');
  for (const seg of sp.segments || []) {
    console.log(`  ${seg.kind}: ${seg.name} (${seg.google_folder_id})`);
  }

  const { root, created } = await upsertCompanyImagesRoot(sp, company.id);
  await grantCompanyAcl(root.id, company.id);

  console.log(created ? '✓ Đã tạo kho ảnh mới' : '✓ Đã cập nhật bản ghi kho ảnh');
  console.log(`  drive_roots.id: ${root.id || '(dry-run)'}`);
  console.log(`  google_folder_id: ${sp.google_folder_id}`);
}

main().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
