-- 644_fb_marketing_sync.sql
-- Nối Facebook Marketing API: lưu tài khoản quảng cáo + chi tiêu theo ngày.
-- Additive hoàn toàn: không xoá, không sửa dữ liệu đang có.

-- 1. Tài khoản quảng cáo (mỗi công ty / hệ sinh thái một dòng)
create table if not exists fb_ad_accounts (
  ad_account_id   text primary key,                 -- dạng act_1234567890
  ten             text,                             -- tên gợi nhớ cho người dùng
  tenant_id       uuid references tenants(id)   on delete set null,
  company_id      uuid references companies(id) on delete set null,
  access_token    text,                             -- token có quyền ads_read
  token_het_han   timestamptz,
  bat             boolean     not null default true,
  lan_dong_bo_cuoi timestamptz,
  ket_qua_cuoi    jsonb,                            -- {ok, so_ad, so_ngay_chi_tieu, loi}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  fb_ad_accounts is 'Tài khoản quảng cáo Facebook dùng để kéo tên chiến dịch và chi tiêu.';
comment on column fb_ad_accounts.access_token is 'Token quyền ads_read. KHÔNG bao giờ trả nguyên giá trị ra API hay log.';

-- 2. Chi tiêu theo từng quảng cáo từng ngày
create table if not exists fb_ad_spend_daily (
  ad_id         text   not null,
  ngay          date   not null,
  ad_account_id text,
  campaign_id   text,
  adset_id      text,
  chi_tieu      numeric(16,2) not null default 0,
  hien_thi      bigint not null default 0,   -- impressions
  nhap          bigint not null default 0,   -- clicks
  tien_te       text   not null default 'VND',
  cap_nhat_luc  timestamptz not null default now(),
  primary key (ad_id, ngay)
);

create index if not exists idx_fb_spend_ngay     on fb_ad_spend_daily (ngay);
create index if not exists idx_fb_spend_campaign on fb_ad_spend_daily (campaign_id);

comment on table fb_ad_spend_daily is 'Chi tiêu quảng cáo theo ngày, kéo từ Marketing API insights.';

-- 3. Bổ sung cột đồng bộ cho danh mục quảng cáo
alter table fb_ad_catalog
  add column if not exists ad_account_id text,
  add column if not exists trang_thai    text,        -- ACTIVE / PAUSED / ARCHIVED
  add column if not exists muc_tieu      text,        -- objective của chiến dịch
  add column if not exists dong_bo_luc   timestamptz;

comment on column fb_ad_catalog.dong_bo_luc is 'Lần cuối Marketing API ghi đè dòng này.';
comment on column fb_ad_catalog.nguon is 'thu_cong = người đặt tay (không bị đồng bộ ghi đè); marketing_api = tự kéo về.';

-- 4. Bảng giữ access token: bật RLS và KHÔNG tạo policy nào.
-- Backend dùng service_role (bỏ qua RLS) nên vẫn chạy bình thường;
-- anon / authenticated gọi thẳng vào Supabase sẽ không đọc được token.
alter table fb_ad_accounts enable row level security;
