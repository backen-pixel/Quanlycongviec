/**
 * Kiến thức — tráo thứ tự câu hỏi và đáp án.
 * Chạy offline, không cần DB: `node tests/knowledge-tron-de.js`
 *
 * Điều quan trọng nhất phải chứng minh: TRÁO RỒI CHẤM VẪN ĐÚNG. Người học chọn đúng ô trên đề
 * đã tráo thì phải được tính đúng; chọn sai thì phải bị tính sai.
 */
require('dotenv').config();
const { tronDeChoNguoiHoc, doiVeChiSoGoc, hoanViDapAn } = require('../src/helpers/knowledgeTronDe');

let dat = 0; let truot = 0;
function kiem(ten, ok, chiTiet) {
  console.log(`${ok ? '✅' : '❌'} ${ten}`);
  if (!ok) { if (chiTiet !== undefined) console.log('   ', chiTiet); truot += 1; } else dat += 1;
}

const DE = [
  { id: 'q1', type: 'single', question: 'Hạn trên thẻ là ngày gì?', options: ['Ngày tạo', 'Ngày lắp đặt', 'Ngày thu tiền', 'Ngày giao'], correct: [1] },
  { id: 'q2', type: 'single', question: 'Cột nhỏ chạy thế nào?', options: ['Nối tiếp', 'Song song', 'Ngẫu nhiên'], correct: [1] },
  { id: 'q3', type: 'multiple', question: 'Chọn đủ các ô KPI về vận chuyển', options: ['Chờ vận chuyển', 'Đã vận chuyển', 'Công nợ', 'Đã thu'], correct: [0, 1] },
  { id: 'q4', type: 'single', question: 'Ai quyết định tab phát sinh?', options: ['Người tạo', 'Loại phát sinh', 'Quản lý', 'Tất cả các ý trên'], correct: [1] },
  { id: 'q5', type: 'checklist', question: 'Đã kiểm mã đơn', options: ['Rồi'], correct: [0] },
];

const CTX = { userId: 'u-123', exerciseId: 'ex-abc', luot: 1, tronCau: true, tronDapAn: true };

// ── 1. Tráo có thật sự đổi thứ tự ────────────────────────────────────────────
const tron1 = tronDeChoNguoiHoc(DE, CTX);
kiem('tráo xong vẫn đủ số câu', tron1.length === DE.length);
kiem('thứ tự CÂU đã đổi', JSON.stringify(tron1.map((q) => q.id)) !== JSON.stringify(DE.map((q) => q.id)),
  tron1.map((q) => q.id).join(','));
const q1Tron = tron1.find((q) => q.id === 'q1');
kiem('thứ tự ĐÁP ÁN của q1 đã đổi',
  JSON.stringify(q1Tron.options) !== JSON.stringify(DE[0].options), q1Tron.options.join(' | '));
kiem('đáp án tráo xong vẫn đủ, không mất không trùng',
  [...q1Tron.options].sort().join() === [...DE[0].options].sort().join());

// ── 2. Tất định: cùng người, cùng lượt → cùng đề ─────────────────────────────
const tron2 = tronDeChoNguoiHoc(DE, CTX);
kiem('cùng người + cùng lượt → đề y hệt (tất định)',
  JSON.stringify(tron1) === JSON.stringify(tron2));
const tronLuot2 = tronDeChoNguoiHoc(DE, { ...CTX, luot: 2 });
kiem('đổi LƯỢT → đề tráo khác đi',
  JSON.stringify(tronLuot2.map((q) => q.id)) !== JSON.stringify(tron1.map((q) => q.id)));
const tronNguoiKhac = tronDeChoNguoiHoc(DE, { ...CTX, userId: 'u-999' });
kiem('đổi NGƯỜI → đề tráo khác đi',
  JSON.stringify(tronNguoiKhac.map((q) => q.id)) !== JSON.stringify(tron1.map((q) => q.id)));

// ── 3. Không tráo thứ linh thiêng ────────────────────────────────────────────
const q4Tron = tron1.find((q) => q.id === 'q4');
kiem('câu có «Tất cả các ý trên» KHÔNG bị tráo đáp án',
  JSON.stringify(q4Tron.options) === JSON.stringify(DE[3].options), q4Tron.options.join(' | '));
kiem('câu checklist KHÔNG bị tráo đáp án',
  hoanViDapAn(DE[4], 'u-123', 'ex-abc', 1) === null);

// ── 4. QUAN TRỌNG NHẤT — tráo rồi chấm vẫn đúng ──────────────────────────────
/** Người học chọn đúng trên đề ĐÃ TRÁO: tìm vị trí hiển thị của đáp án đúng. */
function chonDungTrenDeTron(cauTron, cauGoc) {
  if (cauGoc.type === 'multiple') {
    return cauGoc.correct.map((i) => cauTron.options.indexOf(cauGoc.options[i]));
  }
  return cauTron.options.indexOf(cauGoc.options[cauGoc.correct[0]]);
}

const traLoiTron = {};
for (const cauTron of tron1) {
  const goc = DE.find((q) => q.id === cauTron.id);
  if (goc.type === 'checklist') { traLoiTron[goc.id] = true; continue; }
  traLoiTron[goc.id] = chonDungTrenDeTron(cauTron, goc);
}
const veGoc = doiVeChiSoGoc(DE, traLoiTron, CTX);

let dungHet = true;
for (const goc of DE) {
  if (goc.type === 'checklist') continue;
  const d = veGoc[goc.id];
  const ok = goc.type === 'multiple'
    ? JSON.stringify([...d].sort()) === JSON.stringify([...goc.correct].sort())
    : d === goc.correct[0];
  if (!ok) { dungHet = false; console.log(`     lệch ở ${goc.id}: dịch ra ${JSON.stringify(d)}, đúng là ${JSON.stringify(goc.correct)}`); }
}
kiem('CHỌN ĐÚNG trên đề tráo → dịch ngược ra ĐÚNG đáp án gốc', dungHet);

// Chọn sai thì phải vẫn sai
const traLoiSai = {};
for (const cauTron of tron1) {
  const goc = DE.find((q) => q.id === cauTron.id);
  if (goc.type !== 'single') continue;
  const dungTaiViTri = chonDungTrenDeTron(cauTron, goc);
  traLoiSai[goc.id] = dungTaiViTri === 0 ? 1 : 0;
}
const saiVeGoc = doiVeChiSoGoc(DE, traLoiSai, CTX);
const khongCaiNaoDung = DE.filter((q) => q.type === 'single')
  .every((q) => saiVeGoc[q.id] !== q.correct[0]);
kiem('CHỌN SAI trên đề tráo → dịch ngược vẫn SAI (không ăn may)', khongCaiNaoDung);

// ── 5. Tắt tráo thì mọi thứ y như cũ ─────────────────────────────────────────
const khongTron = tronDeChoNguoiHoc(DE, { ...CTX, tronCau: false, tronDapAn: false });
kiem('tắt cả hai công tắc → đề giữ nguyên thứ tự gốc',
  JSON.stringify(khongTron) === JSON.stringify(DE));
const traLoiThuong = { q1: 1, q3: [0, 1] };
kiem('tắt tráo đáp án → đáp án gửi về không bị dịch',
  JSON.stringify(doiVeChiSoGoc(DE, traLoiThuong, { ...CTX, tronDapAn: false })) === JSON.stringify(traLoiThuong));

// ── 6. Ca biên ───────────────────────────────────────────────────────────────
kiem('đề rỗng → không nổ', JSON.stringify(tronDeChoNguoiHoc([], CTX)) === '[]');
kiem('câu 1 đáp án → không tráo',
  hoanViDapAn({ id: 'x', type: 'single', options: ['chỉ một'] }, 'u', 'e', 1) === null);
kiem('bỏ trống câu → dịch ngược không bịa đáp án',
  doiVeChiSoGoc(DE, { q2: undefined }, CTX).q2 === undefined);

console.log(`\n${dat} đạt · ${truot} trượt`);
process.exit(truot ? 1 : 0);
