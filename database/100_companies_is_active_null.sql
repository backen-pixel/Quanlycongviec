-- CRM / ecosystem: công ty có is_active NULL bị loại bởi .eq('is_active', true) → danh sách rỗng.
-- Chuẩn hóa: NULL coi như đang hoạt động.

UPDATE companies SET is_active = true WHERE is_active IS NULL;

COMMENT ON COLUMN companies.is_active IS 'false = ngừng hoạt động; true hoặc mặc định = hiển thị trong CRM và API companies';
