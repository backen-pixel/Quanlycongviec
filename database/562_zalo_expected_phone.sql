-- ═══════════════════════════════════════════════════════════════
-- 562. ZALO CÁ NHÂN — chốt trước số điện thoại dự kiến của tài khoản
--
-- Mã QR đăng nhập Zalo Web là mã CHUNG: ai quét trước thì tài khoản của người
-- đó vào ô đó. Không kiểm tra thì quét nhầm là tin nhắn riêng của người khác
-- chảy vào CRM.
--
-- Khai báo trước số dự kiến; sau khi quét, cổng đối chiếu với số thật lấy từ
-- fetchAccountInfo. Lệch thì huỷ phiên ngay, không lưu gì.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS expected_phone TEXT;

COMMENT ON COLUMN zalo_oa_accounts.expected_phone IS
  'Số điện thoại dự kiến của tài khoản Zalo. Quét QR bằng số khác thì cổng huỷ phiên.';
