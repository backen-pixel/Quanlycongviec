/**
 * CRM Customers — CRUD khách hàng, khu vực công ty, tổng quan KH.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const {
  isCrmRegionAdminUser,
  isCrmSystemAdminUser,
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
} = require('../../../helpers/crmAccessRoles');
const { isSystemAdmin } = require('../../../helpers/adminRole');
const { userCanAssignAnyCrmRegion, normalizeRegionIdList } = require('../../../helpers/crmRegionScope');
const { getCompanyRegionsList, invalidateRegions } = require('../../../helpers/crmTaxonomyCache');
const {
  userIsAdmin,
  scopedAdminCompanyId,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
} = require('../shared/requestScope');

const r = Router();

function companyRegionExtraColumnsMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('address') || msg.includes('map_url');
}

function companyRegionGeoColumnsMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('lat') || msg.includes('lng') || msg.includes('geocoded_at');
}

/**
 * Lazy forward-geocode chi nhánh thiếu lat/lng (theo address hoặc map_url).
 * Chạy nền, không chặn response. Đã có cache trong `geocode_cache` ⇒ lần sau load
 * sẽ thấy toạ độ. Giới hạn số lượng/chu kỳ để tôn trọng rate-limit Nominatim.
 */
const regionGeocodeInflight = new Set();
let lastNominatimGeocodeAt = 0;

async function scheduleRegionGeocoding(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const { forwardGeocode } = require('../../../helpers/forwardGeocode');
  const { inVietnam } = require('../../../helpers/geoBounds');
  const candidates = rows.filter((r) => {
    if (!r || regionGeocodeInflight.has(r.id)) return false;
    const hasGeo = Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));
    if (hasGeo) return false;
    const hasAddr = String(r.address || '').trim() || String(r.map_url || '').trim();
    return !!hasAddr;
  }).slice(0, 5);
  if (!candidates.length) return;

  for (const row of candidates) {
    regionGeocodeInflight.add(row.id);
    setImmediate(async () => {
      try {
        const hasGoogleKey = !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY);
        if (!hasGoogleKey) {
          const wait = Math.max(0, 1100 - (Date.now() - lastNominatimGeocodeAt));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          lastNominatimGeocodeAt = Date.now();
        }
        const hit = await forwardGeocode({ address: row.address, map_url: row.map_url });
        if (!hit || !inVietnam(hit.lat, hit.lng)) return;
        const payload = {
          lat: Number(hit.lat.toFixed(6)),
          lng: Number(hit.lng.toFixed(6)),
          geocoded_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from('company_regions')
          .update(payload)
          .eq('id', row.id);
        if (error) {
          if (!companyRegionGeoColumnsMissing(error) && process.env.NODE_ENV !== 'production') {
            console.warn('[regions/geocode] update', row.id, error.message);
          }
          return;
        }
        invalidateRegions();
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[regions/geocode]', row?.id, e?.message || e);
        }
      } finally {
        regionGeocodeInflight.delete(row.id);
      }
    });
  }
}

r.get('/customers', async (req, res) => {
  try {
    const { search, company_id: coQ } = req.query;
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(100);
    const sacCu = scopedAdminCompanyId(req);
    if (sacCu) {
      q = q.eq('company_id', sacCu);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      q = q.eq('company_id', cid);
    } else if (coQ && /^[0-9a-f-]{36}$/i.test(String(coQ))) {
      q = q.eq('company_id', coQ);
    }
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const { data } = await q;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/customers', async (req, res) => {
  try {
    const { full_name, phone, email, address, company, tax_code, source, notes, company_id: bodyCo } = req.body;
    if (!full_name?.trim()) return res.status(400).json({ error: 'Tên khách hàng là bắt buộc' });
    let coId = bodyCo || null;
    const sacCuPost = scopedAdminCompanyId(req);
    if (sacCuPost) {
      coId = sacCuPost;
    } else if (!userIsAdmin(req.user?.role)) {
      const uc = requireUserCompanyId(req, res);
      if (!uc) return;
      coId = uc;
    }
    const { data, error } = await supabase.from('customers')
      .insert({
        full_name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        company: company || null,
        tax_code: tax_code || null,
        source: source || null,
        notes: notes || null,
        company_id: coId || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/customers/:id', async (req, res) => {
  try {
    const update = {};
    ['full_name', 'phone', 'email', 'address', 'company', 'tax_code', 'notes', 'source', 'gender', 'birthday'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ KHU VỰC CRM (company_regions) ═══
r.get('/company-regions', async (req, res) => {
  try {
    const co = req.query.company_id && String(req.query.company_id).trim();
    const div = req.query.division_unit_id && String(req.query.division_unit_id).trim();
    const idsParam = req.query.company_ids && String(req.query.company_ids).trim();
    const coIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const forModuleRaw = req.query.for_module && String(req.query.for_module).trim().toLowerCase();
    if (!co && coIds.length === 0) return res.status(400).json({ error: 'Thiếu company_id' });

    const sac = scopedAdminCompanyId(req);
    const checkOne = (id) => {
      if (sac && String(id) !== String(sac)) return false;
      if (isCrmRegionAdminUser(req.user)) {
        if (String(id) !== String(req.user.company_id)) return false;
      } else if (!userIsAdmin(req.user?.role)) {
        if (String(id) !== String(req.user?.company_id || '')) return false;
      }
      return true;
    };

    let allowedIds = [];
    if (co) {
      if (!checkOne(co)) return res.status(403).json({ error: 'Không có quyền' });
      allowedIds = [co];
    } else {
      allowedIds = coIds.filter(checkOne);
      if (allowedIds.length === 0) return res.json([]);
    }

    // Lọc theo khối được cấu hình cho module (vd. for_module=crm) — chỉ trả khu vực
    // có division_unit_id thuộc các khối CRM. Khu vực chưa gán khối được giữ lại
    // để tương thích dữ liệu cũ.
    let moduleDivIds = null;
    if (forModuleRaw) {
      try {
        const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('../../../helpers/ecosystemModuleScope');
        if (KNOWN_MODULE_KEYS.includes(forModuleRaw)) {
          const restricted = await getRestrictedDivisionIdsForModule(forModuleRaw);
          if (restricted && restricted.size > 0) moduleDivIds = [...restricted];
        }
      } catch { /* ignore */ }
    }

    const data = await getCompanyRegionsList({ allowedIds, div: div || null, moduleDivIds });
    let rows = data;
    if (!userCanAssignAnyCrmRegion(req.user)) {
      const scopedIds = normalizeRegionIdList(req.user?.crm_region_ids);
      if (scopedIds.length) {
        const allowed = new Set(scopedIds.map(String));
        rows = (rows || []).filter((r) => allowed.has(String(r.id)));
      }
    }
    void scheduleRegionGeocoding(rows);
    res.json(rows);
  } catch (e) {
    if (String(e.message || '').includes('company_regions')) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

async function assertDivisionAllowedForCompany(companyId, divisionUnitId) {
  if (!companyId || !divisionUnitId) return { ok: true };
  const sid = String(divisionUnitId);
  const { data: link } = await supabase.from('company_division_units')
    .select('id')
    .eq('company_id', companyId)
    .eq('division_unit_id', divisionUnitId)
    .maybeSingle();
  if (link) return { ok: true };
  const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', companyId).maybeSingle();
  if (co?.division_unit_id && String(co.division_unit_id) === sid) return { ok: true };
  return { ok: false };
}

r.post('/company-regions', async (req, res) => {
  try {
    const { company_id, name, code, division_unit_id, address, map_url } = req.body || {};
    if (!company_id || !String(name || '').trim()) return res.status(400).json({ error: 'company_id và name là bắt buộc' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống thêm khu vực' });
    }
    if (sac && String(company_id) !== String(sac)) return res.status(403).json({ error: 'Không tạo khu vực cho công ty khác' });

    let divId = division_unit_id || null;
    if (!divId) {
      const { data: co } = await supabase.from('companies').select('division_unit_id').eq('id', company_id).maybeSingle();
      divId = co?.division_unit_id || null;
    }
    if (divId) {
      const { ok } = await assertDivisionAllowedForCompany(company_id, divId);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }

    const baseInsert = {
      company_id,
      division_unit_id: divId,
      name: String(name).trim(),
      code: code != null && String(code).trim() ? String(code).trim() : null,
      updated_at: new Date().toISOString(),
    };
    const extInsert = {
      address: address != null && String(address).trim() ? String(address).trim() : null,
      map_url: map_url != null && String(map_url).trim() ? String(map_url).trim() : null,
    };
    const { inVietnam: _inVN } = require('../../../helpers/geoBounds');
    const latRaw = req.body?.lat;
    const lngRaw = req.body?.lng;
    const latNum = latRaw != null && latRaw !== '' ? Number(latRaw) : null;
    const lngNum = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null;
    const geoInsert = {};
    if (_inVN(latNum, lngNum)) {
      geoInsert.lat = Number(latNum.toFixed(6));
      geoInsert.lng = Number(lngNum.toFixed(6));
      geoInsert.geocoded_at = new Date().toISOString();
    } else if (latRaw != null && latRaw !== '' && lngRaw != null && lngRaw !== '') {
      return res.status(400).json({ error: 'Toạ độ chi nhánh phải nằm trong phạm vi Việt Nam' });
    }
    let { data, error } = await supabase
      .from('company_regions')
      .insert({ ...baseInsert, ...extInsert, ...geoInsert })
      .select()
      .single();
    if (error && companyRegionGeoColumnsMissing(error)) {
      ({ data, error } = await supabase
        .from('company_regions')
        .insert({ ...baseInsert, ...extInsert })
        .select()
        .single());
    }
    if (error && companyRegionExtraColumnsMissing(error)) {
      ({ data, error } = await supabase
        .from('company_regions')
        .insert(baseInsert)
        .select()
        .single());
    }
    if (error) throw error;
    invalidateRegions();
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/company-regions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: row } = await supabase.from('company_regions').select('id, company_id, division_unit_id').eq('id', id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống sửa khu vực' });
    }
    if (sac && String(row.company_id) !== String(sac)) return res.status(403).json({ error: 'Không có quyền' });
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'code', 'order_index', 'is_active', 'division_unit_id', 'address', 'map_url'].forEach((f) => {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    });
    if (req.body.lat !== undefined || req.body.lng !== undefined) {
      const { inVietnam: _inVN } = require('../../../helpers/geoBounds');
      const latNum = req.body.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null;
      const lngNum = req.body.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null;
      if (_inVN(latNum, lngNum)) {
        patch.lat = Number(latNum.toFixed(6));
        patch.lng = Number(lngNum.toFixed(6));
        patch.geocoded_at = new Date().toISOString();
      } else if (req.body.lat === null || req.body.lng === null) {
        patch.lat = null;
        patch.lng = null;
      } else if (req.body.lat != null && req.body.lat !== '' && req.body.lng != null && req.body.lng !== '') {
        return res.status(400).json({ error: 'Toạ độ chi nhánh phải nằm trong phạm vi Việt Nam' });
      }
    }
    if (patch.address !== undefined || patch.map_url !== undefined) {
      patch.geocoded_at = null;
      if (patch.lat === undefined) patch.lat = null;
      if (patch.lng === undefined) patch.lng = null;
    }
    if (patch.division_unit_id) {
      const { ok } = await assertDivisionAllowedForCompany(row.company_id, patch.division_unit_id);
      if (!ok) return res.status(400).json({ error: 'Khối không thuộc công ty này' });
    }
    let { data, error } = await supabase.from('company_regions').update(patch).eq('id', id).select().single();
    if (error && companyRegionGeoColumnsMissing(error)) {
      const fallback = { ...patch };
      delete fallback.lat;
      delete fallback.lng;
      delete fallback.geocoded_at;
      ({ data, error } = await supabase.from('company_regions').update(fallback).eq('id', id).select().single());
    }
    if (error && companyRegionExtraColumnsMissing(error)) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.address;
      delete fallbackPatch.map_url;
      delete fallbackPatch.lat;
      delete fallbackPatch.lng;
      delete fallbackPatch.geocoded_at;
      ({ data, error } = await supabase.from('company_regions').update(fallbackPatch).eq('id', id).select().single());
    }
    if (error) throw error;
    invalidateRegions();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /crm/company-regions/:id/regeocode
 *   Force re-geocode (xóa cache + reset lat/lng, gọi forwardGeocode đồng bộ).
 *   Trả về { id, lat, lng, source } hoặc { ok: false, reason }.
 */
r.post('/company-regions/:id/regeocode', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: row } = await supabase
      .from('company_regions')
      .select('id, company_id, address, map_url, name')
      .eq('id', id)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
    const sac = scopedAdminCompanyId(req);
    if (!isCrmSystemAdminUser(req.user) && !sac) {
      return res.status(403).json({ error: 'Chỉ admin công ty hoặc admin hệ thống' });
    }
    if (sac && String(row.company_id) !== String(sac)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const { forwardGeocode } = require('../../../helpers/forwardGeocode');

    if (req.body?.clear_cache) {
      const norm = String(row.address || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 240);
      if (norm) {
        try { await supabase.from('geocode_cache').delete().eq('key', `fwd:${norm}`); } catch { /* ignore */ }
      }
    }

    const hit = await forwardGeocode({ address: row.address, map_url: row.map_url });
    if (!hit) {
      try {
        await supabase
          .from('company_regions')
          .update({ lat: null, lng: null, geocoded_at: null })
          .eq('id', id);
      } catch { /* ignore */ }
      invalidateRegions();
      return res.json({ ok: false, reason: 'no_match', address: row.address, map_url: row.map_url });
    }

    const payload = {
      lat: Number(hit.lat.toFixed(6)),
      lng: Number(hit.lng.toFixed(6)),
      geocoded_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('company_regions').update(payload).eq('id', id);
    if (error) throw error;
    invalidateRegions();
    res.json({ ok: true, id, ...payload, source: hit.source, formatted_address: hit.address });
  } catch (e) {
    console.error('POST /crm/company-regions/:id/regeocode:', e);
    res.status(500).json({ error: e.message });
  }
});

function crmLeadRowVisibleToRequestUser(row, userId, role) {
  if (!userId) return true;
  const t = row?.type || 'lead';
  if (t === 'deal') {
    return userSeesAllCrmDeals(role) || String(row.assigned_to || '') === String(userId);
  }
  return (
    userSeesAllCrmLeads(role) ||
    String(row.assigned_to || '') === String(userId) ||
    String(row.lead_owner_id || '') === String(userId)
  );
}

const CUSTOMERS_OVERVIEW_NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';
const CUSTOMERS_IN_CHUNK = 80;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Supabase/PostgREST giới hạn số phần tử trong .in() — tách batch hoặc dùng .or(). */
function applyCustomerIdInFilter(q, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return q.in('id', [CUSTOMERS_OVERVIEW_NO_MATCH_ID]);
  if (list.length <= CUSTOMERS_IN_CHUNK) return q.in('id', list);
  const orParts = chunkArray(list, CUSTOMERS_IN_CHUNK).map(
    (ch) => `id.in.(${ch.join(',')})`,
  );
  return q.or(orParts.join(','));
}

function applyCustomersOverviewSearch(q, search) {
  const s = String(search || '').trim();
  if (!s) return q;
  const safe = s.replace(/[%_,().]/g, ' ').trim();
  if (!safe) return q;
  return q.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%`);
}

async function fetchActivityCustomerIds(effectiveCompanyId, activity) {
  if (activity === 'active') {
    let lq = supabase.from('crm_leads').select('customer_id');
    if (effectiveCompanyId) lq = lq.eq('company_id', effectiveCompanyId);
    let oq = supabase.from('orders').select('customer_id');
    if (effectiveCompanyId) oq = oq.eq('company_id', effectiveCompanyId);
    const [{ data: lr }, { data: or }] = await Promise.all([lq, oq]);
    const ids = [...new Set([...(lr || []), ...(or || [])].map((r) => r.customer_id).filter(Boolean))];
    return ids.length ? ids : [CUSTOMERS_OVERVIEW_NO_MATCH_ID];
  }
  if (activity === 'debt') {
    let iq = supabase.from('invoices').select('customer_id, total, paid_amount');
    if (effectiveCompanyId) iq = iq.eq('company_id', effectiveCompanyId);
    const { data: invs } = await iq;
    const ids = [
      ...new Set(
        (invs || [])
          .filter((i) => (i.total || 0) - (i.paid_amount || 0) > 0)
          .map((i) => i.customer_id)
          .filter(Boolean),
      ),
    ];
    return ids.length ? ids : [CUSTOMERS_OVERVIEW_NO_MATCH_ID];
  }
  return null;
}

async function fetchScopedCrmBundles(effectiveCompanyId, uid, role, customerIds = null) {
  let leadsQ = supabase
    .from('crm_leads')
    .select(
      'id, customer_id, company_id, source_id, title, estimated_value, stage_id, code, created_at, type, assigned_to, lead_owner_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, is_won), source:crm_sources(id, name, icon)',
    );
  if (effectiveCompanyId) leadsQ = leadsQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) leadsQ = leadsQ.in('customer_id', customerIds);

  let quotesQ = supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at, company_id');
  if (effectiveCompanyId) quotesQ = quotesQ.eq('company_id', effectiveCompanyId);
  if (!userIsAdmin(role) && uid) quotesQ = quotesQ.eq('created_by', uid);
  if (customerIds?.length) quotesQ = quotesQ.in('customer_id', customerIds);

  let ordersQ = supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at, company_id');
  if (effectiveCompanyId) ordersQ = ordersQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) ordersQ = ordersQ.in('customer_id', customerIds);

  let invoicesQ = supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at, company_id');
  if (effectiveCompanyId) invoicesQ = invoicesQ.eq('company_id', effectiveCompanyId);
  if (customerIds?.length) invoicesQ = invoicesQ.in('customer_id', customerIds);

  const [{ data: leadsRaw, error: leadsErr }, { data: quotes }, { data: orders }, { data: invoices }] =
    await Promise.all([leadsQ, quotesQ, ordersQ, invoicesQ]);
  if (leadsErr) throw leadsErr;

  const leads = (leadsRaw || []).filter((l) => crmLeadRowVisibleToRequestUser(l, uid, role));
  return { leads, quotes: quotes || [], orders: orders || [], invoices: invoices || [] };
}

function mapCustomerOverviewRow(c, leads, quotes, orders, invoices, includeNested = true) {
  const cLeads = (leads || []).filter((l) => l.customer_id === c.id);
  const cQuotes = (quotes || []).filter((q) => q.customer_id === c.id);
  const cOrders = (orders || []).filter((o) => o.customer_id === c.id);
  const cInvoices = (invoices || []).filter((i) => i.customer_id === c.id);
  const totalOrders = cOrders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const totalDebt = cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
  const row = {
    ...c,
    stats: {
      lead_count: cLeads.length,
      won_count: cLeads.filter((l) => l.stage?.is_won).length,
      quote_count: cQuotes.length,
      order_count: cOrders.length,
      invoice_count: cInvoices.length,
      total_orders: totalOrders,
      total_paid: totalPaid,
      total_debt: totalDebt,
      lead_value: cLeads.reduce((s, l) => s + (l.estimated_value || 0), 0),
    },
  };
  if (includeNested) {
    row.leads = cLeads;
    row.quotes = cQuotes;
    row.orders = cOrders;
    row.invoices = cInvoices;
  }
  return row;
}

function computeCustomersOverviewSummary(customerRows, leads, orders, invoices) {
  const idSet = new Set((customerRows || []).map((c) => c.id));
  let leadsCount = 0;
  let dealsCount = 0;
  let won = 0;
  let revenue = 0;
  let debt = 0;
  let active = 0;

  for (const c of customerRows || []) {
    const cLeads = (leads || []).filter((l) => l.customer_id === c.id);
    const cOrders = (orders || []).filter((o) => o.customer_id === c.id);
    const cInvoices = (invoices || []).filter((i) => i.customer_id === c.id);
    if (cLeads.length > 0 || cOrders.length > 0) active += 1;
    revenue += cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
    debt += cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
  }

  for (const l of leads || []) {
    if (!idSet.has(l.customer_id)) continue;
    if (l.type === 'deal') dealsCount += 1;
    else leadsCount += 1;
    if (l.stage?.is_won) won += 1;
  }

  return {
    total: customerRows?.length || 0,
    active,
    leads: leadsCount,
    deals: dealsCount,
    won,
    revenue,
    debt,
  };
}

async function buildCustomersOverviewSummary(effectiveCompanyId, uid, role, search, activity) {
  let custQ = supabase.from('customers').select('id');
  if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
  custQ = applyCustomersOverviewSearch(custQ, search);
  if (activity && activity !== 'all') {
    const activityIds = await fetchActivityCustomerIds(effectiveCompanyId, activity);
    if (activityIds) custQ = applyCustomerIdInFilter(custQ, activityIds);
  }
  const { data: custRows, error } = await custQ;
  if (error) throw error;
  const idSet = new Set((custRows || []).map((c) => c.id));
  if (!idSet.size) {
    return { total: 0, active: 0, leads: 0, deals: 0, won: 0, revenue: 0, debt: 0 };
  }
  // Không truyền hàng nghìn id vào .in() — lấy theo phạm vi công ty rồi lọc trong bộ nhớ.
  const { leads, orders, invoices } = await fetchScopedCrmBundles(effectiveCompanyId, uid, role, null);
  const filteredLeads = (leads || []).filter((l) => idSet.has(l.customer_id));
  const filteredOrders = (orders || []).filter((o) => idSet.has(o.customer_id));
  const filteredInvoices = (invoices || []).filter((i) => idSet.has(i.customer_id));
  return computeCustomersOverviewSummary(custRows, filteredLeads, filteredOrders, filteredInvoices);
}

r.get('/customers-overview', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }

    const uid = req.user?.userId;
    const role = req.user?.role;
    const paginated = req.query.page != null || req.query.limit != null;

    if (!paginated) {
      let custQ = supabase.from('customers').select('*').order('full_name');
      if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
      const { data: customers, error: custErr } = await custQ;
      if (custErr) throw custErr;

      const { leads, quotes, orders, invoices } = await fetchScopedCrmBundles(effectiveCompanyId, uid, role);
      const result = (customers || []).map((c) =>
        mapCustomerOverviewRow(c, leads, quotes, orders, invoices, true),
      );
      res.json(result);
      return;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
    const search = String(req.query.search || '').trim();
    const activity = ['active', 'debt'].includes(String(req.query.activity || ''))
      ? String(req.query.activity)
      : 'all';

    let custQ = supabase.from('customers').select('*', { count: 'exact' });
    if (effectiveCompanyId) custQ = custQ.eq('company_id', effectiveCompanyId);
    custQ = applyCustomersOverviewSearch(custQ, search);
    if (activity !== 'all') {
      const activityIds = await fetchActivityCustomerIds(effectiveCompanyId, activity);
      if (activityIds) custQ = applyCustomerIdInFilter(custQ, activityIds);
    }
    custQ = custQ.order('created_at', { ascending: sort === 'oldest' });
    const from = (page - 1) * limit;
    custQ = custQ.range(from, from + limit - 1);

    const { data: customers, count, error: custErr } = await custQ;
    if (custErr) throw custErr;

    const pageIds = (customers || []).map((c) => c.id);
    const { leads, quotes, orders, invoices } = pageIds.length
      ? await fetchScopedCrmBundles(effectiveCompanyId, uid, role, pageIds)
      : { leads: [], quotes: [], orders: [], invoices: [] };

    const items = (customers || []).map((c) =>
      mapCustomerOverviewRow(c, leads, quotes, orders, invoices, false),
    );
    const total = count || 0;
    let summary;
    if (page === 1) {
      try {
        summary = await buildCustomersOverviewSummary(effectiveCompanyId, uid, role, search, activity);
      } catch (summaryErr) {
        console.error('[customers-overview] summary failed:', summaryErr?.message || summaryErr);
        summary = {
          total,
          active: 0,
          leads: 0,
          deals: 0,
          won: 0,
          revenue: 0,
          debt: 0,
        };
      }
    }

    res.json({
      customers: items,
      total,
      page,
      limit,
      hasMore: from + items.length < total,
      summary,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/customers-overview/:id', async (req, res) => {
  try {
    let effectiveCompanyId = null;
    if (!isSystemAdmin(req.user)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    } else {
      const q = req.query.company_id;
      effectiveCompanyId = q && String(q).trim() ? String(q).trim() : null;
    }

    const { data: customer } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (!customer) return res.status(404).json({ error: 'KH không tồn tại' });
    if (effectiveCompanyId && customer.company_id && String(customer.company_id) !== String(effectiveCompanyId)) {
      return res.status(403).json({ error: 'Không có quyền xem khách hàng này' });
    }

    let leadsQ = supabase
      .from('crm_leads')
      .select(
        'id, customer_id, company_id, source_id, title, code, estimated_value, stage_id, created_at, type, assigned_to, lead_owner_id, stage:crm_pipeline_stages!crm_leads_stage_id_fkey(name, icon, color, is_won), source:crm_sources(id, name, icon)',
      )
      .eq('customer_id', req.params.id)
      .order('created_at', { ascending: false });
    if (effectiveCompanyId) leadsQ = leadsQ.eq('company_id', effectiveCompanyId);
    const { data: leadsRaw } = await leadsQ;
    const uid = req.user?.userId;
    const role = req.user?.role;
    const leads = (leadsRaw || []).filter((l) => crmLeadRowVisibleToRequestUser(l, uid, role));
    let quotesQ = supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) quotesQ = quotesQ.eq('company_id', effectiveCompanyId);
    if (!userIsAdmin(req.user?.role) && req.user?.userId) quotesQ = quotesQ.eq('created_by', req.user.userId);
    let ordersQ = supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) ordersQ = ordersQ.eq('company_id', effectiveCompanyId);
    let invoicesQ = supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    if (effectiveCompanyId) invoicesQ = invoicesQ.eq('company_id', effectiveCompanyId);
    const [{ data: quotes }, { data: orders }, { data: invoices }] = await Promise.all([quotesQ, ordersQ, invoicesQ]);
    res.json({ ...customer, leads: leads || [], quotes: quotes || [], orders: orders || [], invoices: invoices || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
