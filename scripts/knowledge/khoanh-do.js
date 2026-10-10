/**
 * Khoanh đỏ đánh số lên ảnh chụp màn hình, cho bài học trong module Kiến thức.
 *
 * VÌ SAO CÓ TỆP NÀY
 * Các bài học cũ mô tả ảnh là «3 khung khoanh», «5 khung khoanh» — tức ảnh gốc có khung đỏ
 * đánh số, và phần chữ trong bài trỏ tới từng số. Mười hai tệp ảnh đó đã mất khỏi kho, nên khi
 * chụp lại phải dựng được đúng kiểu khoanh ấy, không thì chữ trong bài mất chỗ bám.
 *
 * Dùng ffmpeg (đã có sẵn qua `ffmpeg-static`) thay vì thêm thư viện ảnh mới: `sharp`, `jimp`,
 * `canvas` đều chưa cài, mà kéo thêm một phụ thuộc nặng chỉ để vẽ hình chữ nhật thì không đáng.
 *
 * DÙNG
 *   node scripts/knowledge/khoanh-do.js <ảnh-vào> <ảnh-ra> "x,y,w,h" ["x,y,w,h" ...]
 *
 * Ví dụ — khoanh 3 chỗ, đánh số 1-2-3 theo thứ tự truyền vào:
 *   node scripts/knowledge/khoanh-do.js tho.png xuong-01-dashboard.png \
 *     "260,180,1130,100" "260,290,540,470" "1060,30,330,46"
 *
 * Toạ độ tính bằng pixel, gốc ở góc trên bên trái, đúng như công cụ cắt ảnh của Windows hiện.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * `ffmpeg-static` cài trong `backend/node_modules`, mà tệp này nằm ở `scripts/` ngoài đó —
 * require thường sẽ không thấy. Giải từ thư mục backend, đúng cách các script khác chạy.
 */
const ffmpeg = require(require.resolve('ffmpeg-static', {
  paths: [path.join(__dirname, '..', '..', 'backend')],
}));

/** Đỏ đủ đậm để nổi trên nền sáng lẫn nền tối của phần mềm. */
const DO = 'red@1.0';
const DAY_KHUNG = 4;
const CO_SO = 34;

/** Font đậm của hệ thống — drawtext bắt buộc có tệp font thật. */
function timFont() {
  const ungVien = [
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ];
  return ungVien.find((p) => fs.existsSync(p)) || null;
}

/** 'x,y,w,h' → {x,y,w,h}, báo lỗi rõ ràng thay vì sinh ảnh sai lặng lẽ. */
function docKhung(raw, i) {
  const p = String(raw).split(',').map((s) => Number(String(s).trim()));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`Khung thứ ${i + 1} sai định dạng: «${raw}». Cần "x,y,w,h" toàn số không âm.`);
  }
  const [x, y, w, h] = p;
  if (w < 8 || h < 8) throw new Error(`Khung thứ ${i + 1} quá nhỏ (${w}×${h}).`);
  return { x, y, w, h };
}

function dungBoLoc(khung, font) {
  const loc = [];
  khung.forEach((k, i) => {
    loc.push(`drawbox=x=${k.x}:y=${k.y}:w=${k.w}:h=${k.h}:color=${DO}:t=${DAY_KHUNG}`);
    if (!font) return;
    // Huy hiệu số đặt ở góc trên-trái khung, thụt vào trong để không che nội dung ngay mép.
    const bx = k.x + 2;
    const by = Math.max(0, k.y - CO_SO + 2);
    loc.push(`drawbox=x=${bx}:y=${by}:w=${CO_SO}:h=${CO_SO}:color=${DO}:t=fill`);
    loc.push(
      `drawtext=fontfile='${font.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
      + `:text='${i + 1}':fontcolor=white:fontsize=${Math.round(CO_SO * 0.62)}`
      + `:x=${bx + Math.round(CO_SO * 0.34)}:y=${by + Math.round(CO_SO * 0.2)}`,
    );
  });
  return loc.join(',');
}

function khoanhDo(vao, ra, khungRaw) {
  if (!fs.existsSync(vao)) throw new Error(`Không thấy ảnh vào: ${vao}`);
  if (!khungRaw.length) throw new Error('Phải truyền ít nhất một khung "x,y,w,h".');
  const khung = khungRaw.map(docKhung);
  const font = timFont();
  if (!font) console.warn('⚠️  Không tìm thấy font đậm — vẽ khung nhưng KHÔNG đánh số.');
  fs.mkdirSync(path.dirname(path.resolve(ra)), { recursive: true });
  execFileSync(ffmpeg, ['-y', '-i', vao, '-vf', dungBoLoc(khung, font), '-frames:v', '1', ra], { stdio: 'pipe' });
  return { ra, soKhung: khung.length, danhSo: Boolean(font) };
}

if (require.main === module) {
  const [vao, ra, ...khung] = process.argv.slice(2);
  if (!vao || !ra) {
    console.log('Dùng: node scripts/knowledge/khoanh-do.js <ảnh-vào> <ảnh-ra> "x,y,w,h" ["x,y,w,h" ...]');
    process.exit(1);
  }
  try {
    const kq = khoanhDo(vao, ra, khung);
    console.log(`✅ ${kq.ra} — ${kq.soKhung} khung${kq.danhSo ? ' đánh số 1–' + kq.soKhung : ''}`);
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
}

module.exports = { khoanhDo };
