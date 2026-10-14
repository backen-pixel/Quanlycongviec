/**
 * Đặt xưởng — hai đầu phải xem được cả hai dự án.
 *   node tests/xem-cheo-dat-xuong.js
 *
 * Chạy trên dữ liệu thật, CHỈ ĐỌC. Lấy một liên kết đặt xưởng có thật rồi kiểm cả hai
 * chiều, kèm ca âm: công ty không liên quan vẫn phải bị chặn.
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const {
  laHaiDauCuaDatXuong, userCanAccessCrossWorkshopProductionProject,
} = require('../src/helpers/dealParticipantProduction');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

(async () => {
  const { data: pl } = await supabase
    .from('project_workshop_placements')
    .select('source_project_id, target_project_id, target_company_id')
    .limit(50);
  if (!pl?.length) {
    console.log('Không có liên kết đặt xưởng nào để thử.');
    process.exit(0);
  }

  const ids = [...new Set(pl.flatMap((r) => [r.source_project_id, r.target_project_id]).filter(Boolean))];
  const { data: projs } = await supabase.from('projects').select('id, code, company_id').in('id', ids);
  const pm = new Map((projs || []).map((p) => [String(p.id), p]));
  const { data: cos } = await supabase.from('companies').select('id, name');
  const cn = Object.fromEntries((cos || []).map((c) => [c.id, c.name]));

  // Lấy một liên kết mà hai đầu khác công ty — đó mới là ca gây 403.
  const mau = pl.find((r) => {
    const s = pm.get(String(r.source_project_id));
    const t = pm.get(String(r.target_project_id));
    return s && t && String(s.company_id) !== String(t.company_id);
  });
  if (!mau) {
    console.log('Không có liên kết nào bắc qua hai công ty khác nhau.');
    process.exit(0);
  }
  const nguon = pm.get(String(mau.source_project_id));
  const dich = pm.get(String(mau.target_project_id));
  console.log(`Liên kết thử: ${nguon.code} (${cn[nguon.company_id]}) → ${dich.code} (${cn[dich.company_id]})\n`);

  kiem('xưởng NHẬN xem được dự án NGUỒN',
    await laHaiDauCuaDatXuong(nguon.id, dich.company_id));
  kiem('bên ĐẶT HÀNG xem được dự án CON ở xưởng nhận',
    await laHaiDauCuaDatXuong(dich.id, nguon.company_id));
  // Chính chủ đi qua nhánh "cùng công ty" ở trên, không qua laHaiDauCuaDatXuong —
  // nên phải kiểm bằng hàm thật, đừng kiểm hàm phụ rồi tự bịa `|| true` cho xanh.
  kiem('chính chủ vẫn mở được dự án của mình',
    await userCanAccessCrossWorkshopProductionProject(
      { userId: '00000000-0000-0000-0000-000000000000', company_id: nguon.company_id, role: 'production_admin' },
      nguon.id,
    ));

  // Ca âm: một công ty không dính dáng gì tới liên kết này.
  const ngoaiCuoc = (cos || []).find((c) => String(c.id) !== String(nguon.company_id)
    && String(c.id) !== String(dich.company_id));
  kiem(`công ty ngoài cuộc («${cn[ngoaiCuoc?.id]}») KHÔNG xem được dự án nguồn`,
    (await laHaiDauCuaDatXuong(nguon.id, ngoaiCuoc.id)) === false);
  kiem('thiếu tham số → false, không mở toang',
    (await laHaiDauCuaDatXuong(null, dich.company_id)) === false
    && (await laHaiDauCuaDatXuong(nguon.id, null)) === false);

  // Dự án KHÔNG có liên kết đặt xưởng nào thì vẫn phải bị chặn như cũ.
  const { data: khac } = await supabase.from('projects')
    .select('id, code, company_id').not('id', 'in', `(${ids.join(',')})`).limit(1);
  if (khac?.length) {
    kiem(`dự án không có liên kết đặt xưởng («${khac[0].code}») vẫn bị chặn với công ty khác`,
      (await laHaiDauCuaDatXuong(khac[0].id, dich.company_id)) === false);
  }

  // Đường thật: user giả thuộc xưởng nhận mở dự án nguồn.
  const userXuongNhan = { userId: '00000000-0000-0000-0000-000000000000', company_id: dich.company_id, role: 'production_admin' };
  kiem('qua userCanAccessCrossWorkshopProductionProject: xưởng nhận mở được dự án nguồn',
    await userCanAccessCrossWorkshopProductionProject(userXuongNhan, nguon.id));

  const userNgoai = { userId: '00000000-0000-0000-0000-000000000000', company_id: ngoaiCuoc.id, role: 'production_admin' };
  const choPhepNgoai = await userCanAccessCrossWorkshopProductionProject(userNgoai, nguon.id);
  kiem('qua hàm thật: công ty ngoài cuộc vẫn bị chặn', choPhepNgoai === false, choPhepNgoai);

  console.log(`\n${dat} đạt · ${truot} trượt`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
