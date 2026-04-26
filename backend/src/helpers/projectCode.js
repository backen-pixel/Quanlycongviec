/**
 * Tạo mã TB-YYYY-NNN cho bảng projects: tránh trùng khi 2 request song song
 * (POST auto-create, Thêm đơn đúp) hoặc khi sort theo chuỗi không khớp thứ tự số.
 */

/** Lỗi unique constraint PostgreSQL (vd. projects_code_key). */
function isPostgresUniqueViolation(err) {
  if (!err) return false;
  if (err.code === '23505') return true;
  const m = String(err.message || err.details || '').toLowerCase();
  return m.includes('duplicate key') && (m.includes('code') || m.includes('projects_code'));
}

/**
 * Mã dự án kế tiếp trong năm: max số từ mọi dòng TB-YYYY-NNN, không dùng ORDER BY chuỗi.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function nextTbProjectCode(supabase, year) {
  const y = year ?? new Date().getFullYear();
  const { data: rows, error } = await supabase
    .from('projects')
    .select('code')
    .like('code', `TB-${y}-%`);
  if (error) throw error;
  let maxN = 0;
  for (const r of rows || []) {
    const parts = String(r.code || '').split('-');
    if (parts.length < 3) continue;
    const n = parseInt(parts[2], 10);
    if (Number.isFinite(n)) maxN = Math.max(maxN, n);
  }
  return `TB-${y}-${String(maxN + 1).padStart(3, '0')}`;
}

module.exports = { isPostgresUniqueViolation, nextTbProjectCode };
