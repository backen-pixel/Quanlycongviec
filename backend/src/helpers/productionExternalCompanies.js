const { supabase } = require('../config/supabase');

function normalizeExternalCompanyName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
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
    const { data: byLink } = await supabase
      .from('production_external_companies')
      .select('id, name, is_active, linked_company_id')
      .eq('production_company_id', coId)
      .eq('linked_company_id', linkedId)
      .limit(1)
      .maybeSingle();
    if (byLink?.id) {
      if (byLink.is_active === false) {
        await supabase.from('production_external_companies').update({ is_active: true, name: nameTrim }).eq('id', byLink.id);
      }
      return { id: byLink.id, name: byLink.name || nameTrim, linked_company_id: linkedId, created: false };
    }
  }

  const { data: existing } = await supabase
    .from('production_external_companies')
    .select('id, name, is_active')
    .eq('production_company_id', coId)
    .ilike('name', nameTrim)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (existing.is_active === false) {
      await supabase
        .from('production_external_companies')
        .update({ is_active: true })
        .eq('id', existing.id);
    }
    return { id: existing.id, name: existing.name || nameTrim, created: false };
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
    .select('id, name')
    .single();

  if (error) {
    if (error.message?.includes('does not exist') || error.message?.includes('Could not find')) {
      return null;
    }
    if (error.code === '23505') {
      const { data: dup } = await supabase
        .from('production_external_companies')
        .select('id, name')
        .eq('production_company_id', coId)
        .ilike('name', nameTrim)
        .maybeSingle();
      if (dup?.id) return { id: dup.id, name: dup.name || nameTrim, created: false };
    }
    throw error;
  }

  return { id: data.id, name: data.name, created: true };
}

module.exports = {
  normalizeExternalCompanyName,
  listProductionExternalCompanies,
  upsertProductionExternalCompany,
};
