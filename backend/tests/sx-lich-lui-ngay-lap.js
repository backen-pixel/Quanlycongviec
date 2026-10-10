/**
 * SX — lịch lùi từ ngày lắp đặt, số ngày từng công đoạn đặt được ở Setup.
 * Chạy offline, không cần DB: `node tests/sx-lich-lui-ngay-lap.js`
 */
require('dotenv').config();
const {
  buildSxInstallBackPlan, ngayNhomTuCotPipeline, SX_MAC_DINH_NGAY_NHOM,
} = require('../src/helpers/sxWorkshopSchedule');
const { computeSxInstallPlanDeadline } = require('../src/helpers/sxInstallPlanKanbanDeadline');

const LAP = '2026-10-18';
let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

// ── 1. Chưa cấu hình gì thì lịch phải y hệt bảng cứng cũ ──────────────────────
// Đây là bất biến quan trọng nhất: 5 công ty chưa đặt sla_days, lịch của họ không được đổi.
const mac = buildSxInstallBackPlan(LAP, {});
kiem('mặc định: đóng gói = lắp − 1', mac.packing.endYmd === '2026-10-17', mac.packing.endYmd);
kiem('mặc định: hoàn thiện = lắp − 3 .. − 2',
  mac.finishing.startYmd === '2026-10-15' && mac.finishing.endYmd === '2026-10-16',
  `${mac.finishing.startYmd}..${mac.finishing.endYmd}`);
kiem('mặc định: gia công = lắp − 5 .. − 4',
  mac.cabinet.startYmd === '2026-10-13' && mac.cabinet.endYmd === '2026-10-14',
  `${mac.cabinet.startYmd}..${mac.cabinet.endYmd}`);
kiem('mặc định: kế hoạch kết thúc lắp − 6', mac.planning.endYmd === '2026-10-12', mac.planning.endYmd);
kiem('mặc định: ngày hoàn thiện SX = lắp − 2', mac.productionFinishYmd === '2026-10-16');

// ── 2. Xưởng đặt số ngày riêng ────────────────────────────────────────────────
const cf = buildSxInstallBackPlan(LAP, { ngayNhom: { cabinet: 5, finishing: 3, packing: 2 } });
kiem('đặt đóng gói 2 ngày → 16..17',
  cf.packing.startYmd === '2026-10-16' && cf.packing.endYmd === '2026-10-17');
kiem('đặt hoàn thiện 3 ngày → 13..15',
  cf.finishing.startYmd === '2026-10-13' && cf.finishing.endYmd === '2026-10-15');
kiem('đặt gia công 5 ngày → 08..12',
  cf.cabinet.startYmd === '2026-10-08' && cf.cabinet.endYmd === '2026-10-12');
kiem('các công đoạn nối liền nhau, không chồng và không hở', (() => {
  const g = ['cabinet', 'finishing', 'packing'];
  for (let i = 0; i < g.length - 1; i += 1) {
    const truocEnd = new Date(`${cf[g[i]].endYmd}T00:00:00Z`).getTime();
    const sauStart = new Date(`${cf[g[i + 1]].startYmd}T00:00:00Z`).getTime();
    if (sauStart - truocEnd !== 86400000) return false;
  }
  return new Date(`${LAP}T00:00:00Z`).getTime()
    - new Date(`${cf.packing.endYmd}T00:00:00Z`).getTime() === 86400000;
})());

// ── 3. Đọc số ngày từ cột pipeline ────────────────────────────────────────────
kiem('lấy MAX trong nhóm, KHÔNG cộng dồn (cột nhỏ chạy song song)',
  ngayNhomTuCotPipeline([
    { group_key: 'gia_cong', sla_days: 5, is_active: true },
    { group_key: 'gia_cong', sla_days: 3, is_active: true },
  ]).cabinet === 5);
kiem('nhóm chưa đặt (0/null) rơi về mặc định',
  ngayNhomTuCotPipeline([{ group_key: 'gia_cong', sla_days: 0, is_active: true }]).cabinet
  === SX_MAC_DINH_NGAY_NHOM.cabinet);
kiem('bỏ qua cột đã tắt',
  ngayNhomTuCotPipeline([{ group_key: 'gia_cong', sla_days: 9, is_active: false }]).cabinet
  === SX_MAC_DINH_NGAY_NHOM.cabinet);
kiem('danh sách rỗng → toàn mặc định',
  JSON.stringify(ngayNhomTuCotPipeline([])) === JSON.stringify(SX_MAC_DINH_NGAY_NHOM));

// ── 4. Hạn thẻ KHÔNG đổi — vẫn là ngày lắp ────────────────────────────────────
// Chốt quyết định «xưởng chỉ đếm MỘT mốc». Hạn công đoạn chỉ là dòng phụ.
const duAn = { install_date: LAP, company_id: null, sx_reception_date: '2026-10-05' };
const cot = [
  { group_key: 'gia_cong', sla_days: 5, is_active: true },
  { group_key: 'hoan_thien', sla_days: 3, is_active: true },
  { group_key: 'dong_goi', sla_days: 2, is_active: true },
];
const tinh = computeSxInstallPlanDeadline(duAn, cot[0], cot);
kiem('hạn THẺ vẫn là ngày lắp, không phải hạn công đoạn', tinh.endYmd === LAP, tinh.endYmd);
kiem('có thêm groupEndYmd = hạn của cột lớn đang đứng', tinh.groupEndYmd === '2026-10-12', tinh.groupEndYmd);
kiem('groupEndYmd sớm hơn hạn thẻ (nên mới có tác dụng cảnh báo sớm)',
  tinh.groupEndYmd < tinh.endYmd);

const tinhMac = computeSxInstallPlanDeadline(duAn, { group_key: 'gia_cong', is_active: true }, [
  { group_key: 'gia_cong', sla_days: 0, is_active: true },
]);
kiem('chưa cấu hình: groupEndYmd = lắp − 4 như bảng cũ', tinhMac.groupEndYmd === '2026-10-14', tinhMac.groupEndYmd);

// ── 5. Ca biên ────────────────────────────────────────────────────────────────
kiem('không có ngày lắp → không có lịch', buildSxInstallBackPlan('', {}) === null);
kiem('số ngày 0 hoặc âm được ép về tối thiểu 1',
  buildSxInstallBackPlan(LAP, { ngayNhom: { packing: 0 } }).packing.startYmd === '2026-10-17');
kiem('trượt lịch (slipDays) đẩy toàn bộ mốc đi',
  buildSxInstallBackPlan(LAP, { slipDays: 2 }).cabinet.endYmd === '2026-10-16');

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
