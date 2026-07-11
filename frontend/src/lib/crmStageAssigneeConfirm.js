/** Cột pipeline có bật chuyển PT và NV đích khác PT hiện tại → cần hỏi user. */
export function stageNeedsAssigneeConfirm(targetStage, card) {
  if (!targetStage?.apply_default_assignee_on_enter) return false;
  const defId = String(targetStage.default_assignee_user_id || '').trim();
  if (!defId) return false;
  const curId = String(card?.assigned_to || card?.lead_owner_id || '').trim();
  return curId !== defId;
}

export function resolveCrmAssigneeLabel(card, userId, employeeList = []) {
  if (!userId) return 'Chưa gán';
  const uid = String(userId);
  const cardOwnerId = String(card?.assigned_to || card?.lead_owner_id || '');
  if (cardOwnerId === uid) {
    const fromCard = card?.assignee?.full_name || card?.lead_owner?.full_name;
    if (fromCard) return fromCard;
  }
  const u = (employeeList || []).find((x) => String(x.id) === uid);
  return u?.full_name || u?.email || 'Nhân viên';
}
