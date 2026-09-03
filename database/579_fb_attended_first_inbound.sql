-- 579: Thêm first_inbound_at vào RPC chăm sóc — để lọc «Hội thoại mới» / «Cũ nhắn lại»
-- khớp định nghĩa tin inbound đầu tiên (không dùng last_message_at / created_at contact).

DROP FUNCTION IF EXISTS public.fb_attended_status_for_contacts(uuid[]);

CREATE OR REPLACE FUNCTION public.fb_attended_status_for_contacts(contact_ids uuid[])
RETURNS TABLE (
  contact_id uuid,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_outbound_by uuid,
  first_inbound_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.contact_id,
    max(m.created_at) FILTER (WHERE m.direction = 'inbound') AS last_inbound_at,
    max(m.created_at) FILTER (WHERE m.direction = 'outbound') AS last_outbound_at,
    (array_agg(m.sent_by ORDER BY m.created_at DESC) FILTER (WHERE m.direction = 'outbound' AND m.sent_by IS NOT NULL))[1] AS last_outbound_by,
    min(m.created_at) FILTER (WHERE m.direction = 'inbound') AS first_inbound_at
  FROM facebook_messages m
  WHERE m.contact_id = ANY(contact_ids)
  GROUP BY m.contact_id;
$$;
