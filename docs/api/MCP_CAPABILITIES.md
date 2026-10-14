# MCP — Bảng công dụng

MCP là cầu nối để trợ lý AI (Claude, ChatGPT, Cursor, OpenClaw…) nói chuyện trực tiếp với hệ
thống. Tài liệu này liệt kê **làm được gì**, **chưa làm được gì**, và **cần quyền nào**.

Cập nhật: 14/10/2026 · **68 tool** · nguồn: `backend/src/helpers/mcp*.js`

---

## 1. Tổng quan theo công dụng

| Nhóm | Dùng để làm gì | Scope | Số tool |
|---|---|---|---:|
| Báo cáo tổ chức | Doanh số, chuyển đổi, quá hạn, hiệu suất nhân viên, rủi ro deal | `reports` | 23 |
| Đọc CRM | Tra cứu lead/deal, khách hàng, báo giá, đơn, hóa đơn, nhiệm vụ, tài liệu | `crm_read` | 20 |
| Báo cáo vận hành | Nguồn lead · Lead đọng · Tổng quan xưởng | `crm_read` / `production_read` | 3 |
| Ghi CRM ⚠️ | Tạo/sửa lead-deal, chuyển giai đoạn, bình luận, nhiệm vụ, khách hàng | `crm_write` | 8 |
| Quảng cáo | Hiệu quả chiến dịch, chất lượng lead, tìm quảng cáo đốt tiền | `ads_read` | 7 |
| Module khác | Sản xuất, VC-Lắp đặt, Kế toán, Dự án, Nhiệm vụ, KPI, Sự kiện | mỗi module một scope | 7 |

**Mặc định một khoá chỉ thấy 43/68 tool** (`reports` + `crm_read`). Mọi thứ khác phải bật tay.

---

## 2. Báo cáo tổ chức — `reports`

| Tool | Công dụng |
|---|---|
| `get_org_overview_report` | Báo cáo tổ chức, dạng JSON |
| `get_org_overview_report_full` | Báo cáo tổ chức đầy đủ, mọi chỉ số |
| `format_org_overview_report_text` | Bản văn bản, đọc được ngay |
| `format_org_employee_tab_report_text` | Tab Nhân viên, dạng văn bản |
| `format_all_employees_report_text` | Toàn bộ nhân viên, dạng văn bản |
| `format_company_report_text` | Báo cáo một công ty, dạng văn bản |
| `get_company_lead_summary` | Tóm tắt lead/deal của công ty |
| `get_employee_activity_report` | Một nhân viên làm được gì trong kỳ |
| `format_employee_activity_report_text` | Bản văn bản của báo cáo trên |
| `get_employee_breakdown` | Phân rã chỉ số theo từng nhân viên |
| `get_employee_leads_drill` | Danh sách lead/deal của từng người |
| `get_lead_deal_risk_report` | Deal có nguy cơ mất |
| `format_lead_deal_risk_text` | Bản văn bản của báo cáo rủi ro |
| `get_overdue_breakdown` | Chi tiết việc quá hạn |
| `get_pipeline_breakdown` | Một pipeline đang tắc ở đâu |
| `get_user_profile_card` | Hồ sơ một nhân viên |
| `find_users_by_name` | Tìm nhân viên theo tên |
| `list_companies_in_scope` | Công ty trong phạm vi khoá |
| `list_departments_in_company` | Phòng ban của công ty |
| `list_employees_in_scope` | Nhân viên trong phạm vi |
| `list_pipelines_for_company` | Pipeline của công ty |
| `resolve_assignee_scope` | Phạm vi nhân viên được phép xem |
| `resolve_time_range` | Quy đổi "tháng này", "quý trước"… ra ngày |

---

## 3. Đọc CRM — `crm_read`

| Tool | Công dụng |
|---|---|
| `search` | Tìm kiếm chung (chuẩn OpenAI, có trích dẫn nguồn) |
| `fetch` | Lấy nội dung đầy đủ một bản ghi |
| `search_crm_leads` | Tìm lead/deal theo nhiều điều kiện |
| `get_crm_lead_detail` | Chi tiết một lead/deal |
| `get_crm_lead_activities` | Lịch sử hoạt động của lead/deal |
| `get_crm_dashboard` | Số liệu Dashboard CRM |
| `get_crm_kanban_bootstrap` | Dữ liệu khởi tạo bảng Kanban |
| `get_crm_stage_counts` | Đếm lead/deal theo giai đoạn |
| `list_crm_pipelines` · `list_crm_pipeline_stages` | Pipeline và giai đoạn |
| `list_crm_customers` | Danh sách khách hàng |
| `list_crm_lead_tasks` | Nhiệm vụ của lead/deal |
| `list_crm_lead_documents` | Tài liệu đính kèm |
| `list_crm_quotations` · `get_crm_quotation` | Báo giá |
| `list_crm_orders` · `get_crm_order` | Đơn hàng |
| `list_crm_invoices` · `get_crm_invoice` | Hóa đơn |
| `crm_api_get` | Gọi thẳng API CRM (chỉ GET, có whitelist) |

---

## 4. Báo cáo vận hành

| Tool | Trả lời câu hỏi | Scope |
|---|---|---|
| `get_lead_source_report` | Lead về từ kênh nào, khu vực nào, mỗi ngày bao nhiêu | `crm_read` |
| `get_stuck_leads_report` | Lead nào đang đọng, nằm ở ai, bao lâu rồi | `crm_read` |
| `get_production_overview_report` | Xưởng ùn ở cột nào, mấy đơn quá hạn | `production_read` |

Ba báo cáo này **tổng hợp sẵn**, khác với `*_api_get` chỉ mở đường cho model tự gọi rồi tự cộng.

Hai điểm đáng chú ý:

- **Nguồn lead** gom URL quảng cáo dài về một nhãn kênh. Không gom thì báo cáo vỡ thành hàng
  chục dòng URL Google Ads khác nhau.
- **Lead đọng** nêu riêng số lead đang giao cho **tài khoản đã tắt** — loại lead không ai mở được.
  Đo thật trên VPT: 458/989.

Ngày tính theo **giờ VN**, không phải UTC.

---

## 5. Ghi CRM — `crm_write` ⚠️

| Tool | Công dụng | Phá hủy? |
|---|---|---|
| `create_crm_lead` | Tạo lead hoặc deal mới | không |
| `update_crm_lead` | Sửa tên, người phụ trách, khu vực, giá trị, địa chỉ | **có** |
| `move_crm_lead_stage` | Chuyển giai đoạn | **có** |
| `add_crm_lead_comment` | Gửi bình luận vào luồng deal | không |
| `create_crm_lead_task` | Tạo nhiệm vụ trên deal | không |
| `update_crm_lead_task` | Đổi trạng thái / người làm / hạn | không |
| `convert_crm_lead_to_deal` | Chuyển lead thành deal | không |
| `create_crm_customer` | Tạo khách hàng | không |

**Không ghi thẳng xuống bảng.** Mỗi tool nạp đúng route HTTP mà giao diện đang gọi. Nhờ vậy:
kiểm quyền, gate chuyển giai đoạn, sinh nhiệm vụ theo mẫu, ghi bình luận hoạt động, bắn thông
báo @, đồng bộ sang «Giao việc», phát realtime — tất cả chạy y như người bấm tay.

Cột "Phá hủy" khai qua `destructiveHint`; client dùng cờ này để hỏi lại người dùng trước khi chạy.

> ⚠️ **Tầng ghi chưa chạy thật lần nào.** Ba khoá đang dùng đều không có `crm_write`.
> Đừng bật cho khoá nào trước khi có một lần chạy thử thành công.

---

## 6. Quảng cáo — `ads_read`

| Tool | Công dụng |
|---|---|
| `list_pages` | Danh sách page Facebook |
| `list_lead_campaigns` | Chiến dịch đang chạy |
| `get_campaign_performance` | Hiệu quả từng chiến dịch |
| `compare_campaigns` | So sánh nhiều chiến dịch |
| `get_conversion_events` | Đơn đã chốt theo chiến dịch |
| `get_lead_quality_breakdown` | Chất lượng lead theo quảng cáo |
| `find_wasted_spend` | Quảng cáo đang đốt tiền |

---

## 7. Module ngoài CRM

Mỗi module một tool, nhận `path` + `query`, có whitelist riêng. Bảy tool phủ **83 endpoint**.

| Tool | Module | Scope |
|---|---|---|
| `production_api_get` | Sản xuất | `production_read` |
| `logistics_api_get` | Vận chuyển – Lắp đặt | `logistics_read` |
| `accounting_api_get` | Kế toán | `accounting_read` |
| `projects_api_get` | Dự án | `projects_read` |
| `tasks_api_get` | Nhiệm vụ | `tasks_read` |
| `kpi_api_get` | KPI | `kpi_read` |
| `events_api_get` | Sự kiện / lịch | `events_read` |

---

## 8. KHÔNG làm được

| Việc | Vì sao |
|---|---|
| **Xoá bất cứ thứ gì** | Khó hoàn tác nhất, dễ hiểu nhầm ý nhất — cố ý chưa mở |
| Ghi ở Sản xuất, VC, Nhiệm vụ | Mới chỉ mở ghi cho CRM |
| Gộp lead trùng | Kéo theo dữ liệu nhiều bảng |
| Duyệt báo giá / hợp đồng | Chạm tới tiền, cần bàn riêng |
| Chuyển deal sang sản xuất | Kéo theo module khác |
| Vượt phạm vi công ty của khoá | Chặn hai lớp: tham số và kết quả |
| Đọc endpoint ngoài whitelist | Mỗi module có danh sách path cố định |

---

## 9. An toàn

**Ba lớp chặn cho mọi lệnh ghi**

1. Scope `crm_write` trên khoá API — không nằm trong mặc định
2. Whitelist method + path, id phải đúng dạng UUID
3. Quyền của chính user act-as — route tự kiểm như khi người đó bấm tay

**Phạm vi công ty** chặn hai lớp: lọc tham số đầu vào, và lọc lại kết quả theo
`allowed_company_ids` của khoá.

**Nhật ký** ghi mọi lệnh: ai gọi, tool nào, tham số, cho qua hay từ chối, lý do, mất bao lâu.

**Phiên sống sót** qua deploy và qua việc request rơi sang instance khác.

---

## 10. Kiểm thử

```bash
cd backend
node tests/mcp-crm-write.js            # 22 — cổng chặn tầng ghi
node tests/mcp-bao-cao-van-hanh.js     # 18 (+5 với --that)
node tests/mcp-module-bridge.js        # 21
node tests/mcp-search-fetch.js         # 16
node tests/mcp-phien-song-sot.js       #  9
node tests/mcp-loc-cong-ty.js          #  7
node tests/mcp-audit-reason-codes.js   #  5
```

**98 phép thử, 7/7 bộ xanh.**

Lưu ý: 22 phép của tầng ghi kiểm **cổng chặn**, không phép nào thực sự ghi một dòng.
