#!/usr/bin/env node
/**
 * DI TRÚ HAI TỆP LƯU TRỮ CỦA TRỢ LÝ sang tên khoá tiếng Anh.
 *
 * Đi kèm database/602_guide_assistant_en.sql (phần Supabase) và đợt đổi tên mã nguồn.
 * Hai tệp nằm trong volume Docker `backend/uploads/guide-memory/`:
 *
 *   kinh-nghiem.json → experience.json    kho kinh nghiệm (13 khoá mỗi bản ghi)
 *   cai-dat.json     → settings.json      cấu hình chạy động (25 khoá)
 *
 * ⚠️ CHẠY TRƯỚC KHI DỰNG LẠI CONTAINER VỚI MÃ MỚI. Mã mới đọc tên mới; gặp tệp cũ nó coi như
 *    chưa có gì — cấu hình về mặc định và kho kinh nghiệm rỗng (dữ liệu KHÔNG mất, chỉ không
 *    được đọc, nhưng lần ghi kế tiếp sẽ đè lên tệp mới và cái cũ thành mồ côi).
 *
 * An toàn khi chạy lại: tệp đã ở dạng mới thì bỏ qua. Tệp cũ được giữ nguyên với đuôi
 * `.pre-en-<timestamp>.bak` chứ không xoá.
 *
 *   node scripts/guide/migrate-store-en.js            # chạy thật
 *   node scripts/guide/migrate-store-en.js --dry-run  # chỉ in ra sẽ làm gì
 */

const fs = require('fs');
const path = require('path');

/**
 * Thư mục kho. Mặc định là thư mục trên HOST, nhưng khi chạy Docker thì dữ liệu THẬT nằm trong
 * volume `beppro-uploads` chứ không phải ở đây — thư mục host lúc đó chỉ là bản cũ bỏ quên.
 * Đặt `GUIDE_MEMORY_DIR` để trỏ vào bản copy lấy ra từ volume (xem README của đợt đổi tên).
 */
const DIR = process.env.GUIDE_MEMORY_DIR
  || path.join(__dirname, '..', '..', 'backend', 'uploads', 'guide-memory');
const DRY = process.argv.includes('--dry-run');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

/** Khoá của MỘT bản ghi kinh nghiệm. Giống hệt bảng cột trong 602_guide_assistant_en.sql. */
const EXPERIENCE_KEYS = {
  cau_hoi: 'question',
  tu_khoa: 'keywords',
  duong_dan: 'path',
  cac_buoc: 'steps',
  ngo_cut: 'dead_ends',
  bai_hoc: 'lesson',
  nguon: 'source',
  dung_lai: 'use_count',
  that_bai: 'fail_count',
  tao_luc: 'created_at',
  dung_luc: 'used_at',
  bo_luc: 'discarded_at',
  bo_ly_do: 'discard_reason',
};

/** Khoá bên trong từng phần tử của `steps`. */
const STEP_KEYS = { tom_tat: 'summary', trang_thai: 'status' };

const SETTING_KEYS = {
  nha_cung_cap: 'provider',
  han_muc_cau_hoi_ngay: 'daily_question_quota',
  han_muc_token_ngay: 'daily_token_quota',
  nhat_ky_hoi_dap: 'chat_log_enabled',
  ty_gia_usd_vnd: 'usd_vnd_rate',
  so_luot_nho: 'remembered_turns',
  kinh_nghiem_bat: 'experience_enabled',
  y_dinh_bat: 'intent_enabled',
  y_dinh_model: 'intent_model',
  hoc_nen_bat: 'background_learn_enabled',
  hoc_nen_model: 'background_learn_model',
  kinh_nghiem_nguong: 'experience_threshold',
  kinh_nghiem_so_nhac: 'experience_recall_count',
  cuu_ho_buoc: 'rescue_min_steps',
  cuu_ho_tin_hieu: 'rescue_min_signals',
  cuu_ho_nguong: 'rescue_threshold',
  ngu_nghia_bat: 'semantic_enabled',
  ngu_nghia_nguong: 'semantic_threshold',
  suy_luan_bat: 'reasoning_enabled',
  suy_luan_ngan_sach: 'reasoning_budget',
  suy_luan_muc_cong_suc: 'reasoning_effort',
  so_buoc_toi_da: 'max_steps',
  chan_buoc_nhac: 'step_guard_warn',
  chan_buoc_dung: 'step_guard_stop',
};

/** Giá trị (không phải khoá) cũng có chữ tiếng Việt ở đúng hai chỗ. */
const SETTING_VALUES = {
  suy_luan_muc_cong_suc: {},           // 'low'|'medium'|… — vốn đã tiếng Anh
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw new Error(`${path.basename(file)} không đọc được: ${e.message}`);
  }
}

function writeJson(file, data) {
  if (DRY) return;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);   // ghi nguyên tử, cùng cách guideExperience.js vẫn ghi
}

function renameKeys(obj, map) {
  const out = {};
  let hits = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (map[k]) { out[map[k]] = v; hits += 1; } else { out[k] = v; }
  }
  return { out, hits };
}

function migrateExperience() {
  const oldFile = path.join(DIR, 'kinh-nghiem.json');
  const newFile = path.join(DIR, 'experience.json');

  if (fs.existsSync(newFile)) return console.log('experience.json đã có — bỏ qua.');
  const store = readJson(oldFile);
  if (store === undefined) return console.log('kinh-nghiem.json không có — bỏ qua (kho chưa dùng).');

  let records = 0;
  let keys = 0;
  const next = {};
  for (const [company, list] of Object.entries(store)) {
    next[company] = (Array.isArray(list) ? list : []).map((rec) => {
      const { out, hits } = renameKeys(rec, EXPERIENCE_KEYS);
      keys += hits;
      records += 1;
      if (out.source === 'tu_dong') out.source = 'auto';
      if (Array.isArray(out.steps)) {
        out.steps = out.steps.map((s) => (s && typeof s === 'object' ? renameKeys(s, STEP_KEYS).out : s));
      }
      return out;
    });
  }

  console.log(`kinh-nghiem.json → experience.json : ${records} bản ghi, ${keys} khoá đổi tên`);
  writeJson(newFile, next);
  if (!DRY) fs.renameSync(oldFile, `${oldFile}.pre-en-${STAMP}.bak`);
}

function migrateSettings() {
  const oldFile = path.join(DIR, 'cai-dat.json');
  const newFile = path.join(DIR, 'settings.json');

  if (fs.existsSync(newFile)) return console.log('settings.json đã có — bỏ qua.');
  const overrides = readJson(oldFile);
  if (overrides === undefined) return console.log('cai-dat.json không có — bỏ qua (chưa ai chỉnh gì).');

  const { out, hits } = renameKeys(overrides, SETTING_KEYS);
  for (const [key, valueMap] of Object.entries(SETTING_VALUES)) {
    const newKey = SETTING_KEYS[key] || key;
    if (out[newKey] in valueMap) out[newKey] = valueMap[out[newKey]];
  }

  console.log(`cai-dat.json → settings.json : ${Object.keys(overrides).length} khoá đã lưu, ${hits} khoá đổi tên`);
  writeJson(newFile, out);
  if (!DRY) fs.renameSync(oldFile, `${oldFile}.pre-en-${STAMP}.bak`);
}

if (!fs.existsSync(DIR)) {
  console.log(`Không có ${DIR} — chưa từng chạy trợ lý, không có gì để di trú.`);
  process.exit(0);
}

console.log(DRY ? '— THỬ KHÔNG GHI —' : `— DI TRÚ ${DIR} —`);
migrateExperience();
migrateSettings();
console.log(DRY ? 'Chạy lại không kèm --dry-run để ghi thật.' : 'Xong. Tệp cũ giữ lại với đuôi .pre-en-*.bak');
