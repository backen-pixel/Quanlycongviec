/**
 * Tạo / cập nhật sự kiện dự kiến từ setup ngày trên CRM/SX:
 * - Lắp đặt + lấy hàng → module=logistics (assignee = NV phụ trách VC)
 * - Hoàn thiện SX (production_finish_date) → module=production
 * Chỉ NV chịu trách nhiệm được gán participant → họ mới thấy trên lịch (NV thường).
 * Sự kiện lấy hàng + lắp đặt + hoàn thiện SX: mời toàn bộ người trên dự án.
 */
const { supabase } = require('../config/supabase');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
  resolveLogisticsHandoverConfirmUserId,
} = require('./logisticsHandoverSettings');
const { collectProjectEventParticipantIds } = require('./dealModuleResponsibleUsers');

async function resolveEventTypeBySlugs(slugs) {
  for (const slug of slugs) {
    const { data } = await supabase.from('event_types').select('id, slug').eq('slug', slug).maybeSingle();
    if (data?.id) return { id: data.id, slug: data.slug };
  }
  return { id: null, slug: slugs[0] || null };
}

function vnDayKey(isoOrDate) {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

function normalizeOccurrenceYmds(raw) {
  const list = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : []);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const ymd = String(item || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || seen.has(ymd)) continue;
    seen.add(ymd);
    out.push(ymd);
  }
  out.sort();
  return out;
}

/** Giữ giờ từ ISO/local, gắn sang YMD (VN +07). */
function isoOnYmdWithHm(ymd, sourceIso, fallbackHm = '14:00') {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  let hm = fallbackHm;
  if (sourceIso) {
    const m = String(sourceIso).match(/T(\d{2}:\d{2})/);
    if (m) hm = m[1];
    else {
      const d = new Date(sourceIso);
      if (!Number.isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(d);
        const h = parts.find((p) => p.type === 'hour')?.value;
        const min = parts.find((p) => p.type === 'minute')?.value;
        if (h && min) hm = `${h}:${min}`;
      }
    }
  }
  return `${ymd}T${hm}:00+07:00`;
}

/** YMD hoặc ISO → ISO VN 17:00 (deadline hoàn thiện). */
function toProductionFinishIso(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : s;
  }
  const ymd = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return `${ymd}T17:00:00+07:00`;
}

async function upsertEventParticipants(eventId, userIds = []) {
  if (!eventId || !userIds?.length) return;
  const rows = [...new Set(userIds.filter(Boolean).map(String))].map((uid) => ({
    event_id: eventId,
    user_id: uid,
    status: 'confirmed',
  }));
  if (!rows.length) return;
  await supabase.from('crm_event_participants').upsert(rows, { onConflict: 'event_id,user_id' });
}

async function insertOrUpdatePlannedEvent({
  existingId = null,
  payload,
  participantUserIds = [],
}) {
  let body = { ...payload };
  let eventId = existingId || null;

  if (existingId) {
    const { occurrence_dates, created_by, ...upd } = body;
    void created_by;
    let { error } = await supabase.from('crm_events').update({
      ...upd,
      updated_at: new Date().toISOString(),
      ...(occurrence_dates !== undefined ? { occurrence_dates } : {}),
    }).eq('id', existingId);
    if (error && /column.*occurrence_dates/i.test(String(error.message || ''))) {
      ({ error } = await supabase.from('crm_events').update({
        ...upd,
        updated_at: new Date().toISOString(),
      }).eq('id', existingId));
    }
    if (error) throw error;
  } else {
    let ins = await supabase.from('crm_events').insert(body).select('id').single();
    if (ins.error && /column.*occurrence_dates/i.test(String(ins.error.message || ''))) {
      const { occurrence_dates: _o, ...noOcc } = body;
      void _o;
      body = noOcc;
      ins = await supabase.from('crm_events').insert(body).select('id').single();
    }
    if (ins.error && /column.*module.*does not exist/i.test(String(ins.error.message || ''))) {
      const { module: _m, ...legacy } = body;
      void _m;
      body = legacy;
      ins = await supabase.from('crm_events').insert(body).select('id').single();
    }
    if (ins.error) throw ins.error;
    eventId = ins.data?.id || null;
  }

  if (eventId) {
    await upsertEventParticipants(eventId, participantUserIds);
  }
  return eventId;
}

/**
 * Upsert sự kiện dự kiến từ setup ngày lắp / lấy hàng / hoàn thiện SX.
 * @returns {{ ok: boolean, installEventId?: string|null, pickupEventId?: string|null, finishEventId?: string|null, logisticsStaffIds?: string[], error?: string }}
 */
async function upsertPlannedVcLdEvents({
  projectId,
  leadId = null,
  userId = null,
  companyId = null,
  customerId = null,
  projectCode = null,
  projectName = null,
  installAddress = null,
  pickupAt = null,
  installAt = null,
  productionFinishAt = null,
  logisticsCompanyId = null,
  installOccurrenceDates = null,
  vcNotes = null,
} = {}) {
  if (!projectId) return { ok: false, error: 'missing projectId' };
  const installIso = installAt ? String(installAt).trim() : null;
  const pickupIso = pickupAt ? String(pickupAt).trim() : null;
  const finishIso = toProductionFinishIso(productionFinishAt);
  let occDates = normalizeOccurrenceYmds(installOccurrenceDates);
  if (!occDates.length && installIso) {
    const day = vnDayKey(installIso);
    if (day) occDates = [day];
  }
  if (!installIso && !pickupIso && !finishIso && !occDates.length) return { ok: true, skipped: true };

  const installDateOk = (installIso && !Number.isNaN(new Date(installIso).getTime())) || occDates.length > 0;
  const pickupDateOk = pickupIso && !Number.isNaN(new Date(pickupIso).getTime());
  const finishDateOk = !!(finishIso && !Number.isNaN(new Date(finishIso).getTime()));
  if (!installDateOk && !pickupDateOk && !finishDateOk) return { ok: false, error: 'invalid dates' };

  const resolvedInstallIso = occDates.length
    ? (isoOnYmdWithHm(occDates[0], installIso, '14:00') || installIso)
    : installIso;
  const installEndIso = occDates.length > 1
    ? isoOnYmdWithHm(occDates[occDates.length - 1], installIso, '14:00')
    : null;

  const projLabel = projectName || projectCode || 'dự án';
  const logisticsCompany = logisticsCompanyId || companyId || null;
  const productionCompany = companyId || logisticsCompanyId || null;

  // company_id sự kiện: ưu tiên công ty deal (lead) để lịch CRM/công ty deal luôn thấy đủ
  // (công ty lớn >320 lead không OR theo lead_id — chỉ lọc company_id).
  let dealCompanyId = null;
  if (leadId) {
    try {
      const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('company_id, customer_id')
        .eq('id', leadId)
        .maybeSingle();
      dealCompanyId = leadRow?.company_id || null;
      if (!customerId && leadRow?.customer_id) customerId = leadRow.customer_id;
    } catch (_) { /* ignore */ }
  }
  const logisticsEventCompany = dealCompanyId || logisticsCompany;
  const productionEventCompany = dealCompanyId || productionCompany;
  if (!logisticsEventCompany && !productionEventCompany) {
    return { ok: false, error: 'missing company_id for events' };
  }

  // NV chịu trách nhiệm VC/LĐ (+ đã gán trên project)
  let logisticsAssigneeId = null;
  let installerAssigneeId = null;
  let confirmUserId = null;
  let productionAssigneeId = null;
  let resolvedVcNotes = vcNotes ? String(vcNotes).trim() : '';
  try {
    const staffCols = 'logistics_person_id, installer_person_id, production_person_id, logistics_company_id';
    let { data: proj } = await supabase
      .from('projects')
      .select(`${staffCols}, vc_notes`)
      .eq('id', projectId)
      .maybeSingle();
    if (!proj) {
      // Migration 532 chưa chạy → chưa có cột vc_notes
      ({ data: proj } = await supabase
        .from('projects')
        .select(staffCols)
        .eq('id', projectId)
        .maybeSingle());
    }
    if (!resolvedVcNotes && proj?.vc_notes) resolvedVcNotes = String(proj.vc_notes).trim();
    const logCo = logisticsCompanyId || proj?.logistics_company_id || logisticsCompany;
    logisticsAssigneeId = proj?.logistics_person_id
      || (logCo ? await resolveLogisticsHandoverResponsibleUserId(logCo) : null)
      || null;
    installerAssigneeId = proj?.installer_person_id
      || (logCo ? await resolveLogisticsHandoverInstallerUserId(logCo) : null)
      || logisticsAssigneeId
      || null;
    // Người bấm xác nhận phía VC/LĐ cũng cần thấy lịch dự kiến trên module Lắp đặt
    confirmUserId = logCo
      ? await resolveLogisticsHandoverConfirmUserId(logCo, logisticsAssigneeId)
      : null;
    productionAssigneeId = proj?.production_person_id || null;

    // Ghi lại người phụ trách lên project nếu còn trống
    if (logCo && (logisticsAssigneeId || installerAssigneeId)) {
      const patch = { updated_at: new Date().toISOString() };
      if (!proj?.logistics_person_id && logisticsAssigneeId) patch.logistics_person_id = logisticsAssigneeId;
      if (!proj?.installer_person_id && installerAssigneeId) patch.installer_person_id = installerAssigneeId;
      if (Object.keys(patch).length > 1) {
        await supabase.from('projects').update(patch).eq('id', projectId);
      }
    }
  } catch (staffErr) {
    console.warn('[planned-vc-ld-events] resolve staff:', staffErr.message);
  }

  const logisticsParticipants = [...new Set([
    logisticsAssigneeId,
    installerAssigneeId,
    confirmUserId,
    userId,
  ].filter(Boolean).map(String))];

  // Lấy hàng + lắp đặt + hoàn thiện: mời toàn bộ người trên dự án
  let projectPeopleIds = [];
  try {
    const people = await collectProjectEventParticipantIds({ leadId, projectId });
    projectPeopleIds = people.userIds || [];
  } catch (ownerErr) {
    console.warn('[planned-vc-ld-events] project people:', ownerErr.message);
  }
  const planParticipants = [...new Set([...logisticsParticipants, ...projectPeopleIds])];

  const addr = installAddress ? `Địa chỉ: ${installAddress}` : null;
  const vcNoteLine = resolvedVcNotes ? `Ghi chú VC/LĐ: ${resolvedVcNotes}` : null;
  const note = 'Sự kiện dự kiến từ setup ngày khi tạo / chỉnh dự án SX trên CRM.';

  let existing = [];
  try {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, event_type, status, module, title')
      .eq('project_id', projectId)
      .in('event_type', ['installation', 'pickup', 'production_finish', 'other', 'delivery'])
      .limit(40);
    if (!error) existing = data || [];
  } catch (_) { /* ignore */ }

  const findExisting = (typeSlug) => {
    if (typeSlug === 'production_finish') {
      return (existing || []).find((e) => String(e.event_type || '') === 'production_finish'
        || /hoàn thiện sản xuất/i.test(String(e.title || '')))
        || (existing || []).find((e) => String(e.event_type || '') === 'production_finish')
        || null;
    }
    return (existing || []).find((e) => String(e.event_type || '') === typeSlug) || null;
  };

  const keepStatus = (prev) => {
    const st = String(prev?.status || '').toLowerCase();
    if (st === 'in_progress' || st === 'completed' || st === 'cancelled') return st;
    return 'planned';
  };

  const pickupType = await resolveEventTypeBySlugs(['pickup', 'delivery']);
  const installType = await resolveEventTypeBySlugs(['installation', 'pickup']);
  const finishType = await resolveEventTypeBySlugs(['other', 'inspection']);

  const baseLogistics = {
    lead_id: leadId || null,
    project_id: projectId,
    customer_id: customerId || null,
    company_id: logisticsEventCompany,
    created_by: userId || null,
    module: 'logistics',
  };

  let pickupEventId = null;
  let installEventId = null;
  let finishEventId = null;

  try {
    if (pickupDateOk && logisticsEventCompany) {
      const prev = findExisting('pickup');
      pickupEventId = await insertOrUpdatePlannedEvent({
        existingId: prev?.id || null,
        participantUserIds: planParticipants,
        payload: {
          ...baseLogistics,
          status: keepStatus(prev),
          event_type_id: pickupType.id,
          event_type: pickupType.slug || 'pickup',
          assignee_id: logisticsAssigneeId || null,
          title: keepStatus(prev) === 'planned'
            ? `Lấy hàng (dự kiến) — ${projLabel}`
            : `Lấy hàng — ${projLabel}`,
          description: [vcNoteLine, addr, note].filter(Boolean).join('\n'),
          start_time: pickupIso,
          location: installAddress || null,
        },
      });
    }

    if (installDateOk && logisticsEventCompany && resolvedInstallIso) {
      const prev = findExisting('installation');
      const firstDay = occDates[0] || vnDayKey(resolvedInstallIso);
      const multiHint = occDates.length > 1
        ? `Ngày lắp: ${occDates.join(', ')}.`
        : null;
      installEventId = await insertOrUpdatePlannedEvent({
        existingId: prev?.id || null,
        participantUserIds: planParticipants,
        payload: {
          ...baseLogistics,
          status: keepStatus(prev),
          event_type_id: installType.id,
          event_type: installType.slug || 'installation',
          assignee_id: installerAssigneeId || logisticsAssigneeId || null,
          title: keepStatus(prev) === 'planned'
            ? `Lắp đặt (dự kiến) — ${projLabel}`
            : `Lắp đặt — ${projLabel}`,
          description: [
            vcNoteLine,
            addr,
            multiHint,
            pickupDateOk && vnDayKey(pickupIso) === firstDay && occDates.length <= 1
              ? 'Cùng ngày với lấy hàng VC.'
              : null,
            note,
          ].filter(Boolean).join('\n'),
          start_time: resolvedInstallIso,
          end_time: installEndIso,
          occurrence_dates: occDates.length ? occDates : (firstDay ? [firstDay] : null),
          location: installAddress || null,
        },
      });
    }

    if (finishDateOk && productionEventCompany) {
      const prev = findExisting('production_finish');
      const finishDay = vnDayKey(finishIso);
      finishEventId = await insertOrUpdatePlannedEvent({
        existingId: prev?.id || null,
        participantUserIds: planParticipants,
        payload: {
          lead_id: leadId || null,
          project_id: projectId,
          customer_id: customerId || null,
          company_id: productionEventCompany,
          created_by: userId || null,
          module: 'production',
          status: keepStatus(prev),
          event_type_id: finishType.id,
          event_type: 'production_finish',
          assignee_id: productionAssigneeId || null,
          title: keepStatus(prev) === 'planned'
            ? `Hoàn thiện sản xuất (dự kiến) — ${projLabel}`
            : `Hoàn thiện sản xuất — ${projLabel}`,
          description: [
            note,
            finishDay ? `Deadline hoàn thiện SX: ${finishDay}` : null,
            addr,
          ].filter(Boolean).join('\n'),
          start_time: finishIso,
          occurrence_dates: finishDay ? [finishDay] : null,
          location: installAddress || null,
        },
      });
    }

    return {
      ok: true,
      pickupEventId,
      installEventId,
      finishEventId,
      logisticsStaffIds: [logisticsAssigneeId, installerAssigneeId, confirmUserId]
        .filter(Boolean)
        .map(String),
    };
  } catch (e) {
    console.warn('[planned-vc-ld-events]', e.message);
    return { ok: false, error: e.message };
  }
}

async function resolveProjectIdForInstallEvent(event) {
  if (event?.project_id) return String(event.project_id);
  const leadId = event?.lead_id ? String(event.lead_id) : '';
  if (!leadId) return null;
  try {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (lead?.project_id) return String(lead.project_id);
  } catch (_) { /* ignore */ }
  try {
    const { data: link } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .eq('deal_id', leadId)
      .limit(1)
      .maybeSingle();
    if (link?.project_id) return String(link.project_id);
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Sự kiện lắp đặt = deadline VC/LĐ. Ghi ngày (và giờ) sự kiện lên projects.install_date
 * để lịch Deadline / Lịch module Lắp đặt cùng ngày với sự kiện.
 */
async function syncProjectInstallDateFromInstallationEvent(event) {
  if (!event) return { ok: false, skipped: true };
  const type = String(event.event_type || '').toLowerCase();
  if (type !== 'installation') return { ok: true, skipped: true };
  const status = String(event.status || '').toLowerCase();
  if (status === 'cancelled') return { ok: true, skipped: true };

  const projectId = await resolveProjectIdForInstallEvent(event);
  if (!projectId) return { ok: true, skipped: true, reason: 'no_project' };

  const occ = normalizeOccurrenceYmds(event.occurrence_dates);
  const startIso = event.start_time ? String(event.start_time).trim() : null;
  const firstYmd = occ[0] || vnDayKey(startIso);
  if (!firstYmd) return { ok: true, skipped: true, reason: 'no_date' };

  const installIso = isoOnYmdWithHm(firstYmd, startIso, '14:00') || `${firstYmd}T14:00:00+07:00`;

  let proj = null;
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, install_date')
      .eq('id', projectId)
      .maybeSingle();
    proj = data || null;
  } catch (err) {
    console.warn('[planned-vc-ld-events] load project for install sync:', err.message);
    return { ok: false, error: err.message };
  }
  if (!proj) return { ok: true, skipped: true, reason: 'project_missing' };

  if (vnDayKey(proj.install_date) === firstYmd && String(proj.install_date || '') === installIso) {
    return { ok: true, skipped: true, reason: 'unchanged' };
  }
  // Cùng ngày + cùng giờ (ISO khác format) → bỏ qua
  if (vnDayKey(proj.install_date) === firstYmd) {
    const oldIso = isoOnYmdWithHm(firstYmd, proj.install_date, '14:00');
    if (oldIso && oldIso === installIso) return { ok: true, skipped: true, reason: 'unchanged' };
  }

  const patch = {
    install_date: installIso,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (error) {
    console.warn('[planned-vc-ld-events] sync install_date:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, projectId, install_date: installIso };
}

function chunkIds(arr, size = 80) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Gắn ngày sự kiện lắp đặt vào list dự án VC (lịch Deadline / Lịch).
 * Ưu tiên occurrence_dates của sự kiện; fallback start_time.
 */
async function attachInstallEventDatesToProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const ids = [...new Set(list.map((p) => p?.id).filter(Boolean).map(String))];
  if (!ids.length) return list;

  const byProject = new Map();
  try {
    for (const part of chunkIds(ids, 80)) {
      const { data, error } = await supabase
        .from('crm_events')
        .select('project_id, start_time, occurrence_dates, status')
        .in('project_id', part)
        .eq('event_type', 'installation')
        .neq('status', 'cancelled');
      if (error) {
        if (/occurrence_dates/i.test(String(error.message || ''))) {
          const retry = await supabase
            .from('crm_events')
            .select('project_id, start_time, status')
            .in('project_id', part)
            .eq('event_type', 'installation')
            .neq('status', 'cancelled');
          for (const ev of retry.data || []) {
            const pid = ev?.project_id ? String(ev.project_id) : '';
            if (!pid) continue;
            const ymd = vnDayKey(ev.start_time);
            const prev = byProject.get(pid) || { ymds: [], startTime: null };
            if (ymd && !prev.ymds.includes(ymd)) prev.ymds.push(ymd);
            if (!prev.startTime && ev.start_time) prev.startTime = ev.start_time;
            prev.ymds.sort();
            byProject.set(pid, prev);
          }
          continue;
        }
        console.warn('[planned-vc-ld-events] attach install dates:', error.message);
        break;
      }
      for (const ev of data || []) {
        const pid = ev?.project_id ? String(ev.project_id) : '';
        if (!pid) continue;
        const occ = normalizeOccurrenceYmds(ev.occurrence_dates);
        const ymds = occ.length ? occ : (vnDayKey(ev.start_time) ? [vnDayKey(ev.start_time)] : []);
        if (!ymds.length) continue;
        const prev = byProject.get(pid) || { ymds: [], startTime: null };
        for (const y of ymds) {
          if (!prev.ymds.includes(y)) prev.ymds.push(y);
        }
        if (ev.start_time && (!prev.startTime || String(ev.start_time) < String(prev.startTime))) {
          prev.startTime = ev.start_time;
        }
        prev.ymds.sort();
        byProject.set(pid, prev);
      }
    }
  } catch (err) {
    console.warn('[planned-vc-ld-events] attach install dates:', err.message);
    return list;
  }

  if (!byProject.size) return list;
  return list.map((p) => {
    const hit = byProject.get(String(p.id));
    if (!hit) return p;
    const firstYmd = hit.ymds[0];
    const sameDay = firstYmd && vnDayKey(p.install_date) === firstYmd;
    const overlayIso = sameDay
      ? p.install_date
      : (firstYmd
        ? (isoOnYmdWithHm(firstYmd, hit.startTime || p.install_date, '14:00') || hit.startTime || p.install_date)
        : (hit.startTime || p.install_date));
    return {
      ...p,
      install_occurrence_dates: hit.ymds,
      install_date: overlayIso || p.install_date,
    };
  });
}

module.exports = {
  upsertPlannedVcLdEvents,
  toProductionFinishIso,
  normalizeOccurrenceYmds,
  syncProjectInstallDateFromInstallationEvent,
  attachInstallEventDatesToProjects,
};
