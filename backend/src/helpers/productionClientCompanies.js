const { supabase } = require('../config/supabase');
const { isMetallaOrHucabiCompanyId, resolveVptCompanyId } = require('./dealParticipantProduction');
const { listProductionExternalCompanies } = require('./productionExternalCompanies');

const VPT_NAME_PATTERN = /vạn phú|van phu|\bvpt\b/i;

function externalNameLooksLikeVpt(name) {
  return VPT_NAME_PATTERN.test(String(name || '').trim());
}

/** Tên text «VPT» / Vạn Phú → id công ty CRM tương ứng. */
async function resolveCrmCompanyIdFromExternalName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (externalNameLooksLikeVpt(trimmed)) {
    return resolveVptCompanyId();
  }
  const { data: hit } = await supabase
    .from('companies')
    .select('id')
    .eq('is_active', true)
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle();
  if (hit?.id) return hit.id;
  const { data: hitSn } = await supabase
    .from('companies')
    .select('id')
    .eq('is_active', true)
    .ilike('short_name', trimmed)
    .limit(1)
    .maybeSingle();
  return hitSn?.id || null;
}

/** Gán linked_company_id cho dòng danh mục ngoài trùng tên VPT (idempotent). */
async function syncExternalCatalogVptLinks(workshopCompanyId) {
  const coId = String(workshopCompanyId || '').trim();
  if (!coId) return;
  const vptId = await resolveVptCompanyId();
  if (!vptId) return;

  const { data: rows } = await supabase
    .from('production_external_companies')
    .select('id, name, linked_company_id')
    .eq('production_company_id', coId)
    .eq('is_active', true)
    .is('linked_company_id', null);

  for (const row of rows || []) {
    if (!externalNameLooksLikeVpt(row.name)) continue;
    const { error } = await supabase
      .from('production_external_companies')
      .update({ linked_company_id: vptId })
      .eq('id', row.id)
      .is('linked_company_id', null);
    if (error?.code === '23505') {
      // Đã có dòng khác cùng xưởng trỏ VPT — bỏ qua
      continue;
    }
  }

  await ensureWorkshopClientCompanyLink(coId, vptId);
}

/**
 * Danh mục «Công ty chủ deal (CRM)» — gộp:
 * - production_workshop_client_companies
 * - production_external_companies (có/không linked_company_id)
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   client_company_id: string | null,
 *   external_catalog_id: string | null,
 *   name: string,
 *   short_name: string | null,
 *   source: string,
 * }>>}
 */
async function listProductionClientCompanies(workshopCompanyId) {
  const coId = String(workshopCompanyId || '').trim();
  if (!coId) return [];

  if (await isMetallaOrHucabiCompanyId(coId)) {
    await syncExternalCatalogVptLinks(coId);
  }

  const byKey = new Map();
  const crmIdsNeeded = new Set();

  const addCrmId = (clientId, meta = {}) => {
    const cid = String(clientId || '').trim();
    if (!cid || cid === coId) return;
    crmIdsNeeded.add(cid);
    const key = `crm:${cid}`;
    const prev = byKey.get(key);
    byKey.set(key, {
      id: cid,
      client_company_id: cid,
      external_catalog_id: meta.external_catalog_id || prev?.external_catalog_id || null,
      name: meta.name || prev?.name || '',
      short_name: meta.short_name ?? prev?.short_name ?? null,
      source: meta.source || prev?.source || 'crm',
    });
  };

  const addExternalOnly = (extId, name) => {
    const key = `ext:${extId}`;
    if (byKey.has(key)) return;
    byKey.set(key, {
      id: `ext:${extId}`,
      client_company_id: null,
      external_catalog_id: extId,
      name,
      short_name: null,
      source: 'external',
    });
  };

  const { data: links, error: linkErr } = await supabase
    .from('production_workshop_client_companies')
    .select('client_company_id')
    .eq('production_company_id', coId)
    .eq('is_active', true);
  if (!linkErr) {
    for (const row of links || []) {
      if (row?.client_company_id) addCrmId(row.client_company_id, { source: 'workshop' });
    }
  } else if (!linkErr?.message?.includes('does not exist')) {
    console.warn('[productionClientCompanies] links:', linkErr.message);
  }

  let extRows = [];
  try {
    extRows = await listProductionExternalCompanies(coId);
  } catch (e) {
    console.warn('[productionClientCompanies] external list:', e.message);
  }

  for (const ext of extRows) {
    if (!ext?.id || !ext?.name) continue;
    let clientId = ext.linked_company_id ? String(ext.linked_company_id) : null;
    if (!clientId) {
      clientId = await resolveCrmCompanyIdFromExternalName(ext.name);
      if (clientId) {
        try {
          await supabase
            .from('production_external_companies')
            .update({ linked_company_id: clientId })
            .eq('id', ext.id)
            .is('linked_company_id', null);
        } catch { /* ignore unique conflict */ }
      }
    }
    if (clientId) {
      addCrmId(clientId, {
        external_catalog_id: ext.id,
        source: 'linked_external',
        name: externalNameLooksLikeVpt(ext.name) ? '' : ext.name,
      });
    } else {
      addExternalOnly(ext.id, ext.name);
    }
  }

  if (crmIdsNeeded.size) {
    const { data: cos } = await supabase
      .from('companies')
      .select('id, name, short_name, is_active')
      .in('id', [...crmIdsNeeded])
      .eq('is_active', true);
    for (const c of cos || []) {
      const key = `crm:${c.id}`;
      const row = byKey.get(key);
      if (!row) continue;
      row.name = c.name;
      row.short_name = c.short_name || null;
    }
  }

  const items = [...byKey.values()]
    .filter((x) => x.name || x.client_company_id)
    .sort((a, b) => String(a.short_name || a.name).localeCompare(String(b.short_name || b.name), 'vi'));

  if (items.length) return items;

  if (await isMetallaOrHucabiCompanyId(coId)) {
    const { data: allCos, error: allErr } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .eq('is_active', true)
      .neq('id', coId)
      .order('name');
    if (!allErr) {
      return (allCos || []).map((c) => ({
        id: c.id,
        client_company_id: c.id,
        external_catalog_id: null,
        name: c.name,
        short_name: c.short_name || null,
        source: 'fallback',
      }));
    }
  }

  return [];
}

async function ensureWorkshopClientCompanyLink(workshopCompanyId, clientCompanyId) {
  const wId = String(workshopCompanyId || '').trim();
  const cId = String(clientCompanyId || '').trim();
  if (!wId || !cId || wId === cId) return null;
  const { data, error } = await supabase
    .from('production_workshop_client_companies')
    .upsert(
      { production_company_id: wId, client_company_id: cId, is_active: true },
      { onConflict: 'production_company_id,client_company_id' },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.message?.includes('does not exist')) return null;
    throw error;
  }
  return data?.id || null;
}

/** Resolve pick từ modal: uuid CRM hoặc `ext:<catalog_id>`. */
async function resolveClientCompanyPick(workshopCompanyId, pickValue) {
  const raw = String(pickValue || '').trim();
  if (!raw) return { clientCompanyId: null, externalCatalogId: null, externalName: null };

  if (raw.startsWith('ext:')) {
    const catalogId = raw.slice(4);
    const { data: ext } = await supabase
      .from('production_external_companies')
      .select('id, name, linked_company_id')
      .eq('id', catalogId)
      .eq('production_company_id', String(workshopCompanyId || '').trim())
      .maybeSingle();
    if (!ext) return { clientCompanyId: null, externalCatalogId: catalogId, externalName: null };
    if (ext.linked_company_id) {
      const { data: co } = await supabase
        .from('companies')
        .select('id, name, short_name')
        .eq('id', ext.linked_company_id)
        .maybeSingle();
      return {
        clientCompanyId: ext.linked_company_id,
        externalCatalogId: ext.id,
        externalName: co?.short_name || co?.name || ext.name,
      };
    }
    const resolved = await resolveCrmCompanyIdFromExternalName(ext.name);
    if (resolved) {
      const { data: co } = await supabase
        .from('companies')
        .select('id, name, short_name')
        .eq('id', resolved)
        .maybeSingle();
      return {
        clientCompanyId: resolved,
        externalCatalogId: ext.id,
        externalName: co?.short_name || co?.name || ext.name,
      };
    }
    return { clientCompanyId: null, externalCatalogId: ext.id, externalName: ext.name };
  }

  const { data: co } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('id', raw)
    .maybeSingle();
  return {
    clientCompanyId: raw,
    externalCatalogId: null,
    externalName: co?.short_name || co?.name || null,
  };
}

module.exports = {
  listProductionClientCompanies,
  ensureWorkshopClientCompanyLink,
  resolveClientCompanyPick,
  resolveCrmCompanyIdFromExternalName,
  syncExternalCatalogVptLinks,
  externalNameLooksLikeVpt,
};
