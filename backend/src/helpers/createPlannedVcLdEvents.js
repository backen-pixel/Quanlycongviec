/**
 * Tạo / cập nhật sự kiện dự kiến từ setup ngày trên CRM/SX:
 * - Lắp đặt + lấy hàng → module=logistics (assignee = NV phụ trách VC)
 * - Hoàn thiện SX (production_finish_date) → module=production
 * Chỉ NV chịu trách nhiệm được gán participant → họ mới thấy trên lịch (NV thường).
 */
const { supabase } = require('../config/supabase');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
} = require('./logisticsHandoverSettings');

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
 * @returns {{ ok: boolean, installEventId?: string|null, pickupEventId?: string|null, finishEventId?: string|null, error?: string }}
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

  // Lấy hàng VC phải >= ngày lắp đầu (có thể cùng ngày)
  if (installDateOk && pickupDateOk) {
    const pickupDay = vnDayKey(pickupIso);
    const firstInstallDay = occDates[0] || vnDayKey(resolvedInstallIso);
    if (pickupDay && firstInstallDay && pickupDay < firstInstallDay) {
      return {
        ok: false,
        error: `Ngày lấy hàng VC (${pickupDay}) phải bằng hoặc sau ngày lắp đặt (${firstInstallDay})`,
      };
    }
  }

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
  let productionAssigneeId = null;
  try {
    const { data: proj } = await supabase
      .from('projects')
      .select('logistics_person_id, installer_person_id, production_person_id, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    const logCo = logisticsCompanyId || proj?.logistics_company_id || logisticsCompany;
    logisticsAssigneeId = proj?.logistics_person_id
      || (logCo ? await resolveLogisticsHandoverResponsibleUserId(logCo) : null)
      || null;
    installerAssigneeId = proj?.installer_person_id
      || (logCo ? await resolveLogisticsHandoverInstallerUserId(logCo) : null)
      || logisticsAssigneeId
      || null;
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
    userId,
  ].filter(Boolean).map(String))];

  const productionParticipants = [...new Set([
    productionAssigneeId,
    userId,
  ].filter(Boolean).map(String))];

  const addr = installAddress ? `Địa chỉ: ${installAddress}` : null;
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
        participantUserIds: logisticsParticipants,
        payload: {
          ...baseLogistics,
          status: keepStatus(prev),
          event_type_id: pickupType.id,
          event_type: pickupType.slug || 'pickup',
          assignee_id: logisticsAssigneeId || null,
          title: keepStatus(prev) === 'planned'
            ? `Lấy hàng (dự kiến) — ${projLabel}`
            : `Lấy hàng — ${projLabel}`,
          description: [note, addr].filter(Boolean).join('\n'),
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
        participantUserIds: logisticsParticipants,
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
            note,
            addr,
            multiHint,
            pickupDateOk && vnDayKey(pickupIso) === firstDay && occDates.length <= 1
              ? 'Cùng ngày với lấy hàng VC.'
              : null,
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
        participantUserIds: productionParticipants,
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

    return { ok: true, pickupEventId, installEventId, finishEventId };
  } catch (e) {
    console.warn('[planned-vc-ld-events]', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  upsertPlannedVcLdEvents,
  toProductionFinishIso,
  normalizeOccurrenceYmds,
};
