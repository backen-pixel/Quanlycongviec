-- Preview tin cuối cho danh sách nhóm (ảnh, tệp, thu hồi) + last_user_id
CREATE OR REPLACE FUNCTION public.messenger_group_list_stats_v3(
  p_group_ids uuid[],
  p_user_id   uuid
)
RETURNS TABLE (
  group_id        uuid,
  message_count   bigint,
  last_message_at timestamptz,
  last_message    text,
  last_user_id    uuid,
  unread_count    bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.group_id,
    COUNT(*)::bigint AS message_count,
    MAX(m.created_at) AS last_message_at,
    (
      SELECT CASE
        WHEN COALESCE(mm.recalled_at, NULL) IS NOT NULL OR COALESCE(mm.is_recalled, false) THEN
          CASE
            WHEN COALESCE(mm.recalled_by, mm.user_id) = p_user_id THEN 'Đã thu hồi tin nhắn'
            ELSE 'Tin nhắn bị thu hồi'
          END
        WHEN BTRIM(COALESCE(mm.content, '')) LIKE ':sticker:%' THEN
          COALESCE(NULLIF(BTRIM(SUBSTRING(BTRIM(mm.content) FROM 10)), ''), 'Sticker')
        WHEN BTRIM(COALESCE(mm.content, '')) <> '' THEN LEFT(BTRIM(mm.content), 100)
        WHEN COALESCE(mm.attachment_mime, '') ILIKE 'image/%' THEN '📷 Ảnh'
        WHEN COALESCE(mm.attachment_mime, '') ILIKE 'video/%' THEN '🎬 Video'
        WHEN COALESCE(mm.attachment_mime, '') ILIKE 'audio/%' THEN '🎤 Âm thanh'
        WHEN COALESCE(mm.attachment_mime, '') <> '' THEN
          '📎 ' || COALESCE(NULLIF(BTRIM(mm.attachment_name), ''), 'Tệp đính kèm')
        ELSE NULL
      END
      FROM messenger_group_messages mm
      WHERE mm.group_id = m.group_id
        AND COALESCE(mm.is_system, false) = false
      ORDER BY mm.created_at DESC
      LIMIT 1
    ) AS last_message,
    (
      SELECT mm.user_id
      FROM messenger_group_messages mm
      WHERE mm.group_id = m.group_id
        AND COALESCE(mm.is_system, false) = false
      ORDER BY mm.created_at DESC
      LIMIT 1
    ) AS last_user_id,
    COUNT(*) FILTER (
      WHERE m.created_at > COALESCE(
        (SELECT r.last_read_at FROM messenger_read_receipts r
         WHERE r.group_id = m.group_id AND r.user_id = p_user_id),
        '1970-01-01'::timestamptz
      )
      AND m.user_id <> p_user_id
    )::bigint AS unread_count
  FROM messenger_group_messages m
  WHERE p_group_ids IS NOT NULL
    AND cardinality(p_group_ids) > 0
    AND m.group_id = ANY(p_group_ids)
  GROUP BY m.group_id;
$$;
