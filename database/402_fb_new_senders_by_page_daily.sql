-- 402: Dem "tin nhan moi do ve" cua tung Page theo tung NGAY GIO VN (UTC+7).
--
-- Van de truoc day:
--   1. /api/facebook/stats dung `new Date().toISOString().split('T')[0]` => moc 00:00 theo
--      gio UTC = 07:00 gio VN. Nen tu 00:00-07:00 gio VN bi bo, va neu xem truoc 07:00 sang
--      thi lai gom ~17 tieng cua NGAY HOM TRUOC vao so "hom nay".
--   2. Badge so ben canh moi Page trong dropdown luon la "hom nay", khong theo bo loc ngay
--      dang chon, va khong tach duoc khach cu nhan lai (NV cham lai) khoi khach moi.
--
-- Dinh nghia chot voi nguoi dung:
--   new_contacts       = hoi thoai MOI phat sinh trong ngay do (tin inbound DAU TIEN cua khach
--                        do roi vao ngay nay) => day la "tin nhan moi do ve".
--   new_unattended     = trong so hoi thoai moi do, con bao nhieu CHUA duoc cham (chua co tin
--                        NV gui sau tin cuoi cua khach) => hien bang cham ho phach tren UI.
--   returning_contacts = khach cu nhan lai trong ngay (phan lon la tra loi tin NV cham lai)
--                        => KHONG tinh vao so moi.
--   senders            = tong khach co tin den trong ngay = new + returning.
--   inbound_msgs       = tong so tin khach gui trong ngay.
--
-- Luu y: chi tinh direction='inbound' nen NV nhan mot chieu (khach khong tra loi) khong lam
-- tang so. Khong dua vao facebook_contacts.last_message_at vi cot nay bi bump ca khi NV tra loi.
-- Cung khong dua vao "tin dau tien cua ngay la inbound hay outbound": Facebook chen san tin
-- outbound dang marker ("... replied to an ad.", "Ban dang phan hoi binh luan...") va auto-reply
-- xin SDT truoc tin thuc cua khach vai giay, nen cach do se hieu nham khach moi tu quang cao
-- thanh "cham lai".

DROP FUNCTION IF EXISTS public.fb_new_senders_by_page_daily(text[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fb_new_senders_by_page_daily(
  p_page_ids text[],
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  page_id text,
  day date,
  new_contacts integer,
  new_unattended integer,
  returning_contacts integer,
  senders integer,
  inbound_msgs integer
)
LANGUAGE sql
STABLE
AS $$
  WITH msg AS (
    SELECT c.page_id,
           m.contact_id,
           (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
    FROM facebook_messages m
    JOIN facebook_contacts c ON c.id = m.contact_id
    WHERE m.direction = 'inbound'
      AND m.created_at >= p_from
      AND m.created_at < p_to
      AND (p_page_ids IS NULL OR c.page_id = ANY (p_page_ids))
  ),
  per_day AS (
    SELECT page_id, contact_id, d, count(*) AS n
    FROM msg GROUP BY page_id, contact_id, d
  ),
  hist AS (
    SELECT x.contact_id,
           (SELECT min(m2.created_at) FROM facebook_messages m2
              WHERE m2.contact_id = x.contact_id AND m2.direction = 'inbound')  AS first_in,
           (SELECT max(m2.created_at) FROM facebook_messages m2
              WHERE m2.contact_id = x.contact_id AND m2.direction = 'inbound')  AS last_in,
           (SELECT max(m2.created_at) FROM facebook_messages m2
              WHERE m2.contact_id = x.contact_id AND m2.direction = 'outbound') AS last_out
    FROM (SELECT DISTINCT contact_id FROM per_day) x
  )
  SELECT pd.page_id,
         pd.d AS day,
         count(*) FILTER (WHERE (h.first_in AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = pd.d)::int AS new_contacts,
         count(*) FILTER (
           WHERE (h.first_in AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = pd.d
             AND (h.last_out IS NULL OR h.last_out < h.last_in)
         )::int                                                                                  AS new_unattended,
         count(*) FILTER (WHERE (h.first_in AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <> pd.d)::int AS returning_contacts,
         count(*)::int                                                                            AS senders,
         COALESCE(sum(pd.n), 0)::int                                                              AS inbound_msgs
  FROM per_day pd
  JOIN hist h ON h.contact_id = pd.contact_id
  GROUP BY pd.page_id, pd.d;
$$;

COMMENT ON FUNCTION public.fb_new_senders_by_page_daily IS
  'Dem khach nhan tin theo (page, ngay gio VN). new_contacts = hoi thoai MOI trong ngay ("tin nhan moi do ve"); new_unattended = trong so do con CHUA duoc cham; returning_contacts = khach cu nhan lai (tin cham lai), khong tinh vao so moi.';
