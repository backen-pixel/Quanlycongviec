#!/usr/bin/env node
/**
 * Xóa dữ liệu test của luồng «Kế hoạch SX & VC/LĐ» (deal + dự án + sự kiện + thông báo).
 * Sao lưu ra JSON trước khi xóa.
 *
 * Chạy thử (không xóa):  node scripts/purge-test-plan-data.js
 * Xóa thật:              node scripts/purge-test-plan-data.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const DEAL_CODES = [
  'DEAL-2026-400',
  'DEAL-2026-824',
  'DEAL-2026-769',
];
const PROJECT_CODES = ['TB-2026-156'];
const EXTRA_EVENT_IDS = [];

const APPLY = process.argv.includes('--apply');
const OUT_DIR = path.join(__dirname, '../uploads');

async function pick(table, columns, column, values) {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).select(columns).in(column, values);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function main() {
  const leads = await pick('crm_leads', '*', 'code', DEAL_CODES);
  const projects = await pick('projects', '*', 'code', PROJECT_CODES);
  const leadIds = leads.map((r) => String(r.id));
  const projectIds = projects.map((r) => String(r.id));
  const entityIds = [...new Set([...leadIds, ...projectIds, ...EXTRA_EVENT_IDS])];

  const eventsByProject = await pick('crm_events', '*', 'project_id', projectIds);
  const eventsByLead = await pick('crm_events', '*', 'lead_id', leadIds);
  const extraEvents = await pick('crm_events', '*', 'id', EXTRA_EVENT_IDS);
  const eventMap = new Map();
  [...eventsByProject, ...eventsByLead, ...extraEvents].forEach((e) => eventMap.set(String(e.id), e));
  const events = [...eventMap.values()];
  const eventIds = events.map((e) => String(e.id));

  const backup = {
    generated_at: new Date().toISOString(),
    deal_codes: DEAL_CODES,
    project_codes: PROJECT_CODES,
    crm_leads: leads,
    projects,
    crm_events: events,
    crm_event_participants: await pick('crm_event_participants', '*', 'event_id', eventIds),
    tasks: await pick('tasks', '*', 'project_id', projectIds),
    crm_tasks: await pick('crm_tasks', '*', 'lead_id', leadIds),
    lead_members: await pick('lead_members', '*', 'lead_id', leadIds),
    crm_lead_comments: await pick('crm_lead_comments', '*', 'lead_id', leadIds),
    project_comments: await pick('project_comments', '*', 'project_id', projectIds),
    stage_transitions: await pick('stage_transitions', '*', 'project_id', projectIds),
    project_workshop_placements: [
      ...(await pick('project_workshop_placements', '*', 'source_project_id', projectIds)),
      ...(await pick('project_workshop_placements', '*', 'target_project_id', projectIds)),
    ],
    crm_deal_projects: await pick('crm_deal_projects', '*', 'project_id', projectIds),
    notifications: await pick('notifications', '*', 'entity_id', entityIds),
  };

  // Chặn xóa nếu dính chứng từ tiền (đơn hàng / báo giá / hóa đơn) — không phải rác test
  const blockers = {
    orders: [
      ...(await pick('orders', 'id, code', 'project_id', projectIds)),
      ...(await pick('orders', 'id, code', 'lead_id', leadIds)),
    ],
    quotations: [
      ...(await pick('quotations', 'id, code', 'project_id', projectIds)),
      ...(await pick('quotations', 'id, code', 'lead_id', leadIds)),
    ],
    invoices: [
      ...(await pick('invoices', 'id, code', 'project_id', projectIds)),
      ...(await pick('invoices', 'id, code', 'lead_id', leadIds)),
    ],
  };

  console.log('— Sẽ xóa —');
  console.log(`deal:               ${leads.length} (${leads.map((r) => r.code).join(', ')})`);
  console.log(`dự án:              ${projects.length} (${projects.map((r) => r.code).join(', ')})`);
  console.log(`sự kiện:            ${events.length}`);
  console.log(`thành viên sự kiện: ${backup.crm_event_participants.length}`);
  console.log(`task dự án:         ${backup.tasks.length}`);
  console.log(`task CRM:           ${backup.crm_tasks.length}`);
  console.log(`thành viên deal:    ${backup.lead_members.length}`);
  console.log(`bình luận deal:     ${backup.crm_lead_comments.length}`);
  console.log(`bình luận dự án:    ${backup.project_comments.length}`);
  console.log(`lịch sử giai đoạn:  ${backup.stage_transitions.length}`);
  console.log(`gắn xưởng:          ${backup.project_workshop_placements.length}`);
  console.log(`thông báo:          ${backup.notifications.length}`);
  const blockerCount = Object.values(blockers).reduce((s, arr) => s + arr.length, 0);
  console.log(`chứng từ liên quan: ${blockerCount}`);

  if (blockerCount > 0) {
    console.log(JSON.stringify(blockers, null, 2));
    throw new Error('Có đơn hàng / báo giá / hóa đơn gắn vào dữ liệu này — dừng lại để bạn kiểm tra.');
  }

  if (leads.length !== DEAL_CODES.length || projects.length !== PROJECT_CODES.length) {
    console.log('⚠ Một số mã không còn tồn tại — chỉ xóa những mã tìm thấy.');
  }

  if (!APPLY) {
    console.log('\nDry-run: chưa xóa gì. Thêm --apply để xóa thật.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(OUT_DIR, `_purge_test_plan_${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nĐã sao lưu: ${backupPath}`);

  const del = async (table, column, values) => {
    if (!values.length) return;
    const { error } = await supabase.from(table).delete().in(column, values);
    if (error) throw new Error(`xóa ${table}: ${error.message}`);
    console.log(`đã xóa ${table} (${column} × ${values.length})`);
  };

  await del('crm_event_participants', 'event_id', eventIds);
  await del('crm_events', 'id', eventIds);
  await del('notifications', 'entity_id', entityIds);
  await del('stage_transitions', 'project_id', projectIds);
  // Task phải xóa trước deal/dự án: trigger ghi unified_task_history trỏ về deal/dự án,
  // nếu xóa cascade cùng lúc thì trigger chèn vào bảng lịch sử và vi phạm khóa ngoại.
  await del('crm_tasks', 'lead_id', leadIds);
  await del('tasks', 'project_id', projectIds);
  await del('unified_task_history', 'lead_id', leadIds);
  await del('unified_task_history', 'project_id', projectIds);
  // Deal xóa trước để cascade sang bình luận/thành viên, sau đó tới dự án
  await del('crm_leads', 'id', leadIds);
  await del('projects', 'id', projectIds);

  const leftLeads = await pick('crm_leads', 'code', 'code', DEAL_CODES);
  const leftProjects = await pick('projects', 'code', 'code', PROJECT_CODES);
  const leftEvents = await pick('crm_events', 'id, title', 'id', EXTRA_EVENT_IDS);
  console.log(`\nCòn lại: deal ${leftLeads.length}, dự án ${leftProjects.length}, sự kiện test ${leftEvents.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('LỖI:', e.message);
    process.exit(1);
  });
