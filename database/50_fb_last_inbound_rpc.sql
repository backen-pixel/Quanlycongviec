-- Hỗ trợ lọc contact: KH không có tin inbound trong X giờ (giảm tải đồng bộ tự động)
CREATE OR REPLACE FUNCTION public.fb_last_inbound_at_for_contacts(contact_ids uuid[])
RETURNS TABLE (contact_id uuid, last_inbound_at timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT m.contact_id, max(m.created_at) AS last_inbound_at
  FROM facebook_messages m
  WHERE m.contact_id = ANY(contact_ids)
    AND m.direction = 'inbound'
  GROUP BY m.contact_id;
$$;
