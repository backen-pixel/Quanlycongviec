require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE = (process.env.CHECK_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function getToken() {
  if (process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN) {
    return process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN;
  }
  if (process.env.JWT_SECRET) {
    const { supabase } = require('../src/config/supabase');
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, full_name, company_id, department_id')
      .eq('role', 'admin')
      .neq('is_active', false)
      .order('email')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!user) throw new Error('No admin user found');
    return jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      company_id: user.company_id || null,
      department_id: user.department_id || null,
      crm_region_ids: [],
    }, process.env.JWT_SECRET);
  }
  throw new Error('Need JWT_SECRET or UPLOAD_AUTH_TOKEN');
}

async function main() {
  const token = await getToken();
  const { data } = await axios.get(`${BASE}/api/crm/stage-counts`, {
    params: { type: 'deal', phone_filter: 'has_phone' },
    headers: { Authorization: `Bearer ${token}` },
  });

  const keys = data && typeof data === 'object' ? Object.keys(data).sort() : [];
  const hasValues = keys.includes('values');
  const hasWeighted = keys.includes('weighted_values');

  console.log('API_BASE:', BASE);
  console.log('RESPONSE_KEYS:', keys.join(', '));
  console.log('HAS_VALUES:', hasValues);
  console.log('HAS_WEIGHTED_VALUES:', hasWeighted);
  console.log('MIGRATION_APPLIED:', hasValues && hasWeighted ? 'YES' : 'NO');

  if (hasValues && data.values) {
    console.log('VALUES_STAGE_COUNT:', Object.keys(data.values).length);
  } else if (!hasValues) {
    console.log('NOTE: Migration 365 chưa chạy trên DB, hoặc backend chưa deploy code trả values.');
  }
}

main().catch((e) => {
  const msg = e.response?.data?.error || e.message;
  console.error('ERR:', msg);
  process.exit(1);
});
