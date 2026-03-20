// Guided Tours - Joyride step definitions
// Vietnamese UI tours for employee workflow application

export const createProjectTour = [
  {
    target: 'body',
    title: 'Hướng dẫn tạo dự án',
    content:
      'Tour này sẽ hướng dẫn bạn tạo dự án mới từ đầu đến cuối.\n1. Chọn nút Tạo dự án\n2. Nhập thông tin\n3. Chọn quy trình\n4. Phân công nhiệm vụ',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="create-project"]',
    title: 'Nút tạo dự án',
    content:
      'Nhấn vào đây để bắt đầu tạo dự án mới.\nHệ thống sẽ chuyển sang trang tạo dự án.',
    placement: 'bottom',
    disableBeacon: true,
    navigateTo: '/projects/create',
  },
  {
    target: '[data-tour="create-tabs"]',
    title: '3 bước tạo dự án',
    content:
      'Tạo dự án gồm 3 bước:\n1. Thông Tin - nhập tên, khách hàng\n2. Quy Trình - chọn luồng và phân công\n3. Tệp - đính kèm tài liệu',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="project-name"]',
    title: 'Tên dự án',
    content:
      'Nhập tên dự án mô tả ngắn gọn.\nVD: Tủ bếp gỗ sồi nhà anh Minh - Q7',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="customer-select"]',
    title: 'Chọn khách hàng',
    content:
      'Chọn khách hàng đã có hoặc tạo mới.\nThông tin KH sẽ liên kết với dự án.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="tab-flow"]',
    title: 'Tab Quy Trình',
    content:
      'Chuyển sang tab Quy Trình để chọn luồng công việc và phân công nhiệm vụ.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="flow-select"]',
    title: 'Chọn luồng quy trình',
    content:
      'Chọn luồng phù hợp.\nMỗi luồng có các giai đoạn và công ty phụ trách khác nhau.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="submit-project"]',
    title: 'Tạo dự án',
    content:
      'Sau khi nhập đủ thông tin, nhấn Tạo Dự Án.\nHệ thống tự động sinh nhiệm vụ từ bộ mẫu.',
    placement: 'top',
    disableBeacon: true,
  },
];

export const projectDetailGuidedTour = [
  {
    target: 'body',
    title: 'Chi tiết dự án',
    content:
      'Trang quản lý toàn bộ thông tin 1 dự án.\nTheo dõi tiến độ, nhiệm vụ, tài liệu và phê duyệt.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="stage-progress"]',
    title: 'Tiến độ giai đoạn',
    content:
      'Thanh tiến độ hiển thị dự án đang ở giai đoạn nào.\nTư vấn > Thiết kế > Báo giá > Hợp đồng > Sản xuất > Vận chuyển > Lắp đặt > CSKH',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="task-list"]',
    title: 'Danh sách nhiệm vụ',
    content:
      'Tất cả nhiệm vụ của dự án.\nTạo mới, gán NV, đặt deadline, đánh dấu hoàn thành.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="project-tabs"]',
    title: 'Các tab chức năng',
    content:
      'Luồng - timeline quy trình\nTài liệu - upload/download\nPhê duyệt - yêu cầu và quyết định\nChat - trao đổi nhóm\nLịch sử - log thay đổi\nBán hàng - liên kết CRM',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="pin-project"]',
    title: 'Ghim dự án',
    content:
      'Ghim dự án để theo dõi nhanh.\nDự án ghim hiển thị ở góc phải màn hình.',
    placement: 'left',
    disableBeacon: true,
  },
];

export const workflowGuidedTour = [
  {
    target: 'body',
    title: 'Quản lý quy trình',
    content:
      'Thiết lập quy trình làm việc cho dự án.\nGồm 3 phần: Giai đoạn, Luồng và Bộ mẫu nhiệm vụ.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="stages-panel"]',
    title: 'Giai đoạn (Stages)',
    content:
      '8 giai đoạn mặc định:\nTư vấn > Thiết kế > Báo giá > Hợp đồng > Sản xuất > Vận chuyển > Lắp đặt > CSKH\n\nTùy chỉnh tên, màu sắc, icon.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="flows-panel"]',
    title: 'Luồng quy trình (Flows)',
    content:
      'Kết hợp giai đoạn thành luồng hoàn chỉnh.\nMỗi bước trong luồng gán Khối + Công ty phụ trách.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="template-sets"]',
    title: 'Bộ nhiệm vụ mẫu',
    content:
      'Tạo bộ nhiệm vụ mẫu cho từng công ty.\nKhi tạo dự án mới, tự động sinh nhiệm vụ từ mẫu này.',
    placement: 'right',
    disableBeacon: true,
  },
];

export const ecosystemGuidedTour = [
  {
    target: 'body',
    title: 'Hệ sinh thái công ty',
    content:
      'Cấu trúc tổ chức dạng cây:\nTập đoàn > Khối > Công ty > Phòng ban > Đội nhóm\n\nMỗi cấp có chức năng CRUD đầy đủ.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="org-tree"]',
    title: 'Sơ đồ tổ chức',
    content:
      'Click vào nút để mở rộng/thu gọn.\nMỗi đơn vị hiển thị: tên, mã, số thành viên.\nKéo thả để sắp xếp lại.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="add-unit"]',
    title: 'Thêm đơn vị mới',
    content:
      'Nhấn + để thêm Khối, Công ty, Phòng ban mới.\nChọn cấp cha > nhập thông tin > tự động liên kết.\n\nTạo Công ty sẽ tự động tạo bản ghi trong bảng Companies.',
    placement: 'bottom',
    disableBeacon: true,
  },
];
