const { supabase } = require('../config/supabase');

/**
 * Phát socket `crm:task_changed` — mobile SX + web ProductionDetail / CRMTasksTab refetch.
 * @param {import('express').Request} req
 * @param {{ leadId: string, taskId?: string|null, action?: string, task?: object|null }} opts
 */
async function emitCrmTaskChanged(req, { leadId, taskId = null, action = 'updated', task = null }) {
  try {
    const io = req.app?.get?.('io');
    if (!io || !leadId) return;

    let projectId = null;
    try {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('project_id')
        .eq('id', leadId)
        .maybeSingle();
      projectId = lead?.project_id || null;
    } catch (_) {
      /* ignore */
    }

    const payload = {
      lead_id: String(leadId),
      task_id: taskId != null ? String(taskId) : null,
      project_id: projectId ? String(projectId) : null,
      action: action || 'updated',
      user_id: req.user?.userId ? String(req.user.userId) : null,
      at: new Date().toISOString(),
    };
    if (task && typeof task === 'object') {
      payload.task = {
        id: task.id,
        title: task.title,
        status: task.status,
        notes: task.notes,
        deadline: task.deadline,
        stage_slug: task.stage_slug,
      };
    }

    io.emit('crm:task_changed', payload);
    if (projectId) {
      io.to(`project:${projectId}`).emit('crm:task_changed', payload);
    }
  } catch (e) {
    console.warn('[crm:task_changed]', e?.message || e);
  }
}

module.exports = { emitCrmTaskChanged };
