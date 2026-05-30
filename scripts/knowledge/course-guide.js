/**
 * Khoá: Hướng dẫn CRM — Lead & Deal (gộp 263 + 264)
 */
const { quizItem, lessonMd } = require('./lib');

const CAT_ID = 'd2000003-0000-0000-0000-000000000001';

const COVER = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80';

function stdLesson(id, sort, title, summary, sections, tags, exercises, extra = {}) {
  return {
    id,
    sort_order: sort,
    title,
    summary,
    content_md: lessonMd(sections),
    tags: tags || ['huong-dan', 'phan-mem'],
    is_required: true,
    duration_minutes: extra.duration_minutes ?? 8,
    cover_image_url: extra.cover_image_url || COVER,
    exercises: exercises || [],
  };
}

function qz(lessonId, exId, title, items, opts = {}) {
  return {
    id: exId,
    lesson_id: lessonId,
    title,
    instructions: opts.instructions || `${items.length} câu trắc nghiệm — đọc kỹ đáp án sau khi nộp.`,
    type: 'quiz',
    passing_score: opts.passing_score ?? 70,
    max_attempts: opts.max_attempts ?? 3,
    time_limit_minutes: opts.time_limit_minutes ?? null,
    questions: { items },
  };
}

const lessons = [
  stdLesson(
    'b2000003-0000-0000-0000-00000000000a',
    0,
    'HD 0A: Đăng nhập và làm quen giao diện',
    'Đăng nhập, sidebar, App Switcher, ghim module hay dùng.',
    [
      '# HD 0A — Đăng nhập và giao diện',
      '## 1. Tình huống',
      'Bạn là nhân viên kinh doanh mới — buổi đầu cần đăng nhập CRM và biết đường vào **Bảng Lead**, **Bảng Deal**.',
      '## 2. Thuật ngữ',
      '- **Sidebar** _(thanh menu bên trái)_: chứa toàn bộ chức năng.',
      '- **App Switcher** _(biểu tượng lưới góc trên)_: chuyển nhanh giữa Công việc, CRM, Xưởng, Kiến thức.',
      '## 3. Ba vùng màn hình',
      '| Vùng | Việc bạn làm |',
      '|---|---|',
      '| Sidebar | Chọn menu CRM, Cài đặt |',
      '| Thanh trên | Tìm kiếm, thông báo, tài khoản |',
      '| Nội dung giữa | Bảng Lead, chi tiết khách… |',
      '## 4. Trên phần mềm — bạn cần làm gì',
      '1. Mở trình duyệt → nhập địa chỉ công ty → **Đăng nhập** (email + mật khẩu).',
      '2. Bấm **App Switcher** → chọn **CRM**.',
      '3. Bấm **Pin** trên module CRM để lần sau vào thẳng CRM.',
      '4. Mở **CRM → Bảng Lead** để xác nhận thấy cột Kanban.',
      '## 5. Sai lầm thường gặp',
      '- Đăng nhập sai tài khoản cá nhân (dùng chung máy).',
      '- Không biết App Switcher nên tưởng “mất menu”.',
      '## 6. Tóm tắt 30 giây',
      'Đăng nhập → App Switcher → CRM → ghim module → vào Bảng Lead.',
      '## 7. Tự kiểm tra',
      '- App Switcher dùng để làm gì?',
      '- Ghim module giúp gì khi đăng nhập lần sau?',
    ],
    ['huong-dan', 'onboarding'],
    [
      qz('b2000003-0000-0000-0000-00000000000a', 'c2000003-0000-0000-0000-00000000000a', 'Kiểm tra: Giao diện', [
        quizItem('q1', 'App Switcher dùng để làm gì?', ['Đăng xuất', 'Chuyển nhanh giữa các module (CRM, Công việc…)', 'Gửi email', 'In báo giá'], [1], 'App Switcher là lối tắt giữa các phần mềm con trong hệ thống.'),
        quizItem('q2', 'Nút Pin trên module có tác dụng gì?', ['Xóa module', 'Ghim để lần sau đăng nhập vào thẳng module đó', 'Khóa màn hình', 'Đổi mật khẩu'], [1], 'Ghim giúp tiết kiệm thao tác mỗi ngày.'),
        quizItem('q3', 'Sidebar nằm ở đâu?', ['Giữa màn hình', 'Bên trái', 'Bên phải', 'Dưới cùng'], [1], 'Sidebar là menu chính bên trái.'),
        quizItem('q4', 'Muốn vào CRM lần đầu sau đăng nhập, bước hợp lý nhất?', ['Vào Cài đặt trước', 'App Switcher → chọn CRM', 'Tắt trình duyệt', 'Chỉ dùng điện thoại'], [1], 'CRM là module riêng, mở qua App Switcher.'),
        quizItem('q5', 'Khu vực nội dung giữa màn hình hiển thị gì?', ['Chỉ logo', 'Trang đang chọn (vd Bảng Lead)', 'Chỉ chat', 'Chỉ KPI'], [1], 'Nội dung thay đổi theo menu bạn chọn.'),
      ]),
    ],
    { duration_minutes: 6 },
  ),

  stdLesson(
    'b2000003-0000-0000-0000-00000000000b',
    1,
    'HD 0B: Bảo mật tài khoản',
    'Đổi mật khẩu, quy tắc mật khẩu mạnh, đăng xuất thiết bị lạ.',
    [
      '# HD 0B — Bảo mật tài khoản',
      '## 1. Tình huống',
      'Tài khoản CRM chứa số điện thoại khách hàng — nếu lộ mật khẩu, đồng nghiệp hoặc người lạ có thể xem Lead của bạn.',
      '## 2. Quy tắc mật khẩu',
      '- Tối thiểu **8 ký tự**, có chữ hoa, chữ thường, số.',
      '- **Không** chia sẻ qua Zalo/chat.',
      '- Đổi định kỳ **3 tháng** hoặc khi nghi ngờ lộ.',
      '## 3. Trên phần mềm',
      '1. **Cài đặt → Đổi mật khẩu** → nhập mật khẩu cũ + mới → **Lưu**.',
      '2. **Cài đặt → Thiết bị đăng nhập** → xem danh sách → **Đăng xuất** thiết bị lạ.',
      '## 4. Sai lầm thường gặp',
      '- Ghi mật khẩu trên giấy dán màn hình.',
      '- Dùng chung tài khoản cho cả team.',
      '## 5. Tóm tắt',
      'Mật khẩu riêng, đổi định kỳ, kiểm tra thiết bị đăng nhập.',
      '## 6. Tự kiểm tra',
      '- Khi nào cần đổi mật khẩu ngay?',
    ],
    ['huong-dan', 'bao-mat'],
    [
      qz('b2000003-0000-0000-0000-00000000000b', 'c2000003-0000-0000-0000-00000000000b', 'Kiểm tra: Bảo mật', [
        quizItem('q1', 'Mật khẩu mạnh tối thiểu bao nhiêu ký tự?', ['4', '6', '8', '12'], [2], 'Quy định công ty: tối thiểu 8 ký tự.'),
        quizItem('q2', 'Thấy thiết bị lạ trong danh sách đăng nhập, nên làm gì?', ['Bỏ qua', 'Đăng xuất thiết bị đó và đổi mật khẩu', 'Gửi mật khẩu cho IT', 'Tạo Lead mới'], [1], 'Ngắt phiên lạ và đổi mật khẩu để bảo vệ dữ liệu.'),
        quizItem('q3', 'Có nên chia sẻ mật khẩu CRM qua Zalo không?', ['Có, tiện', 'Không, vi phạm bảo mật', 'Chỉ chia cho sếp', 'Chỉ cuối tuần'], [1], 'Mật khẩu là thông tin cá nhân, không chia sẻ.'),
        quizItem('q4', 'Đường dẫn đổi mật khẩu?', ['CRM → Bảng Lead', 'Cài đặt → Đổi mật khẩu', 'Báo giá → PDF', 'Dashboard → Kanban'], [1], 'Đổi mật khẩu nằm trong Cài đặt tài khoản.'),
        quizItem('q5', 'Tài khoản CRM chứa dữ liệu gì nhạy cảm?', ['Chỉ logo', 'SĐT và lịch sử khách hàng', 'Chỉ ảnh sản phẩm', 'Chỉ video'], [1], 'Lead/Deal gắn thông tin liên hệ khách.'),
      ]),
    ],
    { duration_minutes: 5 },
  ),

  stdLesson(
    'b2000003-0000-0000-0000-000000000001',
    2,
    'HD 1: Truy cập Bảng Lead',
    'Menu CRM → Bảng Lead, Kanban, lọc, tìm kiếm.',
    [
      '# HD 1 — Bảng Lead',
      '## 1. Tình huống',
      'Sáng vào ca, bạn cần xem khách mới từ fanpage đêm qua — mở **Bảng Lead**.',
      '## 2. Thuật ngữ',
      '- **Lead** _(khách tiềm năng, chưa chốt mua)_',
      '- **Kanban** _(bảng kéo thả theo cột giai đoạn)_',
      '## 3. Đường dẫn',
      '**Menu trái → CRM → Bảng Lead** (hoặc Dashboard CRM → ô Lead → Xem tất cả).',
      '## 4. Thao tác',
      '1. Bật tab **Kanban**.',
      '2. Bộ lọc **Lead của tôi**.',
      '3. Click thẻ → mở chi tiết.',
      '4. Kéo thẻ sang cột khác khi đủ điều kiện.',
      '## 5. Lưu ý',
      '- Badge đỏ = sắp/quá hạn **SLA** _(hạn xử lý cam kết)_.',
      '## 6. Tóm tắt',
      'Bảng Lead = nơi quản lý mọi khách đang tư vấn.',
    ],
    ['huong-dan', 'lead'],
    [
      qz('b2000003-0000-0000-0000-000000000001', 'c2000003-0000-0000-0000-000000000001', 'Kiểm tra: Bảng Lead', [
        quizItem('q1', 'Đường dẫn vào Bảng Lead?', ['Công việc → Dự án', 'CRM → Bảng Lead', 'Kiến thức → Thư viện', 'Cài đặt → Nhân viên'], [1], 'Lead nằm trong module CRM.'),
        quizItem('q2', 'Mỗi thẻ trên Kanban đại diện cho?', ['Một nhân viên', 'Một Lead', 'Một báo cáo tháng', 'Một file PDF'], [1], 'Một thẻ = một cơ hội Lead.'),
        quizItem('q3', 'Chế độ xem nào kéo thả giữa các cột?', ['Danh sách', 'Kanban', 'Lịch', 'PDF'], [1], 'Kanban hỗ trợ kéo đổi giai đoạn.'),
        quizItem('q4', 'Bộ lọc "Lead của tôi" giúp gì?', ['Ẩn hết Lead', 'Chỉ xem Lead bạn phụ trách', 'Xóa Lead', 'In hợp đồng'], [1], 'Lọc theo người phụ trách chính.'),
        quizItem('q5', 'Click thẻ Lead sẽ?', ['Xóa Lead', 'Mở chi tiết Lead', 'Gửi email tự động', 'Tạo nhân viên mới'], [1], 'Click để xem và cập nhật.'),
        quizItem('q6', 'Badge SLA màu đỏ thường báo hiệu?', ['Đã ký HĐ', 'Sắp hoặc quá hạn xử lý', 'Khách VIP', 'Đã xóa'], [1], 'SLA = cam kết thời gian phản hồi/xử lý.'),
      ]),
    ],
  ),

  stdLesson(
    'b2000003-0000-0000-0000-000000000002',
    3,
    'HD 2: Tạo Lead mới và Quét trùng',
    'Nút + Lead mới, form bắt buộc, Quét trùng SĐT.',
    [
      '# HD 2 — Tạo Lead & Quét trùng',
      '## 1. Tình huống',
      'Chị Hoa nhắn Zalo hỏi tủ bếp — bạn tạo Lead mới nhưng **phải quét trùng SĐT** trước.',
      '## 2. Thao tác',
      '1. **Bảng Lead → + Lead mới**.',
      '2. Nhập **Tiêu đề** (vd: Chị Hoa Q5 — Tủ bếp 3.6m chữ L).',
      '3. Chọn hoặc **+ Tạo nhanh** Khách hàng, nhập **SĐT**.',
      '4. Bấm **Quét trùng** — nếu trùng → mở Lead cũ, **không** tạo mới.',
      '5. Điền Nguồn, Loại sản phẩm → **Lưu**.',
      '## 3. Lưu ý',
      '- Trùng SĐT mà tạo mới → trừ KPI, khó quản lý.',
      '## 4. Tóm tắt',
      'Quét trùng trước Lưu; tiêu đề rõ ràng; đủ SĐT.',
    ],
    ['huong-dan', 'lead', 'tao-moi'],
    [
      qz('b2000003-0000-0000-0000-000000000002', 'c2000003-0000-0000-0000-000000000002', 'Kiểm tra: Tạo Lead', [
        quizItem('q1', 'Trước khi Lưu Lead mới, bước bắt buộc?', ['In PDF', 'Quét trùng SĐT', 'Ký hợp đồng', 'Bàn giao xưởng'], [1], 'Quét trùng tránh nhân đôi khách.'),
        quizItem('q2', 'Nếu Quét trùng có kết quả?', ['Tạo Lead mới luôn', 'Mở Lead cũ và cập nhật ghi chú', 'Xóa SĐT', 'Đổi tên công ty'], [1], 'Một SĐT nên một luồng chăm sóc.'),
        quizItem('q3', 'Trường tối thiểu khi tạo Lead?', ['Mã số thuế', 'Tiêu đề + Khách hàng', 'Ảnh 3D', 'Hợp đồng'], [1], 'Hệ thống yêu cầu tiêu đề và liên kết khách.'),
        quizItem('q4', 'Nút tạo Lead mới thường ở đâu?', ['Góc dưới trái', 'Thanh trên Bảng Lead (+ Lead mới)', 'Trong Cài đặt', 'Trong Báo cáo SX'], [1], 'Nút + ở thanh công cụ Bảng Lead.'),
        quizItem('q5', 'Tiêu đề Lead nên?', ['Để trống', 'Mô tả tên KH + khu vực + sản phẩm', 'Chỉ số 1', 'Chỉ ngày tháng'], [1], 'Tiêu đề giúp đồng nghiệp nhận diện nhanh.'),
        quizItem('q6', 'Sau Lưu, Lead mới thường nằm cột?', ['Thắng', 'Mới (cột đầu pipeline)', 'Đã xóa', 'Không hiện'], [1], 'Lead mới vào giai đoạn đầu.'),
      ]),
    ],
  ),
];

// Remaining guide lessons 003-019 + 022 — appended via build script part 2
// Export partial; build-seeds merges full list from guide-part2

module.exports = { CAT_ID, lessons, qz, quizItem, stdLesson, COVER };
