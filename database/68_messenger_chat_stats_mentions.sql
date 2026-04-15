-- Thống kê tin theo nhóm (dùng trong GET /messenger/groups)
CREATE OR REPLACE FUNCTION public.messenger_group_list_stats(p_group_ids uuid[])
RETURNS TABLE (group_id uuid, message_count bigint, last_message_at timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT m.group_id,
         COUNT(*)::bigint AS message_count,
         MAX(m.created_at) AS last_message_at
  FROM messenger_group_messages m
  WHERE p_group_ids IS NOT NULL
    AND cardinality(p_group_ids) > 0
    AND m.group_id = ANY(p_group_ids)
  GROUP BY m.group_id;
$$;

-- Gắn thẻ @ (danh sách user_id được nhắc)
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS mention_user_ids uuid[] DEFAULT '{}';
