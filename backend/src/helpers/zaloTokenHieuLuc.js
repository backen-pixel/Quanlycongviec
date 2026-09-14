const { supabase } = require('../config/supabase');

/**
 * ACCESS TOKEN HIỆU LỰC cho Zalo ZNS — NGUỒN DUY NHẤT là bảng `zalo_oa_accounts`.
 *
 * Trước đây token bị chép thành bản thứ hai trong app_settings.zalo_oa_notify. OA xoay vòng
 * token thì bản chép nằm lại, phải đi sửa tay từng chỗ. Nay mọi nơi gửi ZNS đều hỏi hàm này:
 * nó gọi ensureZaloOaAccessToken() nên tự refresh khi token sắp hết hạn, và chỉ khi OA lỗi
 * mới lùi về token đã lưu trong app_settings (cho công ty chưa khai báo OA).
 *
 * CỐ Ý không ghi ngược token OA vào app_settings — đẻ thêm một bản sao nữa là quay lại đúng
 * bài toán đang gỡ.
 *
 * @param {object|null} settings — cấu hình zalo_oa_notify đã đọc (dùng access_token làm dự phòng,
 *                                 và oa_id nếu muốn chỉ định OA cụ thể).
 * @returns {Promise<{token: string, nguon: string, oa_id: string}>}
 */
async function getZaloAccessTokenHieuLuc(settings = null) {
  const daLuu = String(settings?.access_token || '');
  try {
    const { ensureZaloOaAccessToken } = require('./zaloOaToken');
    let oaId = String(settings?.oa_id || '').trim();
    if (!oaId) {
      const { data } = await supabase
        .from('zalo_oa_accounts')
        .select('oa_id')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);
      oaId = String(data?.[0]?.oa_id || '');
    }
    if (oaId) {
      const r = await ensureZaloOaAccessToken(oaId);
      if (r?.ok && r.accessToken) {
        return { token: String(r.accessToken), nguon: 'zalo_oa_accounts', oa_id: oaId };
      }
      console.warn('[Zalo OA] Không lấy được token từ zalo_oa_accounts:', r?.message || r?.error || '');
    }
  } catch (e) {
    console.warn('[Zalo OA] getZaloAccessTokenHieuLuc:', e.message);
  }
  return { token: daLuu, nguon: daLuu ? 'app_settings_du_phong' : 'khong_co', oa_id: '' };
}

module.exports = { getZaloAccessTokenHieuLuc };
