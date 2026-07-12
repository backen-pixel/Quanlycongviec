const { supabase } = require('../config/supabase');

function normalizeReferrerName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {string} companyId
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function listCrmReferrers(companyId) {
  const coId = String(companyId || '').trim();
  if (!coId) return [];
  const { data, error } = await supabase
    .from('crm_referrers')
    .select('id, name')
    .eq('company_id', coId)
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
 * @returns {Promise<{ id: string, name: string, created: boolean } | null>}
 */
async function upsertCrmReferrer({ companyId, name, userId }) {
  const coId = String(companyId || '').trim();
  const nameTrim = normalizeReferrerName(name);
  if (!coId || !nameTrim) return null;

  const { data: existing } = await supabase
    .from('crm_referrers')
    .select('id, name, is_active')
    .eq('company_id', coId)
    .ilike('name', nameTrim)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (existing.is_active === false) {
      await supabase.from('crm_referrers').update({ is_active: true }).eq('id', existing.id);
    }
    return { id: existing.id, name: existing.name || nameTrim, created: false };
  }

  const { data, error } = await supabase
    .from('crm_referrers')
    .insert({
      company_id: coId,
      name: nameTrim,
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
        .from('crm_referrers')
        .select('id, name')
        .eq('company_id', coId)
        .ilike('name', nameTrim)
        .maybeSingle();
      if (dup?.id) return { id: dup.id, name: dup.name || nameTrim, created: false };
    }
    throw error;
  }

  return { id: data.id, name: data.name, created: true };
}

/**
 * Chuẩn hoá referrer_name trên body lead/deal; tự upsert danh mục.
 * @returns {Promise<string|null>}
 */
async function resolveReferrerNameForLead({ companyId, referrerName, userId }) {
  const nameTrim = normalizeReferrerName(referrerName);
  if (!nameTrim) return null;
  const coId = String(companyId || '').trim();
  if (!coId) return nameTrim;
  await upsertCrmReferrer({ companyId: coId, name: nameTrim, userId });
  return nameTrim;
}

module.exports = {
  normalizeReferrerName,
  listCrmReferrers,
  upsertCrmReferrer,
  resolveReferrerNameForLead,
};
