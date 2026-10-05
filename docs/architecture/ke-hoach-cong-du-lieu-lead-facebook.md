# Kế hoạch: Cổng dữ liệu khách hàng tiềm năng Facebook → đối tác quảng cáo

**Ngày lập:** 25/09/2026 · **Phạm vi:** backend Quanlycongviec + Facebook app + đối tác chạy ads
**Mục tiêu đã chốt:** (1) đối tác đọc dữ liệu lead qua API/MCP · (2) hệ thống đẩy ngược chuyển đổi về Facebook CAPI

---

## 1. Hiện trạng đo được

Số liệu lấy trực tiếp từ database ngày 25/09/2026.

### Đã có và đang chạy tốt

| Hạng mục | Hiện trạng |
|---|---|
| Cổng REST ngoài | `/api/external` — xác thực `X-Api-Key`, có `POST /oauth/token`, rate limit theo key+IP (60 req/phút) |
| MCP server | `/api/mcp/{key-id}` — đã chạy, có `mcp_scopes` (`reports`, `crm_read`), audit log, rate limit riêng |
| API key | Bảng `external_api_keys` — 11 key đang hoạt động, có `company_id`, `allowed_company_ids`, `mcp_scopes`, `refresh_token`, `rotated_at` |
| Facebook Messenger | 12 page · 22.184 contact · 146.706 tin nhắn · vẫn nhận webhook tới hôm nay |
| CRM | 6.893 lead · 2.757 deal · 1.513 deal đã chốt |
| Nguồn lead | 8.053 lead có `source_id` |

Nghĩa là **hạ tầng cổng ra đã sẵn sàng**. Việc còn lại là bơm đúng dữ liệu vào và mở đúng endpoint.

### Khoảng trống chặn mục tiêu

| Vấn đề | Bằng chứng | Hệ quả |
|---|---|---|
| **Không có quy kết quảng cáo** | 146.706 tin nhắn, chỉ **1** dòng chứa `ad_id`. `handleMessaging` trong `backend/src/routes/facebook.js` không đọc `event.referral` và `event.postback.referral` | Không trả lời được "quảng cáo nào ra khách này" — đây chính là thứ đối tác cần |
| **Lead Ads chưa nối** | `facebook_lead_ads` = **0 dòng**. Hàm `handleLeadGen` đã viết sẵn nhưng webhook field `leadgen` chưa đăng ký | Mất toàn bộ lead từ form quảng cáo |
| **Comment chưa bắt** | `facebook_comments` = **0 dòng**. `handleComment` đã có, thiếu đăng ký field `feed` | Mất nguồn lead từ comment dưới bài ads |
| **Bảng nguồn bị ô nhiễm** | `crm_sources` chứa ~100 dòng là **URL landing page nguyên vẹn** kèm `gclid`/`utm`, ví dụ `https://tubepinox.vanphuthanh.net/?gad_source=1&gad_campaignid=19944201331&gclid=...` | Không nhóm được theo campaign, không thống kê được |
| **Chưa chấm điểm lead** | `lead_temperature` chỉ 1 dòng có giá trị · `info_complete` 1 dòng · `first_touch_time` 1.366/6.893 | Không có thước đo chất lượng để trả ra ngoài |
| **Chưa có chi tiêu quảng cáo** | Không bảng nào lưu spend/impression/click | Không tính được giá mỗi lead và ROAS thật |

Nguồn Facebook hiện chỉ gắn tới **cấp page**: `crm_sources.name` có dạng `[FB:102168589332185] Phúc Đạt Kitchen`. Đủ để biết page nào, **không đủ** để biết campaign / adset / ad nào.

---

## 2. Kiến trúc đích

```
Facebook
├─ Messenger webhook ──┐
├─ Lead Ads webhook ───┤
├─ Comment webhook ────┤
└─ Marketing API ──────┤ (kéo chi tiêu, cron 6h/lần)
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  Lớp thu nhận (ingest)           │
        │  - Tách ad_id/campaign/adset     │
        │  - Tách UTM/gclid từ URL         │
        │  → bảng lead_attribution         │
        └──────────────┬───────────────────┘
                       ▼
        ┌──────────────────────────────────┐
        │  Lớp chấm điểm (scoring)         │
        │  - Điểm chất lượng 0–100         │
        │  - Nhãn: rác / lạnh / ấm / nóng  │
        │  → bảng lead_quality_scores      │
        └──────────────┬───────────────────┘
                       │
         ┌─────────────┴──────────────┐
         ▼                            ▼
┌──────────────────┐        ┌──────────────────────┐
│ Cổng RA (đọc)    │        │ Cổng VỀ (ghi)        │
│ REST /api/partner│        │ Facebook CAPI        │
│ MCP scope ads    │        │ - Lead               │
│                  │        │ - Purchase + value   │
│ Đối tác ads      │        │ Custom Audience      │
│ Web khác         │        │                      │
└──────────────────┘        └──────────────────────┘
```

---

## 3. Giai đoạn 1 — Thu quy kết quảng cáo

> **Bắt buộc làm trước.** Không có bước này thì mọi thứ phía sau đều vô nghĩa.

### 1.1 Bảng mới `lead_attribution`

Một dòng cho mỗi lần chạm đầu tiên của một lead/contact.

```sql
CREATE TABLE lead_attribution (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES facebook_contacts(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  company_id    uuid REFERENCES companies(id),

  -- kênh
  kenh          text NOT NULL,          -- messenger | lead_ads | comment | website | zalo | khac
  platform      text,                   -- facebook | instagram | google | direct

  -- quy kết Facebook
  fb_page_id    text,
  fb_ad_id      text,
  fb_adset_id   text,
  fb_campaign_id text,
  fb_campaign_name text,
  fb_ref        text,                   -- tham số ref của link m.me
  fb_source     text,                   -- ADS | SHORTLINK | CUSTOMER_CHAT_PLUGIN
  fb_form_id    text,                   -- với Lead Ads
  fb_leadgen_id text,

  -- quy kết web
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  gclid         text,
  fbclid        text,
  landing_url   text,
  referrer_url  text,

  -- dấu vết cho CAPI
  fbp           text,
  fbc           text,
  client_ip     inet,
  user_agent    text,

  cham_dau_luc  timestamptz NOT NULL DEFAULT now(),
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_attr_lead     ON lead_attribution(lead_id);
CREATE INDEX idx_lead_attr_campaign ON lead_attribution(fb_campaign_id, cham_dau_luc DESC);
CREATE INDEX idx_lead_attr_ad       ON lead_attribution(fb_ad_id, cham_dau_luc DESC);
CREATE UNIQUE INDEX uq_lead_attr_lead ON lead_attribution(lead_id) WHERE lead_id IS NOT NULL;
```

### 1.2 Vá webhook Messenger

`backend/src/routes/facebook.js` → `handleMessagingInner()`

Facebook gửi thông tin quảng cáo ở ba chỗ, phải đọc cả ba:

| Trường hợp | Vị trí trong payload | Khi nào |
|---|---|---|
| Khách bấm quảng cáo Click-to-Messenger | `event.referral` | Khách **đã** từng nhắn page |
| Khách bấm quảng cáo lần đầu | `event.postback.referral` | Kèm postback `Bắt đầu` |
| Tin nhắn có ngữ cảnh quảng cáo | `event.message.referral` | Ít gặp |

Dữ liệu cần lấy: `ad_id`, `ref`, `source`, `type`, `ads_context_data.ad_title`, `ads_context_data.post_id`.

```js
// Thêm vào đầu handleMessagingInner, ngay sau khi có contact
const referral = event.referral
  || event.postback?.referral
  || event.message?.referral
  || null;
if (referral) {
  await luuQuyKetMessenger(pageId, contact, referral, event);
}
```

Hàm `luuQuyKetMessenger()` đặt ở helper mới `backend/src/helpers/leadAttribution.js`:
- Ghi `lead_attribution` với `kenh='messenger'`
- Nếu contact chưa có `lead_id`, giữ theo `contact_id`; khi contact được chuyển thành lead thì gắn `lead_id` vào (hook ở `POST /contacts/:id/create-lead`)
- Chỉ ghi lần chạm **đầu tiên**, lần sau bỏ qua (`ON CONFLICT DO NOTHING`)

### 1.3 Đăng ký webhook field còn thiếu

Trên Facebook App → Webhooks → Page, bật thêm:
- `messaging_referrals` — bắt buộc cho `event.referral`
- `messaging_postbacks` — cho `postback.referral`
- `leadgen` — Lead Ads
- `feed` — comment

Quyền cần xin duyệt App Review: `pages_manage_metadata`, `leads_retrieval`, `pages_read_engagement`, `ads_read`.

> **Cảnh báo:** 12 page đang dùng chung app. Bật field mới áp dụng cho toàn bộ page — cần thử trên 1 page trước (đề xuất `Supermarket 3K1D`, lưu lượng thấp nhất).

### 1.4 Nối Lead Ads

`handleLeadGen()` đã viết sẵn. Việc cần làm:
1. Bật field `leadgen`
2. Gọi Graph API `GET /{leadgen_id}` bằng page token để lấy `field_data`
3. Lưu `facebook_lead_ads` + ghi `lead_attribution` với `kenh='lead_ads'`, `fb_form_id`, `fb_ad_id`
4. Chạy tiếp luồng tạo lead sẵn có

### 1.5 Dọn `crm_sources` và tách UTM

Vấn đề: ~100 dòng `crm_sources` là URL nguyên vẹn.

Cách xử lý (không xoá dữ liệu cũ):
1. Viết `backend/src/helpers/parseLandingUrl.js` — tách URL thành `{utm_source, utm_medium, utm_campaign, gclid, fbclid, host, path}`
2. Migration backfill: với mỗi lead có `source_id` trỏ vào một dòng URL, tách URL ghi vào `lead_attribution`, rồi trỏ `source_id` về nguồn chuẩn (`Website` / `Google Ads` / `Facebook Ads`)
3. Đánh dấu các dòng URL cũ `is_active = false` (giữ lại để truy vết, không hiện trong dropdown)
4. Sửa chỗ tạo source tự động ở `routes/external.js` — chuẩn hoá tên nguồn trước khi tạo, không bao giờ lấy URL làm tên

**Backup trước khi chạy:** `_bak_<ngày>_crm_sources`, `_bak_<ngày>_crm_leads_source`.

---

## 4. Giai đoạn 2 — Chấm điểm chất lượng lead

Đối tác cần biết **ad nào ra khách thật, ad nào ra khách rác**. Một con số 0–100 kèm nhãn.

### 2.1 Bảng `lead_quality_scores`

```sql
CREATE TABLE lead_quality_scores (
  lead_id        uuid PRIMARY KEY REFERENCES crm_leads(id) ON DELETE CASCADE,
  diem           smallint NOT NULL,        -- 0..100
  nhan           text NOT NULL,            -- rac | lanh | am | nong | da_chot
  thanh_phan     jsonb NOT NULL,           -- điểm từng tiêu chí
  tinh_luc       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lqs_nhan ON lead_quality_scores(nhan, tinh_luc DESC);
```

### 2.2 Công thức đề xuất

| Tiêu chí | Điểm tối đa | Cách tính |
|---|---|---|
| Có số điện thoại hợp lệ | 25 | Đã qua `facebookPhoneExtract` / nhập tay, đúng định dạng VN |
| Số điện thoại không trùng | 10 | Không phải khách cũ, không nằm trong blocklist `crmAutoLeadPhoneBlocklist` |
| Có phản hồi hai chiều | 15 | ≥ 2 tin nhắn từ khách trong `facebook_messages` |
| Độ sâu hội thoại | 10 | ≥ 6 tin nhắn tổng |
| Tốc độ phản hồi lần đầu | 10 | `first_touch_time` ≤ 15 phút |
| Cung cấp địa chỉ / nhu cầu | 10 | `install_address` hoặc `description` có nội dung |
| Tiến được qua giai đoạn CRM | 10 | Có ≥ 1 dòng `crm_lead_stage_history` tiến lên |
| Có báo giá | 5 | Có `quotations` gắn với lead |
| Đã chốt đơn | +5 và ép nhãn `da_chot` | `type='deal'` và `actual_close_date` không rỗng |

Ngưỡng nhãn: `< 25` rác · `25–49` lạnh · `50–74` ấm · `≥ 75` nóng.

> Số liệu hiện tại đủ để tính ngay 7/9 tiêu chí. `first_touch_time` mới có 1.366/6.893 lead — cần backfill từ `facebook_messages`.

### 2.3 Cách chạy

- Job mới `backend/src/jobs/leadQualityScoring.js`, chạy mỗi 30 phút
- Tính lại lead có thay đổi trong 24h; toàn bộ lead tính lại 1 lần/tuần vào ban đêm
- Theo mẫu `backend/src/jobs/kpiNightly.js` đã có

---

## 5. Giai đoạn 3 — Cổng ra cho đối tác

### 3.1 REST: `/api/partner/v1/*`

Tách khỏi `/api/external` (vốn để **ghi** lead vào) — cổng mới chỉ để **đọc**, phiên bản hoá rõ ràng để web khác dùng được lâu dài.

| Endpoint | Trả về |
|---|---|
| `GET /api/partner/v1/leads` | Danh sách lead + quy kết + điểm. Lọc: `from`, `to`, `campaign_id`, `ad_id`, `channel`, `label`, `company_id`. Phân trang con trỏ (`cursor`, `limit` ≤ 200) |
| `GET /api/partner/v1/leads/{id}` | Chi tiết một lead |
| `GET /api/partner/v1/campaigns` | Tổng hợp theo campaign: số lead, phân bố nhãn, điểm trung bình, số chốt, doanh thu, chi tiêu, giá mỗi lead, ROAS |
| `GET /api/partner/v1/campaigns/{id}/ads` | Bóc xuống từng ad |
| `GET /api/partner/v1/conversions` | Lead đã chốt trong kỳ + giá trị (để đối tác đối chiếu với CAPI) |
| `GET /api/partner/v1/meta` | Danh mục: kênh, nhãn, page, công ty |
| `GET /api/partner/v1/health` | Kiểm tra key sống, trả `scopes` và hạn mức còn lại |

**Mẫu phản hồi `GET /leads`:**

```json
{
  "data": [
    {
      "id": "3f2a…",
      "code": "LEAD-2026-1042",
      "created_at": "2026-09-24T02:11:07Z",
      "channel": "messenger",
      "attribution": {
        "platform": "facebook",
        "page_id": "102168589332185",
        "campaign_id": "23851…",
        "campaign_name": "TuBep_Nhom_T9_Remarketing",
        "adset_id": "23851…",
        "ad_id": "23851…",
        "ref": "tb-nhom-t9",
        "utm": { "source": null, "medium": null, "campaign": null }
      },
      "quality": {
        "score": 78,
        "label": "nong",
        "components": { "phone": 25, "two_way": 15, "depth": 10, "speed": 10, "stage": 10, "quote": 5, "address": 3 }
      },
      "funnel": {
        "stage": "Đã khảo sát",
        "is_deal": true,
        "closed_at": null,
        "value": 185000000
      },
      "contact": {
        "name": "Nguyễn Văn A",
        "phone": "0901234567",
        "phone_sha256": "a3f1…"
      }
    }
  ],
  "next_cursor": "eyJ0IjoiMjAyNi0wOS0yNFQwMjoxMTowN1oifQ",
  "meta": { "returned": 200, "pii": "full" }
}
```

### 3.2 Quyền xem thông tin cá nhân — bật theo từng key

Theo quyết định đã chốt: mỗi API key tự bật/tắt quyền đọc PII.

```sql
ALTER TABLE external_api_keys
  ADD COLUMN pii_level text NOT NULL DEFAULT 'hashed'
    CHECK (pii_level IN ('hashed', 'masked', 'full')),
  ADD COLUMN partner_scopes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN ip_allowlist inet[],
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN last_used_at timestamptz;
```

| Mức | `contact.name` | `contact.phone` | `phone_sha256` |
|---|---|---|---|
| `hashed` (mặc định) | `null` | `null` | có |
| `masked` | `Nguyễn V. A` | `090***4567` | có |
| `full` | đầy đủ | đầy đủ | có |

**Ràng buộc bắt buộc đi kèm mức `full`** — vì đây là mức rủi ro cao nhất:

1. `ip_allowlist` **không được rỗng** — chặn ở tầng middleware, key `full` mà không khai IP thì từ chối cấp
2. `expires_at` tối đa 90 ngày, hết hạn tự khoá
3. Mọi request ghi `partner_api_audit`: key, IP, endpoint, số bản ghi trả về, có PII hay không
4. Hạn mức riêng: 10.000 bản ghi PII/ngày/key
5. Chỉ tài khoản `ecosystem_admin` được đặt `pii_level='full'`, và phải ghi lý do
6. Ký hợp đồng xử lý dữ liệu với đối tác trước khi cấp (xem mục 8)

```sql
CREATE TABLE partner_api_audit (
  id         bigserial PRIMARY KEY,
  api_key_id uuid NOT NULL,
  endpoint   text NOT NULL,
  method     text NOT NULL,
  ip         inet,
  user_agent text,
  params     jsonb,
  so_ban_ghi integer,
  pii_level  text,
  status     integer,
  ms         integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_audit_key ON partner_api_audit(api_key_id, created_at DESC);
```

Giữ log 12 tháng, dọn bằng `logRetentionCron.js` đã có.

### 3.3 MCP: thêm scope `ads_read`

MCP server đã chạy, chỉ cần thêm bộ tool mới vào `backend/src/helpers/mcpGateway.js`:

| Tool | Việc |
|---|---|
| `list_lead_campaigns` | Liệt kê campaign có lead trong kỳ |
| `get_campaign_performance` | Số lead, phân bố nhãn, tỉ lệ chốt, doanh thu, chi tiêu, ROAS của một campaign |
| `compare_campaigns` | So sánh nhiều campaign trên cùng bộ chỉ số |
| `get_lead_quality_breakdown` | Bóc chất lượng lead theo campaign / adset / ad |
| `find_wasted_spend` | Chỉ ra ad tiêu tiền nhiều nhưng lead toàn nhãn `rac`/`lanh` |
| `get_conversion_events` | Sự kiện chốt đơn trong kỳ, để đối chiếu CAPI |

Cách làm: tạo `backend/src/helpers/mcpAdsBridge.js` theo đúng mẫu `mcpCrmReadBridge.js` hiện có (727 dòng, đã có sẵn khuôn xử lý scope + audit).

Key MCP của đối tác đặt `mcp_scopes = ['ads_read']` — **không** kèm `reports` hay `crm_read`, để họ không chạm được báo cáo nội bộ.

### 3.4 Cho web khác dùng lại

- Bổ sung `/api/partner/v1` vào `docs/api/openapi.yaml` đã có
- Bộ sưu tập Postman ở `docs/api/postman/`
- CORS: allowlist theo domain khai trong key, không mở `*`
- Chuẩn lỗi RFC 7807 (`application/problem+json`)
- Header hạn mức: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Khoá phiên bản: `/v1` không bao giờ đổi ý nghĩa trường; thay đổi phá vỡ thì ra `/v2`

---

## 6. Giai đoạn 4 — Đẩy ngược về Facebook (CAPI)

Đây là phần **hiệu quả nhất về mặt giảm giá thầu**: gửi tín hiệu chuyển đổi thật về cho thuật toán Facebook.

### 4.1 Sự kiện gửi đi

| Sự kiện | Kích hoạt khi | Giá trị gửi kèm |
|---|---|---|
| `Lead` | Lead mới có số điện thoại hợp lệ | — |
| `QualifiedLead` (tuỳ biến) | Điểm chất lượng ≥ 50 | `score` |
| `Schedule` | Đặt lịch khảo sát | — |
| `Purchase` | Deal chuyển sang cột chốt | `value` = giá trị đơn, `currency: VND` |

### 4.2 Bảng hàng đợi

```sql
CREATE TABLE capi_event_queue (
  id           bigserial PRIMARY KEY,
  lead_id      uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
  event_name   text NOT NULL,
  event_time   timestamptz NOT NULL,
  event_id     text NOT NULL,          -- khử trùng lặp phía Facebook
  pixel_id     text NOT NULL,
  payload      jsonb NOT NULL,         -- đã băm sẵn user_data
  trang_thai   text NOT NULL DEFAULT 'cho',  -- cho | dang_gui | xong | loi
  so_lan_thu   smallint NOT NULL DEFAULT 0,
  loi          text,
  gui_luc      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_capi_event ON capi_event_queue(event_id);
CREATE INDEX idx_capi_cho ON capi_event_queue(trang_thai, created_at) WHERE trang_thai IN ('cho','loi');
```

### 4.3 Quy tắc bắt buộc

- **Băm trước khi gửi:** `em`, `ph`, `fn`, `ln` đều SHA-256, chữ thường, bỏ khoảng trắng. Số điện thoại chuẩn hoá về E.164 (`+84901234567`) **trước khi** băm
- **Không bao giờ gửi PII thô** lên Facebook
- `event_id` = `${lead_id}:${event_name}` để Facebook tự khử trùng nếu gửi lại
- Gửi kèm `fbc`/`fbp` nếu có trong `lead_attribution` — tăng mạnh tỉ lệ khớp
- Thử lại theo cấp số nhân: 1 phút → 5 → 30 → 2 giờ, tối đa 5 lần
- Job `backend/src/jobs/capiDispatch.js`, chạy mỗi 2 phút, mỗi lượt tối đa 100 sự kiện
- Chế độ `test_event_code` cho môi trường thử, tắt ở production

### 4.4 Tệp khách hàng (Custom Audience)

Job tuần: đẩy hai tệp qua Marketing API
- **Khách đã mua** — làm nguồn cho tệp tương tự (lookalike)
- **Khách loại trừ** — người đã chốt, để không tốn tiền quảng cáo lại

Cũng chỉ gửi dữ liệu đã băm.

---

## 7. Giai đoạn 5 — Kéo chi tiêu về để tính ROAS

### 5.1 Bảng `fb_ad_insights`

```sql
CREATE TABLE fb_ad_insights (
  id            bigserial PRIMARY KEY,
  ngay          date NOT NULL,
  ad_account_id text NOT NULL,
  campaign_id   text NOT NULL,
  campaign_name text,
  adset_id      text,
  adset_name    text,
  ad_id         text,
  ad_name       text,
  chi_tieu      numeric(14,2) NOT NULL DEFAULT 0,
  hien_thi      bigint NOT NULL DEFAULT 0,
  click         bigint NOT NULL DEFAULT 0,
  ket_qua       bigint NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'VND',
  raw           jsonb,
  dong_bo_luc   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fb_insights ON fb_ad_insights(ngay, ad_id);
CREATE INDEX idx_fb_insights_campaign ON fb_ad_insights(campaign_id, ngay DESC);
```

### 5.2 Đồng bộ

- Job `backend/src/jobs/fbInsightsSync.js`, chạy 6 giờ/lần
- Gọi `GET /act_{ad_account_id}/insights` với `level=ad`, `time_increment=1`
- Kéo lại 7 ngày gần nhất mỗi lần (Facebook còn điều chỉnh số liệu trong 3 ngày đầu)
- Cần token tài khoản quảng cáo với quyền `ads_read` — lưu ở `app_settings`, **không** hardcode

### 5.3 Chỉ số ghép được

Khi đã có `lead_attribution` + `lead_quality_scores` + `fb_ad_insights`:

| Chỉ số | Công thức |
|---|---|
| Giá mỗi lead | `chi_tieu / số lead` |
| Giá mỗi lead chất lượng | `chi_tieu / số lead nhãn ấm+nóng` |
| Tỉ lệ lead rác | `lead nhãn rác / tổng lead` |
| Giá mỗi đơn | `chi_tieu / số deal chốt` |
| ROAS | `doanh thu chốt / chi_tieu` |
| Thời gian từ lead tới chốt | trung vị `actual_close_date − created_at` |

Đây chính là bảng mà đối tác cần để quyết định tắt/mở ad.

---

## 8. Bảo mật và tuân thủ

### Bắt buộc trước khi cấp key mức `full`

1. **Hợp đồng xử lý dữ liệu** với đối tác: nêu rõ mục đích dùng, thời hạn lưu, cam kết không bán lại, nghĩa vụ báo rò rỉ trong 24 giờ
2. **Cơ sở pháp lý thu thập**: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân yêu cầu có sự đồng ý của chủ thể dữ liệu. Cần bổ sung dòng thông báo ở form Lead Ads và landing page: *"Thông tin của bạn có thể được chia sẻ với đối tác quảng cáo của chúng tôi để cải thiện dịch vụ."*
3. **Quyền của khách hàng**: cần có quy trình xoá theo yêu cầu — xoá ở CRM phải kéo theo xoá ở phía đối tác

### Kỹ thuật

- Chỉ HTTPS, từ chối HTTP
- Key hiển thị **một lần** lúc tạo, sau đó chỉ lưu băm
- Xoay key 90 ngày — đã có `rotated_at`, `rotated_by` trong `external_api_keys`
- Rate limit theo tầng: IP → key → endpoint
- Cảnh báo bất thường: một key tải > 5.000 bản ghi/giờ thì báo về Telegram/Zalo quản trị
- Dùng lại `mcpAudit.js` đã có cho cổng REST mới

---

## 9. Danh sách việc cụ thể

### Migration mới

| Số | Nội dung |
|---|---|
| 635 | `lead_attribution` + index |
| 636 | `lead_quality_scores` + index |
| 637 | `external_api_keys`: `pii_level`, `partner_scopes`, `ip_allowlist`, `expires_at`, `last_used_at` |
| 638 | `partner_api_audit` |
| 639 | `capi_event_queue` |
| 640 | `fb_ad_insights` |
| 641 | Dọn `crm_sources` URL rác + backfill `lead_attribution` từ URL cũ (có backup) |
| 642 | Backfill `first_touch_time` từ `facebook_messages` |

### File backend

| File | Việc |
|---|---|
| `routes/facebook.js` | Vá `handleMessagingInner` đọc referral; hoàn thiện `handleLeadGen`, `handleComment`; hook gắn `lead_id` vào attribution khi tạo lead |
| `helpers/leadAttribution.js` | **mới** — ghi/đọc quy kết, khử trùng lặp |
| `helpers/parseLandingUrl.js` | **mới** — tách UTM/gclid/fbclid |
| `helpers/leadQuality.js` | **mới** — công thức chấm điểm |
| `jobs/leadQualityScoring.js` | **mới** — chạy 30 phút/lần |
| `routes/partner.js` | **mới** — toàn bộ `/api/partner/v1` |
| `middleware/partnerAuth.js` | **mới** — key + IP allowlist + hạn dùng + PII level + audit |
| `helpers/mcpAdsBridge.js` | **mới** — 6 tool MCP scope `ads_read` |
| `helpers/mcpGateway.js` | Thêm scope `ads_read` vào `getMcpReportTools` |
| `helpers/facebookCapi.js` | **mới** — băm + gửi CAPI |
| `jobs/capiDispatch.js` | **mới** — chạy 2 phút/lần |
| `jobs/fbInsightsSync.js` | **mới** — chạy 6 giờ/lần |
| `server.js` | Mount `/api/partner`, thêm rate limiter |
| `docs/api/openapi.yaml` | Bổ sung `/api/partner/v1` |

### Giao diện quản trị

Thêm trang `/management/partner-keys`:
- Danh sách key, mức PII, IP allowlist, hạn dùng, lần dùng cuối
- Nút tạo key (hiện giá trị một lần), xoay key, khoá key
- Xem log truy cập: ai lấy gì, bao nhiêu bản ghi, lúc nào
- Bảng theo dõi hàng đợi CAPI: đã gửi / lỗi / đang chờ

---

## 10. Lộ trình

| Tuần | Việc | Kết quả kiểm chứng được |
|---|---|---|
| **1** | Migration 635–636, 641–642 · vá webhook referral · helper attribution · thử trên 1 page | Lead mới từ quảng cáo có `fb_ad_id` trong `lead_attribution` |
| **2** | Bật `leadgen` + `feed` cho toàn bộ 12 page · nối Lead Ads · chấm điểm lead + backfill | `facebook_lead_ads` bắt đầu có dòng · mọi lead có điểm và nhãn |
| **3** | Migration 637–638 · `middleware/partnerAuth.js` · `routes/partner.js` với `/leads`, `/campaigns`, `/health` · OpenAPI | Đối tác gọi thử bằng key `hashed`, lấy được dữ liệu |
| **4** | `mcpAdsBridge.js` 6 tool · trang quản trị key · audit | Đối tác nối MCP bằng URL `/api/mcp/{id}`, hỏi được "campaign nào ra khách tốt nhất" |
| **5** | Migration 639 · `facebookCapi.js` + `capiDispatch.js` · chạy chế độ thử | Facebook Events Manager thấy sự kiện `Lead` và `Purchase` khớp |
| **6** | Migration 640 · `fbInsightsSync.js` · endpoint `/campaigns` có ROAS thật · tệp Custom Audience | Bảng ROAS đầy đủ chi tiêu — đủ để đối tác ra quyết định |

Tổng: **6 tuần**, mỗi tuần có một thứ chạy được và kiểm chứng được.

---

## 11. Rủi ro và cách phòng

| Rủi ro | Mức | Phòng |
|---|---|---|
| App Review Facebook bị từ chối | Cao | Nộp sớm ở tuần 1, quay video demo rõ mục đích. Chờ duyệt có thể mất 2–4 tuần — làm song song với việc khác |
| Bật webhook field mới làm nghẽn 12 page | Trung bình | Thử 1 page lưu lượng thấp trước. `facebook_webhook_logs` đã có, theo dõi độ trễ xử lý |
| Key `full` bị lộ ra ngoài | Cao | IP allowlist bắt buộc, hạn 90 ngày, hạn mức 10.000 bản ghi PII/ngày, cảnh báo bất thường |
| Quy kết sai do khách nhắn lại sau nhiều tháng | Trung bình | Chỉ ghi lần chạm **đầu tiên**. Lần sau ghi vào `raw` để truy vết, không ghi đè |
| Số liệu ROAS lệch vì Facebook điều chỉnh muộn | Thấp | Kéo lại 7 ngày gần nhất mỗi lần đồng bộ |
| Backfill `crm_sources` làm hỏng lead cũ | Trung bình | Backup hai bảng trước. Không xoá, chỉ `is_active = false` |
| Đối tác lạm dụng dữ liệu | Cao | Hợp đồng xử lý dữ liệu + audit đầy đủ + quyền thu hồi key tức thì |

---

## 12. Cần quyết định trước khi bắt đầu

1. **Pixel ID và Ad Account ID** nào dùng cho CAPI — hiện chưa có trong hệ thống
2. **Đối tác quảng cáo là ai** — cần tên pháp nhân để làm hợp đồng xử lý dữ liệu
3. **Mức PII cấp cho họ** — khuyến nghị bắt đầu `hashed`, nâng lên `full` sau khi ký hợp đồng
4. **Phạm vi công ty** — cấp dữ liệu của cả 7 công ty hay chỉ Phúc Đạt / Vạn Phú Thành
5. **Ngân sách token Facebook** — Marketing API có hạn mức gọi, cần biết quy mô tài khoản quảng cáo

---

*Kế hoạch lập trên hiện trạng database ngày 25/09/2026. Mọi số liệu trong mục 1 đều đo trực tiếp, không ước lượng.*
