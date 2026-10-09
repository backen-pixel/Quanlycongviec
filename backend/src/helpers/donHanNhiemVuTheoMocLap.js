/**
 * Gia hạn / dời ngày lắp → DỒN hạn các nhiệm vụ còn mở của dự án theo đúng số ngày đã dời.
 *
 * Vì sao cần: hạn THẺ Kanban SX được tính lại mỗi lần đổi ngày lắp (syncSxCardDeadline →
 * computeSxInstallPlanDeadline), nhưng hạn của từng NHIỆM VỤ thì không — chỗ dập hạn
 * (projectOverviewDeadline.js) cố tình chỉ điền khi đang trống (`collectOpenChildDeadlineStamps`
 * bỏ qua con đã có hạn; `stampOpenChildModuleDeadlines` lọc `.is(cột, null)`). Hệ quả đo được
 * ngày 08/10/2026 ở HCB: 848 nhiệm vụ quá hạn trong khi 0 dự án quá hạn theo mọi trường hạn
 * cấp dự án — việc kẹt ở ngày cũ dù đơn đã được gia hạn.
 *
 * Cách dồn: DỜI ĐỀU đúng số ngày chênh lệch, không tính lại theo công đoạn.
 *  - Tính lại theo công đoạn là lý tưởng, nhưng tuyệt đại đa số `tasks` có
 *    `production_stage_id` NULL (6.173/6.173 việc mở của HCB) nên không map được về nhóm hạn.
 *  - Dời đều giữ nguyên khoảng cách tương đối mà xưởng đã sắp, và khớp với cách người dùng
 *    diễn đạt: «gia hạn ngày lắp thì các deadline dồn theo».
 *
 * Việc chưa từng có hạn (NULL) thì ĐỂ NGUYÊN — chúng chưa được lên lịch, dồn vào là bịa ra hạn.
 */

const { supabase } = require('../config/supabase');

const TASK_DONE = new Set(['done']);
const CRM_DONE = new Set(['completed', 'done', 'cancelled', 'canceled']);
const CHUNK = 100;

/** Số ngày lịch giữa hai chuỗi YYYY-MM-DD (b − a). */
function soNgayGiua(aYmd, bYmd) {
  const a = String(aYmd || '').slice(0, 10);
  const b = String(bYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86400000);
}

/** Dời một mốc thời gian đi `soNgay`, giữ nguyên giờ-phút. */
function doiNgay(raw, soNgay) {
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts + soNgay * 86400000).toISOString();
}

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * @param {{projectId: string, soNgay: number, dryRun?: boolean}} opts
 * @returns {Promise<{tasks: number, crm_tasks: number, so_ngay: number, skipped?: string}>}
 */
async function donHanNhiemVuTheoMocLap({ projectId, soNgay, dryRun = false } = {}) {
  const pid = String(projectId || '').trim();
  const n = Number(soNgay);
  const ketQua = { tasks: 0, crm_tasks: 0, so_ngay: n };
  if (!pid || !Number.isFinite(n) || n === 0) return { ...ketQua, skipped: 'khong_co_do_lech' };

  // 1) tasks dự án còn mở, đã có hạn
  const { data: taskRows, error: taskErr } = await supabase
    .from('tasks')
    .select('id, status, due_date')
    .eq('project_id', pid)
    .not('due_date', 'is', null);
  if (taskErr) {
    console.warn('[donHanNhiemVu] đọc tasks:', taskErr.message);
  } else {
    const can = (taskRows || []).filter((t) => !TASK_DONE.has(String(t.status || '').toLowerCase()));
    const theoHan = new Map();
    for (const t of can) {
      const moi = doiNgay(t.due_date, n);
      if (!moi) continue;
      if (!theoHan.has(moi)) theoHan.set(moi, []);
      theoHan.get(moi).push(t.id);
    }
    for (const [moi, ids] of theoHan) {
      if (dryRun) { ketQua.tasks += ids.length; continue; }
      for (const part of chunk(ids)) {
        const { error } = await supabase.from('tasks').update({ due_date: moi }).in('id', part);
        if (error) { console.warn('[donHanNhiemVu] ghi tasks:', error.message); continue; }
        ketQua.tasks += part.length;
      }
    }
  }

  // 2) crm_tasks của các deal gắn dự án, còn mở, đã có hạn
  const { data: leads } = await supabase
    .from('crm_leads').select('id').eq('project_id', pid);
  const leadIds = (leads || []).map((l) => l.id).filter(Boolean);
  if (leadIds.length) {
    const { data: crmRows, error: crmErr } = await supabase
      .from('crm_tasks')
      .select('id, status, deadline')
      .in('lead_id', leadIds)
      .not('deadline', 'is', null);
    if (crmErr) {
      console.warn('[donHanNhiemVu] đọc crm_tasks:', crmErr.message);
    } else {
      const can = (crmRows || []).filter((t) => !CRM_DONE.has(String(t.status || '').toLowerCase()));
      const theoHan = new Map();
      for (const t of can) {
        const moi = doiNgay(t.deadline, n);
        if (!moi) continue;
        if (!theoHan.has(moi)) theoHan.set(moi, []);
        theoHan.get(moi).push(t.id);
      }
      for (const [moi, ids] of theoHan) {
        if (dryRun) { ketQua.crm_tasks += ids.length; continue; }
        for (const part of chunk(ids)) {
          const { error } = await supabase.from('crm_tasks').update({ deadline: moi }).in('id', part);
          if (error) { console.warn('[donHanNhiemVu] ghi crm_tasks:', error.message); continue; }
          ketQua.crm_tasks += part.length;
        }
      }
    }
  }

  return ketQua;
}

module.exports = { donHanNhiemVuTheoMocLap, soNgayGiua, doiNgay };
