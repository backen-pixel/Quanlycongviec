// SINH TỰ ĐỘNG bởi scripts/guide/generate-registry.js — KHÔNG SỬA TAY.
// Chạy lại: npm run guide:sync (ở backend/, xem package.json).
// Chỉ path/label/menu — dùng cho matchScreen() phía client. Chi tiết tra cứu nằm ở backend.

export const SCREEN_REGISTRY = [
  {
    "path": "/",
    "label": "Trang mặc định",
    "menu": ""
  },
  {
    "path": "/admin/trash",
    "label": "Thùng rác (tổng hợp)",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/approval-rules",
    "label": "Quy tắc duyệt",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/calc",
    "label": "Trang chính",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/history",
    "label": "Lịch sử tính",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/hop-cung",
    "label": "Tính hộp cứng",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/hop-cung/thiet-ke",
    "label": "Thiết kế hộp cứng",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/import-3d",
    "label": "Tính từ file 3D",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/run",
    "label": "Tính nhanh",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/calc/setup",
    "label": "Danh mục / Loại / Công thức / Rule",
    "menu": "2. Cấu hình"
  },
  {
    "path": "/companies",
    "label": "Công ty",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/company-processes",
    "label": "QT nội bộ công ty",
    "menu": ""
  },
  {
    "path": "/crm",
    "label": "/crm",
    "menu": ""
  },
  {
    "path": "/crm/activity",
    "label": "Đang hoạt động",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/crm/admin/sla-watchlist",
    "label": "SLA Lead/Deal (quản trị)",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/assignments",
    "label": "Giao việc CRM",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/auto-project-config",
    "label": "Auto tạo dự án",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/blocked-phones",
    "label": "Chặn KH (SĐT)",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/categories",
    "label": "Nhóm ngành",
    "menu": "CRM → Dữ liệu"
  },
  {
    "path": "/crm/customers",
    "label": "Khách hàng",
    "menu": "CRM → Dữ liệu"
  },
  {
    "path": "/crm/daily-reports",
    "label": "Báo cáo hằng ngày",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/daily-reports/history",
    "label": "Lịch sử công việc ngày",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/dashboard",
    "label": "Dashboard CRM",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/crm/deadline-settings",
    "label": "Cấu hình Deadline CRM",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/dept-plan",
    "label": "Kế hoạch phòng ban",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/download-app",
    "label": "Tải app CRM",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/crm/events",
    "label": "Sự kiện",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/crm/events/overview",
    "label": "Tổng quan sự kiện",
    "menu": ""
  },
  {
    "path": "/crm/executive-kpi",
    "label": "KPI Giám đốc",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/facebook",
    "label": "Facebook",
    "menu": "CRM → Kênh chat"
  },
  {
    "path": "/crm/facebook/link-phone-cleanup",
    "label": "Dọn SĐT từ link",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/follow-up-care",
    "label": "CSKH theo hạn",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/invoices",
    "label": "Hóa đơn",
    "menu": "CRM → Tài chính"
  },
  {
    "path": "/crm/invoices/:id",
    "label": "Chi tiết hóa đơn",
    "menu": ""
  },
  {
    "path": "/crm/invoices/:id/edit",
    "label": "Sửa hóa đơn",
    "menu": ""
  },
  {
    "path": "/crm/invoices/new",
    "label": "Tạo hóa đơn",
    "menu": ""
  },
  {
    "path": "/crm/kpi/company",
    "label": "KPI Nhân viên (Tổng quan)",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/deal",
    "label": "KPI Deal (Tủ bếp)",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/guide",
    "label": "Hướng dẫn KPI",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/sales-admin",
    "label": "KPI Sales Admin (Tủ bếp)",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/scorecard",
    "label": "Scorecard KPI tháng",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/settings",
    "label": "Cấu hình KPI Tủ bếp",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/kpi/verify-b",
    "label": "Verify KPI nhóm B",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/lead-journey",
    "label": "Hành trình Lead",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/leads/:id",
    "label": "Chi tiết Lead / Deal",
    "menu": ""
  },
  {
    "path": "/crm/leaves",
    "label": "Lịch nghỉ",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/crm/leaves/list",
    "label": "Danh sách nghỉ phép",
    "menu": ""
  },
  {
    "path": "/crm/messenger",
    "label": "Nhóm chat",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/crm/orders",
    "label": "Đơn hàng",
    "menu": "CRM → Tài chính"
  },
  {
    "path": "/crm/orders/:id",
    "label": "Chi tiết đơn hàng",
    "menu": ""
  },
  {
    "path": "/crm/orders/:id/edit",
    "label": "Sửa đơn hàng",
    "menu": ""
  },
  {
    "path": "/crm/orders/new",
    "label": "Tạo đơn hàng",
    "menu": ""
  },
  {
    "path": "/crm/pipeline",
    "label": "Pipeline CRM",
    "menu": ""
  },
  {
    "path": "/crm/pipeline-settings",
    "label": "Pipeline",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/products",
    "label": "Sản phẩm",
    "menu": "CRM → Dữ liệu"
  },
  {
    "path": "/crm/quotations",
    "label": "Báo giá",
    "menu": "CRM → Tài chính"
  },
  {
    "path": "/crm/quotations/:id",
    "label": "Chi tiết / sửa báo giá",
    "menu": ""
  },
  {
    "path": "/crm/quotations/new",
    "label": "Tạo báo giá",
    "menu": ""
  },
  {
    "path": "/crm/reports",
    "label": "Báo cáo",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/reports/org-overview",
    "label": "BC theo tổ chức",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/reports/staff-lead-deal",
    "label": "BC Lead/Deal theo NV",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/settings/deal-stage-report",
    "label": "Phân loại cột BC Deal",
    "menu": "CRM → KPI & báo cáo"
  },
  {
    "path": "/crm/sources-settings",
    "label": "Nguồn & phân loại",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/task-templates",
    "label": "Bộ mẫu CRM",
    "menu": "CRM → Quản trị CRM"
  },
  {
    "path": "/crm/tasks",
    "label": "Công việc CRM",
    "menu": "CRM → Bán hàng"
  },
  {
    "path": "/crm/zalo",
    "label": "Zalo OA",
    "menu": "CRM → Kênh chat"
  },
  {
    "path": "/customers",
    "label": "Khách hàng",
    "menu": "2. Làm việc"
  },
  {
    "path": "/customers/:id",
    "label": "Chi tiết khách hàng",
    "menu": ""
  },
  {
    "path": "/dashboard",
    "label": "Tổng hợp Quản lý",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/dashboard/classic",
    "label": "/dashboard/classic",
    "menu": ""
  },
  {
    "path": "/dashboard/divisions",
    "label": "/dashboard/divisions",
    "menu": ""
  },
  {
    "path": "/departments",
    "label": "Phòng ban",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/departments/:id/chat",
    "label": "Chat phòng ban",
    "menu": ""
  },
  {
    "path": "/drive",
    "label": "Drive lưu trữ",
    "menu": "2. Làm việc"
  },
  {
    "path": "/drive/folder/:folderId",
    "label": "Thư mục Drive",
    "menu": ""
  },
  {
    "path": "/drive/root/:rootId",
    "label": "Drive gốc",
    "menu": ""
  },
  {
    "path": "/drive/view/:view",
    "label": "Khung xem Drive",
    "menu": ""
  },
  {
    "path": "/ecosystem",
    "label": "Cấu trúc công ty",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/ecosystem-levels",
    "label": "Cấp bậc HST",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/ecosystem-permissions",
    "label": "Phân quyền hệ sinh thái",
    "menu": ""
  },
  {
    "path": "/ecosystem/app-modules",
    "label": "Module tùy chỉnh",
    "menu": ""
  },
  {
    "path": "/ecosystem/app-modules/:moduleKey",
    "label": "Cấu hình module tùy chỉnh",
    "menu": ""
  },
  {
    "path": "/ecosystem/modules",
    "label": "Module & Khối",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/guide",
    "label": "Hướng dẫn sử dụng",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/ketoan",
    "label": "Module Kế toán",
    "menu": ""
  },
  {
    "path": "/ketoan/bank-accounts",
    "label": "Tài khoản NH",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/ketoan/dashboard",
    "label": "Tổng hợp deal SX",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/ketoan/deals/:leadId",
    "label": "Chi tiết kế toán của deal",
    "menu": ""
  },
  {
    "path": "/knowledge",
    "label": "Kiến thức",
    "menu": "CRM → Thông báo"
  },
  {
    "path": "/knowledge/admin",
    "label": "Quản trị kiến thức",
    "menu": "Sản xuất → 2. Quản lý nội dung"
  },
  {
    "path": "/knowledge/certificates",
    "label": "Chứng nhận của tôi",
    "menu": "Sản xuất → 1. Học tập"
  },
  {
    "path": "/knowledge/certificates/:id",
    "label": "Chi tiết chứng nhận",
    "menu": ""
  },
  {
    "path": "/knowledge/exercises/:id",
    "label": "Làm bài tập",
    "menu": ""
  },
  {
    "path": "/knowledge/lessons/:id",
    "label": "Học bài",
    "menu": ""
  },
  {
    "path": "/knowledge/my-history",
    "label": "Lịch sử bài làm",
    "menu": "Sản xuất → 1. Học tập"
  },
  {
    "path": "/knowledge/scoreboard",
    "label": "Bảng điểm công ty",
    "menu": "Sản xuất → 2. Quản lý nội dung"
  },
  {
    "path": "/login",
    "label": "Đăng nhập",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey",
    "label": "Module tùy chỉnh (Kanban)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/activity",
    "label": "Đang hoạt động (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/assignments",
    "label": "Giao việc (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/events",
    "label": "Sự kiện (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/leaves",
    "label": "Lịch nghỉ (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/leaves/list",
    "label": "Danh sách nghỉ (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/messenger",
    "label": "Nhóm chat (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/records/:recordId",
    "label": "Chi tiết thẻ (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/settings",
    "label": "Cài đặt module tùy chỉnh",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/social",
    "label": "Bảng tin (module tùy chỉnh)",
    "menu": ""
  },
  {
    "path": "/m/:moduleKey/trash",
    "label": "/m/:moduleKey/trash",
    "menu": ""
  },
  {
    "path": "/management",
    "label": "Tổng hợp Quản lý",
    "menu": ""
  },
  {
    "path": "/management/backup-sync",
    "label": "Giám sát Supabase",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/management/crm-overview",
    "label": "Tổng quan CRM",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/management/deals/:leadId",
    "label": "Deal hợp nhất (Quản lý)",
    "menu": ""
  },
  {
    "path": "/management/mcp-api",
    "label": "MCP API báo cáo",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/management/production-overview",
    "label": "Sản xuất",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/management/production-overview/:id",
    "label": "/management/production-overview/:id",
    "menu": ""
  },
  {
    "path": "/management/project-deadlines",
    "label": "Cảnh báo hạn công trình",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/management/purchasing-overview",
    "label": "Mua hàng",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/management/quotes-overview",
    "label": "Dự toán & Báo giá",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/management/work-overview",
    "label": "Tổng quan công việc",
    "menu": "1. Tổng quan"
  },
  {
    "path": "/management/work-unified",
    "label": "Dự án",
    "menu": "2. Làm việc"
  },
  {
    "path": "/management/work-unified/:id",
    "label": "/management/work-unified/:id",
    "menu": ""
  },
  {
    "path": "/modules",
    "label": "Bảng giá & gói dịch vụ",
    "menu": ""
  },
  {
    "path": "/modules/checkout/:purchaseId",
    "label": "Thanh toán đơn mua gói",
    "menu": ""
  },
  {
    "path": "/modules/payment/return",
    "label": "Kết quả thanh toán",
    "menu": ""
  },
  {
    "path": "/mua-hang",
    "label": "Inbox Mua hàng",
    "menu": "1. Lệnh đặt hàng"
  },
  {
    "path": "/mua-hang/brands",
    "label": "Thương hiệu",
    "menu": "2. Catalog"
  },
  {
    "path": "/mua-hang/categories",
    "label": "Danh mục",
    "menu": "2. Catalog"
  },
  {
    "path": "/mua-hang/orders",
    "label": "Danh sách lệnh đặt hàng",
    "menu": ""
  },
  {
    "path": "/mua-hang/orders/:id",
    "label": "Chi tiết lệnh đặt hàng",
    "menu": ""
  },
  {
    "path": "/mua-hang/orders/:id/edit",
    "label": "Sửa lệnh đặt hàng",
    "menu": ""
  },
  {
    "path": "/mua-hang/orders/new",
    "label": "Tạo lệnh đặt hàng",
    "menu": ""
  },
  {
    "path": "/mua-hang/products",
    "label": "Sản phẩm",
    "menu": "2. Catalog"
  },
  {
    "path": "/my-tasks",
    "label": "/my-tasks",
    "menu": ""
  },
  {
    "path": "/permissions",
    "label": "Phân quyền",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/personal-tasks",
    "label": "NV cá nhân",
    "menu": "2. Làm việc"
  },
  {
    "path": "/platform",
    "label": "Tổng quan SaaS",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/billing",
    "label": "Gói thuê bao",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/modules",
    "label": "Modun add-on",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/plans",
    "label": "4 gói chính",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/purchases",
    "label": "Đơn mua & thông báo",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/stats",
    "label": "Thống kê chi tiết",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/tenants",
    "label": "Hệ sinh thái",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/tenants/:id",
    "label": "Chi tiết hệ sinh thái",
    "menu": ""
  },
  {
    "path": "/platform/tier-features",
    "label": "Tính năng theo gói",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/platform/users",
    "label": "Users toàn nền tảng",
    "menu": "Nền tảng SaaS"
  },
  {
    "path": "/privacy",
    "label": "Chính sách quyền riêng tư",
    "menu": ""
  },
  {
    "path": "/production/assignments",
    "label": "/production/assignments",
    "menu": ""
  },
  {
    "path": "/products",
    "label": "Sản phẩm",
    "menu": "2. Làm việc"
  },
  {
    "path": "/project-workflow",
    "label": "/project-workflow",
    "menu": ""
  },
  {
    "path": "/projects",
    "label": "Dự án",
    "menu": "2. Làm việc"
  },
  {
    "path": "/projects/:id",
    "label": "Chi tiết dự án",
    "menu": ""
  },
  {
    "path": "/projects/create",
    "label": "Tạo dự án",
    "menu": ""
  },
  {
    "path": "/s/:token",
    "label": "/s/:token",
    "menu": ""
  },
  {
    "path": "/settings/ai-chat-bot",
    "label": "AI Bot trong chat",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/settings/api-keys",
    "label": "API Key tích hợp",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/settings/app-updates",
    "label": "Cập nhật App",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/settings/devices",
    "label": "Thiết bị đăng nhập",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/settings/location",
    "label": "Vị trí làm việc",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/settings/misa",
    "label": "MISA meInvoice",
    "menu": "CRM → Tài chính"
  },
  {
    "path": "/settings/password",
    "label": "Đổi mật khẩu",
    "menu": "CRM → Hỗ trợ & công cụ"
  },
  {
    "path": "/settings/pdf",
    "label": "Thông tin PDF",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/settings/qr-scan",
    "label": "QR đăng nhập app",
    "menu": ""
  },
  {
    "path": "/settings/request-monitor",
    "label": "Theo dõi Request",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/settings/theme",
    "label": "Giao diện & Hình nền",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/settings/tro-ly-huong-dan",
    "label": "Trợ lý hướng dẫn",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/setup",
    "label": "Thiết lập HST",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/social",
    "label": "Bảng tin nội bộ",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/social/u/:userId",
    "label": "Trang cá nhân",
    "menu": ""
  },
  {
    "path": "/stage-groups",
    "label": "Nhóm quy trình",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/stage/:slug",
    "label": "Màn hình giai đoạn",
    "menu": ""
  },
  {
    "path": "/sx",
    "label": "Module Sản xuất",
    "menu": ""
  },
  {
    "path": "/sx/approvals",
    "label": "Duyệt xưởng",
    "menu": ""
  },
  {
    "path": "/sx/assignments",
    "label": "Giao việc Sản xuất",
    "menu": "Sản xuất → 1. Tổng quan"
  },
  {
    "path": "/sx/dashboard",
    "label": "Dashboard xưởng",
    "menu": "Sản xuất → 1. Tổng quan"
  },
  {
    "path": "/sx/download-app",
    "label": "Tải app Xưởng",
    "menu": "Sản xuất → 4. Hỗ trợ"
  },
  {
    "path": "/sx/events",
    "label": "Sự kiện Sản xuất",
    "menu": ""
  },
  {
    "path": "/sx/handover-settings",
    "label": "Bàn giao CRM → SX (nâng cao)",
    "menu": "Sản xuất → 3. Điều hành xưởng"
  },
  {
    "path": "/sx/pipeline",
    "label": "Pipeline xưởng",
    "menu": ""
  },
  {
    "path": "/sx/pipeline-settings",
    "label": "Pipeline xưởng",
    "menu": "Sản xuất → 3. Điều hành xưởng"
  },
  {
    "path": "/sx/projects/:id",
    "label": "Chi tiết dự án xưởng",
    "menu": ""
  },
  {
    "path": "/sx/regions",
    "label": "Khu vực",
    "menu": "Sản xuất → 3. Điều hành xưởng"
  },
  {
    "path": "/sx/task-templates",
    "label": "Bộ mẫu nhiệm vụ xưởng",
    "menu": "Sản xuất → 3. Điều hành xưởng"
  },
  {
    "path": "/sx/trash",
    "label": "/sx/trash",
    "menu": ""
  },
  {
    "path": "/tasks",
    "label": "Tất cả CV",
    "menu": "2. Làm việc"
  },
  {
    "path": "/tasks/regions",
    "label": "Khu vực công ty",
    "menu": "2. Làm việc"
  },
  {
    "path": "/teams",
    "label": "Team",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/template-sets",
    "label": "Bộ quy trình mẫu",
    "menu": ""
  },
  {
    "path": "/template-sets/:setId",
    "label": "Chi tiết bộ quy trình mẫu",
    "menu": ""
  },
  {
    "path": "/templates",
    "label": "Dự án mẫu",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/tools/voice-recordings",
    "label": "Cuộc gọi & ghi âm",
    "menu": "CRM → Tổng quan"
  },
  {
    "path": "/trash",
    "label": "/trash",
    "menu": ""
  },
  {
    "path": "/updates",
    "label": "Có gì mới?",
    "menu": "CRM → Thông báo"
  },
  {
    "path": "/users",
    "label": "Nhân viên",
    "menu": "3. Hệ thống"
  },
  {
    "path": "/vc",
    "label": "Module Vận chuyển / Lắp đặt",
    "menu": ""
  },
  {
    "path": "/vc/assignments",
    "label": "Giao việc Lắp đặt",
    "menu": "Vận chuyển → 1. Tổng quan"
  },
  {
    "path": "/vc/dashboard",
    "label": "Kanban Lắp đặt",
    "menu": "2. Theo dõi SX"
  },
  {
    "path": "/vc/download-app",
    "label": "Tải app Lắp đặt",
    "menu": "Vận chuyển → 4. Hỗ trợ"
  },
  {
    "path": "/vc/events",
    "label": "Sự kiện Lắp đặt",
    "menu": ""
  },
  {
    "path": "/vc/pipeline-settings",
    "label": "Pipeline Lắp đặt",
    "menu": "Vận chuyển → 3. Điều hành Lắp đặt"
  },
  {
    "path": "/vc/projects/:id",
    "label": "Chi tiết dự án Lắp đặt",
    "menu": ""
  },
  {
    "path": "/vc/task-templates",
    "label": "Bộ nhiệm vụ Lắp đặt",
    "menu": "Vận chuyển → 3. Điều hành Lắp đặt"
  },
  {
    "path": "/vc/teams",
    "label": "Quản lý Đội nhóm",
    "menu": "Vận chuyển → 3. Điều hành Lắp đặt"
  },
  {
    "path": "/vc/trash",
    "label": "/vc/trash",
    "menu": ""
  },
  {
    "path": "/work",
    "label": "/work",
    "menu": ""
  },
  {
    "path": "/work/flows",
    "label": "Setup luồng",
    "menu": "3. Thiết lập"
  },
  {
    "path": "/workflow-flows",
    "label": "Quản lý luồng",
    "menu": ""
  },
  {
    "path": "/workflow-hub",
    "label": "Quản lý quy trình",
    "menu": "2. Làm việc"
  },
  {
    "path": "/workflow-settings",
    "label": "Quy trình & KH",
    "menu": "4. Cài đặt"
  },
  {
    "path": "/workspace/org-setup",
    "label": "Tổ chức nhanh",
    "menu": "2. Làm việc"
  }
];

export const MODULE_INDEX = [
  {
    "module": "Khác",
    "groups": []
  },
  {
    "module": "CRM",
    "groups": [
      "Quản trị CRM",
      "Tổng quan",
      "KPI & báo cáo",
      "Bán hàng",
      "Dữ liệu",
      "Hỗ trợ & công cụ",
      "Kênh chat",
      "Tài chính",
      "Thông báo"
    ]
  },
  {
    "module": "4. Cài đặt",
    "groups": []
  },
  {
    "module": "1. Tổng quan",
    "groups": []
  },
  {
    "module": "2. Cấu hình",
    "groups": []
  },
  {
    "module": "3. Hệ thống",
    "groups": []
  },
  {
    "module": "2. Làm việc",
    "groups": []
  },
  {
    "module": "Sản xuất",
    "groups": [
      "2. Quản lý nội dung",
      "1. Học tập",
      "1. Tổng quan",
      "4. Hỗ trợ",
      "3. Điều hành xưởng"
    ]
  },
  {
    "module": "1. Lệnh đặt hàng",
    "groups": []
  },
  {
    "module": "2. Catalog",
    "groups": []
  },
  {
    "module": "Nền tảng SaaS",
    "groups": []
  },
  {
    "module": "Vận chuyển",
    "groups": [
      "1. Tổng quan",
      "4. Hỗ trợ",
      "3. Điều hành Lắp đặt"
    ]
  },
  {
    "module": "2. Theo dõi SX",
    "groups": []
  },
  {
    "module": "3. Thiết lập",
    "groups": []
  }
];
