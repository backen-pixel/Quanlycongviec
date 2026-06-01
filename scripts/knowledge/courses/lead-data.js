/**
 * Nội dung khoá Lead — 12 bài + thi tổng kết.
 * Trật tự tâm lý: Tư tưởng → Tư duy → Nguồn lực → Vận hành → Báo cáo & Sửa chữa.
 */
const { quizItem } = require('./_helpers');

const q = quizItem;

/** Mỗi bài: { num, title, summary, pillar, quiz: { tt, td, nl, vh, bc } } */
const LESSON_SPECS = [
  {
    num: 1,
    title: 'Bài 1: Vai trò của bạn — Vì sao phải quản lý Lead',
    summary: 'Hiểu vì sao công ty bắt buộc CRM, vai trò nhân viên kinh doanh và lợi ích cho bản thân.',
    pillar: {
      hook: 'Chị Hoa nhắn fanpage hỏi giá tủ bếp — đó là một Lead. Nếu không ghi vào hệ thống, ai cũng có thể "quên" và khách mất.',
      tuTuong: {
        vaiTro: 'Bạn là người đầu tiên nắm giữ cơ hội bán hàng — chịu trách nhiệm chăm sóc đến khi khách đồng ý mua hoặc từ chối rõ ràng.',
        ynghia: [
          'CRM không phải để "giám sát" — mà để **không mất khách**, **không tranh cãi nội bộ**, **tính KPI công bằng**.',
          'Mỗi Lead có **một người phụ trách chính** — bạn là chủ sở hữu cơ hội đó.',
          'Ghi trên hệ thống = đồng nghiệp có thể hỗ trợ khi bạn nghỉ phép.',
        ],
      },
      tuDuy: {
        phanBiet: [
          '**Lead** _(khách đã liên hệ, chưa cam kết mua)_ — ví dụ: hỏi giá tủ bếp qua Zalo.',
          '**Deal** _(đã thống nhất mua, đang làm hợp đồng)_ — ví dụ: chốt 68 triệu, hẹn ký HĐ.',
          '**Khách hàng** _(đã ký HĐ và đặt cọc)_ — ví dụ: đã chuyển 50% tiền cọc.',
        ],
        mentalModel: 'Hãy tưởng tượng Lead như "hạt giống" — bạn tưới nước (gọi, tư vấn) cho đến khi nảy mầm (Deal) hoặc héo (Mất Lead).',
      },
      nguonLuc: {
        manHinh: '**CRM → Bảng Lead** — nơi mọi Lead của công ty được hiển thị.',
        congCu: ['Bảng Kanban (kéo thẻ theo giai đoạn)', 'Chi tiết Lead (tab Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu)', 'Bảng điểm KPI (xem điểm tháng của bạn)'],
        duLieu: 'Tiêu đề Lead, SĐT khách, người phụ trách, giai đoạn pipeline.',
      },
      vanHanh: {
        steps: [
          'Đăng nhập CRM → mở **Bảng Lead**.',
          'Xem Lead được giao cho bạn (bộ lọc **Lead của tôi**).',
          'Mở một Lead → đọc lịch sử trước khi gọi khách.',
          'Mọi cuộc gọi, ghi chú đều lưu trên hệ thống — không ghi sổ tay riêng.',
        ],
        mentor: 'Trước khi gọi khách, dành 30 giây đọc lịch sử Lead trên app — khách sẽ cảm thấy bạn chuyên nghiệp hơn.',
      },
      baoCaoSua: {
        tuKiem: ['Tôi đã mở được Bảng Lead?', 'Tôi biết Lead nào do mình phụ trách?', 'Tôi hiểu khác biệt Lead / Deal / Khách hàng?'],
        loiHay: ['Ghi sổ tay riêng → đồng nghiệp không nắm được.', 'Tạo Lead trùng SĐT → tranh cãi ai được tính KPI.'],
        suaSao: ['Chuyển sang CRM ngay từ hôm nay.', 'Luôn Quét trùng SĐT trước khi tạo Lead mới (Bài 5).'],
        kpi: 'Chưa có KPI riêng ở bài này — nền tảng để hiểu các chỉ số ở Bài 10.',
      },
      tomTat: 'Lead = khách tiềm năng; bạn là người phụ trách; mọi thao tác trên CRM — không sổ tay.',
    },
    quiz: {
      tt: [
        ['Vì sao công ty bắt buộc dùng CRM thay sổ tay?', ['Tốn thời gian', 'Lưu lịch sử, nhắc hẹn, tính KPI công bằng', 'Chỉ để admin giám sát', 'Không có lý do'], [1], 'CRM giúp minh bạch và đo lường hiệu quả.'],
        ['Một Lead có bao nhiêu người phụ trách chính?', ['Không giới hạn', 'Một người', 'Chỉ admin', 'Hai người bắt buộc'], [1], 'Tránh trách nhiệm chồng chéo.'],
        ['Thành viên hỗ trợ trên Lead dùng để?', ['Thay phụ trách chính', 'Hỗ trợ cùng team, phụ trách chính vẫn chịu KPI', 'Ẩn Lead', 'Xóa KPI'], [1], 'Phụ trách chính không đổi.'],
      ],
      td: [
        ['Lead là gì?', ['Khách đã ký HĐ', 'Khách tiềm năng đã tiếp xúc, chưa cam kết mua', 'Sản phẩm mới', 'Nhân viên mới'], [1], 'Lead chưa có cam kết mua.'],
        ['Deal là gì?', ['Khách mới nhắn tin', 'Đã thống nhất mua, đang hoàn tất HĐ', 'Đã thanh toán 100%', 'Lead bị xóa'], [1], 'Deal = giai đoạn sau khi chốt mua.'],
        ['Chị Hoa hỏi giá qua fanpage — phân loại?', ['Deal', 'Lead', 'Khách hàng', 'Báo giá PDF'], [1], 'Mới hỏi giá = Lead.'],
        ['Khi Lead "chín", bước tiếp theo?', ['Xóa Lead', 'Chuyển thành Deal', 'Tạo nhân viên', 'In phiếu lương'], [1], 'Chuyển Deal khi đủ điều kiện (Bài 11).'],
      ],
      nl: [
        ['Đường dẫn xem Lead?', ['Công việc → Dự án', 'CRM → Bảng Lead', 'Kiến thức', 'Xưởng SX'], [1], 'Lead nằm trong CRM.'],
        ['Bộ lọc "Lead của tôi" giúp?', ['Ẩn hết Lead', 'Chỉ xem Lead bạn phụ trách', 'Xóa Lead', 'In HĐ'], [1], 'Lọc theo người phụ trách.'],
        ['Mỗi thẻ trên Kanban đại diện?', ['Một nhân viên', 'Một Lead', 'Một báo cáo', 'Một file PDF'], [1], 'Một thẻ = một Lead.'],
      ],
      vh: [
        ['Trước khi gọi khách, nên làm gì trên CRM?', ['Xóa Lead', 'Đọc lịch sử Lead trên app', 'Đổi mật khẩu', 'In báo cáo'], [1], 'Nắm ngữ cảnh trước khi liên hệ.'],
        ['Ghi chú cuộc gọi nên lưu ở đâu?', ['Sổ tay', 'Hoạt động / Nhiệm vụ trên Lead', 'Email cá nhân', 'Không cần ghi'], [1], 'Lịch sử tập trung trên CRM.'],
        ['Đồng nghiệp nghỉ phép — CRM giúp gì?', ['Không giúp', 'Người thay thế đọc được lịch sử Lead', 'Tự xóa Lead', 'Khóa tài khoản'], [1], 'Handover mượt mà.'],
      ],
      bc: [
        ['Ghi sổ tay riêng thay CRM — hậu quả?', ['Không ảnh hưởng', 'Đồng nghiệp không nắm, KPI không đối soát', 'Tự thăng chức', 'Khách hài lòng hơn'], [1], 'Mất minh bạch.'],
        ['Tạo Lead trùng SĐT — vấn đề?', ['Không sao', 'Tranh KPI, khó quản lý một khách', 'Tự động thưởng', 'Khách vui'], [1], 'Một SĐT — một luồng chăm sóc.'],
        ['Tự kiểm sau bài 1: bạn cần biết?', ['Chỉ mật khẩu', 'Khác biệt Lead/Deal/KH và đường vào Bảng Lead', 'Chỉ in PDF', 'Chỉ chat nội bộ'], [1], 'Nền tảng tư duy.'],
      ],
    },
  },
  {
    num: 2,
    title: 'Bài 2: Tiếp nhận Lead — 5 kênh và quy tắc vàng',
    summary: 'Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT.',
    pillar: {
      hook: 'Khách gọi tổng đài hỏi cửa nhôm Xingfa — bạn có 5 phút để tạo Lead đúng chuẩn, không trùng khách cũ.',
      tuTuong: {
        vaiTro: 'Bạn là "cửa ngõ" — ai tiếp nhận đúng, cả công ty chăm sóc khách suôn sẻ.',
        ynghia: ['Tiếp nhận chậm hoặc sai → khách chuyển sang đối thủ.', 'Quét trùng SĐT = tôn trọng đồng nghiệp đã chăm sóc trước.'],
      },
      tuDuy: {
        phanBiet: [
          '**Nguồn Lead** _(kênh khách đến)_: Fanpage/Zalo, Tổng đài, Website, Showroom, Giới thiệu.',
          'Lead **Hot** _(vừa liên hệ, cần phản hồi nhanh)_ vs Lead **ấm** _(đã tư vấn vài ngày)_.',
        ],
        mentalModel: 'Tiếp nhận = nhận "gói hàng" — kiểm tra nhãn (SĐT, nguồn) trước khi đặt lên kệ (pipeline).',
      },
      nguonLuc: {
        manHinh: '**Bảng Lead → + Lead mới**',
        congCu: ['Form tạo Lead (Tiêu đề, Khách hàng, SĐT)', 'Nút **Quét trùng**', 'Danh mục Nguồn, Loại sản phẩm'],
        duLieu: 'Tiêu đề Lead + Khách hàng (có SĐT) — tối thiểu bắt buộc.',
      },
      vanHanh: {
        steps: [
          '**Bảng Lead → + Lead mới**.',
          'Nhập **Tiêu đề** rõ: Tên — Khu vực — Sản phẩm (vd: Chị Lan Q7 — Cửa 2 cánh).',
          'Chọn hoặc **+ Tạo nhanh** Khách hàng, nhập **SĐT**.',
          'Bấm **Quét trùng** — nếu trùng → mở Lead cũ, **không** tạo mới.',
          'Chọn Nguồn, Loại sản phẩm → **Lưu**.',
          'Gọi lại khách đúng hẹn (Lead Hot: trong 5 phút).',
        ],
        mentor: 'Tiêu đề Lead giống "nhãn trên hộp" — đặt tên rõ, 6 tháng sau bạn vẫn nhận ra ngay.',
      },
      baoCaoSua: {
        tuKiem: ['Đã Quét trùng trước Lưu?', 'Tiêu đề có tên + khu vực + SP?', 'SĐT đủ 10 số?', 'Chọn đúng Nguồn?'],
        loiHay: ['Tạo Lead mới khi SĐT đã tồn tại.', 'Tiêu đề "Khách mới" hoặc để trống.'],
        suaSao: ['Trùng SĐT → mở Lead cũ, thêm ghi chú.', 'Sửa tiêu đề ngay trong chi tiết Lead.'],
        kpi: 'Nguồn Lead dùng để thống kê hiệu quả kênh marketing.',
      },
      tomTat: 'Quét trùng → tiêu đề rõ → đủ SĐT → chọn Nguồn → Lưu → gọi lại đúng hẹn.',
    },
    quiz: {
      tt: [
        ['Vì sao phải Quét trùng SĐT trước Lưu?', ['Tốn thời gian', 'Tránh trùng khách, tranh KPI', 'Bắt buộc in PDF', 'Chỉ admin'], [1], 'Một SĐT — một luồng chăm sóc.'],
        ['Tiếp nhận chậm với Lead Hot — rủi ro?', ['Không sao', 'Khách chuyển sang đối thủ', 'Tự thưởng', 'Tự xóa Lead'], [1], 'Phản hồi nhanh tăng tỉ lệ chốt.'],
      ],
      td: [
        ['Có bao nhiêu kênh tiếp nhận chính?', ['3', '4', '5', '7'], [2], 'Fanpage, tổng đài, web, showroom, giới thiệu.'],
        ['Lead Hot cần phản hồi trong?', ['1 tuần', '5 phút (quy tắc công ty)', '1 tháng', 'Không cần'], [1], 'Quy tắc 5 phút.'],
        ['Nguồn Lead dùng để?', ['Trang trí', 'Thống kê hiệu quả kênh marketing', 'Xóa Lead', 'Tính thuế'], [1], 'Báo cáo theo nguồn.'],
      ],
      nl: [
        ['Thông tin BẮT BUỘC tối thiểu khi tạo Lead?', ['Mã số thuế', 'Tiêu đề + Khách hàng', 'Bản vẽ 3D', 'Hợp đồng'], [1], 'Hệ thống yêu cầu tiêu đề và khách.'],
        ['Nút Quét trùng nằm ở đâu?', ['Cài đặt', 'Form tạo Lead mới', 'Báo cáo SX', 'Chat'], [1], 'Trong form trước khi Lưu.'],
        ['Nút + Lead mới thường ở?', ['Thanh trên Bảng Lead', 'Footer', 'Cài đặt', 'Dashboard SX'], [0], 'Thanh công cụ Bảng Lead.'],
      ],
      vh: [
        ['Trước Lưu Lead mới phải?', ['In PDF', 'Quét trùng SĐT', 'Ký HĐ', 'Bàn giao xưởng'], [1], 'Bước bắt buộc.'],
        ['Nếu Quét trùng có kết quả?', ['Tạo mới', 'Mở Lead cũ, thêm ghi chú', 'Đổi SĐT giả', 'Xóa khách'], [1], 'Không nhân đôi khách.'],
        ['Tiêu đề Lead tốt nhất?', ['"KH"', '"Chị Lan Q7 — Cửa 2 cánh"', 'Để trống', 'Chỉ ngày'], [1], 'Nhận diện nhanh.'],
        ['Sau Lưu, Lead mới thường ở cột?', ['Thắng', 'Mới (đầu pipeline)', 'Đã xóa', 'Không hiện'], [1], 'Giai đoạn đầu pipeline.'],
      ],
      bc: [
        ['Tạo Lead trùng SĐT — sửa thế nào?', ['Xóa Lead mới', 'Gộp chăm sóc trên Lead cũ', 'Đổi SĐT', 'Báo cáo giả'], [1], 'Một khách một luồng.'],
        ['Tiêu đề "Khách mới" — vấn đề?', ['Tốt', 'Đồng nghiệp không nhận ra Lead', 'Tự thưởng', 'KPI tăng'], [1], 'Tiêu đề phải có ngữ nghĩa.'],
        ['Checklist: trước Lưu cần?', ['Quét trùng + tiêu đề rõ + Nguồn', 'Chỉ SĐT', 'Chỉ ảnh', 'Không cần'], [0], 'Ba bước tối thiểu.'],
      ],
    },
    checklist: [
      'Bấm Quét trùng trước khi Lưu',
      'Tiêu đề có tên + khu vực + sản phẩm',
      'SĐT đủ 10 số',
      'Chọn đúng Nguồn',
      'Chọn Loại sản phẩm',
      'Lead hiện ở cột Mới sau Lưu',
    ],
  },
  {
    num: 3,
    title: 'Bài 3: Bảng Lead và pipeline — Di chuyển khách qua từng giai đoạn',
    summary: 'Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột và tab Deadline.',
    pillar: {
      hook: 'Sáng mở Kanban — thấy 3 Lead cột **Mới** cần gọi trước 10h. Pipeline giúp bạn biết khách đang ở đâu.',
      tuTuong: { vaiTro: 'Pipeline phản ánh **tiến độ thật** — không phải để "trang trí bảng".', ynghia: ['Mỗi cột = một giai đoạn chăm sóc.', 'Kéo thẻ sai = báo cáo sai, KPI sai.'] },
      tuDuy: {
        phanBiet: ['**Pipeline** _(các giai đoạn Lead trên bảng)_', '**Kanban** _(bảng kéo thả theo cột)_'],
        mentalModel: 'Pipeline như **cầu thang** — khách leo từng bậc: Mới → Liên hệ → Tư vấn → Báo giá → Đồng ý.',
        bang: '| Giai đoạn | Việc bạn thường làm |\n|---|---|\n| Mới | Gọi lần 1 |\n| Đã liên hệ | Trao đổi nhu cầu |\n| Đang tư vấn | Đo đạc, tư vấn mẫu |\n| Đã báo giá | Gửi báo giá, theo dõi |\n| Đã đồng ý | Chuẩn bị chuyển Deal |',
      },
      nguonLuc: { manHinh: '**CRM → Bảng Lead → Kanban**', congCu: ['Tab Kanban', 'Tab Deadline', 'Ô Tìm kiếm (tên, SĐT, mã Lead)'], duLieu: 'Giai đoạn hiện tại, badge SLA, người phụ trách.' },
      vanHanh: { steps: ['Mở **Kanban**.', 'Kéo thẻ khi **đã hoàn thành việc** tương ứng giai đoạn.', 'Nếu bị chặn — đọc thông báo (nhiệm vụ chưa xong).', 'Sau cuộc gọi: ghi hoạt động + kéo thẻ nếu đủ điều kiện.'], mentor: 'Kéo thẻ **sau** khi làm việc — không kéo trước để "đẹp bảng".' },
      baoCaoSua: { tuKiem: ['Thẻ đang ở cột khớp việc thật?', 'Đã ghi hoạt động sau cuộc gọi?'], loiHay: ['Kéo cột chỉ để đẹp bảng.', 'Không ghi hoạt động sau gọi.'], suaSao: ['Kéo lại cột đúng + bổ sung ghi chú.'], kpi: 'Tab Deadline và badge đỏ = Lead trễ SLA.' },
      tomTat: 'Kanban phản ánh tiến độ thật; kéo thẻ = đổi giai đoạn có điều kiện.',
    },
    quiz: {
      tt: [['Pipeline Lead giúp gì?', ['Tính lương', 'Theo dõi giai đoạn chăm sóc khách', 'In HĐ', 'Chat nội bộ'], [1], 'Pipeline = quy trình giai đoạn.'], ['Kéo thẻ sai giai đoạn — hậu quả?', ['Không sao', 'Báo cáo và KPI sai', 'Tự thưởng', 'Khách vui'], [1], 'Dữ liệu phải khớp thực tế.']],
      td: [['Một thẻ Kanban là?', ['Một Lead', 'Một file', 'Một nhân viên', 'Một KPI tháng'], [0], 'Mỗi thẻ = một Lead.'], ['Kéo thẻ sang cột khác khi?', ['Rảnh', 'Đã hoàn thành việc tương ứng giai đoạn', 'Cuối tháng', 'Admin yêu cầu'], [1], 'Giai đoạn khớp việc thật.'], ['Cột "Đã đồng ý" thường dẫn tới?', ['Xóa', 'Chuyển Deal', 'Nghỉ phép', 'Tạo NV'], [1], 'Khách đồng ý mua → Deal.']],
      nl: [['Tab Kanban nằm ở?', ['Bảng Lead', 'Cài đặt', 'Kiến thức', 'Báo cáo SX'], [0], 'Trong màn Bảng Lead.'], ['Tab Deadline dùng để?', ['Xem Lead theo mốc hạn', 'Xóa Lead', 'Tạo báo giá', 'In HĐ'], [0], 'Ưu tiên Lead trễ SLA.'], ['Tìm Lead theo?', ['Chỉ màu', 'Tên, SĐT, mã', 'Chỉ email công ty', 'Không tìm được'], [1], 'Ô tìm trên thanh công cụ.']],
      vh: [['Kéo thẻ Lead để?', ['Xóa', 'Đổi giai đoạn pipeline', 'In lương', 'Tạo NV'], [1], 'Kanban = quản lý giai đoạn.'], ['Bị chặn khi kéo thường do?', ['Nhiệm vụ bắt buộc chưa xong', 'Trời mưa', 'Đã thắng', 'VIP'], [0], 'Gate nhiệm vụ.'], ['Sau kéo cột nên?', ['Im lặng', 'Ghi hoạt động nếu chưa có', 'Xóa SĐT', 'Đổi công ty'], [1], 'Lịch sử phải khớp.']],
      bc: [['Badge đỏ trên thẻ?', ['Quá hạn SLA', 'Đã cọc', 'Đã SX', 'Nghỉ phép'], [0], 'Cần xử lý gấp.'], ['Kéo thẻ không ghi hoạt động — sửa?', ['Bỏ qua', 'Bổ sung ghi chú hoạt động', 'Xóa Lead', 'Đổi pass'], [1], 'Lịch sử phải đầy đủ.'], ['Chế độ Deadline giúp?', ['Nhóm theo hạn xử lý', 'Xóa Lead', 'Tạo HĐ', 'Chat'], [0], 'Ưu tiên trễ SLA.']],
    },
  },
  {
    num: 4,
    title: 'Bài 4: Sáu thông tin bắt buộc — Nền tảng KPI Đầy đủ thông tin',
    summary: '6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm.',
    pillar: {
      hook: 'Lead của anh Minh thiếu email — chỉ số **Đầy đủ thông tin** tụt, có thể bị **quy tắc chặn điểm**.',
      tuTuong: { vaiTro: 'Hồ sơ Lead đầy đủ = bạn và xưởng làm việc không bị "mù" thông tin.', ynghia: ['Thiếu địa chỉ → khó khảo sát/lắp.', 'Thiếu nguồn → marketing không biết kênh nào hiệu quả.'] },
      tuDuy: {
        phanBiet: ['**KPI Đầy đủ thông tin** _(tỷ lệ Lead có đủ 6 trường)_', '**Quy tắc chặn điểm** _(dưới ngưỡng → điểm KPI tháng bị giới hạn)_'],
        mentalModel: '6 trường như **6 mảnh ghép** — thiếu một mảnh, bức tranh khách hàng không hoàn chỉnh.',
      },
      nguonLuc: { manHinh: 'Chi tiết Lead → tab **Tổng quan**', congCu: ['Form 6 trường bắt buộc', 'Bảng điểm KPI'], duLieu: 'SĐT, Email, Địa chỉ lắp đặt, Nguồn, Loại SP, Mức ưu tiên.' },
      vanHanh: { steps: ['Mở chi tiết Lead → tab Tổng quan.', 'Bổ sung trường còn thiếu.', 'Email: nhập thật hoặc ghi chú "KH không dùng email".', 'Cuối tuần tự kiểm 5 Lead của bạn.'], mentor: 'Điền đủ 6 trường **ngay khi tạo Lead** — sửa sau tốn gấp đôi thời gian.' },
      baoCaoSua: { tuKiem: ['SĐT 10 số?', 'Email hoặc ghi chú?', 'Địa chỉ đến quận/huyện?', 'Nguồn + Loại SP + Ưu tiên?'], loiHay: ['Để trống email vì "khách không có".', 'Chọn nguồn "Khác" cho mọi Lead.'], suaSao: ['Bổ sung ngay trong Tổng quan.'], kpi: 'Công ty thường yêu cầu ≥ **80%** Lead đủ 6 trường.' },
      tomTat: 'Đủ 6 trường = nền tảng chăm sóc và KPI minh bạch.',
    },
    quiz: {
      tt: [['KPI "Đầy đủ thông tin" đo gì?', ['Số cuộc gọi', '% Lead đủ 6 trường', 'Doanh số', 'Số file PDF'], [1], 'Tỷ lệ hoàn thiện hồ sơ.'], ['Quy tắc chặn điểm khi?', ['Luôn luôn', 'KPI Đầy đủ thông tin dưới ngưỡng công ty', 'Trời mưa', 'Mới vào'], [1], 'Bảo vệ chất lượng dữ liệu.']],
      td: [['Có bao nhiêu trường bắt buộc?', ['3', '4', '6', '10'], [2], 'Sáu trường theo quy định.'], ['Trường KHÔNG thuộc 6 trường?', ['SĐT', 'Ngày sinh khách', 'Nguồn', 'Loại sản phẩm'], [1], 'Ngày sinh không nằm trong bộ 6.']],
      nl: [['6 trường gồm?', ['SĐT, Email, Địa chỉ, Nguồn, Loại SP, Ưu tiên', 'Chỉ SĐT', 'Chỉ tên', 'Chỉ ảnh'], [0], 'Bộ 6 trường chuẩn.'], ['Xem 6 trường ở tab?', ['Tổng quan', 'Chat', 'Blocklist', 'Lương'], [0], 'Tab Tổng quan chi tiết Lead.']],
      vh: [['Thiếu địa chỉ lắp đặt ảnh hưởng?', ['Không', 'Khó khảo sát/lắp và trừ KPI', 'Tự chuyển Deal', 'Xóa Lead'], [1], 'Địa chỉ cần cho khảo sát.'], ['Nên kiểm tra 6 trường khi nào?', ['Cuối năm', 'Ngay khi tạo Lead và trước chuyển Deal', 'Sau SX', 'Không cần'], [1], 'Sớm = ít sửa lại.'], ['Email khách không có — làm gì?', ['Để trống', 'Ghi chú "KH không dùng email"', 'Nhập email giả', 'Xóa Lead'], [1], 'Ghi nhận rõ ràng.']],
      bc: [['KPI Đầy đủ thông tin thấp — sửa?', ['Bỏ qua', 'Bổ sung 6 trường cho Lead thiếu', 'Tắt CRM', 'Xóa Lead'], [1], 'Hành động cụ thể.'], ['Chọn nguồn "Khác" mọi Lead — vấn đề?', ['Tốt', 'Marketing không phân tích được kênh', 'Tự thưởng', 'Khách vui'], [1], 'Nguồn phải chính xác.'], ['Tự kiểm cuối tuần?', ['5 Lead của tôi đủ 6 trường', 'Chỉ 1 Lead', 'Không cần', 'Chỉ admin'], [0], 'Thói quen tốt.']],
    },
    checklist: ['Mở 1 Lead của tôi trên app', 'SĐT đủ 10 số', 'Email hợp lệ hoặc ghi chú', 'Địa chỉ đến quận/huyện', 'Nguồn từ danh mục', 'Loại SP + Mức ưu tiên đã chọn'],
  },
  {
    num: 5,
    title: 'Bài 5: Nhiệm vụ trên Lead — Việc cần làm có hạn',
    summary: 'Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột.',
    pillar: {
      hook: 'Nhiệm vụ "Gọi KH lần 1" quá hạn — badge đỏ trên thẻ Lead. Nhiệm vụ là **lời hẹn** bạn với khách và với hệ thống.',
      tuTuong: { vaiTro: 'Nhiệm vụ biến "nhớ trong đầu" thành **cam kết có hạn** trên hệ thống.', ynghia: ['Quên nhiệm vụ = quên khách.', 'Gate nhiệm vụ bảo vệ quy trình — không kéo cột khi chưa làm việc.'] },
      tuDuy: { phanBiet: ['**Nhiệm vụ** _(việc cần làm, có hạn)_ vs **Hoạt động** _(đã làm rồi — ghi nhận)_'], mentalModel: 'Nhiệm vụ = **hẹn giờ báo thức**; hoàn thành = tắt báo thức + ghi lại đã làm gì.' },
      nguonLuc: { manHinh: 'Chi tiết Lead → tab **Nhiệm vụ**', congCu: ['Tạo nhiệm vụ', 'Chuyển trạng thái Đang làm / Hoàn thành', 'Popup ghi chú khi hoàn thành'], duLieu: 'Tiêu đề nhiệm vụ, hạn, người phụ trách, ghi chú kết quả.' },
      vanHanh: { steps: ['Tab **Nhiệm vụ** → **+ Tạo nhiệm vụ**.', 'Đặt tiêu đề rõ: "Gọi KH lần 1", "Gửi báo giá".', 'Chọn **hạn** cụ thể.', 'Làm việc → chuyển **Đang làm** → **Hoàn thành** + ghi chú kết quả.', 'Kiểm tra nhiệm vụ chặn trước khi kéo cột Kanban.'], mentor: 'Một Lead nên có **1–3 nhiệm vụ mở** — quá nhiều = loạn, quá ít = quên.' },
      baoCaoSua: { tuKiem: ['Nhiệm vụ có hạn?', 'Đã ghi chú khi hoàn thành?', 'Không tick xong khi chưa gọi?'], loiHay: ['Tick hoàn thành khi chưa gọi.', 'Không đặt hạn.'], suaSao: ['Mở lại + ghi chú thật + hoàn thành lại đúng.'], kpi: 'KPI **Đúng hạn** đo % nhiệm vụ xử lý đúng SLA.' },
      tomTat: 'Tạo nhiệm vụ có hạn → làm → hoàn thành + ghi chú → mới kéo cột nếu gate yêu cầu.',
    },
    quiz: {
      tt: [['Nhiệm vụ trên Lead giúp gì?', ['Tính lương', 'Nhắc việc có hạn, gate quy trình', 'Xóa khách', 'In PDF'], [1], 'Cam kết có hạn.'], ['Gate nhiệm vụ bảo vệ?', ['Quy trình — không kéo cột khi chưa làm', 'Mật khẩu', 'Ảnh sản phẩm', 'Chat'], [0], 'Chất lượng quy trình.']],
      td: [['Nhiệm vụ khác Hoạt động?', ['Giống hệt', 'Nhiệm vụ = việc sắp làm; Hoạt động = đã làm', 'Chỉ admin', 'Không dùng'], [1], 'Tương lai vs quá khứ.'], ['Tab Nhiệm vụ dùng để?', ['Tính lương', 'Tạo và hoàn thành việc cần làm', 'Xóa Lead', 'Đổi pass'], [1], 'Task gắn Lead.']],
      nl: [['Tạo nhiệm vụ ở tab?', ['Nhiệm vụ', 'Blocklist', 'Lương', 'Chat công ty'], [0], 'Tab Nhiệm vụ chi tiết Lead.'], ['Popup khi Hoàn thành thường yêu cầu?', ['Chỉ tick', 'Ghi chú kết quả', 'Xóa Lead', 'Đổi SĐT'], [1], 'Ghi nhận đã làm gì.']],
      vh: [['Tạo nhiệm vụ nên?', ['Không hạn', 'Có hạn cụ thể', 'Chỉ cuối năm', 'Chỉ admin'], [1], 'Hạn = cam kết.'], ['Trước kéo cột Kanban nên?', ['Bỏ qua', 'Kiểm tra nhiệm vụ chặn', 'Xóa Lead', 'In PDF'], [1], 'Gate nhiệm vụ.'], ['Tiêu đề nhiệm vụ tốt?', ['"Việc"', '"Gọi KH lần 1"', 'Để trống', '123'], [1], 'Rõ việc cần làm.']],
      bc: [['Tick hoàn thành khi chưa gọi?', ['Được', 'Vi phạm — trừ KPI', 'Bắt buộc', 'Chỉ cuối tuần'], [1], 'Gian lận tiến độ.'], ['Nhiệm vụ quá hạn — sửa?', ['Bỏ qua', 'Xử lý ngay + ghi chú + cập nhật Lead', 'Xóa Lead', 'Đổi khách'], [1], 'Ưu tiên SLA.'], ['KPI Đúng hạn đo?', ['% nhiệm vụ xử lý đúng SLA', 'Số email', 'Chiều cao tủ', 'Màu sơn'], [0], 'Cam kết thời gian.']],
    },
    checklist: ['Tạo nhiệm vụ có hạn cụ thể', 'Ghi chú kết quả khi hoàn thành', 'Không tick xong khi chưa gọi', 'Kiểm tra nhiệm vụ chặn trước khi kéo cột'],
  },
  {
    num: 6,
    title: 'Bài 6: Minh chứng — Ghi chú và file khi hoàn thành nhiệm vụ',
    summary: 'Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu.',
    pillar: {
      hook: 'Ghi chú "đã gọi" không số điện thoại — **không đạt**. Minh chứng chứng minh bạn **thật sự** đã làm.',
      tuTuong: { vaiTro: 'Minh chứng bảo vệ **bạn** (tranh chấp KPI) và **khách** (lịch sử chăm sóc).', ynghia: ['Không minh chứng = không chứng minh được đã làm.', 'Screenshot Zalo, ảnh đo = bằng chứng công việc.'] },
      tuDuy: {
        phanBiet: ['**Ghi chú nhiệm vụ** _(kết quả cụ thể khi hoàn thành)_', '**Tài liệu** _(file PDF, ảnh đo, HĐ)_', '**Hoạt động** _(timeline gọi/gặp)_'],
        bang: '| Loại | Lưu ở đâu | Ví dụ |\n|---|---|---|\n| Cuộc gọi | Hoạt động / Nhiệm vụ | "14h gọi, hẹn đo thứ 5" |\n| File | Tài liệu | Báo giá PDF, ảnh đo |\n| Trao đổi nội bộ | Chat / Ghi chú | @mention đồng nghiệp |',
      },
      nguonLuc: { manHinh: 'Tab **Nhiệm vụ**, **Hoạt động**, **Tài liệu** trên chi tiết Lead', congCu: ['Popup hoàn thành nhiệm vụ', 'Upload file', 'Timeline hoạt động'], duLieu: 'Ghi chú có: ai, lúc mấy giờ, KH phản hồi gì.' },
      vanHanh: { steps: ['Khi Hoàn thành nhiệm vụ: ghi **kết quả cụ thể** (không chỉ "đã gọi").', 'Đính kèm **ảnh/Zalo** nếu công ty yêu cầu.', 'HĐ PDF → tab **Tài liệu**, tên file có nghĩa (vd: BG_ChịLan_2026-03.pdf).', 'Cuộc gọi → **Hoạt động** hoặc ghi chú nhiệm vụ.'], mentor: 'Ghi chú tốt: *"15h30 gọi chị Lan, hẹn đo đạc thứ 5 sáng, KH đồng ý"* — ai đọc cũng hiểu.' },
      baoCaoSua: { tuKiem: ['Ghi chú có thời gian + nội dung?', 'File đúng tab?', 'Tên file có nghĩa?'], loiHay: ['Ghi "đã gọi" không chi tiết.', 'Lưu HĐ PDF vào chat riêng.'], suaSao: ['Bổ sung ghi chú + upload lại file đúng tab.'], kpi: 'Minh chứng liên quan KPI chất lượng và đối soát.' },
      tomTat: 'Hoàn thành nhiệm vụ = ghi chú cụ thể + file đúng chỗ; không tick cho qua.',
    },
    quiz: {
      tt: [['Mục đích quy định minh chứng?', ['Làm khó', 'Minh bạch và đo chất lượng', 'Giảm Lead', 'Tăng thuế'], [1], 'Bảo vệ khách và công bằng KPI.'], ['Không minh chứng — rủi ro?', ['Không sao', 'Không chứng minh được đã làm', 'Tự thưởng', 'Khách vui'], [1], 'Tranh cãi KPI.']],
      td: [['Ghi chú cuộc gọi nên ở?', ['Tài liệu', 'Hoạt động / Nhiệm vụ', 'Blocklist', 'Xóa'], [1], 'Phân loại đúng kênh.'], ['HĐ PDF ký lưu ở?', ['Chat', 'Tài liệu', 'Không lưu', 'Email riêng'], [1], 'Tập trung hồ sơ.'], ['Tên file tốt?', ['a.pdf', 'HD_ChịLan_2026-03.pdf', '1.jpg', 'tmp'], [1], 'Tên có ngữ nghĩa.']],
      nl: [['Popup hoàn thành yêu cầu?', ['Chỉ tick', 'Ghi chú + file (nếu cấu hình)', 'Xóa Lead', 'Đổi pass'], [1], 'Minh chứng khi hoàn thành.'], ['Screenshot Zalo nên lưu?', ['Chat riêng', 'Đính kèm nhiệm vụ / tài liệu Lead', 'Xóa', 'Chỉ máy cá nhân'], [1], 'Để đối soát KPI.']],
      vh: [['Ghi chú "đã gọi" không SĐT — đánh giá?', ['Đạt', 'Không đạt — thiếu nội dung', 'Tốt nhất', 'Không cần'], [1], 'Phải có thông tin kiểm chứng.'], ['File ảnh đo đạc gắn?', ['Lead / nhiệm vụ khảo sát', 'Email cá nhân', 'Không lưu', 'Blocklist'], [0], 'Gắn đúng ngữ cảnh.'], ['Hoạt động khác ghi chú?', ['Giống hệt', 'Có loại + thời gian timeline', 'Chỉ admin', 'Không dùng'], [1], 'Timeline truy vết.']],
      bc: [['Tick hoàn thành khi chưa gọi?', ['Được', 'Vi phạm — trừ KPI', 'Bắt buộc', 'Chỉ cuối tuần'], [1], 'Gian lận tiến độ.'], ['Không tuân thủ lâu ngày?', ['Thưởng', 'KPI thấp, mất uy tín', 'Tự thăng chức', 'Không ảnh hưởng'], [1], 'KPI gắn hành vi.'], ['Ai đọc được ghi chú nhiệm vụ?', ['Chỉ bạn', 'Team có quyền trên Lead', 'KH tự động', 'Không ai'], [1], 'Hỗ trợ handover.']],
    },
    essay: 'Mô tả 1 tình huống bạn đã tuân thủ đúng quy định (ghi chú + file) và 1 tình huống từng thiếu sót. Nêu bài học và cam kết tháng tới (tối thiểu 200 từ).',
  },
  {
    num: 7,
    title: 'Bài 7: Lịch sử tương tác và SLA — Phản hồi đúng hạn',
    summary: '5 kênh ghi nhận, quy tắc 5 phút Lead Hot, tab Deadline.',
    pillar: {
      hook: 'Lead Hot vừa nhắn fanpage — quy tắc **5 phút**: gọi ngay, ghi hoạt động, tăng tỉ lệ chốt.',
      tuTuong: { vaiTro: 'SLA là **lời hứa thời gian** công ty với khách — bạn là người thực hiện.', ynghia: ['Trễ SLA → khách lạnh, đối thủ chen vào.', 'Timeline đầy đủ = sếp và đồng nghiệp hiểu bạn đang làm gì.'] },
      tuDuy: { phanBiet: ['**SLA** _(hạn xử lý cam kết)_ — vd: Mới → Liên hệ trong 1 ngày', '**5 kênh ghi nhận:** Gọi, Gặp, Email/Tin nhắn, Đổi giai đoạn, Hệ thống'], mentalModel: 'SLA như **đồng hồ đếm ngược** — badge đỏ = sắp hết giờ.' },
      nguonLuc: { manHinh: 'Bảng Lead (badge SLA) + tab **Deadline** + timeline **Hoạt động**', congCu: ['Tab Deadline', 'Badge đỏ trên thẻ', 'Timeline hoạt động'], duLieu: 'Mốc hạn, loại hoạt động, thời gian.' },
      vanHanh: { steps: ['Lead Hot: gọi trong **5 phút** từ khi nhận.', 'Mỗi tương tác → ghi **Hoạt động** (gọi/gặp/email).', 'Mở tab **Deadline** mỗi sáng — ưu tiên badge đỏ.', 'Đổi giai đoạn cũng được ghi nhận trên timeline.'], mentor: 'Sáng vào ca: mở Deadline trước, xử lý Lead đỏ trước — 10 phút đầu quyết định cả ngày.' },
      baoCaoSua: { tuKiem: ['Lead Hot đã gọi trong 5 phút?', 'Timeline có ghi nhận?', 'Lead đỏ đã xử lý?'], loiHay: ['Quên ghi hoạt động sau gọi.', 'Bỏ qua tab Deadline.'], suaSao: ['Bổ sung hoạt động + xử lý Lead trễ ngay.'], kpi: 'KPI **Đúng hạn** và badge SLA.' },
      tomTat: 'Lead Hot = 5 phút; mọi tương tác ghi timeline; Deadline = ưu tiên hàng ngày.',
    },
    quiz: {
      tt: [['SLA là gì?', ['Hạn xử lý cam kết', 'Loại cửa', 'Mã Lead', 'Thuế'], [0], 'Cam kết thời gian.'], ['Trễ SLA — rủi ro?', ['Không sao', 'Khách lạnh, mất cơ hội', 'Tự thưởng', 'Tự xóa Lead'], [1], 'Thời gian = cơ hội.']],
      td: [['Quy tắc 5 phút với Lead Hot?', ['Gọi trong 5 phút', 'Nghỉ 5 phút', 'Xóa sau 5 phút', 'Không áp dụng'], [0], 'Phản hồi nhanh.'], ['Hoạt động ghi nhận?', ['Chỉ gọi', 'Gọi, gặp, email, đổi giai đoạn…', 'Chỉ KPI', 'Chỉ chat nội bộ'], [1], 'Timeline đầy đủ.']],
      nl: [['Badge đỏ trên thẻ?', ['Quá hạn SLA', 'Đã thắng', 'Đã xóa', 'VIP'], [0], 'Cần xử lý gấp.'], ['Tab Deadline dùng để?', ['Nhóm theo hạn xử lý', 'Xóa Lead', 'Tạo HĐ', 'Chat'], [0], 'Ưu tiên trễ SLA.']],
      vh: [['Lead Hot nhận lúc 9h00 — gọi trước?', ['9h30', '9h05', '10h00', 'Ngày mai'], [1], 'Trong 5 phút.'], ['Sau cuộc gọi nên?', ['Chỉ kéo thẻ', 'Ghi hoạt động + kéo thẻ nếu đủ', 'Xóa Lead', 'Đổi SĐT'], [1], 'Lịch sử phải có nội dung.'], ['Sáng vào ca nên mở?', ['Deadline trước', 'Chỉ chat', 'Chỉ lương', 'Blocklist'], [0], 'Ưu tiên Lead trễ.']],
      bc: [['Quên ghi hoạt động — sửa?', ['Bỏ qua', 'Bổ sung hoạt động với thời gian thật', 'Xóa Lead', 'Đổi khách'], [1], 'Timeline phải đầy đủ.'], ['Lead trễ SLA — ưu tiên?', ['Cuối tuần', 'Xử lý ngay trong ca', 'Tháng sau', 'Không cần'], [1], 'Badge đỏ = gấp.'], ['Đổi giai đoạn có ghi timeline?', ['Không', 'Có — là một loại hoạt động', 'Chỉ admin', 'Chỉ Deal'], [1], 'Hệ thống ghi nhận.']],
    },
  },
  {
    num: 8,
    title: 'Bài 8: KPI Lead — Đọc bảng điểm và sửa điểm thấp',
    summary: 'Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm.',
    pillar: {
      hook: 'Cuối tháng mở **Bảng điểm** — KPI Đầy đủ thông tin 72%, dưới ngưỡng 80% → **quy tắc chặn điểm**.',
      tuTuong: { vaiTro: 'KPI không phải để "phạt" — mà để bạn **biết chỗ cần sửa** và công bằng với đồng nghiệp.', ynghia: ['Cùng quy tắc trên CRM = công bằng.', 'Ledger = sổ ghi tự động cộng/trừ điểm khi làm đúng/sai.'] },
      tuDuy: {
        phanBiet: ['**KPI Đầy đủ thông tin**', '**KPI Đúng hạn**', '**Chuyển Deal**', '**Ledger** _(sổ ghi sự kiện điểm)_'],
        mentalModel: 'Bảng điểm như **bảng điểm học** — biết môn nào yếu để ôn.',
      },
      nguonLuc: { manHinh: '**CRM → Bảng điểm** (Scorecard tháng)', congCu: ['Bảng điểm KPI', 'Ledger sự kiện', 'Báo cáo theo tháng'], duLieu: 'Tỷ lệ %, điểm cộng/trừ, ngưỡng chặn.' },
      vanHanh: { steps: ['Cuối tuần: mở **Bảng điểm** → xem 4 chỉ số chính.', 'Chỉ số đỏ → lập **kế hoạch tuần sau** (vd: bổ sung 6 trường cho 5 Lead).', 'Không tick giả, không bỏ qua minh chứng.', 'Tháng mới: đặt mục tiêu cụ thể từng chỉ số.'], mentor: 'Sửa KPI bằng **hành vi hàng ngày** — không phải làm đùng cuối tháng.' },
      baoCaoSua: { tuKiem: ['Tôi biết 4 chỉ số KPI Lead?', 'Tôi biết ngưỡng chặn điểm?', 'Tôi có kế hoạch sửa chỉ số thấp?'], loiHay: ['Chỉ nhìn tổng điểm, không xem từng chỉ số.', 'Lặp lại sai sót tháng sau.'], suaSao: ['Kế hoạch cụ thể: tuần này bổ sung 6 trường cho X Lead.'], kpi: 'Đầy đủ thông tin ≥80%; Đúng hạn; Chuyển Deal; Tiếp xúc thành công.' },
      tomTat: 'Bảng điểm = gương soi hành vi; sửa từng chỉ số bằng thao tác CRM đúng ngày.',
    },
    quiz: {
      tt: [['KPI công bằng khi?', ['Mọi người cùng quy tắc trên CRM', 'Sổ tay riêng', 'Ẩn số liệu', 'Không ghi'], [0], 'Cùng hệ thống.'], ['Mục đích KPI Lead?', ['Phạt nhân viên', 'Đo hành vi, giúp sửa chỗ yếu', 'Trang trí', 'Tính thuế'], [1], 'Cải thiện liên tục.']],
      td: [['KPI Lead gồm?', ['Chỉ doanh số', 'Đầy đủ thông tin, Đúng hạn, chuyển Deal…', 'Chỉ cuộc gọi', 'Chỉ Facebook'], [1], 'Nhiều chỉ số hành vi.'], ['Ledger KPI là?', ['Sổ ghi sự kiện cộng/trừ điểm', 'Loại cửa', 'Mã HĐ', 'Tên KH'], [0], 'Tự động khi làm đúng/sai.'], ['Quy tắc chặn điểm khi KPI Đầy đủ thông tin thấp?', ['Không', 'Có — điểm tháng bị giới hạn', 'Chỉ admin', 'Chỉ năm'], [1], 'Khuyến khích nhập liệu.']],
      nl: [['Xem điểm KPI ở?', ['CRM → Bảng điểm', 'Chỉ sếp', 'Không có', 'Zalo'], [0], 'Scorecard tháng.'], ['KPI "Đúng hạn" đo?', ['% nhiệm vụ/Lead xử lý đúng SLA', 'Số email', 'Chiều cao tủ', 'Màu sơn'], [0], 'Cam kết thời gian.']],
      vh: [['Cuối tuần nên?', ['Mở Bảng điểm, xem chỉ số', 'Bỏ qua', 'Xóa Lead', 'Tắt CRM'], [0], 'Tự kiểm định kỳ.'], ['Chỉ số đỏ — làm gì?', ['Bỏ qua', 'Lập kế hoạch sửa tuần sau', 'Tick giả', 'Đổi khách'], [1], 'Hành động cụ thể.'], ['Cải thiện KPI tháng sau?', ['Lặp sai sót', 'Kế hoạch cụ thể từng chỉ số', 'Không làm gì', 'Tắt CRM'], [1], 'Đo được mới sửa được.']],
      bc: [['KPI 72% Đầy đủ thông tin (ngưỡng 80%) — sửa?', ['Bỏ qua', 'Bổ sung 6 trường cho Lead thiếu', 'Xóa Lead', 'Báo cáo giả'], [1], 'Hành động trực tiếp.'], ['Lead chuyển Deal ảnh hưởng KPI?', ['Không', 'Có — chỉ số chuyển đổi', 'Chỉ xưởng', 'Chỉ vận chuyển'], [1], 'Đo năng suất sales.'], ['Tick giả cuối tháng — hậu quả?', ['Thưởng', 'Ledger trừ điểm, mất uy tín', 'Tự thăng chức', 'Không sao'], [1], 'Hệ thống ghi nhận.']],
    },
    essay: 'Xem Bảng điểm KPI tháng của bạn (hoặc giả định). Chỉ số nào thấp nhất? Kế hoạch 3 bước cụ thể để cải thiện tháng tới (tối thiểu 200 từ).',
    quizStrict: true,
  },
  {
    num: 9,
    title: 'Bài 9: Chi tiết Lead — Bốn tab và nút quan trọng',
    summary: 'Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút Chuyển Deal, Sửa, Mất/Mở lại.',
    pillar: {
      hook: 'Mở chi tiết Lead — bốn tab như **bốn ngăn tủ**: mỗi thứ đúng ngăn, tìm nhanh, handover dễ.',
      tuTuong: { vaiTro: 'Chi tiết Lead là **trung tâm điều khiển** mọi việc với một khách.', ynghia: ['Lộn tab = đồng nghiệp không tìm được file.', 'Nút header = hành động lớn (Chuyển Deal, Mất Lead).'] },
      tuDuy: {
        bang: '| Tab | Dùng để |\n|---|---|\n| Tổng quan | 6 thông tin bắt buộc, phụ trách |\n| Nhiệm vụ | Việc cần làm có hạn |\n| Hoạt động | Timeline gọi/gặp |\n| Tài liệu | PDF, ảnh, HĐ |',
      },
      nguonLuc: { manHinh: 'Click thẻ Lead → **Chi tiết Lead**', congCu: ['4 tab', 'Nút header: Chuyển Deal, Sửa, Mất/Mở lại'], duLieu: 'Toàn bộ hồ sơ một khách.' },
      vanHanh: { steps: ['**Tổng quan**: kiểm tra 6 trường + phụ trách.', '**Nhiệm vụ**: xem việc đang mở.', '**Hoạt động**: đọc lịch sử trước khi gọi.', '**Tài liệu**: upload/lấy báo giá, ảnh đo.', '**Chuyển Deal** (header) khi đủ điều kiện (Bài 10).'], mentor: 'Trước mỗi cuộc gọi: tab Hoạt động → 30 giây nắm lịch sử.' },
      baoCaoSua: { tuKiem: ['Biết 4 tab?', 'Biết nút Chuyển Deal ở header?', 'File đúng tab Tài liệu?'], loiHay: ['Ghi chú gọi vào Tài liệu.', 'Không đọc Hoạt động trước khi gọi.'], suaSao: ['Chuyển ghi chú sang Hoạt động; upload file đúng tab.'], kpi: 'Hồ sơ đầy đủ trên đúng tab → KPI Đầy đủ thông tin.' },
      tomTat: '4 tab — đúng chỗ đúng việc; header = hành động lớn; đọc Hoạt động trước khi gọi.',
    },
    quiz: {
      tt: [['Chi tiết Lead là gì?', ['Trung tâm điều khiển mọi việc với một khách', 'Chỉ xem KPI', 'Chỉ chat', 'Chỉ in PDF'], [0], 'Hub thông tin.']],
      td: [['Tab Tổng quan hiển thị?', ['6 thông tin bắt buộc + phụ trách', 'Chỉ logo', 'Chỉ KPI năm', 'Chỉ chat'], [0], 'Kiểm tra nhanh hồ sơ.'], ['Hoạt động khác ghi chú?', ['Giống hệt', 'Có loại + thời gian timeline', 'Chỉ admin', 'Không dùng'], [1], 'Timeline truy vết.']],
      nl: [['Chuyển Deal ở đâu?', ['Footer', 'Nút header chi tiết Lead', 'Cài đặt', 'Báo cáo'], [1], 'Khi đủ điều kiện.'], ['Tab Tài liệu lưu?', ['PDF, ảnh, HĐ', 'Chỉ chat', 'Chỉ KPI', 'Chỉ lương'], [0], 'Hồ sơ file.']],
      vh: [['Trước gọi khách nên mở tab?', ['Hoạt động', 'Blocklist', 'Lương', 'Chat công ty'], [0], 'Nắm lịch sử.'], ['Ghi chú cuộc gọi nên?', ['Tài liệu', 'Hoạt động / Nhiệm vụ', 'Xóa', 'Email riêng'], [1], 'Phân loại đúng.'], ['HĐ PDF ký lưu?', ['Chat', 'Tài liệu', 'Không lưu', 'Email riêng'], [1], 'Tập trung hồ sơ.']],
      bc: [['Ghi chú gọi vào Tài liệu — sửa?', ['Giữ nguyên', 'Chuyển sang Hoạt động', 'Xóa Lead', 'Đổi pass'], [1], 'Đúng tab.'], ['Không đọc lịch sử trước gọi — rủi ro?', ['Khách hài lòng hơn', 'Hỏi lại thông tin đã trao đổi', 'Tự thưởng', 'KPI tăng'], [1], 'Mất chuyên nghiệp.']],
    },
  },
  {
    num: 10,
    title: 'Bài 10: Chuyển Lead thành Deal — Cột mốc quan trọng',
    summary: 'Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển.',
    pillar: {
      hook: 'Chị Lan đồng ý mua 68 triệu — bấm **Chuyển Deal**. Đây là cột mốc: Lead → Deal, **một chiều**, kiểm tra kỹ trước khi xác nhận.',
      tuTuong: { vaiTro: 'Chuyển Deal = bạn xác nhận khách **đã chốt mua** — trách nhiệm chuyển sang giai đoạn HĐ và thu tiền.', ynghia: ['Chuyển sớm = Deal ảo, KPI sai.', 'Chuyển muộn = chậm doanh thu.'] },
      tuDuy: { phanBiet: ['Chuyển Deal khi: KH **đồng ý mua** + thống nhất **SP, giá, phạm vi**', '**Không hoàn tác** — sai phải xử lý qua Deal (Thua) hoặc admin'], mentalModel: 'Chuyển Deal như **cửa một chiều** — qua rồi không lùi, chỉ tiến (Thắng) hoặc nhánh (Thua).' },
      nguonLuc: { manHinh: 'Chi tiết Lead → nút **Chuyển Deal** (header)', congCu: ['Popup chọn pipeline Deal', 'Checklist 6 trường + báo giá'], duLieu: 'Cam kết mua, file báo giá, đủ 6 trường.' },
      vanHanh: { steps: ['Xác nhận KH đồng ý mua (có ghi nhận: ghi chú/Zalo).', 'Kiểm tra **đủ 6 trường**.', 'Có **báo giá / file** trên Tài liệu.', 'Bấm **Chuyển Deal** → chọn pipeline → **Xác nhận**.', 'Sang **Bảng Deal** — tiếp tục chăm sóc giai đoạn HĐ.'], mentor: 'Nghi ngờ 1% — **chưa chuyển**. Hỏi lại khách hoặc sếp trước khi bấm Xác nhận.' },
      baoCaoSua: { tuKiem: ['KH đồng ý có ghi nhận?', 'Đủ 6 trường?', 'Có báo giá?', 'Đúng pipeline Deal?'], loiHay: ['Chuyển khi chưa đồng ý.', 'Thiếu 6 trường vẫn chuyển.'], suaSao: ['Chưa chuyển — bổ sung hồ sơ trước.'], kpi: 'Chỉ số **Chuyển Deal** trên Bảng điểm.' },
      tomTat: 'Đủ điều kiện → Chuyển Deal → một chiều → tiếp tục trên Bảng Deal.',
    },
    quiz: {
      tt: [['Chuyển Deal khi?', ['Mới tạo Lead', 'KH đồng ý mua + thống nhất SP/giá', 'Chưa gọi', 'Cuối năm'], [1], 'Đủ điều kiện nghiệp vụ.'], ['Chuyển sớm — hậu quả?', ['Deal ảo, KPI sai', 'Tự thưởng', 'Khách vui', 'Không sao'], [0], 'Dữ liệu phải thật.']],
      td: [['Sau chuyển Deal?', ['Mất lịch sử', 'Giữ lịch sử, sang pipeline Deal', 'Xóa Lead', 'Tạo SĐT mới'], [1], 'Chuyển một chiều, giữ dữ liệu.'], ['Chuyển Deal hoàn tác?', ['Có', 'Không — kiểm tra kỹ trước Xác nhận', 'Tự động', 'Chỉ admin mọi lúc'], [1], 'Một chiều.']],
      nl: [['Nút Chuyển Deal ở?', ['Header chi tiết Lead', 'Footer', 'Cài đặt', 'Chat'], [0], 'Header.'], ['Trước chuyển cần file?', ['Báo giá trên Tài liệu', 'Chỉ ảnh cá nhân', 'Không cần', 'Chỉ chat'], [0], 'Minh chứng chốt.']],
      vh: [['Bước 1 trước chuyển?', ['Xác nhận KH đồng ý mua', 'Xóa Lead', 'In lương', 'Tạo NV'], [0], 'Cam kết rõ ràng.'], ['Sau Xác nhận làm gì?', ['Mở Bảng Deal tiếp tục', 'Xóa CRM', 'Nghỉ phép', 'Blocklist'], [0], 'Pipeline Deal.'], ['Nghi ngờ chưa chốt — làm gì?', ['Vẫn chuyển', 'Chưa chuyển, hỏi lại KH/sếp', 'Xóa Lead', 'Tick giả'], [1], 'Cẩn trọng.']],
      bc: [['Thiếu 6 trường vẫn chuyển — sửa?', ['Bổ sung trước khi chuyển', 'Bỏ qua', 'Xóa Deal', 'Báo cáo giả'], [0], 'Hồ sơ đầy đủ.'], ['Checklist trước chuyển gồm?', ['Đồng ý mua + 6 trường + báo giá + pipeline', 'Chỉ SĐT', 'Chỉ ảnh', 'Không cần'], [0], 'Checklist chuẩn.']],
    },
    checklist: ['KH đồng ý mua có ghi nhận', 'Đủ 6 thông tin', 'Đã báo giá / file', 'Đã chọn đúng pipeline Deal', 'Đã kiểm tra không trùng Deal'],
  },
  {
    num: 11,
    title: 'Bài 11: Tình huống đặc biệt — Trùng, mất, mở lại, blocklist',
    summary: 'Xử lý Lead trùng SĐT, đánh dấu Mất, Mở lại, blocklist — không xóa lịch sử.',
    pillar: {
      hook: 'Khách gọi lại sau 3 tháng "mất" — **Mở lại** Lead, không tạo mới. Lịch sử cũ vẫn có giá trị.',
      tuTuong: { vaiTro: 'Xử lý đặc biệt đúng = bảo vệ **dữ liệu công ty** và **công bằng KPI**.', ynghia: ['Xóa Lead = mất lịch sử phân tích.', 'Blocklist = tôn trọng khách không muốn liên hệ.'] },
      tuDuy: {
        phanBiet: ['**Trùng SĐT** → mở Lead cũ', '**Mất Lead** → đánh dấu + lý do (không xóa)', '**Mở lại** → KH quay lại', '**Blocklist** → khách từ chối liên hệ — báo admin'],
      },
      nguonLuc: { manHinh: 'Chi tiết Lead → nút **Mất / Mở lại**', congCu: ['Quét trùng', 'Đánh dấu Mất + lý do', 'Blocklist (admin)'], duLieu: 'Lý do mất, thời gian mở lại.' },
      vanHanh: { steps: ['Trùng SĐT → **Quét trùng** → mở Lead cũ.', 'KH không mua → **Mất** + chọn lý do (giá, đối thủ…).', 'KH quay lại → **Mở lại** Lead cũ.', 'KH yêu cầu không gọi → báo admin **blocklist**.'], mentor: 'Không bao giờ tạo Lead mới khi SĐT đã có — dù khách "quên" mình từng hỏi.' },
      baoCaoSua: { tuKiem: ['Trùng → mở cũ?', 'Mất có lý do?', 'Blocklist đã báo admin?'], loiHay: ['Xóa Lead thay vì Mất.', 'Tạo mới khi trùng SĐT.'], suaSao: ['Mất + lý do; gộp trên Lead cũ.'], kpi: 'Lý do Mất giúp công ty cải thiện sản phẩm/giá.' },
      tomTat: 'Trùng → gộp; Mất → lý do; Mở lại → tiếp tục; Blocklist → báo admin — không xóa lịch sử.',
    },
    quiz: {
      tt: [['Vì sao không xóa Lead?', ['Mất lịch sử phân tích', 'Tự thưởng', 'Khách vui', 'Nhanh hơn'], [0], 'Dữ liệu = tài sản.'], ['Blocklist là gì?', ['Khách từ chối liên hệ — báo admin', 'Xóa Lead', 'Chuyển Deal', 'Tạo NV'], [0], 'Tôn trọng khách.']],
      td: [['Lead trùng SĐT?', ['Tạo mới', 'Gộp chăm sóc trên Lead cũ', 'Ẩn', 'Block'], [1], 'Một khách một luồng.'], ['Lead "Mất"?', ['Xóa', 'Đánh dấu mất + lý do', 'Chuyển Deal', 'Tạo NV'], [1], 'Giữ lịch sử.']],
      nl: [['Quét trùng dùng khi?', ['Trước tạo Lead mới', 'Sau khi SX', 'Cuối năm', 'Không dùng'], [0], 'Tránh trùng.'], ['Mở lại Lead khi?', ['KH quay lại sau thời gian', 'Mới vào công ty', 'Trời mưa', 'Cuối tuần'], [0], 'Tiếp tục luồng cũ.']],
      vh: [['KH không mua — làm gì?', ['Xóa Lead', 'Mất + lý do', 'Tạo Lead mới', 'Block ngay'], [1], 'Ghi nhận lý do.'], ['KH cấm gọi — làm gì?', ['Vẫn gọi', 'Báo admin blocklist', 'Tạo Lead mới', 'Xóa SĐT'], [1], 'Tuân thủ.'], ['KH gọi lại sau 3 tháng mất?', ['Tạo mới', 'Mở lại Lead cũ', 'Xóa cũ', 'Bỏ qua'], [1], 'Giữ lịch sử.']],
      bc: [['Tạo mới khi trùng SĐT — sửa?', ['Gộp trên Lead cũ', 'Giữ 2 Lead', 'Xóa cũ', 'Báo cáo giả'], [0], 'Một luồng.'], ['Mất không ghi lý do — vấn đề?', ['Marketing không phân tích được', 'Tốt', 'Tự thưởng', 'Khách vui'], [0], 'Lý do = bài học.']],
    },
  },
  {
    num: 12,
    title: 'Bài 12: Ôn tập hành trình Lead — Từ tiếp nhận đến chuyển Deal',
    summary: 'Tổng hợp 5 trụ trên một hành trình khách thật — checklist end-to-end.',
    pillar: {
      hook: 'Chị Mai — hỏi tủ bếp qua fanpage → tạo Lead → gọi → báo giá → đồng ý → chuyển Deal. **Một hành trình, năm trụ.**',
      tuTuong: { vaiTro: 'Bạn nắm trọn **chuỗi giá trị**: không bỏ sót bước, không nhảy cóc.', ynghia: ['Mỗi bước phục vụ bước sau.', 'CRM ghi lại toàn bộ hành trình cho công ty và cho bạn.'] },
      tuDuy: {
        mentalModel: '**Tư tưởng** (vai trò) → **Tư duy** (Lead vs Deal) → **Nguồn lực** (Bảng Lead, tab) → **Vận hành** (tạo, gọi, nhiệm vụ, minh chứng) → **Báo cáo** (KPI, sửa lỗi) → **Chuyển Deal**.',
      },
      nguonLuc: { manHinh: 'Toàn bộ CRM Lead: Bảng Lead, Chi tiết, Bảng điểm', congCu: ['Kanban', '4 tab', 'Nhiệm vụ', 'Bảng điểm'], duLieu: 'Hành trình đầy đủ trên hệ thống.' },
      vanHanh: {
        steps: [
          '**Tiếp nhận**: Quét trùng → tạo Lead → 6 trường.',
          '**Chăm sóc**: Nhiệm vụ + hoạt động + SLA.',
          '**Minh chứng**: Ghi chú + file đúng tab.',
          '**Theo dõi**: Kanban + Deadline + KPI.',
          '**Chuyển Deal**: Checklist → Xác nhận.',
        ],
        mentor: 'In checklist Bài 10 — dán cạnh màn hình đến khi thành thói quen.',
      },
      baoCaoSua: {
        tuKiem: ['Tôi làm được end-to-end không cần hỏi?', 'Tôi biết sửa lỗi thường gặp?', 'Tôi đọc được Bảng điểm?'],
        loiHay: ['Nhảy thẳng chuyển Deal.', 'Bỏ qua minh chứng và KPI.'],
        kpi: 'Toàn bộ chỉ số Lead trên Bảng điểm.',
      },
      tomTat: 'Hành trình Lead = 5 trụ nối liền; thiếu một trụ = hồ sơ và KPI lỗ hổng.',
    },
    quiz: {
      tt: [['Hành trình Lead phục vụ?', ['Chỉ KPI', 'Khách và công ty — không mất cơ hội', 'Chỉ admin', 'Chỉ xưởng'], [1], 'Chuỗi giá trị.'], ['Thiếu một trụ — hậu quả?', ['Hồ sơ và KPI lỗ hổng', 'Tự thưởng', 'Không sao', 'Khách vui'], [0], '5 trụ liên kết.']],
      td: [['Thứ tự đúng?', ['Chuyển Deal → Tạo Lead', 'Tạo Lead → Chăm sóc → Chuyển Deal', 'Chỉ KPI', 'Chỉ chat'], [1], 'Quy trình chuẩn.'], ['Lead vs Deal cuối hành trình?', ['Giống nhau', 'Lead chưa chốt → Deal đã chốt', 'Deal trước Lead', 'Không liên quan'], [1], 'Cột mốc chuyển.']],
      nl: [['Công cụ end-to-end?', ['Bảng Lead + Chi tiết + Bảng điểm', 'Chỉ Excel', 'Chỉ Zalo', 'Chỉ sổ tay'], [0], 'Trên CRM.']],
      vh: [['Bước 1 hành trình?', ['Quét trùng + tạo Lead', 'Chuyển Deal', 'In lương', 'Blocklist'], [0], 'Tiếp nhận.'], ['Trước chuyển Deal?', ['Checklist Bài 10', 'Chỉ SĐT', 'Không cần', 'Xóa Lead'], [0], 'Đủ điều kiện.'], ['Minh chứng ở bước nào?', ['Chăm sóc — ghi chú + file', 'Chỉ cuối năm', 'Không cần', 'Chỉ admin'], [0], 'Trong vận hành.']],
      bc: [['KPI thấp cuối hành trình — sửa?', ['Bảng điểm + kế hoạch hành vi', 'Bỏ qua', 'Tick giả', 'Tắt CRM'], [0], 'Báo cáo & sửa.'], ['Nhảy cóc chuyển Deal — sửa?', ['Chưa chuyển, bổ sung hồ sơ', 'Giữ Deal ảo', 'Xóa Lead', 'Báo cáo giả'], [0], 'Sửa trước cột mốc.']],
    },
  },
];

/** Câu hỏi thi tổng kết — 20 câu, phủ 5 trụ */
const FINAL_EXAM = [
  ['Lead là gì?', ['Khách đã ký HĐ', 'Khách tiềm năng chưa cam kết mua', 'Nhân viên mới', 'File PDF'], [1], 'Lead chưa chốt.'],
  ['Deal khác Lead ở?', ['Đã chốt mua', 'Chưa liên hệ', 'Là nhân viên', 'Là file'], [0], 'Deal sau khi thống nhất mua.'],
  ['Vì sao dùng CRM?', ['Lưu lịch sử, KPI công bằng', 'Chỉ giám sát', 'Tốn thời gian', 'Không lý do'], [0], 'Tư tưởng.'],
  ['Một Lead — bao nhiêu phụ trách chính?', ['Một', 'Không giới hạn', 'Hai bắt buộc', 'Không có'], [0], 'Tư duy.'],
  ['Quét trùng trước?', ['Lưu Lead mới', 'Tạo Deal', 'In PDF', 'Blocklist'], [0], 'Vận hành.'],
  ['6 trường bắt buộc — KPI nào?', ['Đầy đủ thông tin', 'Màu tủ', 'Giờ nghỉ', 'Loại xe'], [0], 'Báo cáo.'],
  ['SLA là?', ['Hạn xử lý cam kết', 'Mã SP', 'Tên xưởng', 'VAT'], [0], 'Tư duy.'],
  ['Lead Hot — gọi trong?', ['5 phút', '1 tuần', '1 tháng', 'Không cần'], [0], 'Vận hành.'],
  ['Chuyển Deal khi?', ['KH đồng ý mua', 'Mới tạo Lead', 'Chưa gọi', 'Không bao giờ'], [0], 'Vận hành.'],
  ['Kéo Kanban khi?', ['Đã hoàn thành việc giai đoạn', 'Rảnh', 'Cuối năm', 'Admin bảo'], [0], 'Vận hành.'],
  ['Minh chứng khi hoàn thành nhiệm vụ?', ['Ghi chú + file nếu yêu cầu', 'Chỉ tick', 'Xóa Lead', 'Đổi pass'], [0], 'Vận hành.'],
  ['Xem KPI ở?', ['CRM → Bảng điểm', 'Chỉ sếp', 'Zalo', 'Không có'], [0], 'Nguồn lực.'],
  ['Trùng SĐT?', ['Mở Lead cũ', 'Tạo mới', 'Xóa', 'Block'], [0], 'Báo cáo & sửa.'],
  ['Lead Mất?', ['Đánh dấu + lý do', 'Xóa', 'Chuyển Deal', 'Tạo NV'], [0], 'Báo cáo & sửa.'],
  ['HĐ PDF lưu tab?', ['Tài liệu', 'Chat', 'Blocklist', 'Lương'], [0], 'Nguồn lực.'],
  ['Bảng Lead ở menu?', ['CRM → Bảng Lead', 'Công việc', 'Kiến thức', 'Xưởng'], [0], 'Nguồn lực.'],
  ['Quy tắc chặn điểm khi?', ['KPI Đầy đủ thông tin < ngưỡng', 'Trời mưa', 'Mới vào', 'Cuối tuần'], [0], 'Báo cáo.'],
  ['Tick hoàn thành chưa gọi?', ['Vi phạm KPI', 'Được', 'Bắt buộc', 'Tốt'], [0], 'Báo cáo & sửa.'],
  ['5 kênh tiếp nhận?', ['5', '2', '10', '1'], [0], 'Tư duy.'],
  ['Sau chuyển Deal?', ['Giữ lịch sử, sang pipeline Deal', 'Mất lịch sử', 'Xóa Lead', 'Tạo SĐT mới'], [0], 'Tư duy.'],
];

module.exports = { LESSON_SPECS, FINAL_EXAM, q };
