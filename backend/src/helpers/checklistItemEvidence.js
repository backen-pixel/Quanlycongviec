/**
 * Minh chứng bắt buộc theo loại file/ghi chú trên từng mục checklist (JSONB crm_tasks.checklist).
 */

const {
  normalizeEvidenceFileTypes,
  evaluateRequiredEvidenceTypes,
  formatMissingEvidenceTypesLabel,
  taskRequiresTypedEvidence,
} = require('./evidenceFileTypes');

function normalizeChecklistEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const title = String(raw).trim();
    return title ? { title } : null;
  }
  const title = String(raw.title || raw.label || '').trim();
  if (!title) return null;
  return { ...raw, title };
}

function checklistItemRequiresEvidence(item) {
  const ck = normalizeChecklistEntry(item);
  if (!ck) return false;
  return taskRequiresTypedEvidence(ck);
}

function checklistItemHasNoteOrFile(ck, attachments = []) {
  if (ck.notes != null && String(ck.notes).trim() !== '') return true;
  const ckAtts = (attachments || []).filter(
    (a) => String(a.checklist_id || '') === String(ck.id || ''),
  );
  return ckAtts.some(
    (a) => (a.file_url && String(a.file_url).trim() !== '')
      || (a.notes != null && String(a.notes).trim() !== ''),
  );
}

function checklistItemMeetsEvidence(item, attachments = []) {
  const ck = normalizeChecklistEntry(item);
  if (!ck || !checklistItemRequiresEvidence(ck)) {
    return { ok: true, missing: [], missingLabel: '' };
  }
  const types = normalizeEvidenceFileTypes(ck.required_evidence_file_types);
  const ckAtts = (attachments || []).filter(
    (a) => String(a.checklist_id || '') === String(ck.id || ''),
  );

  if (!types.length && ck.completion_requires_file_or_note) {
    const ok = checklistItemHasNoteOrFile(ck, attachments);
    return {
      ok,
      missing: ok ? [] : ['note'],
      missingLabel: ok ? '' : 'ghi chú hoặc file đính kèm',
    };
  }

  const required = types.length ? types : ['note'];
  const eval0 = evaluateRequiredEvidenceTypes(required, {
    taskNotes: ck.notes,
    attachments: ckAtts,
  });
  return {
    ok: eval0.ok,
    missing: eval0.missing,
    missingLabel: formatMissingEvidenceTypesLabel(eval0.missing),
  };
}

/**
 * Kiểm tra mọi mục checklist đánh dấu done có đủ minh chứng (nếu cấu hình yêu cầu).
 * @returns {{ ok: boolean, itemTitle?: string, missingLabel?: string }}
 */
function validateChecklistDoneEvidence(checklist, attachments) {
  const list = Array.isArray(checklist) ? checklist : [];
  for (const raw of list) {
    const ck = normalizeChecklistEntry(raw);
    if (!ck?.done) continue;
    if (!checklistItemRequiresEvidence(ck)) continue;
    const check = checklistItemMeetsEvidence(ck, attachments);
    if (!check.ok) {
      return {
        ok: false,
        itemTitle: ck.title,
        missingLabel: check.missingLabel,
      };
    }
  }
  return { ok: true };
}

/**
 * Khi chuyển mục checklist sang done — chỉ validate các mục mới done hoặc đang done.
 */
function validateChecklistTransition(priorChecklist, nextChecklist, attachments) {
  const priorMap = new Map();
  for (const raw of Array.isArray(priorChecklist) ? priorChecklist : []) {
    const ck = normalizeChecklistEntry(raw);
    if (ck?.id) priorMap.set(String(ck.id), !!ck.done);
  }
  for (const raw of Array.isArray(nextChecklist) ? nextChecklist : []) {
    const ck = normalizeChecklistEntry(raw);
    if (!ck?.done) continue;
    if (!checklistItemRequiresEvidence(ck)) continue;
    const wasDone = ck.id ? priorMap.get(String(ck.id)) : false;
    if (wasDone) {
      const check = checklistItemMeetsEvidence(ck, attachments);
      if (!check.ok) {
        return { ok: false, itemTitle: ck.title, missingLabel: check.missingLabel };
      }
      continue;
    }
    const check = checklistItemMeetsEvidence(ck, attachments);
    if (!check.ok) {
      return { ok: false, itemTitle: ck.title, missingLabel: check.missingLabel };
    }
  }
  return { ok: true };
}

function evidenceFieldsFromTemplateChecklistItem(x) {
  if (!x || typeof x !== 'object') return {};
  const types = normalizeEvidenceFileTypes(x.required_evidence_file_types);
  return {
    completion_requires_file_or_note: !!x.completion_requires_file_or_note || types.length > 0,
    required_evidence_file_types: types,
  };
}

module.exports = {
  normalizeChecklistEntry,
  checklistItemRequiresEvidence,
  checklistItemMeetsEvidence,
  validateChecklistDoneEvidence,
  validateChecklistTransition,
  evidenceFieldsFromTemplateChecklistItem,
};
