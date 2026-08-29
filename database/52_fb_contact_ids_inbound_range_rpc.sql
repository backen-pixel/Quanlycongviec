-- Trả về contact_id có ÍT NHẤT 1 tin INBOUND (khách nhắn) trong khoảng [p_from, p_to].
-- Dùng để lọc danh sách hội thoại theo ngày cho đúng "tin mới đổ về", không lẫn tin NV "chăm lại" (outbound)
-- vốn làm bump facebook_contacts.last_message_at.
CREATE OR REPLACE FUNCTION public.fb_contact_ids_with_inbound_in_range(
  p_page_ids text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT m.contact_id
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE m.direction = 'inbound'
    AND (p_from IS NULL OR m.created_at >= p_from)
    AND (p_to IS NULL OR m.created_at <= p_to)
    AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids));
$$;
