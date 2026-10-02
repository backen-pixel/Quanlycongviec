# Review độc lập — candidate đang tắt runtime

Reviewer: Agent `/root/architecture_v11_review`, phiên riêng với bên xây, chỉ đọc mã/bằng chứng và chạy kiểm thử. Founder đã giao reviewer riêng. Người xây sửa lỗi, reviewer đọc lại và chạy độc lập.

**PASS phạm vi code/domain/SQL/report/UI**, không đồng nghĩa đạt toàn kế hoạch hoặc được phát hành. Reviewer độc lập chạy163/163 test, gồm25 test Lead V2. PostgreSQL CI/browser được Builder ghi riêng tại [validation](VALIDATION.md); reviewer không tuyên bố đã tự chạy DB/browser.

## Finding đã đóng

1. Revenue projection chấp nhận Lead tương lai hoặc doanh thu trước lúc tiếp nhận: thêm ràng buộc chronology và regression.
2. Historical insights bỏ nhận xét tài chính nhưng giữ xếp hạng/priority cũ: vô hiệu hóa rank, đánh STALE_FINANCIAL_BASIS và sort lại; regression đã có.
3. SQL grant array có NULL làm ANY không từ chối đúng: constrain tập action, chặn NULL và dùng điều kiện fail-closed; thêm test PostgreSQL.
4. Trạng thái opt-out/human takeover thiếu vẫn cho gửi: thiếu/sai kiểu boolean trả HANDOFF, send:false.
5. Scope company thiếu/rỗng vẫn duyệt template: yêu cầu companyId hợp lệ trước so scope.

## Delta Lead V2

Policy đổi250.000 VND/khách hợp lệ, giữ100 triệu một lần và các giới hạn. Calculator cộng cả chi zero-Lead, dedup canonical ID, tách pending/rejected, thiếu/xung đột trả UNKNOWN, không cần kế toán. Luôn `allowBudgetExecution:false`, `revenueTargetEvaluated:false`.

Ranh giới: canonicalLeadId phải do CRM đối soát khách trùng liên kênh; calculator không tự chứng minh hai ID khác nhau là hai người khác nhau. Nghiệm thu adapter cần tình huống khách gửi lại qua Facebook/Google. Không dùng nhãnấm/nóng để chứng minh hợp lệ.

## Cổng chưa đạt

Review tài liệu cuối cũng PASS: reviewer rà11 tệp kế hoạch/hợp đồng/README/bàn giao và5 thay đổi PR20; xác nhận F-13/F-14, kế toán hoãn không chặn Lead, nguồn canonical sau CRM dedup, trạng thái IN PROGRESS/HOLD và bảo toàn lịch sử. PR20 bản cập nhật `248b1eaef220e5468ce9c18d3592025293b09611` đã công bố; Builder đối chiếu5 file Git blob hash không sai khác.

Trusted context/adapters/DB thật, atomic ngân sách/lịch/takeover, thư viện tài sản, đủ sáu kênh và UAT không thuộc PASS này. Phát hành HOLD. Hồ sơ cổng và phần còn thiếu nằm tại README; nội dung review luôn phải đọc cùng phiên bản mã và CI tương ứng.
