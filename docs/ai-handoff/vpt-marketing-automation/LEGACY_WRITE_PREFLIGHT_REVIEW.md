# Bằng chứng kiểm đường ghi cũ — 03/10/2026

## Phiên bản được kiểm

- Runtime: `9cdfe7d4dfc1683ebd27d1014485ac36043f5ba7`.
- Tree: `af25883a2e57172ac657133aabdc3e48e61fa6e2`.
- [PR22](https://github.com/backen-pixel/Quanlycongviec/pull/22) vẫn nháp, chưa merge/phát hành.
- CI merge: `a620f9ce673fcb3fba6e7e103cce6bf03a7a6751`; Git API xác nhận tree bằng runtime và parents là base `e16c885ae7c2305645be02a1227bf378cb59137f` cùng runtime trên. Không suy kết quả từ tên nhánh.

## Bằng chứng thực thi

| Phạm vi | Kết quả | Bằng chứng |
|---|---|---|
| PostgreSQL16 intake/care/khảo sát | **258 PASS, 0 FAIL, 0 SKIP** | [Job111241789611](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546/job/111241789611) |
| PostgreSQL16 census + HTTP nguồn | **88/0/0 +1/0/0** | [Job111241789562](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546/job/111241789562) |
| Node22 regression/API/helpers | **843 +26 +33 PASS**, không fail/skip | [Job111241789581](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546/job/111241789581) |
| Node18 | SUCCESS | [Job111241789586](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546/job/111241789586) |
| Frontend build | SUCCESS;10.329 modules,29,54 giây | [Job111241789593](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546/job/111241789593) |
| Toàn workflow automation | Cả10job SUCCESS | [Run37136428546](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428546) |
| Report / Messenger regression | SUCCESS / SUCCESS | [Report37136428619](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428619), [Messenger37136428632](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37136428632) |

14 ca mới là subtest244–257 trong log intake: migration chạy hai lần, ACL/receipt không tiết lộ hồ sơ, inactive enrollment, inverse/shared Customer, intake chưa mapping, message-only hai chiều, Customer-only Lead Ads, comment-only, input sai/mất/quá rộng, chu trình/giới hạn đồ thị, enrollment commit trong lúc chờ khóa, trigger/mức cô lập, actual helper link/delete và không tạo permit.

Local26 ca mới kiểm helper/handler/creator thật với fake DB. Cùng recovery/intake integration43/43 PASS. Reviewer độc lập tự chạy43/43; đã khép P1 target xuất hiện sau tra số điện thoại và P2 bỏ sót lịch sử message/Lead Ads Customer. Reviewer độc lập xác nhận **PASS phạm vi preflight/SQL682 tại runtime9cdfe7d** sau đối chiếu4 blob trọng yếu, tree và trực tiếp đọc log CI trên; không còn finding chặn trong phần đã rà. Cutover toàn bộ vẫn HOLD.

Không có thay đổi UI trong gói này, không lặp browser để thay cho PostgreSQL. Bằng chứng browser SQL681 giữ phạm vi riêng trong [hồ sơ đối chiếu khách](CARE_CONNECTION_CONSOLE_REVIEW.md).

## Kết luận có giới hạn và bước tiếp

Phạm vi preflight SQL682 và các helper/caller đã kiểm đạt kiểm thử cô lập đúng phiên bản. **Chưa chứng nhận toàn bộ đường ghi cũ, cutover, UAT hoặc phát hành.** RPC kiểm tra tại thời điểm gọi, không giữ giao dịch qua các HTTP request. Trước enrollment phải kiểm danh sách caller, tác vụ theo nhóm đang chạy, dừng/chờ, đối soát và khôi phục. Target phát hiện sau preflight vẫn phải được kiểm tra trước ghi.

Không dùng gói này để mở Page, quyền AI, chi quảng cáo hoặc dữ liệu thật. Bản ứng dụng mới phụ thuộc SQL682 và các migration trước; không phát hành ứng dụng khi DB chưa có RPC. Hoàn tác trước release bằng gỡ nhánh thử; sau release cần gói Founder tương ứng, ưu tiên tắt đường mới và giữ lịch sử, không mở lại đường ghi không an toàn hoặc xóa giao dịch.

[Hợp đồng và phần còn thiếu](LEGACY_WRITE_PREFLIGHT.md). Full goal ACTIVE: còn chuyển caller/khôi phục, cấu hình AI/lịch/người nhận, đủ điểm nhận/phạm vi đo và UAT/Founder release.250.000đ/khách là mục tiêu, chưa có kết quả thực tế.
