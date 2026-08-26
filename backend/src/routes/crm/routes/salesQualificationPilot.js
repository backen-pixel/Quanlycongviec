/**
 * Business OS pilot — Lead → Qualification → Deal.
 * Router được mount sau auth + CRM lead access middleware.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const {
  getQualificationState,
  startQualification,
  completeQualification,
  isSalesPilotCompany,
} = require('../../../helpers/salesQualificationPilot');
const {
  saveQualificationCustomFieldValues,
} = require('../../../helpers/businessOsCustomFields');
const {
  getDealWorkflowState,
  startSurvey,
  startDesignReview,
  completeSurvey,
  completeDesign,
  completeDesignReview,
} = require('../../../helpers/businessOsDealWorkflow');

const r = Router();

function commandId(req) {
  return String(
    req.get('Idempotency-Key')
    || req.body?.command_id
    || '',
  ).trim();
}

function requestId(req) {
  return String(req.get('X-Request-Id') || '').trim() || null;
}

async function loadLead(id) {
  const { data, error } = await supabase
    .from('crm_leads')
    .select([
      'id',
      'code',
      'title',
      'type',
      'company_id',
      'customer_id',
      'phone',
      'region_id',
      'assigned_to',
      'lead_owner_id',
      'description',
      'estimated_value',
      'expected_construction_time',
      'install_address',
      'project_id',
      'sx_handover_at',
      'sx_template_company_id',
      'customer:customers(id, full_name, phone, address)',
      'region:company_regions(id, name)',
      'assignee:users!crm_leads_assigned_to_fkey(id, full_name)',
      'lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name)',
    ].join(', '))
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    error: error?.message || 'Lỗi xử lý Qualification',
    code: error?.code || 'BUSINESS_OS_QUALIFICATION_ERROR',
    ...(error?.details ? { qualification: error.details } : {}),
  });
}

function sendWorkflowError(res, error) {
  return res.status(Number(error?.status) || 500).json({
    error: error?.message || 'Lỗi xử lý Deal → Khảo sát → Thiết kế',
    code: error?.code || 'BUSINESS_OS_DEAL_WORKFLOW_ERROR',
    ...(error?.details ? { workflow: error.details } : {}),
  });
}

r.get('/leads/:id/qualification', async (req, res) => {
  try {
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    return res.json(await getQualificationState(lead));
  } catch (error) {
    return sendError(res, error);
  }
});

r.put('/leads/:id/qualification/custom-fields', async (req, res) => {
  try {
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const pilot = await isSalesPilotCompany(lead.company_id);
    if (!pilot.enabled) {
      return res.status(403).json({
        error: 'Dynamic Custom Fields hiện chỉ mở cho công ty đang pilot Business OS.',
        code: 'BUSINESS_OS_SALES_PILOT_DISABLED',
      });
    }
    const values = await saveQualificationCustomFieldValues({
      companyId: lead.company_id,
      leadId: lead.id,
      values: req.body?.values,
      actorUserId: req.user?.userId || req.user?.id,
    });
    const qualification = await getQualificationState(lead);
    return res.json({ values, qualification });
  } catch (error) {
    return sendError(res, error);
  }
});

r.post('/leads/:id/qualification/start', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Thiếu Idempotency-Key cho lệnh bắt đầu Qualification.',
        code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED',
      });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const state = await startQualification({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    });
    return res.json(state);
  } catch (error) {
    return sendError(res, error);
  }
});

r.post('/leads/:id/qualification/complete', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Thiếu Idempotency-Key cho lệnh hoàn tất Qualification.',
        code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED',
      });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    const state = await completeQualification({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    });
    return res.json(state);
  } catch (error) {
    return sendError(res, error);
  }
});

r.get('/leads/:id/deal-workflow', async (req, res) => {
  try {
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });
    return res.json(await getDealWorkflowState(lead));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

r.post('/leads/:id/deal-workflow/start-survey', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Thiếu Idempotency-Key cho lệnh bắt đầu Khảo sát.', code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED' });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    return res.json(await startSurvey({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    }));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

r.post('/leads/:id/deal-workflow/start-design-review', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Thiếu Idempotency-Key cho lệnh kiểm tra thiết kế có sẵn.', code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED' });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    return res.json(await startDesignReview({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    }));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

r.post('/leads/:id/deal-workflow/complete-survey', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Thiếu Idempotency-Key cho lệnh hoàn tất Khảo sát.', code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED' });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    return res.json(await completeSurvey({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    }));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

r.post('/leads/:id/deal-workflow/complete-design', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Thiếu Idempotency-Key cho lệnh hoàn tất Thiết kế.', code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED' });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    return res.json(await completeDesign({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    }));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

r.post('/leads/:id/deal-workflow/complete-design-review', async (req, res) => {
  try {
    const idempotencyKey = commandId(req);
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'Thiếu Idempotency-Key cho lệnh hoàn tất kiểm tra thiết kế có sẵn.', code: 'BUSINESS_OS_IDEMPOTENCY_KEY_REQUIRED' });
    }
    const lead = await loadLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy deal' });
    return res.json(await completeDesignReview({
      lead,
      actorUserId: req.user.userId,
      idempotencyKey,
      requestId: requestId(req),
    }));
  } catch (error) {
    return sendWorkflowError(res, error);
  }
});

module.exports = r;
