# Kích hoạt tuyến Facebook Form → CRM → Admin Vạn Phú Thành

## Đối soát khoảng chuyển App — 06/10/2026 (chưa chạy production)

PR38 đã đưa bước xác minh GET của callback Lead riêng lên backend khi cờ nhận Lead còn tắt. **Đây chỉ là khả năng xác minh callback, không chứng minh App đã nhận Lead thật.** Tại thời điểm bổ sung hồ sơ này, App `claw` của VPT chưa thêm Webhooks/cấp Lead Access và chưa có sự kiện thực đi vào CRM; các cờ intake vẫn tắt, worker tạm dừng. Backup đồng bộ theo lịch đang lỗi; `/api/health` cho thấy Redis `disabled`, hàng chờ đồng bộ đang ở bộ nhớ và đã tăng tới 652 việc, 39 việc lỗi tại lượt kiểm tra. Deploy lúc này có thể làm mất các việc chưa chuyển sang Backup. Việc bật production tiếp tục **HOLD** cho đến khi xử lý/đối soát hàng chờ, chứng minh đường sao lưu và khôi phục, rồi kiểm tra đúng cấu hình, quyền và số liệu thật. Các số hàng chờ là ảnh chụp tại thời điểm kiểm, không phải số hiện tại liên tục.

Có một khoảng chuyển không thể làm nguyên tử giữa cấu hình Meta và Render: nếu bật `VPT_FB_LEAD_APP_MODE=1` trước khi App Lead mới được Page đăng ký `leadgen`, callback Messenger cũ sẽ trả ACK nhưng lọc sự kiện Lead của Page VPT. Không thể dùng xác minh GET hoặc một webhook thử từ bảng điều khiển Meta để kết luận khoảng này không mất khách.

Đã thêm **công cụ đối soát thủ công, mặc định chỉ xem trước** tại `backend/scripts/reconcile-facebook-lead-cutover.js`. Công cụ dùng token Graph của App Lead để liệt kê *mọi trang* biểu mẫu của Page, rồi liệt kê *mọi trang* Lead của từng biểu mẫu; chỉ lấy ID, form, thời điểm và ad ID trong cửa sổ UTC `T0–T1`. Danh mục form **và số Lead theo từng form** lấy từ Graph phải khớp đúng số do người vận hành ghi độc lập. Mỗi Lead được phân loại thành: đã có receipt SQL702, đã có Lead cũ liên kết đúng Page/form/CRM, hoặc còn thiếu. Sai lệch liên kết thì dừng; chỉ nhóm còn thiếu được ghi vào **cùng Primary inbox SQL701** khi có `--apply` và xác nhận lại đúng Page. Công cụ đọc lại từng lô để đối soát; không tạo Lead trực tiếp, không giả chữ ký webhook Meta, không dùng Page token Messenger làm đường dự phòng. Hai bản ghi webhook và phục hồi của cùng một Lead có thể có `event_key` khác nhau; **receipt bất biến duy nhất theo `leadgen_id` của SQL702** là chốt chống tạo trùng CRM. Không có lịch tự chạy hoặc HTTP endpoint cho công cụ này.

Công cụ yêu cầu cấu hình `VPT_FB_LEAD_APP_ID` theo **App Lead được chọn và kiểm chứng riêng**; chưa mặc định App nào. Nó gọi `/debug_token` bằng App ID/Secret riêng, đòi token hợp lệ, do đúng App cấp, loại Page, đúng Page ID và có `leads_retrieval`. Cả hai credential được gửi ngoài URL; nếu Meta không chấp nhận POST body cho endpoint này hoặc không trả đủ metadata thì lệnh dừng, **không chuyển sang URL chứa token**. Cần chứng minh transport này trên App thật trước khi dùng. Quá trình đọc/ghi yêu cầu Redis chia sẻ xác nhận `supabase:active_target=primary`, Primary probe khỏe và router cục bộ ở Primary; vì Redis production hiện `disabled`, công cụ sẽ dừng. Redis và cờ trên tiến trình lệnh vẫn không chứng minh tất cả instance Render đã tạm dừng/fence: người vận hành phải xác minh các instance bên ngoài và đóng băng thao tác đổi DB trong khoảng cutover.

**Trường hợp Redis đã chạy nhưng thiếu khóa `supabase:active_target`: STOP.** Router của một tiến trình mới mặc định hiển thị `primary`; đó không phải bằng chứng các tiến trình đang chạy cùng chọn Primary. `setActiveTarget('primary')` khi tiến trình đã ở Primary trả về ngay, nên gọi API switch sang Primary không tạo khóa còn thiếu. Không chuyển tạm sang Backup chỉ để tạo khóa. Công cụ đối soát không tự ghi Redis. Việc khởi tạo khóa, nếu cần, là một thay đổi vận hành riêng: trước đó phải có bằng chứng Redis bền vững/sẵn sàng, mọi instance đã được nhận diện và xác nhận Primary qua trạng thái riêng của từng instance cùng kiểm tra DB độc lập, auto-failover và thao tác đổi DB đã khóa, hàng đợi đồng bộ Backup được xử lý/đối soát và phương án khôi phục đạt. Sau khi người có thẩm quyền duyệt, một thao tác khởi tạo có audit chỉ được đặt `primary` **nếu khóa vẫn vắng mặt** (điều kiện nguyên tử kiểu `SET ... NX`); đọc lại từ cùng Redis và xác nhận mọi instance đồng thuận trước khi chạy lệnh xem trước. Nếu không chứng minh được một điều kiện, giữ HOLD; giá trị `primary` do một tiến trình tự suy ra không đủ để mở cổng.

Quy trình chỉ được dùng sau khi App/Lead Access và nguồn Graph thật đã được kiểm chứng:

1. Ghi `T0` UTC **trước** thao tác chuyển, có khoảng chồng lấn với lúc callback cũ còn hoạt động. Lưu danh mục tất cả form của Page, kể cả form cũ/còn Lead cần đối soát, từ Meta/Ads Manager độc lập với kết quả API. Giữ worker `VPT_FB_PAGE_INBOX_WORKER_PAUSED=1`, binding form chưa hoạt động, chỉ Primary nhận ghi, auto failover tắt. Đọc khóa Redis `supabase:active_target` thực tế; nếu vắng hoặc khác `primary`, dừng và xử lý cổng khởi tạo ở trên trước mọi lượt preview/apply. Lưu bằng chứng trạng thái Primary của **từng** instance, không chỉ một phản hồi qua load balancer.
2. Xác minh callback App mới, quyền đọc Lead/form, Lead Access và đăng ký `leadgen` đúng Page. Khi chuyển cờ Render và Meta, giữ worker/binding tắt, ghi thời điểm thao tác và trạng thái lỗi. Nhận một Lead thật trên App mới rồi ghi `T1` UTC sau thời điểm đó. Không dùng khách thật để tạo thử ngoài phạm vi đã duyệt.
3. Đối chiếu ID Page ở Meta, cấu hình `facebook_pages` và Page đã gắn form; không chọn chỉ theo tên Page. Chạy xem trước từ backend đã có quyền, ví dụ `node scripts/reconcile-facebook-lead-cutover.js --page=<PAGE_ID_DA_XAC_MINH> --from=<T0-UTC> --to=<T1-UTC> --forms=<ID1,ID2> --counts=<ID1:SO_LEAD,ID2:SO_LEAD>`. Lấy các số theo từng form từ báo cáo/CSV Meta **độc lập** với lượt đọc Graph của lệnh. Kiểm Lead cũ đã lưu trong `facebook_lead_ads`; nhóm `legacyLinkedCount` phải được rà người nhận và công ty trước khi qua cổng. Nếu danh mục, quyền, phân trang hoặc số lượng không rõ thì **STOP**, không coi kết quả 0 là bằng chứng không có Lead. Nếu Meta thay tổng số trong lúc quét, lượt này dừng và cần chốt cửa sổ/đọc lại.
4. Khi các số khớp và đã chứng minh bản cũ không còn ghi Lead của Page quản lý (`VPT_FB_LEAD_APP_MODE=1`, `VPT_FB_LEAD_ADS_INTAKE=1` trên **mọi instance** đang chạy), chạy lại lệnh trên với `--apply --confirm-page=<CUNG_PAGE_ID_DA_XAC_MINH>`. Công cụ cũng kiểm hai cờ này trong phiên lệnh; riêng kiểm cờ cục bộ không thay kiểm mọi instance Render. Mỗi hàng hồi phục phải còn `pending` sau ghi/đọc lại; hàng `done` mà thiếu receipt là xung đột, không được tính là đã tiếp nhận thành công. Kiểm số `graphLeadCount = receiptCount + legacyLinkedCount + inboxConfirmedCount`; đối chiếu từng Lead ID giữa Meta, inbox/receipt và hồ sơ cũ. Lệnh có thể ghi một số lô rồi gặp lỗi: giữ nguyên hàng đợi và chạy lại cùng cửa sổ sau khi sửa lỗi, không xóa hay mở worker để bỏ qua phần chưa đối soát.
5. Chỉ khi toàn bộ Lead trong khoảng `T0–T1` đã có đường nhận và bản sao/khôi phục đạt cổng vận hành mới mở binding và worker. Xác nhận một Lead thật tạo đúng một CRM Lead giao Admin VPT và Messenger vẫn nhận tin. Nếu còn Lead pending/error hoặc một form không truy được, giữ HOLD và xử lý ngoại lệ trước khi tuyên bố chạy thật.

Giới hạn cần ghi nhận: API có thể không trả form/Lead vì quyền, giới hạn lưu giữ hoặc dữ liệu nguồn; công cụ không tự chứng minh Meta đã trả *đủ* bằng một mảng rỗng. Phải so với danh mục form và tổng Lead từ nguồn độc lập. Tài liệu Meta SDK xác nhận cạnh [`Page.get_lead_gen_forms`](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py) và [`LeadgenForm.get_leads`](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/leadgenform.py); khả năng đọc trên chính App VPT vẫn phải kiểm thực tế.

---

## Bản mã App Lead riêng — 15:45 ngày 06/10/2026 (UTC+7)

Đã chuẩn bị mã **opt-in, mặc định tắt** cho callback Lead Ads riêng `/api/facebook/webhook/lead-ads`. POST chỉ nhận lô `leadgen` của đúng Page quản lý khi chữ ký SHA-256 khớp App Secret riêng; xác nhận HTTP 200 sau khi Primary ghi bền vững toàn bộ lô. Worker dùng token Graph riêng của App Lead để đọc form và Lead, không dùng Page token Messenger làm phương án dự phòng. Callback Messenger hiện tại tiếp tục nhận tin/bình luận theo cách cũ; ở chế độ App riêng, nó bỏ qua `leadgen` của Page quản lý để tránh hai writer. Nếu thiếu khóa, token, Page hoặc các cờ kiểm soát, cấu hình App riêng không khởi động.

Kiểm thử mã cục bộ: **131/131** ca dedicated/scoped/intake và **79/79** ca inbox, Primary, Messenger, recovery và quyền đọc liên quan đạt; kiểm tra cú pháp và diff đạt. Reviewer độc lập kết luận **PASS mã opt-in, HOLD kích hoạt production**. Bài SQL dùng PGlite chưa chạy trong phiên cục bộ vì thiếu package `@electric-sql/pglite`; CI PostgreSQL/SQL trước đó là bằng chứng của PR29, chưa phải CI cho bản mã App riêng này. Không có thay đổi Meta, Render hoặc DB thật trong lượt chuẩn bị này.

**Cổng chuyển đổi không rơi Lead:** trước khi bật `VPT_FB_LEAD_APP_MODE=1`, phải chứng minh App Lead VPT đã phát hành và được Meta cho nhận dữ liệu thật, có quyền đọc Lead/form, được cấp Lead Access, cấu hình callback và đăng ký `leadgen` ở App lẫn Page; token riêng đọc được Lead thật. Sau đó mới phát hành bản mã đã qua CI, cấu hình khóa/Graph/receiver trong trạng thái worker tạm dừng, kiểm chứng sự kiện Meta thật vào hàng đợi mới và chỉ mở binding/worker khi đúng Admin VPT. Bật cờ quá sớm sẽ làm callback Messenger cũ ACK rồi bỏ qua `leadgen` managed, có nguy cơ mất khách nếu App Lead mới chưa nhận production. Nếu chưa chứng minh được nhận thật và đối soát trong lúc chuyển, giữ cờ OFF và không gọi đây là đã chạy thật.

---

## Chuẩn bị đường App Lead riêng — 15:11 ngày 06/10/2026 (UTC+7)

Do Meta không cho gửi yêu cầu quyền tới App cũ từ tài khoản đang kết nối, đang chuẩn bị **phương án kỹ thuật dự phòng** tách callback và Page token Lead khỏi Messenger; đây chưa phải quyết định bật App hay phát hành mã. Mã được giữ opt-in/tắt mặc định và phải qua kiểm thử, review độc lập, quyền Meta thực và nghiệm thu một Lead thật trước khi dùng.

Đọc lại App `openclaw` ID `1705265440564477` trong Meta for Developers: Business VPT là chủ sở hữu, use case Lead Capture có `leads_retrieval` và `pages_manage_metadata` ở trạng thái **Sẵn sàng thử nghiệm**. App chưa phát hành; Meta ghi rõ App chưa phát hành chỉ nhận webhook thử từ bảng điều khiển, **không nhận dữ liệu sản xuất kể cả từ admin/developer/tester**. Webhooks → Page còn trống callback/verify token và `leadgen` ghi `Đã hủy đăng ký`. Vì vậy App này là ứng viên cần cấu hình/xét điều kiện phát hành, **chưa đạt cổng nhận khách thật**. Không điền callback, đăng App, cấp quyền hoặc lấy secret/token trong lần đọc này.

App VPT `claw` ID `1018343553916673` đang ở chế độ Chính thức nhưng dashboard chỉ có Marketing API; Webhooks còn ở mục sản phẩm có thể thêm. Chế độ Chính thức của App khác không thay thế các quyền và đăng ký `leadgen` còn thiếu. Chưa chọn App nào làm App Lead chính thức.

**Cổng Meta PASS cho App Lead riêng:** xác nhận App nhận dữ liệu thật với đúng mức quyền trên chính App; cấp quyền Lead của Page cho App/tài khoản vận hành; xác minh callback riêng và đăng ký `leadgen` ở App **và** Page; dùng token do App đó phát hành để đọc được một Lead/form thật; cuối cùng chứng minh một sự kiện thật tạo đúng một CRM Lead giao Admin VPT, trong khi Messenger vẫn nhận tin. Webhook thử trong Meta Dashboard không thay thế Lead thật. Tham chiếu: [mẫu Lead Ads Webhook của Meta](https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Lead%20Ads%20%28Part%201%20-%20The%20Webhook%29.postman_collection.json), [Meta Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/).

---

## Yêu cầu quyền App bị Meta từ chối — 14:58 ngày 06/10/2026 (UTC+7)

Founder đã cho phép gửi yêu cầu quyền đối với App `TUBEPPROvpt` ID `1510572057396042`. Trong Meta Business Settings của VPT (`815284983995477`), mục Yêu cầu không có yêu cầu đang chờ hoặc đã gửi. Hai yêu cầu cấp token đã hoàn tất cùng ngày chỉ dành cho App `quảng cáo chatgpt` ID `1091530493474987` với quyền `ads_read`; đó không phải quyền đọc Lead form. Danh sách App của Business hiện có `quảng cáo chatgpt`, `claw`, `openclaw`, không có `TUBEPPROvpt`.

Đã chọn **Yêu cầu quyền truy cập ứng dụng** và nhập đúng ID `1510572057396042`. Sau khi Founder xác nhận riêng hành động gửi, Meta trả lỗi: “ID ứng dụng không hợp lệ. Bạn chỉ có thể yêu cầu truy cập vào ứng dụng mà doanh nghiệp khác hoặc chính bạn sở hữu.” Mở lại tab **Đã gửi** sau lỗi, Meta ghi `No sent requests`; **yêu cầu không được gửi cho chủ App.** Kiểm tra tùy chọn **Kết nối ID ứng dụng** chỉ hiển thị hai App do tài khoản hiện tại sở hữu (`Page VPT` `1013948145020997`, `Quangcao` `1647248110253999`); không chọn/kết nối App nào. Chưa xác định App `TUBEPPROvpt` thuộc ai hoặc vì sao Meta không chấp nhận yêu cầu; không coi App đã bị xóa.

Đường xử lý tiếp theo là dùng tài khoản thực sự quản trị `TUBEPPROvpt` để kiểm quyền, callback và cấp đúng phạm vi; nếu không có quyền sở hữu, tách một App Lead riêng do VPT quản lý. Phương án App riêng cần thay mã và kiểm thử độc lập như phần 14:36, không thể chỉ đổi cấu hình/secret vì Messenger đang dùng một callback ký hiện tại. **Intake mới vẫn tắt; không đổi Meta, Render hoặc DB sau lỗi này.**

---

## Cổng App còn thiếu — 14:36 ngày 06/10/2026 (UTC+7)

Đã kiểm tra thêm hồ sơ Chrome `vanphuthanh.net` bằng URL trực tiếp tới App `TUBEPPROvpt` `1510572057396042`: Meta yêu cầu đăng nhập Facebook; đã để tab tại bước đăng nhập cho Founder dùng tài khoản có quyền App. Hồ sơ Chrome Meta hiện đang kết nối không thấy App này kể cả khi mở trực tiếp và xem danh sách lưu trữ. **Chưa có bằng chứng tài khoản nào quản trị App phát hành Page token; không bật Lead intake chỉ vì xác minh bảo mật tài khoản đã xong.**

Nếu không thể quản trị App liên quan, có thể dùng một App VPT riêng cho Lead Ads, nhưng mã hiện tại **chưa hỗ trợ an toàn hai App trên cùng callback**: route xác minh toàn bộ POST bằng một `VPT_FACEBOOK_APP_SECRET`, còn worker đọc Lead bằng token Page Messenger thiếu quyền Lead. Phương án thay thế cần callback GET/POST và App Secret riêng cho `leadgen`, token đọc Lead riêng, giữ nguyên tuyến Messenger, chặn hai callback cùng tạo một Lead và kiểm thử ký, trùng sự kiện, khởi động lại, quyền Page/form. Chỉ mở tuyến sau khi App mới được cấp quyền thực tế, đăng ký đúng Page và một sự kiện Meta tạo đúng một Lead giao Admin VPT trong khi Messenger tiếp tục nhận được tin. **Đây là phương án dự phòng đã khảo sát, chưa sửa mã hoặc cấu hình thật.**

---

## Xác minh App phát hành token — 14:26 ngày 06/10/2026 (UTC+7)

**Founder đã hoàn tất xác minh bảo mật trên đúng phiên Chrome. Intake mới vẫn tắt vì quyền Lead/App chưa đạt.**

- Business Lead Access cho Page Bếp Vạn Phú Thành đã mở được: có 2 người được chỉ định, tab CRM ghi **`Chưa chỉ định CRM nào`**. Hộp `Chỉ định CRM` không hiển thị ứng viên khi tìm `quảng cáo chatgpt` hoặc `openclaw`; không nhấn Xác nhận hay khôi phục quyền mặc định.
- Business Apps hiện liệt kê `quảng cáo chatgpt`, `claw`, `openclaw`. Mỗi App này đều ghi **`Bạn chưa kết nối tài sản nào`** ở tab tương ứng; điều đó chưa loại trừ App khác ở ngoài Business đang đăng ký webhook Page. System user `vptdocquangcao` chỉ được gắn Ad Account VPT 01 và App `quảng cáo chatgpt`, không thấy Page; `admin` có 3 Ad Accounts + Conversions API Application, còn `hung` chưa gắn tài sản.
- Từ Shell đúng backend, lấy token Page VPT từ Primary **chỉ trong bộ nhớ process**, gọi Graph `/debug_token` và chỉ xuất metadata. HTTP200 xác nhận token hợp lệ, loại `PAGE`, do App **`TUBEPPROvpt` ID `1510572057396042`** phát hành. Quyền hiện thấy: `pages_messaging`, `pages_utility_messaging`, `public_profile`; **không có `leads_retrieval` hoặc `pages_manage_metadata`**. Không xuất/ghi token ra tài liệu hoặc log. URL App này mở trong Meta Developers của tài khoản đang kết nối thì chuyển về danh sách 5 App khác, không thấy `TUBEPPROvpt` để quản trị. Đã nhờ Founder kết nối tài khoản có quyền quản trị App này.
- Cần phân biệt App phát hành Page token, App đăng ký Page `/subscribed_apps` và App có callback/secret ký webhook; token issuer **chưa chứng minh** cùng App đang nhận Messenger. Chưa thể đọc `/subscribed_apps` bằng token hiện có do thiếu `pages_manage_metadata`. Không đổi secret hoặc tự gắn App khác vì receiver mới kiểm một App Secret và có thể từ chối Messenger của App cũ.
- Đọc lại process hiện tại: `VPT_FB_PAGE_INBOX=0`, `VPT_FB_LEAD_ADS_INTAKE=0`, `VPT_FB_LEGACY_SCOPE_GUARD=0`, worker paused=`1`, managed Pages rỗng, chưa có `VPT_FACEBOOK_APP_SECRET` và `VPT_META_GRAPH_VERSION`. Không thay Meta, Render hoặc DB trong lượt kiểm này.

---

## Đối chiếu URL Founder gửi — 14:07 ngày 06/10/2026 (UTC+7)

Founder gửi `/latest/settings/mv4b?business_id=815284983995477`. Trong phiên Chrome đang kết nối, đường dẫn này mở mục **Meta đã xác minh** (gói/huy hiệu), không chứng minh phiên đã qua bước bảo mật tài khoản. Giao diện tiếp tục phủ `Cần xác minh`; sau khi chọn xác minh, Meta mở hộp **Xác nhận số điện thoại**. Codex dừng trước nút gửi SMS/mã và giữ tab để Founder hoàn tất trực tiếp. Chưa kết nối được tab/tài khoản khác mà Founder đã xác minh; chưa thay quyền hay cấu hình production.

---

## Đối chiếu phiên Meta — 13:56 ngày 06/10/2026 (UTC+7)

**Intake mới vẫn tắt.** Founder xác nhận đã làm bước xác minh, nhưng ở **một tab hoặc tài khoản khác**. Phiên Meta Business mà Codex đang kết nối vẫn hiện lớp `Cần xác minh` sau khi tải lại; hồ sơ Chrome VPT còn lại chuyển đến đăng nhập Facebook. Chưa thể coi quyền thao tác Lead của phiên đã xác minh là đã có trong phiên hiện tại. Đã nhờ Founder kết nối đúng tab đã xác minh; không yêu cầu gửi mã hay mật khẩu.

- Trong cấu hình Page VPT, tab tài sản kết nối chỉ hiển thị Instagram `vanphuthanhnet`. Đây không phải danh sách đầy đủ ứng dụng đăng ký webhook, nên chưa kết luận Page không có App khác.
- App `quảng cáo chatgpt` `1091530493474987` vẫn chỉ có Marketing API, ở chế độ Phát triển, chưa thấy Webhooks. App có Lead Capture use case `openclaw` `1705265440564477` cho biết `leads_retrieval` và `pages_manage_metadata` sẵn sàng thử nghiệm, nhưng tại Webhooks → Page, ô callback/verify token trống, nút lưu vô hiệu và trường `leadgen` ghi `Đã hủy đăng ký`. Đây chưa phải App đang nhận `leadgen` cho tuyến production.
- Tab CRM tại quyền Lead của Page vẫn chưa chỉ định CRM khi đọc ở phiên hiện có. Không cấp quyền, thay App/secret/token, bật cờ Render, mở binding hoặc worker trong lần đối chiếu này. Sau khi vào đúng phiên Meta, cần xác lập App thực sự sở hữu Page subscription và callback, kiểm quyền đọc form và chữ ký bằng đúng App Secret trước khi chuyển tuyến.

---

## Đối chiếu ảnh quyền Lead — 13:39 ngày 06/10/2026 (UTC+7)

**Chưa thể bật intake thật.** Ảnh Founder gửi là chi tiết quyền Lead của Page Bếp Vạn Phú Thành, không phải màn hình xác nhận điện thoại. Ở phiên Chrome mà Codex điều khiển, Meta vẫn phủ lớp `Cần xác minh`; không được suy từ ảnh rằng xác minh đã hoàn tất cho phiên này.

- Mở đúng URL/tài sản `2687298185022688` theo ảnh và đọc tab CRM: **`Chưa chỉ định CRM nào`**. Tab Mọi người trong ảnh có 0 người; khi đọc lại khoảng 13:39 hiển thị 2 người (Phú Vạn và Nguyễn Quốc Minh). Đây là trạng thái có thể đã thay đổi giữa hai lần chụp/đọc, không phải bằng chứng CRM đã được cấp quyền.
- Trong Business Settings, App `quảng cáo chatgpt` ID `1091530493474987` thuộc Công ty TNHH Bếp Vạn Phú Thành và có 2 người toàn quyền, gồm system user `vptdocquangcao`. Tab **Tài sản đã kết nối** của App ghi `Bạn chưa kết nối tài sản nào`.
- Mục **Ứng dụng đã kết nối** của Business ghi không có tiện ích tích hợp trong danh sách đó; giao diện nói có thể còn tích hợp ngoài danh sách. Hộp `Chỉ định CRM` cho tìm theo tên/ID; tìm đúng App ID `1091530493474987` không hiện ứng viên trong phiên này. Không nhấn Xác nhận hoặc cấp quyền.
- Vẫn cần xác lập đúng App phục vụ Lead Capture, kết nối Page, webhook `leadgen`, callback, App Secret và token có quyền đọc form trước khi mở đường production. Không khôi phục quyền truy cập mặc định vì thao tác đó mở rộng phạm vi đọc Lead cho các quản trị viên/CRM đã kết nối. Không đổi Meta hay Render trong lần đối chiếu này.

---

## Đối chiếu Meta sau khi Founder gửi App — 13:21 ngày 06/10/2026 (UTC+7)

- Founder gửi App ID `1091530493474987`, business `815284983995477`. Trên Meta for Developers của Chrome profile đang đăng nhập, đây là App **quảng cáo chatgpt**, liên kết tài khoản quảng cáo **VPT 01** `835757498658305`, nhưng đang ở **chế độ Phát triển**. Sản phẩm đã thêm chỉ có Marketing API; Webhooks còn ở danh sách sản phẩm có thể thêm, chưa có callback/đăng ký `leadgen` trong App này.
- Trang Marketing API Tools cho chọn `ads_management`, `ads_read`, `read_insights` rồi “Lấy mã”; giao diện báo thao tác sẽ thu hồi quyền đã cấp trước đây và cấp lại các quyền vừa chọn. Không nhấn lấy mã, không thay token hoặc mở rộng quyền quảng cáo khi mục tiêu hiện tại là tiếp nhận Lead form vào CRM.
- Trang Quyền và tính năng của App này liệt kê `pages_manage_metadata` và `leads_retrieval` ở trạng thái chưa yêu cầu xét duyệt; phép Graph bằng Page token hiện tại vẫn trả403 cho `subscribed_apps` và không đọc được form mục tiêu. Không coi App ID được cung cấp là bằng chứng App đã nhận webhook Page.
- Bốn App khác nhìn thấy trong cùng tài khoản: `openclaw` `1705265440564477` (Phát triển, có use case Lead Capture), `claw` `1018343553916673` (Chính thức, chỉ thêm Marketing API), `Quangcao` `1647248110253999` (Chính thức, chỉ thêm Marketing API), `Page VPT` `1013948145020997` (Phát triển, chưa thêm sản phẩm). Chưa thấy Webhooks đã cài trong các dashboard được xem; vẫn cần đối chiếu App nào hiện nhận sự kiện của Page từ cấu hình Meta/Page trước khi gắn khóa và bật receiver.
- Mở Business Settings đúng business VPT ở mục `Ứng dụng đã kết nối` cho thấy chưa có tiện ích tích hợp nào trong danh sách này, nhưng giao diện lưu ý một số tích hợp có thể nằm ngoài danh sách. Khi chuyển sang mục quyền Lead, Meta chặn bằng màn hình **Cần xác minh tài khoản**. Đã nhờ Founder xác minh trực tiếp; không thao tác thay, không suy danh sách rỗng chứng minh Page chưa có webhook.
- Không thay App, cấp quyền, lấy mã, bật cờ Render, mở binding hay worker trong lượt kiểm này.

---

## Kiểm tra tiếp — 13:11 ngày 06/10/2026 (UTC+7)

**Luồng Lead Ads mới vẫn tắt; chưa xác minh được ứng dụng Meta.**

- Kiểm tra chỉ tên biến trong Render Environment và process hiện hành của `tubep-backend`: không có biến Facebook Ads access token hoặc biến `ACCESS_TOKEN` chung. `VPT_FB_*` đang có là cờ chạy và danh sách Page; `SUPABASE_ACCESS_TOKEN` không phải token quảng cáo. Page access token có lưu riêng trong database, không xuất giá trị.
- Tab Meta for Developers trên Chrome Work đã đóng sau lần kiểm trước. Mở lại `https://developers.facebook.com/apps/` vẫn chuyển đến trang đăng nhập Facebook; chưa có phiên quản trị Meta. Đã để lại tab đăng nhập và nhờ Founder hoàn tất trực tiếp, không gửi mật khẩu qua chat.
- Repo sạch, không có sửa mã hay thay đổi cấu hình production trong lần kiểm này. Khi đăng nhập thành công, tiếp tục xác minh đúng App/callback/khóa ký/quyền Page và form trước khi bật receiver, binding và worker theo thứ tự bên dưới.

---

## Kiểm tra tiếp — Chrome Work đã kết nối, 06/10/2026 khoảng 11:07 (UTC+7)

**Đã giải quyết quyền truy cập Render. Điểm chặn hiện tại là cấu hình và quyền Meta, không còn là đăng nhập Render. Intake mới vẫn tắt.**

- Founder cung cấp ảnh đúng dịch vụ trên hồ sơ Chrome Work. Sau khi kết nối tiện ích, Codex thấy hồ sơ `vanphuthanh.net` và mở được Environment/Shell của đúng `srv-d6gguqq4d50c73emh20g`. Không yêu cầu đăng nhập lại Render.
- Đọc từ process Shell trên instance `c2brv`, commit `6494f870d756ba294f6d4fdbb64f4acba8483547`: `VPT_FACEBOOK_APP_SECRET` **chưa có**, `VPT_META_GRAPH_VERSION` **chưa có**; inbox/intake/guard đều `0`, worker paused=`1`, managed Page rỗng. Messenger Page=`409741855550833`, auto-failover=`0`. Chỉ in boolean và cấu hình không bí mật; không xuất token/secret.
- Phép GET Graph chỉ đọc dùng Page token đã lưu trên Primary, giữ token trong bộ nhớ process. Yêu cầu `v22.0` trả header phiên bản thực `v25.0`; lần kiểm riêng tiếp theo dùng `v25.0` trực tiếp. Đây là phiên bản thử đọc, **chưa được lưu vào cấu hình dịch vụ**.
- `GET /me?fields=id` trên v25 trả HTTP200, định danh khớp Page VPT. Vì vậy không kết luận token hết hạn hoặc thuộc Page khác.
- `GET /409741855550833/subscribed_apps?fields=id,subscribed_fields` trả HTTP403, Meta code200, thông báo nhắc `pages_manage_metadata`. Chưa đọc được App ID và đăng ký `leadgen`; chưa xác minh callback hoặc khóa ký.
- `GET /1438656288329447?fields=id,page_id` trả HTTP400, code100/subcode33. Token hiện tại không đọc được đối tượng này; lỗi chưa đủ phân biệt thiếu quyền, đối tượng không tồn tại hoặc giới hạn truy cập. Nhật ký giao diện ngày01/10 ghi đã tạo form, ngày05/10 ghi quảng cáo hoạt động; cần đối chiếu lại trong Meta bằng tài khoản quản trị, không tự sửa ID binding từ lỗi này.
- Một lệnh nhập nhiều dòng đầu tiên lỗi cú pháp trước khi thực thi; sau khi sửa cách xuống dòng, các phép GET trên mới thực chạy. Không có POST Graph, thay token, cấp quyền, đổi env, mở binding, gửi form TEST hoặc tạo Lead trong đợt kiểm này.
- Tab Meta for Developers trên chính Chrome Work yêu cầu đăng nhập Facebook. Đã mở sẵn và gửi yêu cầu Founder đăng nhập tài khoản quản trị ứng dụng VPT, không gửi mật khẩu/khóa vào chat. Sau đăng nhập: đối chiếu App/callback, bổ sung khóa ký và quyền Page/form đúng phạm vi, kiểm lại dữ liệu mẫu rồi mới thực hiện trình tự bật receiver/binding/worker đã review.

---

## Kiểm tra tiếp — 10:34 ngày 06/10/2026 (UTC+7)

**Intake mới vẫn chưa bật. Quyết định phát hành của Founder vẫn có hiệu lực.**

- Render hiện live commit `6494f870d756ba294f6d4fdbb64f4acba8483547`, deploy `dep-db25vnjtqb8s73c6ff9g` hoàn tất 02:42:47 UTC. Đây là thay đổi PR30 của người làm song song; so với merge PR29, chỉ bổ sung quyền đọc bình luận/thành viên cho người được giao việc. Các file Facebook, worker, router DB và SQL701/702 đã review không đổi.
- Đọc lại Primary lúc khoảng 03:26 UTC: binding còn `active=false, version=1`; Page và Admin active, cùng công ty; token Page có mặt (không đọc/xuất giá trị). Inbox/receipt mới đều 0, Messenger 93 receipt đều done. `/api/health` lúc 03:27:29 UTC: `ok`, Primary khỏe, active Primary, auto-failover tắt. Những kết quả này không thay nghiệm thu một sự kiện Meta thật.
- Sau hai lần Founder báo đã chuyển/đăng nhập, tab Chrome đang kết nối vẫn trả tài khoản `kinhphucdat@gmail.com`, workspace chỉ có hai dịch vụ `web-cong-dong`, và `Access denied` với backend VPT. Đã đưa đúng tab về đăng nhập, điền email quản lý `backen@vanphuthanh.net`, nhờ Founder xác nhận khi nhìn thấy `tubep-backend`. Không xin duyệt lại release và không coi đăng nhập thành công vào tài khoản khác là đã có quyền backend.
- Reviewer độc lập rà lại trình tự kích hoạt: phải xác minh đúng **App ID** đăng ký `leadgen` và callback của backend. Route cũ `/api/facebook/webhook-fields` gộp field của nhiều app, nên kết quả có `leadgen` riêng lẻ chưa đủ. Có thể dùng Shell của đúng backend để GET Graph với Page token trong bộ nhớ, chỉ xuất ID/boolean/mã HTTP; chưa chạy preflight này.
- Khi đủ cấu hình, bật đồng thời scoped receiver/intake/legacy guard và danh sách Page, vẫn giữ worker paused. Chờ bản cũ dừng rồi mới mở binding một lần và unpause. Không bật riêng inbox vì có thể chuyển cả Messenger. Dừng thông thường bằng pause worker; không cập nhật binding chỉ để pause vì trigger tăng phiên bản và receipt cũ cần đối soát.
- Khóa ký có mặt không chứng minh khóa đúng; webhook GET challenge không xác minh App Secret. Chưa xác minh khóa/Graph nên chưa đổi cờ, chưa mở binding, chưa gửi thêm form TEST hoặc liên hệ khách.

---

## Kết quả thực hiện — 08:20 ngày06/10/2026 (UTC+7)

**Đã triển khai lên production ở trạng thái tắt. Chưa bật tiếp nhận Lead Ads mới.** Founder đã duyệt; không có yêu cầu duyệt phát hành còn chờ.

- [PR29](https://github.com/backen-pixel/Quanlycongviec/pull/29) đã merge lúc01:17UTC: `b51078d3fe546eb2dd43f254e988a6195bb24df7`, head kiểm chứng `b94f4ef01e2fc13964df0770a42144e67dbe23d2`, runtime được review `66d2a5d7` không đổi.
- CI đúng headb94: [inbox37397952631](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37397952631) Node18/22 và PostgreSQL đều success; [Messenger37397953036](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37397953036) success. PG job112058299518 chạy15/15 inbox +31/31 intake, ca30 restore thực chạy31bảng,175554bytes, hash `ff47523736c49106cefd5c0601736f9cbc89d76acc27d13e60573e8a1b43c59c`. Đây vẫn là fixture, không phải restore production.
- Primary đã áp `facebook_page_inbox_701` version`20261006011452` và `facebook_lead_ads_intake_702` version`20261006011508`, đúng fileSQL trong source được review. Không sửa SQL700 hoặc DB Backup. Binding Page`409741855550833`/form`1438656288329447` đã tạo đúng routing dưới đây, **active=false, version1**.
- Kiểm quyền thực01:16UTC: cả3bảng mới có RLS, anon/authenticated không SELECT; service không INSERT/DELETE binding/receipt, không DELETE inbox; intake RPC chỉ service có EXECUTE, không anon/authenticated. Không cấp quyền lại trên bảng cũ.
- Render đã xác nhận lưu đúng5cờ off/paused bằng merge-env, không thay các biến khác; thao tác tự tạo deploy cấu hình`dep-db24mumk1f9s7393kp5g`. Merge tự tạo deploy mã`dep-db24o3rncjis73c877fg`, trạng thái **live**, hoàn tất01:18:09UTC, đúng mergeSHA trên; không gọi deploy lần nữa.
- Sau deploy: `/api/health` lúc01:19:18UTC trả`ok`, uptime73s,`active=primary`,`auto_failover_enabled=false`,Primaryhealthy. Startup instance`...-w2flx` ghi probe failoveron/autooff lúc01:18:04UTC. Quyền chuyển DB thủ công vẫn có, không dùng nó trong đợt này.
- Đối soát01:20:40UTC: inbox0,receipt0,bindinginactive; Messenger93receipt đều done, không có receipt dangdở. Giao diện CRM đăng nhập hiện tại tải lại tabLeadAds thành công, hiển thị chưa có LeadAds; đây không phải nghiệm thu bằng tài khoản AdminVPT hoặc một Lead thật.
- Công cụ auto-review đã từ chối merge lần đầu vì chưa ghi nhận đủ CI headcuối. Sau khi đọc lại cảhai workflow completed/success đúngb94 và cung cấp evidence trong lời gọi, cùng công cụ đã cho merge thành công. Không dùng đường vòng hoặc bỏ qua kiểm soát.

**Điểm chưa mở:** phiên Render UI đang là tài khoản không có quyền dịch vụ VPT; cần phiên đúng để xác minh`VPT_FACEBOOK_APP_SECRET` và`VPT_META_GRAPH_VERSION`, quyền Page/form và đối chiếu chữ ký Meta. Không suy secret thiếu hoặc đúng khi chưa đọc; không dùng webhook verify token thay AppSecret. Root đã gửi câu hỏi nhờ Founder chuyển tài khoản; không xin duyệt lại release. Sau khi xác minh, bật signed scoped receiver với workerpaused, chờ bản cũ dừng, đối soát chuyển đổi rồi mới mở binding/worker và xác nhận hành trình Meta→Admin. Chưa gửi thêm formTEST, nhắn khách hoặc đổi ngân sách.

Phần dưới giữ hồ sơ trước triển khai và trình tự còn lại theo thời điểm.

---

Founder đã yêu cầu rõ: **“cho bật chạy thật luôn nhé”** ngày 06/10/2026, tiếp nối quyết định phát hành. Quyền phát hành tuyến đang làm đã có; không chờ duyệt lại. Phạm vi không mở AI gửi tin, tăng chi quảng cáo hoặc merge toàn bộ PR22/25. Phần thu quyền anon/SQL700 vẫn thuộc Claude, Codex không thay.

Trạng thái trước triển khai: source `66d2a5d7c867cb5574ac61709fe39669cbbcec67` đã qua260/260 kiểm thử Node độc lập và review mã; đang chuẩn bị triển khai dormant với mọi cờ intake tắt. CI PostgreSQL của phần SQL/restore tại327864b7 đạt15/15 inbox và31/31 intake; vẫn kiểm CI head cuối trước merge. Chưa merge PR29, áp701/702 hay bật worker tại checkpoint này. Không dùng hồ sơ này làm bằng chứng đã chạy thật.

## Đối chiếu hệ thống thật ngày 06/10

Qua kết nối Render và SQL chỉ đọc, không đọc token/mật khẩu:

- Workspace `tea-d47g0824d50c73856e80` đã được Founder xác nhận trước đó; backend `srv-d6gguqq4d50c73emh20g`, một instance, auto-deploy nhánh main. Bản live `1f879ea85dfff23629fef79c8d15f2eaf540328e`, deploy `dep-db1sa67f3r2c73ce3dig`.
- Primary `kdxypztstbeovyedmvem`: chưa có inbox701/binding702; không có `crm_care_control` hoặc `marketing_fb_lead_bindings`. Các vai anon/authenticated/service_role không có CREATE trong public. Messenger có93receipt done, không có pending/processing tại lần đọc.
- Page `409741855550833` — Bếp Vạn Phú Thành: active, auto_create_lead, CRM/Lead; token đã lưu (không xuất giá trị). Công ty `991dc79d-cbf5-49f9-a364-35227cb47635` và Admin `49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c` đều active, cùng tenant `7d42e731-895b-4ba8-99d6-0005c4e23544` đang active; role Admin gắn đúng công ty.
- Stage hiện tại `a799f5e5-513c-4d55-b403-1ec2010574d3` (TIẾP NHẬN) thuộc pipeline `78e6251c-aea1-46bc-a19f-a401f1de7f34` (CRM — Bếp Vạn Phú Thành), active, Lead, chưa thắng/thua. Page.default_pipeline_id đang NULL; binding mới dùng pipeline từ quan hệ stage đã xác minh, không sửa cấu hình Page chung.
- Nguồn `b791ee5f-7dba-4e11-b015-6b9d232cdf1e` và vùng `f68e643d-7999-442c-83ee-edb7f5237ab1` (TP.Hồ Chí Minh) đều active, thuộc VPT. Vùng nhận việc không phải bằng chứng địa chỉ khách.
- Form mục tiêu `1438656288329447`, chưa có mapping tùy chỉnh trong `fb_lead_form_mapping`; cần xác nhận trường standard và quyền Graph thực trước bật. Form khác trên cùng Page phải được giữ pending nếu thiếu binding, không trả về writer cũ.
- `notifications.entity_id` và `type` thực là TEXT: đã sửa so sánh receipt retry về TEXT, chỉnh fixture cho đúng. Trigger Lead đang có145(stage history),147(temperature),392(tenant),568(project): nạp147/568 vào kiểm thử, không vô hiệu trigger. Không có legacy auto-task39 đang chạy.
- `fb_auto_pipeline.master=false`, `companies={}`, nhưng `fb_master_schedule.enabled=true`, phase run; không được dựa riêng master=false để suy không có lịch ghi. Cần bảo vệ Lead Ads khỏi scan/dedup/cleanup cũ trong mã trước bật.
- Đồng bộ Backup theo lịch đang bật; lượt cuối `2026-10-05T21:00:17.143Z` ghi failed, lỗi gọn `clone-primary-to-backup.js exit 1`. Chưa chứng minh khôi phục production hoặc Backup đồng bộ. Không tự chạy clone/restore đè Backup.
- Đã đọc Dashboard Supabase Primary: native restore point `05 Oct 2026 22:35:34 (+0000)`, PHYSICAL, có nút Restore; không nhấn khôi phục. Custom sync lỗi do thiếu shared-memory locks trong bước chuẩn bị schema, khác với native snapshot. [Bằng chứng và giới hạn phục hồi](FACEBOOK_LEAD_ADS_BACKUP_PREFLIGHT_20261006.md). Bước additive701/702 có thể dùng native snapshot cùng CI restore và phương án pause/giữ dữ liệu; lỗi custom clone giữ là ngoại lệ riêng, không tự chặn deploy dormant. Khi intake bật phải Primary-only/auto-failover off.

## Chuyển đổi và dừng

Bản sửa source `327864b759c6e5663949b87723ed7049c209d193`:234/234 ca Node cục bộ đạt; đã đẩy CI. Khi lane bật, tạm khóa các POST bảo trì `/dedup-leads`, `/sync-source-ids`, `/sync-contact-phones`, `/batch-extract-phones`, `/tools/link-only-phones/execute`, `/rescan-phones`, `/scan-leads-by-date`, `/phone-quality-apply`. Lịch rescan dùng cùng khóa; phần sync toàn bộ mô tả Lead của sync-then-extract bị bỏ qua có mã lý do. Pipeline/AutoTool/scanner server và manual create/link/update/delete/reconcile kiểm contact hiện tại cùng receipt trước ghi. Messenger và timer tiếp tục chạy. Không chạy CLI bảo trì cũ trong pilot; các helper ngoài entrypoint đã rà và chỉnh sửa CRM chung chưa được chứng nhận là công cụ sửa receipt.

Review độc lập phát hiện route đọc `/facebook/lead-ads` cũ chưa lọc Page theo công ty; đã sửa ở66d2a5d7 với20 ca đúng/sai quyền/lỗi nguồn. Hai vòng batch-sync-messages và refresh-names cũng bỏ qua contact được bảo vệ trước Graph/ghi;6 ca bổ sung. Toàn bộ260 ca Node đạt trong lượt độc lập; [review chuyển đổi](FACEBOOK_LEAD_ADS_SCOPED_REVIEW_20261006.md).

Triển khai dormant dùng đúng5 cấu hình: `VPT_FB_PAGE_INBOX=0`, `VPT_FB_LEAD_ADS_INTAKE=0`, `VPT_FB_LEGACY_SCOPE_GUARD=0`, `VPT_FB_PAGE_INBOX_WORKER_PAUSED=1`, `VPT_FB_MANAGED_PAGE_IDS` rỗng. Schema và binding có thể cài trước ởactive=false; không đòi App Secret/Graph khi tất cả cờ tắt. Đây không phải bước bật tiếp nhận mới. Khi chuyển sang signed ingress, phải có App Secret đúng để không làm lỗi cả Messenger.

1. Signed receiver tách đúng Lead Ads của Page quản lý vào inbox701; Messenger/bình luận/Page khác đi đường hiện tại. Chỉ ACK sau khi các lần lưu hàng đợi cần thiết đều xác nhận; hai hàng đợi không được gọi là một transaction chung.
2. Bảo vệ các đường tạo/sửa/xóa/bảo trì cũ để không có hai writer cho contact Lead Ads thuộc lane mới. Chức năng bảo trì chưa thể tách an toàn được tạm khóa khi lane bật, ghi rõ danh sách trong bản cuối.
3. Hoàn tất CI PostgreSQL31ca gồm khôi phục đầy đủ fixture, kiểm thử signed mixed webhook, review độc lập đúng SHA. Fixture không thay chứng cứ khôi phục toàn bộ hệ thống thật.
4. Xác minh khóa ký App, Graph và cấu hình Primary. Cài schema mới/binding mặc định chưa hoạt động; deploy mã chuyển đổi với worker paused. Chỉ mở binding/worker sau khi bản cũ đã dừng và đối soát các lần nhận trong chuyển đổi.
5. Xác nhận health, pending/errors và một sự kiện Meta thật đi đúng Lead/Admin/notification. Không gửi form TEST bổ sung hoặc nhắn khách dưới danh nghĩa kiểm thử khi chưa có phạm vi tương ứng.
6. Dừng bằng pause worker, giữ signed receiver/inbox/receipt. Không xóa dữ liệu, mở lại quyền anon hoặc bật writer cũ khi còn sự kiện của lane mới.

Tab Render qua Chrome hiện đăng nhập tài khoản `kinhphucdat@gmail.com`, báo không có quyền dịch vụ; đã nhờ Founder chuyển sang tài khoản quản lý VPT để đọc cấu hình khóa kết nối qua giao diện. Kết nối MCP Render vẫn đọc đúng workspace. Đây là thiếu phiên truy cập cấu hình, không phải thiếu quyết định phát hành.
