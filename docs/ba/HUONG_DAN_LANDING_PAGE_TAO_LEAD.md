# Hướng dẫn gắn form landing page → CRM (External API)

Tài liệu này mô tả cách đưa **lead từ website / landing page** vào **TuBep Pro CRM** qua API công khai, không cần đăng nhập JWT.

---

## 1. Endpoint và xác thực

| Mục | Giá trị |
|-----|---------|
| **Base URL backend** | `https://tubep-backend.onrender.com` (hoặc URL backend bạn đang dùng) |
| **Tạo lead** | `POST /api/external/leads` |
| **Kiểm tra key** | `GET /api/external/ping` |

**API key** do admin tạo trong CRM (bảng `external_api_keys`). Gửi key theo **một** trong các cách sau:

1. **Header (khuyên dùng trong Postman / server):**  
   `X-Api-Key: tbp_...`

2. **Query string:**  
   `?api_key=tbp_...` hoặc `?x-api-key=tbp_...`  
   **Lưu ý:** Key phải là **giá trị** của tham số `api_key`, không được viết kiểu `?tbp_...` (thiếu tên tham số).

**CORS:** Route `/api/external/*` đã cấu hình cho phép gọi từ domain khác (landing page).

---

## 2. Bảo mật: không để lộ key trên trình khách

| Cách | Đánh giá |
|------|----------|
| **Form HTML → API của chính bạn** (Netlify Functions, Vercel Serverless, PHP, Node…) rồi server gọi CRM kèm `X-Api-Key` | **An toàn** — key chỉ nằm trên server / biến môi trường |
| **Nhúng key trong JS/React build** | **Rủi ro** — ai cũng đọc được key trong DevTools |
| **Chỉ dùng cho test nội bộ** | Chấp nhận được trong thời gian ngắn |

**Khuyến nghị:** Luôn có **một endpoint phía bạn** (proxy) nhận form, validate dữ liệu, rồi gọi `POST .../api/external/leads` với header `X-Api-Key`.

---

## 3. Body JSON (POST tạo lead)

### Bắt buộc / thường gặp

| Trường | Bắt buộc | Mô tả |
|---------|----------|--------|
| `title` | **Có** | Tiêu đề lead (hiển thị trên CRM) |
| `phone` | **Có** | SĐT — dùng để **tìm hoặc tạo** khách hàng |
| `full_name` | Không | Tên khách |
| `region_id` | Không | UUID khu vực — tự động chọn khu vực đầu tiên của công ty nếu trống |
| `email` | Không | Email |
| `address` | Không | Địa chỉ |
| `company` | Không | Tên công ty khách hàng |
| `source_name` | Không | Ví dụ: `"Website"`, `"Facebook"` — tự tạo nguồn nếu chưa có |
| `estimated_value` | Không | Số ≥ 0 |
| `description` | Không | Mô tả |
| `notes` | Không | Ghi chú (gộp vào phần mô tả lead) |
| `assigned_to` | Không | UUID user — phải thuộc đúng công ty của key |
| `stage_id`, `pipeline_id`, `lead_type_id`, … | Không | Nâng cao — xem code `backend/src/routes/external.js` |

### Lưu ý trùng SĐT / email

Hệ thống **tìm khách theo `phone` rồi `email`**. Nếu đã có khách với cùng SĐT, lead sẽ gắn vào **khách cũ** — tên hiển thị là tên đã lưu trong CRM, không phải lần gửi mới nhất. Muốn test tên mới: dùng SĐT chưa tồn tại hoặc sửa khách trên CRM.

---

## 4. Ví dụ gọi từ server (Node.js)

```javascript
const CRM_BASE = 'https://tubep-backend.onrender.com';
const API_KEY = process.env.CRM_EXTERNAL_API_KEY; // không commit key

async function submitLeadFromLanding(body) {
  const res = await fetch(`${CRM_BASE}/api/external/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      title: body.title,
      full_name: body.full_name,
      phone: body.phone,
      email: body.email,
      source_name: body.source_name || 'Website',
      estimated_value: body.estimated_value,
      region_id: body.region_id, // nếu key chưa có default region
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
```

---

## 5. Ví dụ HTML form → fetch (chỉ dùng khi chấp nhận lộ key — không khuyến khích)

```html
<form id="lead-form">
  <input name="full_name" required placeholder="Họ tên" />
  <input name="phone" required placeholder="SĐT" />
  <input name="email" type="email" placeholder="Email" />
  <button type="submit">Gửi</button>
</form>
<script>
  const API_KEY = 'tbp_...'; // ⚠️ Mọi người đều thấy trong trình duyệt

  document.getElementById('lead-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch('https://tubep-backend.onrender.com/api/external/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        title: 'Khách từ landing page',
        full_name: fd.get('full_name'),
        phone: fd.get('phone'),
        email: fd.get('email') || undefined,
        source_name: 'Website',
      }),
    });
    const json = await res.json();
    alert(res.ok ? 'Đã gửi!' : (json.error || 'Lỗi'));
  };
</script>
```

---

## 6. Kiểm tra nhanh

1. **Postman:** Body → **raw** → **JSON** (không dán code `fetch`). Headers: `X-Api-Key`, `Content-Type: application/json`.
2. **`GET /api/external/ping`** với cùng key → xác nhận key hoạt động.
3. Nếu **400** với nội dung về `region_id`: thêm `region_id` trong JSON hoặc cấu hình khu vực mặc định cho key trong CRM.

---

## 7. API tham khảo thêm (cùng xác thực)

| Method | Đường dẫn | Ghi chú |
|--------|-----------|---------|
| GET | `/api/external/ping` | Key còn hiệu lực |
| GET | `/api/external/regions` | Danh sách khu vực (lấy `region_id`) |
| GET | `/api/external/stages?type=lead` | Giai đoạn pipeline |
| GET | `/api/external/sources` | Nguồn lead |
| GET | `/api/external/users` | User để map `assigned_to` |

Chi tiết field và luồng xử lý: `backend/src/routes/external.js`.
