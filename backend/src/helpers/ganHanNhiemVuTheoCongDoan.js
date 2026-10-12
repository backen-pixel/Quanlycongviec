/**
 * Gắn hạn cho NHIỆM VỤ theo đúng công đoạn (cột lớn) nó thuộc về, lùi từ ngày lắp đặt.
 *
 * VÌ SAO CÓ TỆP NÀY
 * `donHanNhiemVuTheoMocLap` dời đều mọi hạn đúng số ngày đã dời ngày lắp. Lúc viết hàm đó,
 * dời đều là lựa chọn DUY NHẤT khả thi: 6.173/6.173 việc mở của HCB có `production_stage_id`
 * NULL nên không cách nào biết việc thuộc công đoạn nào. Sau đợt backfill, 2.948/8.799 việc mở
 * đã có cột — map được về nhóm hạn thì tính thẳng ra ngày đúng, không phải dời mò nữa.
 *
 * PHỦ TỚI ĐÂU (đo ngày 10/10/2026)
 *   duyet 939 · hoan_thien 448 · tiep_nhan 346 · dong_goi 104 · ke_hoach 34 · gia_cong 24
 *   = 1.895 việc gắn được hạn chính xác.
 * Còn lại thì KHÔNG đụng, để `donHanNhiemVuTheoMocLap` dời đều như cũ:
 *   - 757 việc trỏ cột không thuộc nhóm nào
 *   - 296 việc ở nhóm công nợ — công nợ không có hạn sản xuất
 *   - 5.851 việc chưa có `production_stage_id`
 *
 * Nhóm `planning` (Tiếp nhận / Kế hoạch / Duyệt) CÓ gắn hạn, khác với thẻ Dashboard cố tình bỏ
 * qua nó. Trên thẻ, một cái hạn cho nhóm không có số ngày cố định thì khó hiểu; còn với nhiệm vụ
 * thì «kế hoạch phải xong trước ngày X» là mốc có nghĩa và chính là thứ xưởng cần.
 *
 * GHI ĐÈ: hàm này đặt hạn TUYỆT ĐỐI, nên hạn ai đó tự sửa tay sẽ bị tính lại. Đó là chủ ý —
 * nó chỉ chạy khi có người đổi ngày lắp, và yêu cầu là «đổi deadline thì hạn nhiệm vụ đổi theo».
 */

const { supabase } = require('./../config/supabase');
const {
  buildSxInstallBackPlan,
  endYmdForDeadlineGroup,
  ngayNhomTuCotPipeline,
  resolveSxPlanInstallYmd,
  sxStageDeadlineGroup,
  ymdFromUnknownDate,
} = require('./sxWorkshopSchedule');

const TASK_DONE = new Set(['done']);
const CHUNK = 100;

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Hạn của MỘT nhiệm vụ, theo cột nó đứng. Hàm thuần, không đụng DB — để test được.
 *
 * Trả '' khi: không tra được cột (cột đã xoá), cột không thuộc nhóm hạn nào (vd công nợ),
 * hoặc nhóm đó không có mốc trong lịch. Gọi nơi dùng tự quyết định bỏ qua.
 */
function hanNhiemVuTheoCot(stage, danhSachCot, plan) {
  if (!stage || !plan) return '';
  const nhom = sxStageDeadlineGroup(stage, danhSachCot);
  if (!nhom) return '';
  return endYmdForDeadlineGroup(plan, nhom) || '';
}

/**
 * @param {{ projectId: string, dryRun?: boolean }} opts
 * @returns {Promise<{ ganDuoc: number, boQua: number, theoNhom: Record<string, number>,
 *                     taskIds: string[], skipped?: string }>}
 */
async function ganHanNhiemVuTheoCongDoan({ projectId, dryRun = false } = {}) {
  const pid = String(projectId || '').trim();
  const ketQua = { ganDuoc: 0, boQua: 0, theoNhom: {}, taskIds: [] };
  if (!pid) return { ...ketQua, skipped: 'thieu_project_id' };

  const { data: duAn, error: errDuAn } = await supabase
    .from('projects')
    .select('id, company_id, install_date, delivery_date, install_occurrence_dates, sx_reception_date, sx_schedule_slip_days, created_at')
    .eq('id', pid)
    .maybeSingle();
  if (errDuAn || !duAn) return { ...ketQua, skipped: 'khong_doc_duoc_du_an' };

  const lapYmd = resolveSxPlanInstallYmd(duAn);
  if (!lapYmd) return { ...ketQua, skipped: 'chua_co_ngay_lap' };

  // Cột của công ty — vừa để map việc → nhóm, vừa để lấy số ngày xưởng đặt ở Setup.
  let qCot = supabase
    .from('production_pipeline_stages')
    .select('id, group_key, deadline_group, sla_days, is_active, company_id');
  qCot = duAn.company_id ? qCot.eq('company_id', duAn.company_id) : qCot.is('company_id', null);
  const { data: cot, error: errCot } = await qCot;
  if (errCot) return { ...ketQua, skipped: 'khong_doc_duoc_cot' };
  const cotById = new Map((cot || []).map((s) => [String(s.id), s]));

  const plan = buildSxInstallBackPlan(lapYmd, {
    startYmd: ymdFromUnknownDate(duAn.sx_reception_date) || ymdFromUnknownDate(duAn.created_at),
    slipDays: duAn.sx_schedule_slip_days,
    ngayNhom: ngayNhomTuCotPipeline(cot),
  });
  if (!plan) return { ...ketQua, skipped: 'khong_dung_duoc_lich' };

  const { data: viec, error: errViec } = await supabase
    .from('tasks')
    .select('id, status, due_date, production_stage_id')
    .eq('project_id', pid)
    .not('production_stage_id', 'is', null);
  if (errViec) return { ...ketQua, skipped: 'khong_doc_duoc_nhiem_vu' };

  const theoHan = new Map();
  for (const t of viec || []) {
    if (TASK_DONE.has(String(t.status || '').toLowerCase())) continue;
    const s = cotById.get(String(t.production_stage_id));
    if (!s) { ketQua.boQua += 1; continue; }
    const nhom = sxStageDeadlineGroup(s, cot);
    const han = hanNhiemVuTheoCot(s, cot, plan);
    if (!han) { ketQua.boQua += 1; continue; }
    if (String(t.due_date || '').slice(0, 10) === han) { ketQua.boQua += 1; continue; }
    if (!theoHan.has(han)) theoHan.set(han, []);
    theoHan.get(han).push(t.id);
    ketQua.theoNhom[nhom] = (ketQua.theoNhom[nhom] || 0) + 1;
    ketQua.taskIds.push(String(t.id));
  }

  for (const [han, ids] of theoHan) {
    if (dryRun) { ketQua.ganDuoc += ids.length; continue; }
    for (const part of chunk(ids)) {
      const { error } = await supabase.from('tasks').update({ due_date: han }).in('id', part);
      if (error) { console.warn('[ganHanNhiemVu] ghi tasks:', error.message); continue; }
      ketQua.ganDuoc += part.length;
    }
  }
  return ketQua;
}

module.exports = { ganHanNhiemVuTheoCongDoan, hanNhiemVuTheoCot };
