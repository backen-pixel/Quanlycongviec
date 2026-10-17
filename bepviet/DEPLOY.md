# Triển khai website Bếp Việt lên Render

Website này là **frontend tĩnh độc lập**: không gọi API, không dùng chung code với
frontend ERP (`frontend/`) và không cần backend.

## Tạo Static Site trên Render (thủ công)

| Mục | Giá trị |
|---|---|
| Type | Static Site |
| Repository | repo hiện tại |
| Branch | `feat/web-ban-hang-tu-bep` |
| Root Directory | `bepviet` |
| Build Command | `npm ci --prefer-offline --no-audit && npm run build` |
| Publish Directory | `dist` |

Sau khi tạo, vào **Settings → Redirects/Rewrites** thêm:

| Source | Destination | Action |
|---|---|---|
| `/*` | `/index.html` | Rewrite |

Thiếu rule này thì truy cập thẳng `/san-pham` hoặc `/lien-he` sẽ ra 404.

## Hoặc dùng Blueprint

Render Blueprint chỉ đọc `render.yaml` ở **gốc repo**. Repo này đã có `render.yaml`
của hệ thống ERP ở gốc, nên dùng một trong hai cách:

- Copy `bepviet/render.yaml` ra gốc repo trên nhánh này (nhánh này không deploy ERP), hoặc
- Tách `bepviet/` thành repo riêng rồi đặt `render.yaml` ở gốc repo mới.

## Chạy tại máy

```bash
cd bepviet
npm install
npm run dev
```

Mặc định chạy ở http://localhost:5180 — không đụng cổng 5173 của frontend ERP.

## Nối dữ liệu từ ERP (tùy chọn)

Sản phẩm, giá và danh mục có thể quản lý trong ERP: **module Marketing → tab "Sản phẩm website"**.
Website đọc qua API công khai, không cần đăng nhập.

Thêm 2 biến môi trường cho Static Site trên Render (**Settings → Environment**):

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://tubep-backend.onrender.com` |
| `VITE_COMPANY_ID` | UUID công ty sở hữu website — hiện sẵn trong tab "Sản phẩm website" |

Biến đọc lúc **build**, nên đổi xong phải **Manual Deploy → Clear build cache & deploy**.

Cơ chế an toàn: thiếu biến, API lỗi, hoặc ERP chưa nhập mẫu nào → website tự dùng dữ liệu tĩnh
trong `src/data/sanPham.js`. Không bao giờ có trang trắng vì backend chết.

Phía ERP cần chạy `database/727_web_products.sql` trước khi nhập sản phẩm (xem nhánh
`feat/marketing-web-products`).

## Sửa nội dung

- Sản phẩm, danh mục, vật liệu, quy trình, cam kết: `src/data/sanPham.js`
- Tên công ty, hotline, email, địa chỉ: `src/data/thongTin.js`
- Ảnh sản phẩm: hiện sinh bằng SVG từ 2 mã màu `mau: ['#...', '#...']`.
  Có ảnh thật thì thêm `anh: '/anh/ten-file.jpg'` vào sản phẩm và để file trong `public/anh/`.

## Lưu ý

Form liên hệ mới chỉ validate và hiển thị màn hình cảm ơn ở phía trình duyệt —
**chưa gửi dữ liệu đi đâu**. Khi cần lưu lead, nối API tại `src/pages/LienHe.jsx`
(hàm `guiForm`).
