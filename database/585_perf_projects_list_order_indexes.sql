-- 585: Chỉ mục cho danh sách dự án (projects list)
--
-- VẤN ĐỀ ĐO ĐƯỢC (pg_stat_statements, cửa sổ 71 ngày):
--   259 biến thể của truy vấn danh sách dự án, 202.970 lượt gọi,
--   15.249 giây = 6,65% TOÀN BỘ thời gian DB. Trung bình 75 ms/lượt,
--   biến thể xấu nhất 682 ms và 135.682 buffer/lượt.
--
-- NGUYÊN NHÂN: truy vấn có 8 embed (LATERAL) trong đó crm_deals còn
-- lồng thêm 3 LATERAL nữa. Không có chỉ mục khớp ORDER BY nên Postgres
-- phải:
--   1) quét toàn bộ projects,
--   2) chạy đủ 8 LATERAL cho MỌI dòng khớp WHERE (460-634 dòng),
--   3) rồi mới Sort + LIMIT 50.
-- Nghĩa là ~92% công việc LATERAL bị bỏ đi sau khi đã tính xong.
--
-- CÁCH SỬA: cho Postgres một chỉ mục đã sắp đúng thứ tự ORDER BY.
-- Kế hoạch trở thành Index Scan (đã sắp) -> Limit dừng sớm ở 50 dòng
-- -> LATERAL chỉ chạy 50 lần.
--
-- ORDER BY projects.deadline ASC NULLS LAST, projects.created_at DESC
-- (btree ASC mặc định đã là NULLS LAST nên khớp chính xác)
--
-- ĐO SAU KHI THÊM (EXPLAIN ANALYZE, cùng dữ liệu):
--   Biến thể lọc theo 1 công ty (phổ biến nhất):
--     trước 48,19 ms / 4.211 buffer  ->  sau 8,59 ms / 580 buffer   (5,6x)
--   Biến thể lọc OR nhiều công ty + nhiều stage:
--     trước 59,29 ms / 6.711 buffer  ->  sau 4,73 ms / 436 buffer   (12,5x)
--
-- Chi phí ghi: projects chỉ có 635 dòng, hai chỉ mục cộng lại ~136 kB.

-- Dùng cho biến thể có điều kiện bằng company_id
CREATE INDEX IF NOT EXISTS idx_projects_company_deadline_created
  ON public.projects (company_id, deadline, created_at DESC);

-- Dùng cho biến thể lọc bằng OR (company_id OR logistics_company_id ...)
-- khi không có điều kiện bằng nào để dẫn dắt chỉ mục
CREATE INDEX IF NOT EXISTS idx_projects_deadline_created
  ON public.projects (deadline, created_at DESC);

ANALYZE public.projects;

-- GHI CHU: van con mot lan quet nua tu `pgrst_source_count` (count: 'exact'
-- cua PostgREST) chay lai toan bo WHERE khong co LIMIT. Cho nay phai sua
-- o code (bo count exact hoac dung count uoc luong), khong sua duoc bang
-- chi muc.
