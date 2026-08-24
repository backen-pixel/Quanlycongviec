# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 12/07/2026 – 17/07/2026 |
| **Ngày lập** | 21/07/2026 |
| **Số commit** | 6 |

---

## Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / Kanban | Sửa lỗi **Kanban CRM trống với nhân viên** trên pipeline chia theo vùng (region-split). Nguyên nhân: stage chỉ được load đúng khi là admin; NV không thấy cột/thẻ dù đã chọn vùng. Điều chỉnh load stage theo pipeline vùng đã chọn cho **mọi user**; tự chọn vùng khi NV chỉ có 1 crm region. | NV sales xem đủ cột và thẻ Kanban theo vùng được phân quyền; không còn màn hình trống sau khi chọn pipeline vùng. Admin vẫn giữ hành vi lọc công ty như cũ. | Hoàn thành |
| 2 | Lịch / Sự kiện | Sửa sự kiện **không hiện trên calendar / Events feed** khi `company_id` = null. Bổ sung bắt buộc và gửi `company_id` khi tạo sự kiện; cải thiện UX lọc công ty CRM cho admin để filter trống Metalla/NextGo và pipeline region-split **không làm ẩn dữ liệu**. | Sự kiện tạo mới luôn gắn `company_id`; lịch và feed hiển thị đủ sự kiện. Admin lọc công ty CRM không bị mất dữ liệu khi filter rỗng hoặc pipeline chia vùng. | Hoàn thành |
| 3 | Dashboard CRM / SX | Tối ưu tốc độ tải dashboard: khôi phục **stale-while-revalidate (SWR)** trên CRM; tách progress RAF trong `DashboardLoaderGate`; rút ngắn thời gian loader tối thiểu; giảm **reload full board SX** khi nhận socket. | CRM/SX dashboard mở nhanh hơn, ít nháy loader; dữ liệu cũ vẫn hiện trong lúc refetch; SX ít bị reload toàn board không cần thiết khi có sự kiện realtime. | Hoàn thành |
| 4 | Sản xuất (web) | Sửa lỗi build/runtime do **khai báo trùng** hàm `startOfLocalDay` trong `sxPipelineRevenue`. | Module tính doanh thu pipeline SX chạy ổn định, không còn lỗi trùng declaration khi load dashboard/KPI. | Hoàn thành |

---

## Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Messenger (Web + App) | Đồng bộ **hình nền chat Messenger** giữa web và app: wallpaper lưu phía server (migration `messenger_chat_wallpapers`), API nhóm Messenger hỗ trợ get/set nền; client web (`LeadChatTabs`, ConversationDetail) và sx-mobile (`ChatDetailInfo`, `chatWallpaperStorage`) dùng chung nền theo hội thoại. Giữ parity UI chat (cluster tin nhắn, header, file actions). | Web và mobile cùng thấy một hình nền chat theo nhóm/hội thoại; đổi nền trên một nền tảng phản ánh sang nền tảng kia. UI chat thống nhất hơn về hiển thị tin nhắn và thông tin cuộc trò chuyện. | Hoàn thành |
| 2 | SX Mobile | Checkpoint và mở rộng **sx-mobile** song song với web: màn Overview (KPI board), Overdue projects, Settings; `KanbanDealTimeline`; tab comment dự án (đính kèm, mention, gallery, download progress); cache board + KPI SX; cải thiện Profile, Project detail/list, navigation MainTabs; đồng bộ production API/realtime. | App SX mobile có Overview / Quá hạn / Cài đặt; comment dự án hỗ trợ đính kèm và mention; Kanban và KPI gần với web hơn; nền tảng sẵn sàng cho các vòng release tiếp theo. | Hoàn thành |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **14/07** | Messenger wallpaper (web/app) + checkpoint SX mobile WIP; tối ưu dashboard CRM/SX (SWR, loader); sửa duplicate `startOfLocalDay` |
| **15/07** | Sửa Kanban trống với NV trên pipeline chia vùng |
| **17/07** | Sửa sự kiện thiếu `company_id`; cải thiện lọc công ty CRM cho admin |

---

*Nguồn: git log author MinDuc, 12/07–17/07/2026.*
