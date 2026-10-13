/**
 * Giữ hai sổ nhiệm vụ sản xuất khớp nhau khi người dùng tick xong / mở lại.
 *
 * VẤN ĐỀ
 * Cùng một bộ việc của một dự án được chép thành HAI bản, không có ràng buộc đồng bộ nào:
 *   - «theo deal»  : `crm_tasks` có `stage_slug` bắt đầu `sx_`, bám `lead_id`
 *   - «theo dự án» : `tasks` (không phải việc VC/LĐ), bám `project_id`
 * 93% dự án có cả hai. Đo thực tế: 10.554 cặp trùng tên, **1.934 cặp lệch trạng thái
 * (18,3%)** — lệch gần như cân hai chiều, nghĩa là người ta tick ở cả hai màn, mỗi lần
 * một màn. Hậu quả: báo cáo tiến độ và công nợ mâu thuẫn, và việc chặn kéo cột còn mở ở
 * sổ người dùng không nhìn thấy.
 *
 * CÁCH LÀM
 * Đóng/mở một bên thì soi sang bên kia theo (cùng dự án + trùng TÊN đã chuẩn hoá) rồi
 * chỉnh theo. Ghép theo tên vì hai bảng không có khoá nối nào khác — bộ mẫu sinh ra
 * chúng độc lập.
 *
 * GIỚI HẠN PHẢI BIẾT
 * Tên lệch là trượt. Dữ liệu đang có «Tiếp nhập thông tin dự án» và «Tiếp nhận thông tin
 * dự án» sống song song (lỗi chính tả trong bộ mẫu) — hai cái đó KHÔNG soi được sang nhau.
 * Vì vậy mỗi lần không tìm thấy bản sao đều ghi log, không im lặng.
 *
 * KHÔNG kích dây chuyền: bản sao được ghi thẳng xuống bảng, không đi qua route, nên không
 * đẩy thẻ sang cột kế và không ghi bình luận lần hai. Việc người dùng vừa bấm mới là việc
 * sinh ra các hệ quả đó; bản sao chỉ để hai sổ bằng nhau.
 */

const { supabase } = require('../config/supabase');
const { isLogisticsWorkshopTask } = require('./logisticsTaskSplit');

const CRM_XONG = 'completed';
const CRM_MO = 'pending';
const TASK_XONG = 'done';
const TASK_MO = 'pending';
const CRM_TERMINAL = new Set(['completed', 'cancelled']);
const TASK_TERMINAL = new Set(['done', 'cancelled', 'canceled']);

/** Bỏ dấu, gộp khoảng trắng, thường hoá — để «Đặt Đá» khớp «đặt đá». */
function chuanTen(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function laViecSxCuaSoDuAn(row) {
  if (!row) return false;
  return !isLogisticsWorkshopTask(row);
}

/** project_id của một `crm_tasks` — đi qua lead. */
async function duAnCuaCrmTask(leadId) {
  if (!leadId) return null;
  const { data, error } = await supabase
    .from('crm_leads')
    .select('project_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) {
    console.warn('[dongBoHaiSo] tra dự án của deal:', error.message);
    return null;
  }
  return data?.project_id || null;
}

/** Mọi lead gắn cùng dự án — bản sao có thể nằm ở deal khác của cùng dự án. */
async function cacLeadCuaDuAn(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('type', 'deal')
    .eq('project_id', projectId);
  if (error) {
    console.warn('[dongBoHaiSo] tra deal của dự án:', error.message);
    return [];
  }
  return (data || []).map((d) => d.id).filter(Boolean);
}

/**
 * Người dùng vừa đóng/mở một nhiệm vụ ở sổ «theo deal» → chỉnh bản sao ở sổ «theo dự án».
 * @param {{id:string, lead_id:string, title:string, status:string, stage_slug:string}} task
 */
async function soiTuSoDealSangSoDuAn(task) {
  try {
    if (!task?.id || !String(task.stage_slug || '').startsWith('sx_')) return { bo_qua: 'khong_phai_sx' };
    const projectId = await duAnCuaCrmTask(task.lead_id);
    if (!projectId) return { bo_qua: 'deal_chua_co_du_an' };

    const xong = CRM_TERMINAL.has(String(task.status || '').toLowerCase());
    const ten = chuanTen(task.title);
    if (!ten) return { bo_qua: 'khong_co_ten' };

    const { data: ds, error } = await supabase
      .from('tasks')
      .select('id, title, status, metadata')
      .eq('project_id', projectId);
    if (error) throw error;

    const banSao = (ds || []).filter((t) => laViecSxCuaSoDuAn(t) && chuanTen(t.title) === ten);
    if (!banSao.length) {
      console.info(`[dongBoHaiSo] không thấy bản sao bên sổ dự án: «${task.title}» (dự án ${projectId})`);
      return { khong_tim_thay: true };
    }

    const canSua = banSao.filter((t) => TASK_TERMINAL.has(String(t.status || '').toLowerCase()) !== xong);
    if (!canSua.length) return { da_khop: true };

    const nowIso = new Date().toISOString();
    const patch = xong
      ? { status: TASK_XONG, completed_at: nowIso, updated_at: nowIso }
      : { status: TASK_MO, completed_at: null, updated_at: nowIso };
    const { error: upErr } = await supabase.from('tasks').update(patch).in('id', canSua.map((t) => t.id));
    if (upErr) throw upErr;
    return { da_sua: canSua.length, huong: 'deal→dự án', xong };
  } catch (e) {
    console.warn('[dongBoHaiSo] deal→dự án:', e.message);
    return { loi: e.message };
  }
}

/**
 * Người dùng vừa đóng/mở một nhiệm vụ ở sổ «theo dự án» → chỉnh bản sao ở sổ «theo deal».
 * @param {{id:string, project_id:string, title:string, status:string, metadata:object}} task
 */
async function soiTuSoDuAnSangSoDeal(task) {
  try {
    if (!task?.id || !task.project_id) return { bo_qua: 'thieu_du_an' };
    if (!laViecSxCuaSoDuAn(task)) return { bo_qua: 'viec_vc_ld' };

    const ten = chuanTen(task.title);
    if (!ten) return { bo_qua: 'khong_co_ten' };
    const leadIds = await cacLeadCuaDuAn(task.project_id);
    if (!leadIds.length) return { bo_qua: 'du_an_chua_co_deal' };

    const xong = TASK_TERMINAL.has(String(task.status || '').toLowerCase());
    const { data: ds, error } = await supabase
      .from('crm_tasks')
      .select('id, title, status')
      .in('lead_id', leadIds)
      .like('stage_slug', 'sx_%');
    if (error) throw error;

    const banSao = (ds || []).filter((t) => chuanTen(t.title) === ten);
    if (!banSao.length) {
      console.info(`[dongBoHaiSo] không thấy bản sao bên sổ deal: «${task.title}» (dự án ${task.project_id})`);
      return { khong_tim_thay: true };
    }

    const canSua = banSao.filter((t) => CRM_TERMINAL.has(String(t.status || '').toLowerCase()) !== xong);
    if (!canSua.length) return { da_khop: true };

    const nowIso = new Date().toISOString();
    const patch = xong
      ? { status: CRM_XONG, completed_at: nowIso, updated_at: nowIso }
      : { status: CRM_MO, completed_at: null, updated_at: nowIso };
    const { error: upErr } = await supabase.from('crm_tasks').update(patch).in('id', canSua.map((t) => t.id));
    if (upErr) throw upErr;
    return { da_sua: canSua.length, huong: 'dự án→deal', xong };
  } catch (e) {
    console.warn('[dongBoHaiSo] dự án→deal:', e.message);
    return { loi: e.message };
  }
}

module.exports = {
  soiTuSoDealSangSoDuAn,
  soiTuSoDuAnSangSoDeal,
  chuanTen,
};
