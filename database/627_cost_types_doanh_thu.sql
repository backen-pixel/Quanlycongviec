-- 627: Nút tích có thể sinh ra DOANH THU, không chỉ chi phí.
--
-- Ví dụ: nút tích «Upload Excel Báo giá» ở CRM — giá vốn của báo giá là chi phí, còn
-- tổng tiền báo giá là doanh thu. Hai số này phải tách hẳn, vì entries.total (giá vốn)
-- mà cộng nhầm doanh thu vào thì mọi công thức lợi nhuận đều sai dấu.
--
-- Dòng sổ của nút tích doanh thu mang source_key `doanhthu.<mã>` thay vì `excel.<mã>`,
-- và buildFormulaContext KHÔNG cộng nó vào entries.total hay vào nhóm chi phí nào.
--
-- Additive: cột mới có default 'chi_phi' nên mọi nút tích đang có giữ nguyên ý nghĩa.

BEGIN;

ALTER TABLE cost_types
  ADD COLUMN IF NOT EXISTS value_kind TEXT NOT NULL DEFAULT 'chi_phi';

ALTER TABLE cost_types
  DROP CONSTRAINT IF EXISTS cost_types_value_kind_chk;
ALTER TABLE cost_types
  ADD CONSTRAINT cost_types_value_kind_chk CHECK (value_kind IN ('chi_phi', 'doanh_thu'));

COMMENT ON COLUMN cost_types.value_kind IS
  'chi_phi = số này là chi phí (vào entries.total); doanh_thu = số bán ra, KHÔNG cộng vào giá vốn.';

COMMIT;
