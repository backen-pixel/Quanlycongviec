#!/usr/bin/env node
/**
 * Xóa CRM lead và (tùy chọn) user public.users theo NGÀY LỊCH Việt Nam (Asia/Ho_Chi_Minh).
 *
 * Mặc định ngày 25/04/2026 → --date 2026-04-25
 *
 * Chạy từ thư mục backend:
 *   node scripts/delete-leads-and-users-by-date.js --date 2026-04-25
 *   node scripts/delete-leads-and-users-by-date.js --date 2026-04-25 --execute
 *   node scripts/delete-leads-and-users-by-date.js --date 2026-04-25 --execute --delete-users
 *
 * Cờ:
 *   --date YYYY-MM-DD   Ngày theo lịch VN (mặc định 2026-04-25)
 *   --execute           Thực hiện xóa (không có cờ này = chỉ in danh sách / đếm)
 *   --delete-users      Kèm --execute: xóa bản ghi users tạo trong ngày (KHÔNG xóa role admin/manager)
 *   --help
 *
 * Lưu ý: Xóa user có thể thất bại nếu còn FK (dự án, …). Script in lỗi từng user.
 *         "Khách hàng" là bảng customers — script này không xóa customers trừ khi
 *         chúng bị CASCADE theo xóa project (khi lead còn project_id).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');

const DEFAULT_DATE = '2026-04-25';
const PROTECTED_USER_ROLES = new Set(['admin', 'manager']);

/** Ngày lịch VN [start, end) dưới dạng ISO UTC */
function vietnamCalendarDayUtcRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) throw new Error(`Invalid --date ${dateStr}, use YYYY-MM-DD`);
  const start = new Date(Date.UTC(y, m - 1, d - 1, 17, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 17, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function parseArgs(argv) {
  const out = {
    date: DEFAULT_DATE,
    execute: false,
    deleteUsers: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--execute') out.execute = true;
    else if (a === '--delete-users') out.deleteUsers = true;
    else if (a === '--date') out.date = argv[++i] || DEFAULT_DATE;
    else console.warn('Unknown arg:', a);
  }
  return out;
}

function usage() {
  console.log(`
Usage: node scripts/delete-leads-and-users-by-date.js [options]

  --date YYYY-MM-DD   Vietnam calendar day (default ${DEFAULT_DATE})
  --execute           Actually delete (default: preview only)
  --delete-users      With --execute: also delete public.users created that day
                      (never deletes role admin or manager)
`);
}

async function deleteOneLeadLikeApi(leadRow) {
  const lead = { id: leadRow.id, title: leadRow.title, project_id: leadRow.project_id };
  try {
    const { data: childLeads } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('parent_lead_id', lead.id);
    const childIds = (childLeads || []).map((c) => c.id);
    const allLeadIds = [lead.id, ...childIds];

    try {
      await supabase.from('invoices').delete().in('lead_id', allLeadIds);
    } catch (_) {}

    const { data: ords } = await supabase
      .from('orders')
      .select('id')
      .or(
        `lead_id.eq.${lead.id}${
          childIds.length ? `,fulfillment_lead_id.in.(${childIds.join(',')})` : ''
        }`
      );
    const orderIds = (ords || []).map((o) => o.id);
    if (orderIds.length) {
      try {
        await supabase.from('order_items').delete().in('order_id', orderIds);
      } catch (_) {}
      try {
        await supabase.from('orders').delete().in('id', orderIds);
      } catch (_) {}
    }

    try {
      await supabase.from('quotations').delete().in('lead_id', allLeadIds);
    } catch (_) {}

    try {
      await supabase.from('crm_tasks').delete().in('lead_id', allLeadIds);
    } catch (_) {}
    try {
      await supabase.from('crm_activities').delete().in('lead_id', allLeadIds);
    } catch (_) {}
    try {
      await supabase.from('lead_documents').delete().in('lead_id', allLeadIds);
    } catch (_) {}

    if (childIds.length) {
      try {
        await supabase.from('crm_leads').delete().in('id', childIds);
      } catch (_) {}
    }
  } catch (e) {
    console.warn(`[lead ${lead.id}] cascade children/orders:`, e.message);
  }

  if (lead.project_id) {
    const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', lead.project_id);
    if (taskIds?.length) {
      const ids = taskIds.map((t) => t.id);
      try {
        await supabase.from('task_checklists').delete().in('task_id', ids);
      } catch (_) {}
      try {
        await supabase.from('task_comments').delete().in('task_id', ids);
      } catch (_) {}
      try {
        await supabase.from('task_participants').delete().in('task_id', ids);
      } catch (_) {}
      try {
        await supabase.from('task_time_logs').delete().in('task_id', ids);
      } catch (_) {}
      try {
        await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids);
      } catch (_) {}
    }

    try {
      await supabase.from('tasks').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('project_comments').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('stage_transitions').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('project_workflow_lines').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('project_products').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('project_company_assignments').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase.from('project_approvals').delete().eq('project_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase
        .from('activity_logs')
        .delete()
        .eq('entity_type', 'project')
        .eq('entity_id', lead.project_id);
    } catch (_) {}
    try {
      await supabase
        .from('notifications')
        .delete()
        .eq('entity_type', 'project')
        .eq('entity_id', lead.project_id);
    } catch (_) {}
    await supabase.from('projects').delete().eq('id', lead.project_id);
  }

  try {
    await supabase.from('lead_documents').delete().eq('lead_id', lead.id);
  } catch (_) {}
  try {
    await supabase.from('crm_activities').delete().eq('lead_id', lead.id);
  } catch (_) {}
  try {
    await supabase.from('lead_members').delete().eq('lead_id', lead.id);
  } catch (_) {}
  try {
    await supabase.from('lead_messages').delete().eq('lead_id', lead.id);
  } catch (_) {}

  const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
  if (error) throw error;
  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  const { startIso, endIso } = vietnamCalendarDayUtcRange(args.date);
  console.log(`VN calendar day ${args.date} → UTC [${startIso}, ${endIso})`);
  console.log(args.execute ? 'MODE: EXECUTE (writes DB)' : 'MODE: preview only (add --execute to delete)');

  const { data: leads, error: le } = await supabase
    .from('crm_leads')
    .select('id, title, type, code, created_at, project_id')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });

  if (le) {
    console.error('Error loading leads:', le.message);
    process.exit(1);
  }

  const leadList = leads || [];
  console.log(`\nLeads in range: ${leadList.length}`);
  for (const L of leadList.slice(0, 50)) {
    console.log(`  - ${L.id}  ${L.code || ''}  type=${L.type}  project=${L.project_id ? 'yes' : 'no'}  ${L.title}`);
  }
  if (leadList.length > 50) console.log(`  ... and ${leadList.length - 50} more`);

  const { data: users, error: ue } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });

  if (ue) {
    console.error('Error loading users:', ue.message);
    process.exit(1);
  }

  const userList = users || [];
  const deletableUsers = userList.filter((u) => !PROTECTED_USER_ROLES.has(String(u.role || '').toLowerCase()));
  const skippedProtected = userList.length - deletableUsers.length;

  console.log(`\nUsers in range: ${userList.length} (would try delete: ${deletableUsers.length}, skip admin/manager: ${skippedProtected})`);
  for (const u of userList.slice(0, 30)) {
    const mark = PROTECTED_USER_ROLES.has(String(u.role || '').toLowerCase()) ? ' [SKIP protected role]' : '';
    console.log(`  - ${u.id}  ${u.email}  role=${u.role}${mark}`);
  }
  if (userList.length > 30) console.log(`  ... and ${userList.length - 30} more`);

  if (!args.execute) {
    console.log('\nPreview done. Re-run with --execute to delete leads.');
    if (args.deleteUsers) console.log('(Also pass --execute --delete-users to delete eligible users.)');
    process.exit(0);
  }

  let ok = 0;
  let fail = 0;
  for (const L of leadList) {
    try {
      await deleteOneLeadLikeApi(L);
      ok++;
      console.log(`Deleted lead ${L.id} ${L.title || ''}`);
    } catch (e) {
      fail++;
      console.error(`FAIL lead ${L.id}:`, e.message || e);
    }
  }
  console.log(`\nLeads: ${ok} ok, ${fail} failed`);

  if (args.deleteUsers) {
    let uOk = 0;
    let uFail = 0;
    for (const u of deletableUsers) {
      try {
        const { error } = await supabase.from('users').delete().eq('id', u.id);
        if (error) throw error;
        uOk++;
        console.log(`Deleted user ${u.id} ${u.email}`);
      } catch (e) {
        uFail++;
        console.error(`FAIL user ${u.id} ${u.email}:`, e.message || e);
      }
    }
    console.log(`\nUsers: ${uOk} ok, ${uFail} failed (protected roles not attempted)`);
  } else {
    console.log('\nUsers not deleted (omit --delete-users or add it with --execute).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
