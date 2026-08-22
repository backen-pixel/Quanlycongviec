import api from '../lib/api';

/**
 * Danh sách NV cho lịch/đơn nghỉ — dùng /users (company_id OR phòng ban),
 * không dùng /kpi/users (whitelist role KPI + bắt buộc department_id).
 */
export async function fetchLeaveCompanyStaff(companyId, { departmentId = '', regionId = '' } = {}) {
  if (!companyId) return [];
  const params = { company_id: companyId };
  if (departmentId) params.department_id = departmentId;
  const { data } = await api.get('/users', { params });
  let list = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);

  const rid = String(regionId || '').trim();
  if (!rid) return list;

  try {
    // Lấy id NV thuộc khu vực — truyền nhiều role để tránh whitelist KPI hẹp.
    const roles = [
      'sales', 'sales_admin', 'staff', 'customer_care', 'designer', 'manager', 'admin',
      'region_admin', 'production', 'driver', 'installer', 'crm_production_staff',
      'crm_production_admin',
    ].join(',');
    const regRes = await api.get('/kpi/users', {
      params: { company_id: companyId, region_id: rid, roles },
    });
    const allowed = new Set((regRes.data?.users || []).map((u) => String(u.id)));
    list = list.filter((u) => allowed.has(String(u.id)));
  } catch {
    /* giữ list đầy đủ nếu lọc khu vực lỗi */
  }
  return list;
}
