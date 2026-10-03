# Bản lưu kết quả đo
Ngày03/10/2026. SQL675/API/UI lưu kết quả quan sát bất biến theo thời điểm, chưa chứng nhận đã chốt đủ nguồn.

## Mục đích và hợp đồng
GET/POST /crm/marketing-trials/:trialId/measurement-snapshots?company_id=...; default-off VPT_MARKETING_MEASUREMENT_SNAPSHOT cùng VPT_MARKETING_TRIAL_REPORT và primary. Browser chỉ gửi requestId/contextVersion. Server tính bằng reportTrial hiện hành; không nhận số tiền, số khách hoặc completeness từ browser. Phạm vi là toàn bộ tài khoản Facebook đã khai của công ty và tập Lead Ads đã nhận/đối soát.

Bản lưu có phiên bản luật OBSERVED_TRIAL_REPORT_V1, cutoff ngày Việt Nam, asOf riêng với recordedAt, tiền/khách/chi phí tạm tính, spend run IDs, census run ID, export evidence IDs, digest identity/qualification/source/registry và danh sách thiếu theo tài khoản/Page/form/entrypoint. Status SAVED_OBSERVED_INCOMPLETE; không chứng minh đạt250k, 7% hoặc cho AI tăng chi. Các điểm nhận ngoài Lead Ads và provenance tài khoản/tệp vẫn là nghĩa vụ, không có checkbox để nâng lên COMPLETE.

## Đồng nhất và chống trùng
Private helper trial_facts SQL STABLE tách raw facts khỏi wrapper có khóa/quyền; ghép với export_context và export rows trong cùng SELECT. Hash set-valued facts không phụ thuộc thứ tự dòng của query plan. Time gates giữ ngày đã hoàn tất và ranh giới độ tươi, không hash đồng hồ từng giây.
Application Service tính report từ một lần prepare; append kiểm version hiện hành, dependencies, capture tối đa60giây, quyền và policy trước ghi, rồi kiểm lại sau append. Thay đổi commit sau statement snapshot được nhận diện ở lần đọc sau; không tuyên bố khóa mọi writer cũ.
Request id toàn cục; retry kiểm quyền hiện hành và trả receipt cũ trước đọc/tính lại. Command cố định là request/version, không dùng asOf mới để so replay. Một hàng riêng chứa command + report + digest + actor/time là bằng chứng/audit. UI lưu duy nhất mã yêu cầu/version theo actor/company/trial trong sessionStorage; quota lỗi chặn gửi. Mất phản hồi giữ yêu cầu cũ qua reload.
Lịch sử đọc20bản mới nhất, có trạng thái UNCHANGED_INPUTS/CHANGED_SINCE_CAPTURE/STALE_AUTHORITY tách khỏi số lịch sử; unchanged không có nghĩa đủ nguồn hoặc dữ liệu hiện tại đã đạt mục tiêu.

## Fingerprint và dữ liệu cá nhân
export_context V2 bỏ lease/attempt/retry và chỉ loại receipt được census hiện hành chứng minh ngoài kỳ, không có proof/envelope mâu thuẫn. Chưa rõ thời điểm, orphan hoặc conflict vẫn giữ. Digest của artifact674 đổi policy nên receipt cũ trở thành stale một lần; không sửa command/audit lịch sử.
Measurement source fingerprint dùng receipt liên quan, bỏ observations ngoài kỳ; bản lưu không giữ tổng receipt hay receipt ngoài kỳ. Giữ toàn identity/source history để phát hiện trùng/khách cũ. Qualification và một số metadata còn rộng/bảo thủ: thay đổi không liên quan trực tiếp có thể yêu cầu lưu lại; chưa phải fingerprint hoàn chỉnh cho final measurement close.
Raw identity/contact chỉ ở máy chủ khi tính, không persist lại. Bảng private lưu projection số liệu + evidence IDs/hashes; public history không có phone/email/name, group/member/lead IDs, raw proof, file bytes hoặc token. Không dẫn lịch sử tới hồ sơ đã chuyển công ty. Digest là dấu ràng buộc đầu vào, không phải bản sao để tái dựng liên hệ sau khi dữ liệu gốc đổi; report lịch sử không được tính lại bằng phiên bản luật mới.

## Kiểm chứng và phát hành
Local12ca unit/service/UI-state PASS. PostgreSQL cô lập đang kiểm11ca mới: positive1m/4 cùng toàn chi tài khoản, quyền/direct/broadgrant, đồng thời/replay, quality/spend thay đổi, cùng MVCC, lease/outsideperiod, late arrival sau compare trước append, capture hết hạn và thu hồi quyền. Migration áp dụng hai lần cùng chuỗi hiện có. Full build/browser/review cuối chờ kết quả đúng commit.
Không migration thật, Meta/CRM, gửi khách, chi quảng cáo hoặc phát hành. Hoàn tác bằng tắt flag measurement snapshot, giữ mọi bản lưu và audit. Nếu cần ngừng source export V2 thì tắt flag source export; không sửa migration cũ hoặc xóa evidence.

## Việc còn lại trong toàn mục tiêu
Hợp đồng chấp nhận provenance/phạm vi thực của từng tài khoản/điểm nhận; đối soát đủ nguồn và close có bằng chứng; các kênh khác, ngoại lệ vận hành/AI/lịch, UAT cùng phiên bản và Founder release vẫn chưa xong. Đây là kết quả quan sát có hồ sơ, không thay nghiệm thu vận hành. Full goal ACTIVE.

