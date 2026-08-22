# -*- coding: utf-8 -*-
from _detail_seed_helpers import img, qitem, att

def workshop_bundle(kind):
    """kind: 'sx' | 'vc' — cùng khung 6 bài, nút riêng ở bài 2 và 6."""
    is_vc = kind == "vc"
    if is_vc:
        cat_id = "d2000008-0000-0000-0000-000000000001"
        lp, cp, clp = "b2000008", "c2000008", "c2000008-0000-0001"
        name = "Thao tác chi tiết VC/LĐ — từng nút trên dự án lắp đặt"
        slug = "thao-tac-chi-tiet-vc-ld"
        desc = "Dành cho tổ vận chuyển/lắp đặt. Học từng nút trên trang chi tiết dự án Lắp đặt (cùng giao diện xưởng, khác vài nút)."
        icon = "🔧"
        sort_order = 43
        accent = "#c026d3"
        footer = "Chứng nhận đã nắm từng nút trên trang chi tiết dự án VC/LĐ."
        tags_mod = "vc-ld"
        cover1 = "sx-vc-07-board-cot-tam.png"
        badge = "VC"
        route = "/vc/projects/:id"
        mod_label = "Lắp đặt"
    else:
        cat_id = "d2000007-0000-0000-0000-000000000001"
        lp, cp, clp = "b2000007", "c2000007", "c2000007-0000-0001"
        name = "Thao tác chi tiết Sản xuất — từng nút trên dự án xưởng"
        slug = "thao-tac-chi-tiet-sx"
        desc = "Dành cho xưởng. Học từng nút trên trang chi tiết dự án SX (cùng khung với VC/LĐ và CRM)."
        icon = "🏭"
        sort_order = 42
        accent = "#0f766e"
        footer = "Chứng nhận đã nắm từng nút trên trang chi tiết dự án Sản xuất."
        tags_mod = "sx"
        cover1 = "sx-vc-08-sx-ban-giao.png"
        badge = "SX"
        route = "/sx/projects/:id"
        mod_label = "Sản xuất"

    def L(n):
        return f"{lp}-0000-0000-0000-00000000000{n}"
    def C(n):
        return f"{cp}-0000-0000-0000-00000000000{n}"
    def CL(n):
        return f"{clp}-0000-00000000000{n}"

    cat = {
        "id": cat_id,
        "name": name,
        "slug": slug,
        "description": desc,
        "icon": icon,
        "sort_order": sort_order,
        "deadline_note": "Hoàn thành khoá trong 14 ngày kể từ khi mở bài đầu tiên",
        "certificate_template": {
            "signature_name": "Ban điều hành TuBep Pro",
            "signature_title": "Phụ trách đào tạo vận hành",
            "footer_note": footer,
            "accent_color": accent,
        },
    }
    lessons, exercises = [], []

    def add(num, title, summary, md, cover, attachments, quiz, duration=12, final=False, checklist=None, quiz_title=None, quiz_instr=None, passing=None, time_limit=None):
        lid = L(num)
        lessons.append({
            "id": lid, "category_id": cat_id, "title": title, "summary": summary,
            "content_md": md, "cover": img(cover), "attachments": attachments,
            "duration": duration, "tags": ["chi-tiet", tags_mod, f"bai-{num}"],
            "sort_order": num, "final": final,
        })
        exercises.append({
            "id": C(num), "lesson_id": lid,
            "title": quiz_title or f"Bài kiểm tra: {title.split(': ',1)[-1]}",
            "instructions": quiz_instr or (f"{len(quiz)} câu — một số có ảnh. Đạt 70%, tối đa 3 lượt."),
            "type": "quiz", "questions": {"items": quiz},
            "passing": passing if passing is not None else (80 if final else 70),
            "max_attempts": 3,
            "time_limit": time_limit if time_limit is not None else (25 if final else 15),
            "sort_order": 1, "image_url": img(cover), "attachments": attachments[:3],
        })
        if checklist:
            exercises.append({
                "id": CL(num), "lesson_id": lid,
                "title": "Phiếu tự kiểm — thao tác trên dự án thật",
                "instructions": "Đánh dấu khi đã làm được trên phần mềm. Hủy form nếu chỉ xem, đừng tạo dữ liệu rác.",
                "type": "checklist",
                "questions": {"items": [{"id": f"c{i+1}", "text": t} for i, t in enumerate(checklist)]},
                "passing": 80, "max_attempts": None, "time_limit": None, "sort_order": 2,
                "image_url": img(cover), "attachments": [],
            })

    extra_tabs = "không có Đặt hàng / Ghi âm / Facebook" if True else ""
    sx_only_tabs = "" if is_vc else "Thêm tab **Vật tư / Mua hàng** và **Gửi duyệt** (chỉ xưởng)."
    vc_banner = """Có banner tím **Lắp đặt tạm** nếu Sale đã lên kế hoạch mà xưởng chưa bàn giao — thẻ bị khoá chuyển cột.""" if is_vc else ""
    header_unique = (
        """1. **Quay lại** — về Dashboard Lắp đặt, sáng đúng thẻ.
2. Badge **VC** — đang ở module Lắp đặt.
3. Sửa tên deal (icon bút) → **Lưu** / **Hủy** (nếu có CRM deal).
4. **Dự án đầy đủ** — mở trang dự án tổng hợp `/projects/:id`.
5. **CRM deal** — nhảy về chi tiết CRM cùng đơn.
6. Dải **CRM · Sản xuất · VC/LĐ** — chuyển module.
7. **Không có** nút Đặt xưởng khác (nút đó chỉ xưởng).
8. Stepper cột Lắp đặt — kéo tiến độ sau khi hết badge TẠM."""
        if is_vc else
        """1. **Quay lại** — về Dashboard xưởng, sáng đúng thẻ.
2. Badge **SX**.
3. Sửa tên deal (icon bút) → **Lưu** / **Hủy**.
4. **Đặt xưởng khác** — mở form chọn công ty SX + phân loại + ngày, rồi **Tạo dự án**. Dùng khi đặt hàng thêm xưởng (vd. Metalla → HCB).
5. **Dự án đầy đủ** — `/projects/:id`.
6. **CRM deal** — về chi tiết CRM.
7. Dải **CRM · Sản xuất · VC/LĐ**.
8. Chip pipeline: công ty, phân loại xưởng, khu vực.
9. Stepper cột xưởng — bấm cột **Đơn hàng đã chuẩn bị xong** để bàn giao VC (mở popup **Bàn giao sang VC**)."""
    )
    left_unique = (
        """- **Ngày lấy hàng**, **Ngày lắp đặt**, địa chỉ lắp.
- Đội ngũ: **Người vận chuyển phụ trách**, **Đội vận chuyển**, **Người lắp đặt**, **Đội lắp đặt**.
- Không có ô giá trị SX / cọc / ngày hoàn thiện xưởng."""
        if is_vc else
        """- **Giá trị sản xuất**, **Tiền cọc**, công nợ.
- **Ngày hoàn thiện sản xuất**, **Ngày lắp đặt** (hoàn thiện thường = lắp trừ 2 ngày).
- **Địa chỉ lắp đặt**, tên khác.
- **Phân công Sản xuất** (chọn người). Đội SX hiện chip.
- Khối **Đặt xưởng**: link dự án đã đặt, **Xem bình luận thông báo**."""
    )

    add(1,
        f"Bài 1: Toàn cảnh trang chi tiết {mod_label}",
        f"Ba vùng giống CRM: header, cột trái Thông tin, hàng tab. Trang {route}.",
        f"""# Bài 1: Toàn cảnh trang chi tiết {mod_label}

> _Cùng một kiểu trang với CRM — học một lần, sang module kia vẫn biết chỗ bấm._

## 1. Ba vùng

Trang `{route}` (file `ProductionDetail`, badge **{badge}**).

1. **Header** — tên dự án/deal, nút riêng module, **Dự án đầy đủ**, **CRM deal**.
2. **Cột trái Thông tin** — ngày, địa chỉ, đội ngũ {mod_label}.
3. **Hàng tab phải** — Công việc, Không gian chung, Tài liệu, Drive, Ghi chú, Bình luận, Sự cố, Thành viên. {sx_only_tabs}

{vc_banner}

SX và VC **dùng chung giao diện**. Khác nhau ở vài nút header và 2 tab chỉ xưởng (Vật tư, Gửi duyệt).

![Minh họa luồng xưởng / lắp đặt](/uploads/knowledge-screenshots/{cover1})

## 2. Tab có trên cả SX và VC

- **Công việc** — mẫu nhiệm vụ xưởng hoặc VC/LĐ.
- **Không gian chung** — giao việc cho người (nếu có CRM deal).
- **Tài liệu / Drive / Ghi chú / Bình luận** — giống CRM, file theo khối.
- **Sự cố** — **Báo sự cố**, **Gửi báo cáo**, **Đã xử lý**.
- **Thành viên** — ai xem được dự án/deal.

Không có tab Đặt hàng, Ghi âm, Facebook (những tab đó chỉ CRM).

## 3. Lỗi hay gặp

- Tìm nút **Đặt xưởng khác** trên VC — không có, chỉ SX.
- Tìm tab **Vật tư** trên VC — không có.

---

Bài sau: nút header và cột trái đúng module {mod_label}.
""",
        cover1,
        att((cover1, f"Minh họa {mod_label}"), ("sx-vc-03-nut-ke-hoach.png", "Deal CRM cùng đơn — để đối chiếu")),
        [
            qitem("w1", "Trang chi tiết SX và VC có giống nhau không?", ["Hai app khác hẳn", "Cùng giao diện ProductionDetail, khác vài nút và tab", "VC không có trang chi tiết", "Chỉ khác màu logo"], 1, "moduleKey sx/vc."),
            qitem("w2", "Tab Đặt hàng có trên chi tiết xưởng không?", ["Có", "Không — tab đó chỉ CRM", "Chỉ VC có", "Chỉ khi thắng deal"], 1, "Chỉ CRM."),
            qitem("w3", "Tab Vật tư / Mua hàng có trên VC không?", ["Có", "Không — chỉ Sản xuất", "Luôn có", "Chỉ thợ lắp thấy"], 1 if is_vc else 1, "SX-only tab."),
            qitem("w4", "Ba vùng trang chi tiết là?", ["Sidebar / login / KPI", "Header, cột trái Thông tin, hàng tab phải", "Chỉ Kanban", "Chỉ lịch"], 1, "Giống CRM."),
            qitem("w5", "Nút CRM deal trên header dùng để?", ["Xóa deal", "Mở trang chi tiết CRM cùng đơn", "Tạo Lead", "Đổi pass"], 1, "Link /crm/leads/:id."),
            qitem("w6", "Sự cố tab dùng để?", ["Tính lương", "Báo sự cố xưởng/công trình, gửi báo cáo, đánh dấu đã xử lý", "Import Excel", "Ghim Kanban"], 1, "Incidents."),
            qitem("w7", "Dải CRM · Sản xuất · VC/LĐ để?", ["Xóa dự án", "Nhảy module cùng đơn", "Đổi công ty kế toán", "Mở Kiến thức"], 1, "Path strip."),
            qitem("w8", "Banner Lắp đặt tạm xuất hiện trên module nào?", ["CRM", "VC khi Sale đã lên kế hoạch, xưởng chưa bàn giao", "Mọi SX", "Kế toán"], 1, "vc_temp_staged."),
            qitem("w9", f"Đường dẫn trang này là?", [route, "/crm/dashboard", "/knowledge", "/login"], 0, "Route module."),
            qitem("w10", "Học chỗ bấm Chọn & bàn giao (Sale) ở khoá nào?", ["Khoá này đủ cho Sale", "Kế hoạch SX & VC/LĐ (khoá CRM Sale xác nhận)", "KPI", "MISA"], 1, "Ranh giới."),
        ],
        duration=8,
    )

    add(2,
        f"Bài 2: Nút header và cột trái {mod_label}",
        "Từng nút riêng module trên header và Thông tin — SX có Đặt xưởng / bàn giao VC; VC có LĐ tạm và đội lắp.",
        f"""# Bài 2: Nút header và cột trái {mod_label}

> _Nhìn đúng badge {badge} trước khi bấm — đừng thao tác nhầm module._

## 1. Header

{header_unique}

Nút **Đặt xưởng khác** và popup **Bàn giao sang VC** chỉ có trên **Sản xuất**.

![Bàn giao / kế hoạch liên quan](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 2. Cột trái Thông tin

{left_unique}

- **Địa chỉ lắp đặt** có trên cả hai (sửa được khi đúng quyền).

## 3. Stepper

Bấm cột trên stepper = chuyển giai đoạn. Có thể bị chặn: nhiệm vụ chưa xong, thiếu deadline.

- **SX:** cột bàn giao VC mở modal **🚚 Bàn giao sang VC** → **Xác nhận bàn giao**. Việc này **báo Sale**, không tự chuyển thẻ VC khỏi cột tạm.
- **VC:** nếu còn **Lắp đặt tạm**, chuyển cột bị chặn cho tới khi Sale bấm **Chọn & bàn giao** trên CRM.

Chi tiết luồng kế hoạch: khoá **Kế hoạch SX & VC/LĐ**.

## 4. Lỗi hay gặp

- Xưởng tưởng bấm cột xong là VC chạy xe — chưa, cần Sale xác nhận trên CRM.
- VC cố kéo thẻ TẠM — hệ thống chặn là **đúng**.

---

Bài sau: tab Công việc (cùng nút Thêm việc / Xong hết như CRM).
""",
        "sx-vc-08-sx-ban-giao.png" if not is_vc else "sx-vc-07b-the-tam-ghi-chu.png",
        att(("sx-vc-08-sx-ban-giao.png", "Xưởng — bước bàn giao"), ("sx-vc-07b-the-tam-ghi-chu.png", "Thẻ TẠM phía VC"), ("sx-vc-09-the-ban-giao.png", "Sale xác nhận trên CRM")),
        [
            qitem("h1", "Nút Đặt xưởng khác có trên VC không?", ["Có", "Không — chỉ Sản xuất", "Chỉ thợ lắp", "Chỉ khi TẠM"], 1, "SX-only."),
            qitem("h2", "Đặt xưởng khác dùng khi nào?", ["Xóa dự án", "Tạo thêm dự án ở công ty/xưởng khác", "Đổi pass", "In HĐ"], 1, "Place to other workshop."),
            qitem("h3", "Dự án đầy đủ mở trang nào?", ["/crm/leads", "/projects/:id", "/knowledge", "/login"], 1, "ProjectDetail."),
            qitem("h4", "Nhìn ảnh xưởng. Cột khoanh đỏ thường là bước nào?", ["Xóa thẻ", "Bàn giao — đơn hàng đã chuẩn bị xong", "Tạo Lead", "Import Excel"], 1, "Handover column.", "sx-vc-08-sx-ban-giao.png"),
            qitem("h5", "Xưởng bấm bàn giao VC thì Sale phải làm gì?", ["Không gì", "Xác nhận thẻ Chọn & bàn giao trên CRM (tab Bình luận)", "Tạo dự án VC mới tay", "Xóa thẻ TẠM"], 1, "Khóa 534."),
            qitem("h6", "Trên VC, Ngày lấy hàng nằm ở đâu?", ["Sidebar", "Cột trái Thông tin", "Tab Đặt hàng", "KPI"], 1, "WorkshopInfoPanel VC."),
            qitem("h7", "Phân công Sản xuất (chọn người) là nút/select của module nào?", ["VC", "Sản xuất (cột trái)", "Kế toán", "Kiến thức"], 1, "SX team."),
            qitem("h8", "Banner Lắp đặt tạm nghĩa là?", ["Được kéo cột tự do", "Sale đã lên kế hoạch, chưa bàn giao thật — không kéo cột", "Deal đã thua", "Hết hàng"], 1, "Lock."),
            qitem("h9", "Stepper bị chặn thường vì?", ["Thiếu ảnh đại diện", "Nhiệm vụ chặn hoặc thiếu deadline", "Sai múi giờ máy", "Chưa học bài 1"], 1, "Blocking tasks / deadline."),
            qitem("h10", "Nút CRM deal để?", ["Xóa CRM", "Mở chi tiết Lead/Deal cùng đơn", "Tạo PO", "Đổi theme"], 1, "Link CRM."),
            qitem("h11", "Chip phân loại xưởng trên header SX cho biết?", ["Màu áo thợ", "Pipeline đang theo công ty + loại hàng", "KPI tháng", "Mật khẩu"], 1, "workshop_type."),
            qitem("h12", "Người vận chuyển phụ trách chọn ở đâu?", ["Tab Đặt hàng CRM", "Cột trái Thông tin trang VC", "App Switcher", "Thùng rác"], 1, "VC select."),
        ],
        duration=14,
    )

    task_attach_btn = "**Gắn mẫu VC/LĐ**" if is_vc else "**Gắn mẫu** / **Bổ sung thiếu SX**"
    giao_viec_label = "Giao việc VC" if is_vc else "Giao việc Sản xuất"

    add(3,
        "Bài 3: Tab Công việc — mẫu, thêm việc, xong hết",
        f"Cùng nút với CRM: {task_attach_btn}, Thêm việc, Xong hết, List/Deadline/Planner/Lịch.",
        f"""# Bài 3: Tab Công việc — mẫu, thêm việc, xong hết

> _Thanh nút giống CRM — chỉ khác bộ mẫu {mod_label}._

## 1. Mở tab Công việc

Cùng component với CRM. Trên {mod_label} bạn thấy việc của khối mình.

## 2. Từng nút (cùng tên với CRM)

1. {task_attach_btn} — gắn đúng bộ mẫu {mod_label}.
2. **List** · **Deadline** · **Planner** · **Lịch** — đổi cách xem.
3. **Thêm việc** — thêm 1 việc trong nhóm.
4. **Xong hết** — hoàn thành cả nhóm khi thật sự xong.
5. Từng dòng: hoàn thành, hạn, file, checklist, **{giao_viec_label}**.

Nếu dự án chưa gắn CRM deal, có panel mẫu xưởng/VC thay thế — vẫn **Gắn mẫu**, **Thêm việc**.

## 3. Lỗi hay gặp

- Gắn mẫu CRM trên trang xưởng — chọn mẫu **{mod_label}**.
- Bấm Xong hết khi việc ngoài hiện trường chưa xong.

---

Bài sau: Không gian chung và Thành viên (giống CRM).
""",
        "lead-05-nhiem-vu.png",
        att(("lead-05-nhiem-vu.png", "Tab Công việc — cùng UI CRM")),
        [
            qitem("t1", "Tab Công việc SX/VC khác CRM chủ yếu ở?", ["Màu nút Xóa", "Bộ mẫu và nhãn Giao việc theo khối", "Không có Thêm việc", "Không có List"], 1, "Cùng CRMTasksTab."),
            qitem("t2", "Thêm việc làm gì?", ["Tạo deal", "Thêm nhiệm vụ trong nhóm đang mở", "Xóa dự án", "Đổi công ty"], 1, "Giống CRM."),
            qitem("t3", "Xong hết nên bấm khi?", ["Đầu ca", "Nhóm việc thật sự đã xong", "Khi thẻ còn TẠM", "Mỗi giờ"], 1, "Giống CRM."),
            qitem("t4", "Gắn mẫu VC/LĐ dùng trên trang nào?", ["Chỉ CRM lead", "Chi tiết dự án VC/LĐ (hoặc pack VC trên deal)", "KPI", "Thùng rác"], 1, "VC templates."),
            qitem("t5", "List / Deadline / Planner / Lịch là?", ["4 khoá học", "4 cách xem cùng list việc", "4 xưởng", "4 Sale"], 1, "View switcher."),
            qitem("t6", f"{giao_viec_label} trên dòng việc mở gì?", ["Login", "Bảng giao việc của khối", "MISA", "Facebook"], 1, "Assignments."),
            qitem("t7", "Bổ sung thiếu SX có trên VC không?", ["Luôn", "Đó là nút pack xưởng — trên VC dùng Gắn mẫu VC/LĐ", "Bắt buộc VC", "Xóa việc"], 1, "Khác nhãn."),
            qitem("t8", "Không có CRM deal thì tab Công việc?", ["Trống vĩnh viễn", "Dùng panel mẫu xưởng/VC: Gắn mẫu, Thêm việc", "Tự tạo Lead", "Đổi sang Đặt hàng"], 1, "Workshop fallback."),
            qitem("t9", "Học viên CRM và xưởng cùng thấy Thêm việc vì?", ["Copy nhầm", "Hai module dùng cùng tab Công việc", "Bug", "Chỉ admin thấy"], 1, "Shared UI."),
            qitem("t10", "Phiếu khảo sát Sale nằm tab Công việc CRM — xưởng có phải điền không?", ["Bắt buộc mọi thợ", "Đó là phiếu Sale; xưởng làm việc mẫu xưởng", "Xóa phiếu", "Chỉ VC điền"], 1, "Đúng vai."),
        ],
    )

    add(4,
        "Bài 4: Không gian chung và Thành viên",
        "Cùng nút với CRM: Thêm giao việc, lọc khối, thêm thành viên.",
        f"""# Bài 4: Không gian chung và Thành viên

> _Cùng tab với CRM — trên {mod_label} lọc mặc định nghiêng về khối mình._

## 1. Không gian chung

Hiện khi dự án gắn CRM deal.

1. Lọc **Tất cả** · **Bán hàng** · **Xưởng** · **Lắp đặt**.
2. **Giao việc** — bảng giao việc khối.
3. **Thêm** — form Giao việc mới → **Lưu** / **Hủy**.
4. **Sửa** / **Xóa** / **Thêm ảnh** trên dòng.

Trên VC, việc mới thường gắn khối **Lắp đặt**. Trên SX — khối **Xưởng**.

![Không gian chung](/uploads/knowledge-screenshots/collab-01.png)

## 2. Thành viên

1. **Thêm thành viên**, **Chọn tất cả** / **Bỏ chọn**, **+ Thêm N người**.
2. Đổi vai / **Xóa**.
3. Link **Mở trang Giao việc**, **Mở Không gian chung**.

Thợ không có trong Thành viên thì **không thấy** dự án (trừ đúng quyền công ty).

## 3. Lỗi hay gặp

- Giao việc Zalo thay vì **Thêm** — mất vết.
- Thêm nhầm người công ty khác — xóa trên tab Thành viên.

---

Bài sau: Tài liệu, Drive, ghi chú, bình luận, sự cố.
""",
        "collab-01.png",
        att(("collab-01.png", "Không gian chung"), ("collab-05.png", "Giao việc")),
        [
            qitem("s1", "Không gian chung trên SX/VC có khi nào?", ["Luôn", "Khi dự án gắn CRM deal", "Chỉ admin", "Khi thẻ TẠM"], 1, "crmLeadId."),
            qitem("s2", "Nút Thêm mở form nào?", ["Xóa dự án", "Giao việc mới", "Đặt xưởng", "Import Excel"], 1, "Giống CRM."),
            qitem("s3", "Lọc Xưởng / Lắp đặt để?", ["Đổi App Switcher", "Lọc việc theo khối", "Xóa file", "Tạo PO"], 1, "Chips."),
            qitem("s4", "Thành viên quyết định?", ["Giá SX", "Ai xem được dự án/deal", "Màu cột", "Ca làm"], 1, "Membership."),
            qitem("s5", "Thợ không có trong Thành viên thì?", ["Vẫn thấy mọi deal", "Không vào được (trừ đúng quyền)", "Tự được thêm lúc login", "Chỉ mất KPI"], 1, "Access."),
            qitem("s6", "Giao việc chỉ Zalo — sai vì?", ["Nhanh hơn", "Mất vết trên hệ thống", "Bắt buộc", "Tăng KPI"], 1, "Ghi app."),
            qitem("s7", "Sửa / Xóa dòng giao việc ở đâu?", ["Login", "Từng dòng tab Không gian chung", "Thùng rác tổng", "KPI"], 1, "Row actions."),
            qitem("s8", "Mở trang Giao việc từ Thành viên để?", ["Đăng xuất", "Sang bảng giao việc đầy đủ", "Xóa user", "Đổi pass"], 1, "Navigate."),
            qitem("s9", "Form Giao việc mới cần?", ["Chỉ tiêu đề trống", "Người nhận, mô tả, hạn — rồi Lưu", "Mã số thuế", "Ảnh đại diện công ty"], 1, "Form."),
            qitem("s10", "CRM và SX thấy cùng Không gian chung vì?", ["Hai deal khác", "Cùng deal — giao chéo khối", "Bug", "Chỉ khi thua"], 1, "Shared workspace."),
        ],
        duration=10,
    )

    add(5,
        "Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Sự cố",
        "Cùng nút file/ghi chú với CRM, thêm Báo sự cố. Bình luận chứa dấu vết bàn giao.",
        f"""# Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Sự cố

> _File bản vẽ phải chia sẻ đúng khối — {mod_label} mới thấy._

## 1. Tài liệu

1. **Upload file xưởng** (nhãn gần giống CRM **Upload file**).
2. **Nhập văn bản**, **Tải tất cả (N)**.
3. Từng file: **Tải**, **Chia sẻ CRM**, bánh răng chia sẻ khối, **Xóa**, phóng to ảnh.

Sale upload trên CRM mà **chưa chia sẻ SX/VC** thì tab này trống.

## 2. Drive / Ghi chú / Bình luận

Cùng nút CRM: thư mục Drive, Gửi ghi chú, bình luận **Trả lời / Sửa / Xóa**.

Xưởng **không** bấm **Chọn & bàn giao** — nút đó của Sale trên CRM. Xưởng chỉ việc chuyển cột bàn giao (bài 2).

![Thẻ bàn giao phía Sale — để biết kết quả](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

## 3. Tab Sự cố (có trên SX và VC, không có trên CRM chi tiết)

1. **Báo sự cố** — mở form.
2. **Gửi báo cáo**.
3. **Đã xử lý** khi xong.

## 4. Lỗi hay gặp

- Báo sự cố trên Zalo nhóm — không vào báo cáo xưởng.
- Tìm Chọn & bàn giao trên trang VC — không có; Sale bấm trên CRM.

---

Bài 6: nút riêng module + thực hành.
""",
        "deal-05-hop-dong.png",
        att(("deal-05-hop-dong.png", "Tài liệu"), ("sx-vc-09-the-ban-giao.png", "Kết quả bàn giao phía Sale")),
        [
            qitem("d1", "Xưởng không thấy bản vẽ CRM — hay vì?", ["Hết dung lượng Zalo", "File chưa chia sẻ sang khối SX", "Sai mật khẩu", "Thiếu KPI"], 1, "Share."),
            qitem("d2", "Tải tất cả làm gì?", ["Xóa", "ZIP tài liệu", "Tạo Lead", "Đổi cột"], 1, "ZIP."),
            qitem("d3", "Tab Sự cố có trên chi tiết CRM không?", ["Có, tên Ghi âm", "Không — Sự cố ở trang SX/VC", "Chỉ Lead", "Chỉ khi thắng"], 1, "SX/VC."),
            qitem("d4", "Báo sự cố các bước?", ["Xóa dự án", "Báo sự cố → điền → Gửi báo cáo; xong thì Đã xử lý", "Import Excel", "Chuyển Deal"], 1, "Incident CRUD."),
            qitem("d5", "Chọn & bàn giao ai bấm, ở đâu?", ["Thợ VC trên trang VC", "Sale trên CRM tab Bình luận", "Kế toán tab Đặt hàng", "Admin theme"], 1, "Khóa 534."),
            qitem("d6", "Nhập văn bản tạo gì?", ["User", "Tài liệu chữ trên hệ thống", "Cột Kanban", "PO"], 1, "Text doc."),
            qitem("d7", "Chia sẻ CRM trên file xưởng để?", ["Xóa file", "Sale đọc được file từ khối xưởng", "Đổi xưởng", "In lương"], 1, "Share reverse."),
            qitem("d8", "Ghi chú Gửi nhanh?", ["F1", "Ctrl+Enter", "Shift+F5", "Esc"], 1, "Giống CRM."),
            qitem("d9", "Drive tab dùng khi?", ["File Google Drive gắn dự án", "Đổi pipeline", "KPI", "Login"], 0, "Drive."),
            qitem("d10", "Bình luận Trả lời / Sửa / Xóa là?", ["Xóa dự án", "Thao tác từng comment", "Bàn giao VC tự động", "Tạo sự kiện"], 1, "Comments."),
            qitem("d11", "Sự cố không ghi trên app thì?", ["Vẫn vào báo cáo", "Mất vết, quản lý không thấy", "KPI tăng", "Tự tạo Lead"], 1, "Ghi app."),
            qitem("d12", "Upload file xưởng khác Upload CRM?", ["Khác chỗ bấm, cùng ý: đưa file vào đơn", "Xóa deal", "Chỉ PDF", "Chỉ admin VC"], 0, "Cùng ý."),
        ],
    )
    if is_vc:
        md6 = """# Bài 6: Nút riêng VC/LĐ và thực hành cả trang

> _Hai việc chỉ tổ lắp cần thuộc: banner TẠM, và gán đội xe / thợ._

## 1. Nút / trạng thái riêng VC

- Banner **Lắp đặt tạm** — không kéo stepper sang cột khác.
- Cột trái: **Người vận chuyển phụ trách**, **Đội vận chuyển**, **Người lắp đặt**, **Đội lắp đặt**.
- Tab Công việc: **Gắn mẫu VC/LĐ**, **Giao việc VC**.
- **Không có** Đặt xưởng khác, Vật tư, Gửi duyệt.

Khi Sale đã **Chọn & bàn giao**: banner TẠM mất, kéo cột **Chờ giao hàng → Đang giao → Lắp đặt → Nghiệm thu**.

Luồng đầy đủ (Sale lập kế hoạch): khoá **Kế hoạch SX & VC/LĐ**.

## 2. Đề bài thực hành

Mở dự án trên `/vc/projects/...` (cùng đơn với deal THUCHANH nếu có):

1. Đọc badge **VC** và banner TẠM (nếu có).
2. Header: **CRM deal**, **Dự án đầy đủ** — mở rồi quay lại.
3. Cột trái: chỉ đúng chỗ chọn đội lắp (không đổi nếu đang dự án thật — hoặc Hủy).
4. Tab Công việc: thấy **Thêm việc** hoặc **Gắn mẫu VC/LĐ**.
5. Không gian chung: **Thêm** → xem form → **Hủy**.
6. Sự cố: thấy **Báo sự cố** (không gửi báo cáo giả).
7. Thử stepper khi còn TẠM: bị chặn là đúng.

## 3. Phiếu tự kiểm rồi thi cuối

Tick checklist dưới bài. Deal/dự án tập đặt tên **THUCHANH - …**.
"""
        quiz6 = [
            qitem("f1", "Đặt xưởng khác có trên VC không?", ["Có", "Không", "Chỉ khi TẠM", "Chỉ thợ"], 1, "SX-only."),
            qitem("f2", "Tab Vật tư trên VC?", ["Có", "Không — chỉ SX", "Chỉ admin", "Khi nghiệm thu"], 1, "Hidden."),
            qitem("f3", "Banner Lắp đặt tạm nghĩa là?", ["Kéo cột tự do", "Chưa bàn giao thật — không kéo cột", "Hết việc", "Deal thua"], 1, "Lock."),
            qitem("f4", "Gắn mẫu VC/LĐ ở tab nào?", ["Đặt hàng", "Công việc", "KPI", "Drive"], 1, "Tasks."),
            qitem("f5", "Ai bấm Chọn & bàn giao?", ["Thợ VC trên trang này", "Sale trên CRM Bình luận", "Kế toán", "Mọi user"], 1, "Sale."),
            qitem("f6", "Sau khi hết TẠM, thẻ VC làm gì?", ["Xóa", "Kéo theo tiến độ: chờ giao → đang giao → lắp → nghiệm thu", "Trả về Lead", "Tạo PO"], 1, "Normal move."),
            qitem("f7", "Người vận chuyển phụ trách chọn ở?", ["Header cam", "Cột trái Thông tin", "App Switcher", "Thùng rác"], 1, "Info panel."),
            qitem("f8", "Sự cố Báo sự cố để?", ["Tính lương", "Ghi sự cố công trình trên hệ thống", "Xóa dự án", "Import Excel"], 1, "Incident."),
            qitem("f9", "CRM deal trên header VC mở?", ["Login", "Chi tiết Lead/Deal cùng đơn", "KPI giám đốc", "Theme"], 1, "Link."),
            qitem("f10", "Nhìn ảnh thẻ TẠM. Badge nghĩa là?", ["Đã giao xong", "Khoá chuyển cột — chờ xưởng + Sale", "VIP", "Xóa được"], 1, "TẠM.", "sx-vc-07b-the-tam-ghi-chu.png"),
            qitem("f11", "Không gian chung Thêm là?", ["Xóa đội", "Giao việc mới", "Đặt xưởng", "Gửi duyệt"], 1, "Assign."),
            qitem("f12", "Form kế hoạch ngày lắp học ở?", ["Bài này đủ", "Khoá Kế hoạch SX & VC/LĐ", "Tab Sự cố", "MISA"], 1, "534."),
            qitem("f13", "Gửi duyệt có trên VC?", ["Có", "Không — tab chỉ SX", "Chỉ khi TẠM", "Thay Sự cố"], 1, "SX-only."),
            qitem("f14", "Tải tất cả trên Tài liệu?", ["Xóa ZIP", "Tải ZIP file", "Tạo Lead", "Đổi cột"], 1, "ZIP."),
            qitem("f15", "Kéo thẻ TẠM sang cột khác — đúng là?", ["Thẻ chạy", "Hệ thống chặn", "Tạo dự án mới", "Xóa badge"], 1, "Blocked."),
        ]
        cover6 = "sx-vc-07b-the-tam-ghi-chu.png"
        checklist6 = [
            "Mở chi tiết dự án VC: thấy badge VC và 3 vùng màn hình",
            "Chỉ đúng banner Lắp đặt tạm nếu dự án còn TẠM",
            "Header: biết nút CRM deal và Dự án đầy đủ — không có Đặt xưởng khác",
            "Cột trái: chỉ chỗ chọn người/đội VC-LĐ",
            "Tab Công việc: thấy Thêm việc hoặc Gắn mẫu VC/LĐ",
            "Không gian chung: mở form Thêm rồi Hủy",
            "Sự cố: thấy nút Báo sự cố",
            "Hiểu: Chọn & bàn giao do Sale bấm trên CRM, không phải trên trang VC",
        ]
    else:
        md6 = """# Bài 6: Nút riêng Sản xuất và thực hành cả trang

> _Ba nút chỉ xưởng: Đặt xưởng khác, Vật tư, Gửi duyệt — cộng bước bàn giao VC._

## 1. Tab Vật tư / Mua hàng (chỉ SX)

- **Thêm hạng mục**, sửa/xóa dòng, **Thêm NCC nhanh**, lưu.

## 2. Tab Gửi duyệt (chỉ SX)

- **Gửi yêu cầu duyệt** / **Gửi yêu cầu**.
- Người duyệt: **Duyệt** / **Từ chối**.

## 3. Đặt xưởng khác + bàn giao VC (nhắc bài 2)

- Header **Đặt xưởng khác** → form → **Tạo dự án**.
- Stepper cột hoàn thiện → popup **Bàn giao sang VC** → **Xác nhận bàn giao**.
- **Chuyển phân loại** nếu cột yêu cầu đổi loại hàng.

Sale mới bấm **Chọn & bàn giao** trên CRM. Học luồng đủ ở khoá **Kế hoạch SX & VC/LĐ**.

## 4. Đề bài thực hành

Mở `/sx/projects/...`:

1. Badge **SX**, chip công ty / phân loại.
2. Header: **Đặt xưởng khác** (chỉ xem, đừng tạo rác trừ deal THUCHANH), **CRM deal**, **Dự án đầy đủ**.
3. Cột trái: **Phân công Sản xuất**.
4. Công việc: **Thêm việc** hoặc **Bổ sung thiếu SX**.
5. Vật tư: thấy **Thêm hạng mục** (Hủy nếu không nhập thật).
6. Gửi duyệt: thấy **Gửi yêu cầu** (không gửi duyệt giả trên đơn khách).
7. Sự cố: **Báo sự cố**.
8. Biết cột nào là bàn giao VC — không bấm trên đơn khách nếu chưa đến bước.

## 5. Thi cuối

Tick checklist rồi làm bài kiểm tra 80%.
"""
        quiz6 = [
            qitem("f1", "Tab Vật tư có trên VC không?", ["Có", "Không — chỉ SX", "Chỉ khi TẠM", "Thay Gửi duyệt"], 1, "SX-only."),
            qitem("f2", "Gửi duyệt các nút?", ["Xóa dự án", "Gửi yêu cầu duyệt; người duyệt Duyệt hoặc Từ chối", "Import Excel", "Chuyển Deal"], 1, "Approvals."),
            qitem("f3", "Đặt xưởng khác tạo ra?", ["Lead mới", "Dự án SX thêm ở xưởng/công ty khác", "PO CRM", "User"], 1, "Place."),
            qitem("f4", "Nhìn ảnh. Cột bàn giao xưởng thường tên gần với?", ["Lead mới", "Đơn hàng đã chuẩn bị xong", "Thùng rác", "KPI"], 1, "Handover.", "sx-vc-08-sx-ban-giao.png"),
            qitem("f5", "Sau khi xưởng xác nhận bàn giao VC, ai bấm Chọn & bàn giao?", ["Mọi thợ", "Sale trên CRM", "Tài xế", "Khách"], 1, "Sale."),
            qitem("f6", "Thêm hạng mục nằm tab nào?", ["Thành viên", "Vật tư / Mua hàng", "Ghi âm", "Đặt hàng CRM"], 1, "Procurement."),
            qitem("f7", "Chuyển phân loại hiện khi?", ["Login", "Cột stepper có cờ đổi loại xưởng", "Mọi cột", "Tab Drive"], 1, "is_switch_workshop_type."),
            qitem("f8", "Phân công Sản xuất ở?", ["App Switcher", "Cột trái Thông tin", "Thùng rác", "KPI giám đốc"], 1, "Select."),
            qitem("f9", "Báo sự cố tab?", ["CRM Đặt hàng", "Sự cố", "Facebook", "MISA"], 1, "Incidents."),
            qitem("f10", "Không gian chung Thêm?", ["Xóa xưởng", "Giao việc mới", "Tạo Lead", "Duyệt"], 1, "Assign."),
            qitem("f11", "File CRM xưởng không thấy — làm?", ["Đổi pass", "Nhờ Sale chia sẻ sang khối SX", "Xóa deal", "Tạo PO"], 1, "Share."),
            qitem("f12", "Form ngày lắp / cột tạm học ở?", ["Tab Vật tư", "Khoá Kế hoạch SX & VC/LĐ", "Gửi duyệt", "Theme"], 1, "534."),
            qitem("f13", "Xong hết tab Công việc khi?", ["Đầu ca", "Việc nhóm thật sự xong", "Thẻ TẠM", "Mỗi giờ"], 1, "Done."),
            qitem("f14", "Popup Bàn giao sang VC có nút?", ["Xóa công ty", "Xác nhận bàn giao", "Import Excel", "Chuyển Deal"], 1, "Confirm."),
            qitem("f15", "Gửi yêu cầu duyệt trên đơn khách khi chưa đến bước — nên?", ["Cứ gửi", "Không — chỉ thực hành trên deal THUCHANH hoặc đơn đúng bước", "Gửi 3 lần", "Xóa dự án"], 1, "Không rác."),
        ]
        cover6 = "sx-vc-08-sx-ban-giao.png"
        checklist6 = [
            "Mở chi tiết dự án SX: badge SX, 3 vùng màn hình",
            "Header: chỉ Đặt xưởng khác, CRM deal, Dự án đầy đủ",
            "Cột trái: chỉ Phân công Sản xuất / ngày hoàn thiện",
            "Tab Công việc: thấy Thêm việc hoặc Bổ sung thiếu SX",
            "Tab Vật tư: thấy Thêm hạng mục (không lưu rác)",
            "Tab Gửi duyệt: thấy Gửi yêu cầu (không gửi giả trên đơn khách)",
            "Tab Sự cố: thấy Báo sự cố",
            "Hiểu: xưởng bàn giao cột → Sale mới Chọn & bàn giao trên CRM",
        ]

    add(6,
        f"Bài 6: Nút riêng {mod_label} và thực hành cả trang",
        f"Nút chỉ có trên {mod_label}, phiếu tự kiểm, thi cuối nhận chứng nhận.",
        md6,
        cover6,
        att((cover6, f"Thực hành {mod_label}"), ("sx-vc-09b-chon-ban-giao.png", "Sale xác nhận trên CRM — biết kết quả")),
        quiz6,
        duration=25,
        final=True,
        checklist=checklist6,
        quiz_title=f"Bài kiểm tra cuối: Từng nút trên chi tiết {mod_label}",
        quiz_instr="Làm xong phiếu tự kiểm rồi vào đây. 15 câu, một số có ảnh. Đạt 80%, tối đa 3 lượt, 25 phút.",
        passing=80,
        time_limit=25,
    )

    return cat, lessons, exercises
