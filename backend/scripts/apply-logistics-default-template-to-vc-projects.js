/**
 * Áp dụng bộ mẫu VC/LĐ mặc định (global) cho các dự án đang trên board VC.
 * Chỉ seed khi dự án chưa có đủ 6 việc của bộ chung (tránh nhân đôi).
 *
 * Chạy:
 *   node scripts/apply-logistics-default-template-to-vc-projects.js
 *   node scripts/apply-logistics-default-template-to-vc-projects.js --force   # xóa task logistics cũ rồi seed lại
 *   node scripts/apply-logistics-default-template-to-vc-projects.js --company-id <uuid>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const {
  applyWorkshopTemplateToProject,
  resolveDefaultWorkshopTemplateId,
} = require('../src/helpers/workshopApplyTemplates');

const NEW_TITLES = new Set([
  'Kiểm tra trước khi lấy hàng',
  'Hàng lên xe và vận chuyển',
  'Kiểm tra trước khi giao hàng',
  'Kiểm tra và nhận hàng',
  'Quy trình lắp đặt',
  'Nghiệm thu sau khi lắp',
]);

const LOGISTICS_STATUSES = ['shipping', 'installing', 'warranty'];

function hasFlag(name) {
  return process.argv.includes(name);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function listVcProjects(companyIdFilter) {
  let q = supabase
    .from('projects')
    .select('id, code, name, company_id, logistics_company_id, status, vc_kanban_column_id')
    .is('vc_deleted_at', null);
  if (companyIdFilter) {
    q = q.or(`logistics_company_id.eq.${companyIdFilter},company_id.eq.${companyIdFilter}`);
  }
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data || []).filter((p) => {
    if (p.vc_kanban_column_id) return true;
    if (p.logistics_company_id) return true;
    if (LOGISTICS_STATUSES.includes(String(p.status || ''))) return true;
    return false;
  });
}

async function logisticsTaskStats(projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, metadata')
    .eq('project_id', projectId);
  if (error) throw error;
  const logistics = (data || []).filter((t) => {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    return meta.workshop_area === 'logistics';
  });
  const newCount = logistics.filter((t) => NEW_TITLES.has(String(t.title || ''))).length;
  return { logistics, newCount, hasFullNewSet: newCount >= 6 };
}

async function deleteLogisticsTasks(tasks) {
  const ids = tasks.map((t) => t.id).filter(Boolean);
  if (!ids.length) return 0;
  // checklist / comments cascade hoặc orphan — xóa checklist trước nếu không cascade
  await supabase.from('task_checklists').delete().in('task_id', ids);
  const { error } = await supabase.from('tasks').delete().in('id', ids);
  if (error) throw error;
  return ids.length;
}

async function main() {
  const force = hasFlag('--force');
  const companyIdFilter = arg('--company-id');
  const actorId = arg('--user-id') || '5e07fb3b-3286-4ca3-a167-4edef16f3866';

  const templateId = await resolveDefaultWorkshopTemplateId('logistics', null);
  if (!templateId) {
    throw new Error('Không tìm thấy bộ mẫu logistics mặc định (global)');
  }
  console.log(`Template: ${templateId}`);
  console.log(`Force: ${force}`);

  const projects = await listVcProjects(companyIdFilter);
  console.log(`VC projects: ${projects.length}`);

  let seeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of projects) {
    const stats = await logisticsTaskStats(p.id);
    if (stats.hasFullNewSet && !force) {
      skipped += 1;
      continue;
    }
    if (force && stats.logistics.length) {
      const n = await deleteLogisticsTasks(stats.logistics);
      console.log(`  [${p.code}] deleted ${n} old logistics tasks`);
    } else if (!force && stats.logistics.length && !stats.hasFullNewSet) {
      // Có task logistics cũ khác bộ mới → thay bằng bộ chung
      const n = await deleteLogisticsTasks(stats.logistics);
      console.log(`  [${p.code}] replaced ${n} old logistics tasks`);
    }

    const cid = p.logistics_company_id || p.company_id || null;
    // resolve theo công ty VC nếu có default riêng; không thì global đã lấy ở trên
    const tplForProject = (await resolveDefaultWorkshopTemplateId('logistics', cid)) || templateId;
    const r = await applyWorkshopTemplateToProject(p.id, tplForProject, actorId);
    if (!r.ok) {
      failed += 1;
      console.error(`  [${p.code}] FAIL: ${r.error}`);
      continue;
    }
    seeded += 1;
    console.log(`  [${p.code}] +${r.count} tasks`);
  }

  console.log(`Done — seeded=${seeded} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
