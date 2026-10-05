-- 645_fb_creative_reaction_leadform.sql
-- Chuẩn bị chỗ chứa cho những thứ Facebook ĐANG gửi mà hệ thống đang vứt đi,
-- và cho hai chức năng sắp bật (feed, leadgen). Additive hoàn toàn.

-- 1. Ảnh/video của chính mẫu quảng cáo (ads_context_data.video_url / photo_url)
alter table lead_attribution
  add column if not exists fb_creative_url  text,
  add column if not exists fb_creative_type text,   -- 'video' | 'photo'
  add column if not exists fb_creative_key  text;   -- phần đường dẫn không đổi

comment on column lead_attribution.fb_creative_url is
  'Ảnh/video của mẫu quảng cáo, lấy từ referral.ads_context_data. Dùng để nhìn thấy mẫu nào ra lead.';
comment on column lead_attribution.fb_creative_key is
  'Phần đường dẫn không đổi của fb_creative_url — dùng để nhóm theo mẫu. URL gốc là link ký có hạn, khoá này thì không.';

create index if not exists idx_la_creative_key on lead_attribution (fb_creative_key);

-- 2. Bình luận: biết bài nào là bài quảng cáo, và lọc bình luận do chính page viết
alter table facebook_comments
  add column if not exists ad_id        text,
  add column if not exists is_from_page boolean not null default false;

create index if not exists idx_fb_comments_post on facebook_comments (post_id);
create index if not exists idx_fb_comments_ad   on facebook_comments (ad_id);

-- 3. Thả cảm xúc — 54 gói đã về và bị vứt từ 16/09
create table if not exists fb_message_reactions (
  id          uuid primary key default gen_random_uuid(),
  page_id     text not null,
  psid        text,
  mid         text,
  hanh_dong   text,                       -- react | unreact
  cam_xuc     text,                       -- love, like, wow...
  emoji       text,
  contact_id  uuid references facebook_contacts(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_fb_reaction on fb_message_reactions (mid, psid, hanh_dong, cam_xuc);
create index if not exists idx_fb_reaction_contact on fb_message_reactions (contact_id);

comment on table fb_message_reactions is 'Khách thả cảm xúc vào tin nhắn — tín hiệu tương tác, không tạo lead.';

-- 4. Bản đồ trường form Lead Ads → cột CRM
create table if not exists fb_lead_form_mapping (
  form_id      text primary key,
  page_id      text,
  form_name    text,
  truong       jsonb not null default '{}'::jsonb,
  ghi_chu      text,
  cap_nhat_boi uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table fb_lead_form_mapping is
  'Mỗi form Lead Ads có bộ câu hỏi riêng. Bảng này khai câu hỏi nào là họ tên / SĐT / email / ghi chú.';
comment on column fb_lead_form_mapping.truong is
  'Khoá = cột CRM (ho_ten, sdt, email, ghi_chu), giá trị = tên trường trong form Facebook.';
