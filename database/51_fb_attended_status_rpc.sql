-- "Đã chăm / chưa chăm": so sánh thời điểm tin inbound (khách) gần nhất với tin outbound (NV) gần nhất theo từng contact.
CREATE OR REPLACE FUNCTION public.fb_attended_status_for_contacts(contact_ids uuid[])
RETURNS TABLE (
  contact_id uuid,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_outbound_by uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.contact_id,
    max(m.created_at) FILTER (WHERE m.direction = 'inbound') AS last_inbound_at,
    max(m.created_at) FILTER (WHERE m.direction = 'outbound') AS last_outbound_at,
    (array_agg(m.sent_by ORDER BY m.created_at DESC) FILTER (WHERE m.direction = 'outbound' AND m.sent_by IS NOT NULL))[1] AS last_outbound_by
  FROM facebook_messages m
  WHERE m.contact_id = ANY(contact_ids)
  GROUP BY m.contact_id;
$$;

-- Đếm nhanh số hội thoại "chưa chăm" (tin cuối là của khách, NV chưa trả lời sau đó), lọc theo page_id nếu cần.
CREATE OR REPLACE FUNCTION public.fb_unattended_count(p_page_ids text[] DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH scoped_contacts AS (
    SELECT id FROM facebook_contacts
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
  SELECT count(*)::bigint
  FROM inb
  LEFT JOIN outb ON outb.contact_id = inb.contact_id
  WHERE outb.last_outbound IS NULL OR outb.last_outbound < inb.last_inbound;
$$;
