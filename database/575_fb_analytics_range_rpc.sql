-- 575 — RPC lấy contact/tin Facebook theo khoảng ngày + page (tab Phân tích).
-- Thay vòng lặp PostgREST theo từng khúc contact_id (~30s) bằng 1 query SQL (~30ms + phân trang).

CREATE INDEX IF NOT EXISTS idx_fb_contacts_page_created
  ON public.facebook_contacts (page_id, created_at);

CREATE OR REPLACE FUNCTION public.fb_analytics_contacts_in_range(
  p_page_ids text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  phone text,
  lead_id uuid,
  page_id text,
  created_at timestamptz,
  customer_phone text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.phone,
    c.lead_id,
    c.page_id,
    c.created_at,
    cu.phone AS customer_phone
  FROM facebook_contacts c
  LEFT JOIN customers cu ON cu.id = c.customer_id
  WHERE (p_from IS NULL OR c.created_at >= p_from)
    AND (p_to IS NULL OR c.created_at < p_to)
    AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids))
  ORDER BY c.id ASC
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
$$;

CREATE OR REPLACE FUNCTION public.fb_analytics_messages_in_range(
  p_page_ids text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  direction text,
  created_at timestamptz,
  contact_id uuid,
  sent_by uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT m.id, m.direction, m.created_at, m.contact_id, m.sent_by
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE (p_from IS NULL OR m.created_at >= p_from)
    AND (p_to IS NULL OR m.created_at < p_to)
    AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids))
  ORDER BY m.created_at ASC, m.id ASC
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
$$;

GRANT EXECUTE ON FUNCTION public.fb_analytics_contacts_in_range(text[], timestamptz, timestamptz, integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fb_analytics_messages_in_range(text[], timestamptz, timestamptz, integer, integer)
  TO authenticated, service_role;
