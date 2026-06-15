# TủBếp CRM – Plugin SketchUp "Gửi tính giá"

Plugin cho phép gửi model SketchUp thẳng sang **module Tính toán** của TủBếp CRM chỉ bằng một nút bấm: plugin tự quét các chi tiết (component/group), lấy tên + kích thước W×H×D (mm) + số lượng, rồi đẩy lên server để tự khớp loại sản phẩm và tính giá.

> Vì sao cần plugin? File `.skp` là định dạng binary đóng của Trimble, chỉ đọc được bằng SketchUp SDK (Windows/Mac). Backend chạy trên Linux nên không đọc trực tiếp được. Plugin chạy ngay trong SketchUp — nơi đã mở sẵn file — nên lấy kích thước chính xác mà không cần gửi file `.skp` nặng lên mạng.

## Cấu trúc

```
sketchup-plugin/
  tubep_crm_calc.rb          ← loader (đăng ký extension)
  tubep_crm_calc/
    main.rb                  ← lõi: trích xuất + gửi API + menu
```

## Đóng gói thành file cài đặt (.rbz)

File `.rbz` thực chất là một file `.zip` đổi đuôi. Nén **2 mục** `tubep_crm_calc.rb` và thư mục `tubep_crm_calc/` (giữ nguyên cấu trúc, không bọc thêm thư mục cha):

PowerShell (Windows):

```powershell
cd sketchup-plugin
Compress-Archive -Path tubep_crm_calc.rb, tubep_crm_calc -DestinationPath tubep_crm_calc.zip -Force
Rename-Item tubep_crm_calc.zip tubep_crm_calc.rbz
```

macOS / Linux:

```bash
cd sketchup-plugin
zip -r tubep_crm_calc.rbz tubep_crm_calc.rb tubep_crm_calc
```

## Cài vào SketchUp

1. Mở SketchUp → menu **Extensions** (hoặc **Window**) → **Extension Manager**.
2. Bấm **Install Extension** → chọn file `tubep_crm_calc.rbz`.
3. Sau khi cài, có menu **Plugins → TủBếp CRM** và một thanh công cụ "TủBếp CRM".

## Cấu hình kết nối (làm 1 lần)

**Plugins → TủBếp CRM → Cấu hình kết nối…** rồi nhập:

| Trường | Ý nghĩa |
|---|---|
| Địa chỉ máy chủ | Mặc định `https://tubep-backend.onrender.com`. Nếu chạy local thì nhập `http://localhost:4000`. |
| Email đăng nhập | Tài khoản TủBếp CRM của bạn. |
| Mật khẩu | Mật khẩu tài khoản (lưu cục bộ trên máy để đăng nhập tự động). |
| Mã danh mục (tùy chọn) | Để trống = tự động khớp theo từ khóa. Điền `category_id` nếu chỉ muốn khớp trong 1 danh mục. |

## Sử dụng

1. Mở file `.skp`. Đảm bảo các bộ phận được **nhóm thành Component/Group và có đặt tên** (ví dụ: "Hông tủ", "Nóc", "Đáy", "Cánh"). Phần không đặt tên sẽ hiện là "(không tên)".
2. Bấm **Plugins → TủBếp CRM → Gửi model sang tính giá** (hoặc nút trên thanh công cụ).
3. Plugin hiện danh sách chi tiết tìm được để xem trước → bấm **OK** để gửi.
4. Mở web TủBếp CRM → **Tính toán → Tính từ file 3D / Cutlist** để xem kết quả (bản ghi có định dạng `sketchup`).

## Cơ chế trích xuất

- Duyệt đệ quy toàn model, chỉ lấy component/group **lá** (không chứa instance con) — đó thường là các tấm/chi tiết thật.
- Kích thước lấy từ bounding box: `W = bb.width (X)`, `D = bb.height (Y)`, `H = bb.depth (Z)`, quy về **mm** và làm tròn.
- Gộp các chi tiết **trùng tên + trùng kích thước** thành 1 dòng, cộng dồn số lượng.

## Lưu ý

- Kích thước dùng bounding box (hộp bao) nên chuẩn nhất với chi tiết thẳng trục; chi tiết xoay nghiêng có thể lệch chút.
- Token đăng nhập hết hạn qua đêm — plugin tự đăng nhập lại bằng email/mật khẩu đã lưu mỗi lần gửi.
- Endpoint phía server: `POST /api/calc/import-items`.
