/**
 * Nhập khoá học «Hướng dẫn sử dụng module sản xuất» vào module Kiến thức.
 *
 * Chạy:  node backend/scripts/import-khoa-hoc-module-san-xuat.js
 *        node backend/scripts/import-khoa-hoc-module-san-xuat.js --publish
 *
 * Chạy lại được nhiều lần: nhận diện bài theo `slug` nhúng trong tags, có thì cập nhật,
 * chưa có thì tạo. Không xoá trắng danh mục như script cũ — xoá trắng là mất tiến độ
 * học và điểm bài tập của mọi người đã làm.
 *
 * Bài học lấy nguyên văn từ bản thảo đã duyệt ở docs/khoa-hoc/, phần câu hỏi khai ngay
 * trong file này vì nó là dữ liệu có cấu trúc, không phải văn xuôi.
 *
 * Mặc định tạo ở trạng thái CHƯA XUẤT BẢN — chỉ admin xem được để soát. Thêm cờ
 * `--publish` khi muốn mở cho nhân viên.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const PUBLISH = process.argv.includes('--publish');

const CATEGORY = {
  name: 'Hướng dẫn sử dụng module sản xuất',
  slug: 'huong-dan-module-san-xuat',
  description: 'Các trang quản lý nhiệm vụ / công việc, trang quản lý phát sinh và cách tạo phát sinh — kèm bài kiểm tra và bài tình huống.',
  icon: '🏭',
};

const DRAFT_MD = path.join(__dirname, '../../docs/khoa-hoc/module-san-xuat-DRAFT.md');

/** Tách bản thảo thành thân bài 1 và bài 2. */
function readLessonBodies() {
  const raw = fs.readFileSync(DRAFT_MD, 'utf8');
  const parts = raw.split(/\n# BÀI /);
  const body = (i) => {
    const chunk = parts[i];
    if (!chunk) throw new Error(`Không tìm thấy BÀI ${i} trong ${DRAFT_MD}`);
    // Bỏ dòng tiêu đề + khối gạch đầu dòng metadata, giữ từ mục "## 1." trở đi.
    const at = chunk.indexOf('## 1.');
    if (at < 0) throw new Error(`Bài ${i} không có mục "## 1."`);
    return chunk.slice(at).replace(/\n---\s*$/, '').trimEnd();
  };
  return { bai1: body(1), bai2: body(2) };
}

const q = (id, question, options, correct, explanation, type = 'single') => ({
  id, question, type, options, correct, explanation,
});

/** Bài 3 — 20 câu, mỗi câu là một tình huống có thật ở xưởng. */
const QUIZ_20 = [
  q('t1', '7h30 sáng, bạn vừa mở máy. Việc ĐẦU TIÊN nên làm là gì?',
    ['Mở Dashboard xưởng xem thẻ nằm cột nào',
      'Mở /sx/project-tasks, chuyển chế độ Hạn, đọc cột Quá hạn trước',
      'Mở Giao việc Sản xuất xem ai đang rảnh',
      'Gọi tổ trưởng hỏi hôm nay làm gì'],
    [1], 'Quá hạn là nợ của hôm qua — để thêm một ngày nữa là trễ hẳn. Dashboard trả lời câu khác: đơn đang ở công đoạn nào.'),
  q('t2', 'Khách gọi hỏi «đơn tôi tới đâu rồi?». Mở trang nào trả lời nhanh nhất?',
    ['/sx/project-tasks — Quản lý nhiệm vụ',
      '/sx/dashboard — tìm thẻ, thẻ nằm cột nào là đơn đang ở công đoạn đó',
      '/sx/assignments — Giao việc Sản xuất',
      '/management/shared-workspace-report — Báo cáo phát sinh'],
    [1], 'Dashboard là bảng thẻ dự án: mỗi thẻ một đơn, mỗi cột một công đoạn. Nhìn phát biết ngay.'),
  q('t3', 'Thợ báo «em làm xong rồi» nhưng nhiệm vụ trên hệ thống vẫn «Đang làm». Vì sao?',
    ['Hệ thống cập nhật chậm, chờ vài phút',
      'Còn việc con bên trong chưa tích hết',
      'Phải bấm nút Hoàn thành ở đầu trang',
      'Quản lý chưa duyệt'],
    [1], 'Tiến độ = việc con đã tích / tổng việc con. Mở nhiệm vụ kéo xuống soát — gần như lần nào cũng còn sót một cái.'),
  q('t4', 'Xưởng tan làm 17h30. Một việc hạn hôm nay, tới 17h45 vẫn chưa xong. Lúc này nó nằm rổ nào?',
    ['Vẫn ở Hôm nay, tới 23h59 mới tính trễ',
      'Quá hạn — hạn tính tới giờ tan làm của công ty',
      'Ngày mai',
      'Chưa có hạn'],
    [1], 'Hạn trong ngày tính tới giờ kết thúc làm việc của công ty, không phải nửa đêm.'),
  q('t5', 'Bạn giao anh Toại việc cắt CNC bằng nút tạo ở /sx/assignments. Anh Toại tìm trong Quản lý nhiệm vụ không thấy. Vì sao?',
    ['Anh Toại không có quyền xem',
      'Cái vừa tạo là Giao việc — gắn vào người, xem ở /sx/assignments; Quản lý nhiệm vụ hiển thị nhiệm vụ dự án',
      'Phải chờ hệ thống đồng bộ qua đêm',
      'Quên bấm Lưu'],
    [1], 'Nhiệm vụ dự án gắn vào dự án + công đoạn. Giao việc gắn vào người. Hai trang khác nhau.'),
  q('t6', 'Rổ «Chưa có hạn» đang có 12 việc. Xử lý thế nào?',
    ['Bỏ qua, không có hạn nghĩa là không gấp',
      'Soát từng việc: còn làm thì gán hạn ngay, không làm nữa thì huỷ',
      'Xoá hết cho gọn bảng',
      'Chờ quản lý phân công'],
    [1], 'Việc không hạn thì không bao giờ báo trễ — nó nằm im tới lúc khách gọi hỏi. Đây là rổ nguy hiểm nhất.'),
  q('t7', 'Bạn kéo thẻ từ cột Gia công sang Hoàn thiện nhưng hệ thống chặn lại. Làm gì?',
    ['Thử kéo lại hoặc đợi lát nữa',
      'Đọc danh sách hệ thống liệt kê, hoàn thành hoặc huỷ các nhiệm vụ gắn cờ chặn chuyển giai đoạn',
      'Nhờ admin tắt pipeline',
      'Tạo dự án mới ở cột Hoàn thiện'],
    [1], 'Cột nguồn còn nhiệm vụ gắn cờ «chặn chuyển giai đoạn» chưa xong. Hệ thống liệt kê rõ việc nào còn thiếu.'),
  q('t8', 'Bạn muốn giục anh Toại làm cho xong một việc. Cách đúng trên hệ thống?',
    ['Gọi điện trực tiếp',
      'Bấm nút Nhắc trên thẻ nhiệm vụ — người kia nhận thông báo',
      'Đổi ưu tiên lên Khẩn',
      'Dời hạn sớm lại'],
    [1], 'Nút Nhắc đổi thành «Đã nhắc» sau khi gửi. Nút bị mờ nghĩa là nhiệm vụ chưa gắn danh mục — bổ sung rồi nhắc được.'),
  q('t9', 'Dải KPI đầu trang báo «Tổng 18» nhưng bạn đếm tay ra 47 việc. Chuyện gì xảy ra?',
    ['Hệ thống đếm sai, báo kỹ thuật',
      'Đang có bộ lọc bật — số KPI chạy theo bộ lọc chứ không phải toàn hệ thống',
      'Có 29 việc đã bị xoá',
      'Phải bấm Làm mới'],
    [1], 'Xoá hết chip lọc dưới thanh công cụ rồi đếm lại. Thói quen tốt: xem xong thì gỡ chip.'),
  q('t10', 'Một việc hạn hôm nay chắc chắn không kịp. Cách xử lý đúng?',
    ['Để nguyên, mai làm tiếp',
      'Dời hạn VÀ ghi lý do vào bình luận',
      'Huỷ rồi tạo việc mới',
      'Đổi trạng thái sang Hoàn thành cho sạch bảng'],
    [1], 'Dời hạn mà không ghi lý do thì tháng sau họp không ai truy được vì sao trễ.'),

  q('t11', '14h30 chị Hoa gọi đòi đổi 3 cánh sang kính cường lực, chịu trả thêm tiền. Mở trang nào để ghi?',
    ['/sx/project-tasks — thêm một nhiệm vụ mới',
      '/sx/phat-sinh — Quản lý phát sinh',
      '/sx/dashboard — kéo thẻ sang cột khác',
      'Ghi vào tab Ghi chú của dự án'],
    [1], 'Việc ngoài kế hoạch, không thuộc bộ mẫu nào. Nó là phát sinh.'),
  q('t12', 'Bạn muốn việc của chị Hoa nằm ở tab «Có phí». Thao tác nào quyết định điều đó?',
    ['Bấm sang tab Có phí trước khi tạo',
      'Chọn đúng LOẠI phát sinh — thuộc tính có phí nằm sẵn trong loại',
      'Nhập số tiền vào ô chi phí',
      'Nhờ kế toán duyệt sau'],
    [1], 'Hệ thống không lưu cờ có phí trên từng việc. Cùng một loại mà mỗi người đánh một kiểu thì báo cáo cuối tháng vô nghĩa.'),
  q('t13', 'Tạo việc kính cường lực lúc 14h30 thứ Năm, loại khai «Cộng 3 ngày làm việc». Hạn rơi vào ngày nào?',
    ['Chủ nhật tuần này', 'Thứ Hai tuần sau', 'Thứ Ba tuần sau', 'Thứ Năm tuần sau'],
    [2], 'Cộng 3 NGÀY LÀM VIỆC, bỏ qua thứ Bảy và Chủ nhật: Sáu (1) → Hai (2) → Ba (3).'),
  q('t14', 'Tổ trưởng báo thợ cắt nhầm kích thước, phải làm lại, lỗi của xưởng. Chọn Loại nhiệm vụ nào và kéo theo điều gì?',
    ['Phát sinh từ khách hàng — không cần điền thêm',
      'Lỗi từ nhân viên — và phải chọn thêm Khối gây lỗi là Xưởng',
      'Phát sinh từ khách hàng — và chọn Khối gây lỗi là Xưởng',
      'Để trống cho nhanh'],
    [1], 'Ô Khối gây lỗi chỉ hiện ra sau khi chọn «Lỗi từ nhân viên». Thiếu nó thì báo cáo chất lượng không quy được về đâu.'),
  q('t15', 'Việc cắt nhầm không thu tiền khách. Có được bỏ qua không ghi không?',
    ['Được, không thu tiền thì khỏi ghi',
      'Không — vẫn phải ghi, đó là dữ liệu chất lượng để biết khâu nào hay sai',
      'Chỉ ghi nếu khách phát hiện',
      'Ghi vào sổ tay riêng là đủ'],
    [1], 'Tab Không phí đo chất lượng quy trình. Không ghi thì không biết lỗi lặp ở khâu nào mà sửa.'),
  q('t16', 'Chọn ĐỦ những trường bắt buộc khi tạo một việc phát sinh.',
    ['Dự án / deal', 'Loại phát sinh', 'Loại nhiệm vụ', 'Người chịu trách nhiệm', 'Ít nhất một người làm', 'Ngày hết hạn', 'Số tiền phát sinh'],
    [0, 1, 2, 3, 4], 'Hạn KHÔNG phải nhập — hệ thống tự tính theo SLA của loại. Số tiền không bắt buộc lúc tạo.', 'multiple'),
  q('t17', 'Đang gõ bình luận trong deal thì khách nói thêm một yêu cầu. Cách ghi nhanh nhất?',
    ['Mở tab mới vào /sx/phat-sinh',
      'Gõ dấu gạch chéo / ngay trong ô bình luận để bật form gọn',
      'Nhắn tin riêng cho quản lý',
      'Ghi tạm vào tab Ghi chú rồi tạo sau'],
    [1], 'Form gọi bằng dấu / chạy cùng luồng với form đầy đủ: vẫn bắn thông báo, vẫn tự đăng bình luận nhắc tên, vẫn đồng bộ sang nhiệm vụ.'),
  q('t18', 'Tạo xong mới phát hiện chọn nhầm loại, việc nằm sai tab. Xử lý đúng và cần kiểm tra lại gì?',
    ['Huỷ rồi tạo lại từ đầu',
      'Mở việc đổi lại loại — việc tự nhảy đúng tab, nhưng phải kiểm tra lại HẠN vì hạn được tính lại theo loại mới',
      'Nhờ admin sửa thẳng dưới cơ sở dữ liệu',
      'Để nguyên, cuối tháng báo kế toán điều chỉnh'],
    [1], 'Đổi loại là đổi cả quy tắc SLA nên hạn tính lại — nhớ xem hạn mới có còn kịp ngày lắp không.'),
  q('t19', 'Loại phát sinh bạn cần chưa có trong danh mục. Làm gì?',
    ['Chọn tạm loại gần giống nhất cho xong việc',
      'Báo admin thêm loại mới ở /management/shared-workspace-settings rồi mới tạo việc',
      'Bỏ trống trường loại',
      'Ghi tên loại vào ô Mô tả'],
    [1], 'Một lần lấy đỡ loại khác là hỏng báo cáo cả quý. Trường loại cũng không bỏ trống được, hệ thống chặn.'),
  q('t20', 'Cuối tháng mở báo cáo, thấy loại «Sửa bản lề» xuất hiện 14 lần. Kết luận và hành động hợp lý nhất?',
    ['Kỷ luật thợ lắp bản lề',
      'Lặp đều thế này thì nó không còn là phát sinh — đưa hẳn vào bộ mẫu nhiệm vụ cho lần sau',
      'Xoá loại «Sửa bản lề» khỏi danh mục',
      'Chuyển loại đó sang tab Có phí để thu tiền khách'],
    [1], 'Phát sinh là việc ngoài kế hoạch. Lặp 14 lần một tháng nghĩa là nó đã thành một bước của quy trình.'),
];

/** Bài 4 — tình huống, chấm theo từng quyết định. */
const TINH_HUONG_BRIEF = `## Bối cảnh — thứ Năm, 14:30

Dự án **Bếp chị Hoa — Quận 7** đang ở công đoạn **Gia công**, ngày lắp theo kế hoạch là **thứ Tư tuần sau**.

**14:30** — chị Hoa gọi: *«Em ơi chị đổi ý, 3 cánh tủ trên chị muốn đổi sang kính cường lực thay vì gỗ. Chị trả thêm tiền cũng được, miễn là kịp ngày lắp.»*

**14:40** — tổ trưởng gia công nhắn: *«Sếp ơi, hôm qua thợ cắt nhầm kích thước 1 ngăn dưới, bên em phải làm lại, mất thêm 1 ngày. Lỗi của bên em.»*

Bạn phải ghi nhận **cả hai việc** vào hệ thống — đúng loại, đúng người, đúng hạn.

### Danh mục loại phát sinh công ty đã khai

| Tên loại | Quy tắc hạn | Có phí |
|---|---|---|
| Kính cường lực | Cộng 3 ngày làm việc | Có phí |
| Sơn lại cánh | Cộng 2 ngày làm việc | Có phí |
| Làm lại chi tiết sai | Trong ngày | Không phí |
| Sửa bản lề | Trong ngày | Không phí |

> Làm lần lượt từng câu. Mỗi câu là một quyết định bạn phải ra trong tình huống này.`;

const QUIZ_TINH_HUONG = [
  q('s1', 'Mở trang nào để ghi nhận việc khách đổi sang kính cường lực?',
    ['/sx/project-tasks — Quản lý nhiệm vụ', '/sx/phat-sinh — Quản lý phát sinh', '/sx/dashboard — Dashboard xưởng', '/sx/assignments — Giao việc Sản xuất'],
    [1], 'Đây là việc ngoài kế hoạch, không phải nhiệm vụ của bộ mẫu. Vào Quản lý phát sinh.'),
  q('s2', 'Chọn loại phát sinh nào cho yêu cầu của chị Hoa?',
    ['Kính cường lực', 'Sơn lại cánh', 'Làm lại chi tiết sai', 'Sửa bản lề'],
    [0], 'Chọn đúng tên loại khách yêu cầu. Loại quyết định cả hạn lẫn tab.'),
  q('s3', 'Việc này sẽ nằm ở tab nào?',
    ['Không phí', 'Có phí', 'Cả hai tab', 'Chưa xác định tới khi kế toán duyệt'],
    [1], 'Nhìn cột «Có phí» của bảng loại trong đề. Người tạo không chọn tab — loại quyết định.'),
  q('s4', 'Chọn «Loại nhiệm vụ» nào cho việc này?',
    ['Phát sinh từ khách hàng', 'Lỗi từ nhân viên', 'Để trống', 'Lỗi từ nhà cung cấp'],
    [0], 'Khách đổi ý, nội bộ không làm sai gì. Đừng đánh là lỗi nhân viên.'),
  q('s5', 'Tạo lúc 14:30 thứ Năm, loại «Cộng 3 ngày làm việc» — hạn rơi vào ngày nào?',
    ['Chủ nhật tuần này', 'Thứ Hai tuần sau', 'Thứ Ba tuần sau', 'Thứ Tư tuần sau'],
    [2], 'Cộng 3 NGÀY LÀM VIỆC, bỏ qua thứ Bảy và Chủ nhật: Sáu → Hai → Ba.'),
  q('s6', 'Trường «Người chịu trách nhiệm» điền thế nào?',
    ['Chọn cả tổ gia công', 'Chọn đúng một người', 'Bỏ trống, ai rảnh thì làm', 'Để hệ thống tự chọn'],
    [1], 'Trường bắt buộc, và chỉ một người — để khi việc trễ biết hỏi ai.'),
  q('s7', 'Hạn thứ Ba, ngày lắp thứ Tư tuần sau. Đánh giá đúng?',
    ['Không kịp, phải dời ngày lắp',
      'Kịp, nhưng sát — chỉ dư 1 ngày, phải báo trước cho khách',
      'Thoải mái, dư cả tuần',
      'Không liên quan tới ngày lắp'],
    [1], 'Kịp nhưng không có chỗ cho sự cố. Phải nói rõ điều này với khách ngay từ đầu.'),

  q('s8', 'Việc thợ cắt nhầm kích thước — chọn loại phát sinh nào?',
    ['Kính cường lực', 'Sơn lại cánh', 'Làm lại chi tiết sai', 'Sửa bản lề'],
    [2], 'Không có loại nào khớp hơn. Đừng lấy đỡ loại khác cho xong.'),
  q('s9', 'Chọn «Loại nhiệm vụ» nào cho việc cắt nhầm?',
    ['Phát sinh từ khách hàng', 'Lỗi từ nhân viên', 'Để trống', 'Phát sinh do máy móc'],
    [1], 'Tổ trưởng đã nhận lỗi của bên mình. Ghi đúng để báo cáo chất lượng phản ánh thật.'),
  q('s10', 'Chọn «Lỗi từ nhân viên» rồi, khối gây lỗi là khối nào?',
    ['CRM', 'Xưởng (SX)', 'Lắp đặt (VC/LĐ)', 'Kế toán'],
    [1], 'Thợ cắt thuộc xưởng. Trường này chỉ hiện sau khi đã chọn «Lỗi từ nhân viên».'),
  q('s11', 'Việc cắt nhầm nằm ở tab nào?',
    ['Có phí', 'Không phí', 'Cả hai', 'Tuỳ quản lý quyết định'],
    [1], 'Lỗi nội bộ, công ty tự chịu. Không tính tiền khách.'),
  q('s12', 'Có được bỏ qua không ghi việc cắt nhầm vì không thu tiền của khách không?',
    ['Được, không thu tiền thì không cần ghi',
      'Không — vẫn phải ghi, đây là dữ liệu chất lượng',
      'Chỉ ghi nếu khách phát hiện',
      'Ghi vào sổ tay riêng là đủ'],
    [1], 'Không ghi thì không biết lỗi lặp ở khâu nào mà sửa quy trình.'),

  q('s13', 'Lỗi nội bộ làm chậm 1 ngày. Việc cần làm NGAY sau khi ghi nhận là gì?',
    ['Chờ tới ngày lắp rồi tính',
      'Rà lại ngày lắp và báo khách nếu có nguy cơ trễ',
      'Kỷ luật thợ cắt',
      'Đổi loại phát sinh sang Có phí để bù chi phí'],
    [1], 'Hai việc cộng lại đang ăn hết khoảng dư trước ngày lắp.'),
  q('s14', 'Phải dời hạn. Ghi lý do ở đâu?',
    ['Không cần ghi', 'Bình luận của việc / dự án', 'Nhắn riêng cho quản lý', 'Ghi vào tiêu đề nhiệm vụ'],
    [1], 'Ghi lại để tháng sau còn truy được vì sao trễ.'),
  q('s15', 'Sang tuần, soát hai việc này ở đâu để biết đã xong chưa?',
    ['Chỉ cần xem tab Có phí',
      'Soát cả hai tab ở /sx/phat-sinh, hoặc xem Báo cáo phát sinh',
      'Xem Dashboard xưởng',
      'Hỏi trực tiếp người làm'],
    [1], 'Hai việc nằm hai tab khác nhau nên phải soát cả hai.'),
  q('s16', 'Việc «Kính cường lực» đã làm xong nhưng chưa ghi chi phí. Hậu quả?',
    ['Không sao, hệ thống tự tính',
      'Đang để rơi tiền — cuối tháng không xuất được hoá đơn bổ sung',
      'Việc sẽ tự huỷ sau 7 ngày',
      'Khách sẽ bị tính hai lần'],
    [1], 'Việc có phí mà không ghi phí thì mất doanh thu bổ sung; bên kế toán có cảnh báo riêng cho trường hợp này.'),
];

async function upsertLesson(categoryId, slug, payload) {
  const { data: existing } = await supabase
    .from('knowledge_lessons')
    .select('id')
    .eq('category_id', categoryId)
    .contains('tags', [slug])
    .maybeSingle();

  const row = {
    ...payload,
    category_id: categoryId,
    tags: [...new Set([...(payload.tags || []), slug])],
    is_published: PUBLISH,
    updated_at: new Date().toISOString(),
  };
  if (PUBLISH) row.published_at = new Date().toISOString();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('knowledge_lessons').update(row).eq('id', existing.id).select('id, title').single();
    if (error) throw error;
    console.log(`   ♻️  Cập nhật: ${data.title}`);
    return data.id;
  }
  const { data, error } = await supabase
    .from('knowledge_lessons').insert(row).select('id, title').single();
  if (error) throw error;
  console.log(`   ✅ Tạo mới:  ${data.title}`);
  return data.id;
}

async function upsertExercise(lessonId, payload) {
  const { data: existing } = await supabase
    .from('knowledge_exercises')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('title', payload.title)
    .maybeSingle();

  const row = { ...payload, lesson_id: lessonId, updated_at: new Date().toISOString() };
  if (existing?.id) {
    const { error } = await supabase.from('knowledge_exercises').update(row).eq('id', existing.id);
    if (error) throw error;
    console.log(`      ♻️  Bài tập cập nhật: ${payload.title} (${payload.questions.items.length} câu)`);
    return existing.id;
  }
  const { data, error } = await supabase.from('knowledge_exercises').insert(row).select('id').single();
  if (error) throw error;
  console.log(`      ✅ Bài tập tạo mới:  ${payload.title} (${payload.questions.items.length} câu)`);
  return data.id;
}

async function main() {
  console.log(`\n🚀 Nhập khoá «${CATEGORY.name}»`);
  console.log(`   Trạng thái: ${PUBLISH ? 'XUẤT BẢN (nhân viên thấy ngay)' : 'NHÁP — chỉ admin xem được'}\n`);

  const { bai1, bai2 } = readLessonBodies();

  console.log('1️⃣ Danh mục…');
  let { data: cat } = await supabase
    .from('knowledge_categories').select('id, name').eq('slug', CATEGORY.slug).maybeSingle();
  if (!cat) {
    const { data, error } = await supabase
      .from('knowledge_categories')
      .insert({ ...CATEGORY, is_active: true, sort_order: 10 })
      .select('id, name').single();
    if (error) throw error;
    cat = data;
    console.log(`   ✅ Tạo danh mục: ${cat.name}`);
  } else {
    console.log(`   ♻️  Dùng lại danh mục có sẵn: ${cat.name}`);
  }

  console.log('\n2️⃣ Bài học…');
  await upsertLesson(cat.id, 'sx-bai-1', {
    title: 'Bài 1 — Các trang quản lý nhiệm vụ / công việc',
    summary: 'Bốn trang cùng nói về việc phải làm, nhưng mỗi trang trả lời một câu hỏi khác nhau. Chọn đúng trang theo câu hỏi trong đầu.',
    content_md: bai1,
    duration_minutes: 20,
    is_required: true,
    sort_order: 1,
    tags: ['san-xuat', 'nhiem-vu'],
  });

  await upsertLesson(cat.id, 'sx-bai-2', {
    title: 'Bài 2 — Trang quản lý phát sinh và tạo phát sinh',
    summary: 'Phát sinh là việc ngoài kế hoạch nhưng vẫn phải làm và vẫn phải tính tiền. Cách ghi nhận, phân loại, theo hạn và đối soát.',
    content_md: bai2,
    duration_minutes: 25,
    is_required: true,
    sort_order: 2,
    tags: ['san-xuat', 'phat-sinh'],
  });

  const lesson3 = await upsertLesson(cat.id, 'sx-bai-3', {
    title: 'Bài 3 — Kiểm tra kiến thức module sản xuất',
    summary: '20 câu về khái niệm, ý nghĩa và các bước thực hiện của những chức năng đã học ở Bài 1 và Bài 2.',
    content_md: [
      '## Trước khi làm bài',
      '',
      'Bài này kiểm tra lại toàn bộ Bài 1 và Bài 2. Đọc xong hai bài đó rồi hãy làm.',
      '',
      '- **20 câu** — 7 khái niệm · 6 ý nghĩa · 7 các bước thực hiện',
      '- Câu có nhiều đáp án phải chọn **đủ** mới tính đúng',
      '- Đạt từ **70 điểm** (14/20 câu) · tối đa **3 lượt** · **25 phút**',
      '',
      'Bấm nút bài tập bên dưới để bắt đầu.',
    ].join('\n'),
    duration_minutes: 25,
    is_required: true,
    sort_order: 3,
    tags: ['san-xuat', 'kiem-tra'],
  });
  await upsertExercise(lesson3, {
    title: 'Kiểm tra kiến thức — 20 câu',
    instructions: 'Chọn đáp án đúng. Câu nhiều đáp án phải chọn đủ mới được tính. Đạt từ 14/20 câu.',
    type: 'quiz',
    questions: { items: QUIZ_20 },
    passing_score: 70,
    max_attempts: 3,
    time_limit_minutes: 25,
    sort_order: 1,
  });

  const lesson4 = await upsertLesson(cat.id, 'sx-bai-4', {
    title: 'Bài 4 — Tình huống: xử lý phát sinh tại xưởng',
    summary: 'Khách đổi ý và lỗi nội bộ xảy ra cùng lúc trên một dự án sắp tới ngày lắp. Ghi nhận cả hai cho đúng.',
    content_md: TINH_HUONG_BRIEF,
    duration_minutes: 20,
    is_required: true,
    sort_order: 4,
    tags: ['san-xuat', 'tinh-huong'],
  });
  await upsertExercise(lesson4, {
    title: 'Tình huống xử lý phát sinh — 16 quyết định',
    instructions: 'Đọc kỹ bối cảnh ở phần bài học. Mỗi câu là một quyết định bạn phải ra trong tình huống đó. Đạt từ 75 điểm (12/16 câu).',
    type: 'quiz',
    // Bối cảnh đi THEO bài tập, không chỉ nằm ở nội dung bài học — vào làm bài
    // mà không thấy đề thì không có căn cứ nào để trả lời.
    questions: { prompt: TINH_HUONG_BRIEF, items: QUIZ_TINH_HUONG },
    passing_score: 75,
    max_attempts: 3,
    time_limit_minutes: 20,
    sort_order: 1,
  });

  console.log('\n✅ Xong.');
  console.log(`   Mở xem: /knowledge  →  danh mục «${CATEGORY.name}»`);
  if (!PUBLISH) {
    console.log('   Đang là NHÁP: chỉ tài khoản admin thấy. Chạy lại kèm --publish để mở cho nhân viên.');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\n❌ Lỗi:', e.message);
  process.exit(1);
});
