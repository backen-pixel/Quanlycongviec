# Rà soát toàn bộ backend — lỗi im lặng của PostgREST

Bản rà soát tĩnh trên **493 file** trong `backend/src`, đối chiếu từng cột trong
mọi `.select()` với **schema thật** lấy từ `information_schema` của project
production (294 bảng/view).

## Kết quả: 29 cột không tồn tại, tại 37 vị trí gọi

Mỗi cái làm Postgres trả `42703` và **cả câu truy vấn hỏng** — không phải chỉ
thiếu một cột, mà là `data` thành `undefined`.

**Đã kiểm chứng 29/29 trực tiếp trên database** (`information_schema.columns`),
không dựa vào bộ phân tích. Không có cái nào là báo nhầm.

### Vì sao đáng tin hơn lần trước

Bản dò đầu tiên báo thêm ~10 cái nữa, ví dụ `projects.crm_sync_type`. Kiểm tra
thì đó là **lỗi giả**: mã thật là `.from(VC_PIPELINE_TABLE)` — tham số là BIẾN,
mà bộ dò lại vơ lấy `.from('projects')` ở phía trên. Đã siết lại: khi `.from()`
gần nhất không phải chuỗi hằng thì **bỏ qua**, không đoán bảng.

## Hai kiểu hỏng, hậu quả rất khác nhau

| Kiểu | Nghĩa là gì | Vì sao đáng lo |
|---|---|---|
| **ném lỗi** | Có lấy `error` ra và `throw` | Endpoint trả 500 — **ồn ào**, dễ phát hiện |
| **IM LẶNG** | `const { data } = await …` không lấy `error` | Trang vẫn hiện, chỉ **thiếu dữ liệu**. Không ai biết |

Trong bảng dưới, **13 dòng là IM LẶNG** — đó mới là loại nguy hiểm.

Mỗi dòng dưới đây là một truy vấn mà Postgres trả `42703` và **cả câu hỏng**.

| Bảng.cột sai | Cột đúng (gợi ý) | Số chỗ | Kiểu hỏng | Vị trí |
|---|---|---|---|---|
| **`lead_documents.file_path`** | `file_name`, `file_url` | 3 | IM LẶNG | `helpers/projectDealBundle.js:936`<br>`helpers/projectDealBundle.js:940`<br>`routes/management.js:1860` |
| **`users.avatar_url`** | `avatar`, `cover_url` | 3 | 1 im lặng / 2 ném | `routes/tasks.js:677`<br>`routes/drive.js:2473`<br>`routes/drive.js:2492` |
| **`crm_leads.budget`** | — | 2 | IM LẶNG | `routes/management.js:335`<br>`routes/dashboard.js:964` |
| **`crm_leads.name`** | — | 2 | 1 im lặng / 1 ném | `helpers/appModuleOps.js:254`<br>`routes/appModules.js:255` |
| **`role_permissions.permission`** | `permission_id` | 2 | ném lỗi | `test-permissions.js:58`<br>`middleware/permission.js:19` |
| **`tasks.assigned_to`** | `assignee_id` | 2 | 1 im lặng / 1 ném | `routes/dashboardMain.js:105`<br>`routes/dashboardMain.js:214` |
| **`companies.code`** | `tax_code` | 1 | ném lỗi | `routes/ecosystem.js:681` |
| **`companies.logo`** | `logo_url` | 1 | ném lỗi | `routes/ecosystem.js:681` |
| **`company_template_tasks.checklist_items`** | — | 1 | IM LẶNG | `helpers/stageFlow.js:99` |
| **`crm_activities.content`** | — | 1 | IM LẶNG | `routes/management.js:1862` |
| **`crm_activities.result`** | — | 1 | IM LẶNG | `routes/management.js:1862` |
| **`crm_lead_comments.content`** | — | 1 | IM LẶNG | `helpers/tenantQuotas.js:226` |
| **`crm_leads.address`** | `install_address` | 1 | IM LẶNG | `routes/purchasing.js:431` |
| **`crm_leads.assignee_id`** | `assigned_to`, `stage_id` | 1 | ném lỗi | `helpers/appModuleOps.js:254` |
| **`crm_leads.deadline`** | `kanban_deadline_at`, `deadline_disabled_by` | 1 | IM LẶNG | `routes/management.js:335` |
| **`crm_leads.lead_source_id`** | `source_id`, `lead_owner_id` | 1 | IM LẶNG | `routes/projects.js:2035` |
| **`crm_leads.pipeline_stage_id`** | `vc_pipeline_stage_id`, `sx_pipeline_stage_id` | 1 | ném lỗi | `helpers/appModuleOps.js:162` |
| **`crm_task_attachments.crm_task_id`** | `task_id` | 1 | IM LẶNG | `helpers/projectDealBundle.js:1035` |
| **`crm_task_attachments.file_path`** | `file_name`, `file_url` | 1 | IM LẶNG | `helpers/projectDealBundle.js:1035` |
| **`crm_task_attachments.shared_to_workshop`** | `shared_to_project` | 1 | IM LẶNG | `helpers/projectDealBundle.js:1035` |
| **`departments.short_name`** | `name` | 1 | ném lỗi | `routes/ecosystem.js:701` |
| **`ecosystem_levels.level_index`** | — | 1 | ném lỗi | `routes/ecosystem.js:787` |
| **`ecosystem_units.depth`** | — | 1 | IM LẶNG | `routes/aiChatBot.js:262` |
| **`file_attachments.storage_path`** | — | 1 | ném lỗi | `routes/upload.js:441` |
| **`lead_messages.is_pinned`** | — | 1 | ném lỗi | `routes/crm/routes/membersChat.js:578` |
| **`projects.customer_name`** | `customer_id` | 1 | ném lỗi | `routes/dashboardMain.js:84` |
| **`projects.customer_phone`** | `customer_id` | 1 | ném lỗi | `routes/dashboardMain.js:84` |
| **`projects.end_date`** | `order_date`, `completed_date` | 1 | ném lỗi | `routes/dashboardMain.js:84` |
| **`projects.start_date`** | `install_date`, `production_start_date` | 1 | ném lỗi | `routes/dashboardMain.js:84` |


## Nguyên nhân gốc: 2.282 chỗ nuốt lỗi

Bộ rà soát đếm được **2.282 chỗ** viết `const { data } = await supabase…` mà
không lấy `error`, nằm trong **225 file**. Đứng đầu:

| Số chỗ | File |
|---|---|
| 131 | `routes/facebook.js` |
| 102 | `routes/crm/routes/leadLifecycle.js` |
| 86 | `routes/production.js` |
| 85 | `routes/projects.js` |
| 61 | `routes/knowledge.js` |

Đây là thứ biến một cột sai từ "một dòng trong log" thành "tính năng chết mà
không ai biết". Không đề xuất sửa cả 2.282 chỗ — nhưng nên sửa ở những chỗ
trùng với bảng trên.

## Đề xuất thứ tự

1. **6 cột sai kiểu IM LẶNG có ảnh hưởng rõ** — `lead_documents.file_path` (tài
   liệu không vào project bundle), `crm_leads.budget`/`deadline` (báo cáo quản
   trị), `crm_lead_comments.content` (tính hạn mức tenant),
   `company_template_tasks.checklist_items`, `crm_activities.content`/`result`.
2. **Các cột kiểu "ném lỗi"** — endpoint đang 500, nhưng ít nhất là ồn nên có
   thể đã có người báo.
3. **`supabaseQueryGuard.js`** (commit `7fa59c49`) đã bắt được 2 lỗi im lặng
   khác (cắt 1000 dòng, filter quá dài). Mở rộng nó để cảnh báo cả `42703` là
   hợp lý — cùng một chỗ móc vào.

## Cách chạy lại

```bash
# 1) lấy schema thật
#    SELECT json_object_agg(...) FROM information_schema.columns  -> schema.json
# 2) chạy
python3 report.py backend/src
```

Hai script kèm theo: `audit.py` (bản tóm tắt) và `report.py` (bản bảng đầy đủ).
