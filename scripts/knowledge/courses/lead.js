const {
  quizItem, mkLesson, quizEx, checklistEx, essayEx, finalExamLesson, COVER_LEAD, sections,
} = require('./_helpers');

const CAT = {
  id: 'd2000001-0000-0000-0000-000000000001',
  name: 'Lead — Khách hàng tiềm năng',
  slug: 'lead-khach-hang-tiem-nang',
  description:
    'Khoá đào tạo chuẩn cho nhân viên kinh doanh ngành tủ bếp nhôm và cửa nhôm. Hướng dẫn quy trình chăm sóc khách hàng tiềm năng từ tiếp nhận đến chuyển đơn, tuân thủ ghi nhận minh chứng và bảo vệ điểm KPI cá nhân.',
  icon: '🎯',
  sort_order: 10,
  deadline_mode: 'relative',
  deadline_duration_days: 30,
  deadline_note: 'Hoàn thành toàn bộ khoá trong 30 ngày kể từ khi bắt đầu bài học đầu tiên',
  require_all_exercises_passed: true,
};

const L = (n) => `b2000001-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const C = (n) => `c2000001-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

const tpl = (title, situation, terms, body, appSteps, mistakes, summary, selfCheck) =>
  sections(
    `# ${title}`,
    '## 1. Tình huống',
    situation,
    '## 2. Thuật ngữ',
    terms,
    '## 3. Nội dung chính',
    body,
    '## 4. Trên phần mềm — bạn cần làm gì',
    appSteps,
    '## 5. Sai lầm thường gặp',
    mistakes,
    '## 6. Tóm tắt 30 giây',
    summary,
    '## 7. Tự kiểm tra',
    selfCheck,
  );

const lessons = [
  mkLesson({
    id: L(1),
    sort_order: 1,
    title: 'Bài 1: Khái niệm Lead trong ngành tủ bếp / cửa nhôm',
    summary: 'Định nghĩa Lead, phân biệt Lead — Deal — Khách hàng, vai trò người phụ trách.',
    content_md: tpl(
      'Bài 1 — Khái niệm Lead',
      'Chị Hoa nhắn fanpage hỏi giá tủ bếp 3.6m chữ L — đây là **Lead**: khách đã liên hệ, chưa cam kết mua.',
      '- **Lead** _(khách tiềm năng — đã tiếp xúc, chưa chốt mua)_\n- **Deal** _(đã thống nhất mua, đang làm hợp đồng)_\n- **Khách hàng** _(đã ký HĐ và đặt cọc)_',
      '| Phân loại | Tình trạng | Ví dụ |\n|---|---|---|\n| Lead | Chưa cam kết | Hỏi giá tủ bếp |\n| Deal | Đã chốt mua | Đã chốt giá 68 triệu, hẹn ký HĐ |\n| Khách hàng | Đã ký + cọc | Đã chuyển 50% |\n\nMỗi Lead có **một người phụ trách chính** — chịu trách nhiệm chăm sóc và **KPI** _(chỉ số hiệu quả)_ cá nhân.',
      '1. **Menu CRM → Bảng Lead**.\n2. Mỗi thẻ = một Lead.\n3. Mọi ghi chú, file, cuộc gọi được lưu trên hệ thống.',
      '- Ghi sổ tay riêng → đồng nghiệp không nắm được khi nghỉ phép.\n- Tạo Lead trùng SĐT.',
      'Lead = khách tiềm năng; một người phụ trách; bắt buộc dùng CRM.',
      '- Lead khác Deal ở điểm nào?\n- Ai chịu KPI của Lead?',
    ),
    tags: ['lead', 'co-ban', 'newbie'],
    cover: COVER_LEAD,
    exercises: [
      quizEx({
        id: C(1),
        lesson_id: L(1),
        title: 'Kiểm tra: Khái niệm Lead',
        items: [
          quizItem('q1', 'Lead là gì?', ['Khách đã ký HĐ', 'Khách tiềm năng đã tiếp xúc, chưa cam kết mua', 'Sản phẩm mới', 'Nhân viên mới'], [1], 'Lead chưa có cam kết mua — chỉ mới quan tâm.'),
          quizItem('q2', 'Deal là gì?', ['Khách mới nhắn tin', 'Đã thống nhất mua, đang hoàn tất HĐ', 'Đã thanh toán 100%', 'Lead bị xóa'], [1], 'Deal = giai đoạn sau khi chốt mua.'),
          quizItem('q3', 'Một Lead có bao nhiêu người phụ trách chính?', ['Không giới hạn', 'Một người', 'Chỉ admin', 'Hai người bắt buộc'], [1], 'Tránh trách nhiệm chồng chéo.'),
          quizItem('q4', 'Vì sao công ty bắt buộc CRM thay sổ tay?', ['Tốn thời gian', 'Lưu lịch sử, nhắc hẹn, tính KPI công bằng', 'Chỉ để admin giám sát', 'Không có lý do'], [1], 'CRM giúp minh bạch và đo lường.'),
          quizItem('q5', 'Chị Hoa hỏi giá qua fanpage — phân loại?', ['Deal', 'Lead', 'Khách hàng', 'Báo giá PDF'], [1], 'Mới hỏi giá = Lead.'),
          quizItem('q6', 'Đường dẫn xem Lead?', ['Công việc → Dự án', 'CRM → Bảng Lead', 'Kiến thức', 'Xưởng SX'], [1], 'Lead nằm trong CRM.'),
          quizItem('q7', 'Khi Lead "chín", bước tiếp theo?', ['Xóa Lead', 'Chuyển thành Deal', 'Tạo nhân viên', 'In phiếu lương'], [1], 'Chuyển Deal khi đủ điều kiện (Bài 11).'),
          quizItem('q8', 'Thành viên hỗ trợ trên Lead dùng để?', ['Thay phụ trách chính', 'Hỗ trợ cùng team, phụ trách chính vẫn chịu KPI', 'Ẩn Lead', 'Xóa KPI'], [1], 'Phụ trách chính không đổi.'),
        ],
      }),
    ],
  }),

  mkLesson({
    id: L(2),
    sort_order: 2,
    title: 'Bài 2: Tiếp nhận và tạo Lead mới',
    summary: '5 kênh tiếp nhận, thông tin bắt buộc, quét trùng SĐT.',
    content_md: tpl(
      'Bài 2 — Tiếp nhận Lead',
      'Khách gọi tổng đài hỏi cửa nhôm Xingfa — bạn tiếp nhận và tạo Lead trong vòng vài phút.',
      '- **Nguồn Lead** _(kênh khách đến: fanpage, showroom, giới thiệu…)_',
      '**5 kênh chính:** Fanpage/Zalo, Tổng đài, Website/form, Showroom, Giới thiệu.\n\n**Thông tin tối thiểu:** Tiêu đề Lead + Khách hàng (có SĐT).',
      '1. **Bảng Lead → + Lead mới**.\n2. Nhập tiêu đề rõ (Tên — Khu vực — Sản phẩm).\n3. **Quét trùng SĐT** trước Lưu.\n4. Chọn Nguồn, Loại sản phẩm.',
      '- Tạo Lead mới khi SĐT đã tồn tại.\n- Tiêu đề chung chung "Khách mới".',
      'Quét trùng → điền đủ → Lưu → gọi lại đúng hẹn.',
      '- Kênh nào bạn hay nhận nhất?\n- Bước bắt buộc trước Lưu?',
    ),
    tags: ['lead', 'tiep-nhan'],
    cover: COVER_LEAD,
    exercises: [
      quizEx({
        id: C(2),
        lesson_id: L(2),
        title: 'Kiểm tra: Tiếp nhận Lead',
        items: [
          quizItem('q1', 'Có bao nhiêu kênh tiếp nhận chính trong bài?', ['3', '4', '5', '7'], [2], 'Năm kênh: mạng xã hội, tổng đài, web, showroom, giới thiệu.'),
          quizItem('q2', 'Thông tin BẮT BUỘC tối thiểu?', ['Mã số thuế', 'Tiêu đề + Khách hàng', 'Bản vẽ 3D', 'Hợp đồng'], [1], 'Hệ thống yêu cầu tiêu đề và liên kết khách.'),
          quizItem('q3', 'Trước Lưu Lead mới phải?', ['In PDF', 'Quét trùng SĐT', 'Ký HĐ', 'Bàn giao xưởng'], [1], 'Tránh trùng khách.'),
          quizItem('q4', 'Nếu Quét trùng có kết quả?', ['Tạo mới', 'Mở Lead cũ, thêm ghi chú', 'Đổi SĐT giả', 'Xóa khách'], [1], 'Một SĐT — một luồng chăm sóc.'),
          quizItem('q5', 'Tiêu đề Lead tốt nhất?', ['"KH"', '"Chị Lan Q7 — Cửa 2 cánh"', 'Để trống', 'Chỉ ngày'], [1], 'Tiêu đề giúp nhận diện nhanh.'),
          quizItem('q6', 'Nguồn Lead dùng để?', ['Trang trí', 'Thống kê hiệu quả kênh marketing', 'Xóa Lead', 'Tính thuế'], [1], 'Báo cáo theo nguồn.'),
        ],
      }),
      checklistEx({
        id: C(3),
        lesson_id: L(2),
        title: 'Thực hành: Tạo Lead chuẩn',
        texts: [
          'Bấm Quét trùng trước khi Lưu',
          'Tiêu đề có tên + khu vực + sản phẩm',
          'SĐT đủ 10 số',
          'Chọn đúng Nguồn',
          'Chọn Loại sản phẩm',
          'Lead hiện ở cột Mới sau Lưu',
        ],
      }),
    ],
  }),

  mkLesson({
    id: L(3),
    sort_order: 3,
    title: 'Bài 3: Bảng Lead và quy trình chuyển giai đoạn',
    summary: 'Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột.',
    content_md: tpl(
      'Bài 3 — Bảng Lead & Pipeline',
      'Sáng mở Kanban — thấy 3 Lead cột **Mới** cần gọi trước 10h.',
      '- **Pipeline** _(quy trình các giai đoạn Lead trên bảng)_\n- **Kanban** _(bảng kéo thả theo cột)_',
      'Lead di chuyển: **Mới → Đã liên hệ → Đang tư vấn → Đã báo giá → Đã đồng ý** (tên cột có thể khác theo công ty).\n\nKéo thẻ = đổi giai đoạn; có thể bị chặn nếu nhiệm vụ bắt buộc chưa xong.',
      '1. **CRM → Bảng Lead → Kanban**.\n2. Kéo thẻ khi đủ điều kiện nghiệp vụ.\n3. Đọc thông báo nếu bị chặn.',
      '- Kéo cột chỉ để "đẹp bảng" không có việc thật.\n- Không ghi hoạt động sau cuộc gọi.',
      'Kanban phản ánh tiến độ thật; mỗi lần kéo phải có việc đã làm.',
      '- Kéo thẻ để làm gì?\n- Khi nào bị chặn?',
    ),
    tags: ['lead', 'pipeline', 'kanban'],
    cover: COVER_LEAD,
    exercises: [
      quizEx({
        id: C(4),
        lesson_id: L(3),
        title: 'Kiểm tra: Bảng Lead',
        items: [
          quizItem('q1', 'Một thẻ Kanban là?', ['Một Lead', 'Một file', 'Một nhân viên', 'Một KPI tháng'], [0], 'Mỗi thẻ = một Lead.'),
          quizItem('q2', 'Pipeline Lead là?', ['Danh sách nhân viên', 'Các giai đoạn chăm sóc khách tiềm năng', 'Bảng lương', 'Kho vật tư'], [1], 'Pipeline = quy trình giai đoạn.'),
          quizItem('q3', 'Kéo thẻ sang cột khác khi?', ['Rảnh', 'Đã hoàn thành việc tương ứng giai đoạn', 'Cuối tháng', 'Admin yêu cầu'], [1], 'Giai đoạn phải khớp thực tế.'),
          quizItem('q4', 'Thông báo đỏ khi kéo thường do?', ['Mạng chậm', 'Nhiệm vụ bắt buộc chưa hoàn thành', 'Khách VIP', 'Đã ký HĐ'], [1], 'Gate nhiệm vụ bảo vệ quy trình.'),
          quizItem('q5', 'Chế độ Deadline dùng để?', ['Xem Lead theo mốc hạn', 'Xóa Lead', 'Tạo báo giá', 'In HĐ'], [0], 'Ưu tiên Lead trễ SLA.'),
          quizItem('q6', 'Tab Kanban nằm ở?', ['Bảng Lead', 'Cài đặt', 'Kiến thức', 'Báo cáo SX'], [0], 'Trong màn Bảng Lead.'),
          quizItem('q7', 'Sau cuộc gọi nên?', ['Chỉ kéo thẻ', 'Ghi hoạt động + kéo thẻ nếu đủ điều kiện', 'Xóa Lead', 'Đổi SĐT'], [1], 'Lịch sử phải có nội dung.'),
          quizItem('q8', 'Cột "Đã đồng ý" thường dẫn tới?', ['Xóa', 'Chuyển Deal', 'Nghỉ phép', 'Tạo nhân viên'], [1], 'Khách đồng ý mua → Deal.'),
        ],
      }),
    ],
  }),

  mkLesson({
    id: L(4),
    sort_order: 4,
    title: 'Bài 4: Sáu thông tin bắt buộc trên Lead (KPI Đầy đủ thông tin)',
    summary: '6 trường bắt buộc, chỉ số KPI Đầy đủ thông tin, quy tắc chặn điểm.',
    content_md: tpl(
      'Bài 4 — Sáu thông tin bắt buộc',
      'Lead của anh Minh thiếu email — chỉ số **Đầy đủ thông tin** tụt, có thể bị **quy tắc chặn điểm**.',
      '- **KPI Đầy đủ thông tin** _(tỷ lệ Lead có đủ 6 trường — trước đây gọi A3)_\n- **Quy tắc chặn điểm** _(nếu dưới ngưỡng, điểm KPI tháng bị giới hạn)_',
      '**6 trường:** SĐT, Email, Địa chỉ lắp đặt, Nguồn, Loại sản phẩm, Mức ưu tiên.\n\nCông ty thường yêu cầu ≥ **80%** Lead đủ 6 trường.',
      '1. Mở chi tiết Lead → tab Tổng quan.\n2. Bổ sung trường còn thiếu.\n3. Cuối tuần tự kiểm 5 Lead của bạn.',
      '- Để trống email vì "khách không có".\n- Chọn nguồn "Khác" cho mọi Lead.',
      'Đủ 6 trường = nền tảng chăm sóc và KPI minh bạch.',
      '- Kể tên 6 trường?\n- KPI Đầy đủ thông tin là gì?',
    ),
    tags: ['lead', 'kpi'],
    cover: COVER_LEAD,
    exercises: [
      quizEx({
        id: C(5),
        lesson_id: L(4),
        title: 'Kiểm tra: 6 thông tin bắt buộc',
        items: [
          quizItem('q1', 'Có bao nhiêu trường bắt buộc?', ['3', '4', '6', '10'], [2], 'Sáu trường theo quy định công ty.'),
          quizItem('q2', 'Trường KHÔNG thuộc 6 trường?', ['SĐT', 'Ngày sinh khách', 'Nguồn', 'Loại sản phẩm'], [1], 'Ngày sinh không nằm trong bộ 6.'),
          quizItem('q3', 'KPI "Đầy đủ thông tin" đo gì?', ['Số cuộc gọi', '% Lead đủ 6 trường', 'Doanh số', 'Số file PDF'], [1], 'Tỷ lệ hoàn thiện hồ sơ Lead.'),
          quizItem('q4', 'Quy tắc chặn điểm áp dụng khi?', ['Luôn luôn', 'Khi KPI Đầy đủ thông tin dưới ngưỡng công ty', 'Khi trời mưa', 'Khi mới vào'], [1], 'Bảo vệ chất lượng dữ liệu.'),
          quizItem('q5', 'Thiếu địa chỉ lắp đặt ảnh hưởng?', ['Không', 'Khó khảo sát/lắp và trừ KPI', 'Tự động chuyển Deal', 'Xóa Lead'], [1], 'Địa chỉ cần cho khảo sát.'),
          quizItem('q6', 'Nên kiểm tra 6 trường khi nào?', ['Cuối năm', 'Ngay khi tạo Lead và trước chuyển Deal', 'Sau khi SX xong', 'Không cần'], [1], 'Sớm = ít sửa lại.'),
        ],
      }),
      checklistEx({
        id: C(6),
        lesson_id: L(4),
        title: 'Tự kiểm: 6 trường trên Lead thật',
        texts: [
          'Mở 1 Lead của tôi trên app',
          'SĐT đủ 10 số',
          'Email hợp lệ hoặc ghi chú "KH không dùng email"',
          'Địa chỉ đến quận/huyện',
          'Nguồn chọn từ danh mục',
          'Loại SP + Mức ưu tiên đã chọn',
        ],
      }),
    ],
  }),
];

const moreLessons = [
  [5, 'Bài 5: Nhiệm vụ trên Lead', 'Tạo, giao, hoàn thành nhiệm vụ CRM.', '**Nhiệm vụ** _(việc cần làm, có hạn)_: "Gọi KH lần 1", "Gửi báo giá", "Hẹn đo đạc".\n\nTạo tại tab **Nhiệm vụ** → đặt **hạn** → chuyển **Đang làm** → **Hoàn thành** khi xong.', C(7), 'checklist', null],
  [6, 'Bài 6: Ghi chú và file minh chứng khi hoàn thành nhiệm vụ', 'Quy định bắt buộc ghi chú + đính kèm.', 'Popup khi Hoàn thành: ghi **kết quả cụ thể** (ai, lúc mấy giờ, KH phản hồi gì) + **ảnh/Zalo** nếu công ty yêu cầu.\n\nGhi chú "đã gọi" không đủ — phải có nội dung kiểm chứng.', C(8), 'quiz_strict', C(9)],
  [7, 'Bài 7: Ghi chú và tài liệu trên Lead', '3 nơi lưu: Nhiệm vụ, Tài liệu, Hoạt động.', '| Loại | Lưu ở đâu | Ví dụ |\n|---|---|---|\n| Cuộc gọi | Hoạt động / Nhiệm vụ | "14h gọi, hẹn đo thứ 5" |\n| File | Tài liệu | Báo giá PDF, ảnh đo |\n| Trao đổi nội bộ | Ghi chú / Chat | @mention đồng nghiệp |', C(10), 'quiz', null],
  [8, 'Bài 8: Lịch sử tương tác', '5 kênh ghi nhận, quy tắc 5 phút với Lead Hot.', '**5 kênh:** Gọi, Gặp, Email/Tin nhắn, Đổi giai đoạn, Hệ thống.\n\n**Lead Hot:** gọi trong **5 phút** từ khi nhận — tăng tỉ lệ chốt.', C(11), 'quiz', null],
  [9, 'Bài 9: Hạn chót và SLA', 'SLA = hạn xử lý cam kết.', '**SLA** ví dụ: Mới → Đã liên hệ trong **1 ngày**; Đã báo giá → phản hồi trong **7 ngày**.\n\nTab **Deadline** và badge đỏ giúp ưu tiên.', C(12), 'quiz', null],
  [10, 'Bài 10: Hệ thống KPI Lead', 'Ledger + bảng tỷ lệ tháng.', 'Chỉ số chính: **Đầy đủ thông tin**, **Đúng hạn**, **Chuyển Deal**, **Tiếp xúc thành công**.\n\nXem tại **CRM → Bảng điểm**. **Quy tắc chặn điểm** khi Đầy đủ thông tin < 80%.', C(13), 'quiz_strict', C(14)],
  [11, 'Bài 11: Chuyển Lead thành Deal', 'Điều kiện chuyển, không hoàn tác.', 'Chuyển khi KH **đồng ý mua** + thống nhất **sản phẩm, giá, phạm vi**.\n\n**Chuyển Deal** trên header → chọn pipeline → **Xác nhận**. **Không hoàn tác** — kiểm tra kỹ.', C(15), 'quiz', C(16)],
  [12, 'Bài 12: Tình huống đặc biệt', 'Trùng, mất, mở lại, blocklist.', '- **Trùng SĐT:** mở Lead cũ.\n- **Mất Lead:** đánh dấu + lý do, không xóa.\n- **Mở lại:** khi KH quay lại sau thời gian.\n- **Blocklist:** khách không muốn liên hệ — báo admin.', C(17), 'quiz', null],
];

for (const [num, title, summary, bodyHint, exMain, exType, exExtra] of moreLessons) {
  const lid = L(num);
  const exs = [];
  if (exType === 'checklist') {
    exs.push(
      checklistEx({
        id: exMain,
        lesson_id: lid,
        title: 'Thực hành: Nhiệm vụ Lead',
        texts: [
          'Tạo nhiệm vụ có hạn cụ thể',
          'Ghi chú kết quả khi hoàn thành',
          'Đính kèm minh chứng nếu yêu cầu',
          'Không tick xong khi chưa gọi',
          'Kiểm tra nhiệm vụ chặn trước khi kéo cột',
        ],
      }),
    );
  } else if (exType === 'quiz_strict') {
    exs.push(
      quizEx({
        id: exMain,
        lesson_id: lid,
        title: 'Kiểm tra bắt buộc',
        passing_score: 80,
        time_limit_minutes: 15,
        items: buildStrictQuiz(num),
      }),
    );
    if (exExtra) {
      exs.push(
        essayEx({
          id: exExtra,
          lesson_id: lid,
          title: 'Tự luận: Áp dụng quy định',
          prompt:
            'Mô tả 1 tình huống bạn đã tuân thủ đúng quy định (ghi chú + file) và 1 tình huống từng thiếu sót. Nêu bài học và cam kết tháng tới (tối thiểu 200 từ, 3 mục rõ ràng).',
        }),
      );
    }
  } else {
    exs.push(
      quizEx({
        id: exMain,
        lesson_id: lid,
        title: `Kiểm tra: ${title.replace(/^Bài \d+: /, '')}`,
        items: buildLessonQuiz(num),
      }),
    );
    if (exExtra) {
      exs.push(
        checklistEx({
          id: exExtra,
          lesson_id: lid,
          title: 'Checklist trước chuyển Deal',
          texts: [
            'KH đồng ý mua có ghi nhận',
            'Đủ 6 thông tin',
            'Đã báo giá / file',
            'Đã chọn đúng pipeline Deal',
            'Đã kiểm tra không trùng Deal',
          ],
        }),
      );
    }
  }

  lessons.push(
    mkLesson({
      id: lid,
      sort_order: num,
      title,
      summary,
      content_md: tpl(
        title,
        `Tình huống ngành tủ bếp/cửa nhôm — ${summary}`,
        'Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.',
        bodyHint,
        '1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.\n2. Thực hiện đúng thứ tự.\n3. Kiểm tra lịch sử đã lưu.\n\nThao tác màn hình: khoá **Hướng dẫn CRM**.',
        '- Chỉ làm ngoài app.\n- Bỏ qua ghi chú/minh chứng.\n- Chuyển Deal khi chưa đủ điều kiện.',
        'Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.',
        '- Điều gì bạn sẽ áp dụng ngay hôm nay?',
      ),
      tags: ['lead', `bai-${num}`],
      cover: COVER_LEAD,
      exercises: exs,
    }),
  );
}

function buildLessonQuiz(num) {
  const bank = {
    7: [
      ['Ghi chú cuộc gọi nên ở?', ['Tài liệu', 'Hoạt động / Nhiệm vụ', 'Blocklist', 'Xóa Lead'], [1], 'Ghi chú tương tác thuộc hoạt động/nhiệm vụ.'],
      ['Hợp đồng PDF ký nên?', ['Chat', 'Tài liệu Lead', 'Email cá nhân', 'Không lưu'], [1], 'Hồ sơ tập trung tab Tài liệu.'],
      ['Tên file tốt?', ['a.pdf', 'HD_ChịLan_2026-03.pdf', '1.jpg', 'tmp'], [1], 'Tên có ngữ nghĩa.'],
    ],
    8: [
      ['Quy tắc 5 phút với Lead Hot?', ['Gọi trong 5 phút', 'Nghỉ 5 phút', 'Xóa sau 5 phút', 'Không áp dụng'], [0], 'Phản hồi nhanh tăng tỉ lệ chốt.'],
      ['Hoạt động ghi nhận?', ['Chỉ gọi', 'Gọi, gặp, email, đổi giai đoạn…', 'Chỉ KPI', 'Chỉ chat nội bộ'], [1], 'Timeline đầy đủ.'],
    ],
    9: [
      ['SLA là?', ['Hạn xử lý cam kết', 'Loại cửa', 'Mã Lead', 'Thuế'], [0], 'SLA = cam kết thời gian.'],
      ['Badge đỏ trên thẻ?', ['Quá hạn SLA', 'Đã thắng', 'Đã xóa', 'VIP'], [0], 'Cần xử lý gấp.'],
    ],
    11: [
      ['Khi nào chuyển Deal?', ['Mới tạo Lead', 'KH đồng ý mua + thống nhất SP/giá', 'Chưa gọi', 'Cuối năm'], [1], 'Đủ điều kiện nghiệp vụ.'],
      ['Sau chuyển Deal?', ['Mất lịch sử', 'Giữ lịch sử, sang pipeline Deal', 'Xóa Lead', 'Tạo SĐT mới'], [1], 'Chuyển một chiều nhưng giữ dữ liệu.'],
    ],
    12: [
      ['Lead trùng SĐT?', ['Tạo mới', 'Gộp chăm sóc trên Lead cũ', 'Ẩn', 'Block'], [1], 'Một khách một luồng.'],
      ['Lead "Mất"?', ['Xóa', 'Đánh dấu mất + lý do', 'Chuyển Deal', 'Tạo NV'], [1], 'Giữ lịch sử phân tích.'],
    ],
  };
  const items = bank[num] || [
    ['Điều quan trọng nhất bài này?', ['Ghi trên hệ thống', 'Chỉ nhớ', 'Không cần CRM', 'Chỉ Excel'], [0], 'Minh bạch trên CRM.'],
  ];
  return items.map(([q, opts, cor, exp], i) => quizItem(`q${i + 1}`, q, opts, cor, exp));
}

function buildStrictQuiz(num) {
  if (num === 6) {
    return [
      quizItem('q1', 'Khi hoàn thành nhiệm vụ bắt buộc, hệ thống thường yêu cầu?', ['Chỉ tick', 'Ghi chú + file minh chứng (nếu cấu hình)', 'Xóa Lead', 'Đổi mật khẩu'], [1], 'Minh chứng chứng minh đã làm.'),
      quizItem('q2', 'Ghi chú "đã gọi" không số điện thoại — đánh giá?', ['Đạt', 'Không đạt — thiếu nội dung', 'Tốt nhất', 'Không cần'], [1], 'Ghi chú phải có thông tin kiểm chứng.'),
      quizItem('q3', 'Screenshot Zalo nên lưu?', ['Chat riêng', 'Đính kèm nhiệm vụ / tài liệu Lead', 'Xóa', 'Chỉ máy cá nhân'], [1], 'Để đồng nghiệp và KPI đối soát.'),
      quizItem('q4', 'Tick hoàn thành khi chưa gọi?', ['Được', 'Vi phạm — trừ KPI', 'Bắt buộc', 'Chỉ cuối tuần'], [1], 'Gian lận tiến độ.'),
      quizItem('q5', 'Mục đích quy định minh chứng?', ['Làm khó', 'Minh bạch và đo chất lượng', 'Giảm Lead', 'Tăng thuế'], [1], 'Bảo vệ khách và công bằng KPI.'),
      quizItem('q6', 'Ai đọc được ghi chú nhiệm vụ?', ['Chỉ bạn', 'Team có quyền trên Lead', 'Khách hàng tự động', 'Không ai'], [1], 'Hỗ trợ handover.'),
      quizItem('q7', 'File ảnh đo đạc nên gắn?', ['Lead / nhiệm vụ khảo sát', 'Email cá nhân', 'Không lưu', 'Blocklist'], [0], 'Gắn đúng ngữ cảnh công việc.'),
      quizItem('q8', 'Không tuân thủ lâu ngày hậu quả?', ['Thưởng', 'KPI thấp, mất uy tín', 'Tự thăng chức', 'Không ảnh hưởng'], [1], 'KPI gắn hành vi.'),
    ];
  }
  return [
    quizItem('q1', 'KPI Lead gồm?', ['Chỉ doanh số', 'Đầy đủ thông tin, Đúng hạn, chuyển Deal…', 'Chỉ số cuộc gọi', 'Chỉ Facebook'], [1], 'Nhiều chỉ số hành vi.'),
    quizItem('q2', 'KPI "Đúng hạn" đo?', ['% nhiệm vụ/Lead xử lý đúng SLA', 'Số email', 'Chiều cao tủ', 'Màu sơn'], [0], 'Trước đây có thể gọi A4.'),
    quizItem('q3', 'Xem điểm KPI ở?', ['CRM → Bảng điểm', 'Chỉ sếp', 'Không có', 'Zalo'], [0], 'Scorecard tháng.'),
    quizItem('q4', 'Quy tắc chặn điểm khi KPI Đầy đủ thông tin thấp?', ['Không', 'Có — điểm tháng bị giới hạn', 'Chỉ admin', 'Chỉ năm'], [1], 'Khuyến khích nhập liệu.'),
    quizItem('q5', 'Ledger KPI là?', ['Sổ ghi sự kiện cộng/trừ điểm', 'Loại cửa', 'Mã HĐ', 'Tên KH'], [0], 'Tự động khi làm đúng/sai.'),
    quizItem('q6', 'Cải thiện KPI tháng sau nên?', ['Lặp lại sai sót', 'Kế hoạch cụ thể từng chỉ số', 'Không làm gì', 'Tắt CRM'], [1], 'Hành động đo được.'),
    quizItem('q7', 'Lead chuyển Deal ảnh hưởng KPI?', ['Không', 'Có — chỉ số chuyển đổi', 'Chỉ xưởng', 'Chỉ vận chuyển'], [1], 'Đo năng suất sales.'),
    quizItem('q8', 'KPI công bằng khi?', ['Mọi người cùng quy tắc trên CRM', 'Sổ tay riêng', 'Ẩn số liệu', 'Không ghi'], [0], 'Cùng hệ thống.'),
  ];
}

// Final exam lesson 13
const finalQuestions = [];
for (let i = 1; i <= 25; i++) {
  finalQuestions.push(
    quizItem(
      `fq${i}`,
      `Câu ${i}: Điều nào đúng về quy trình Lead?`,
      [
        'Lead = khách tiềm năng chưa cam kết mua',
        'Lead = đã ký hợp đồng',
        'Không cần Quét trùng SĐT',
        'Có thể có nhiều phụ trách chính',
      ],
      [0],
      'Lead chưa chốt; một phụ trách; bắt buộc quét trùng.',
    ),
  );
}
// diversify final exam
const finalBank = [
  ['Deal khác Lead ở?', ['Đã chốt mua', 'Chưa liên hệ', 'Là nhân viên', 'Là file'], [0], 'Deal sau khi thống nhất mua.'],
  ['6 trường bắt buộc giúp KPI nào?', ['Đầy đủ thông tin', 'Màu tủ', 'Giờ nghỉ', 'Loại xe'], [0], 'Tỷ lệ đủ 6 trường.'],
  ['SLA là?', ['Hạn xử lý cam kết', 'Mã SP', 'Tên xưởng', 'VAT'], [0], 'Cam kết thời gian.'],
  ['Chuyển Deal khi?', ['Mới tạo', 'KH đồng ý mua', 'Chưa gọi', 'Không bao giờ'], [1], 'Đủ điều kiện nghiệp vụ.'],
  ['Quét trùng trước?', ['Tạo Lead', 'Lưu Lead mới', 'Xóa KH', 'In PDF'], [1], 'Tránh trùng.'],
];
finalQuestions.length = 0;
for (let i = 0; i < 25; i++) {
  const b = finalBank[i % finalBank.length];
  finalQuestions.push(quizItem(`fq${i + 1}`, `Câu ${i + 1}: ${b[0]}`, b[1], b[2], b[3]));
}

lessons.push(
  finalExamLesson({
    lessonId: L(13),
    exId: 'c2000001-0000-0000-0000-000000000099',
    categoryPrefix: 'lead',
    title: 'Bài 13: Bài thi tổng kết — Lead',
    questions: finalQuestions,
    passing_score: 80,
  }),
);

module.exports = {
  title: 'Khoá Lead — Quản lý Khách hàng Tiềm năng',
  description: 'Seed Lead course — generated',
  category: CAT,
  lessons,
};
