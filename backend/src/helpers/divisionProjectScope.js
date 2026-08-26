/**
 * Tập dự án thuộc một Khối (division) — HỢP của cả 3 cách liên kết đang tồn tại trong DB.
 *
 * BỐI CẢNH: routes/divisions.js và routes/dashboardDivisions.js trước đây CHỈ dùng đường
 *   workflow_flow_steps.division_unit_id → projects.flow_id
 * Nhưng đối chiếu DB: CẢ 23 dòng `workflow_flow_steps` đều có `division_unit_id = NULL`
 * → không khớp gì → mọi endbpoint theo Khối trả về 0 / rỗng.
 *
 * Hai đường CÓ dữ liệu thật (và là cách mà routes/management.js, routes/projects.js,
 * migration 564 đang dùng):
 *   - companies.division_unit_id → projects.company_id   (Khối SX 484 dự án · KD 85 · 26)
 *   - project_company_assignments.division_unit_id       (603 dòng, đều gắn division)
 *
 * Lấy HỢP nên chỉ có thể THÊM dự án, không làm mất thứ gì đang chạy. Nếu sau này ai đó
 * điền `workflow_flow_steps.division_unit_id` thì đường đó tự có hiệu lực trở lại.
 */

const { supabase } = require('../config/supabase');
const { fetchAllByIds } = require('./supabaseFetchAll');

/**
 * @param {string} divisionId
 * @returns {Promise<string[]>} id dự án (đã loại trùng)
 */
async function resolveDivisionProjectIds(divisionId) {
  if (!divisionId) return [];
  const ids = new Set();

  const [flowSteps, divCompanies, assignments] = await Promise.all([
    supabase.from('workflow_flow_steps').select('flow_id').eq('division_unit_id', divisionId)
      .then((r) => r.data || []).catch(() => []),
    supabase.from('companies').select('id').eq('division_unit_id', divisionId)
      .then((r) => r.data || []).catch(() => []),
    supabase.from('project_company_assignments').select('project_id').eq('division_unit_id', divisionId)
      .then((r) => r.data || []).catch(() => []),
  ]);

  for (const a of assignments) if (a.project_id) ids.add(String(a.project_id));

  const flowIds = [...new Set(flowSteps.map((s) => s.flow_id).filter(Boolean))];
  const companyIds = [...new Set(divCompanies.map((c) => c.id).filter(Boolean))];

  const lookups = [];
  if (flowIds.length) {
    lookups.push(fetchAllByIds({ table: 'projects', columns: 'id', key: 'flow_id', ids: flowIds }));
  }
  if (companyIds.length) {
    lookups.push(fetchAllByIds({ table: 'projects', columns: 'id', key: 'company_id', ids: companyIds }));
  }
  for (const rows of await Promise.all(lookups)) {
    for (const p of rows) if (p.id) ids.add(String(p.id));
  }

  return [...ids];
}

/**
 * Trạng thái THẬT trong DB (đã đối chiếu) — code cũ lọc theo giá trị không tồn tại
 * ('planning', 'in-progress', 'done' cho projects) nên các ô đếm luôn ra 0.
 *   projects.status : producing · consulting · shipping · installing · contract_signed
 *   tasks.status    : todo · done · pending · in_progress   (gạch DƯỚI, không phải 'in-progress')
 */
const ACTIVE_PROJECT_STATUSES = [
  'consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'shipping', 'installing',
];
const DONE_PROJECT_STATUSES = ['completed'];
const NOT_STARTED_TASK_STATUSES = ['pending', 'todo'];

module.exports = {
  resolveDivisionProjectIds,
  ACTIVE_PROJECT_STATUSES,
  DONE_PROJECT_STATUSES,
  NOT_STARTED_TASK_STATUSES,
};
