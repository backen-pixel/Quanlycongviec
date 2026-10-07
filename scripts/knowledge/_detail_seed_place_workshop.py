# -*- coding: utf-8 -*-
"""Khoá «Đặt xưởng khác» — nút trên trang chi tiết SX (ProductionDetail)."""
from _detail_seed_helpers import img, qitem, att


def place_workshop_bundle():
    cat_id = "d2000009-0000-0000-0000-000000000001"
    lp, cp, clp = "b2000009", "c2000009", "c2000009-0000-0001"

    def L(n):
        return f"{lp}-0000-0000-0000-00000000000{n}"

    def C(n):
        return f"{cp}-0000-0000-0000-00000000000{n}"

    def CL(n):
        return f"{clp}-0000-00000000000{n}"

    cat = {
        "id": cat_id,
        "name": "Đặt xưởng khác — từ dự án SX sang xưởng nhận",
        "slug": "dat-xuong-khac",
        "description": (
            "Dành cho xưởng sản xuất. Học nút indigo «Đặt xưởng khác» trên trang chi tiết dự án SX: "
            "khi nào dùng, ai được bấm, điền form ngày/VC giống khoá Kế hoạch SX & VC/LĐ, rồi kiểm dự án nhận, "
            "thành viên và thẻ lắp đặt tạm."
        ),
        "icon": "🏭",
        "sort_order": 44,
        "deadline_note": "Hoàn thành khoá trong 14 ngày kể từ khi mở bài đầu tiên",
        "certificate_template": {
            "signature_name": "Ban điều hành TuBep Pro",
            "signature_title": "Phụ trách đào tạo vận hành",
            "footer_note": "Chứng nhận đã nắm nút Đặt xưởng khác và quy tắc kế hoạch SX & VC/LĐ khi đặt sang xưởng nhận.",
            "accent_color": "#4f46e5",
        },
    }

    lessons, exercises = [], []

    def add(num, title, summary, md, cover, attachments, quiz, duration=12, final=False,
            checklist=None, quiz_title=None, quiz_instr=None, passing=None, time_limit=None):
        lid = L(num)
        lessons.append({
            "id": lid, "category_id": cat_id, "title": title, "summary": summary,
            "content_md": md, "cover": img(cover), "attachments": attachments,
            "duration": duration, "tags": ["dat-xuong", "sx", f"bai-{num}"],
            "sort_order": num, "final": final,
        })
        exercises.append({
            "id": C(num), "lesson_id": lid,
            "title": quiz_title or f"Bài kiểm tra: {title.split(': ', 1)[-1]}",
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
                "instructions": (
                    "Đánh dấu khi đã làm được trên phần mềm. "
                    "Chỉ tạo dữ liệu trên deal/dự án THUCHANH — hủy form nếu chỉ xem."
                ),
                "type": "checklist",
                "questions": {"items": [{"id": f"c{i+1}", "text": t} for i, t in enumerate(checklist)]},
                "passing": 80, "max_attempts": None, "time_limit": None, "sort_order": 2,
                "image_url": img(cover), "attachments": [],
            })

    add(
        1,
        "Bài 1: Vì sao cần «Đặt xưởng khác»",
        "Phân biệt nút xưởng với kế hoạch Sale trên CRM, và với «Chuyển phân loại» cùng công ty.",
        """# Bài 1: Vì sao cần «Đặt xưởng khác»

Một đơn tủ bếp đôi khi **không làm hết ở một xưởng**. Ví dụ Metalla làm thân tủ, HCB làm cánh kính; hoặc xưởng nhà thiếu công đoạn CNC nên đặt gia công ngoài.

Sale đã lập kế hoạch lần đầu trên CRM (khoá **Kế hoạch SX & VC/LĐ**). Khi đơn **đã có dự án SX** mà cần thêm xưởng thứ hai, người xưởng bấm nút indigo **Đặt xưởng khác** trên trang chi tiết dự án — không tạo deal mới, không xóa dự án đang làm.

## 1. Ba đường dễ lẫn

| Việc cần làm | Bấm đâu | Kết quả |
|---|---|---|
| Lần đầu: chọn xưởng, ngày lắp, VC/LĐ | CRM deal → **Thiết lập kế hoạch SX & VC/LĐ** | Tạo dự án SX + thẻ lắp đặt tạm |
| Thêm xưởng thứ hai / gia công ngoài | Trang SX → **Đặt xưởng khác** | Tạo thêm dự án ở **công ty SX khác** |
| Đổi loại hàng **cùng** công ty (Tủ bếp → Tủ áo) | Stepper cột có cờ chuyển phân loại | Đổi pipeline, **không** tạo xưởng mới |

Ảnh dưới là form kế hoạch phía **Sale** — cùng bảng chọn xưởng, phân loại, ngày. Nút xưởng dùng **cùng form đó**, chỉ khác chỗ bấm và nút chốt là **Tạo dự án**.

![Form kế hoạch SX & VC/LĐ trên CRM — cùng ô xưởng, phân loại, ngày lắp](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

## 2. Tư tưởng

- **Một deal, nhiều thẻ xưởng.** Mỗi cặp *công ty SX + phân loại* thành một dự án riêng trên Kanban xưởng nhận.
- **Xưởng nguồn không «đẩy việc» bằng Zalo.** Hệ thống tạo dự án, thêm NV mặc định vào thành viên deal, gửi bình luận @.
- **Lịch lắp / VC điền một lần, xưởng nhận dùng chung.** Form Đặt xưởng khác prefill ngày lắp, lấy hàng, công ty VC và ghi chú từ dự án nguồn — sửa nếu xưởng nhận khác lịch.

## 3. Tư duy — khi nào KHÔNG bấm

- Deal **chưa** có dự án SX → Sale dùng **Thiết lập kế hoạch**, không vào trang xưởng để đặt.
- Chỉ muốn đổi cột / phân loại **trong cùng xưởng** → dùng stepper **Chuyển phân loại**, không đặt xưởng khác.
- Đang ở module **VC/LĐ** → nút **không có**. Chỉ trang `/sx/projects/:id`.
- Đặt sang **chính công ty đang mở** → hệ thống từ chối. Phải chọn xưởng khác.

## 4. Ai làm gì sau khi đặt

1. **Xưởng nguồn** — chọn xưởng nhận + phân loại + ngày/VC, bấm **Tạo dự án**.
2. **Xưởng nhận** — thấy thẻ mới trên board mình, làm hàng, bấm cột bàn giao khi xong (như khoá kế hoạch bài 4).
3. **Sale** — đọc bình luận «đã đặt xưởng»; khi xưởng nhận bàn giao thì **Chọn & bàn giao** VC như đơn thường.
4. **VC/LĐ** — nếu form có công ty VC: thẻ vào cột lắp đặt tạm (badge **TẠM**) cho tới khi Sale xác nhận.

---

Bài sau: nút ở đâu, ai thấy, form mở ra những ô nào.
""",
        "sx-vc-04b-form-cac-buoc.png",
        att(
            ("sx-vc-03-nut-ke-hoach.png", "CRM — nút Thiết lập kế hoạch (lần đầu, phía Sale)"),
            ("sx-vc-04b-form-cac-buoc.png", "Cùng form xưởng / phân loại / ngày — xưởng dùng lại khi đặt xưởng khác"),
            ("sx-vc-08-sx-ban-giao.png", "Trang chi tiết SX — chỗ có nút Đặt xưởng khác trên header"),
        ),
        [
            qitem("p1", "Nút Đặt xưởng khác dùng khi nào?",
                  ["Tạo deal CRM mới", "Thêm dự án SX ở công ty/xưởng khác cho đơn đã có", "Xóa dự án nguồn", "Đổi mật khẩu"],
                  1, "Gia công ngoài / xưởng thứ hai. Không tạo deal mới."),
            qitem("p2", "Sale lập kế hoạch lần đầu trên màn nào?",
                  ["Trang VC/LĐ", "Chi tiết deal CRM — nút Thiết lập kế hoạch SX & VC/LĐ", "KPI", "Thùng rác"],
                  1, "Khoá Kế hoạch SX & VC/LĐ. Ảnh nút cam trên header deal.",
                  "sx-vc-03-nut-ke-hoach.png"),
            qitem("p3", "Đổi Tủ bếp → Tủ áo trong CÙNG công ty thì bấm gì?",
                  ["Đặt xưởng khác", "Stepper Chuyển phân loại", "Tạo Lead", "Import Excel"],
                  1, "Cùng công ty thì đổi pipeline, không tạo xưởng mới."),
            qitem("p4", "Nút Đặt xưởng khác có trên trang VC/LĐ không?",
                  ["Có, cùng chỗ header", "Không — chỉ module Sản xuất", "Chỉ khi badge TẠM", "Chỉ thợ lắp"],
                  1, "moduleKey !== vc. Trang /sx/projects/:id."),
            qitem("p5", "Đặt sang chính công ty của dự án đang mở thì sao?",
                  ["Được, tạo bản sao", "Hệ thống từ chối — phải chọn xưởng khác", "Tự đổi tên deal", "Xóa dự án nguồn"],
                  1, "Không thể đặt sang chính công ty nguồn."),
            qitem("p6", "Một deal có được nhiều thẻ xưởng không?",
                  ["Không, chỉ một dự án mãi", "Được — mỗi cặp công ty SX + phân loại là một dự án", "Chỉ admin hệ thống", "Chỉ khi thua deal"],
                  1, "Metalla + HCB cùng một đơn."),
            qitem("p7", "Nhìn ảnh. Ô khung 1 trên form kế hoạch là gì?",
                  ["Công ty kế toán", "Công ty SX (xưởng)", "Mật khẩu", "Nguồn lead"],
                  1, "Cùng ô khi xưởng đặt xưởng khác.",
                  "sx-vc-04b-form-cac-buoc.png"),
            qitem("p8", "Sau khi đặt, ai bấm Chọn & bàn giao VC?",
                  ["Thợ xưởng nhận trên Kanban SX", "Sale CRM trên tab Bình luận deal — như khoá kế hoạch", "Tài xế trên app", "Kế toán tab Đặt hàng"],
                  1, "Xưởng chỉ báo hoàn thiện; Sale xác nhận lần hai."),
            qitem("p9", "Đơn chưa có dự án SX thì xưởng có nên bấm Đặt xưởng khác không?",
                  ["Có, thay Sale", "Không — Sale lập kế hoạch lần đầu trên CRM", "Bắt buộc VC bấm", "Chỉ khi hết hạn"],
                  1, "Nút dành cho đơn đã có dự án nguồn."),
            qitem("p10", "Khác nhau nút chốt: Sale trên CRM vs xưởng Đặt xưởng khác?",
                  ["Sale: Thêm dự án / Lưu lịch — Xưởng: Tạo dự án", "Cả hai bấm Xóa deal", "Cả hai bấm Import Excel", "Không có nút chốt"],
                  0, "Cùng form, khác nhãn nút cuối."),
        ],
        duration=10,
    )

    add(
        2,
        "Bài 2: Nút ở đâu, ai được bấm, form mở ra gì",
        "Header trang chi tiết SX, quyền admin/NV xưởng cùng công ty, form prefill ngày/VC từ dự án nguồn.",
        """# Bài 2: Nút ở đâu, ai được bấm, form mở ra gì

> _Nhìn badge **SX** trên header. Nút màu indigo, icon nhà máy, chữ **Đặt xưởng khác** — bên trái **Dự án đầy đủ**._

## 1. Nguồn lực — chỗ bấm

1. Vào **Sản xuất** → mở đúng thẻ dự án nguồn (`/sx/projects/:id`).
2. Trên hàng nút header (cùng hàng với tên deal): nút indigo **Đặt xưởng khác**.
3. Không thấy nút: đang ở **VC/LĐ**, hoặc tài khoản không thuộc công ty dự án và không phải admin.

Ảnh trang dự án SX (stepper bàn giao). Nút **Đặt xưởng khác** nằm **phía trên**, cùng hàng header — không nằm trên stepper.

![Trang chi tiết SX — stepper và header dự án](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 2. Ai được bấm

Hệ thống cho phép khi **một** trong các điều sau đúng:

- Admin hệ thống hoặc tài khoản admin-like.
- Nhân viên / admin **Sản xuất** đúng **công ty của dự án nguồn**.

NV xưởng công ty khác, Sale-only, thợ VC: **không** thấy nút (trừ admin).

## 3. Form mở ra — cùng bảng CRM

Overlay **Đặt xưởng khác**:

- Cột trái: chọn **công ty SX nhận** (danh sách **đã loại** công ty đang mở) + **phân loại**.
- Ngày lắp, giờ **Sáng / Chiều**, hoàn thiện SX, lấy hàng VC, **công ty VC/LĐ**, ghi chú — giống khoá kế hoạch.
- Cột phải: **Lịch sự kiện VC/LĐ** (xem trước mốc).
- Ngày/VC **điền sẵn** từ dự án nguồn. Sửa nếu xưởng nhận khác lịch.
- Cuối overlay: **Hủy** và **Tạo dự án**.

Không còn công ty SX nào khác → dòng vàng «Không còn công ty SX khác để đặt».

## 4. Khối Đặt xưởng ở cột trái Thông tin

Sau khi đã đặt ít nhất một lần, cột trái hiện khối **Đặt xưởng**:

- **Đã đặt** — link sang dự án xưởng nhận (mã · tên xưởng, phân loại, ngày lắp / hoàn thiện, NV mặc định).
- **Nhận đặt từ** — khi bạn đang mở đúng dự án *nhận*: link về xưởng nguồn.
- **Xem bình luận thông báo →** nhảy tab Bình luận.

## 5. Lỗi hay gặp

- Tìm nút trên `/vc/projects/:id` — không có.
- Form trống công ty — đang tải, hoặc mọi xưởng SX đã đặt hết / chỉ còn đúng công ty mình.
- Bấm **Tạo dự án** mờ — chưa chọn đủ công ty + phân loại, hoặc đang tải phân loại.

---

Bài sau: điền form đúng quy tắc ngày và VC (lấy từ khoá Kế hoạch SX & VC/LĐ).
""",
        "sx-vc-08-sx-ban-giao.png",
        att(
            ("sx-vc-08-sx-ban-giao.png", "Trang chi tiết SX — header có Đặt xưởng khác (indigo)"),
            ("sx-vc-04-form-ngay-gio.png", "Form ngày giờ — prefill từ dự án nguồn, vẫn sửa được"),
            ("sx-vc-05-chon-vc-ghi-chu.png", "Công ty VC/LĐ và ghi chú — cùng ô với kế hoạch Sale"),
        ),
        [
            qitem("n1", "Nút Đặt xưởng khác nằm ở đâu?",
                  ["Tab Đặt hàng CRM", "Header trang chi tiết SX, cùng hàng Dự án đầy đủ", "Cột KPI tháng", "Cài đặt pipeline VC"],
                  1, "ProductionDetail, moduleKey !== vc."),
            qitem("n2", "Màu / vị trí nút đúng là?",
                  ["Cam trên CRM deal", "Indigo trên header SX, icon nhà máy", "Xám trong tab Sự cố", "Xanh lá Dự án đầy đủ"],
                  1, "bg-indigo-600 — khác nút cam kế hoạch Sale."),
            qitem("n3", "NV SX công ty A mở dự án công ty B (không phải admin) thì?",
                  ["Vẫn bấm được", "Không thấy nút — phải đúng công ty nguồn hoặc admin", "Chỉ xem được form", "Tự đổi công ty dự án"],
                  1, "canPlaceFromSource: cùng company_id hoặc admin."),
            qitem("n4", "Danh sách công ty trên form có gồm xưởng đang mở không?",
                  ["Có, chọn lại chính mình", "Không — hệ thống lọc đúng công ty nguồn", "Chỉ hiện công ty VC", "Chỉ hiện công ty kế toán"],
                  1, "filter id !== sourceCid."),
            qitem("n5", "Ngày lắp / lấy hàng khi mở form lấy từ đâu?",
                  ["Luôn trống", "Prefill từ dự án nguồn (ngày lắp, occurrence, pickup, VC, ghi chú)", "Từ KPI tháng trước", "Từ user đang login"],
                  1, "placeSxInitialRowFromProject."),
            qitem("n6", "Nút chốt trên overlay Đặt xưởng khác tên gì?",
                  ["Thêm dự án", "Tạo dự án", "Chọn & bàn giao", "Lưu lịch"],
                  1, "Khác CRM (Thêm dự án / Lưu lịch)."),
            qitem("n7", "Khối Đặt xưởng cột trái hiện khi nào?",
                  ["Luôn", "Khi đã có ít nhất một lần đặt hoặc đang là dự án nhận", "Chỉ admin", "Khi thẻ TẠM"],
                  1, "placed.length hoặc received_from.length."),
            qitem("n8", "Link trong Đã đặt mở trang nào?",
                  ["/crm/dashboard", "/sx/projects/:id của xưởng nhận", "/ketoan", "/login"],
                  1, "Sang dự án vừa tạo."),
            qitem("n9", "Nhìn ảnh. Hai nút Sáng / Chiều trên form Đặt xưởng khác đặt giờ nào?",
                  ["07:00 và 13:00", "08:00 và 14:00", "09:00 và 15:00", "Không đổi giờ"],
                  1, "Cùng khoá kế hoạch SX & VC/LĐ.",
                  "sx-vc-04-form-ngay-gio.png"),
            qitem("n10", "Ô ghi chú VC/LĐ trên form này khác ô kế hoạch Sale chỗ nào?",
                  ["Khác hẳn, chỉ xưởng thấy", "Cùng ô — ghi chú cho xe và thợ", "Chỉ nhập giá bán", "Chỉ nhập công nợ"],
                  1, "showVcSetup trên SxMultiTargetPicker.",
                  "sx-vc-05-chon-vc-ghi-chu.png"),
            qitem("n11", "Không còn công ty SX khác thì form báo gì?",
                  ["Tạo deal mới", "Dòng vàng: không còn công ty SX khác để đặt", "Xóa dự án nguồn", "Chuyển sang VC"],
                  1, "placeSxCompanies.length === 0."),
            qitem("n12", "Xem bình luận thông báo trên khối Đặt xưởng để làm gì?",
                  ["Xóa thành viên", "Nhảy tab Bình luận xem dòng «đã đặt xưởng» @ NV nhận", "In phiếu lương", "Đổi pipeline"],
                  1, "setTab('comments')."),
        ],
        duration=12,
        checklist=[
            "Mở đúng trang /sx/projects/:id (badge SX, không phải VC)",
            "Nhìn thấy nút indigo Đặt xưởng khác trên header (hoặc biết vì sao không thấy: sai công ty / không phải NV SX)",
            "Mở overlay, thấy danh sách công ty SX đã loại công ty đang mở",
            "Thấy ngày lắp / VC được điền sẵn từ dự án nguồn",
            "Đóng overlay bằng Hủy — chưa bấm Tạo dự án trên đơn thật",
        ],
    )

    add(
        3,
        "Bài 3: Điền form — cùng quy tắc kế hoạch SX & VC/LĐ",
        "Công ty + phân loại, ngày lắp, giờ Sáng/Chiều, hoàn thiện −2 ngày, lấy hàng không sau ngày lắp, VC và ghi chú.",
        """# Bài 3: Điền form — cùng quy tắc kế hoạch SX & VC/LĐ

Form **Đặt xưởng khác** dùng **cùng bộ ô** với khoá **Kế hoạch SX & VC/LĐ** (bài 3). Học một lần, bấm hai chỗ: Sale trên CRM, xưởng trên header SX.

Nếu chưa học khoá kia: đọc kỹ phần dưới. Đã học rồi: coi đây là **phiếu nhắc** khi đặt xưởng nhận.

## 1. Bắt buộc trước khi Tạo dự án

Mỗi dòng xưởng phải có:

1. **Công ty SX nhận** — khác công ty nguồn.
2. **Phân loại** — ví dụ Tủ bếp, Kính, Đá. Trùng *công ty + phân loại* với lần đặt trước thì hệ thống báo đã đặt.

Có thể thêm nhiều dòng (tối đa **5 xưởng / lần**). Không chọn công ty thì nút **Tạo dự án** mờ.

## 2. Ngày lắp, giờ, hoàn thiện SX

Ảnh form — đi theo khung:

![Bước chọn xưởng, phân loại, bấm ngày lắp](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

- **DEADLINE LẮP ĐẶT** — bấm ngày trên lịch. Lắp nhiều ngày thì bấm thêm ô.
- **Giờ lắp** — nút **Sáng** = 08:00, **Chiều** = 14:00. Prefill từ dự án nguồn (thường 14:00 nếu nguồn không có giờ).
- **Hoàn thiện SX** — **tự tính** = ngày lắp đầu trừ **2 ngày**. Ảnh: lắp 27/08 → hoàn thiện 25/08.

![Giờ Sáng/Chiều, hoàn thiện tự tính, lấy hàng VC](/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png)

## 3. Lấy hàng VC và công ty lắp đặt

- **Lấy hàng VC** — ngày xe tới xưởng. **Không được sau ngày lắp.** Cùng ngày hoặc trước thì đạt.
- **CÔNG TY VC / LẮP ĐẶT** — chọn công ty đã bật cột lắp đặt tạm (khoá kế hoạch bài 2).
- **GHI CHÚ CHO BÊN VC/LĐ** — chỉ hiện **sau khi** chọn công ty. Viết dặn xe và thợ: thang máy, chỗ đậu, hàng dễ vỡ.

![Chọn công ty VC/LĐ, ghi chú](/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png)

Đã chọn VC mà **quên ngày lắp** → form chặn. Đã nhập lấy hàng mà quên ngày lắp → cũng chặn.

## 4. Ghi chú nên viết gì (nhắc khoá kế hoạch)

- Hàng dễ vỡ, gọi khách trước 30 phút.
- Thang máy nhỏ, cần 2 thợ mang tay.
- Chỗ đậu xe: mặt tiền sảnh B, sau 18h mới được đậu.

Không viết giá bán, công nợ, mật khẩu.

## 5. Lỗi hay gặp ở bước này

- Đặt trùng HCB + Tủ bếp lần hai → «Đã đặt xưởng này (cùng phân loại) trước đó». Đổi phân loại hoặc mở đúng dự án đã tạo.
- Chọn nhầm **công ty nguồn** — không có trong list; nếu API gửi đúng id nguồn thì server từ chối.
- Không thấy ô ghi chú — chưa chọn công ty VC.
- Ngày lắp để trống nhưng có VC → không chốt được.

---

Làm bài kiểm tra (nhiều câu có ảnh khoá kế hoạch) trước khi qua bài 4.
""",
        "sx-vc-05-chon-vc-ghi-chu.png",
        att(
            ("sx-vc-04b-form-cac-buoc.png", "Xưởng nhận, phân loại, ngày lắp"),
            ("sx-vc-04-form-ngay-gio.png", "Sáng 08:00 / Chiều 14:00, hoàn thiện = lắp − 2 ngày"),
            ("sx-vc-05-chon-vc-ghi-chu.png", "Công ty VC/LĐ và ghi chú"),
            ("sx-vc-06-sua-lich.png", "Cùng ô khi Sale sửa lịch trên CRM"),
        ),
        [
            qitem("f1", "Hai ô bắt buộc trên mỗi dòng Đặt xưởng khác?",
                  ["Giá bán và VAT", "Công ty SX nhận + phân loại", "Mật khẩu và OTP", "Màu áo thợ"],
                  1, "Thiếu một trong hai thì Tạo dự án mờ / API 400."),
            qitem("f2", "Nhìn ảnh. Ô hoàn thiện SX (khung xanh) tính thế nào?",
                  ["Bằng đúng ngày lắp", "Tự tính = ngày lắp trừ 2 ngày", "Phải nhập tay, không tự tính", "Ngày lắp cộng 2 ngày"],
                  1, "Giống khoá kế hoạch. Ảnh: 27/08 → 25/08.",
                  "sx-vc-04-form-ngay-gio.png"),
            qitem("f3", "Nút Sáng / Chiều (khung đỏ) đặt giờ nào?",
                  ["07:00 và 13:00", "08:00 và 14:00", "09:00 và 15:00", "00:00 và 12:00"],
                  1, "Cùng khoá Kế hoạch SX & VC/LĐ.",
                  "sx-vc-04-form-ngay-gio.png"),
            qitem("f4", "Ngày lấy hàng VC so với ngày lắp?",
                  ["Bắt buộc sau ngày lắp", "Không được sau ngày lắp — cùng ngày hoặc trước", "Bỏ trống mãi", "Phải trước đúng 7 ngày"],
                  1, "pickup không after install."),
            qitem("f5", "Nhìn ảnh cuối form. Ô ghi chú (khung 2) hiện khi nào?",
                  ["Luôn", "Sau khi đã chọn công ty VC/LĐ (khung 1)", "Chỉ admin", "Khi thẻ TẠM"],
                  1, "Giống kế hoạch Sale.",
                  "sx-vc-05-chon-vc-ghi-chu.png"),
            qitem("f6", "Nội dung nào NÊN viết vào ghi chú VC/LĐ?",
                  ["Giá bán và công nợ", "Thang máy nhỏ, chỗ đậu xe, hàng dễ vỡ", "Lịch nghỉ Sale", "Mật khẩu Wi‑Fi công ty"],
                  1, "Thứ ảnh hưởng tới xe và thợ.",
                  "sx-vc-05-chon-vc-ghi-chu.png"),
            qitem("f7", "Tối đa bao nhiêu xưởng mỗi lần bấm Tạo dự án?",
                  ["Không giới hạn", "5", "2", "20"],
                  1, "targets.length > 5 → lỗi."),
            qitem("f8", "Đặt lại đúng HCB + Tủ bếp đã đặt trước đó thì sao?",
                  ["Tạo dự án trùng", "Báo đã đặt xưởng này (cùng phân loại) trước đó", "Xóa bản cũ", "Đổi tên deal"],
                  1, "Khóa theo source + company + workshop_type."),
            qitem("f9", "Đã chọn công ty VC nhưng quên ngày lắp?",
                  ["Vẫn lưu", "Form chặn — đã chọn VC thì phải có ngày lắp", "Tự lấy hôm nay", "Chỉ Sale bị chặn"],
                  1, "validateSxTargets."),
            qitem("f10", "Nhìn ảnh popup Sửa lịch CRM. Sau khi đổi ngày, Sale bấm nút nào?",
                  ["Hủy", "Lưu lịch", "Tạo sự kiện", "Đặt xưởng khác"],
                  1, "Xưởng không dùng popup này để đặt; nhắc cùng ô ngày/VC.",
                  "sx-vc-06-sua-lich.png"),
            qitem("f11", "Mỗi công ty VC/LĐ được bật bao nhiêu cột lắp đặt tạm?",
                  ["Không giới hạn", "Đúng một cột — bật cột mới thì cột cũ tự tắt", "Hai cột", "Tuỳ số xưởng"],
                  1, "Khoá kế hoạch bài 2 — vẫn đúng khi đặt xưởng khác."),
            qitem("f12", "Ai điền kế hoạch SX & VC/LĐ lần đầu trên deal?",
                  ["Xưởng sản xuất", "Sale CRM phụ trách deal", "Tổ vận chuyển", "Kế toán"],
                  1, "Xưởng chỉ đặt thêm xưởng nhận; Sale lập lần đầu.",
                  "sx-vc-03-nut-ke-hoach.png"),
        ],
        duration=16,
        quiz_title="Bài kiểm tra: Form ngày / VC — cùng khoá kế hoạch SX & VC/LĐ",
        quiz_instr="12 câu — ảnh lấy từ khoá Kế hoạch SX & VC/LĐ vì form Đặt xưởng khác dùng cùng ô. Đạt 70%, tối đa 3 lượt.",
        time_limit=18,
    )

    add(
        4,
        "Bài 4: Sau khi Tạo dự án — kiểm gì, VC tạm ra sao",
        "Dự án nhận, khối Đặt xưởng, bình luận @, thành viên, mốc lịch và badge TẠM như khoá kế hoạch.",
        """# Bài 4: Sau khi Tạo dự án — kiểm gì, VC tạm ra sao

Bấm **Tạo dự án** xong, overlay đóng, tab **Bình luận** mở. Hệ thống không chỉ «tạo thêm một mã».

## 1. Năm việc hệ thống tự làm

1. **Tạo dự án trên board xưởng nhận** — tên thường «Tên deal · HCB» (hoặc short_name xưởng nhận). Mô tả có dòng «Đặt từ dự án TB-xxxx (Metalla)».
2. **Lưu liên kết** nguồn ↔ nhận. Cột trái khối **Đặt xưởng → Đã đặt**.
3. **Gắn ngày / VC** đã điền lên dự án nhận (lắp, hoàn thiện, lấy hàng, ghi chú).
4. **Tạo mốc lịch dự kiến** nếu có ngày — Lấy hàng, Lắp đặt, Hoàn thiện SX — giống khoá kế hoạch bài 4.
5. **Thêm NV mặc định của phân loại xưởng nhận** vào thành viên deal + bình luận:

> 🏭 *Tên bạn* đã đặt xưởng (HCB) · TB-xxxx. @Nguyễn Văn B — vui lòng tiếp nhận dự án gia công «Tên deal».

Phân loại xưởng nhận **chưa setup NV** thì dự án vẫn tạo, nhưng không @ được ai — nhờ admin cấu hình nhân sự phân loại.

## 2. Thẻ TẠM phía VC — nhắc khoá kế hoạch

Nếu form có **công ty VC/LĐ** và ngày lắp:

- Thẻ dự án **nhận** vào **cột lắp đặt tạm**, badge **🔒 TẠM**, dòng **Ghi chú VC/LĐ**.
- Kéo thẻ sang cột khác **bị chặn** cho tới khi xưởng nhận bàn giao **và** Sale bấm **Chọn & bàn giao**.

![Bảng Lắp đặt — cột tạm, badge TẠM](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

![Thẻ phóng to — mã, TẠM, ghi chú](/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png)

**Không tạo thêm một dự án VC mới** lúc Sale xác nhận — chỉ chuyển cột, bỏ badge TẠM. Giống hệt khoá kế hoạch.

## 3. Xưởng nhận làm hàng rồi bàn giao

1. Xưởng nhận kéo / bấm cột **Đơn hàng đã chuẩn bị xong** (hoặc cột bàn giao VC của pipeline họ).
2. Sale nhận thẻ **Bàn giao Lắp đặt** trên deal → đọc lại VC đã điền (lúc đặt hoặc lúc Sale lập kế hoạch) → **Chọn & bàn giao**.

![Xưởng bấm bước bàn giao](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

![Sale xác nhận — không tạo dự án VC mới](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

Xưởng nguồn **không** phải chọn công ty VC giúp xưởng nhận nếu đã điền lúc đặt. Xưởng nhận cũng **không** chọn VC lúc bấm cột bàn giao.

## 4. Phía dự án nhận

Mở `/sx/projects/:id` của xưởng nhận: khối **Đặt xưởng** có **Nhận đặt từ** — link về dự án nguồn.

## 5. Lỗi hay gặp

- Tạo xong không thấy thẻ trên board HCB — đang lọc sai công ty / phân loại trên Kanban SX.
- Không có bình luận @ — phân loại chưa có NV mặc định.
- VC không thấy thẻ TẠM — chưa chọn công ty VC trên form, hoặc công ty đó chưa bật cột lắp đặt tạm.
- Tưởng đặt xưởng khác = bàn giao VC xong — **chưa**. Vẫn đủ hai bước: xưởng nhận hoàn thiện + Sale xác nhận.

---

Bài 5: thực hành trên đơn THUCHANH rồi thi cuối.
""",
        "sx-vc-07b-the-tam-ghi-chu.png",
        att(
            ("sx-vc-07-board-cot-tam.png", "VC — cột lắp đặt tạm sau khi đặt có ngày/VC"),
            ("sx-vc-07b-the-tam-ghi-chu.png", "Badge TẠM và ghi chú trên thẻ"),
            ("sx-vc-08-sx-ban-giao.png", "Xưởng nhận bấm cột bàn giao"),
            ("sx-vc-09-the-ban-giao.png", "Sale Chọn & bàn giao — không tạo dự án VC mới"),
            ("sx-vc-09b-chon-ban-giao.png", "Nút Chọn & bàn giao cuối thẻ"),
        ),
        [
            qitem("a1", "Sau Tạo dự án, tab nào thường mở sẵn?",
                  ["KPI", "Bình luận", "Đặt hàng", "Facebook"],
                  1, "setTab('comments') để thấy dòng đã đặt xưởng."),
            qitem("a2", "Tên dự án xưởng nhận thường có gì?",
                  ["Chỉ mã ngẫu nhiên", "Tên deal / dự án nguồn · short_name xưởng nhận", "Tên Sale", "Số hóa đơn"],
                  1, "Ví dụ «Tủ bếp chị Lan · HCB»."),
            qitem("a3", "Dòng bình luận đúng mẫu?",
                  ["Đã xóa deal", "🏭 … đã đặt xưởng (HCB) · TB-xxxx. @NV — vui lòng tiếp nhận dự án gia công", "Chỉ gửi Zalo", "Tạo user mới"],
                  1, "mode workshop_place."),
            qitem("a4", "Nhìn ảnh bảng Lắp đặt. Ngay sau khi đặt có VC, thẻ nằm cột nào (khung 1)?",
                  ["Nghiệm thu", "Cột lắp đặt tạm (ví dụ Dự án sắp tới)", "Thùng rác", "Chưa hiện cho tới khi Sale bấm"],
                  1, "Giống khoá kế hoạch bài 4.",
                  "sx-vc-07-board-cot-tam.png"),
            qitem("a5", "Nhìn ảnh thẻ. Khung 2 là nhãn gì?",
                  ["ĐÃ GIAO", "Badge 🔒 TẠM — chưa kéo cột được", "GẤP", "HỦY"],
                  0, "Khoá kéo cho tới xưởng nhận bàn giao + Sale xác nhận.",
                  "sx-vc-07b-the-tam-ghi-chu.png"),
            qitem("a6", "Kéo thẻ TẠM sang cột khác — kết quả đúng?",
                  ["Chuyển bình thường", "Hệ thống chặn, chờ xưởng bàn giao và Sale xác nhận", "Xóa thẻ", "Tạo dự án trùng"],
                  1, "Giống khoá kế hoạch."),
            qitem("a7", "Sale bấm Chọn & bàn giao thì hệ thống tạo thêm dự án VC mới?",
                  ["Có, luôn tạo bản sao", "Không — chỉ rời cột tạm, bỏ badge TẠM", "Xóa dự án SX", "Tạo Lead"],
                  1, "Khung 3 trên thẻ bàn giao.",
                  "sx-vc-09-the-ban-giao.png"),
            qitem("a8", "Xưởng nhận bấm cột khoanh đỏ trên ảnh để làm gì?",
                  ["Tạo deal CRM", "Báo hoàn thiện — gửi thẻ bàn giao cho Sale", "Tự bỏ TẠM ngay không cần Sale", "Đặt xưởng khác lần nữa"],
                  1, "Đơn hàng đã chuẩn bị xong.",
                  "sx-vc-08-sx-ban-giao.png"),
            qitem("a9", "NV xưởng nhận vào thành viên deal từ đâu?",
                  ["Toàn bộ phòng SX công ty nhận", "NV mặc định trong setup phân loại xưởng nhận", "Mọi user hệ thống", "Chỉ tài xế"],
                  1, "staffAllowFallback: false — không lấy cả phòng."),
            qitem("a10", "Không @ được ai sau khi đặt — nguyên nhân hay gặp?",
                  ["Hết dung lượng ảnh", "Phân loại xưởng nhận chưa gán NV mặc định", "Sai múi giờ máy", "Thiếu chữ ký số"],
                  1, "skipped_no_setup."),
            qitem("a11", "Khối Nhận đặt từ hiện trên trang nào?",
                  ["Chỉ CRM lead chưa thắng", "Trang SX của dự án xưởng nhận", "Trang login", "KPI"],
                  1, "received_from."),
            qitem("a12", "Nhìn ảnh cuối thẻ bàn giao. Khung 9 là nút nào?",
                  ["Để sau", "Chọn & bàn giao — chuyển cột, bỏ TẠM", "Xóa dự án", "Đặt xưởng khác"],
                  1, "Việc của Sale, không phải xưởng nguồn.",
                  "sx-vc-09b-chon-ban-giao.png"),
        ],
        duration=14,
        quiz_title="Bài kiểm tra: Sau khi tạo — TẠM, bình luận, bàn giao",
        quiz_instr="12 câu — ảnh khoá kế hoạch SX & VC/LĐ. Đạt 70%, tối đa 3 lượt.",
    )

    add(
        5,
        "Bài 5: Thực hành Đặt xưởng khác + thi cuối",
        "Làm trên đơn THUCHANH, đối chiếu phiếu, quiz cuối (có câu khoá kế hoạch SX & VC/LĐ).",
        """# Bài 5: Thực hành Đặt xưởng khác + thi cuối

Bạn **làm trên hệ thống** (đơn thực hành), rồi làm quiz cuối. Nhiều câu có **ảnh khoanh** từ khoá kế hoạch — form giống hệt.

Muốn **tập điền ngày/VC mà không tạo dự án thật**: mở khoá **Kế hoạch SX & VC/LĐ → Bài 5 → Sân tập mô phỏng**. Sân tập dùng cùng ô (HCB, Phúc Đạt, 2 ngày lắp, Sáng / Chiều). Khác chỗ bấm: sân tập chốt **Thêm dự án**; xưởng thật chốt **Tạo dự án**.

## 1. Chọn dự án nguồn

- Ưu tiên dự án **THUCHANH - tên bạn - ngày** đã có trên board SX (nhờ Sale tạo deal thực hành rồi lập kế hoạch lần đầu).
- **Cấm** đặt xưởng khác trên đơn khách đang chạy — tạo thêm thẻ HCB/Metalla thật.

Không có dự án THUCHANH: nhờ Sale/admin tạo deal mẫu, lập kế hoạch SX (khoá kia bài 3), rồi bạn mở trang SX của dự án đó.

## 2. Đề bài — làm đúng

1. Mở `/sx/projects/:id` dự án nguồn → bấm **Đặt xưởng khác**.
2. Chọn **công ty SX nhận khác** công ty đang mở (ví dụ HCB nếu nguồn là Metalla).
3. Chọn **phân loại** đúng loại hàng thực hành (Tủ bếp hoặc loại admin chỉ định).
4. Kiểm tra ngày lắp đã prefill; đặt **2 ngày lắp liền nhau** tuần sau, giờ **Sáng** (08:00).
5. **Lấy hàng VC**: cùng ngày lắp đầu, giờ **Chiều** (14:00) — không sau ngày lắp.
6. Chọn **công ty VC/LĐ đã bật cột tạm** (khoá kế hoạch bài 2).
7. Ghi chú 2 dòng, ví dụ: «Hàng dễ vỡ, gọi khách trước 30 phút» và «Thang máy nhỏ, cần 2 thợ».
8. Bấm **Tạo dự án**. Đọc alert «Đã tạo 1 dự án xưởng…».

## 3. Đi kiểm 7 chỗ

1. Cột trái **Đặt xưởng → Đã đặt**: có link mã dự án nhận.
2. Tab **Bình luận**: dòng «🏭 … đã đặt xưởng … vui lòng tiếp nhận dự án gia công» và @ NV (nếu phân loại có NV).
3. Mở dự án nhận: khối **Nhận đặt từ** trỏ về nguồn.
4. **Bảng Lắp đặt** đúng công ty VC: thẻ **TẠM**, ghi chú đúng 2 dòng.
5. Thử kéo thẻ TẠM — **bị chặn** là đúng.
6. **Tab Lịch**: 3 mốc dự kiến; thẻ sự kiện có ghi chú VC/LĐ.
7. (Tuỳ quyền) xưởng nhận bấm cột bàn giao → Sale **Chọn & bàn giao** → thẻ rời cột tạm. Trên đơn THUCHANH mới làm bước này.

## 4. Dọn dẹp

Nhắn admin xoá deal/dự án **THUCHANH - …** và sự kiện kèm theo, để báo cáo không lệch số.

---

Xong phiếu tự kiểm thì làm **Bài kiểm tra cuối** ngay dưới. Đạt 80% là nhận chứng nhận khoá.
""",
        "sx-vc-08-sx-ban-giao.png",
        att(
            ("sx-vc-08-sx-ban-giao.png", "Trang SX — bấm Đặt xưởng khác trên header"),
            ("sx-vc-04b-form-cac-buoc.png", "Điền xưởng nhận, phân loại, ngày lắp"),
            ("sx-vc-05-chon-vc-ghi-chu.png", "VC/LĐ + ghi chú rồi Tạo dự án"),
            ("sx-vc-07b-the-tam-ghi-chu.png", "Kết quả VC: thẻ TẠM + ghi chú"),
            ("sx-vc-09b-chon-ban-giao.png", "Sale xác nhận lần hai — không tạo dự án VC mới"),
        ),
        [
            qitem("t1", "Nút indigo trên header SX dùng để?",
                  ["Xóa dự án nguồn", "Đặt thêm dự án ở xưởng/công ty SX khác", "In phiếu lương", "Đổi theme"],
                  1, "Đặt xưởng khác."),
            qitem("t2", "Nhìn ảnh deal CRM. Khung 3 (đỏ) là nút của AI, lúc nào?",
                  ["Xưởng — mọi lúc", "Sale — lập kế hoạch lần đầu khi Đã ký hợp đồng", "Tài xế — khi TẠM", "Kế toán — cuối tháng"],
                  1, "Không nhầm với Đặt xưởng khác.",
                  "sx-vc-03-nut-ke-hoach.png"),
            qitem("t3", "Sau khi bấm Sáng (khung đỏ), giờ lắp là?",
                  ["07:30", "08:00", "09:00", "Không đổi"],
                  1, "Cùng sân tập khoá kế hoạch.",
                  "sx-vc-04-form-ngay-gio.png"),
            qitem("t4", "Hoàn thiện SX trên ảnh khung xanh?",
                  ["Bằng ngày lắp", "Ngày lắp trừ 2 ngày", "Ngày lắp cộng 2", "Trống"],
                  1, "27/08 → 25/08.",
                  "sx-vc-04-form-ngay-gio.png"),
            qitem("t5", "Công ty nguồn có trong dropdown Đặt xưởng khác không?",
                  ["Có", "Không — đã lọc", "Chỉ hiện ban đêm", "Chỉ admin thấy"],
                  1, "Không đặt sang chính mình."),
            qitem("t6", "Nhìn ảnh bảng Lắp đặt. Khung 3 trên thẻ là?",
                  ["Được kéo tự do", "Badge TẠM — bị khoá chuyển cột", "Đã nghiệm thu", "Hết hàng"],
                  1, "Đúng cả khi dự án do Đặt xưởng khác tạo.",
                  "sx-vc-07-board-cot-tam.png"),
            qitem("t7", "Ghi chú VC trên thẻ phóng to (khung 3) lấy từ đâu?",
                  ["KPI", "Ô ghi chú lúc lập kế hoạch hoặc lúc Đặt xưởng khác", "Mật khẩu Wi‑Fi", "Tên cột Kanban"],
                  1, "Cùng ô.",
                  "sx-vc-07b-the-tam-ghi-chu.png"),
            qitem("t8", "Chọn & bàn giao (khung 9) do ai bấm?",
                  ["Xưởng nguồn trên header", "Sale trên CRM tab Bình luận", "Mọi thợ VC", "Bot lúc nửa đêm"],
                  1, "Không tạo dự án VC mới.",
                  "sx-vc-09b-chon-ban-giao.png"),
            qitem("t9", "Tối đa bao nhiêu xưởng một lần Tạo dự án?",
                  ["5", "50", "1", "Không giới hạn"],
                  0, "Server từ chối > 5."),
            qitem("t10", "Đặt trùng cùng công ty + phân loại?",
                  ["Tạo bản sao", "Báo đã đặt trước đó", "Ghi đè dự án nhận", "Xóa nguồn"],
                  1, "existingKeys."),
            qitem("t11", "Nút Đặt xưởng khác trên VC?",
                  ["Có", "Không", "Chỉ khi TẠM", "Chỉ mobile"],
                  1, "SX-only."),
            qitem("t12", "NV được @ trong bình luận là?",
                  ["Cả công ty nhận", "NV mặc định setup phân loại xưởng nhận", "Mọi Sale", "Khách hàng"],
                  1, "Không fallback cả phòng SX."),
            qitem("t13", "Sân tập khoá Kế hoạch SX & VC/LĐ giúp gì cho khoá này?",
                  ["Không liên quan", "Tập điền cùng ô ngày/VC mà không tạo dữ liệu thật", "Xóa deal khách", "Đổi quyền admin"],
                  1, "Chốt Thêm dự án trên sân tập; thật thì Tạo dự án."),
            qitem("t14", "Đổi phân loại cùng công ty thì?",
                  ["Đặt xưởng khác", "Chuyển phân loại trên stepper", "Tạo Lead", "Xóa cột tạm"],
                  1, "Không nhầm hai nút."),
            qitem("t15", "Thẻ còn TẠM sau khi xưởng nhận đã bấm bàn giao — vì sao?",
                  ["Sale chưa Chọn & bàn giao", "Thiếu ảnh", "Sai DPI màn hình", "Hết giấy in"],
                  0, "Đủ hai việc.",
                  "sx-vc-09-the-ban-giao.png"),
        ],
        duration=25,
        final=True,
        passing=80,
        time_limit=25,
        quiz_title="Bài kiểm tra cuối: Đặt xưởng khác + kế hoạch SX & VC/LĐ",
        quiz_instr="15 câu — ảnh khoá kế hoạch. Đạt 80% là qua, tối đa 3 lượt, 25 phút. Nên làm phiếu tự kiểm trước.",
        checklist=[
            "Đã mở đúng trang SX dự án THUCHANH (không đụng đơn khách)",
            "Bấm Đặt xưởng khác, chọn công ty nhận ≠ nguồn + phân loại",
            "2 ngày lắp liền, giờ Sáng 08:00; lấy hàng không sau ngày lắp, giờ Chiều",
            "Chọn VC đã bật cột tạm, ghi chú 2 dòng, bấm Tạo dự án",
            "Cột trái Đã đặt có link; bình luận có dòng đã đặt xưởng",
            "Bảng Lắp đặt: thẻ TẠM + ghi chú; kéo thẻ bị chặn",
            "Biết sân tập khoá Kế hoạch SX & VC/LĐ dùng để tập form không tạo dữ liệu",
            "Biết Sale mới bấm Chọn & bàn giao — không tạo dự án VC trùng",
        ],
    )

    return cat, lessons, exercises
