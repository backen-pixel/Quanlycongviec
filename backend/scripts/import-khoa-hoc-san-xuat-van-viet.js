/**
 * Nhập khoá «Quy trình vận hành module sản xuất» — bản VĂN VIẾT.
 *
 *   node backend/scripts/import-khoa-hoc-san-xuat-van-viet.js
 *   node backend/scripts/import-khoa-hoc-san-xuat-van-viet.js --publish
 *
 * Bản song song của khoá «Hướng dẫn sử dụng module sản xuất» (văn nói). Cùng nội dung
 * nghiệp vụ, cùng khung năm mục, khác văn phong: phi ngôi, trang trọng, không hội thoại.
 * Hai khoá nằm ở HAI danh mục riêng để người đọc chọn bản hợp với mình, và để sửa bản
 * này không đụng vào bản kia.
 *
 * Chạy lại được nhiều lần: nhận diện bài theo slug nhúng trong tags, có thì cập nhật,
 * chưa có thì tạo. Không xoá trắng danh mục — xoá trắng là mất tiến độ học và điểm bài
 * tập của những người đã làm.
 *
 * Mặc định tạo ở trạng thái CHƯA XUẤT BẢN. Thêm --publish khi muốn mở cho nhân viên.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const PUBLISH = process.argv.includes('--publish');

/**
 * Mặc định KHÔNG bắt buộc.
 *
 * Bản này và bản văn nói dạy cùng một nội dung, chỉ khác văn phong — người học chọn
 * một bản hợp với mình. Đánh bắt buộc cả hai thì hệ thống tính nhân viên phải hoàn
 * thành tám bài trùng nội dung, và con số «bài bắt buộc chưa xong» mất ý nghĩa.
 * Bản văn nói giữ vai trò bắt buộc; bản này để tự chọn.
 *
 * Thêm --bat-buoc nếu muốn đảo lại.
 */
const REQUIRED = process.argv.includes('--bat-buoc');

const CATEGORY = {
  name: 'Quy trình vận hành module sản xuất (văn viết)',
  slug: 'quy-trinh-module-san-xuat-van-viet',
  description: 'Bản văn viết của khoá hướng dẫn module sản xuất: hệ thống trang quản lý nhiệm vụ, quản lý và khởi tạo việc phát sinh, kèm bài kiểm tra và bài tình huống.',
  icon: '📘',
};

const DRAFT_MD = path.join(__dirname, '../../docs/khoa-hoc/module-san-xuat-VAN-VIET-DRAFT.md');

/** Tách bản thảo thành thân bài 1 và bài 2 (giữ từ mục «## 1.» trở đi). */
function readLessonBodies() {
  const raw = fs.readFileSync(DRAFT_MD, 'utf8');
  const parts = raw.split(/\n# BÀI /);
  const body = (i) => {
    const chunk = parts[i];
    if (!chunk) throw new Error(`Không tìm thấy BÀI ${i} trong ${DRAFT_MD}`);
    const at = chunk.indexOf('## 1.');
    if (at < 0) throw new Error(`Bài ${i} không có mục "## 1."`);
    return chunk.slice(at).replace(/\n---\s*$/, '').trimEnd();
  };
  return { bai1: body(1), bai2: body(2) };
}

const q = (id, question, options, correct, explanation, type = 'single') => ({
  id, question, type, options, correct, explanation,
});

/** Bài 3 — 20 câu, diễn đạt theo văn viết: nêu trường hợp, hỏi quy định áp dụng. */
const QUIZ_20 = [
  q('v1', 'Trang chức năng nào phục vụ mục đích xác định khối lượng công việc trong ngày và các nhiệm vụ quá hạn?',
    ['Dashboard xưởng', 'Quản lý nhiệm vụ', 'Giao việc Sản xuất', 'Báo cáo phát sinh'],
    [1], 'Dashboard xưởng phục vụ mục đích xác định công đoạn hiện tại của đơn hàng. Khối lượng công việc theo ngày thuộc phạm vi trang Quản lý nhiệm vụ.'),
  q('v2', 'Trang chức năng nào phục vụ mục đích xác định công đoạn hiện tại của một đơn hàng?',
    ['Quản lý nhiệm vụ', 'Dashboard xưởng', 'Giao việc Sản xuất', 'Báo cáo phát sinh'],
    [1], 'Dashboard xưởng trình bày dữ liệu dưới dạng thẻ dự án theo cột công đoạn.'),
  q('v3', 'Tiêu chí nào phân biệt nhiệm vụ dự án với giao việc?',
    ['Nhiệm vụ dự án do người dùng khởi tạo thủ công, giao việc do hệ thống tự sinh',
      'Nhiệm vụ dự án gắn với dự án và công đoạn; giao việc gắn với cá nhân người thực hiện',
      'Hai đối tượng đồng nhất, chỉ khác tên gọi',
      'Nhiệm vụ dự án không có hạn hoàn thành'],
    [1], 'Nhiệm vụ dự án trả lời câu hỏi về tiến độ công đoạn. Giao việc trả lời câu hỏi về khối lượng công việc của nhân sự.'),
  q('v4', 'Tiến độ của một nhiệm vụ được xác định theo cơ chế nào?',
    ['Người thực hiện nhập trực tiếp tỷ lệ phần trăm',
      'Tỷ lệ việc con đã hoàn thành trên tổng số việc con, do hệ thống tính tự động',
      'Tỷ lệ thời gian đã trôi so với hạn hoàn thành',
      'Cấp quản lý đánh giá và nhập thủ công'],
    [1], 'Người dùng không có quyền nhập trực tiếp giá trị tiến độ. Nhiệm vụ chỉ chuyển trạng thái «Đã làm» khi toàn bộ việc con đã hoàn thành.'),
  q('v5', 'Hạn hoàn thành trong ngày được tính đến thời điểm nào?',
    ['Hết ngày theo lịch, tức 23 giờ 59',
      'Giờ kết thúc làm việc của công ty',
      'Mốc 12 giờ 00',
      'Mốc 17 giờ 00 áp dụng chung cho mọi công ty'],
    [1], 'Nhiệm vụ chưa hoàn thành sau giờ kết thúc làm việc được chuyển sang nhóm Quá hạn trong cùng ngày.'),
  q('v6', 'Chọn ĐỦ sáu nhóm phân loại theo hạn hoàn thành tại trang Quản lý nhiệm vụ.',
    ['Quá hạn', 'Hôm nay', 'Ngày mai', 'Trong tuần', 'Tuần sau', 'Chưa có hạn', 'Tháng sau'],
    [0, 1, 2, 3, 4, 5], 'Hệ thống phân thành đúng sáu nhóm. Không tồn tại nhóm «Tháng sau».', 'multiple'),
  q('v7', 'Vì sao nhóm «Chưa có hạn» cần được ưu tiên rà soát?',
    ['Vì nhóm này chứa số lượng nhiệm vụ lớn nhất',
      'Vì không có mốc thời gian tham chiếu nên không bao giờ kích hoạt cảnh báo quá hạn',
      'Vì hệ thống tự động xoá sau ba mươi ngày',
      'Vì không thể gán nhân sự cho nhóm này'],
    [1], 'Cơ chế cảnh báo dựa trên hạn hoàn thành. Nhiệm vụ không có hạn nằm ngoài phạm vi cảnh báo và có nguy cơ bị bỏ sót.'),
  q('v8', 'Giá trị hiển thị trên dải chỉ số đầu trang Quản lý nhiệm vụ được tính theo phạm vi nào?',
    ['Toàn bộ dữ liệu hệ thống',
      'Phạm vi bộ lọc đang áp dụng',
      'Phạm vi công ty của người đăng nhập',
      'Phạm vi dự án đang mở'],
    [1], 'Trường hợp số liệu không khớp kết quả đối chiếu thủ công, cần huỷ toàn bộ điều kiện lọc trước khi đối chiếu lại.'),
  q('v9', 'Thao tác kéo thả thẻ dự án sang cột khác bị hệ thống từ chối. Nguyên nhân nào đúng?',
    ['Người dùng không đủ quyền thao tác',
      'Cột hiện tại còn nhiệm vụ mang cờ «chặn chuyển giai đoạn» chưa hoàn thành',
      'Dự án chưa khai báo ngày lắp đặt',
      'Kết nối mạng không ổn định'],
    [1], 'Hệ thống liệt kê danh sách nhiệm vụ còn thiếu kèm theo thông báo từ chối. Cần hoàn thành hoặc huỷ các nhiệm vụ đó.'),
  q('v10', 'Chức năng «Nhắc» trên thẻ nhiệm vụ bị vô hiệu hoá trong trường hợp nào?',
    ['Nhiệm vụ đã quá hạn',
      'Nhiệm vụ chưa được gán danh mục',
      'Nhiệm vụ thuộc dự án của công ty khác',
      'Người thực hiện đang ngoại tuyến'],
    [1], 'Cần bổ sung danh mục cho nhiệm vụ trước khi sử dụng chức năng này.'),

  q('v11', 'Thuộc tính nào quyết định một việc phát sinh thuộc nhóm Có phí hay Không phí?',
    ['Lựa chọn của người khởi tạo tại thời điểm tạo bản ghi',
      'Thuộc tính chi phí kế thừa từ loại phát sinh đã khai báo trong danh mục',
      'Giá trị nhập tại trường chi phí',
      'Kết quả phê duyệt của bộ phận kế toán'],
    [1], 'Thuộc tính chi phí không được lưu trên từng bản ghi nhằm bảo đảm tính nhất quán của số liệu tổng hợp cuối kỳ.'),
  q('v12', 'Chọn ĐỦ hai giá trị hợp lệ của trường «Loại nhiệm vụ».',
    ['Phát sinh từ khách hàng', 'Lỗi từ nhân viên', 'Phát sinh từ nhà cung cấp', 'Phát sinh do điều kiện khách quan'],
    [0, 1], 'Trường này chỉ nhận hai giá trị. Giá trị «Lỗi từ nhân viên» kéo theo yêu cầu khai báo Khối gây lỗi.', 'multiple'),
  q('v13', 'Trường «Khối gây lỗi» được yêu cầu khai báo trong trường hợp nào?',
    ['Mọi việc phát sinh',
      'Khi Loại nhiệm vụ nhận giá trị «Lỗi từ nhân viên»',
      'Khi việc phát sinh thuộc nhóm Có phí',
      'Khi việc phát sinh quá hạn'],
    [1], 'Trường chỉ hiển thị sau khi lựa chọn giá trị «Lỗi từ nhân viên». Thiếu thông tin này, số liệu chất lượng không quy được về khối chịu trách nhiệm.'),
  q('v14', 'Việc phát sinh được khởi tạo lúc 14 giờ 30 ngày thứ Năm, loại phát sinh khai báo quy tắc «Cộng 3 ngày làm việc». Hạn hoàn thành được xác định là ngày nào?',
    ['Chủ nhật cùng tuần', 'Thứ Hai tuần kế tiếp', 'Thứ Ba tuần kế tiếp', 'Thứ Năm tuần kế tiếp'],
    [2], 'Phép tính cộng ba ngày làm việc, loại trừ thứ Bảy và Chủ nhật: thứ Sáu, thứ Hai, thứ Ba.'),
  q('v15', 'Chọn ĐỦ các trường bắt buộc khi khởi tạo một việc phát sinh.',
    ['Dự án hoặc cơ hội bán hàng', 'Loại phát sinh', 'Loại nhiệm vụ', 'Người chịu trách nhiệm',
      'Tối thiểu một người thực hiện', 'Hạn hoàn thành', 'Giá trị chi phí'],
    [0, 1, 2, 3, 4], 'Hạn hoàn thành do hệ thống xác định tự động theo quy tắc của loại phát sinh. Giá trị chi phí không bắt buộc tại thời điểm khởi tạo.', 'multiple'),
  q('v16', 'Quy định về trường «Người chịu trách nhiệm» là gì?',
    ['Có thể để trống nếu đã khai báo người thực hiện',
      'Bắt buộc, và chỉ nhận một cá nhân duy nhất',
      'Bắt buộc, cho phép khai báo nhiều cá nhân',
      'Chỉ áp dụng với việc phát sinh thuộc nhóm Có phí'],
    [1], 'Quy định này bảo đảm tính xác định của trách nhiệm giải trình khi công việc chậm tiến độ.'),
  q('v17', 'Việc phát sinh không thu phí của khách hàng có bắt buộc ghi nhận vào hệ thống không?',
    ['Không bắt buộc, do không phát sinh doanh thu',
      'Bắt buộc, vì đây là dữ liệu phản ánh chất lượng quy trình',
      'Chỉ ghi nhận khi khách hàng có khiếu nại',
      'Chỉ ghi nhận khi giá trị vượt ngưỡng quy định'],
    [1], 'Nhóm Không phí là chỉ tiêu phản ánh chất lượng quy trình nội bộ. Không ghi nhận thì không xác định được công đoạn phát sinh sai sót lặp lại.'),
  q('v18', 'Sau khi điều chỉnh loại phát sinh của một bản ghi đã tạo, nội dung nào cần được kiểm tra lại?',
    ['Danh sách người thực hiện',
      'Hạn hoàn thành, do hạn được tính lại theo quy tắc của loại mới',
      'Tiêu đề bản ghi',
      'Dự án được gắn kết'],
    [1], 'Việc thay đổi loại phát sinh đồng thời thay đổi quy tắc cam kết dịch vụ áp dụng.'),
  q('v19', 'Loại phát sinh cần sử dụng chưa có trong danh mục. Biện pháp xử lý đúng quy định là gì?',
    ['Lựa chọn loại phát sinh gần tương đương để thay thế',
      'Đề nghị bộ phận quản trị bổ sung danh mục trước khi khởi tạo bản ghi',
      'Để trống trường loại phát sinh',
      'Ghi tên loại vào trường Mô tả'],
    [1], 'Việc lựa chọn loại thay thế làm sai lệch số liệu tổng hợp của toàn kỳ. Trường loại phát sinh cũng không cho phép để trống.'),
  q('v20', 'Báo cáo cho thấy một loại phát sinh lặp lại với tần suất cao trong kỳ. Nhận định và hành động phù hợp là gì?',
    ['Áp dụng chế tài với bộ phận liên quan',
      'Nội dung công việc đã mang tính thường xuyên, cần bổ sung vào bộ mẫu nhiệm vụ',
      'Loại bỏ loại phát sinh đó khỏi danh mục',
      'Chuyển loại phát sinh đó sang nhóm Có phí'],
    [1], 'Việc phát sinh theo định nghĩa là công việc ngoài kế hoạch. Tần suất lặp lại cao cho thấy nội dung này đã trở thành một bước của quy trình.'),
];

/** Bài 4 — tình huống, mỗi câu là một quyết định nghiệp vụ. */
const TINH_HUONG_BRIEF = [
  '## Bối cảnh',
  '',
  'Dự án **Bếp — Quận 7** đang ở công đoạn **Gia công**. Ngày lắp đặt theo kế hoạch là thứ Tư tuần kế tiếp.',
  '',
  'Trong cùng một buổi chiều thứ Năm, bộ phận quản lý tiếp nhận hai thông tin:',
  '',
  '1. **14 giờ 30** — khách hàng đề nghị thay đổi vật liệu ba cánh tủ trên từ gỗ sang kính cường lực, chấp nhận chi trả phần chi phí tăng thêm với điều kiện bảo đảm tiến độ lắp đặt.',
  '2. **14 giờ 40** — tổ trưởng gia công báo cáo sai sót kích thước một ngăn dưới phát sinh từ ca làm việc hôm trước, phải thực hiện lại, thời gian ảnh hưởng ước tính một ngày. Sai sót thuộc trách nhiệm của xưởng.',
  '',
  'Yêu cầu: ghi nhận cả hai nội dung vào hệ thống, bảo đảm đúng loại phát sinh, đúng nguồn gốc, đúng nhân sự chịu trách nhiệm và đúng hạn hoàn thành.',
  '',
  '### Danh mục loại phát sinh đã khai báo',
  '',
  '| Tên loại | Quy tắc hạn | Phân nhóm chi phí |',
  '|---|---|---|',
  '| Kính cường lực | Cộng 3 ngày làm việc | Có phí |',
  '| Sơn lại cánh | Cộng 2 ngày làm việc | Có phí |',
  '| Làm lại chi tiết sai | Trong ngày | Không phí |',
  '| Sửa bản lề | Trong ngày | Không phí |',
  '',
  '> Mỗi câu hỏi tương ứng với một quyết định nghiệp vụ trong tình huống nêu trên.',
].join('\n');

const QUIZ_TINH_HUONG = [
  q('w1', 'Nội dung thứ nhất — yêu cầu thay đổi vật liệu của khách hàng — được ghi nhận tại trang chức năng nào?',
    ['Quản lý nhiệm vụ', 'Quản lý phát sinh', 'Dashboard xưởng', 'Tab Ghi chú của dự án'],
    [1], 'Yêu cầu nằm ngoài phạm vi bộ mẫu nhiệm vụ và không được lập kế hoạch trước, thuộc đối tượng việc phát sinh.'),
  q('w2', 'Loại phát sinh nào phù hợp với yêu cầu thay đổi vật liệu của khách hàng?',
    ['Kính cường lực', 'Sơn lại cánh', 'Làm lại chi tiết sai', 'Sửa bản lề'],
    [0], 'Loại phát sinh phải phản ánh đúng nội dung công việc. Lựa chọn này đồng thời xác định hạn hoàn thành và nhóm chi phí.'),
  q('w3', 'Bản ghi thứ nhất thuộc nhóm chi phí nào?',
    ['Không phí', 'Có phí', 'Thuộc cả hai nhóm', 'Chưa xác định cho tới khi kế toán phê duyệt'],
    [1], 'Căn cứ cột phân nhóm chi phí của loại «Kính cường lực» trong danh mục. Người khởi tạo không lựa chọn nhóm này.'),
  q('w4', 'Giá trị nào được khai báo tại trường «Loại nhiệm vụ» cho bản ghi thứ nhất?',
    ['Phát sinh từ khách hàng', 'Lỗi từ nhân viên', 'Để trống', 'Phát sinh từ nhà cung cấp'],
    [0], 'Nguồn gốc phát sinh là thay đổi yêu cầu từ phía khách hàng, không phải sai sót nội bộ.'),
  q('w5', 'Hạn hoàn thành của bản ghi thứ nhất được xác định là ngày nào?',
    ['Chủ nhật cùng tuần', 'Thứ Hai tuần kế tiếp', 'Thứ Ba tuần kế tiếp', 'Thứ Tư tuần kế tiếp'],
    [2], 'Khởi tạo thứ Năm, quy tắc cộng ba ngày làm việc, loại trừ thứ Bảy và Chủ nhật.'),
  q('w6', 'Trường «Người chịu trách nhiệm» của bản ghi thứ nhất được khai báo như thế nào?',
    ['Khai báo toàn bộ tổ gia công', 'Khai báo đúng một cá nhân', 'Để trống', 'Hệ thống tự xác định'],
    [1], 'Trường bắt buộc và chỉ nhận một cá nhân duy nhất, nhằm bảo đảm tính xác định của trách nhiệm giải trình.'),
  q('w7', 'Đối chiếu hạn hoàn thành thứ Ba với ngày lắp đặt thứ Tư tuần kế tiếp, nhận định nào đúng?',
    ['Không bảo đảm tiến độ, phải điều chỉnh ngày lắp đặt',
      'Bảo đảm tiến độ nhưng dư địa chỉ còn một ngày, cần thông báo trước cho khách hàng',
      'Dư địa rộng, không cần theo dõi thêm',
      'Hai mốc thời gian không liên quan đến nhau'],
    [1], 'Dư địa một ngày không đủ hấp thụ sự cố phát sinh thêm. Nội dung này cần được trao đổi với khách hàng ngay từ đầu.'),

  q('w8', 'Loại phát sinh nào phù hợp với nội dung thứ hai — sai sót kích thước phải làm lại?',
    ['Kính cường lực', 'Sơn lại cánh', 'Làm lại chi tiết sai', 'Sửa bản lề'],
    [2], 'Danh mục không có loại nào phản ánh sát hơn. Không lựa chọn loại gần tương đương để thay thế.'),
  q('w9', 'Giá trị nào được khai báo tại trường «Loại nhiệm vụ» cho bản ghi thứ hai?',
    ['Phát sinh từ khách hàng', 'Lỗi từ nhân viên', 'Để trống', 'Phát sinh do điều kiện khách quan'],
    [1], 'Báo cáo của tổ trưởng xác định sai sót thuộc trách nhiệm nội bộ. Khai báo đúng để số liệu chất lượng phản ánh thực tế.'),
  q('w10', 'Sau khi khai báo «Lỗi từ nhân viên», giá trị nào được chọn tại trường Khối gây lỗi?',
    ['CRM', 'Xưởng', 'Lắp đặt', 'Kế toán'],
    [1], 'Bộ phận gia công thuộc khối Xưởng. Trường này chỉ hiển thị sau khi lựa chọn giá trị «Lỗi từ nhân viên».'),
  q('w11', 'Bản ghi thứ hai thuộc nhóm chi phí nào?',
    ['Có phí', 'Không phí', 'Thuộc cả hai nhóm', 'Do cấp quản lý quyết định'],
    [1], 'Sai sót nội bộ do doanh nghiệp tự chịu chi phí, không tính cho khách hàng.'),
  q('w12', 'Bản ghi thứ hai không phát sinh doanh thu. Có được bỏ qua việc ghi nhận không?',
    ['Được, do không phát sinh doanh thu',
      'Không, vì đây là dữ liệu phản ánh chất lượng quy trình',
      'Chỉ ghi nhận khi khách hàng phát hiện',
      'Chỉ ghi nhận vào sổ theo dõi riêng của bộ phận'],
    [1], 'Không ghi nhận thì không có căn cứ xác định công đoạn phát sinh sai sót lặp lại.'),

  q('w13', 'Sai sót nội bộ làm chậm tiến độ một ngày. Hành động cần thực hiện ngay sau khi ghi nhận là gì?',
    ['Chờ đến gần ngày lắp đặt rồi đánh giá lại',
      'Rà soát lại ngày lắp đặt và thông báo khách hàng nếu có nguy cơ chậm tiến độ',
      'Áp dụng chế tài với nhân sự liên quan',
      'Chuyển bản ghi sang nhóm Có phí để bù đắp chi phí'],
    [1], 'Hai nội dung phát sinh cộng dồn đã sử dụng hết dư địa thời gian trước ngày lắp đặt.'),
  q('w14', 'Trường hợp phải điều chỉnh hạn hoàn thành, lý do điều chỉnh được ghi nhận tại đâu?',
    ['Không cần ghi nhận', 'Mục bình luận của bản ghi hoặc dự án',
      'Thông báo riêng cho cấp quản lý', 'Trường tiêu đề của bản ghi'],
    [1], 'Việc ghi nhận lý do phục vụ công tác đối chiếu và truy vết về sau.'),
  q('w15', 'Để theo dõi tiến độ xử lý cả hai bản ghi trong tuần kế tiếp, cần rà soát ở đâu?',
    ['Chỉ cần rà soát nhóm Có phí',
      'Rà soát cả hai nhóm tại trang Quản lý phát sinh, hoặc sử dụng Báo cáo phát sinh',
      'Rà soát tại Dashboard xưởng',
      'Liên hệ trực tiếp người thực hiện'],
    [1], 'Hai bản ghi thuộc hai nhóm chi phí khác nhau nên phải rà soát cả hai.'),
  q('w16', 'Bản ghi «Kính cường lực» đã hoàn thành nhưng chưa ghi nhận chi phí. Hệ quả là gì?',
    ['Không ảnh hưởng, hệ thống tự tính toán',
      'Tồn tại rủi ro thất thoát doanh thu do không có căn cứ lập hoá đơn bổ sung',
      'Bản ghi sẽ tự động huỷ sau bảy ngày',
      'Khách hàng bị tính chi phí hai lần'],
    [1], 'Bộ phận kế toán có cảnh báo riêng đối với các việc phát sinh thuộc nhóm Có phí chưa ghi nhận chi phí.'),
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
    console.log(`   [cap nhat] ${data.title}`);
    return data.id;
  }
  const { data, error } = await supabase
    .from('knowledge_lessons').insert(row).select('id, title').single();
  if (error) throw error;
  console.log(`   [tao moi ] ${data.title}`);
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
    console.log(`      [cap nhat] ${payload.title} — ${payload.questions.items.length} cau`);
    return existing.id;
  }
  const { data, error } = await supabase.from('knowledge_exercises').insert(row).select('id').single();
  if (error) throw error;
  console.log(`      [tao moi ] ${payload.title} — ${payload.questions.items.length} cau`);
  return data.id;
}

async function main() {
  console.log(`\nNhap khoa «${CATEGORY.name}»`);
  console.log(`   Trang thai: ${PUBLISH ? 'XUAT BAN' : 'NHAP — chi admin xem duoc'}\n`);

  const { bai1, bai2 } = readLessonBodies();

  console.log('1. Danh muc...');
  let { data: cat } = await supabase
    .from('knowledge_categories').select('id, name').eq('slug', CATEGORY.slug).maybeSingle();
  if (!cat) {
    const { data, error } = await supabase
      .from('knowledge_categories')
      .insert({ ...CATEGORY, is_active: true, sort_order: 11 })
      .select('id, name').single();
    if (error) throw error;
    cat = data;
    console.log(`   [tao moi ] ${cat.name}`);
  } else {
    console.log(`   [dung lai] ${cat.name}`);
  }

  console.log('\n2. Bai hoc...');
  await upsertLesson(cat.id, 'sxvv-bai-1', {
    title: 'Bài 1 — Hệ thống trang quản lý nhiệm vụ và công việc',
    summary: 'Phân định chức năng của bốn trang quản lý nhiệm vụ trong module sản xuất, nguyên tắc lựa chọn trang theo mục đích tra cứu, và quy trình rà soát định kỳ.',
    content_md: bai1,
    duration_minutes: 20,
    is_required: REQUIRED,
    sort_order: 1,
    tags: ['san-xuat', 'van-viet', 'nhiem-vu'],
  });

  await upsertLesson(cat.id, 'sxvv-bai-2', {
    title: 'Bài 2 — Quản lý và khởi tạo việc phát sinh',
    summary: 'Khái niệm việc phát sinh, hai trục phân loại, cơ chế xác định hạn theo cam kết dịch vụ, quy trình khởi tạo và chế độ báo cáo.',
    content_md: bai2,
    duration_minutes: 25,
    is_required: REQUIRED,
    sort_order: 2,
    tags: ['san-xuat', 'van-viet', 'phat-sinh'],
  });

  const lesson3 = await upsertLesson(cat.id, 'sxvv-bai-3', {
    title: 'Bài 3 — Kiểm tra kiến thức quy trình vận hành',
    summary: '20 câu kiểm tra khái niệm, quy định và trình tự thao tác của các nội dung đã trình bày tại Bài 1 và Bài 2.',
    content_md: [
      '## Phạm vi kiểm tra',
      '',
      'Bài kiểm tra bao quát toàn bộ nội dung Bài 1 và Bài 2. Học viên cần hoàn thành hai bài nêu trên trước khi thực hiện.',
      '',
      '| Tiêu chí | Quy định |',
      '|---|---|',
      '| Số câu hỏi | 20 |',
      '| Điểm đạt | 70 trên thang 100, tương đương 14 câu đúng |',
      '| Số lượt làm bài | Tối đa 3 |',
      '| Thời gian làm bài | 25 phút |',
      '',
      'Đối với câu hỏi nhiều đáp án, học viên phải lựa chọn đầy đủ các phương án đúng mới được tính điểm.',
    ].join('\n'),
    duration_minutes: 25,
    is_required: REQUIRED,
    sort_order: 3,
    tags: ['san-xuat', 'van-viet', 'kiem-tra'],
  });
  await upsertExercise(lesson3, {
    title: 'Kiểm tra kiến thức quy trình — 20 câu',
    instructions: 'Lựa chọn phương án đúng. Câu hỏi nhiều đáp án yêu cầu lựa chọn đầy đủ. Điểm đạt từ 70 trên thang 100.',
    type: 'quiz',
    questions: { items: QUIZ_20 },
    passing_score: 70,
    max_attempts: 3,
    time_limit_minutes: 25,
    sort_order: 1,
  });

  const lesson4 = await upsertLesson(cat.id, 'sxvv-bai-4', {
    title: 'Bài 4 — Tình huống nghiệp vụ: xử lý phát sinh đồng thời',
    summary: 'Tình huống hai nội dung phát sinh xuất hiện đồng thời trên một dự án sắp tới ngày lắp đặt, một từ khách hàng và một từ sai sót nội bộ.',
    content_md: TINH_HUONG_BRIEF,
    duration_minutes: 20,
    is_required: REQUIRED,
    sort_order: 4,
    tags: ['san-xuat', 'van-viet', 'tinh-huong'],
  });
  await upsertExercise(lesson4, {
    title: 'Tình huống nghiệp vụ — 16 quyết định',
    instructions: 'Đọc kỹ phần bối cảnh tại nội dung bài học. Mỗi câu hỏi tương ứng với một quyết định nghiệp vụ. Điểm đạt từ 75 trên thang 100.',
    type: 'quiz',
    // Bối cảnh đi THEO bài tập, không chỉ nằm ở nội dung bài học — vào làm bài
    // mà không thấy đề thì không có căn cứ nào để trả lời.
    questions: { prompt: TINH_HUONG_BRIEF, items: QUIZ_TINH_HUONG },
    passing_score: 75,
    max_attempts: 3,
    time_limit_minutes: 20,
    sort_order: 1,
  });

  console.log('\nXong.');
  console.log(`   Mo xem: /knowledge → danh muc «${CATEGORY.name}»`);
  if (!PUBLISH) {
    console.log('   Dang la NHAP. Chay lai kem --publish de mo cho nhan vien.');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
