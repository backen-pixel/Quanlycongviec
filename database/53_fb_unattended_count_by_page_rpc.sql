-- Đếm "chưa chăm" (tin cuối là của khách, NV chưa trả lời sau đó) GROUP BY từng page_id — dùng cho
-- bảng "Theo Page" ở Analytics, tránh phải gọi fb_unattended_count() nhiều lần (mỗi lần 1 page).
CREATE OR REPLACE FUNCTION public.fb_unattended_count_by_page(p_page_ids text[] DEFAULT NULL)
RETURNS TABLE (page_id text, unattended_count bigint)
LANGUAGE sql
STABLE
AS $$
  WITH scoped_contacts AS (
    SELECT id, page_id FROM facebook_contacts
    WHERE p_page_ids IS NULL OR page_id = ANY(p_page_ids)
  ),
  inb AS (
    SELECT m.contact_id, max(m.created_at) AS last_inbound
    FROM facebook_messages m
    WHERE m.direction = 'inbound' AND m.contact_id IN (SELECT id FROM scoped_contacts)
    GROUP BY m.contact_id
  ),
  outb AS (
    SELECT m.contact_id, max(m.created_at) AS last_outbound
    FROM facebook_messages m
    WHERE m.direction = 'outbound' AND m.contact_id IN (SELECT id FROM scoped_contacts)
    GROUP BY m.contact_id
  )
  SELECT sc.page_id, count(*)::bigint AS unattended_count
  FROM scoped_contacts sc
  JOIN inb ON inb.contact_id = sc.id
  LEFT JOIN outb ON outb.contact_id = sc.id
  WHERE outb.last_outbound IS NULL OR outb.last_outbound < inb.last_inbound
  GROUP BY sc.page_id;
$$;
