const { supabase } = require('../config/supabase');

function normalizeExternalCompanyName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

async function fetchExternalCompanyByLinked(productionCompanyId, linkedCompanyId) {
  const coId = String(productionCompanyId || '').trim();
  const linkedId = String(linkedCompanyId || '').trim();
  if (!coId || !linkedId) return null;
  const { data, error } = await supabase
    .from('production_external_companies')
    .select('id, name, is_active, linked_company_id')
    .eq('production_company_id', coId)
    .eq('linked_company_id', linkedId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchExternalCompanyByName(productionCompanyId, nameTrim) {
  const coId = String(productionCompanyId || '').trim();
  if (!coId || !nameTrim) return null;
  const { data, error } = await supabase
    .from('production_external_companies')
    .select('id, name, is_active, linked_company_id')
    .eq('production_company_id', coId)
    .ilike('name', nameTrim)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function reactivateExternalCompanyRow(row, patch = {}) {
  if (!row?.id) return row;
  const updates = { ...patch };
  if (row.is_active === false) updates.is_active = true;
  if (!Object.keys(updates).length) return row;
  await supabase.from('production_external_companies').update(updates).eq('id', row.id);
  return { ...row, ...updates };
}

function externalCatalogResult(row, { nameTrim, linkedId, created = false } = {}) {
  if (!row?.id) return null;
  return {
    id: row.id,
    name: row.name || nameTrim,
    linked_company_id: row.linked_company_id || linkedId || null,
    created,
  };
}

/**
 * @param {string} productionCompanyId
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function listProductionExternalCompanies(productionCompanyId) {
  const coId = String(productionCompanyId || '').trim();
  if (!coId) return [];
  const { data, error } = await supabase
    .from('production_external_companies')
    .select('id, name, linked_company_id')
    .eq('production_company_id', coId)
    .eq('is_active', true)
    .order('name');
  if (error) {
    if (error.message?.includes('does not exist') || error.message?.includes('Could not find')) {
      return [];
    }
    throw error;
  }
  return (data || []).filter((r) => r?.id && r?.name);
}

/**
 * Lưu (hoặc kích hoạt lại) công ty bên ngoài — idempotent theo tên.
 * @returns {Promise<{ id: string, name: string, created: boolean } | null>}
 */
async function upsertProductionExternalCompany({ productionCompanyId, name, userId, linkedCompanyId = null }) {
  const coId = String(productionCompanyId || '').trim();
  const nameTrim = normalizeExternalCompanyName(name);
  if (!coId || !nameTrim) return null;
  const linkedId = linkedCompanyId ? String(linkedCompanyId).trim() : null;

  if (linkedId) {
    const byLink = await fetchExternalCompanyByLinked(coId, linkedId);
    if (byLink?.id) {
      await reactivateExternalCompanyRow(byLink, { name: nameTrim });
      return externalCatalogResult(byLink, { nameTrim, linkedId, created: false });
    }
  }

  const byName = await fetchExternalCompanyByName(coId, nameTrim);
  if (byName?.id) {
    if (linkedId) {
      if (byName.linked_company_id && String(byName.linked_company_id) === linkedId) {
        await reactivateExternalCompanyRow(byName);
        return externalCatalogResult(byName, { nameTrim, linkedId, created: false });
      }
      if (!byName.linked_company_id) {
        const canonical = await fetchExternalCompanyByLinked(coId, linkedId);
        if (canonical?.id) {
          await reactivateExternalCompanyRow(canonical);
          return externalCatalogResult(canonical, { nameTrim, linkedId, created: false });
        }
        const { error: linkErr } = await supabase
          .from('production_external_companies')
          .update({ linked_company_id: linkedId, is_active: true })
          .eq('id', byName.id)
          .is('linked_company_id', null);
        if (!linkErr) {
          return externalCatalogResult(
            { ...byName, linked_company_id: linkedId, is_active: true },
            { nameTrim, linkedId, created: false },
          );
        }
        if (linkErr.code === '23505') {
          const afterDup = await fetchExternalCompanyByLinked(coId, linkedId);
          if (afterDup?.id) {
            return externalCatalogResult(afterDup, { nameTrim, linkedId, created: false });
          }
        } else if (!linkErr.message?.includes('does not exist')) {
          throw linkErr;
        }
      }
    }
    await reactivateExternalCompanyRow(byName);
    return externalCatalogResult(byName, { nameTrim, linkedId, created: false });
  }

  const { data, error } = await supabase
    .from('production_external_companies')
    .insert({
      production_company_id: coId,
      name: nameTrim,
      linked_company_id: linkedId,
      created_by: userId || null,
      is_active: true,
    })
    .select('id, name, linked_company_id')
    .single();

  if (error) {
    if (error.message?.includes('does not exist') || error.message?.includes('Could not find')) {
      return null;
    }
    if (error.code === '23505') {
      if (linkedId) {
        const byLink = await fetchExternalCompanyByLinked(coId, linkedId);
        if (byLink?.id) return externalCatalogResult(byLink, { nameTrim, linkedId, created: false });
      }
      const dup = await fetchExternalCompanyByName(coId, nameTrim);
      if (dup?.id) return externalCatalogResult(dup, { nameTrim, linkedId, created: false });
    }
    throw error;
  }

  return externalCatalogResult(data, { nameTrim, linkedId, created: true });
}

module.exports = {
  normalizeExternalCompanyName,
  listProductionExternalCompanies,
  upsertProductionExternalCompany,
};
