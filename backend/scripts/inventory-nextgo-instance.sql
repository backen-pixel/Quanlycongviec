-- Kiểm kê NextGo nguồn — chỉ đọc. Company vận hành:
-- 87479a83-1145-43b7-b090-3e40812cb5a9
-- Không dùng bản clone cùng DB (842cff41 / tenant slug=nextgo).

\set cid '87479a83-1145-43b7-b090-3e40812cb5a9'

SELECT id, name, short_name, tenant_id, is_active
FROM companies
WHERE id = :'cid' OR name ILIKE '%NextGo%';
