/**
 * Dồn lịch SX khi thẻ Kanban quá hạn deadline_group.
 * Chạy mỗi 30 phút. Disable: SX_SCHEDULE_SLIP_DISABLED=1
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const { applySxOverdueSlipForProject } = require('../helpers/sxScheduleSlip');

const RUN_INTERVAL_MS = 30 * 60 * 1000;

async function runOnce() {
  const now = new Date();
  try {
    let q = supabase
      .from('projects')
      .select('id, company_id, sx_kanban_column_id, sx_kanban_deadline_at, sx_schedule_slip_days, production_finish_date, delivery_date, install_date, status')
      .not('sx_kanban_deadline_at', 'is', null)
      .lt('sx_kanban_deadline_at', now.toISOString())
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .limit(200);
    let { data, error } = await q;
    if (error && /sx_schedule_slip_days/.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('projects')
        .select('id, company_id, sx_kanban_column_id, sx_kanban_deadline_at, production_finish_date, delivery_date, install_date, status')
        .not('sx_kanban_deadline_at', 'is', null)
        .lt('sx_kanban_deadline_at', now.toISOString())
        .neq('status', 'completed')
        .limit(200));
    }
    if (error && /sx_kanban_deadline/.test(error.message || '')) return;
    if (error) throw error;

    let n = 0;
    for (const p of data || []) {
      const r = await applySxOverdueSlipForProject(p, { nowMs: now.getTime() });
      if (r?.extra) n += 1;
    }
    if (n) console.log(`[sx-schedule-slip] Đã dồn lịch ${n} dự án`);
  } catch (e) {
    console.error('[sx-schedule-slip]', e.message);
  }
}

function start() {
  if (process.env.SX_SCHEDULE_SLIP_DISABLED === '1') {
    console.log('[sx-schedule-slip] Disabled (env)');
    return;
  }
  setTimeout(() => { void runIfLeader('sx-schedule-slip', () => runOnce(), { ttlSec: 1700 }); }, 140 * 1000);
  setInterval(() => { void runIfLeader('sx-schedule-slip', () => runOnce(), { ttlSec: 1700 }); }, RUN_INTERVAL_MS);
  console.log('[sx-schedule-slip] Started — interval 30 phút');
}

module.exports = { start, runOnce };
