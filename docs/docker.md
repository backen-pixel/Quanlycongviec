# Chạy BepPro trong Docker cạnh Supabase self-host

Cập nhật 2026-08-25.

```bash
docker compose up -d --build      # dựng và chạy
```

Mở `http://localhost:4000`. Nhật ký: `docker compose logs -f beppro`.

Bộ Supabase **không** do file compose này quản lý — nó là compose project riêng ở
`E:\supabase\supabase\docker` (11 container). Ở đây chỉ ghép vào mạng `supabase_default`
(`external: true`), nên `docker compose down` bên này không đụng gì tới Supabase.

## Hiện trạng khi bắt đầu

Supabase self-host **đã chạy sẵn**: postgres 17.6, postgrest, storage-api, gotrue, realtime,
envoy (cổng 8000), studio, pooler (5432/6543). `backend/.env` cũng đã trỏ vào đó
(`SUPABASE_URL=http://localhost:8000`). Nên việc còn lại chỉ là đóng gói BepPro.

App dùng những phần nào của Supabase — đếm thật trong mã, không đoán:

| Dịch vụ | Số file dùng | Kết luận |
|---|---:|---|
| PostgREST (`.from`, `.rpc`) | nhiều + 12 file `.rpc(` | **cần** |
| Storage | 17 backend, 9 file gọi `getPublicUrl` | **cần** |
| GoTrue (`supabase.auth`) | **0** | không dùng — app tự làm JWT |
| Realtime (`.channel(`) | **0** | không dùng — dùng Socket.IO |
| Edge Functions | **0** | không dùng |

Frontend **không** tạo Supabase client (`createClient` = 0 file) — chỉ backend nói chuyện với
Supabase. Đây là lý do mọi thứ gọn được như dưới đây.

## Bốn quyết định thiết kế, kèm lý do

### 1. Cầu nối cổng thay vì sửa `.env`

`.env` trỏ Supabase vào `localhost:8000 / :6543 / :5432`. Trong container `localhost` là chính
container đó → hỏng. Cách hiển nhiên là đổi thành tên service (`supabase-envoy`…). **Không làm
vậy** vì app lưu URL file TUYỆT ĐỐI vào database qua `getPublicUrl()` (9 file). Đổi
`SUPABASE_URL` là mọi ảnh/tệp mới sinh ra URL `http://supabase-envoy:8000/...` — **trình duyệt
không phân giải nổi tên đó**, ảnh hỏng hết.

Đã thử `host.docker.internal`: từ máy thật nó trỏ ra IP LAN `192.168.1.23` và cổng 8000
**không kết nối được** (đo bằng `Invoke-WebRequest`; `localhost:8000` thì trả 401 tức là sống).
Nên không có tên nào dùng chung được cho cả hai phía.

Giải pháp: `docker-entrypoint.sh` dựng `socat` nghe đúng `127.0.0.1:8000 / :6543 / :5432` trong
container rồi chuyển tiếp sang service Supabase. Kết quả: **`.env` giữ nguyên không sửa một
dòng**, URL sinh ra vẫn là `http://localhost:8000/...` — thứ trình duyệt trên máy mở được.

Đánh đổi: có 3 tiến trình `socat` chạy nền. Nếu một cái chết, app không tự biết. Chấp nhận được
cho môi trường máy bàn; chạy nhiều máy chủ thật thì nên đổi sang sửa `.env` + một biến riêng cho
URL công khai.

### 2. `WORKDIR` bắt buộc là thư mục `backend`

Vài chỗ ghi file bằng đường dẫn **tương đối**: `multer` với
`destination: 'uploads/lead-chat/'` (`crm/shared/helpersBundle.js`). Đặt sai thư mục làm việc là
file đính kèm rơi ra ngoài volume rồi mất khi dựng lại container.

### 3. Volume cho `backend/uploads` — bắt buộc

Ảnh/tệp chat vẫn ghi thẳng xuống đĩa (`multer.diskStorage`), hiện đã có **69 MB**. Không có
volume thì mỗi lần `--build` là mất sạch.

### 4. Một container, không scale

`helpers/cronLeader.js`: **không có Redis → mọi instance đều tự coi là leader**. `server.js`
khởi động ~17 job nền (báo cáo ngày, nhắc deadline, FB pipeline, đồng bộ backup…). Chạy 2
container mà không bật Redis là **gửi gấp đôi mọi thứ**. Muốn scale thì cắm `REDIS_URL` —
`@socket.io/redis-adapter` và `cronLeader` đã có sẵn, chỉ thiếu Redis.

## Lỗi có sẵn trong repo, phát hiện khi build

`frontend/package-lock.json` **lệch với `package.json`** — `npm ci` từ chối:

```
Missing: @types/react@19.2.18 from lock file
Invalid: lock file's micromark@3.2.0 does not satisfy micromark@4.0.2
… (hàng chục dòng micromark v1/v3 cũ)
```

Đây không phải lỗi Docker: `render.yaml` cũng chạy `npm ci`, nên **bản deploy production cũng sẽ
hỏng ở đúng chỗ này**.

`npm install --package-lock-only` chạy trên máy **không sửa được** — npm thấy `node_modules` sẵn
có nên báo "up to date". Phải dựng lại lockfile trong môi trường sạch (container, không có
`node_modules`). Kết quả: **1.268 → 1.082 gói**, có `@types/react`, `micromark` lên 4.0.2 và
biến mất chuỗi v1/v3 cũ đã chết.

`node_modules` trên máy **không bị đụng**, `npm run dev` vẫn chạy như cũ. Bản lockfile cũ được
giữ ở `scratchpad/package-lock.frontend.backup.json`.

## Vì sao image là Node 24

Máy dùng npm 11.11.0 / Node 24; `node:22-bookworm-slim` đi kèm npm 10.9.8. Hai phiên bản npm
sinh và đọc lockfile khác nhau. Dùng `node:24-bookworm-slim` cho image trùng với môi trường phát
triển, bớt một nguồn sai lệch.

## Những thứ khác đã tính tới

- `ca-certificates` phải cài: `npm start` chạy `node --use-system-ca`, thiếu CA là mọi lệnh
  HTTPS hỏng (Anthropic, Google, web-push).
- `npm ci` phải chạy **trong** image Linux: `ffmpeg-static` tải binary theo nền tảng, chép
  `node_modules` từ Windows sang là được file `.exe` không chạy nổi.
- `.dockerignore` loại `node_modules`, `backend/uploads` (69 MB), 3 app mobile, `database`,
  và **mọi `.env`** — bí mật truyền lúc chạy bằng `env_file`, không bake vào image.
- Ảnh bài học (`uploads/knowledge-screenshots`) **phải** có trong build context: script
  `sync-screenshots-deploy.js` chạy trong `npm run build` của frontend đọc thư mục đó.
- Healthcheck dùng `/api/health` — cùng endpoint mà `render.yaml` đang dùng.

## Nghiệm thu (đo thật, 2026-08-25)

| Việc | Kết quả |
|---|---|
| Image | `beppro:local`, **377 MB** |
| Cầu nối cổng | 3 dòng `[cau-noi]` trong log, lên trước khi app chạy |
| Khởi động | `Server ready in 4.9s`, container **healthy** |
| `/api/health` | 200 |
| SPA | `/crm/dashboard`, `/login` đều trả `index.html` 1300 byte |
| PostgREST từ trong container | **138 users, 119ms** |
| URL công khai sinh ra | `http://localhost:8000/storage/v1/...` — trình duyệt mở được ✅ |
| Giao diện | trang đăng nhập render đủ: email, mật khẩu, QR |

Cầu nối còn được kiểm riêng trước đó: container tạm trên mạng `supabase_default` gọi
`http://localhost:8000/rest/v1/` → **401** (đúng như từ máy thật = tới được, chỉ thiếu khoá).

## Hai vấn đề phát hiện khi chạy — cần biết

### 1. Supabase local CHƯA CÓ bucket nào

`listBuckets()` trả `[]` — **cả từ trong container lẫn từ máy thật**, nên đây là lỗ hổng sẵn có
của bộ Supabase local, không phải do đóng gói. Hệ quả: mọi thứ upload lên Storage (ảnh chat
messenger, avatar, bản cài app) sẽ hỏng cho tới khi tạo các bucket: `attachments`,
`app-releases`, `Chung công ty`, `delivery_pending`, `won_pending`.

### 2. CSP chặn đăng nhập Google — do đóng gói

`server.js` dùng `app.use(helmet())` mặc định → `script-src self`. Trên Render, SPA do một
service tĩnh RIÊNG phục vụ (`render-frontend.yaml`, `tubep-frontend-s30w.onrender.com`) nên
helmet không áp vào trang. Trong container này backend phục vụ CẢ HAI, nên CSP áp luôn lên SPA:

```
Loading the script https://accounts.google.com/gsi/client violates
Content Security Policy directive: script-src self
```

Đăng nhập bằng **email/mật khẩu và QR vẫn chạy**; chỉ nút Google chết. Muốn dùng Google thì phải
nới CSP trong `server.js` (thêm `accounts.google.com` vào `scriptSrc`/`frameSrc`) — đây là sửa
mã ảnh hưởng cả production, nên chưa làm, chờ quyết định.

## Cắt gọn bộ Supabase: 11 → 6 dịch vụ

File `E:supabasesupabasedockerdocker-compose.override.yml` (**tạo thêm, không sửa file gốc**)
đẩy 5 dịch vụ vào profile `day-du` nên mặc định không chạy:

| Tắt | RAM | Vì sao bỏ được |
|---|---:|---|
| `studio` | 253 MB | giao diện quản trị, app không gọi |
| `realtime` | 200 MB | app dùng Socket.IO — **0 file** gọi `.channel(` |
| `meta` | 120 MB | giao diện quản trị. Đang ngốn **42% CPU** |
| `imgproxy` | 80 MB | **0 chỗ** biến đổi ảnh |
| `functions` | 28 MB | **0 file** dùng Edge Functions |

### GoTrue phải GIỮ, dù không dùng để đăng nhập

Đếm trong mã: **0 file** gọi `supabase.auth` — app tự làm JWT. Nhưng tắt `auth` thì
`/api/health` trả **503 degraded**, container thành *unhealthy*. Nguyên nhân:
`config/supabaseRouter.js` probe vào `${SUPABASE_URL}/auth/v1/health`. Đã tái hiện đúng ca này.
GoTrue chỉ tốn 12–16 MB nên giữ là rẻ nhất. Muốn bỏ nốt thì phải đổi probe sang `/rest/v1/` —
sửa mã, ảnh hưởng cả production, nên chưa làm.

`supavisor` (pooler) cũng phải giữ: `SUPABASE_DB_URL` **và** `SUPABASE_DB_DIRECT_URL` đều dùng
user `postgres.your-tenant-id` — định dạng tenant của supavisor, Postgres trần không có role đó.
Đã đo: cả hai kết nối đều OK, 7.432 leads.

### Hai cái bẫy khi cài override

1. `.env` của Supabase đặt `COMPOSE_FILE=docker-compose.yml`. Khi biến này có giá trị, Compose
   **không tự nạp** `docker-compose.override.yml`. Phải thêm vào chuỗi đó, dấu phân cách trên
   Windows là **`;`** (thử `:` thì Compose không tìm ra file).
2. `.env` có tới 4 dòng nhắc `COMPOSE_FILE`; chỉ dòng **cuối cùng** có hiệu lực. Sửa nhầm dòng
   ví dụ trong phần chú thích là không ăn gì cả — đã vấp đúng lỗi này.
3. `api-gw` phụ thuộc `studio`, `storage` phụ thuộc `imgproxy`. Không ghi đè `depends_on` thì
   `up -d` báo *service is required but not enabled*. Dùng thẻ `!override` của Compose.

### Nghiệm thu sau khi cắt

| | Trước | Sau |
|---|---:|---:|
| Container Supabase | 11 | **6** |
| RAM tổng (kèm app) | 2.095 MB (chưa có app) | **1.281 MB** |
| PostgREST đếm users | 119 ms | **32 ms** |
| `crm_leads` | — | 7.432 bản ghi, **8 ms** |

`docker compose up -d` trong thư mục Supabase **không** làm sống lại 5 dịch vụ đã tắt — đã thử.
Hoàn tác: xoá `docker-compose.override.yml`, hoặc chạy `docker compose --profile day-du up -d`.
Bản `.env` gốc lưu ở `scratchpad/supabase.env.backup`.

## Bật máy thì làm gì

**Không phải làm gì cả.** Mở Docker Desktop, chờ khoảng một phút, vào `http://localhost:4000`.

Không cần chạy `npm run dev` nữa — trừ khi bạn đang SỬA MÃ (Docker là bản build, không hot reload).

Mọi container đều có `restart=unless-stopped`, nên:

| | Khi Docker Desktop khởi động |
|---|---|
| `beppro` (backend + frontend) | tự chạy |
| `supabase-db`, `-rest`, `-storage`, `-envoy`, `-pooler`, `-auth` | tự chạy |
| `studio`, `meta`, `realtime`, `imgproxy`, `functions` | **vẫn tắt** — đúng ý `unless-stopped` |

### Đã thử đúng kịch bản đó

Tắt cả 7 container rồi bật lại **cùng lúc** (mô phỏng máy khởi động):

```
supabase-auth  Restarting (1)     <- chờ db, Docker tự thử lại
…
TAT CA HEALTHY: beppro supabase-storage supabase-auth supabase-pooler
                supabase-rest supabase-db supabase-envoy
```

Sau đó: `/api/health` 200 · SPA 200 · `POST /api/auth/login` trả đúng lỗi backend · **7.432 leads**.
Không phải gõ lệnh nào.

### Sửa một lỗi trong entrypoint nhờ ca này

Vòng chờ cũ dùng `socat -u OPEN:/dev/null TCP:127.0.0.1:8000` — **vô dụng**: socat nghe sẵn nên
luôn trả 0 kể cả khi Supabase chết. Đo để chắc: cổng không ai nghe → mã 1; cổng có socat mà
upstream chết → vẫn **0**.

Đã đổi sang gửi HTTP thật tới `127.0.0.1:8000/rest/v1/`, chờ tối đa 120s
(`SUPABASE_WAIT_SEC`), và **nói ra** khi hết giờ thay vì im lặng khởi động rồi hỏng khó hiểu.
Quan trọng vì container này KHÔNG `depends_on` được Supabase — Supabase là compose project khác.

### Khi có trục trặc

```bash
docker ps                          # phải thấy đủ 7
docker compose logs -f beppro      # xem [cau-noi] và [cho]
curl http://localhost:4000/api/health
```
