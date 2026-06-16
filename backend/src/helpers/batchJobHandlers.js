/**
 * Registry handlers cho system batch queue.
 * Mỗi handler nhận (job, ctx) với ctx.updateProgress, ctx.isAborted, ctx.io
 */
const { supabase } = require('../config/supabase');
const {
  processDueCrmAssignmentSchedules,
  spawnAssignmentFromSchedule,
  computeNextRunAt,
} = require('./crmAssignmentSchedule');

const BATCH_ADMIN_ROLES = new Set(['admin', 'manager', 'sales_admin', 'crm_production_admin']);

const registry = new Map();

function registerBatchJobType(type, def) {
  if (!type || typeof def?.run !== 'function') {
    throw new Error('registerBatchJobType: cần type và run()');
  }
  registry.set(type, {
    label: def.label || type,
    description: def.description || '',
    adminOnly: def.adminOnly !== false,
    allowedRoles: def.allowedRoles || BATCH_ADMIN_ROLES,
    defaultMaxRetries: def.defaultMaxRetries ?? 3,
    run: def.run,
  });
}

function getBatchJobType(type) {
  return registry.get(type) || null;
}

function listBatchJobTypes() {
  return [...registry.entries()].map(([type, def]) => ({
    type,
    label: def.label,
    description: def.description,
    adminOnly: def.adminOnly,
    defaultMaxRetries: def.defaultMaxRetries,
  }));
}

function canUserRunBatchType(user, typeDef) {
  if (!typeDef) return false;
  const role = String(user?.role || '').toLowerCase();
  if (typeDef.allowedRoles && !typeDef.allowedRoles.has(role)) return false;
  return true;
}

/** Spawn nhiệm vụ từ lịch CRM đến hạn (thay thế xử lý trực tiếp trong cron). */
registerBatchJobType('crm_assignment_schedule_due', {
  label: 'Lịch giao việc — spawn đến hạn',
  description: 'Quét crm_assignment_schedules có next_run_at <= now và tạo crm_assignments',
  run: async (job, ctx) => {
    const limit = Math.min(500, Math.max(1, Number(job.payload?.limit) || 50));
    const now = new Date();
    const { data: due, error } = await supabase
      .from('crm_assignment_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', now.toISOString())
      .order('next_run_at', { ascending: true })
      .limit(limit);

    if (error) {
      if (/crm_assignment_schedules/.test(error.message || '')) {
        return { processed: 0, skipped: true, reason: 'migration_357_missing' };
      }
      throw error;
    }

    const schedules = due || [];
    await ctx.updateProgress(0, schedules.length, { phase: 'start' });

    let processed = 0;
    const errors = [];

    for (let i = 0; i < schedules.length; i++) {
      await ctx.isAborted();
      const schedule = schedules[i];
      try {
        const assignment = await spawnAssignmentFromSchedule(schedule, ctx.io);
        const updates = {
          last_run_at: now.toISOString(),
          last_assignment_id: assignment.id,
          updated_at: now.toISOString(),
        };

        if (schedule.recurrence_type) {
          let next = computeNextRunAt(
            schedule.next_run_at || schedule.scheduled_start,
            schedule.recurrence_type,
            schedule.recurrence_interval
          );
          const recEnd = schedule.recurrence_end_at ? new Date(schedule.recurrence_end_at) : null;
          while (next && next.getTime() <= now.getTime()) {
            next = computeNextRunAt(next, schedule.recurrence_type, schedule.recurrence_interval);
          }
          if (!next || (recEnd && next.getTime() > recEnd.getTime())) {
            updates.is_active = false;
            updates.next_run_at = schedule.next_run_at || schedule.scheduled_start;
          } else {
            updates.next_run_at = next.toISOString();
          }
        } else {
          updates.is_active = false;
        }

        await supabase.from('crm_assignment_schedules').update(updates).eq('id', schedule.id);
        processed += 1;
      } catch (e) {
        errors.push({ schedule_id: schedule.id, error: e.message });
      }
      await ctx.updateProgress(i + 1, schedules.length, {
        phase: 'spawn',
        schedule_id: schedule.id,
        processed,
      });
    }

    return { processed, total: schedules.length, errors };
  },
});

/** Giao nhiệm vụ hàng loạt từ danh sách tiêu đề + assignee. */
registerBatchJobType('crm_bulk_assign', {
  label: 'Giao việc CRM hàng loạt',
  description: 'Tạo nhiều crm_assignments từ payload.items[]',
  run: async (job, ctx) => {
    const items = Array.isArray(job.payload?.items) ? job.payload.items : [];
    if (!items.length) return { created: 0, total: 0 };

    const createdBy = job.created_by_id || job.payload?.created_by_id;
    const companyId = job.company_id || job.payload?.company_id || null;
    const module = job.payload?.assignment_module === 'production' ? 'production' : 'crm';

    await ctx.updateProgress(0, items.length, { phase: 'start' });
    const created = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      await ctx.isAborted();
      const it = items[i] || {};
      const title = String(it.title || '').trim();
      const assigneeIds = (it.assignee_ids || []).filter(Boolean).map(String);
      if (!title || !assigneeIds.length) {
        errors.push({ index: i, error: 'Thiếu title hoặc assignee_ids' });
        continue;
      }

      try {
        let posBase = 0;
        if (it.column_id) {
          const { data: maxRow } = await supabase.from('crm_assignments').select('position')
            .eq('column_id', it.column_id).order('position', { ascending: false }).limit(1).maybeSingle();
          posBase = ((maxRow?.position ?? -1) + 1);
        }

        const row = {
          title,
          description: it.description || null,
          assignee_id: assigneeIds[0],
          created_by_id: createdBy,
          column_id: it.column_id || null,
          company_id: it.company_id || companyId,
          priority: it.priority || 'medium',
          status: 'pending',
          deadline: it.deadline || null,
          position: posBase,
          assignment_module: module,
        };

        let { data, error } = await supabase.from('crm_assignments').insert(row).select('id, title').single();
        if (error && /assignment_module/.test(error.message || '')) {
          delete row.assignment_module;
          ({ data, error } = await supabase.from('crm_assignments').insert(row).select('id, title').single());
        }
        if (error) throw error;

        const uniq = [...new Set(assigneeIds)];
        await supabase.from('crm_assignment_assignees').insert(
          uniq.map((uid) => ({ assignment_id: data.id, user_id: uid }))
        );
        created.push(data);
      } catch (e) {
        errors.push({ index: i, title: it.title, error: e.message });
      }

      await ctx.updateProgress(i + 1, items.length, { phase: 'create', created: created.length });
    }

    return { created: created.length, total: items.length, assignments: created, errors };
  },
});

/** Chunk generic — gọi callback trong payload không được; dùng cho job nội bộ mở rộng sau. */
registerBatchJobType('noop_ping', {
  label: 'Kiểm tra queue (ping)',
  description: 'Job test — sleep ngắn và trả về ok',
  adminOnly: true,
  run: async (job, ctx) => {
    const steps = Math.min(10, Math.max(1, Number(job.payload?.steps) || 3));
    for (let i = 0; i < steps; i++) {
      await ctx.isAborted();
      await new Promise((r) => setTimeout(r, 200));
      await ctx.updateProgress(i + 1, steps, { phase: 'ping' });
    }
    return { ok: true, steps };
  },
});

module.exports = {
  registerBatchJobType,
  getBatchJobType,
  listBatchJobTypes,
  canUserRunBatchType,
  BATCH_ADMIN_ROLES,
};
