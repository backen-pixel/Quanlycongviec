-- 646_backfill_fb_creative_from_logs.sql
-- Vét ảnh/video mẫu quảng cáo từ các gói webhook đã lưu trong facebook_webhook_logs.
-- Chỉ điền vào dòng đang trống, không ghi đè. Kết quả lần chạy 01/10/2026: 241 dòng.

with g as (
  select
    w.payload->>'psid' as psid,
    coalesce(w.payload->'event'->'referral',
             w.payload->'event'->'postback'->'referral',
             w.payload->'event'->'message'->'referral') as ref,
    w.processed_at
  from facebook_webhook_logs w
  where w.payload::text like '%ads_context_data%'
),
sach as (
  select psid,
         ref->>'ad_id' as ad_id,
         coalesce(ref->'ads_context_data'->>'video_url', ref->'ads_context_data'->>'photo_url') as url,
         case when ref->'ads_context_data'->>'video_url' is not null then 'video' else 'photo' end as loai,
         row_number() over (partition by psid order by processed_at desc) as rn
  from g
  where ref is not null
    and coalesce(ref->'ads_context_data'->>'video_url', ref->'ads_context_data'->>'photo_url') is not null
),
moi as (select psid, ad_id, url, loai from sach where rn = 1)
update lead_attribution la
set fb_creative_url  = moi.url,
    fb_creative_type = moi.loai,
    updated_at       = now()
from moi
join facebook_contacts fc on fc.psid = moi.psid
where la.contact_id = fc.id
  and la.fb_creative_url is null
  and (la.fb_ad_id is null or la.fb_ad_id = moi.ad_id);

update lead_attribution
set fb_creative_key = split_part(fb_creative_url, '?', 1)
where fb_creative_url is not null and fb_creative_key is null;
