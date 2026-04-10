-- ═══════════════════════════════════════════════════════════════════════════
-- Gộp nguồn Facebook (crm_sources) + trỏ lại crm_leads
-- ═══════════════════════════════════════════════════════════════════════════
-- Vì sao có hàng trăm dòng "[FB] NHÔM KINH PHÚC ĐẠT"?
--   resolveFacebookSourceId (facebook.js) từng dùng .single() khi tìm theo tên legacy.
--   Nhiều dòng trùng tên → PostgREST không trả đúng 1 row → logic rơi xuống INSERT mới mỗi lần.
--
-- Chạy trên Supabase SQL Editor. Nên backup trước. Có thể bọc BEGIN … ROLLBACK để xem số dòng
-- ảnh hưởng, rồi chạy lại với COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Đảm bảo mỗi facebook_pages đang active có đúng 1 dòng nguồn chuẩn:
--     tên = '[FB:<page_id>] <page_name>'
INSERT INTO crm_sources (name, is_active)
SELECT '[FB:' || fp.page_id::text || '] ' || trim(fp.page_name), true
FROM facebook_pages fp
WHERE fp.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM crm_sources s
    WHERE s.name = '[FB:' || fp.page_id::text || '] ' || trim(fp.page_name)
  );

-- ── 2) Bảng tạm: page_id → uuid nguồn chuẩn
CREATE TEMP TABLE _fb_canonical ON COMMIT DROP AS
SELECT
  fp.page_id::text AS page_id,
  (
    SELECT s.id
    FROM crm_sources s
    WHERE s.name = '[FB:' || fp.page_id::text || '] ' || trim(fp.page_name)
    ORDER BY s.id
    LIMIT 1
  ) AS canonical_id
FROM facebook_pages fp
WHERE fp.is_active = true;

-- (Tuỳ chọn) Kiểm tra: SELECT * FROM _fb_canonical WHERE canonical_id IS NULL;

-- ── 3) Lead có facebook_contacts → map đúng theo page
UPDATE crm_leads l
SET
  source_id = bc.canonical_id,
  updated_at = now()
FROM facebook_contacts fc
JOIN _fb_canonical bc ON bc.page_id = fc.page_id::text
WHERE
  l.id = fc.lead_id
  AND bc.canonical_id IS NOT NULL
  AND (l.source_id IS DISTINCT FROM bc.canonical_id);

-- ── 4) Lead đang trỏ nguồn dạng legacy "[FB] <tên page>" (không có page_id trong tên)
--     → gán sang nguồn chuẩn của page có cùng tên (so khớp không phân biệt hoa thường)
UPDATE crm_leads l
SET
  source_id = bc.canonical_id,
  updated_at = now()
FROM crm_sources s
JOIN facebook_pages fp ON fp.is_active = true
JOIN _fb_canonical bc ON bc.page_id = fp.page_id::text
WHERE
  l.source_id = s.id
  AND bc.canonical_id IS NOT NULL
  AND (l.source_id IS DISTINCT FROM bc.canonical_id)
  AND s.name ~ '^\[FB\] '
  AND s.name !~ '^\[FB:[0-9]+]'
  AND lower(trim(regexp_replace(s.name, '^\[FB\]\s*', '', 'i'))) = lower(trim(fp.page_name));

-- ── 5) Ghi default_source_id cho page (lần sau webhook không phải tra crm_sources)
UPDATE facebook_pages fp
SET
  default_source_id = bc.canonical_id,
  updated_at = now()
FROM _fb_canonical bc
WHERE
  fp.page_id::text = bc.page_id
  AND bc.canonical_id IS NOT NULL
  AND (fp.default_source_id IS DISTINCT FROM bc.canonical_id);

-- ── 6) Ẩn nguồn FB không còn lead nào trỏ tới (giữ bản ghi để không vỡ FK lịch sử)
UPDATE crm_sources s
SET is_active = false
WHERE
  s.is_active = true
  AND (s.name LIKE '[FB%' OR lower(s.name) LIKE '%facebook%')
  AND NOT EXISTS (SELECT 1 FROM crm_leads l WHERE l.source_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM facebook_pages fp WHERE fp.default_source_id = s.id);

-- Xem nguồn còn active:
-- SELECT id, name, is_active FROM crm_sources WHERE name LIKE '[FB%' ORDER BY name;

COMMIT;
