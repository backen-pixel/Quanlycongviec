/** Người phụ trách CRM của deal (assigned_to / lead_owner_id). */
export function getDealResponsibleId(dealOrLead) {
  if (!dealOrLead) return null;
  return (
    dealOrLead.assigned_to
    || dealOrLead.lead_owner_id
    || dealOrLead.assignee?.id
    || dealOrLead.lead_owner?.id
    || null
  );
}

export function isDealResponsibleUser(user, dealOrLead, { allowAdmin = true } = {}) {
  if (!user) return false;
  const uid = user.userId || user.id;
  if (!uid) return false;
  if (allowAdmin) {
    const role = String(user.role || '').toLowerCase();
    if (role === 'admin' || role === 'sales_admin') return true;
  }
  const sUid = String(uid);
  const crmOwner = getDealResponsibleId(dealOrLead);
  if (crmOwner && String(crmOwner) === sUid) return true;
  const prodPerson = dealOrLead?.production_person_id || dealOrLead?.production_person?.id;
  if (prodPerson && String(prodPerson) === sUid) return true;
  return false;
}

/** Quyền xóa/sửa file trên chi tiết dự án SX (gồm NV phụ trách SX trên project + đội SX). */
export function canManageWorkshopProjectFiles(user, dealOrLead, project, opts) {
  if (!user) return false;
  const uid = String(user.userId || user.id || '');
  if (!uid) return false;
  const dealCtx = {
    ...(dealOrLead || {}),
    production_person_id:
      dealOrLead?.production_person_id
      || project?.production_person_id
      || project?.production_person?.id
      || null,
  };
  if (isDealResponsibleUser(user, dealCtx, opts)) return true;
  const staffIds = (project?.production_staff || []).map((u) => String(u?.id || u?.user_id)).filter(Boolean);
  return staffIds.includes(uid);
}

/** @deprecated — dùng isDealResponsibleUser */
export function canManageUploadedFile(_file, user, opts) {
  return isDealResponsibleUser(user, null, opts);
}
