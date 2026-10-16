# Sơ đồ V3.1a và nguồn chưa xác minh

Các Mermaid sources: [technical](technical.mmd), [decision](decision.mmd), [command](command.mmd), [M1intake](m1-intake.mmd). [Tổng thể các miền](../overall-system.md) và [các sequence miền/ERD kế thừa](../../overall-design-20261016/diagrams/README.md) cung cấp lifecycle rộng hơn M1. Các nhãn cũ xung đột D2/D3/D4/D6 được thay bằng V3.1a.

Nguồn hình đã đọc trực quan: BUSINESS_AI_OS_KIEN_TRUC_TONG_THE_20261016.png trong Downloads,3000×2860; hash ở source manifest. Hình ghi marketing là phân hệ trongBusinessOS, FounderControlCenter+6Hệ, nềnchung. Các PDF/hình gốc giữ ở nơi người dùng cung cấp; manifestpinfilename/hash, không sửa bản gốc.

Đánh giá “10 điểm đã nêu” chưa được cung cấp: SOURCE_UNVERIFIED. Trích nguyên văn ở [open-questions](../open-questions.md). Danh sách dưới là **đề xuất mới từ brief/source đã có**, không phải khôi phục mười điểm gốc:

| Khu vực ảnh nguồn | Điều chỉnh V3.1a có căn cứ |
|---|---|
| n8n “tùychọn” cạnh backend | Chuyển ngoài đường sản phẩm, chỉ dùng nội bộ; L2/connector/notification/reconcile thuộcbackend theoD2 |
| “Đủquyền:tựthựchiện” / “Ngoạilệ:trìnhduyệt” | Hiển thị C0/C1/C2_NOTIFY/C2_APPROVE/C3, closedallowlist và exactdigest; silencekhôngapproval |
| Luật/quyền | Thêm đủPháp–Lệ–Lý–Tình, DENY/UNKNOWN/humaninput cả4cửa |
| AI/runtime | Thêm taintC0, singlecompanysession/memory, gatewaycap/egress, reviewerPASSFAIL/hash/maxrounds |
| Mũitên mộtchiều Marketing→CRM→Vậnhành→Service→Finance | Thểhiện Order/Payment cóthểtrước/sauDelivery; Refund riêng, outcomequaylạiMarketing, khôngsuy cashcuốichuỗi |
| Kếtnối/tiếpnhận | Phân ACKdurable, projection, assignment, ownerACK, firstresponse; ZaloACKtrướcpersist làgap |
| Kiếntrúcđích | Gắn sourcepartial/UNKNOWN/gateG0, không vẽkhối nhưđãlive; M1chặngđầu, Marketingvàcácmiềnkhác vẫn trongtoànhệ |

Không chỉnh ảnh gốc hoặc tạo “ảnh đã sửa đúng10điểm” khi thiếu nguồn đánh giá. Mermaid là nguồn kỹ thuật mới. Kiểm cấu trúc/links đã chạy qua packagechecker; **Mermaid parser/render NOT_RUN** vì chưa có thư viện sẵn, không cài thêm trong nhiệm vụ. GitHub có thể hiển thị bằng Mermaid khi đọc trongviewer phù hợp; không coi việc đặtfile là renderPASS.
