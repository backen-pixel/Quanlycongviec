# Đối soát bản xuất nguồn

SQL675 bổ sung `SOURCE_EXPORT_BUSINESS_CONTEXT_V2`: bỏ nhiễu lease/retry và receipt được census hiện hành chứng minh ngoài kỳ không có mâu thuẫn. Các receipt674 dùng version cũ cần đối soát lại một lần; lịch sử giữ nguyên. Phần mô tả fingerprint toàn hàng ở dưới ghi hiện trạng674 trước thay đổi này. [Bản lưu phép đo và giới hạn675](MEASUREMENT_SNAPSHOT.md).

SQL674 nối witness672 vào cùng snapshot inventory dùng bởi trial/source export; bổ sung digest tuple(Page, form, leadgen ID, thời điểm epoch) đúng kỳ đo. Không thay digest traversal toàn kỳ khôi phục. Người vận hành có thể so tệp nguồn với tập đã quét và giữ bằng chứng bất biến để chuẩn bị chốt kỳ đo.

## Giao tiếp và ranh giới

`GET/POST /crm/marketing-trials/:trialId/source-exports?company_id=...`, default-off `VPT_MARKETING_SOURCE_EXPORT=1` cùng flag trial report và primary. Actor từ phiên; SQL kiểm explicit service_role + quyền công ty/tenant hiện hành. Schema/table/helper riêng không cấp đọc/ghi trực tiếp.

POST nhận requestId, contextVersion, Page/form đã khai trong registry, fileBase64, delimiter (phẩy/chấm phẩy/tab), columns(id,createdAt,formId hoặc null), exportedAt có offset, sourceReference và sourceNote ghi phạm vi/bộ lọc. Dùng UTF-8 hoặc UTF-16LE có BOM, tối đa1MiB/5.000dòng/200cột. Tệp1MiB mã hóa base64 và metadata nằm dưới HTTP JSON limit2MiB hiện có. Thời điểm dòng phải là ISO có offset; mã luôn là chuỗi chữ số, không phục hồi mã đã bị Excel làm mất chính xác. Không tự tải tệp từ URL/tham chiếu.

Server giải mã bytes và tự tính SHA256 tệp gốc; parse quoting/newline/escaped quote và kiểm header/chiều rộng/cột. Chỉ các cột ID/form/time được đưa vào lệnh DB; tên/liên hệ/cột dư không lưu vào bảng bằng chứng. Raw file chỉ xử lý trong request, không ghi ra disk hoặc sessionStorage. Phải dùng chính tệp đã xuất để hash có ý nghĩa; hash không chứng thực ai tạo tệp hoặc tệp không có bộ lọc. Nếu form column trống, form chỉ là phạm vi do người vận hành khai.

SQL kiểm lại lệnh/rows, không tin parser UI; tính normalizedRowsDigest riêng từ ID/form/epoch, gồm duplicate và dòng ngoài kỳ. Kỳ là nửa mở [since,until) theo mốc ngày Việt Nam của census. Ngoài kỳ được đếm riêng. Giữ mọi dòng cho ID thuộc tập xuất trong kỳ hoặc tập đã quét trong kỳ: ID cùng Page nhưng khác form/time là conflict, kể cả timestamp bên kia vượt cutoff. Trùng cùng ID được báo, không âm thầm gộp rồi coi khớp.

Status MATCHED_EXPORTED_IDS chỉ là khớp tập trong tệp với tập quan sát; DUPLICATE_ROWS/DISCREPANCIES/EMPTY_COMPARISON giữ nghĩa riêng. Tệp chỉ có header không chứng minh formzero; form chưa xuất không được ngầm coi đã xuất rỗng. Tệp broader range có outsidePeriodRows; mọi metadata/bộ lọc do người cung cấp vẫn là khai báo. `providerCoverage=UNVERIFIED`, `allowBudgetExecution=false`, full CPQL chưa được mở.

## Bằng chứng, lịch sử và thay đổi nguồn

Một hàng append-only là cả lệnh đã chuẩn hóa, audit, người/phạm vi, hash tệp, hash tập dòng, cutoff, censusRunId, registryDigest, pagesDigest, kết quả và tối đa100 khác biệt (counts đầy đủ). Lưu dưới quyền Application Service; chưa cho AI gửi lệnh này. Không sửa dòng cũ khi có tệp mới.

contextVersion lấy registry+census+witness+digest receipt/source cùng một SELECT STABLE. Receipt mới ở form cũ hoặc nguồn/receipt đổi làm trạng thái hiện hành cần đối soát lại. Kiểm trước ghi và cuối transaction; khóa trial/registry hiện có. Không tuyên bố khóa phantom của mọi legacy writer; một thay đổi commit sau snapshot được phát hiện ở lần đọc kế tiếp. Đây là version nguồn, chưa là version identity/qualification/spend để chốt CPQL.

Digest receipt/source hiện bao gồm mọi hàng của công ty và cả trạng thái xử lý kỹ thuật. Vì vậy khách ngoài kỳ hoặc lease thay đổi cũng có thể yêu cầu rà lại; đây là invalidation bảo thủ cho cầu nối đối soát. Trước close cuối phải giới hạn fingerprint vào dữ liệu nghiệp vụ liên quan đến kỳ và các hồ sơ chưa rõ thời điểm, không dùng nhiễu retry làm thay đổi kết luận lịch sử.

Request ID toàn cục, compare người/công ty/kỳ/toàn bộ command khi retry; hiện hành phải còn quyền. Exact replay trả thời điểm/kết quả lịch sử cũ, không làm mới chứng cứ; sau thay cấu hình vẫn đọc trạng thái CURRENT/STALE_CONTEXT/STALE_AUTHORITY riêng. Thay nhân sự không sửa lịch sử. Không dùng TTL6h để xóa kết quả đã ghi.

UI lưu request metadata + hash theo actor/company/trial trong sessionStorage trước POST; không lưu nội dung tệp. Mất phản hồi hoặc reload cần chọn lại cùng bytes, giữ request/context/metadata cũ. Đổi scope hủy hiệu lực phản hồi cũ. Xóa summary trước POST/read và khi lỗi; success hiển thị biên nhận lịch sử, cần tải lại để xem trạng thái hiện hành. Storage lỗi chặn POST trước gửi.

## Kiểm thử và triển khai

Runtime920e66bc đã qua review độc lập PASS; local24, PostgreSQL60 và HTTP1 đều không fail/skip; Node22 745 và cả10job/build thành công. Unit parser/service kiểm bytes/hash, UTF-16LE, quoting, long IDs, timezone, precision loss, duplicate, empty, bounds, quyền/primary và response sai scope. PostgreSQL cô lập kiểm migration hai lần, quyền kể cả broad grant, measured/traversal cutoff, same-count/different-ID, form/time conflict, duplicate/cutoff, empty, concurrent retry, current permissions, late receipt và scope đổi khi đợi khóa. Browser chỉ dữ liệu giả; chưa nghiệm thu tệp từ tài khoản thật hoặc toàn trang production. [Bằng chứng đúng phiên bản](SOURCE_EXPORT_REVIEW.md).

Không migrate/đọc Meta thật, không gửi khách, không bật chi/phát hành. Hoàn tác bằng tắt flag source export, giữ evidence/audit và tất cả giao dịch CRM. Không drop hoặc đổi quyền cũ.

Tiếp theo trong full goal: xác minh provenance/phạm vi tệp thực, điểm nhận khác và spend; bản chốt theo declared scope với identity/qualification/spend asOf cùng dependency digest; thao tác vận hành chưa hoàn tất, UAT và Founder release. Chưa tuyên bố đủ nguồn, đạt250.000đ/khách hoặc hoàn thành toàn hệ thống.
