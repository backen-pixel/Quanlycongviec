# CRM Mobile v2

App CRM **hoàn toàn mới** (Expo + React Native + TypeScript), xây lại từ đầu theo bộ giao diện tối (dark) trong mockup — không phụ thuộc vào app `crm-mobile` cũ.

## Điểm nổi bật

- **Nút "Tạo mới" nổi ở giữa thanh tab**: nền gradient cam cháy đa sắc, có vòng phát sáng (glow) nhấp nháy, nhô cao khỏi thanh menu, kèm label "Tạo mới". Bấm vào → dấu `+` xoay thành `×` và mở popup chọn **Thêm Lead / Thêm Deal**.
- **Màn hình CRM (tab Planner)**: chuyển nhanh Leads ⇄ Deals, thẻ thống kê, bộ lọc chip, cảnh báo quá hạn, danh sách lead/deal.
- **Màn hình Ghi âm**: header gradient, lọc theo trạng thái ghép CRM, thẻ ghi âm với thanh phát có tiến độ và các hành động (Gắn KH/Lead, Quét, Tạo KH + Lead/Deal, Xóa).
- **Tin nhắn**: bố cục giống app **Xưởng SX** — ô tìm kiếm, hàng "story" liên hệ, tab Chats/Cuộc gọi, danh sách hội thoại + màn chat chi tiết với bong bóng tin nhắn và thanh soạn.

> Dữ liệu hiện là **mock** (`src/data/mock.ts`) để app chạy độc lập. Khi ghép backend, thay mock bằng API tương ứng.

## Cấu trúc

```
src/
  theme/        Hệ màu, bo góc, gradient, shadow
  data/mock.ts  Dữ liệu mẫu
  context/      CreateMenuContext (state popup Tạo mới)
  navigation/   RootNavigator (stack) + RootTabs (bottom tab) + types
  components/    FloatingCreateButton, CustomTabBar, CreateMenuSheet, Avatar, Chip, StatCard
  screens/      CrmHub, Recordings, Messages, ChatDetail, Menu, CreateEntity
```

## Chạy thử

```bash
cd crm-mobile-v2
npm install
npm start          # mở Expo, quét QR bằng Expo Go
# hoặc
npm run android
```
