# -*- coding: utf-8 -*-
from _detail_seed_helpers import img, qitem, att

def crm_bundle():
    cat_id = "d2000006-0000-0000-0000-000000000001"
    def L(n):
        return f"b2000006-0000-0000-0000-00000000000{n}"
    def C(n):
        return f"c2000006-0000-0000-0000-00000000000{n}"
    def CL(n):
        return f"c2000006-0000-0001-0000-00000000000{n}"

    cat = {
        "id": cat_id,
        "name": "Thao tác chi tiết CRM — từng nút trên Lead / Deal",
        "slug": "thao-tac-chi-tiet-crm",
        "description": "Dành cho Sale CRM. Học từng nút trên trang chi tiết Lead/Deal: header, cột Thông tin, và từng tab. Nút kế hoạch SX & VC/LĐ trỏ sang khoá riêng.",
        "icon": "🖱️",
        "sort_order": 41,
        "deadline_note": "Hoàn thành khoá trong 14 ngày kể từ khi mở bài đầu tiên",
        "certificate_template": {
            "signature_name": "Ban điều hành TuBep Pro",
            "signature_title": "Phụ trách đào tạo vận hành",
            "footer_note": "Chứng nhận đã nắm từng nút trên trang chi tiết Lead/Deal CRM.",
            "accent_color": "#2563eb",
        },
    }

    lessons = []
    exercises = []

    def add(num, title, summary, md, cover, attachments, quiz, duration=12, final=False, checklist=None, quiz_title=None, quiz_instr=None, passing=None, time_limit=None, quiz_image=None):
        lid = L(num)
        lessons.append({
            "id": lid,
            "category_id": cat_id,
            "title": title,
            "summary": summary,
            "content_md": md,
            "cover": img(cover),
            "attachments": attachments,
            "duration": duration,
            "tags": ["chi-tiet", "crm", f"bai-{num}"],
            "sort_order": num,
            "final": final,
        })
        exercises.append({
            "id": C(num),
            "lesson_id": lid,
            "title": quiz_title or f"Bài kiểm tra: {title.split(': ',1)[-1]}",
            "instructions": quiz_instr or ("Làm xong phiếu tự kiểm rồi vào đây. Đạt 80%." if final else f"{len(quiz)} câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt."),
            "type": "quiz",
            "questions": {"items": quiz},
            "passing": passing if passing is not None else (80 if final else 70),
            "max_attempts": 3,
            "time_limit": time_limit if time_limit is not None else (25 if final else 15),
            "sort_order": 1,
            "image_url": img(quiz_image or cover),
            "attachments": attachments[:3],
        })
        if checklist:
            exercises.append({
                "id": CL(num),
                "lesson_id": lid,
                "title": "Phiếu tự kiểm — thao tác trên deal thật",
                "instructions": "Đánh dấu khi bạn đã làm được trên phần mềm. Không cần tạo dữ liệu rác — Hủy form nếu chỉ xem.",
                "type": "checklist",
                "questions": {"items": [{"id": f"c{i+1}", "text": t} for i, t in enumerate(checklist)]},
                "passing": 80,
                "max_attempts": None,
                "time_limit": None,
                "sort_order": 2,
                "image_url": img(cover),
                "attachments": [],
            })

    add(1,
        "Bài 1: Toàn cảnh trang chi tiết Lead / Deal",
        "Ba vùng màn hình: header nút, cột trái Thông tin, hàng tab bên phải.",
        """# Bài 1: Toàn cảnh trang chi tiết Lead / Deal

> _Mở một thẻ trên Kanban là vào trang này. Mọi nút quan trọng của Sale nằm ở đây — không nằm ở menu trái._

## 1. Ba vùng trên một màn hình

Trang chi tiết (`/crm/leads/:id`) dùng chung cho **Lead** và **Deal**. Nhìn 3 vùng:

1. **Header trên** — tên khách, nút thao tác (Chuyển Deal, Tạo sự kiện, Import Excel, kế hoạch SX & VC/LĐ…).
2. **Cột trái Thông tin** — SĐT, giá trị, nguồn, người phụ trách, deadline thẻ, stepper giai đoạn.
3. **Cột phải — hàng tab** — Công việc, Không gian chung, Đặt hàng, Tài liệu, Drive, Ghi chú & HĐ, Thành viên, Bình luận, Ghi âm.

![Trang chi tiết Lead — header và cột trái](/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png)

## 2. Hàng tab bên phải

Mỗi tab là một nhóm nút — bài sau đi từng nhóm.

![Hàng tab trên chi tiết Lead/Deal](/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png)

- **Công việc** — nhiệm vụ theo mẫu pipeline, phiếu khảo sát.
- **Không gian chung** — giao việc cho thành viên, kể cả khối SX / VC.
- **Đặt hàng** — lệnh đặt hàng gắn deal (tab riêng CRM, không có trên SX/VC).
- **Tài liệu / Drive** — file trên hệ thống và Google Drive.
- **Ghi chú & HĐ** — ghi chú nội bộ và hoạt động.
- **Thành viên** — ai được xem deal này.
- **Bình luận** — trao đổi + thẻ bàn giao VC/LĐ.
- **Ghi âm** — file ghi âm cuộc gọi gắn deal.
- Tab **Facebook / Zalo OA** chỉ hiện khi deal đến từ kênh đó.
- Tab **Điểm chéo & KH** chỉ hiện khi deal đã ở cột Hoàn thành.

Deal còn có **dải CRM · Sản xuất · VC/LĐ** dưới header — bấm để nhảy sang trang chi tiết xưởng hoặc lắp đặt của cùng đơn.

## 3. Lead khác Deal thế nào trên cùng trang

- **Lead:** có nút xanh **Chuyển Deal**. Chưa có kế hoạch SX & VC/LĐ.
- **Deal:** có nút vàng **Trả về Lead**, nút cam **Thiết lập kế hoạch SX & VC/LĐ** (hoặc **Kế hoạch SX & VC/LĐ** nếu đã tạo dự án), và có thể có **Tạo đơn hàng phát sinh**.

## 4. Lỗi hay gặp

- Tìm nút ở sidebar — sai chỗ. Nút thao tác deal nằm **trên trang chi tiết**.
- Nhầm tab Công việc với Không gian chung: Công việc = checklist theo mẫu; Không gian chung = giao việc cho người.

---

Bài sau: từng nút trên header và cột trái.
""",
        "guide-06-chi-tiet-lead.png",
        att(("guide-06-chi-tiet-lead.png", "Header và cột trái"), ("lead-09-chi-tiet-tab.png", "Hàng tab bên phải"), ("lead-04-tong-quan.png", "Cột Thông tin")),
        [
            qitem("c1", "Trang chi tiết Lead/Deal có mấy vùng chính?", ["1 vùng giữa", "3 vùng: header, cột trái Thông tin, hàng tab phải", "Chỉ Kanban", "Chỉ sidebar"], 1, "Header + Thông tin + tab phải."),
            qitem("c2", "Lead và Deal dùng trang chi tiết nào?", ["Hai trang khác nhau", "Cùng /crm/leads/:id, khác nút header", "Chỉ Deal có trang chi tiết", "Trong module SX"], 1, "Cùng LeadDetail, nút hiện tùy loại."),
            qitem("c3", "Nhìn ảnh. Hàng tab nằm ở đâu?", ["Menu trái sidebar", "Cột phải trang chi tiết", "App Switcher", "Trang Kiến thức"], 1, "Hàng tab cột phải.", "lead-09-chi-tiet-tab.png"),
            qitem("c4", "Tab Đặt hàng dùng để làm gì?", ["Đổi mật khẩu", "Lệnh đặt hàng gắn deal", "Gửi duyệt xưởng", "Bật cột LĐ tạm"], 1, "Tab riêng CRM."),
            qitem("c5", "Dải CRM · Sản xuất · VC/LĐ trên deal dùng để?", ["Xóa deal", "Nhảy sang chi tiết cùng đơn ở module khác", "In PDF lương", "Đổi pass"], 1, "DealModulePathStrip."),
            qitem("c6", "Nút Chuyển Deal hiện khi nào?", ["Mọi deal", "Khi bản ghi đang là Lead", "Chỉ admin", "Khi đã thua"], 1, "Chỉ Lead."),
            qitem("c7", "Tab Điểm chéo & KH hiện khi nào?", ["Luôn luôn", "Khi deal ở cột Hoàn thành", "Khi còn là Lead", "Trên Kanban"], 1, "Chỉ cột Hoàn thành."),
            qitem("c8", "Muốn giao việc cho thợ xưởng từ deal — vào tab nào?", ["Đặt hàng", "Không gian chung", "Ghi âm", "Facebook"], 1, "Không gian chung."),
            qitem("c9", "Tìm nút Import Excel ở đâu?", ["Sidebar CRM", "Header trang chi tiết", "Tab Ghi âm", "Cài đặt mật khẩu"], 1, "Header."),
            qitem("c10", "Công việc khác Không gian chung thế nào?", ["Giống nhau", "Công việc = mẫu pipeline; Không gian chung = giao việc cho người", "Công việc chỉ VC", "Không gian chung chỉ admin"], 1, "Hai tab khác việc."),
        ],
        duration=8,
    )

    add(2,
        "Bài 2: Nút header và cột trái Thông tin",
        "Từng nút trên thanh hành động và cột Thông tin: Chuyển Deal, sự kiện, khảo sát, Excel, kế hoạch SX, đơn phát sinh, stepper, deadline.",
        """# Bài 2: Nút header và cột trái Thông tin

> _Sale mở deal đã ký — hàng nút trên header là bàn phím tắt của cả ca._

## 1. Nút trên header (trái → phải, đúng nhãn phần mềm)

1. **Hướng dẫn chi tiết** — bật tour từng vùng trên trang. Dùng khi mới vào.
2. **Chuyển Deal** (xanh, chỉ Lead) — mở popup «Chuyển Lead sang Deal». Điền người phụ trách nếu hệ thống yêu cầu rồi xác nhận.
3. **Trả về Lead** (vàng, chỉ Deal) — trả deal về Lead, chọn lại người phụ trách. Nếu deal đã có dự án SX, hệ thống **gỡ liên kết** dự án khỏi deal (không xóa xưởng).
4. **Chuyển người phụ trách** — đổi công ty / khu vực / Sale. Có trên header và trong cột Thông tin.
5. **Tạo sự kiện** — lịch gắn đúng lead/deal này (gặp khách, khảo sát).
6. **Thêm phiếu khảo sát** / **Sửa phiếu khảo sát** — nhảy sang tab Công việc và mở form phiếu. Nút cam đậm = chưa điền; cam nhạt = đã có phiếu.
7. **Import Excel** — nhập báo giá từ file Excel vào deal.
8. **Thiết lập kế hoạch SX & VC/LĐ** (cam, Deal chưa có dự án) hoặc **Kế hoạch SX & VC/LĐ** (đã có dự án, sửa lịch). **Cách điền form nằm ở khoá «Kế hoạch SX & VC/LĐ»** — khoá này chỉ dạy **chỗ bấm**.
9. **Tạo đơn hàng phát sinh** (Deal khách hàng) — tạo deal + dự án SX mới, hiện ở cột đầu tab Khách hàng.

![Nút cam kế hoạch SX & VC/LĐ trên header deal](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 2. Cột trái — bấm từng dòng

- Sửa **tên** bằng icon bút cạnh tiêu đề → **Lưu** / **Hủy**.
- Click từng dòng Thông tin: Giá trị, Tiền cọc, Nguồn, Loại, Công ty, Khu vực, Ngày dự kiến chốt, Theo dõi tiếp, Mô tả.
- **Đặt** / **Sửa** deadline thẻ — hạn trên Kanban, khác hạn giai đoạn.
- **Bàn giao Sản xuất (thủ công)** — khi deal đã thắng mà chưa ra dự án, bấm rồi **Xác nhận bàn giao Sản xuất**.
- Khối dự án SX: **Mở SX**, **Sửa lịch**, **+ Thêm dự án SX**, **Chuyển công ty SX** (đúng quyền).

## 3. Stepper giai đoạn

Hàng vòng tròn dưới header. Bấm vòng khác cột = chuyển giai đoạn. Hệ thống có thể chặn và mở popup: chọn người, đặt deadline, lý do thua, hoặc cảnh báo nhiệm vụ chưa xong.

Deal **thua** có banner đỏ **Hồi lại deal**.

![Stepper giai đoạn deal](/uploads/knowledge-screenshots/deal-02-pipeline.png)

## 4. Lỗi hay gặp

- Bấm Chuyển Deal khi còn thiếu người phụ trách — đọc popup, đừng đóng tắt.
- Tìm «Thiết lập kế hoạch» trên Lead — nút chỉ hiện trên **Deal**.
- Import Excel nhầm file khách — dùng mẫu báo giá của công ty.

---

Luồng điền kế hoạch SX & VC/LĐ: học khoá **Kế hoạch SX & VC/LĐ**. Bài sau: tab Công việc.
""",
        "sx-vc-03-nut-ke-hoach.png",
        att(("sx-vc-03-nut-ke-hoach.png", "Header deal — nút kế hoạch"), ("deal-02-pipeline.png", "Stepper giai đoạn"), ("guide-06-chi-tiet-lead.png", "Cột trái Thông tin")),
        [
            qitem("h1", "Nút Chuyển Deal màu xanh dùng khi nào?", ["Deal đã thắng", "Bản ghi đang là Lead", "Xóa Lead", "In hợp đồng"], 1, "Chỉ Lead."),
            qitem("h2", "Nhìn ảnh. Nút cam trên header deal là nút nào?", ["Import Excel", "Thiết lập kế hoạch SX & VC/LĐ", "Trả về Lead", "Tạo sự kiện"], 1, "Nút cam kế hoạch.", "sx-vc-03-nut-ke-hoach.png"),
            qitem("h3", "Nút «Kế hoạch SX & VC/LĐ» (không chữ Thiết lập) nghĩa là gì?", ["Chưa có dự án", "Đã có dự án — bấm để sửa lịch", "Xóa dự án", "Chỉ admin thấy"], 1, "Đổi nhãn khi đã có project_id."),
            qitem("h4", "Trả về Lead khi deal đã có dự án SX thì sao?", ["Xóa xưởng", "Gỡ liên kết dự án khỏi deal", "Tạo thêm Lead", "Không cho bấm"], 1, "Không xóa project."),
            qitem("h5", "Thêm phiếu khảo sát bấm xong hệ thống làm gì?", ["Mở tab Công việc và form phiếu", "Gửi email khách", "Tạo dự án VC", "Đổi pass"], 0, "Nhảy tab Công việc."),
            qitem("h6", "Import Excel trên header nhập gì?", ["Danh sách nhân viên", "Báo giá từ file Excel vào deal", "Lịch nghỉ", "KPI tháng"], 1, "Excel quotation."),
            qitem("h7", "Tạo đơn hàng phát sinh dùng khi nào?", ["Lead mới", "Deal khách hàng — tạo deal + dự án SX phát sinh", "Xóa PO", "Đăng xuất"], 1, "Spawned customer order."),
            qitem("h8", "Bàn giao Sản xuất thủ công nằm ở đâu?", ["Sidebar", "Cột trái Thông tin khi deal đã thắng", "Tab Ghi âm", "App Switcher"], 1, "LeadInfoPanel."),
            qitem("h9", "Bấm vòng stepper giai đoạn có thể bị chặn vì?", ["Mạng 5G", "Nhiệm vụ chặn / thiếu người / thiếu deadline / lý do thua", "Thiếu ảnh đại diện", "Chưa học khoá này"], 1, "Popup chặn."),
            qitem("h10", "Cách điền form kế hoạch SX & VC/LĐ học ở đâu?", ["Bài này đã đủ", "Khoá Kiến thức «Kế hoạch SX & VC/LĐ»", "Tab Đặt hàng", "Zalo nhóm"], 1, "Tránh trùng khóa 534."),
            qitem("h11", "Nút Hướng dẫn chi tiết làm gì?", ["Xóa deal", "Bật tour từng vùng trên trang", "In PDF", "Chuyển SX"], 1, "Product tour."),
            qitem("h12", "Đặt deadline thẻ khác deadline giai đoạn thế nào?", ["Giống nhau", "Deadline thẻ = hạn trên Kanban; giai đoạn = hạn bước pipeline", "Chỉ kế toán thấy", "Không có deadline thẻ"], 1, "Hai loại hạn."),
        ],
        duration=14,
    )

    add(3,
        "Bài 3: Tab Công việc — mẫu, thêm việc, xong hết",
        "Gắn mẫu, Thêm việc, Xong hết, đổi List/Deadline/Planner/Lịch, phiếu khảo sát và giao việc CRM.",
        """# Bài 3: Tab Công việc — mẫu, thêm việc, xong hết

> _Phiếu khảo sát và checklist bán hàng sống ở tab này — không phải tab Bình luận._

## 1. Mở tab

Trên chi tiết Lead/Deal bấm **Công việc**. Deal có thể thấy nút gạt **CRM / SX** để xem pack nhiệm vụ bán hàng hoặc pack xưởng.

![Tab Công việc](/uploads/knowledge-screenshots/lead-05-nhiem-vu.png)

## 2. Từng nút trên thanh tab

1. **Gắn mẫu** — mở panel chọn bộ mẫu CRM của pipeline. Bấm tên mẫu để gắn việc vào deal.
2. **Bổ sung thiếu CRM** / **Bổ sung thiếu SX** — thêm việc còn thiếu so với mẫu (khi deal đã chuyển xưởng).
3. Đổi kiểu xem: **List** · **Deadline** · **Planner** · **Lịch**.
4. Trong từng nhóm: **Thêm việc** — tạo thêm 1 việc dưới giai đoạn.
5. **Xong hết** — đánh dấu hoàn thành cả nhóm. Chỉ bấm khi thật sự xong.

## 3. Từng dòng việc

- Ô tròn = hoàn thành 1 việc.
- Bấm tên việc = sửa (hạn, người, mô tả).
- Đính file, checklist con, ghi chú, **+ Ngày hẹn**.
- **Giao việc CRM** — mở bảng giao việc khối bán hàng.
- Phiếu khảo sát trên việc: **Sửa phiếu** / **Xóa phiếu**.
- **Khôi phục từ mẫu** nếu việc bị xóa nhầm.

Header **Thêm phiếu khảo sát** cũng nhảy vào đây và mở form.

## 4. Lỗi hay gặp

- Bấm Xong hết cả nhóm khi còn việc khách chưa chốt — KPI sai.
- Gắn nhầm mẫu pipeline khác công ty — chọn đúng công ty trên deal trước.
- Tìm phiếu khảo sát ở tab Ghi chú — phiếu nằm Công việc / nút header.

---

Bài sau: Không gian chung và Thành viên.
""",
        "lead-05-nhiem-vu.png",
        att(("lead-05-nhiem-vu.png", "Tab Công việc trên chi tiết")),
        [
            qitem("t1", "Tab Công việc chứa gì?", ["Lệnh đặt hàng", "Nhiệm vụ theo mẫu pipeline, phiếu khảo sát", "Ghi âm cuộc gọi", "Pipeline settings"], 1, "CRMTasksTab."),
            qitem("t2", "Nút Gắn mẫu dùng để?", ["Xóa deal", "Chọn bộ mẫu CRM gắn việc vào deal", "Tạo sự kiện lịch", "Đổi pass"], 1, "Template panel."),
            qitem("t3", "Xong hết nghĩa là gì?", ["Xóa nhóm việc", "Đánh dấu hoàn thành cả nhóm việc", "Gửi email", "Chuyển Deal"], 1, "Bulk complete."),
            qitem("t4", "Bổ sung thiếu SX bấm khi nào?", ["Lead mới", "Deal đã có pack xưởng — thêm việc còn thiếu so với mẫu", "Xóa dự án", "In HĐ"], 1, "Backfill SX."),
            qitem("t5", "List / Deadline / Planner / Lịch là gì?", ["4 module khác", "4 cách xem cùng danh sách việc", "4 pipeline", "4 công ty"], 1, "View switcher."),
            qitem("t6", "Thêm việc tạo ra gì?", ["Deal mới", "Một nhiệm vụ trong nhóm đang mở", "Dự án VC", "User mới"], 1, "Add task."),
            qitem("t7", "Phiếu khảo sát mở từ đâu?", ["Chỉ Cài đặt", "Nút header hoặc việc trong tab Công việc", "Tab Đặt hàng", "Thùng rác"], 1, "Survey fill."),
            qitem("t8", "Giao việc CRM trên một dòng việc dẫn tới?", ["Đăng xuất", "Bảng giao việc khối bán hàng", "Module kế toán", "Facebook ads"], 1, "Assignments."),
            qitem("t9", "Bấm Xong hết khi khách chưa chốt — rủi ro?", ["Không sao", "Checklist/KPI tính đã xong dù việc thật chưa xong", "Tăng lương", "Tự tạo Lead"], 1, "Lỗi hay gặp."),
            qitem("t10", "Deal gạt CRM / SX trên tab Công việc để?", ["Đổi công ty", "Xem pack việc bán hàng hoặc pack xưởng", "Ẩn header", "In PDF"], 1, "Hai pack việc."),
        ],
    )
    add(4,
        "Bài 4: Không gian chung và Thành viên",
        "Giao việc cho người (kể cả SX/VC), lọc Bán hàng / Xưởng / Lắp đặt, thêm thành viên xem deal.",
        """# Bài 4: Không gian chung và Thành viên

> _Muốn xưởng thấy một việc Sale giao — vào Không gian chung, không nhắn Zalo riêng._

## 1. Tab Không gian chung

Bấm **Không gian chung**. Đây là nơi **giao việc cho người**, khác tab Công việc (checklist mẫu).

![Không gian chung](/uploads/knowledge-screenshots/collab-01.png)

### Nút trên tab

1. Lọc **Tất cả** · **Bán hàng** · **Xưởng** · **Lắp đặt** — xem việc theo khối.
2. **Giao việc** (link) — mở bảng giao việc đầy đủ.
3. **Thêm** — form «Giao việc mới»: chọn người, mô tả, hạn, ảnh, khối. **Lưu** / **Hủy**.
4. Trên từng dòng: **Sửa**, **Xóa**, **Thêm ảnh**.

Nếu deal là đơn phát sinh: có link **Mở deal nguồn**.

## 2. Tab Thành viên

Bấm **Thành viên**. Ai không có trong list thì **không vào được** deal này (trừ admin đúng quyền).

1. **Thêm thành viên** — chọn người trong hệ sinh thái.
2. **Chọn tất cả** / **Bỏ chọn**.
3. **+ Thêm N người vào danh sách** rồi lưu.
4. Đổi vai trò hoặc **Xóa** từng người.

Badge số trên tab (xanh / teal / cam) = số thành viên theo khối CRM / SX / VC.

Khi lập kế hoạch SX & VC/LĐ, hệ thống **tự thêm** người phụ trách VC vào Thành viên — kiểm lại tab này sau khi lưu kế hoạch.

## 3. Lỗi hay gặp

- Giao việc trong tab Công việc rồi tưởng xưởng nhận — xưởng nhận ở **Không gian chung** / bảng Giao việc SX.
- Thêm nhầm người ngoài công ty — xóa ngay trên tab Thành viên.

---

Bài sau: Tài liệu, Drive, ghi chú, bình luận.
""",
        "collab-01.png",
        att(("collab-01.png", "Không gian chung trên deal"), ("collab-05.png", "Giao việc trong không gian chung")),
        [
            qitem("s1", "Không gian chung khác Công việc ở điểm nào?", ["Giống nhau", "Không gian chung = giao việc cho người; Công việc = checklist mẫu", "Không gian chung chỉ KPI", "Công việc chỉ admin"], 1, "Hai tab."),
            qitem("s2", "Nút Thêm trên Không gian chung mở gì?", ["Form Giao việc mới", "Xóa deal", "Pipeline settings", "Đổi pass"], 0, "Form giao việc."),
            qitem("s3", "Lọc Bán hàng / Xưởng / Lắp đặt để làm gì?", ["Đổi module App Switcher", "Lọc việc giao theo khối", "Ẩn header", "Tạo Lead"], 1, "Module chips."),
            qitem("s4", "Tab Thành viên quyết định điều gì?", ["Giá bán", "Ai được xem deal", "Màu Kanban", "Múi giờ"], 1, "Membership."),
            qitem("s5", "Ba badge số trên tab Thành viên là gì?", ["KPI tuần", "Số thành viên CRM / SX / VC", "Số PO", "Số cuộc gọi"], 1, "Đếm theo khối."),
            qitem("s6", "Sau khi lưu kế hoạch VC/LĐ nên kiểm tab nào?", ["Đặt hàng", "Thành viên — người phụ trách VC đã được thêm", "Thùng rác", "KPI giám đốc"], 1, "Tự thêm member."),
            qitem("s7", "Xóa thành viên bấm ở đâu?", ["Sidebar", "Dòng người trên tab Thành viên", "App Switcher", "Login"], 1, "Xóa member."),
            qitem("s8", "Link Giao việc trên Không gian chung dẫn tới?", ["Trang chủ", "Bảng giao việc của khối", "Cài đặt theme", "Facebook"], 1, "Assignments board."),
            qitem("s9", "Deal phát sinh có nút gì thêm?", ["Xóa công ty", "Mở deal nguồn", "Đổi pass", "Import nhân viên"], 1, "Deal nguồn."),
            qitem("s10", "Giao việc xưởng chỉ trên Zalo — sai vì?", ["Zalo nhanh hơn", "Xưởng không thấy trên hệ thống, mất vết", "Bắt buộc Zalo", "KPI tăng"], 1, "Ghi trên app."),
        ],
        duration=10,
    )

    add(5,
        "Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Ghi âm",
        "Upload/chia sẻ file, ghi chú nội bộ, bình luận (kể cả Chọn & bàn giao), nghe ghi âm.",
        """# Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Ghi âm

> _File và lời nói với khách phải nằm trên deal — xưởng mở đúng tab là thấy._

## 1. Tab Tài liệu

1. **Nhập văn bản** — tạo tài liệu chữ (biên bản, ghi nhớ).
2. **Upload file** — PDF, ảnh, CAD…
3. **Tải tất cả (N)** — gói ZIP.
4. Từng file: **Mở**, **In**, **Tải**, bánh răng **chia sẻ sang khối SX / VC**, **Xóa**.

File chưa chia sẻ thì xưởng **không thấy** dù đã có trên CRM.

![Tài liệu trên deal](/uploads/knowledge-screenshots/deal-05-hop-dong.png)

## 2. Tab Drive

**Thư mục**, **Tải lên từ máy**, **Doc**, **Sheet**, **Liên kết file Drive**, **Tải xuống**, **Xóa**, **Chọn tất cả**. Dùng khi file sống trên Google Drive công ty.

## 3. Tab Ghi chú & HĐ

- Ô soạn thảo → **Gửi (Ctrl+Enter)**.
- **Sửa** / **Lưu** / **Hủy** ghi chú cũ.
- **Chia sẻ sang khối khác** nếu xưởng/VC cần đọc.
- **Thêm** (Hoạt động) — ghi cuộc gọi, gặp mặt.

## 4. Tab Bình luận

- Gửi bình luận, **@mention**, **Trả lời**, **Sửa**, **Xóa**.
- Deal có thể có mẫu trả lời nhanh.
- Khi xưởng bàn giao: thẻ **Bàn giao Lắp đặt**. Sale đọc thông tin rồi bấm **Chọn & bàn giao**. Chi tiết luồng nằm ở khoá **Kế hoạch SX & VC/LĐ**.

![Nút Chọn & bàn giao trên thẻ bàn giao](/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png)

## 5. Tab Ghi âm

Danh sách file ghi âm gắn deal. Upload thường làm ở trang **Cuộc gọi & ghi âm**, rồi file hiện lại đây.

Tab **Facebook / Zalo OA** (nếu có): trả lời khách, đính Drive, **Gửi**.

## 6. Lỗi hay gặp

- Upload hợp đồng nhưng không bật chia sẻ SX — xưởng bảo «không có bản vẽ».
- Thảo luận giá trong kênh khách (Facebook/Zalo) thay vì Ghi chú nội bộ.

---

Bài 6: tab Đặt hàng, điểm chéo, và thực hành cả trang.
""",
        "deal-05-hop-dong.png",
        att(("deal-05-hop-dong.png", "Tài liệu trên deal"), ("sx-vc-09b-chon-ban-giao.png", "Chọn & bàn giao"), ("lead-09-chi-tiet-tab.png", "Hàng tab")),
        [
            qitem("d1", "Xưởng không thấy file trên deal — nguyên nhân hay gặp?", ["Mạng chậm", "File chưa chia sẻ sang khối SX", "Thiếu KPI", "Sai mật khẩu"], 1, "Visibility."),
            qitem("d2", "Tải tất cả (N) làm gì?", ["Xóa file", "Tải ZIP toàn bộ tài liệu tab", "Gửi Zalo", "Tạo Lead"], 1, "ZIP."),
            qitem("d3", "Nhập văn bản khác Upload file ở chỗ nào?", ["Giống", "Nhập văn bản = tài liệu chữ trên hệ thống; Upload = file máy", "Nhập văn bản xóa deal", "Upload chỉ admin"], 1, "Hai cách thêm."),
            qitem("d4", "Tab Drive dùng khi nào?", ["File trên Google Drive công ty gắn deal", "Đổi pipeline", "Tính lương", "Chặn SĐT"], 0, "Drive."),
            qitem("d5", "Gửi ghi chú nhanh bằng phím?", ["Esc", "Ctrl+Enter", "F5", "Alt+F4"], 1, "Composer."),
            qitem("d6", "Nhìn ảnh. Nút trên thẻ bàn giao để xác nhận là nút nào?", ["Để sau", "Chọn & bàn giao", "Xóa dự án", "Import Excel"], 1, "Nút xác nhận.", "sx-vc-09b-chon-ban-giao.png"),
            qitem("d7", "Chọn & bàn giao học kỹ ở khoá nào?", ["Khoá này đủ", "Kế hoạch SX & VC/LĐ", "KPI giám đốc", "MISA"], 1, "Khóa 534."),
            qitem("d8", "Tab Ghi âm chứa gì?", ["Báo giá Excel", "File ghi âm cuộc gọi gắn deal", "Pipeline", "Thùng rác"], 1, "Voice recordings."),
            qitem("d9", "Tab Facebook / Zalo hiện khi nào?", ["Luôn", "Khi deal/lead đến từ kênh inbox đó", "Chỉ admin", "Khi deal thua"], 1, "inboxChannel."),
            qitem("d10", "Thêm hoạt động (gọi/gặp) bấm ở tab nào?", ["Đặt hàng", "Ghi chú & HĐ → Thêm", "Ghim", "App Switcher"], 1, "Add activity."),
            qitem("d11", "Chia sẻ ghi chú sang khối khác để?", ["Xóa ghi chú", "Xưởng/VC đọc được ghi chú CRM", "Đổi Sale", "In lương"], 1, "Share note."),
            qitem("d12", "Trả lời / Sửa / Xóa trên Bình luận dùng khi?", ["Xóa deal", "Thao tác từng comment", "Đổi công ty", "Bật cột LĐ tạm"], 1, "Comment actions."),
        ],
    )

    add(6,
        "Bài 6: Đặt hàng, điểm chéo và thực hành cả trang",
        "Tab Đặt hàng, Điểm chéo & KH, phiếu tự kiểm toàn bộ nút chi tiết, rồi thi cuối.",
        """# Bài 6: Đặt hàng, điểm chéo và thực hành cả trang

> _Hai tab còn lại chỉ có trên CRM, rồi bạn tự chạy một vòng trên deal thật._

## 1. Tab Đặt hàng (chỉ CRM)

Trang chi tiết SX/VC **không** có tab này.

1. **Thêm** / **Thêm mới** — tạo lệnh đặt hàng gắn deal.
2. Chip trạng thái (**Tất cả** và từng trạng thái PO) — lọc list.
3. Từng dòng: **Xem**, **Sửa**, **Xóa**.
4. Form: **Lưu** / **Hủy**.

Không nhầm với **Tạo đơn hàng phát sinh** trên header (tạo **deal mới**), còn tab này là **PO mua hàng** trong deal đang mở.

## 2. Tab Điểm chéo & KH

Chỉ hiện khi deal ở cột **Hoàn thành**. Dùng để nhập/xem điểm chéo sau nghiệm thu — không phải chỗ bán hàng hàng ngày.

## 3. Đề bài thực hành

Mở một deal bạn phụ trách (ưu tiên deal test **THUCHANH - tên bạn - ngày** nếu không muốn đụng khách thật):

1. Đọc header: gọi tên từng nút đang hiện (Lead khác Deal).
2. Cột trái: mở **Sửa** deadline thẻ rồi **Hủy** nếu không đổi thật.
3. Tab Công việc → List → chỉ cần thấy **Thêm việc**.
4. Không gian chung → **Thêm** → xem form → **Hủy**.
5. Thành viên → xác nhận bạn có trong list.
6. Tài liệu → thấy **Upload file**.
7. Bình luận → cuộn tìm thẻ bàn giao nếu deal đã qua xưởng.
8. Đặt hàng → thấy nút **Thêm**.
9. Nếu deal có dải CRM · SX · VC: bấm **Sản xuất** xem trang xưởng, **Quay lại** deal.

## 4. Phiếu tự kiểm

Tick hết mục bài tập checklist dưới bài này rồi làm **Bài kiểm tra cuối**.

Deal thực hành đặt tên **THUCHANH - …** — nhắn admin xóa sau, đừng để lệch báo cáo.

## 5. Nhắc lại ranh giới hai khoá

- Khoá này: **chỗ bấm** trên trang chi tiết CRM.
- Khoá **Kế hoạch SX & VC/LĐ**: điền form ngày lắp, cột tạm, Chọn & bàn giao.

---

Đạt bài kiểm tra cuối để nhận chứng nhận khoá thao tác chi tiết CRM.
""",
        "lead-09-chi-tiet-tab.png",
        att(("lead-09-chi-tiet-tab.png", "Hàng tab CRM"), ("sx-vc-03-nut-ke-hoach.png", "Header kế hoạch"), ("sx-vc-09b-chon-ban-giao.png", "Chọn & bàn giao")),
        [
            qitem("f1", "Tab Đặt hàng có trên trang chi tiết SX không?", ["Có", "Không — chỉ trang chi tiết CRM", "Chỉ VC có", "Chỉ admin thấy trên SX"], 1, "Chỉ CRM."),
            qitem("f2", "Thêm trên tab Đặt hàng tạo ra gì?", ["Deal phát sinh", "Lệnh đặt hàng (PO) gắn deal đang mở", "User mới", "Cột Kanban"], 1, "PO."),
            qitem("f3", "Tạo đơn hàng phát sinh (header) khác tab Đặt hàng thế nào?", ["Giống", "Header tạo deal+dự án mới; tab Đặt hàng là PO trong deal hiện tại", "Cả hai xóa Lead", "Cả hai chỉ in PDF"], 1, "Dễ nhầm tên."),
            qitem("f4", "Tab Điểm chéo & KH hiện khi?", ["Lead mới", "Deal ở cột Hoàn thành", "Mọi Deal", "Trang login"], 1, "Hoàn thành."),
            qitem("f5", "Nhìn ảnh header. Nút cam là nút nào?", ["Trả về Lead", "Thiết lập kế hoạch SX & VC/LĐ", "Import Excel", "Ghi âm"], 1, "Kế hoạch.", "sx-vc-03-nut-ke-hoach.png"),
            qitem("f6", "Muốn xưởng thấy bản vẽ — làm gì?", ["Chỉ upload CRM, không chia sẻ", "Upload tab Tài liệu rồi chia sẻ sang khối SX", "Gửi USB", "Đổi tên deal"], 1, "Share SX."),
            qitem("f7", "Không gian chung nút Thêm là?", ["Xóa thành viên", "Giao việc mới cho người", "Import Excel", "Bàn giao VC"], 1, "Giao việc."),
            qitem("f8", "Xong hết trên tab Công việc nên bấm khi?", ["Đầu ca cho vui", "Nhóm việc thật sự đã xong", "Khi khách chưa chốt", "Mỗi giờ một lần"], 1, "Thật sự xong."),
            qitem("f9", "Chọn & bàn giao nằm tab nào?", ["Đặt hàng", "Bình luận (thẻ bàn giao sau khi xưởng xong)", "Ghi âm", "Điểm chéo"], 1, "Bình luận."),
            qitem("f10", "Dải CRM · Sản xuất · VC/LĐ bấm Sản xuất thì?", ["Xóa deal", "Mở trang chi tiết dự án xưởng cùng đơn", "Đăng xuất", "Mở KPI"], 1, "Path strip."),
            qitem("f11", "Phiếu khảo sát không thấy trên Ghi chú vì?", ["Bug", "Phiếu nằm tab Công việc / nút header", "Chỉ Zalo có", "Đã xóa vĩnh viễn"], 1, "Công việc."),
            qitem("f12", "Hồi lại deal bấm khi nào?", ["Deal đang thắng", "Deal/lead đang thua — banner đỏ", "Lead mới", "PO mới"], 1, "Lost banner."),
            qitem("f13", "Ghim trên chi tiết (nếu có) để làm gì?", ["Xóa thẻ", "Ghim thẻ trên Kanban cho dễ tìm", "Đổi công ty", "Tạo PO"], 1, "Pin."),
            qitem("f14", "Nhìn ảnh. Nút Chọn & bàn giao dùng để?", ["Tạo dự án VC mới", "Xác nhận bàn giao — chuyển thẻ khỏi cột tạm", "Xóa ghi chú", "Import Excel"], 1, "Không tạo dự án mới.", "sx-vc-09b-chon-ban-giao.png"),
            qitem("f15", "Sau khoá này, form ngày lắp / cột LĐ tạm học tiếp ở?", ["Khoá Kế hoạch SX & VC/LĐ", "Khoá KPI", "Không cần", "Tab Đặt hàng"], 0, "Khóa 534."),
        ],
        duration=25,
        final=True,
        checklist=[
            "Mở chi tiết một deal: nhận ra 3 vùng header / Thông tin / tab",
            "Chỉ đúng nút Chuyển Deal (Lead) hoặc Trả về Lead / kế hoạch SX (Deal) trên header",
            "Mở tab Công việc: thấy Gắn mẫu hoặc Thêm việc",
            "Mở Không gian chung: bấm Thêm (có thể Hủy nếu không giao thật)",
            "Mở Thành viên: biết chỗ thêm người",
            "Mở Tài liệu: thấy Upload file / Nhập văn bản",
            "Mở Bình luận: biết chỗ thẻ Chọn & bàn giao sẽ hiện sau khi xưởng bàn giao",
            "Mở Đặt hàng: thấy Thêm / Thêm mới (không bắt buộc tạo PO thật)",
        ],
        quiz_title="Bài kiểm tra cuối: Từng nút trên chi tiết CRM",
        quiz_instr="Làm xong phiếu tự kiểm trên một deal thật (hoặc deal THUCHANH) rồi mới vào đây. 15 câu — một số có ảnh. Đạt 80%, tối đa 3 lượt, 25 phút.",
        passing=80,
        time_limit=25,
    )
    return cat, lessons, exercises
