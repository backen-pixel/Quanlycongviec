const { supabase } = require('../config/supabase');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { validateWorkshopTypeForProductionCompany } = require('./crmVisibleProductionCompanies');

/**
 * @returns {Promise<Array<{ id, lead_type_id, production_company_id, workshop_type_id, is_primary, order_index }>>}
 */
async function listLeadTypeProductionLinks(leadTypeId) {
  const tid = String(leadTypeId || '').trim();
  if (!tid) return [];
  const { data, error } = await supabase
    .from('crm_lead_type_production_links')
    .select('id, lead_type_id, production_company_id, workshop_type_id, is_primary, order_index')
    .eq('lead_type_id', tid)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listLeadTypeProductionLinksForMany(leadTypeIds) {
  const ids = [...new Set((leadTypeIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('crm_lead_type_production_links')
    .select('id, lead_type_id, production_company_id, workshop_type_id, is_primary, order_index')
    .in('lead_type_id', ids)
    .order('order_index', { ascending: true });
  if (error) throw error;
  const map = {};
  for (const id of ids) map[id] = [];
  for (const row of data || []) {
    const k = String(row.lead_type_id);
    if (!map[k]) map[k] = [];
    map[k].push(row);
  }
  return map;
}

/**
 * Thay thế toàn bộ links của 1 lead type.
 * @param {string} leadTypeId
 * @param {Array<{ production_company_id, workshop_type_id, is_primary? }>} links
 */
async function replaceLeadTypeProductionLinks(leadTypeId, links) {
  const tid = String(leadTypeId || '').trim();
  if (!tid) throw new Error('Thiếu lead_type_id');

  const raw = Array.isArray(links) ? links : [];
  const normalized = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] || {};
    const pid = String(item.production_company_id || '').trim();
    const wid = String(item.workshop_type_id || '').trim();
    if (!pid || !wid) {
      throw new Error(`Dòng liên kết #${i + 1}: cần công ty SX và phân loại SX.`);
    }
    const key = `${pid}:${wid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pv = await validateProductionCompanyId(pid);
    if (!pv.ok) throw new Error(pv.error || `Công ty SX không hợp lệ (#${i + 1})`);
    const wv = await validateWorkshopTypeForProductionCompany(wid, pid);
    if (!wv.ok) throw new Error(wv.error || `Phân loại SX không hợp lệ (#${i + 1})`);

    normalized.push({
      lead_type_id: tid,
      production_company_id: pv.company.id,
      workshop_type_id: wv.workshopType.id,
      is_primary: !!item.is_primary,
      order_index: Number.isFinite(Number(item.order_index)) ? Number(item.order_index) : i,
    });
  }

  if (normalized.length) {
    const hasPrimary = normalized.some((r) => r.is_primary);
    if (!hasPrimary) normalized[0].is_primary = true;
    else {
      let seenPrimary = false;
      for (const r of normalized) {
        if (r.is_primary) {
          if (seenPrimary) r.is_primary = false;
          else seenPrimary = true;
        }
      }
    }
  }

  const { error: delErr } = await supabase
    .from('crm_lead_type_production_links')
    .delete()
    .eq('lead_type_id', tid);
  if (delErr) throw delErr;

  if (normalized.length) {
    const { error: insErr } = await supabase
      .from('crm_lead_type_production_links')
      .insert(normalized);
    if (insErr) throw insErr;
  }

  // Sync cột legacy default_* từ link primary (tương thích resolveProductionCompanyForDealStage)
  const primary = normalized.find((r) => r.is_primary) || normalized[0] || null;
  const { error: upErr } = await supabase
    .from('crm_lead_types')
    .update({
      default_production_company_id: primary?.production_company_id || null,
      default_workshop_type_id: primary?.workshop_type_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tid);
  if (upErr) throw upErr;

  return listLeadTypeProductionLinks(tid);
}

module.exports = {
  listLeadTypeProductionLinks,
  listLeadTypeProductionLinksForMany,
  replaceLeadTypeProductionLinks,
};
