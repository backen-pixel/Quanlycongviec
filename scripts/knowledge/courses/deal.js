const {
  quizItem, mkLesson, quizEx, checklistEx, finalExamLesson, COVER_DEAL, sections,
} = require('./_helpers');

const CAT = {
  id: 'd2000002-0000-0000-0000-000000000001',
  name: 'Deal — Cơ hội bán hàng',
  slug: 'deal-co-hoi-ban-hang',
  description:
    'Khoá đào tạo quản lý Deal sau khi chuyển từ Lead: pipeline, báo giá, ký HĐ, thắng/thua, bàn giao sản xuất. Ngành tủ bếp nhôm / cửa nhôm.',
  icon: '💼',
  sort_order: 11,
  deadline_mode: 'relative',
  deadline_duration_days: 30,
  deadline_note: 'Hoàn thành khoá Deal trong 30 ngày kể từ bài học đầu tiên',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000002-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000002-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

function tpl(title, situation, terms, body, steps, mistakes, summary) {
  return sections(
    `# ${title}`,
    '## 1. Tình huống',
    situation,
    '## 2. Thuật ngữ',
    terms,
    '## 3. Nội dung chính',
    body,
    '## 4. Trên phần mềm',
    steps,
    '## 5. Sai lầm thường gặp',
    mistakes,
    '## 6. Tóm tắt',
    summary,
    '## 7. Tự kiểm tra',
    '- Bạn áp dụng được điều gì ngay hôm nay?',
  );
}

const dealTitles = [
  ['Deal là gì? Khác Lead ở đâu?', 'Anh Minh đã chốt 2 bộ cửa nhôm 38 triệu — đây là **Deal**.'],
  ['Bảng Deal và pipeline 6 giai đoạn (mẫu)', 'Mở Kanban Deal — 6 cột minh hoạ từ Báo giá đến Thắng/Thua.'],
  ['Báo giá chính thức trên Deal', 'Gửi báo giá PDF cho chị Lan sau khi đo đạc.'],
  ['Đàm phán và điều chỉnh phụ kiện', 'KH muốn giảm 2 triệu hoặc tặng thêm phụ kiện.'],
  ['Ký hợp đồng và thu cọc', 'Soạn HĐ, thu 50% cọc, upload chứng từ.'],
  ['Kéo Deal Thắng và tạo dự án sản xuất', 'Deal thắng → popup tạo dự án xưởng.'],
  ['Deal Thua — ghi lý do', 'KH chọn đối thủ — bắt buộc chọn lý do thua.'],
  ['Nhiệm vụ và gate trên Deal', 'Một số cột yêu cầu hoàn thành nhiệm vụ.'],
  ['Tài liệu Deal (HĐ, vẽ, cọc)', 'Lưu đúng loại tài liệu.'],
  ['KPI Deal và điểm tháng', 'Chỉ số doanh số, tỉ lệ thắng, đúng hạn.'],
  ['Bàn giao thông tin cho xưởng', 'Đủ bản vẽ, BOM, lịch giao.'],
  ['Tình huống đặc biệt trên Deal', 'Đổi pipeline, chia Deal, hủy nhầm.'],
];

const lessons = dealTitles.map(([sub, sit], idx) => {
  const num = idx + 1;
  const lid = L(num);
  const items = Array.from({ length: num <= 2 ? 8 : 6 }, (_, i) =>
    quizItem(
      `q${i + 1}`,
      `Câu ${i + 1} (Deal bài ${num}): Khẳng định đúng về Deal?`,
      [
        'Deal = khách đã thống nhất mua, đang hoàn tất HĐ',
        'Deal = khách mới hỏi giá',
        'Deal tự xóa sau 7 ngày',
        'Deal không có pipeline',
      ],
      [0],
      'Deal sau Lead, có pipeline và KPI riêng.',
    ),
  );
  return mkLesson({
    id: lid,
    sort_order: num,
    title: `Bài ${num}: ${sub}`,
    summary: sub,
    content_md: tpl(
      `Bài ${num} — ${sub}`,
      sit,
      '- **Deal** _(cơ hội bán — đã chốt mua)_\n- **Pipeline** _(các giai đoạn trên bảng Deal)_\n- **Kanban** _(kéo thẻ giữa cột)_',
      'Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.\n\nKéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.',
      '1. **CRM → Bảng Deal**.\n2. Kanban — kéo thẻ đúng giai đoạn.\n3. Tab Tài liệu / Nhiệm vụ khi cần.',
      '- Kéo Thắng khi chưa thu cọc.\n- Không ghi lý do Thua.',
      'Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.',
    ),
    tags: ['deal', `bai-${num}`],
    cover: COVER_DEAL,
    exercises: [
      quizEx({
        id: C(num),
        lesson_id: lid,
        title: `Kiểm tra: ${sub.split('?')[0]}`,
        items,
        passing_score: 70,
      }),
    ],
  });
});

// Final exam
const finalQ = Array.from({ length: 25 }, (_, i) =>
  quizItem(
    `fq${i + 1}`,
    `Câu ${i + 1}: Điều đúng về Deal?`,
    [
      'Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền',
      'Deal = Lead mới',
      'Thua không cần lý do',
      'Thắng không cần cọc',
    ],
    [0],
    'Deal quản lý giai đoạn chốt sale.',
  ),
);

lessons.push(
  finalExamLesson({
    lessonId: L(13),
    exId: 'c2000002-0000-0000-0000-000000000099',
    categoryPrefix: 'deal',
    title: 'Bài 13: Bài thi tổng kết — Deal',
    questions: finalQ,
  }),
);

module.exports = {
  title: 'Khoá Deal',
  description: 'Seed Deal course — generated',
  category: CAT,
  lessons,
};
