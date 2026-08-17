/**
 * Dồn lịch SX khi deadline cột quá hạn:
 * thùng trễ N ngày LV → hạn các công đoạn sau + N (slip_days).
 */

const { supabase } = require('../config/supabase');
const {
  loadSxHolidayIndex,
  countSxWorkingDaysFromTo,
  addCalendarDaysYmd,
  vnNowParts,
} = require('./sxWorkshopSchedule');
const { vnYmdFromTs } = require('./companyDeadlineClock');

function ymdOf(raw) {
  const s = String(raw || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return vnYmdFromTs(raw);
}

/**
 * @returns {Promise<null|{ slipDays, extra, production_finish_date, installCollision }>}
 */
async function applySxOverdueSlipForProject(project, { nowMs = Date.now() } = {}) {
  if (!project?.id || !project.sx_kanban_deadline_at) return null;
  const dueTs = new Date(project.sx_kanban_deadline_at).getTime();
  if (!Number.isFinite(dueTs) || dueTs >= nowMs) return null;

  const colId = project.sx_kanban_column_id || null;
  if (colId) {
    const { data: col } = await supabase
      .from('production_pipeline_stages')
      .select('id, deadline_group, counts_as_completed_revenue, counts_as_collected_revenue')
      .eq('id', colId)
      .maybeSingle();
    if (col?.counts_as_completed_revenue || col?.counts_as_collected_revenue) return null;
    if (!col?.deadline_group) return null;
  }

  const holidays = await loadSxHolidayIndex(project.company_id || null);
  const dueYmd = ymdOf(project.sx_kanban_deadline_at);
  const todayYmd = vnNowParts(nowMs).ymd;
  const overdueDays = countSxWorkingDaysFromTo(dueYmd, todayYmd, holidays);
  if (!overdueDays || overdueDays <= 0) return null;

  const currentSlip = Math.max(0, Number(project.sx_schedule_slip_days) || 0);
  if (overdueDays <= currentSlip) return null;
  const extra = overdueDays - currentSlip;

  const patch = {
    sx_schedule_slip_days: overdueDays,
    updated_at: new Date().toISOString(),
  };
  const finish = ymdOf(project.production_finish_date);
  if (finish) patch.production_finish_date = addCalendarDaysYmd(finish, extra);

  let { error } = await supabase.from('projects').update(patch).eq('id', project.id);
  if (error && /sx_schedule_slip_days/.test(error.message || '')) {
    delete patch.sx_schedule_slip_days;
    ({ error } = await supabase.from('projects').update(patch).eq('id', project.id));
  }
  if (error && /production_finish_date/.test(error.message || '')) {
    delete patch.production_finish_date;
    ({ error } = await supabase.from('projects').update(patch).eq('id', project.id));
  }
  if (error) {
    console.warn('[sx-slip]', error.message);
    return null;
  }

  const installYmd = ymdOf(project.delivery_date || project.install_date);
  const newFinish = patch.production_finish_date || finish;
  return {
    slipDays: overdueDays,
    extra,
    production_finish_date: newFinish || null,
    installCollision: Boolean(installYmd && newFinish && newFinish >= installYmd),
  };
}

module.exports = {
  applySxOverdueSlipForProject,
};
