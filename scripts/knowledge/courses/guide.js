const {
  quizItem, mkLesson, quizEx, finalExamLesson, COVER_CRM, sections,
} = require('./_helpers');
const partial = require('../course-guide');

const CAT = {
  id: 'd2000003-0000-0000-0000-000000000001',
  name: 'Hướng dẫn CRM — Toàn bộ phần mềm',
  slug: 'huong-dan-crm-lead-deal',
  description:
    'Hướng dẫn thao tác CRM: đăng nhập, Lead, Deal, Dashboard, Sự kiện, Chat, Mobile. Dành cho nhân viên mới — làm được ngay trên hệ thống.',
  icon: '🖥️',
  sort_order: 5,
  deadline_mode: 'relative',
  deadline_duration_days: 21,
  deadline_note: 'Hoàn thành hướng dẫn CRM trong 21 ngày',
  require_all_exercises_passed: true,
};

const L = (suffix) => `b2000003-0000-0000-0000-0000000000${suffix}`;
const C = (suffix) => `c2000003-0000-0000-0000-0000000000${suffix}`;

function hdLesson(suffix, sort, title, summary, parts, exItems, tags) {
  return mkLesson({
    id: L(suffix),
    sort_order: sort,
    title,
    summary,
    content_md: sections(...parts),
    tags: tags || ['huong-dan', 'phan-mem'],
    cover: COVER_CRM,
    exercises: exItems
      ? [
          quizEx({
            id: C(suffix),
            lesson_id: L(suffix),
            title: `Kiểm tra: ${title.replace(/^HD \d+[AB]?: /, '')}`,
            items: exItems,
          }),
        ]
      : [],
  });
}

function q(...args) {
  return quizItem(...args);
}

const extraLessons = [
  hdLesson(
    '03',
    4,
    'HD 3: Kanban Lead — Kéo thẻ và tìm kiếm',
    'Kéo đổi giai đoạn, tìm nhanh, tab Deadline.',
    [
      '# HD 3 — Kanban Lead',
      '## 1. Tình huống',
      'Cần chuyển Lead "Chị Hoa" sang **Đã liên hệ** sau cuộc gọi.',
      '## 2. Thao tác',
      '1. Giữ chuột → kéo sang cột đích.\n2. Nếu bị chặn — đọc thông báo (nhiệm vụ chưa xong).\n3. Ô **Tìm kiếm**: tên, SĐT, mã Lead.',
      '## 3. Tóm tắt',
      'Kéo thẻ = đổi giai đoạn có điều kiện.',
    ],
    [
      q('q1', 'Kéo thẻ Lead để?', ['Xóa', 'Đổi giai đoạn pipeline', 'In lương', 'Tạo NV'], [1], 'Kanban = quản lý giai đoạn.'),
      q('q2', 'Tìm Lead theo?', ['Chỉ màu', 'Tên, SĐT, mã', 'Chỉ email công ty', 'Không tìm được'], [1], 'Ô tìm trên thanh công cụ.'),
      q('q3', 'Tab Deadline giúp?', ['Xóa Lead', 'Nhóm theo hạn xử lý', 'Tạo HĐ', 'Chat'], [1], 'Ưu tiên trễ SLA.'),
      q('q4', 'Bị chặn khi kéo thường do?', ['Nhiệm vụ bắt buộc', 'Trời mưa', 'Đã thắng', 'VIP'], [0], 'Gate nhiệm vụ.'),
      q('q5', 'Sau kéo cột nên?', ['Im lặng', 'Ghi hoạt động nếu chưa có', 'Xóa SĐT', 'Đổi công ty'], [1], 'Lịch sử phải khớp.'),
      q('q6', 'Badge đỏ trên thẻ?', ['Quá hạn SLA', 'Đã cọc', 'Đã SX', 'Nghỉ phép'], [0], 'Cần xử lý gấp.'),
    ],
    ['huong-dan', 'lead', 'kanban'],
  ),
  hdLesson(
    '04',
    5,
    'HD 4: Chi tiết Lead — Các tab',
    'Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu.',
    [
      '# HD 4 — Chi tiết Lead',
      '## Tab chính',
      '- **Tổng quan**: 6 thông tin bắt buộc, phụ trách.\n- **Nhiệm vụ**: task CRM.\n- **Hoạt động**: timeline gọi/gặp.\n- **Tài liệu**: PDF, ảnh.',
      '## Nút header',
      '**Chuyển Deal**, **Sửa**, **Mất/Mở lại** (tùy quyền).',
    ],
    [
      q('q1', 'Ghi chú cuộc gọi nên ở?', ['Tài liệu', 'Hoạt động / Nhiệm vụ', 'Blocklist', 'Xóa'], [1], 'Phân loại đúng kênh.'),
      q('q2', 'HĐ PDF ký lưu ở?', ['Chat', 'Tài liệu', 'Không lưu', 'Email riêng'], [1], 'Tập trung hồ sơ.'),
      q('q3', 'Tab Nhiệm vụ dùng để?', ['Tính lương', 'Tạo và hoàn thành việc cần làm', 'Xóa Lead', 'Đổi pass'], [1], 'Task gắn Lead.'),
      q('q4', 'Chuyển Deal ở đâu?', ['Footer', 'Nút header chi tiết Lead', 'Cài đặt', 'Báo cáo'], [1], 'Khi đủ điều kiện.'),
      q('q5', 'Tổng quan hiển thị?', ['6 thông tin bắt buộc + phụ trách', 'Chỉ logo', 'Chỉ KPI năm', 'Chỉ chat'], [0], 'Kiểm tra nhanh hồ sơ.'),
      q('q6', 'Hoạt động khác ghi chú?', ['Giống hệt', 'Có loại + thời gian chuẩn timeline', 'Chỉ admin', 'Không dùng'], [1], 'Timeline truy vết.'),
    ],
    ['huong-dan', 'lead'],
  ),
];

// HD 5-12, 09-019 — compact definitions
const hdSpecs = [
  ['05', 6, 'HD 5: Nhiệm vụ Lead trên phần mềm', 'Tạo, hoàn thành, ghi chú + file'],
  ['06', 7, 'HD 6: Hoạt động và ghi chú Lead', '+ Hoạt động, timeline'],
  ['07', 8, 'HD 7: Tài liệu Lead — Upload', 'Loại tài liệu, tên file chuẩn'],
  ['08', 9, 'HD 8: Chuyển Lead → Deal (popup)', 'Popup pipeline Deal'],
  ['09', 10, 'HD 9: Bảng Deal và Kanban', 'CRM → Bảng Deal'],
  ['10', 11, 'HD 10: Chi tiết Deal — Tab', 'Báo giá, HĐ, Thắng/Thua'],
  ['11', 12, 'HD 11: Kéo Deal Thắng / Thua', 'Lý do thua, tạo dự án'],
  ['12', 13, 'HD 12: Ôn tập Lead & Deal trên app', 'Lộ trình thao tác'],
  ['13', 14, 'HD 13: Dashboard CRM', 'Tab Lead/Deal, KPI, lọc'],
  ['14', 15, 'HD 14: Sự kiện nội bộ', 'Lịch, RSVP'],
  ['15', 16, 'HD 15: Nhóm chat CRM', 'Chat theo Lead/Deal'],
  ['16', 17, 'HD 16: Đang hoạt động / Online', 'Ai đang xử lý KH'],
  ['17', 18, 'HD 17: Bảng tin CRM', 'Feed hoạt động'],
  ['18', 19, 'HD 18: Ghi âm / Voice (nếu bật)', 'Ghi âm gắn Lead'],
  ['19', 20, 'HD 19: CRM Mobile — Thao tác cơ bản', 'App di động'],
];

const generatedHd = hdSpecs.map(([suf, sort, title, hint]) =>
  hdLesson(
    suf,
    sort,
    title,
    hint,
    [
      `# ${title}`,
      '## 1. Tình huống',
      `Bạn cần thao tác: ${hint}.`,
      '## 2. Trên phần mềm',
      '1. Mở đúng menu CRM.\n2. Làm theo thứ tự trong bài.\n3. Kiểm tra lịch sử đã lưu.',
      '## 3. Tóm tắt',
      'Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.',
    ],
    Array.from({ length: 6 }, (_, i) =>
      q(
        `q${i + 1}`,
        `${title} — khẳng định đúng?`,
        ['Làm trên CRM, ghi lịch sử', 'Chỉ sổ tay', 'Không cần đăng nhập', 'Chỉ admin'],
        [0],
        'Mọi thao tác quan trọng phải trên hệ thống.',
      ),
    ),
    ['huong-dan'],
  ),
);

const finalQ = Array.from({ length: 25 }, (_, i) =>
  quizItem(
    `fq${i + 1}`,
    `Câu ${i + 1}: Thao tác CRM đúng?`,
    [
      'Quét trùng SĐT trước khi tạo Lead mới',
      'Tạo Lead trùng SĐT để nhanh',
      'Không cần ghi hoạt động',
      'Deal Thua không cần lý do',
    ],
    [0],
    'Quy trình chuẩn trên phần mềm.',
  ),
);

const lessons = [
  ...partial.lessons,
  ...extraLessons,
  ...generatedHd,
  finalExamLesson({
    lessonId: L('22'),
    exId: C('99'),
    categoryPrefix: 'guide',
    title: 'HD 20: Bài thi tổng kết — Thao tác CRM',
    questions: finalQ,
  }),
];

module.exports = {
  title: 'Hướng dẫn CRM',
  description: 'Seed CRM guide — generated',
  category: CAT,
  lessons,
};
