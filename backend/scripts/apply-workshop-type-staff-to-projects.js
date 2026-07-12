/**
 * Áp dụng NV mặc định theo phân loại cho mọi dự án SX hiện có.
 *
 * Chạy:
 *   node scripts/apply-workshop-type-staff-to-projects.js --company HCB --type "Cánh kính"
 *   node scripts/apply-workshop-type-staff-to-projects.js --company-id <uuid> --type-id <uuid>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const {
  applyWorkshopTypeDefaultStaffToAllProjects,
} = require('../src/helpers/productionWorkshopTypeStaff');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function resolveCompanyId() {
  const id = arg('--company-id');
  if (id) return id;
  const key = arg('--company');
  if (!key) throw new Error('Thiếu --company hoặc --company-id');
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .or(`short_name.ilike.${key},name.ilike.%${key}%`);
  if (error) throw error;
  const match = (data || []).find(
    (c) => String(c.short_name || '').toLowerCase() === key.toLowerCase()
      || String(c.name || '').toLowerCase().includes(key.toLowerCase()),
  );
  if (!match) throw new Error(`Không tìm thấy công ty: ${key}`);
  return match.id;
}

async function resolveWorkshopTypeId(companyId) {
  const id = arg('--type-id');
  if (id) return id;
  const typeName = arg('--type');
  if (!typeName) throw new Error('Thiếu --type hoặc --type-id');
  const { data, error } = await supabase
    .from('workshop_project_types')
    .select('id, name')
    .eq('company_id', companyId)
    .ilike('name', typeName)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Không tìm thấy phân loại «${typeName}»`);
  return data.id;
}

async function main() {
  const companyId = await resolveCompanyId();
  const workshopTypeId = await resolveWorkshopTypeId(companyId);

  console.log(`Company: ${companyId}`);
  console.log(`Workshop type: ${workshopTypeId}`);

  const result = await applyWorkshopTypeDefaultStaffToAllProjects(companyId, workshopTypeId);
  console.log(`Done — updated ${result.updated} project(s) [${result.workshop_type_name}]`);
  if (result.project_ids?.length) {
    console.log('Project IDs:', result.project_ids.join(', '));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
