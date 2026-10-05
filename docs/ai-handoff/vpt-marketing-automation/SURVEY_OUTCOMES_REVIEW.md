# Survey outcomes — bằng chứng kiểm chứng

## Phiên bản và phạm vi

Candidate cuối `44d80b17b5dc9a996a1c84268e728bbadaf89e46`, tree `1fddadce0f231e390502833a4e4a598e9491e89f`. Runtime được thêm tại57fb08b; hai follow-up chỉ sửa/bổ sung test và hồ sơ, không thay SQL/worker. [Contract và hoàn tác](SURVEY_OUTCOMES.md).

| Thành phần | Git blob |
|---|---|
| SQL669 | `db49181af9ec3aa9aef767e9b0d8fa6d8a920552` |
| Outcome worker | `35ec054b0e1f58e870a8616fd05e76a9ab463009` |
| PostgreSQL outcome cases | `8bc7fb68996199a1ca740d5b7eba303e6950778c` |
| Facebook route | `4b6756b873e6ccc0062d8424d4cd2da8b9e7e998` |

Đã đối chiếu blob công bố và staged tree cục bộ trước cập nhật branch không force. CI checkout `5d6c39075292eb1790493b36441040bdaf76ef95` có hai parent base`e16c885ae7c2305645be02a1227bf378cb59137f` và candidate`44d80b1`, cùng tree candidate.

## Kiểm thử

- [Automation37098387102](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37098387102): cả10 job SUCCESS.
- PostgreSQL16 job111132887854: **199 PASS,0 FAIL,0 SKIP**, gồm20 case outcome mới. SQL669 áp dụng hai lần, không backfill booking lịch sử.
- Node22 job111132887846: **618 PASS,0 FAIL,0 SKIP**. Local worker/parser51 PASS; reviewer tự chạy outcome14 và proposal13 PASS.
- Full frontend job111132887873:10310 modules,37.44 giây. Không đổi UI ở increment này; không dùng build để tuyên bố nghiệm thu giao diện hay Meta thật.
- [Report37098387061](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37098387061) và [Messenger37098387082](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37098387082): SUCCESS.

Positive path dùng worker/receiver thật với provider giả và webhook ký secret thử: đề xuất → khách xác nhận → booking/outbox → thông báo → own echo/ACK. Các case kiểm rollback cùng booking, bấm lặp, receipt sai/BLOCKED sau booking, không gửi âm tính cũ sau proposal mới, hết hạn proposal/roster sau booking, STOP/tiếp quản, lịch/mapping/quyền thay đổi, membership thu hồi khi chờ, hai claim cùng loại/khác loại, UNCERTAIN hai chiều, late ACK, echo replay/MID sai, credential, enrollment, broad grants và hồ sơ lỗi đầu hàng.

## Review độc lập

Reviewer `/root/architecture_v11_review` đọc mã và bằng chứng trong phiên riêng. Đã xử lý exact outcome ID binding, biến trigger tránh nhập nhằng và việc giữ intent trước enrollment ở HELD. Kết luận **PASS trong phạm vi SQL669** tại44d80b17b5dc9a996a1c84268e728bbadaf89e46 sau khi tự đọc CI cuối; không còn finding chặn. **Release HOLD** do chưa Meta/UAT và còn các phần vận hành nêu dưới.

Lịch sử kiểm chứng được giữ:57fb08b/CI37097932808 fail một fixture tái sử dụng optionId đã cũ;1647479/CI37098181276 fail assertion đòi không lưu intent khi STOP. Assertion cuối kiểm đúng yêu cầu không booking/không POST/STOP giữ nguyên/intent HELD. Không sửa runtime để bỏ audit hoặc nới kiểm soát. Không gọi hai lần CI cũ là PASS.

## Giới hạn và bước tiếp theo

Rủi ro HIGH vì liên quan liên hệ khách, phạm vi dữ liệu và lịch. Mặc định tắt, enrollment rỗng; chưa migration/Meta/UAT/phát hành thật, chưa có số đo CPQL thực tế. Còn UI đề xuất/ngoại lệ, hủy/đổi và writer lịch cũ, dữ liệu nội dung/nhân sự/lịch thật, hiệu năng/khôi phục, phạm vi nguồn và toàn bộ chi phí cùng kỳ. Theo ưu tiên Founder, tiếp tục đối soát khách–chi phí và chuẩn bị nghiệm thu Facebook→CRM→dashboard; chưa mở Google hoặc tăng chi tự động. Full goal ACTIVE.
