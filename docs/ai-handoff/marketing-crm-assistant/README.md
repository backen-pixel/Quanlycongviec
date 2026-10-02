# Trợ lý Marketing–CRM VPT — gói khảo sát và thiết kế thử nghiệm
Ngày: 02/10/2026. Owner kỹ thuật: Codex. Phiên bản gói: MCRM-D0 v1.

## Trạng thái và phạm vi được giao
Founder yêu cầu “vạy em làm cho anh nha” sau đề xuất giao Codex khảo sát và đóng gói thử nghiệm: chọn phạm vi, đối chiếu dữ liệu/mã, mẫu báo cáo, công cụ, tình huống thử và khối lượng triển khai. Đây là gói chuẩn bị của nhiệm vụ đó. Không diễn giải thành quyền chạy Agent với dữ liệu thật, cấp credential, gửi tin khách, đổi quảng cáo, áp migration, merge hoặc phát hành.

Đã khảo sát tĩnh nguồn tại main `0db11ce1adb0fb89fc87529036e495a62d58fce7`; PR #19 và #20 được kiểm metadata ngày 02/10 và vẫn open/unmerged. Kiến trúc tham chiếu là [V1.1 trên PR #20](https://github.com/backen-pixel/Quanlycongviec/blob/ba8781412ba09750d81ee3ad6b62c6fc5dac30b6/docs/architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md). Gói này không đổi baseline hoặc hợp nhất các PR phụ thuộc.

**Gói khảo sát:** hoàn thành nội dung; kết quả kiểm chứng/review xem [VALIDATION.md](VALIDATION.md). **Agent chạy/API eval:** chưa thực hiện. **Nghiệm thu dữ liệu thật/phát hành:** HOLD. Dữ liệu minh họa là tổng hợp giả, không phải kết quả kinh doanh.

## Bắt đầu đọc
- [Bản đồ nguồn và phát hiện](SOURCE_MAP.md): điều đã thấy ở mã, giới hạn và việc cần làm.
- [Hợp đồng công cụ và định nghĩa báo cáo](TOOL_CONTRACTS.md): thiết kế đề xuất, chưa là API đang chạy.
- [Báo cáo minh họa để Founder xem](SAMPLE_REPORT.md).
- [Phân công, backlog, kịch bản và gate](PILOT_AND_ACCEPTANCE.md).
- [Manifest môi trường](target-manifest.json): phần đã biết và phần chưa xác nhận.
- [Fixture minh họa](fixtures/report.synthetic.json) và [ma trận kiểm thử](acceptance-cases.json).
- [Nguồn đã khảo sát](source-manifest.json): repo, commit, path và Git blob; không chứa dữ liệu khách.

## Mục tiêu thử nghiệm
Trả lời: “Khách từ biểu mẫu Facebook VPT trong kỳ đã liên kết đúng CRM, có người phụ trách hợp lệ và có bằng chứng chăm sóc hay chưa?”

Phân biệt năm mốc: tiếp nhận biểu mẫu; liên kết Lead; có người phụ trách hợp lệ; có bằng chứng con người tiếp nhận; có bằng chứng chăm sóc. Một mốc không tự chứng minh mốc kế tiếp. Báo cáo phải chứa mã hồ sơ, nguồn/thời điểm, độ đầy đủ và việc cần kiểm tra. Phần AI chỉ giải thích dữ liệu và soạn nháp.

## Phân công
| Vai | Người/Agent | Đầu ra và trách nhiệm |
|---|---|---|
| Owner kỹ thuật | Codex | Đọc và kiểm chứng mã; thiết kế; khi được mở implementation thì code/test/PR và hồ sơ hoàn tác. |
| Owner nghiệp vụ | Sales Admin VPT — chưa có tên/ID xác nhận | Cùng Founder chốt tiêu chí “tiếp nhận/chăm sóc”, giờ làm/SLA; chuẩn bị mẫu, đối chiếu và ký nghiệm thu nghiệp vụ. Câu hỏi chỉ định đã gửi trong task. |
| Chuẩn bị ngữ cảnh | Claude Code — tùy độ sẵn sàng, chưa giao phiên thực thi | Khảo sát có nguồn/SHA, điều chưa chắc và tiêu chí; chỉ đề xuất cập nhật quyết định. Khảo sát gói này do Codex thực hiện. |
| Review | Phiên reviewer độc lập | Đọc yêu cầu, nguồn, bản thay đổi và bằng chứng; PASS/CHANGES_REQUESTED/HOLD theo phạm vi. |
| Quyết định cuối | Founder | Chốt nghiệp vụ, phạm vi dữ liệu/quyền và phát hành tương ứng. |

Mỗi bàn giao gồm mục tiêu, phạm vi, base/head SHA, nguồn tham chiếu, điều chưa chắc, tiêu chí nghiệm thu. Hồ sơ chuẩn ở repo; mirror chỉ liên kết tới gói đã công bố. Claude/Codex giữ vai Software Factory; Agent nghiệp vụ tương lai dùng danh tính và quyền riêng.

## Hướng triển khai sau khảo sát
Giữ Express/React/Supabase/Render. Bắt đầu một Agent, gọi thủ công, chỉ đọc và soạn nháp; không bật lịch hoặc MCP Events trong gói đầu. Tái sử dụng phần phù hợp của bot/report gateway hiện có sau kiểm chứng; không mở toàn bộ danh sách tool cũ.

Chuẩn bị contract/fixture có thể tiếp tục khi chưa có API key. Trước khi triển khai hoặc chạy Agents API phải theo quy trình credential của môi trường, xác minh quyền truy cập và giới hạn chi phí; bản plugin đã cài không chứng minh có API access. Gói này chưa gọi OpenAI API hoặc đọc khóa.

## Điểm cần Founder/Sales Admin chốt cho thử nghiệm thật
1. Tên người nghiệm thu và tài khoản nghiệp vụ cụ thể.
2. Môi trường được phép, bản FE/BE đang chạy; tenant/company/Page/form/account liên kết đúng và mẫu có mã truy vết.
3. Loại bằng chứng chăm sóc và quy tắc thời hạn. Đề xuất chưa được duyệt không được dùng để gắn nhãn vi phạm.
4. Mức dữ liệu được đưa ra ngoài, ngân sách API và thời gian lưu kết quả.

Không lưu token, PII, raw webhook hoặc lời nhắn khách vào repo. Gate chỉ chặn công việc phụ thuộc; khảo sát bằng mã và fixture vẫn hoàn tất được.

