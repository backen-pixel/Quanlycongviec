// ═══════════════════════════════════════════════════════════════════════
// Tour Steps — Hướng dẫn sử dụng cho từng trang
// ═══════════════════════════════════════════════════════════════════════

export const dashboardTour = [
  {
    title: 'Chào mừng đến Dashboard',
    icon: '📊',
    content: 'Đây là trang tổng quan của hệ thống TuBep Pro.\nBạn có thể xem tình hình hoạt động theo từng Khối, theo dõi KPI và nhiệm vụ.',
    tip: 'Nhấn → hoặc nút "Tiếp" để xem hướng dẫn tiếp theo.',
  },
  {
    selector: '[data-tour="division-tabs"]',
    title: 'Tabs Khối',
    icon: '🏢',
    content: 'Chọn Khối để xem chi tiết hoạt động của từng Khối.\n• Khối Kinh Doanh\n• Khối Sản Xuất\n• Khối Vận Chuyển\n• Khối Lắp Đặt',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="kpi-cards"]',
    title: 'Thẻ KPI',
    icon: '📈',
    content: 'Hiển thị các chỉ số quan trọng:\n• Sắp tới — dự án chờ đến khối\n• Đang thực hiện — dự án + nhiệm vụ\n• Đã hoàn thành\n• Trễ hạn — cần xử lý gấp',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="company-filter"]',
    title: 'Lọc theo Công ty',
    icon: '🏭',
    content: 'Chọn công ty để xem KPI và nhiệm vụ riêng của công ty đó.\nChọn "Tất cả" để xem toàn bộ Khối.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="task-detail"]',
    title: 'Chi tiết nhiệm vụ',
    icon: '✅',
    content: 'Xem nhiệm vụ theo từng quy trình.\n• Click vào quy trình để mở rộng\n• Lọc theo nhân viên, trạng thái\n• Click vào dự án để xem chi tiết',
    placement: 'top',
  },
];

export const projectsTour = [
  {
    title: 'Quản lý Dự án',
    icon: '📁',
    content: 'Trang quản lý tất cả dự án.\nXem, tìm kiếm, lọc và tạo dự án mới.',
  },
  {
    selector: '[data-tour="project-filters"]',
    title: 'Bộ lọc nâng cao',
    icon: '🔍',
    content: '5 bộ lọc cascade:\n• Thời gian — lọc theo khoảng ngày\n• Khối — chọn Khối → tự động lọc Công ty\n• Công ty — chọn Công ty → tự động lọc NV\n• Nhân viên — NV tạo/được gán dự án\n• Khách hàng — tìm theo tên KH',
    placement: 'bottom',
    tip: 'Chọn Khối trước, Công ty và NV sẽ tự động cập nhật theo.',
  },
  {
    selector: '[data-tour="view-toggle"]',
    title: 'Chế độ xem',
    icon: '👁️',
    content: '3 chế độ:\n• Kanban — kéo thả theo giai đoạn\n• Danh sách — bảng chi tiết\n• Kế hoạch — theo deadline (quá hạn, hôm nay, tuần này...)',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="project-list"]',
    title: 'Danh sách dự án',
    icon: '📋',
    content: 'Click vào dự án để xem chi tiết.\nMỗi dự án hiển thị: mã, tên, khách hàng, giai đoạn, tiến độ.',
    placement: 'top',
  },
  {
    selector: '[data-tour="create-project"]',
    title: 'Tạo dự án mới',
    icon: '➕',
    content: 'Nhấn nút này để tạo dự án mới.\nChọn quy trình, nhập thông tin khách hàng và bắt đầu.',
    placement: 'bottom',
  },
];

export const crmTour = [
  {
    title: 'CRM — Quản lý bán hàng',
    icon: '💼',
    content: 'Quản lý toàn bộ quy trình bán hàng:\nLead → Deal → Báo giá → Đơn hàng → Hóa đơn',
  },
  {
    selector: '[data-tour="pipeline-tabs"]',
    title: 'Pipeline Lead / Deal',
    icon: '🎯',
    content: 'Chuyển giữa 2 pipeline:\n• Leads — khách hàng tiềm năng\n• Deals — cơ hội đang đàm phán\n\nMỗi pipeline có các giai đoạn riêng.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="crm-company-filter"]',
    title: 'Lọc theo Công ty',
    icon: '🏢',
    content: 'Chọn công ty để xem Lead/Deal riêng của công ty đó.\nKPI và pipeline sẽ cập nhật theo.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="crm-kpis"]',
    title: 'KPI bán hàng',
    icon: '📊',
    content: 'Lead: Tổng Lead, Đang xử lý, Chuyển Deal, Tỷ lệ chuyển đổi\nDeal: Tổng Deal, Đang đàm phán, Thắng, Doanh thu',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="kanban-pipeline"]',
    title: 'Kanban Pipeline',
    icon: '📌',
    content: 'Kéo thả Lead/Deal giữa các giai đoạn.\nClick vào card để xem chi tiết.\nMỗi cột hiển thị số lượng và tổng giá trị.',
    placement: 'top',
    tip: 'Kéo Deal vào cột "Thắng" sẽ tự động tạo dự án liên kết.',
  },
  {
    selector: '[data-tour="add-lead"]',
    title: 'Thêm Lead/Deal mới',
    icon: '➕',
    content: 'Tạo Lead hoặc Deal mới.\nChọn công ty, nhập thông tin khách hàng, nguồn, giá trị dự kiến.',
    placement: 'left',
  },
];

export const projectDetailTour = [
  {
    title: 'Chi tiết dự án',
    icon: '📁',
    content: 'Trang quản lý chi tiết 1 dự án.\nTheo dõi tiến độ, nhiệm vụ, tài liệu và phê duyệt.',
  },
  {
    selector: '[data-tour="stage-progress"]',
    title: 'Tiến độ giai đoạn',
    icon: '🔄',
    content: 'Thanh tiến độ hiển thị dự án đang ở giai đoạn nào.\nClick để chuyển giai đoạn (cần quyền).',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="task-list"]',
    title: 'Danh sách nhiệm vụ',
    icon: '✅',
    content: 'Tất cả nhiệm vụ của dự án.\n• Tạo mới, gán NV, đặt deadline\n• Đánh dấu hoàn thành\n• Lọc theo giai đoạn, trạng thái',
    placement: 'top',
  },
  {
    selector: '[data-tour="project-tabs"]',
    title: 'Các tab chức năng',
    icon: '📑',
    content: '• Luồng — timeline quy trình\n• Tài liệu — upload/download file\n• Phê duyệt — yêu cầu & quyết định\n• Chat — trao đổi nhóm\n• Lịch sử — log thay đổi\n• Bán hàng — liên kết CRM',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="pin-project"]',
    title: 'Ghim dự án',
    icon: '📌',
    content: 'Ghim dự án để theo dõi nhanh.\nDự án ghim hiển thị ở góc phải màn hình, xem mọi lúc.',
    placement: 'left',
  },
];

export const quotationsTour = [
  {
    title: 'Báo giá',
    icon: '📄',
    content: 'Quản lý tất cả báo giá.\nTạo mới, chỉnh sửa, xuất PDF và chuyển thành đơn hàng.',
  },
  {
    selector: '[data-tour="quotation-list"]',
    title: 'Danh sách báo giá',
    icon: '📋',
    content: 'Hiển thị mã, khách hàng, tổng tiền, trạng thái.\nClick vào báo giá để chỉnh sửa.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="pdf-btn"]',
    title: 'Xuất PDF',
    icon: '📥',
    content: 'Tải PDF báo giá ngay từ danh sách.\nPDF tiếng Việt có dấu, theo mẫu công ty.',
    placement: 'left',
    tip: 'Vào Cài đặt > Thông tin PDF để thay đổi thông tin công ty trên PDF.',
  },
  {
    selector: '[data-tour="create-quotation"]',
    title: 'Tạo báo giá mới',
    icon: '➕',
    content: 'Tạo báo giá mới.\nThêm sản phẩm, VAT riêng từng dòng, điều khoản thanh toán.',
    placement: 'bottom',
  },
];

export const ordersTour = [
  {
    title: 'Đơn hàng',
    icon: '🛒',
    content: 'Quản lý đơn hàng — được tạo từ báo giá đã duyệt.',
  },
  {
    selector: '[data-tour="order-list"]',
    title: 'Danh sách đơn hàng',
    icon: '📋',
    content: 'Mã ĐH, khách hàng, tổng tiền, trạng thái.\nClick để xem chi tiết và cập nhật trạng thái.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="order-status"]',
    title: 'Trạng thái đơn hàng',
    icon: '🏷️',
    content: 'Mới → Đang xử lý → Hoàn thành → Đã giao.\nCập nhật trạng thái trong trang chi tiết.',
    placement: 'left',
  },
  {
    selector: '[data-tour="pdf-btn"]',
    title: 'Xuất PDF',
    icon: '📥',
    content: 'Tải PDF đơn hàng ngay từ danh sách.',
    placement: 'left',
  },
];

export const invoicesTour = [
  {
    title: 'Hóa đơn',
    icon: '🧾',
    content: 'Quản lý hóa đơn — được tạo từ đơn hàng.',
  },
  {
    selector: '[data-tour="invoice-list"]',
    title: 'Danh sách hóa đơn',
    icon: '📋',
    content: 'Mã HĐ, khách hàng, tổng tiền, đã thu, công nợ.\nClick để xem chi tiết.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="payment-status"]',
    title: 'Tình trạng thanh toán',
    icon: '💰',
    content: '• Xanh — đã thu đủ\n• Vàng — thu một phần\n• Đỏ — chưa thu\nCập nhật số tiền đã thu trong chi tiết.',
    placement: 'left',
  },
  {
    selector: '[data-tour="pdf-btn"]',
    title: 'Xuất PDF',
    icon: '📥',
    content: 'Tải PDF hóa đơn ngay từ danh sách.',
    placement: 'left',
  },
];

export const leadDetailTour = [
  {
    title: 'Chi tiết Lead',
    icon: '🎯',
    content: 'Quản lý chi tiết 1 Lead/Deal.\nTheo dõi tiến trình, hoạt động và chuyển đổi.',
  },
  {
    selector: '[data-tour="lead-info"]',
    title: 'Thông tin Lead',
    icon: '📝',
    content: 'Tên, khách hàng, giá trị, xác suất, người phụ trách.\nClick để chỉnh sửa từng trường.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="lead-pipeline"]',
    title: 'Pipeline giai đoạn',
    icon: '🔄',
    content: 'Xem Lead đang ở giai đoạn nào.\nClick vào giai đoạn để di chuyển.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="lead-activities"]',
    title: 'Hoạt động & ghi chú',
    icon: '📝',
    content: 'Ghi chú cuộc gọi, email, gặp mặt.\nThêm lịch follow-up để không bỏ sót.',
    placement: 'top',
  },
  {
    selector: '[data-tour="convert-deal"]',
    title: 'Chuyển sang Deal',
    icon: '🚀',
    content: 'Khi Lead đủ tiềm năng, chuyển thành Deal.\nDeal sẽ vào pipeline Deal để theo dõi đàm phán.',
    placement: 'left',
    tip: 'Deal Thắng sẽ tự động tạo dự án liên kết.',
  },
];

export const ecosystemTour = [
  {
    title: 'Hệ sinh thái công ty',
    icon: '🌐',
    content: 'Cấu trúc tổ chức dạng cây:\nTập đoàn → Khối → Công ty → Phòng ban → Đội nhóm',
  },
  {
    selector: '[data-tour="org-tree"]',
    title: 'Sơ đồ tổ chức',
    icon: '🌳',
    content: 'Click vào nút để mở rộng/thu gọn.\nMỗi đơn vị hiển thị tên, mã, số thành viên.',
    placement: 'right',
  },
  {
    selector: '[data-tour="add-unit"]',
    title: 'Thêm đơn vị',
    icon: '➕',
    content: 'Thêm Khối, Công ty, Phòng ban mới.\nChọn cấp cha → nhập thông tin → tự động liên kết.',
    placement: 'bottom',
    tip: 'Tạo Công ty sẽ tự động tạo bản ghi trong bảng Companies.',
  },
];

export const usersTour = [
  {
    title: 'Quản lý nhân viên',
    icon: '👥',
    content: 'Danh sách tất cả nhân viên trong hệ thống.\nThêm, sửa, phân quyền.',
  },
  {
    selector: '[data-tour="user-list"]',
    title: 'Danh sách nhân viên',
    icon: '📋',
    content: 'Tên, email, vai trò, trạng thái.\nClick để xem/chỉnh sửa chi tiết.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="user-role"]',
    title: 'Vai trò & quyền',
    icon: '🛡️',
    content: 'Admin — toàn quyền\nManager — quản lý dự án, NV\nUser — xem và làm việc được gán',
    placement: 'left',
  },
  {
    selector: '[data-tour="add-user"]',
    title: 'Thêm nhân viên',
    icon: '➕',
    content: 'Thêm NV mới vào hệ thống.\nNhập email, tên, chọn vai trò.',
    placement: 'bottom',
  },
];

export const pdfSettingsTour = [
  {
    title: 'Cài đặt thông tin PDF',
    icon: '⚙️',
    content: 'Thay đổi thông tin công ty hiển thị trên PDF báo giá, đơn hàng, hóa đơn.',
  },
  {
    selector: '[data-tour="company-form"]',
    title: 'Thông tin công ty',
    icon: '🏢',
    content: 'Tên công ty, địa chỉ, SĐT, email, MST, website.\nThay đổi ở đây sẽ cập nhật trên tất cả PDF.',
    placement: 'right',
  },
  {
    selector: '[data-tour="bank-info"]',
    title: 'Thông tin ngân hàng',
    icon: '🏦',
    content: 'Tên ngân hàng, số tài khoản, chủ TK.\nHiển thị ở cuối PDF để KH chuyển khoản.',
    placement: 'right',
  },
];

export const myTasksTour = [
  {
    title: 'Việc của tôi',
    icon: '📋',
    content: 'Tất cả nhiệm vụ được gán cho bạn.\nTheo dõi, cập nhật trạng thái và hoàn thành.',
  },
  {
    selector: '[data-tour="task-filters"]',
    title: 'Bộ lọc',
    icon: '🔍',
    content: 'Lọc theo trạng thái, ưu tiên, dự án.\nTìm nhanh nhiệm vụ cần làm.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="task-items"]',
    title: 'Danh sách nhiệm vụ',
    icon: '✅',
    content: 'Click checkbox để đánh dấu hoàn thành.\nClick tên để xem chi tiết.\nMàu đỏ = quá hạn.',
    placement: 'top',
    tip: 'Sắp xếp theo deadline để xử lý việc gấp trước.',
  },
];

export const workflowHubTour = [
  {
    title: 'Quản lý quy trình',
    icon: '⚙️',
    content: 'Thiết lập quy trình làm việc cho dự án.\nGiai đoạn, luồng, và bộ nhiệm vụ mẫu.',
  },
  {
    selector: '[data-tour="stages-panel"]',
    title: 'Giai đoạn (Stages)',
    icon: '🔄',
    content: '8 giai đoạn mặc định:\nTư vấn → Thiết kế → Báo giá → Hợp đồng → Sản xuất → Vận chuyển → Lắp đặt → CSKH\n\nTùy chỉnh tên, màu, icon.',
    placement: 'right',
  },
  {
    selector: '[data-tour="flows-panel"]',
    title: 'Luồng quy trình (Flows)',
    icon: '🔗',
    content: 'Kết hợp giai đoạn thành luồng hoàn chỉnh.\nMỗi luồng gán Khối + Công ty phụ trách.',
    placement: 'right',
  },
  {
    selector: '[data-tour="template-sets"]',
    title: 'Bộ nhiệm vụ mẫu',
    icon: '📝',
    content: 'Tạo bộ nhiệm vụ mẫu cho từng công ty.\nKhi tạo dự án mới → tự động sinh nhiệm vụ từ mẫu.',
    placement: 'right',
    tip: 'Mỗi công ty có bộ mẫu riêng, phù hợp quy trình nội bộ.',
  },
];

export const companiesPageTour = [
  {
    title: 'Quản lý Công ty',
    icon: '🏢',
    content: 'Danh sách các công ty trong hệ thống.\nMỗi công ty thuộc 1 Khối và có nhân viên riêng.',
  },
  {
    selector: '[data-tour="company-list"]',
    title: 'Danh sách công ty',
    icon: '📋',
    content: 'Tên, Khối, số NV, thông tin liên hệ.\nClick để xem/chỉnh sửa.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="add-company"]',
    title: 'Thêm công ty',
    icon: '➕',
    content: 'Tạo công ty mới và gán vào Khối.\nSau đó thêm nhân viên, phòng ban.',
    placement: 'bottom',
  },
];

export const pipelineSettingsTour = [
  {
    title: 'Cài đặt Pipeline',
    icon: '⚙️',
    content: 'Tùy chỉnh các giai đoạn trong pipeline Lead và Deal.',
  },
  {
    selector: '[data-tour="pipeline-lead"]',
    title: 'Pipeline Lead',
    icon: '🎯',
    content: 'Các bước từ khi nhận lead đến chuyển deal.\nThêm/sửa/xóa/đổi thứ tự giai đoạn.',
    placement: 'right',
  },
  {
    selector: '[data-tour="pipeline-deal"]',
    title: 'Pipeline Deal',
    icon: '💰',
    content: 'Các bước đàm phán đến khi thắng/thua.\nĐánh dấu giai đoạn Thắng 🏆 hoặc Thua ❌.',
    placement: 'left',
  },
];
