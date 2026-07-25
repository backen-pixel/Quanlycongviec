/**
 * Lọc thông báo theo phạm vi dự án: công ty, khu vực, loại xưởng, tên/mã, project_id.
 * Metadata TB thường chỉ có project_id/code — resolve qua bảng projects (+ crm_leads.region_id).
 */

const { supabase } = require('../config/supabase');

function extractNotificationProjectId(n) {
  if (!n) return null;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (meta.project_id != null && String(meta.project_id).trim() !== '') {
    return String(meta.project_id).trim();
  }
  if (String(n.entity_type || '') === 'project' && n.entity_id != null && String(n.entity_id).trim() !== '') {
    return String(n.entity_id).trim();
  }
  return null;
}

function notificationMatchesProjectIdSet(n, projectIdSet) {
  if (!projectIdSet) return true;
  const pid = extractNotificationProjectId(n);
  if (!pid) return false;
  return projectIdSet.has(pid);
}

/**
 * @returns {Promise<Set<string>|null>} null = không lọc theo dự án; Set rỗng = không khớp gì.
 */
async function resolveProjectIdsForNotificationFilter({
  companyId,
  regionId,
  workshopTypeId,
  projectQ,
  projectId,
} = {}) {
  const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : '';
  if (pid) return new Set([pid]);

  const cid = companyId != null && String(companyId).trim() !== '' ? String(companyId).trim() : '';
  const rid = regionId != null && String(regionId).trim() !== '' ? String(regionId).trim() : '';
  const wtid = workshopTypeId != null && String(workshopTypeId).trim() !== '' ? String(workshopTypeId).trim() : '';
  const q = projectQ != null ? String(projectQ).trim() : '';

  if (!cid && !rid && !wtid && !q) return null;

  let query = supabase.from('projects').select('id').limit(3000);
  if (cid) query = query.eq('company_id', cid);
  if (wtid) query = query.eq('workshop_type_id', wtid);
  if (q) {
    const safe = q.replace(/[%_,]/g, ' ').slice(0, 80);
    if (safe) query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[notif-project-scope]', error.message);
    return new Set();
  }

  let ids = (data || []).map((r) => String(r.id)).filter(Boolean);

  if (rid) {
    if (!ids.length && (cid || wtid || q)) return new Set();
    let lq = supabase
      .from('crm_leads')
      .select('project_id')
      .eq('region_id', rid)
      .not('project_id', 'is', null)
      .limit(3000);
    if (ids.length) lq = lq.in('project_id', ids);
    const { data: leads, error: lerr } = await lq;
    if (lerr) {
      console.warn('[notif-project-scope] region', lerr.message);
      return new Set();
    }
    ids = [...new Set((leads || []).map((l) => String(l.project_id)).filter(Boolean))];
  }

  return new Set(ids);
}

/**
 * Bổ sung tên/mã dự án từ bảng projects cho dropdown lọc.
 */
async function enrichNotificationProjectOptions(baseOptions) {
  const list = Array.isArray(baseOptions) ? baseOptions : [];
  const ids = list.map((o) => o?.id).filter(Boolean);
  if (!ids.length) return list;

  const { data, error } = await supabase
    .from('projects')
    .select('id, code, name, company_id, workshop_type_id')
    .in('id', ids.slice(0, 500));
  if (error || !data?.length) return list;

  const byId = new Map(data.map((p) => [String(p.id), p]));
  return list.map((opt) => {
    const p = byId.get(String(opt.id));
    if (!p) return opt;
    const code = String(p.code || '').trim();
    const name = String(p.name || '').trim();
    const label = code && name && code !== name
      ? `${code} — ${name}`
      : (code || name || opt.label);
    return {
      id: String(opt.id),
      label,
      company_id: p.company_id ? String(p.company_id) : null,
      workshop_type_id: p.workshop_type_id ? String(p.workshop_type_id) : null,
      code: code || null,
      name: name || null,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

module.exports = {
  extractNotificationProjectId,
  notificationMatchesProjectIdSet,
  resolveProjectIdsForNotificationFilter,
  enrichNotificationProjectOptions,
};
