# Ghi chú phát hành — SX Mobile (Quản lý sản xuất)

App Android `vn.tubeppro.sxmobile`. Phân phối qua bản APK trên kênh `production`
(`update_type = 'apk'`), app tự nhắc cập nhật qua `/api/app-updates/check`.

> **Lưu ý về OTA:** `runtimeVersion.policy = "appVersion"` nên bản OTA jsbundle chỉ
> tới được máy đang chạy **đúng** số phiên bản đó. Không dùng OTA để nâng cấp giữa
> hai phiên bản khác nhau, và không bao giờ dùng OTA cho thay đổi native hoặc cách
> đóng gói APK. Tính đến 1.1.120, dự án chưa từng phát hành bản OTA jsbundle nào.

Bản mới nhất ở trên cùng.

---

## 1.1.120 (build 223) — 22/09/2026

Thay thế **1.1.118 (build 221)**. Bản 1.1.119 chỉ tồn tại trong lúc phát triển,
chưa từng phát hành.

### Thay đổi ảnh hưởng tới thao tác hằng ngày

Bỏ lựa chọn **"tất cả công ty"** ở ba màn Tổng quan, Dự án và Công việc. Mỗi công ty
có pipeline riêng, nên khi gộp, dự án bị dồn vào những giai đoạn không thuộc về chúng
và số liệu hiển thị sai. Nay công ty là phạm vi bắt buộc: lần đầu mở app tự chọn công
ty đầu danh sách, sau đó ghi nhớ lựa chọn. Nút "Xóa lọc" không còn xóa công ty, vì đó
không còn là bộ lọc tùy chọn.

Chỉ tài khoản **quản trị hệ thống** thấy thay đổi này. Người dùng gắn với một công ty
vốn đã bị khóa theo công ty của mình.

### Sửa lỗi

Đăng xuất rồi đăng nhập lại — hoặc đổi sang tài khoản khác — không còn kẹt ở màn
"Đang tải giao diện…".

### Ổn định

Giới hạn bộ nhớ cache dự án theo **tổng số dự án** đang giữ thay vì đếm số bảng.
Trước đây mở lần lượt nhiều công ty lớn khiến bộ nhớ tăng liên tục, có nguy cơ bị
Android đóng app trên máy 2–3 GB RAM.

Bỏ một vòng vẽ lại thừa ở mỗi thẻ dự án, hết hiện tượng thanh tiến độ chớp một nhịp
khi cuộn.

### Dung lượng và tốc độ

Thư viện native không còn nén trong APK. App khởi động nhanh hơn và **chiếm ít hơn
khoảng 9 MB** trên máy sau khi cài, vì không còn lưu hai bản. Đổi lại **file tải về
tăng từ 23 MB lên 37 MB** — người dùng mạng yếu sẽ cảm nhận ở lần cập nhật này.

### Không có trong bản này

**Độ giật khi cuộn màn Dự án chưa được khắc phục.** Đo trên máy thật (vivo V2143,
Android 13, màn 90Hz): khoảng 28ms mỗi khung ở màn Dự án so với 17ms ở màn Công việc.
Trace Perfetto cho thấy luồng UI chỉ làm 0,57ms mỗi khung và `measure`/`layout` không
xuất hiện — nút thắt nằm ở RenderThread, kèm vẽ chồng 3 lớp toàn màn hình. Nguyên nhân
của các lớp vẽ chồng đó **chưa xác định được**. Đừng hứa với người dùng là bản này
cuộn mượt hơn.

### Kiểm thử trước phát hành

- LDPlayer 9 (Android 9, tài khoản quản trị hệ thống): kiểm chứng việc bỏ lọc
  "tất cả công ty" — đường này không kiểm được trên tài khoản gắn công ty.
- vivo V2143 (Android 13, tài khoản quản trị SX của HCB): đi hết 11 màn, **0 lỗi**
  của tiến trình app. Khởi động nguội 560–970ms.
- Đăng xuất → đăng nhập lại trong **cùng một tiến trình** (PID không đổi): vào thẳng
  Tổng quan, không kẹt.

### Commit

| Commit | Nội dung |
|---|---|
| `c6f12dbf` | Bỏ lọc "tất cả công ty"; `.so` không nén trong APK; nâng 1.1.120/223 |
| `bfa902f5` | Không kẹt "Đang tải giao diện" khi đăng nhập lại |
| `3617bb67` | Giới hạn cache board theo số dự án; bỏ vòng render thừa mỗi thẻ |

---

## 1.1.118 (build 221)

Tối ưu hiệu năng (cache comments/shared/members, Work page 100, Messages throttle);
bình luận kiểu chat kèm nút "Tin mới"; chuyển Không gian chung và Bình luận sang
FlatList.
