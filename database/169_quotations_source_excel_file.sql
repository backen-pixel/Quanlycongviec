-- File Excel gốc đã upload khi import báo giá (xem lại từ chi tiết deal / form báo giá)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS source_excel_file_url TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS source_excel_file_name TEXT;

COMMENT ON COLUMN quotations.source_excel_file_url IS 'URL file Excel gốc (Supabase Storage) khi tạo BG từ import';
COMMENT ON COLUMN quotations.source_excel_file_name IS 'Tên file Excel gốc';
