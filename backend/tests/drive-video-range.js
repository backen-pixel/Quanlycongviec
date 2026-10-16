/**
 * Drive — phát video phải trả HTTP 206 KÈM `Content-Range`.
 *
 * Từ googleapis v173 (gaxios chạy trên fetch), `res.headers` là đối tượng `Headers` của
 * Web API, nên `headers['content-range']` trả undefined. Route `/drive/files/:id/stream`
 * khi đó trả 206 mà KHÔNG có Content-Range — trình duyệt coi là phản hồi hỏng và bỏ,
 * thẻ <video> đứng ở 0:00. Phép thử này khoá lại hành vi đó.
 *
 *   node tests/drive-video-range.js            # offline
 *   node tests/drive-video-range.js --that     # gọi Google Drive thật
 */
require('dotenv').config();
const { _docHeader } = require('../src/services/googleDrive');

let dat = 0; let truot = 0;
const kiem = (t, ok, ct) => { console.log(`${ok ? '✅' : '❌'} ${t}`); if (ok) dat++; else { truot++; if (ct !== undefined) console.log('   ', ct); } };

// Kiểu MỚI: Headers của Web API — chỉ đọc được qua .get()
const kieuMoi = new Headers({ 'content-range': 'bytes 0-99999/11191794', 'content-length': '100000' });
kiem('đọc được Content-Range từ Headers (googleapis v173+)',
  _docHeader(kieuMoi, 'content-range') === 'bytes 0-99999/11191794',
  _docHeader(kieuMoi, 'content-range'));
kiem('đọc được Content-Length từ Headers', _docHeader(kieuMoi, 'content-length') === '100000');
kiem('cách đọc CŨ trên Headers trả undefined — đúng gốc của lỗi',
  kieuMoi['content-range'] === undefined);

// Kiểu CŨ: object thường — vẫn phải chạy
const kieuCu = { 'content-range': 'bytes 0-5/6', 'content-length': '6' };
kiem('vẫn đọc được object thường (phòng khi quay lại kiểu cũ)',
  _docHeader(kieuCu, 'content-range') === 'bytes 0-5/6');
kiem('header không tồn tại → undefined', _docHeader(kieuCu, 'x-khong-co') === undefined);
kiem('headers null/undefined → không nổ',
  _docHeader(null, 'content-range') === undefined && _docHeader(undefined, 'a') === undefined);

if (!process.argv.includes('--that')) {
  console.log(`\n${dat} đạt · ${truot} trượt  (thêm --that để gọi Google Drive thật)`);
  process.exit(truot ? 1 : 0);
}

const gdrive = require('../src/services/googleDrive');
const { supabase } = require('../src/config/supabase');

(async () => {
  kiem('Google Drive có cấu hình', gdrive.isConfigured());
  const { data } = await supabase.from('drive_files')
    .select('id,name,google_file_id,size_bytes')
    .like('mime_type', 'video/%').not('google_file_id', 'is', null)
    .is('trashed_at', null).limit(1);
  if (!data?.length) { console.log('… không có video nào để thử'); process.exit(truot ? 1 : 0); }
  const f = data[0];
  console.log(`\nThử trên: ${f.name} (${(f.size_bytes / 1048576).toFixed(1)} MB)`);

  const r = await gdrive.getDownloadStream(f.google_file_id, { range: 'bytes=0-99999' });
  try { r.stream.destroy(); } catch { /* bỏ qua */ }
  console.log(`   status=${r.status}  content-range=${r.contentRange}  content-length=${r.contentLength}`);
  kiem('Google trả 206 cho yêu cầu range', r.status === 206, r.status);
  kiem('CÓ Content-Range — nếu thiếu thì trình duyệt bỏ phản hồi 206',
    typeof r.contentRange === 'string' && r.contentRange.startsWith('bytes '), r.contentRange);
  kiem('CÓ Content-Length', !!r.contentLength, r.contentLength);

  console.log(`\n${dat} đạt · ${truot} trượt`);
  process.exit(truot ? 1 : 0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
