/**
 * Các luồng bình luận / kho file "anh em" của một dự án sản xuất, nối qua đặt xưởng.
 *
 * VẤN ĐỀ
 * Đặt xưởng sinh ra một dự án MỚI ở xưởng nhận, kèm một deal CRM MỚI, và deal mới đó
 * `parent_lead_id = NULL` — tức không có con trỏ nào về deal gốc. Quan hệ duy nhất nằm
 * ở bảng `project_workshop_placements`.
 *
 * Hệ quả đã gặp thật (đơn «CT - CHỊ TÂM», Metalla → HCB): hai luồng bình luận song song
 * cho cùng một đơn hàng. Bên nguồn 37 bình luận, bên xưởng 21 bình luận, không bên nào
 * thấy bên nào. Người của xưởng HCB còn viết «đã giao kính» vào luồng Metalla, nên chính
 * trang HCB không thấy câu đó. Kho file Drive cũng tách đôi y như vậy vì khoá theo
 * `project_id`.
 *
 * Phần chữa cho chiều XƯỞNG → NGUỒN đã có sẵn (xem `resolveWorkshopSourceProjectId`:
 * dự án xưởng nhận đọc ghép tài liệu + deal của dự án nguồn). Thiếu chiều ngược lại:
 * đứng ở dự án NGUỒN thì không thấy gì của xưởng.
 *
 * Tệp này trả về danh sách luồng liên quan theo CẢ HAI chiều để giao diện cho chuyển qua
 * lại. Cố ý KHÔNG gộp hai luồng làm một: gộp thì không biết bình luận mới gửi về đâu,
 * còn đổi luồng mặc định thì bên kia mất lịch sử đang có.
 */

const { supabase } = require('../config/supabase');

/**
 * Deal chính của một dự án — cùng luật với `pickPrimarySxCrmDeal` bên frontend:
 * ưu tiên deal GỐC (không có parent_lead_id), rồi lấy cái tạo sớm nhất.
 * Lệch luật là hai bên nhìn vào hai luồng khác nhau.
 */
function chonDealChinh(deals) {
  const ds = (deals || []).filter((d) => String(d?.type || '') === 'deal');
  const pool = ds.length ? ds : (deals || []);
  const goc = pool.filter((d) => !d?.parent_lead_id);
  const uu = goc.length ? goc : pool;
  return [...uu].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0] || null;
}

async function dealChinhChoCacDuAn(projectIds) {
  const ids = [...new Set((projectIds || []).map((x) => String(x || '')).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, code, title, type, parent_lead_id, project_id, created_at, company_id')
    .in('project_id', ids);
  if (error) {
    console.warn('[sxLuongLienQuan] deal theo dự án:', error.message);
    return {};
  }
  const theoDuAn = {};
  for (const l of data || []) {
    const k = String(l.project_id);
    (theoDuAn[k] ||= []).push(l);
  }
  const ra = {};
  for (const [k, ds] of Object.entries(theoDuAn)) ra[k] = chonDealChinh(ds);
  return ra;
}

/**
 * @returns {Promise<Array<{project_id,project_code,project_name,company_name,lead_id,lead_code,huong}>>}
 *   `huong='xuong'` — dự án này là NGUỒN, bên kia là xưởng nhận.
 *   `huong='nguon'` — dự án này ở xưởng nhận, bên kia là dự án gốc.
 *   Luồng không có deal CRM vẫn trả về (lead_id = null) để giao diện còn mở sang kho file.
 */
async function layLuongLienQuanDatXuong(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];

  const sel = `
    source_project_id, target_project_id,
    target_project:projects!project_workshop_placements_target_project_id_fkey(
      id, code, name, company:companies!projects_company_id_fkey(id, name, short_name)
    ),
    source_project:projects!project_workshop_placements_source_project_id_fkey(
      id, code, name, company:companies!projects_company_id_fkey(id, name, short_name)
    )
  `;

  const [laNguon, laXuong] = await Promise.all([
    supabase.from('project_workshop_placements').select(sel).eq('source_project_id', pid),
    supabase.from('project_workshop_placements').select(sel).eq('target_project_id', pid),
  ]);
  if (laNguon.error) {
    console.warn('[sxLuongLienQuan] tra chiều nguồn:', laNguon.error.message);
  }
  if (laXuong.error) {
    console.warn('[sxLuongLienQuan] tra chiều xưởng:', laXuong.error.message);
  }

  const beKia = [];
  for (const r of laNguon.data || []) {
    if (r.target_project?.id) beKia.push({ p: r.target_project, huong: 'xuong' });
  }
  for (const r of laXuong.data || []) {
    if (r.source_project?.id) beKia.push({ p: r.source_project, huong: 'nguon' });
  }

  const theoId = new Map();
  for (const x of beKia) {
    const k = String(x.p.id);
    if (k !== pid && !theoId.has(k)) theoId.set(k, x);
  }
  if (!theoId.size) return [];

  const deals = await dealChinhChoCacDuAn([...theoId.keys()]);
  return [...theoId.values()].map(({ p, huong }) => {
    const d = deals[String(p.id)] || null;
    return {
      project_id: String(p.id),
      project_code: p.code || null,
      project_name: p.name || null,
      company_name: p.company?.short_name || p.company?.name || null,
      lead_id: d?.id || null,
      lead_code: d?.code || null,
      huong,
    };
  });
}

/** Chỉ id dự án — dùng để mở rộng phạm vi đọc tài liệu. */
async function idDuAnLienQuanDatXuong(projectId) {
  const ds = await layLuongLienQuanDatXuong(projectId);
  return ds.map((x) => x.project_id);
}

module.exports = {
  layLuongLienQuanDatXuong,
  idDuAnLienQuanDatXuong,
  chonDealChinh,
};
