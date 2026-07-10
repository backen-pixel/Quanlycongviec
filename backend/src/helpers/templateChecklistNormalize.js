const {
  evidenceFieldsFromTemplateChecklistItem,
  shareFieldsFromTemplateChecklistItem,
} = require('./checklistItemEvidence');

let _ckSeq = 0;

/**
 * Chuẩn hoá checklist mẫu → JSONB crm_tasks.checklist.
 * @param {unknown} raw
 * @param {string|null} [defaultExecutorCompanyId] — kế thừa từ nhiệm vụ mẫu cha nếu mục checklist chưa gán
 */
function normalizeTemplateChecklistForCrmTask(raw, defaultExecutorCompanyId = null) {
  if (!Array.isArray(raw)) return [];
  const defExec = defaultExecutorCompanyId ? String(defaultExecutorCompanyId) : null;
  return raw
    .map((x, i) => {
      const title = typeof x === 'string' ? x : (x?.title || x?.label || '');
      if (!title || !String(title).trim()) return null;
      const explicitExec = (typeof x === 'object' && x?.executor_company_id)
        ? String(x.executor_company_id)
        : null;
      return {
        id: `ck_${Date.now().toString(36)}_${(_ckSeq++).toString(36)}_${i}`,
        title: String(title).trim(),
        description: (typeof x === 'object' && x) ? String(x.description || '') : '',
        notes: '',
        priority: (typeof x === 'object' && x?.priority) ? x.priority : 'medium',
        assignee_id: (typeof x === 'object' && (x?.assignee_id || x?.default_assignee_id))
          ? String(x.assignee_id || x.default_assignee_id)
          : null,
        executor_company_id: explicitExec || defExec || null,
        done: false,
        ...evidenceFieldsFromTemplateChecklistItem(x),
        ...shareFieldsFromTemplateChecklistItem(x),
      };
    })
    .filter(Boolean);
}

module.exports = { normalizeTemplateChecklistForCrmTask };
