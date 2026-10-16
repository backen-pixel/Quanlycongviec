/**
 * Gia hạn access_token Zalo OA bằng refresh_token đang lưu.
 *
 * Mặc định CHỈ THỬ (không gọi Zalo). Thêm --ghi để gọi thật.
 * Luôn sao lưu token hiện tại ra backend/uploads/ trước khi gọi.
 *
 * Lưu ý: refresh_token của Zalo DÙNG MỘT LẦN — gọi thành công thì token cũ bị huỷ.
 * Nếu Zalo trả lỗi, helper chỉ ghi last_token_error, KHÔNG xoá token cũ.
 *
 * Chạy: cd backend && node scripts/gia-han-token-zalo.js [--ghi] [--oa=<oa_id>]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { refreshZaloOaTokens } = require('../src/helpers/zaloOaToken');

const GHI = process.argv.includes('--ghi');
const locOa = (process.argv.find((a) => a.startsWith('--oa=')) || '').split('=')[1] || null;

const han = (t) => {
  if (!t) return 'không rõ';
  const ms = new Date(t).getTime() - Date.now();
  return ms < 0 ? `HẾT HẠN ${Math.round(-ms / 86400000)} ngày trước` : `còn ${Math.round(ms / 86400000)} ngày`;
};

(async () => {
  let q = supabase.from('zalo_oa_accounts')
    .select('id, oa_id, oa_name, app_id, secret_key, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, token_refreshed_at, last_token_error');
  if (locOa) q = q.eq('oa_id', String(locOa));
  const { data: oas, error } = await q;
  if (error) { console.log('LỖI đọc:', error.message); return; }
  if (!oas?.length) { console.log('Không có OA nào khớp.'); return; }

  console.log(GHI ? '*** CHẾ ĐỘ GHI — sẽ gọi Zalo thật ***\n' : '*** CHỈ THỬ — chưa gọi Zalo. Thêm --ghi để chạy thật ***\n');

  if (GHI) {
    const f = path.join(__dirname, '../uploads', `_rollback_zalo_token_${Date.now()}.json`);
    fs.writeFileSync(f, JSON.stringify(oas, null, 2), 'utf8');
    console.log(`Đã sao lưu token hiện tại: ${f}\n`);
  }

  for (const a of oas) {
    console.log(`=== ${a.oa_name} (oa_id=${a.oa_id}) ===`);
    console.log(`  trước: access ${han(a.access_token_expires_at)} · refresh ${han(a.refresh_token_expires_at)}`);
    console.log(`  lỗi gần nhất: ${a.last_token_error || '(không có)'}`);

    if (!GHI) { console.log('  → bỏ qua (chưa bật --ghi)\n'); continue; }

    const kq = await refreshZaloOaTokens(a, { reason: 'thu-cong' });
    if (kq.ok) {
      const { data: sau } = await supabase.from('zalo_oa_accounts')
        .select('access_token_expires_at, refresh_token_expires_at').eq('id', a.id).maybeSingle();
      console.log(`  ✅ THÀNH CÔNG — access ${han(sau?.access_token_expires_at)} · refresh ${han(sau?.refresh_token_expires_at)}\n`);
    } else {
      console.log(`  ❌ THẤT BẠI — error=${kq.error}${kq.zalo_error != null ? ` zalo=${kq.zalo_error}` : ''}  ${kq.message || ''}\n`);
    }
  }
})().catch((e) => console.log('NGOẠI LỆ:', e.message));
