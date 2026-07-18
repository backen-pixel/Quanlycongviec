/**
 * Nhắc hạn deadline thủ công của thẻ lead/deal CRM (crm_leads.kanban_deadline_at).
 * Chạy mỗi 30 phút.
 *   - Sắp đến hạn (trong 24h tới)  → type: crm_kanban_deadline_warning
 *   - Quá hạn                       → type: crm_kanban_deadline_overdue
 * Người nhận: người phụ trách (assigned_to, lead_owner_id) + thành viên tham gia (lead_members).
 * Bỏ qua thẻ ở cột Thắng/Thua.
 * Dedup theo (type, entity_id, user_id) trong cửa sổ gần nhất.
 *
 * Disable bằng env CRM_KANBAN_DEADLINE_REMINDER_DISABLED=1.
 * Tích hợp: require('./jobs/crmKanbanDeadlineReminder').start(io)
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');

const RUN_INTERVAL_MS = 30 * 60 * 1000;
const WARN_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000;

function fmtDt(iso) {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(iso); }
}

async function runOnce(io) {
  const now = new Date();
  const warnUntil = new Date(now.getTime() + WARN_WINDOW_MS);

  try {
    const { data: leads, error } = await supabase
      .from('crm_leads')
      .select('id, type, title, code, assigned_to, lead_owner_id, kanban_deadline_at, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_won, is_lost)')
      .not('kanban_deadline_at', 'is', null)
      .lt('kanban_deadline_at', warnUntil.toISOString())
      .limit(500);
    if (error) {
      // Cột chưa migrate → bỏ qua êm.
      if (String(error.message || '').includes('kanban_deadline_at')) return;
      throw error;
    }

    const active = (leads || []).filter((l) => {
      const st = Array.isArray(l.stage) ? l.stage[0] : l.stage;
      return !st?.is_won && !st?.is_lost;
    });
    if (!active.length) return;

    // Thành viên tham gia
    const ids = active.map((l) => l.id);
    const memberMap = new Map();
    try {
      const { data: members } = await supabase
        .from('lead_members')
        .select('lead_id, user_id')
        .in('lead_id', ids);
      (members || []).forEach((m) => {
        if (!memberMap.has(m.lead_id)) memberMap.set(m.lead_id, []);
        memberMap.get(m.lead_id).push(m.user_id);
      });
    } catch (_) { /* bảng có thể chưa có — bỏ qua */ }

    // Dedup
    const since = new Date(now.getTime() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('type, entity_id, user_id')
      .in('type', ['crm_kanban_deadline_warning', 'crm_kanban_deadline_overdue'])
      .gte('created_at', since);
    const seen = new Set((recent || []).map((n) => `${n.type}:${n.entity_id}:${n.user_id}`));

    const notifs = [];
    for (const l of active) {
      const dueTs = new Date(l.kanban_deadline_at).getTime();
      const isOverdue = dueTs < now.getTime();
      const type = isOverdue ? 'crm_kanban_deadline_overdue' : 'crm_kanban_deadline_warning';
      const targets = [
        l.assigned_to,
        l.lead_owner_id,
        ...(memberMap.get(l.id) || []),
      ].filter(Boolean);
      const label = l.type === 'deal' ? 'Deal' : 'Lead';
      const title = isOverdue ? '🚨 Quá hạn deadline' : '⏰ Sắp đến hạn deadline';
      let message;
      if (isOverdue) {
        const days = Math.max(1, Math.floor((now.getTime() - dueTs) / 86400000));
        message = `${label} "${l.title || l.code}" — quá hạn ${days} ngày (${fmtDt(l.kanban_deadline_at)})`;
      } else {
        message = `${label} "${l.title || l.code}" — hạn ${fmtDt(l.kanban_deadline_at)}`;
      }
      for (const uid of new Set(targets)) {
        const key = `${type}:${l.id}:${uid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        notifs.push({
          user_id: uid,
          type,
          title,
          message,
          entity_type: l.type === 'deal' ? 'crm_deal' : 'crm_lead',
          entity_id: l.id,
          metadata: { module_key: 'crm', ecosystem_module_key: 'crm' },
        });
      }
    }

    if (!notifs.length) return;
    const { data: inserted } = await supabase.from('notifications').insert(notifs).select('*');
    const { dispatchNotificationToUser } = require('../helpers/notifications');
    for (const n of inserted || []) {
      await dispatchNotificationToUser(io, n.user_id, n);
    }
    console.log(`[crm-kanban-deadline] Đã gửi ${inserted?.length || 0}/${notifs.length} thông báo`);
  } catch (e) {
    console.error('[crm-kanban-deadline]', e.message);
  }
}

function start(io) {
  if (process.env.CRM_KANBAN_DEADLINE_REMINDER_DISABLED === '1') {
    console.log('[crm-kanban-deadline] Disabled (env)');
    return;
  }
  setTimeout(() => { void runIfLeader('crm-kanban-deadline', () => runOnce(io), { ttlSec: 1700 }); }, 100 * 1000);
  setInterval(() => { void runIfLeader('crm-kanban-deadline', () => runOnce(io), { ttlSec: 1700 }); }, RUN_INTERVAL_MS);
  console.log('[crm-kanban-deadline] Started — interval 30 phút');
}

module.exports = { start, runOnce };
