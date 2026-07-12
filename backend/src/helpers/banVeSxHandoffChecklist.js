/**
 * Checklist bàn giao hồ sơ kỹ thuật — nhiệm vụ «Bản vẽ sản xuất».
 * Ghi chú/file up vào từng mục tự chia sẻ sang module Sản xuất.
 */

const BAN_VE_SX_TASK_TITLE = 'Bản vẽ sản xuất';

const BAN_VE_SX_HANDOFF_CHECKLIST = [
  {
    title: 'ĐẦY ĐỦ FILE SKP',
    required_evidence_file_types: ['sketchup'],
    completion_requires_file_or_note: true,
    shared_to_project: true,
    allowed_share_modules: ['production'],
  },
  {
    title: 'MÔ TẢ EXCEL',
    required_evidence_file_types: ['excel'],
    completion_requires_file_or_note: true,
    shared_to_project: true,
    allowed_share_modules: ['production'],
  },
  {
    title: 'HÌNH 3D',
    required_evidence_file_types: ['render', 'image'],
    completion_requires_file_or_note: true,
    shared_to_project: true,
    allowed_share_modules: ['production'],
  },
  {
    title: 'HÌNH THỰC TẾ',
    required_evidence_file_types: ['image'],
    completion_requires_file_or_note: true,
    shared_to_project: true,
    allowed_share_modules: ['production'],
  },
  {
    title: 'THÔNG TIN PHỤ KIỆN',
    required_evidence_file_types: ['note', 'excel', 'document'],
    completion_requires_file_or_note: true,
    shared_to_project: true,
    allowed_share_modules: ['production'],
  },
];

function normTitle(s) {
  return String(s || '').trim().toUpperCase();
}

/**
 * Gộp checklist mẫu với checklist hiện có — giữ id/done/notes theo tên mục.
 */
function mergeBanVeSxChecklist(priorChecklist, templateChecklist = BAN_VE_SX_HANDOFF_CHECKLIST) {
  const prior = Array.isArray(priorChecklist) ? priorChecklist : [];
  const priorByTitle = new Map();
  for (const c of prior) {
    const title = typeof c === 'string' ? c : (c?.title || c?.label || '');
    const key = normTitle(title);
    if (key) priorByTitle.set(key, c);
  }

  const { normalizeTemplateChecklistForCrmTask } = require('./templateChecklistNormalize');
  const fresh = normalizeTemplateChecklistForCrmTask(templateChecklist);

  return fresh.map((tpl) => {
    const old = priorByTitle.get(normTitle(tpl.title));
    if (!old) return tpl;
    const oldObj = typeof old === 'string' ? { title: old } : old;
    return {
      ...tpl,
      id: oldObj.id || tpl.id,
      done: !!(oldObj.done ?? oldObj.is_completed),
      notes: oldObj.notes || '',
      assignee_id: oldObj.assignee_id || tpl.assignee_id || null,
      executor_company_id: oldObj.executor_company_id || tpl.executor_company_id || null,
    };
  });
}

module.exports = {
  BAN_VE_SX_TASK_TITLE,
  BAN_VE_SX_HANDOFF_CHECKLIST,
  mergeBanVeSxChecklist,
};
