/**
 * Người chịu trách nhiệm cột Kanban SX — từ Cài đặt pipeline (default_staff).
 */

export function sxStageOwnerUsers(stage) {
  const ds = stage?.default_staff;
  if (!ds) return [];
  const users = Array.isArray(ds.users) ? ds.users.filter(Boolean) : [];
  const extra = [ds.logistics_person, ds.installer_person].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const u of [...users, ...extra]) {
    const id = String(u.id || u.full_name || u.email || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(u);
  }
  return out;
}

export function sxStagePrimaryOwner(stage) {
  const ds = stage?.default_staff;
  const users = sxStageOwnerUsers(stage);
  if (!users.length) return null;
  const pid = ds?.primary_user_id;
  return users.find((u) => String(u.id) === String(pid)) || users[0];
}

export function sxStagePrimaryOwnerName(stage) {
  const u = sxStagePrimaryOwner(stage);
  if (!u) return '';
  return String(u.full_name || u.email || '').trim();
}
