/**
 * ============================================================================
 * Query guard phải kêu khi truy vấn bị TỪ CHỐI CẢ CÂU
 * ============================================================================
 *
 * Không chạm mạng, không chạm DB: dựng client Supabase thật với `fetch` giả trả
 * đúng thân lỗi PostgREST. Vẫn đi qua đường thật của guard (patch prototype
 * `then`, đọc builder.url, dựng call site), nên vẫn bắt được nếu guard hỏng.
 *
 * Vì sao cần: `const { data } = await supabase...` (không đọc `error`) biến một
 * câu bị huỷ thành `data === undefined` rồi trả [] — tính năng chết câm. Đó là
 * cách 29 cột sai sống nhiều tháng, và cách role 'logistics' làm trống danh
 * sách user xưởng. Guard bắt tại chỗ nên hiện trên log Render trong vài phút.
 *
 * Chạy:  npm run test:query-guard
 */

const {
  installSupabaseQueryGuard,
  getSupabaseQueryGuardReport,
} = require('../src/helpers/supabaseQueryGuard');

if (!installSupabaseQueryGuard()) {
  console.error('THẤT BẠI — không cài được query guard (SUPABASE_QUERY_GUARD=0?)');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');

/** Trả về một `fetch` giả luôn đáp cùng một thân JSON. */
function fetchGia(body, status = 200) {
  return async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientVoi(body, status) {
  return createClient('https://vi-du.supabase.co', 'khoa-gia', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchGia(body, status) },
  });
}

const loiPostgrest = (code, message) => ({ code, message, details: null, hint: null });

let hong = 0;
function kiemTra(nhan, dieuKien, chiTiet) {
  if (dieuKien) { console.log(`  ĐẠT   ${nhan}`); return; }
  console.error(`  HỎNG  ${nhan}${chiTiet ? ` — ${chiTiet}` : ''}`);
  hong += 1;
}

(async () => {
  console.log('Query guard — bắt lỗi giết cả câu (offline)\n');

  // 1) Cột không tồn tại khi ĐỌC → 42703
  await clientVoi(loiPostgrest('42703', 'column users.cot_xyz does not exist'), 400)
    .from('users').select('cot_xyz').limit(1);

  // 2) Sai kiểu enum → 22P02 (đúng lớp lỗi role 'logistics')
  await clientVoi(loiPostgrest('22P02', 'invalid input value for enum user_role: "logistics"'), 400)
    .from('users').select('id').in('role', ['logistics']);

  // 3) Cột không tồn tại khi GHI → PGRST204 (đường insert/update)
  await clientVoi(loiPostgrest('PGRST204', "Column 'cot_xyz' of relation 'users' does not exist"), 400)
    .from('users').update({ cot_xyz: 1 }).eq('id', '0');

  // 4) Thiếu quan hệ embed → PGRST200
  await clientVoi(loiPostgrest('PGRST200', "Could not find a relationship between 'a' and 'b'"), 400)
    .from('crm_leads').select('id, khong_co_quan_he(*)').limit(1);

  // 5) Hồi quy: hai cảnh báo cũ vẫn phải chạy
  await clientVoi(Array.from({ length: 1000 }, (_, i) => ({ id: i })), 200)
    .from('notifications').select('id');
  await clientVoi([], 200)
    .from('facebook_contacts').select('id')
    .in('id', Array.from({ length: 700 }, (_, i) => `id-${i}`));

  const bc = getSupabaseQueryGuardReport();
  const loai = new Set(bc.map((r) => r.kind));
  console.log(`\nGuard ghi nhận ${bc.length} phát hiện:`);
  for (const r of bc) {
    console.log(`  ${r.kind.padEnd(28)} ${r.table.padEnd(20)} ${r.site}`);
  }
  console.log('');

  kiemTra('42703 — cột không tồn tại khi ĐỌC', loai.has('COT-KHONG-TON-TAI'));
  kiemTra('22P02 — giá trị sai kiểu enum', loai.has('GIA-TRI-SAI-KIEU'));
  kiemTra('PGRST204 — cột không tồn tại khi GHI', loai.has('COT-KHONG-TON-TAI-KHI-GHI'));
  kiemTra('PGRST200 — thiếu quan hệ embed', loai.has('THIEU-QUAN-HE-EMBED'));
  kiemTra('hồi quy: vẫn bắt cắt 1000 dòng', loai.has('NGHI-BI-CAT-1000-DONG'));
  kiemTra('hồi quy: vẫn bắt filter id quá dài', loai.has('FILTER-ID-QUA-DAI'));
  kiemTra(
    'chỉ đúng tên bảng, không phải "?"',
    bc.every((r) => r.table && r.table !== '?'),
    bc.map((r) => r.table).join(' | '),
  );
  kiemTra(
    'chỉ đúng file gọi, không phải "khong-xac-dinh"',
    bc.every((r) => r.site.includes('query-guard-42703-smoke')),
    bc.map((r) => `${r.kind}=${r.site}`).join(' | '),
  );

  console.log(hong ? `\nTHẤT BẠI — ${hong} mục` : '\nĐẠT — guard kêu đúng, đúng bảng, đúng chỗ gọi');
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error('NGOẠI LỆ:', e); process.exit(1); });
