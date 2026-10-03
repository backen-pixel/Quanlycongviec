# Đối soát quảng cáo đã phân phối theo tài khoản

Ngày 03/10/2026. SQL676 bổ sung đầu vào còn thiếu để xác nhận phạm vi nguồn: danh sách quảng cáo theo ngày, tiền, lượt hiển thị và lượt nhấp. Dữ liệu được lưu cùng giao dịch với lần đối soát toàn bộ chi tài khoản; dashboard kỳ đo cho thấy các mã cần đối chiếu điểm nhận khách và mã có trong hồ sơ khách nhưng chưa thấy trong báo cáo phân phối.

## Phạm vi và nguồn

Collector dùng Insights `level=account` và `level=ad`, đọc daily/all_days, không lọc trạng thái quảng cáo hoặc chỉ lấy quảng cáo có Lead. Account daily/all_days được đọc trước và sau; ad daily được so với ad all_days và tổng account từng ngày cho cả tiền, hiển thị, nhấp. Quảng cáo chi bằng 0 vẫn được giữ. Đọc đủ trang, không trùng ad/day, không mất ID ở báo cáo tổng; mismatch hoặc thay đổi trong lúc đọc từ chối công bố lần đó.

Các trường và tham số dựa trên [SDK chính thức Meta: AdsInsights](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py) và [AdAccount.get_insights](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py). Đây là đối soát những báo cáo Meta trả về, không phải giao dịch snapshot tại Meta hoặc bằng chứng Meta không bỏ sót dữ liệu. Tổng bằng nhau không chứng minh toàn bộ điểm nhận khách; creative đọc hiện tại không chứng minh đích trong quá khứ.

Mỗi request dựng lại từ account/kỳ/version cố định, chỉ lấy cursor khớp từ paging. Không theo URL ngoài, không chuyển token qua query. Tối đa50 trang/5000 dòng mỗi báo cáo và20giây/request; lỗi giữ mã giới hạn, không lưu token hoặc nội dung upstream. Giới hạn này có thể cần chuyển sang async Insights khi nghiệm thu tải lớn; vượt giới hạn hiện trả thiếu dữ liệu, không cắt thầm.

## Lưu trữ và quyền

- `VPT_MARKETING_ACCOUNT_DELIVERY=1` chọn collector mới trong worker chi tiêu hiện có; còn cần `VPT_CERTIFIED_FACEBOOK_SPEND=1` và `VPT_META_GRAPH_VERSION`. Collector mới và spend run đều dùng khoảng ngày kết thúc hết hôm qua theo giờ Việt Nam, tránh biến động hôm nay làm hỏng đối soát ngày đã khép. Không công bố dữ liệu hôm nay trong khoảng này; collector cũ khi tắt flag giữ phạm vi trước đó. Mọi cờ tiếp tục mặc định tắt. Không có kết nối Meta mới trong quá trình triển khai.
- Bảng private `marketing_measurement.account_delivery_evidence` gắn một lần với spend run, có payload và digest tính trong DB. Wrapper `marketing_spend_finish` kiểm lại account/công ty/quyền trước cả retry. Validator tiền cũ giữ riêng và có kiểm role bên trong; browser không được quyền ghi.
- SQL kiểm số nguyên, khoảng ngày, duplicate/metadata conflict, tổng ad/day và witness counts. Collector chịu trách nhiệm bằng chứng những request đã đọc; service_role là ranh giới tin cậy, không phải chữ ký mật mã từ Meta.
- Lưu tiền và witness cùng giao dịch, retry cùng nội dung trả cùng kết quả; đổi/bỏ witness của run đã hoàn tất bị từ chối. Lỗi append làm cả tiền và witness rollback. Lần chạy mới lỗi không dùng lại danh sách ad cũ.
- `trial_facts` đọc spend và witness trong cùng snapshot. Projection chỉ trả mã ad/adset/campaign, tiền/count, thời điểm và digest; không trả contact/raw nguồn/token. Toàn bộ tiền tài khoản vẫn giữ, kể cả tài khoản không tạo khách. Mã ad ở source proof trong kỳ nhưng thiếu ở delivery trở thành ngoại lệ; không bị xóa khỏi hồ sơ.

## Hợp đồng kế tiếp: chấp nhận phạm vi để tính CPQL

Không thêm một lớp snapshot nữa. Dùng delivery witness này cùng registry và source exports đã có để tạo `measurement_scope_acceptances` append-only và trả phép đo ngay khi đủ điều kiện:

1. Phạm vi gồm mọi tài khoản trong kỳ; hợp các ad/day có trong delivery và ad đã biết từ proof. Mỗi ad phải có bản kê mọi đích từng dùng theo khoảng hiệu lực; creative hiện tại không thay lịch sử. Không suy không có điểm nhận từ tiền hoặc khách bằng0.
2. Mỗi form/điểm nhận có bằng chứng ID/time đúng kỳ, đối soát hai chiều với census/receipt/CRM; không chấp nhận unknown, orphan, lọc thiếu, trùng hoặc same-count/different-ID. Điểm nhận chưa có connector không được bỏ khỏi mẫu số.
3. Người được giao quyền xác nhận nguồn tài liệu, bộ lọc xuất, phạm vi lưu trữ và đích lịch sử, gắn đúng artifact hash/phiên bản/kỳ. Đây là trách nhiệm nghiệp vụ minh bạch, không gọi là chứng thực tự động từ Meta. Không nhận `complete`, tiền/số khách/CPQL từ browser.
4. Server tải lại bằng chứng, kiểm quyền, exact dependencies, dedup và qualification hiện hành rồi tính toàn bộ chi tài khoản / khách hợp lệ duy nhất thuộc phạm vi được chấp nhận. Receipt ghi rõ `QUALIFIED_SCOPE_CPQL`, cutoff/asOf và giả định đã chấp nhận. Không suy thành toàn đợt đa kênh khi kênh khác chưa tích hợp; `allowBudgetExecution=false`.
5. `ACCEPT|REVOKE`, retry nguyên yêu cầu, current authority và stale khi evidence/đích/spend/Lead/identity/qualification đổi. Receipt lịch sử giữ nguyên. Nghiệm thu phải có1triệu/4=250k, account zero-Lead, zero-spend ad bị thiếu, đổi đích trong kỳ, thiếu form, tệp lọc thiếu, late receipt và replay đồng thời.

Đây là hợp đồng kỹ thuật cho phần còn phải triển khai, chưa là quyết định Founder chấp nhận nguồn thực tế hoặc gói phát hành. Full CPQL hiện vẫn chưa đủ căn cứ; AI/các nguồn khác/ngoại lệ lịch và UAT vẫn còn trong mục tiêu chung.

## Kiểm thử, phát hành và hoàn tác

Candidate97a9a2f: automation37117220621 cả10job/build SUCCESS, report37117220587 và Messenger37117220591 SUCCESS. Reviewer chạy độc lập90PASS nhưng tìm paging sai kiểu bị hiểu nhầm là hết trang; đã sửa và thêm6regression. Đồng thời collector mới chốt đến hết hôm qua với ca kiểm lúc qua nửa đêm Việt Nam. Local24ca mới,103ca liên quan PASS. Follow-up còn cần CI/review đúng phiên bản cuối.

Bộ PG nối collector thật với API giả qua spend RPC và trial projection, kiểm quyền/broad grant, atomicity, duplicate/concurrent retry, invalid data, quyền bị thu hồi và coherent spend/witness khi run mới commit giữa lúc đọc. Không dùng test giả để thay UAT Meta thật. UI là phần hiển thị chỉ đọc, đã qua full build; chưa nghiệm thu tài khoản hoặc trang vận hành thật.

Hoàn tác: tắt flag delivery để dừng thu mới, giữ bằng chứng cũ; dashboard tiếp tục thể hiện thiếu witness ở lần chi tiêu mới nếu chỉ dùng collector cũ. Có thể tắt cả certified spend nếu cần ngừng đường mới. Không xóa tiền, lịch sử, khách hoặc mở quyền DB cũ. Chưa merge/migration thật/Meta send/ad change/trial activation.
