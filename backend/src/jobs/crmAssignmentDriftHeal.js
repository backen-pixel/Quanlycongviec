/**
 * Sửa lệch dữ liệu giữa crm_assignments và crm_tasks.
 * Chạy mỗi 20 phút. Disable: CRM_ASSIGNMENT_DRIFT_HEAL_DISABLED=1
 *
 * Vì sao cần job này:
 *   `crm_assignments.status` và `crm_tasks.status` là hai bản ghi của cùng một sự thật —
 *   KPI/danh sách giao việc đếm theo assignment, còn chi tiết deal đọc crm_tasks. Đa số
 *   đường ghi đã sync hai chiều, nhưng vẫn còn chỗ ghi crm_tasks mà không sync assignment
 *   (vd routes/events.js khi tự hoàn thành việc qua sự kiện, commercialDocs.js khi tạo báo
 *   giá), cộng với các sync kiểu fire-and-catch-warn không retry. Nên lệch vẫn phát sinh.
 *
 *   Trước đây việc sửa nằm NGAY TRONG GET danh sách giao việc: mỗi request đọc lại bắn
 *   UPDATE nền. Hai vấn đề: (1) request đọc mà sinh ghi, (2) chỉ sửa được đúng những dòng
 *   người dùng tình cờ mở — dòng lệch nhưng không ai xem thì lệch mãi, và đó lại chính là
 *   dòng làm KPI sai. Job này quét TOÀN bảng nên bịt được khoảng trống đó.
 *
 * Logic căn lệch dùng lại đúng hàm mà đường đọc đang dùng (`alignAssignmentStatusFromCrmTask`,
 * `alignAssignmentColumnStatus`) để hai bên không bao giờ hiểu khác nhau.
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const {
  alignAssignmentStatusFromCrmTask,
  alignAssignmentColumnStatus,
  writeAssignmentAlignPatches,
  loadSharedColumns,
} = require('../helpers/crmTaskAssignmentSync');

const RUN_INTERVAL_MS = 20 * 60 * 1000;
/** Quét theo trang để không kéo cả bảng vào RAM. */
const PAGE = 500;
/** Trần an toàn — bảng có ~2.8k dòng, 100 trang là quá thừa cho mọi tình huống thực tế. */
const MAX_PAGES = 100;

/**
 * Chỉ lấy đúng các cột cần để căn lệch — KHÔNG join company/lead/assignee như endpoint
 * danh sách (bản đầy đủ nặng ~1,8KB/dòng, bản này chỉ vài chục byte).
 * `crm_task:crm_tasks(...)` phải cùng tên với cái `alignAssignmentStatusFromCrmTask` đọc.
 */
const DRIFT_SELECT = 'id, status, column_id, completed_at, crm_task_id, crm_task:crm_tasks(id, status, completed_at)';

async function runOnce() {
  const stats = { scanned: 0, statusFixed: 0, columnFixed: 0, pages: 0 };
  try {
    const cols = await loadSharedColumns();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE;
      const { data, error } = await supabase
        .from('crm_assignments')
        .select(DRIFT_SELECT)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) break;
      stats.scanned += rows.length;
      stats.pages += 1;

      // Thứ tự giống đường đọc: lấy status đúng từ crm_task trước, rồi mới căn cột theo
      // status vừa sửa — đảo lại sẽ căn cột theo status cũ.
      const statusPatches = alignAssignmentStatusFromCrmTask(rows);
      const columnPatches = await alignAssignmentColumnStatus(rows, cols);

      if (statusPatches.length) {
        stats.statusFixed += await writeAssignmentAlignPatches(statusPatches);
      }
      if (columnPatches.length) {
        stats.columnFixed += await writeAssignmentAlignPatches(columnPatches);
      }
      if (rows.length < PAGE) break;
    }
    // Im lặng khi không có gì lệch — tránh rác log mỗi 20 phút.
    if (stats.statusFixed || stats.columnFixed) {
      console.log(`[crm-assignment-drift] Đã sửa ${stats.statusFixed} status, ${stats.columnFixed} cột / ${stats.scanned} dòng`);
    }
  } catch (e) {
    console.error('[crm-assignment-drift]', e.message);
  }
  return stats;
}

function start() {
  if (process.env.CRM_ASSIGNMENT_DRIFT_HEAL_DISABLED === '1') {
    console.log('[crm-assignment-drift] Disabled (env)');
    return;
  }
  const tick = () => { void runIfLeader('crm-assignment-drift', () => runOnce(), { ttlSec: 1100 }); };
  setTimeout(tick, 160 * 1000);
  setInterval(tick, RUN_INTERVAL_MS);
  console.log('[crm-assignment-drift] Started — interval 20 phút');
}

module.exports = { start, runOnce };
