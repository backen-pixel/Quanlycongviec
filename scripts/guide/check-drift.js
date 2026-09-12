#!/usr/bin/env node
/**
 * Cổng chặn drift cho Trợ lý hướng dẫn — chạy trong `build:frontend` (xem
 * docs/guide-assistant-architecture.md §6 lớp 2). Route mới thiếu summary/keywords →
 * exit 1 kèm danh sách tiếng Việt, deploy dừng ngay thay vì trợ lý sai dần âm thầm.
 *
 * `--update-baseline`  : ghi lại danh sách path đang thiếu mô tả vào .drift-baseline.json
 *                        (miễn trừ tạm — CHỈ được co lại theo thời gian, không được nở ra).
 *
 * Chạy: node scripts/guide/check-drift.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SCREENS_JSON = path.join(ROOT, 'backend/data/guide-knowledge/screens.json');
const BASELINE_JSON = path.join(ROOT, 'backend/data/guide-knowledge/.drift-baseline.json');

/* ═══════════════ LỚP 2: NHÃN NÚT CÓ CÒN TỒN TẠI KHÔNG ═══════════════
 *
 * Lớp 1 ở dưới chỉ hỏi "route mới đã có mô tả chưa". Nó KHÔNG bắt được loại lệch âm thầm và
 * thường gặp hơn nhiều: nút đổi tên, dời đi, hoặc bị xoá — đường dẫn giữ nguyên nên không có gì
 * kêu, mà trợ lý thì vẫn bảo người dùng bấm một nút không còn tồn tại.
 *
 * Cách dò: gom toàn bộ source frontend thành một chuỗi rồi tìm nguyên văn từng `actions[].label`.
 * Thô, nhưng ĐO RỒI MỚI LÀM: 441 nhãn trong screens/guides/tour-guides, 440 tìm thấy nguyên văn.
 * Cái duy nhất trượt hoá ra là lỗi thật — kiến thức ghi "Thêm· CRM" thiếu dấu cách, và với phép
 * khớp của `bam_nut` thì cú bấm đó trượt. Tức tỷ lệ báo động giả gần bằng 0 và nó bắt được ca thật
 * ngay lần chạy đầu.
 *
 * KHÔNG dò `lead-detail.json`: `actions` ở đó là CÂU trích từ tài liệu nghiệp vụ ("Bấm ghim
 * (icon pin) → thẻ lên đầu Kanban"), không phải nhãn nút. 184/236 dài quá 40 ký tự — dò chúng
 * chỉ sinh ra 236 báo động giả.
 *
 * Nhãn dựng động (`Thêm · {moduleLabel}`) sẽ không tìm thấy nguyên văn dù nút vẫn còn. Đó là lý
 * do có baseline riêng: miễn trừ được, và chỉ được CO LẠI theo thời gian như baseline lớp 1.
 */
const LABEL_SOURCES = ['screens.json', 'guides.json', 'tour-guides.json'];
const LABEL_BASELINE = path.join(ROOT, 'backend/data/guide-knowledge/.label-baseline.json');
const FE_SRC = path.join(ROOT, 'frontend/src');
const SKIP_DIRS = new Set(['data', 'node_modules']);

function collectSource(dir) {
  let out = '';
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (!SKIP_DIRS.has(f.name)) out += collectSource(p);
    } else if (/\.(jsx|js)$/.test(f.name)) {
      out += `${fs.readFileSync(p, 'utf8')}
`;
    }
  }
  return out;
}

/** @returns {string[]} khoá dạng "tệp :: path :: nhãn" của những nhãn không còn trong source. */
function findDeadLabels() {
  if (!fs.existsSync(FE_SRC)) return [];
  const src = collectSource(FE_SRC);
  const dead = [];
  for (const name of LABEL_SOURCES) {
    const f = path.join(ROOT, 'backend/data/guide-knowledge', name);
    let list = [];
    try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const c of list) {
      for (const t of c.actions || []) {
        const label = String(t?.label || '').trim();
        if (!label) continue;
        if (!src.includes(label)) dead.push(`${name} :: ${c.path} :: ${label}`);
      }
    }
  }
  return dead.sort();
}

function checkLabels(updateBaseline) {
  const dead = findDeadLabels();
  let exempt = [];
  try { exempt = JSON.parse(fs.readFileSync(LABEL_BASELINE, 'utf8')); } catch { /* chưa có */ }

  if (updateBaseline) {
    fs.writeFileSync(LABEL_BASELINE, JSON.stringify(dead, null, 2), 'utf8');
    console.log(`✅ đã ghi ${dead.length} nhãn miễn trừ vào .label-baseline.json`);
    return true;
  }

  const set = new Set(exempt);
  const fresh = dead.filter((x) => !set.has(x));
  if (fresh.length) {
    console.error(`❌ guide:check — ${fresh.length} nhãn nút trong kho kiến thức KHÔNG CÒN trong mã nguồn:`);
    for (const x of fresh) console.error(`   - ${x}`);
    console.error('');
    console.error('   Nút đã đổi tên hoặc bị xoá → sửa `actions` trong tệp kiến thức tương ứng.');
    console.error('   Nếu nhãn được dựng động (VD `Thêm · {module}`) thì miễn trừ bằng:');
    console.error('       npm run guide:check -- --update-baseline');
    return false;
  }
  console.log(`✅ nhãn nút: ${dead.length} miễn trừ trong baseline, không có nhãn chết mới.`);
  return true;
}


const updateBaseline = process.argv.includes('--update-baseline');

function main() {
  if (!fs.existsSync(SCREENS_JSON)) {
    console.error('❌ guide:check — chưa có backend/data/guide-knowledge/screens.json. Chạy `npm run guide:sync` trước.');
    process.exit(1);
  }
  const screens = JSON.parse(fs.readFileSync(SCREENS_JSON, 'utf8'));
  let baseline = [];
  try { baseline = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8')); } catch { /* chưa có, coi như rỗng */ }
  const baselineSet = new Set(baseline);

  const missing = screens
    .filter((s) => !s.redirect && (!s.summary || !s.summary.trim()))
    .map((s) => s.path);

  if (updateBaseline) {
    fs.writeFileSync(BASELINE_JSON, JSON.stringify(missing.sort(), null, 2), 'utf8');
    console.log(`✅ guide:check --update-baseline — đã ghi ${missing.length} path miễn trừ vào .drift-baseline.json`);
    checkLabels(true);
    return;
  }

  const notExempted = missing.filter((p) => !baselineSet.has(p));
  const grew = missing.filter((p) => baselineSet.has(p)); // vẫn thiếu nhưng đã có trong baseline → OK, không chặn

  if (notExempted.length > 0) {
    console.error(`❌ guide:check — ${notExempted.length} màn hình MỚI chưa có summary/keywords trong screens.json:`);
    for (const p of notExempted) console.error(`   - ${p}`);
    console.error('\n   Điền `summary` + `keywords` vào backend/data/guide-knowledge/screens.json rồi build lại,');
    console.error('   hoặc chạy `npm run guide:check -- --update-baseline` nếu cố ý miễn trừ tạm thời.');
    process.exit(1);
  }

  console.log(`✅ guide:check — ${screens.length - missing.length}/${screens.length} màn hình có mô tả (${grew.length} đang miễn trừ trong baseline).`);

  // Lớp 2 chạy SAU và cũng chặn deploy: một nhãn chết làm trợ lý chỉ vào nút không tồn tại,
  // hỏng không kém gì một màn hình thiếu mô tả.
  if (!checkLabels(false)) process.exit(1);
}

main();
