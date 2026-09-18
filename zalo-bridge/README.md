# Cổng Zalo cá nhân → CRM

Máy công ty giữ phiên đăng nhập của nhiều tài khoản Zalo cá nhân và đồng bộ tin
nhắn vào hộp thư CRM. Nhân viên trả lời khách ngay trong cửa sổ lead.

## Bố trí

```
Máy công ty (24/7)                         VPS
┌───────────────────────────────┐         ┌──────────────────────┐
│  Bộ điều phối                 │ HTTPS ─▶│ CRM /api/zalo-bridge │
│   ├── Cụm 0  (4 tài khoản)    │ ◀─ hỏi  │  · Supabase          │
│   ├── Cụm 1  (4 tài khoản)    │         │  · Socket.IO realtime│
│   └── Trang quản trị :8787    │         └──────────────────────┘
│  sessions/  spool/  qr/       │
└───────────────────────────────┘
```

**Mọi kết nối đều do máy công ty khởi tạo** — không mở cổng, không cần IP tĩnh,
không đụng router. Tin CRM cần gửi thì cổng chủ động hỏi mỗi vài giây.

Một cụm chết thì bộ điều phối dựng lại sau 5 giây và nạp lại phiên từ đĩa —
**không phải quét QR lại**. Các cụm khác không bị ảnh hưởng.

## Ngân sách bộ nhớ

Đo trên chính máy này (17/09/2026):

| | RSS |
|---|---|
| Node rỗng | 41 MB |
| Nền một tiến trình con (Node + zca-js, 0 phiên) | **79 MB** |
| Tiến trình con giữ 1 phiên Zalo | 99 MB |
| → Chi phí **mỗi phiên Zalo** | **~20 MB** |
| Bộ điều phối (không giữ phiên) | 75 MB |

Suy ra cho 15 tài khoản, `ACCOUNTS_PER_WORKER=4` (4 cụm):

```
75 + (4 × 79) + (15 × 20) = 691 MB RSS
```

RSS đếm trùng thư viện dùng chung nên số thật thấp hơn — cgroup đo bộ điều phối
kèm 1 cụm chỉ 75 MB trong khi tổng RSS là 174 MB. Máy còn ~3,3 GB trống nên
thoải mái.

⚠ Con số 20 MB đo với **một** phiên. Phiên có nhiều hội thoại đang hoạt động có
thể tốn hơn. Xem lại số thật khi đã thêm tài khoản: trang quản trị hiện RAM trống,
và `systemctl --user show zalo-bridge -p MemoryCurrent --value` cho bộ nhớ thật.

## Cài đặt

```bash
cd /home/bizmind/Quanlycongviec/zalo-bridge
npm install
cp .env.example .env
```

### 1. Migration

Chạy `database/558_zalo_personal_bridge.sql` rồi `database/559_zalo_gateway.sql`
trên Supabase.

### 2. Lấy khoá của máy

```sql
SELECT name, gateway_token FROM zalo_gateways;
```

Chép vào `.env` (`GATEWAY_TOKEN=`). Migration 559 đã tạo sẵn một máy tên
"Máy công ty".

### 3. Thêm tài khoản Zalo

```sql
INSERT INTO zalo_oa_accounts (oa_id, oa_name, account_kind, gateway_id, is_active, auto_create_lead)
VALUES ('personal:nv-hoa', 'Zalo Hoà', 'personal',
        (SELECT id FROM zalo_gateways WHERE name = 'Máy công ty'), true, false);
```

Cổng tự nhận tài khoản mới trong vòng một phút, không cần khởi động lại.

### 4. Chạy nền

```bash
cp zalo-bridge.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now zalo-bridge
loginctl enable-linger $USER
```

`ExecStart` trỏ tới Node của nvm theo đường dẫn tuyệt đối — systemd không đọc
PATH của shell nên `/usr/bin/node` sẽ báo `status=203/EXEC`. **Nâng cấp Node thì
phải sửa lại dòng đó** rồi `systemctl --user daemon-reload`.

### 5. Quét QR

Mở http://127.0.0.1:8787 trên máy công ty. Tài khoản nào cần đăng nhập sẽ hiện
mã QR ngay trên thẻ của nó. Mã cũng được đẩy lên CRM để admin quét từ xa.

## Vận hành

```bash
journalctl --user -u zalo-bridge -f          # xem log
systemctl --user restart zalo-bridge         # khởi động lại
curl -s http://127.0.0.1:8787/api/state      # trạng thái dạng JSON
```

Lệnh từ CRM (admin bấm nút, hoặc chèn vào `zalo_gateway_commands`):

| Lệnh | Tác dụng |
|---|---|
| `logout` | Huỷ phiên một tài khoản và xoá file đăng nhập — dùng khi nhân viên nghỉ |
| `restart` | Dựng lại toàn bộ các cụm |
| `relogin` | Như `restart` |

## Ranh giới riêng tư

Chỉ hội thoại **đã gắn vào một lead** mới được lưu nội dung. Hội thoại khác chỉ
báo về tên + thời điểm để nhân viên bấm gắn; nội dung không rời khỏi máy này —
cổng lọc trước khi gửi, backend kiểm lại lần nữa.

## Khoá và mã QR

`gateway_token` mở được mọi tài khoản gắn với máy này. `qr_image` cho phép đăng
nhập vào tài khoản Zalo tương ứng. Cả hai **không bao giờ trả ra API danh sách
tài khoản**; mã QR chỉ lấy được qua endpoint riêng dành cho admin.

Đổi khoá:

```sql
UPDATE zalo_gateways SET gateway_token = encode(gen_random_bytes(32), 'hex')
WHERE name = 'Máy công ty';
```

## Gửi tin cho ai

Đã kiểm thực tế: **gửi được cho cả bạn bè lẫn người lạ, chỉ cần có số điện thoại**.
Không phải kết bạn trước.

Nhưng có ba giới hạn không nằm ở code:

- **Tra số có thể không ra.** Khách tắt "cho phép tìm qua số điện thoại" trong phần
  riêng tư của Zalo thì tra không thấy, và kết quả giống hệt trường hợp không có
  Zalo — hệ thống không phân biệt được hai tình huống.
- **Tin cho người lạ có thể vào mục tin nhắn chờ** của khách thay vì hộp thư chính.
  Khách không để ý là không thấy.
- **Nhắn hàng loạt cho người lạ là đường nhanh nhất để mất tài khoản.** Zalo coi đó
  là spam. Kênh này hợp với việc nhân viên chủ động liên hệ từng khách đã có trong
  CRM, không hợp với chiến dịch gửi đồng loạt.

## Phụ thuộc zca-js

Ghim cứng phiên bản (`"zca-js": "2.2.0"`, không có `^`). Đây là thư viện dịch
ngược, một bản minor cũng có thể làm hỏng. Nâng phiên bản thì thử trên máy test
vài ngày rồi mới đưa lên máy chạy thật.

Zalo không có API cho tài khoản cá nhân — cách này đi ngoài điều khoản sử dụng
và tài khoản có thể bị khoá. Giữ Zalo OA làm kênh chính cho luồng bán hàng
quan trọng.
