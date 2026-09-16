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

/** Phụ trách cột lớn = NV chính xuất hiện nhiều nhất trên các cột nhỏ trong nhóm. */
export function sxGroupPrimaryOwner(stages) {
  const counted = new Map();
  for (const st of (Array.isArray(stages) ? stages : [])) {
    const u = sxStagePrimaryOwner(st);
    if (!u?.id) continue;
    const id = String(u.id);
    const prev = counted.get(id) || { user: u, n: 0 };
    prev.n += 1;
    counted.set(id, prev);
  }
  if (!counted.size) return null;
  return [...counted.values()].sort((a, b) => b.n - a.n)[0].user;
}

export function sxGroupPrimaryOwnerId(stages) {
  const u = sxGroupPrimaryOwner(stages);
  if (u?.id) return String(u.id);
  const counts = new Map();
  for (const st of (Array.isArray(stages) ? stages : [])) {
    const id = String(st?.default_staff?.primary_user_id || '').trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (!counts.size) return '';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function sxGroupPrimaryOwnerName(stages) {
  const u = sxGroupPrimaryOwner(stages);
  return u ? String(u.full_name || u.email || '').trim() : '';
}
