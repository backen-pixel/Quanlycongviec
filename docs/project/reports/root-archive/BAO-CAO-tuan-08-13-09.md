# Tuần 08–13/09/2026 — Backend + Database

Ngày làm: 08/09/2026 (cập nhật lần 2 sau ảnh log 11:00–12:00) · DB `qlycv` (`kdxypztstbeovyedmvem`)

Tất cả số liệu dưới đây đều **đo được**, không suy đoán. Câu SQL gây lỗi lấy
nguyên văn từ `postgres_logs`, không đoán từ dòng thông báo.

---

## Tóm tắt: xong gì, chờ gì

| Mục | Trạng thái |
|---|---|
| TX-2 · 22P02 `logistics` | ✅ Đã sửa (patch 0004, gộp vào 0005) |
| TX-3 · 23505 ghi trùng | ✅ Đã sửa **7** file — **lộ thêm 122 hàng rác trong DB** |
| TX-5 · RPC anon | ✅ Đã áp migration 592 lên DB |
| TX-4 · Quét log hồi quy | ✅ Quét lại sau khi có ảnh của anh — **lộ 145 lỗi 42703 đang chạy**, xem mục 8–9 |
| PT-1 · 29 cột sai | ✅ Đã áp 0003 + **tìm và sửa thêm 6 cột sai mới** (mục 10) |
| PT-2 · Guard cảnh báo 42703 | ✅ Đã mở rộng + test 8/8 |
| PT-3 · `is_primary_lead` | ✅ Migration 594 + lọc ở 6 chỗ |
| PT-4 · Bắt error 6 chỗ | ✅ Xong |
| PT-5 · Lệch RLS | ✅ `product_code_parts` đã vá — **`public_share_links` CỐ TÌNH không đụng**, xem mục 5 |
| TX-1 · Đẩy lên GitHub + deploy | ⏳ **Anh làm** — tôi không push được |
| TX-6 · Đọc log `[query-guard]` Render | ⏳ **Anh làm** — tôi không vào được Render |
| Dọn hàng rác | ✅ **Đã dọn 124 bản** (anh duyệt) — `database/595_..._DA_CHAY.sql` |

---

## 1. TX-3 — 8 lỗi 23505 và thứ đứng sau chúng

4 rằng buộc, 4 nguyên nhân khác nhau. Ba cái đầu chỉ ồn log; **cái thứ tư
đang phá dữ liệu**.

### a) `crm_assignment_assignees_pkey` (3 lần)

`replaceAssignmentAssigneesWithRoles` làm DELETE rồi INSERT — **không nguyên
tử**. Hai request cách nhau 0,3 giây (bấm Lưu hai lần) cùng DELETE xong rồi
cùng INSERT → đâm nhau. Lỗi bị `if (error && !/crm_assignment_assignees/…)`
nuốt luôn.
→ Đổi sang `upsert(onConflict: 'assignment_id,user_id')`.

### b) `lead_members_lead_id_user_id_key` (1 lần)

Bốn chỗ đều theo kiểu «kiểm tra rồi mới ghi» — cũng không nguyên tử.
→ `upsert(..., ignoreDuplicates: true)` (DO NOTHING, giữ nguyên role/cutoff cũ).

### c) `idx_ecosystem_units_company_parent_division` (2 lần)

Không phải đua nhau — **lỗi logic**. `findSubsidiaryUnderDivision` lọc
`.eq('is_active', true)`, nhưng unique index `(company_id, parent_id)`
**không** lọc `is_active`. Đo được: 3 hàng đang tắt vẫn chiếm chỗ trong index.
Công ty từng chuyển khối rồi chuyển về sẽ hỏng vĩnh viễn: hàm tìm không thấy
→ INSERT → 23505 → `console.error` + `continue` → đơn vị không bao giờ được
bật lại.
→ Thêm `{ includeInactive: true }` cho đường GHI, nhánh UPDATE sẵn có tự bật lại.

### d) `idx_crm_assignments_crm_task_id` (2 lần) — **nặng nhất**

`crmTaskAssignmentSync.js` có chuỗi nhánh dự phòng so khớp **CHUỖI**:

```js
if (error && /crm_task_id/.test(error.message || '')) {
  const { crm_task_id: _t, ... } = insertRow;   // bẻ crm_task_id ra
  ... .insert(legacy)                            // rồi INSERT LẠI
}
```

Câu báo lỗi 23505 là `duplicate key value violates unique constraint
"idx_crm_assignments_crm_task_id"` — **có chứa chữ `crm_task_id`**. Nên mỗi
lần đâm unique, hệ thống lại đẻ thêm một bản giao việc **không gắn task nào**.

Đo được trong DB:

| | |
|---|---|
| `crm_assignments` có `crm_task_id IS NULL` | **138** |
| Trong đó trùng bản thật (cùng lead + tiêu đề + người nhận, cách < 5 giây) | **122** |
| Giao việc tạo tay hợp lệ | 16 |
| Bản rác đã bị NV đánh dấu «hoàn thành» | **21** |
| Bản rác có bình luận | 0 |
| Từ | 30/07/2026 |
| Đến | 07/09/2026 **09:09:48** — đúng 88 mili giây sau lỗi 23505 cuối trong log |

→ Sửa: mọi nhánh dự phòng chỉ nhận khi `err.code === '42703'`. Riêng 23505 thì
lấy bản đã có ra UPDATE, **tuyệt đối không INSERT lại**.
→ Dọn dữ liệu: `database/595_don_giao_viec_mo_coi_CHUA_CHAY.sql` — có sao lưu,
xem lại, rồi mới xoá. **Chưa chạy, chờ anh.**

---

## 2. TX-5 — RPC anon (migration 592, đã áp)

Rà toàn bộ hàm `SECURITY DEFINER` mà `anon` gọi được qua `/rest/v1/rpc`:

| Hàm | Xử lý |
|---|---|
| `delete_user_hard(uuid)` | **Thu quyền** khỏi anon + authenticated |
| `projects_recompute_has_crm_deal(uuid[])` | **Thu quyền** — không nơi nào trong code gọi |
| `increment_public_share_view(uuid)` | **Thu quyền** — chỉ backend gọi bằng service_role |
| `trg_crm_deal_projects_sync_has_crm_deal()` | **Giữ nguyên có chủ ý** |
| `trg_crm_leads_sync_has_crm_deal()` | **Giữ nguyên có chủ ý** |

Hai hàm trigger trả kiểu `trigger`, PostgREST gọi vào là lỗi `0A000` — không
phải lỗ hổng; thu quyền chỉ thêm rủi ro cho trigger mà không đóng được gì.

Kiểm chứng sau khi áp: `anon` không còn gọi được hàm SECURITY DEFINER nào
(trừ 2 hàm trigger); `service_role` vẫn đủ quyền.

---

## 3. PT-2 — Query guard nay bắt cả lỗi «giết cả câu»

`supabaseQueryGuard.js` đang bắt 2 lỗi âm thầm (cắt 1000 dòng, filter quá dài).
Thêm lỗi thứ 3: **truy vấn bị từ chối CẢ CÂU** — 9 mã: `42703` `42P01` `42883`
`22P02` `42P18` `42601` `PGRST200` `PGRST202` `PGRST204`.

Cũng bọc thêm `insert/update/upsert/delete` để bắt stack — trước đó chỉ bọc
`select`, nên lỗi khi GHI chỉ ghi được «khong-xac-dinh».

Test: `npm run test:query-guard` — chạy offline bằng `fetch` giả, **8/8 ĐẠT**,
gồm 2 mục hồi quy cho hai cảnh báo cũ.

```
[query-guard] COT-KHONG-TON-TAI · users · routes/abc.js:59 · 42703 · column users.cot_xyz does not exist
```

---

## 4. PT-3 — `unified_tasks_v` hết nhân dòng, mà còn **nhanh hơn trước**

Nguyên nhân: nhánh `tasks` nối `LEFT JOIN crm_leads ON cl.project_id =
t.project_id`, mà `crm_leads.project_id` **không duy nhất**.
Đo: 703 lead có project_id · 49 dự án có >1 lead · nhiều nhất 4 lead/dự án.

Lần thử 1 (migration 593) khử trùng đúng nhưng **làm hỏng kế hoạch truy vấn** —
ước lượng tụt còn `rows=2` nên planner đổi sang Nested Loop 13.139 vòng.
Lần 2 (migration 594) tách dòng phụ thành nhánh UNION riêng: lọc
`is_primary_lead = true` biến nhánh phụ thành `WHERE false`, EXPLAIN cho
**`One-Time Filter: false`** — bị loại ngay lúc lập kế hoạch.

| | Thời gian | Buffers | Trùng |
|---|---|---|---|
| Trước | 259 ms | 9.022 | có |
| Sau 593 | 169 ms | 48.696 | hết |
| **Sau 594** | **161 ms** | **5.688** | **hết** |

Kết quả trên dữ liệu thật: 127.262 dòng → lọc primary còn **124.924**, đúng
bằng số `unified_id` khác nhau, **0 dòng trùng còn lại**. 2.338 dòng phụ vẫn
còn nguyên cho trang của lead thứ 2.

Riêng công ty Hucabi: danh sách việc **14.997 → 13.615** (bớt 1.382 dòng ma, 9,2%).

Chỗ lọc: `unifiedTasksQuery.js` (3 hàm), `workTasks.js`, `management.js` (3 câu
đếm). **Không** lọc ở đường bám theo `lead_id` — lọc ở đó thì task của lead
thứ 2 sẽ biến mất.

---

## 5. PT-5 — Lệch RLS: vá một, **cố tình không vá cái kia**

**`product_code_parts` — đây mới là lỗ thật.** RLS TẮT nhưng có 2 policy
`USING(true)` (policy chết). Đo được: `anon` có đủ SELECT/INSERT/UPDATE/DELETE
⇒ **ai cầm anon key đều đọc, sửa, xoá được bảng này**. Đã xoá 2 policy giả,
bật RLS, thu quyền khỏi anon/authenticated. Backend không ảnh hưởng vì
`service_role` có `rolbypassrls = true` (đã kiểm chứng).

**`public_share_links` — KHÔNG thêm policy đọc.** Kế hoạch ghi «có policy đọc
token còn hạn», nhưng đã grep cả `backend/src` lẫn `frontend/src`: bảng này
**chỉ** được đọc từ Express `/api/public/share/:token` bằng service_role.
RLS bật + 0 policy = chặn sạch anon — **đó là trạng thái đúng**. Thêm policy
đọc vào là mở cho anon `GET /rest/v1/public_share_links` liệt kê **toàn bộ**
link chia sẻ kèm payload. Đã ghi `COMMENT ON TABLE` giải thích để lần sau
không ai «sửa» nhầm.

---

## 6. Việc cần anh làm

1. **Áp patch + deploy** — `0005-tuan-08-09-2026-backend-db.patch` (42 file).
   Patch này **đã gộp cả 0003 và 0004**, chỉ áp 0005, đừng áp lại 2 cái kia.
   ```
   git pull
   git apply --check --ignore-whitespace 0005-tuan-08-09-2026-backend-db.patch
   git apply --ignore-whitespace 0005-tuan-08-09-2026-backend-db.patch
   cd backend && npm run test:perf-retention && npm run test:role-enum && npm run test:query-guard
   ```
   Nếu `--check` báo trùng (origin/main đã có phần 0003), dùng `git apply --3way`.

2. **Xoá `.git\index.lock`** — lệnh `git add` của tôi bị treo và để lại file
   khoá 0 byte, nó chặn mọi `git commit`. Tôi không có quyền xoá file trên máy anh.

3. **Duyệt dọn 122 hàng rác** — nói một tiếng là tôi chạy `595`.

4. **Đọc log `[query-guard]` trên Render** sau khi deploy (TX-6) — tôi không
   vào được Render. Bản mới in thêm dòng `COT-KHONG-TON-TAI` / `GIA-TRI-SAI-KIEU`
   kèm đúng `file:dòng`.

5. **Sau deploy: quét lại log 24h** (TX-4). Mong đợi: 22P02 = 0, 23505 = 0.

---

## 7. Ba việc CỐ TÌNH không làm

- **Không nới rằng buộc unique nào** — đúng như kế hoạch. Mọi lỗi 23505 đều sửa
  ở phía ghi.
- **Không sửa 2.282 chỗ nuốt `error`** — chỉ bọc 6 chỗ đã chứng minh từng hỏng
  (`helpers/queryErrorLog.js`). Query guard lo phần còn lại ở tầng dưới.
- **Không bật RLS 100 bảng, không thêm 311 index FK, không xoá 159 index
  «unused»** — đúng như kế hoạch.

## 8. TÔI ĐÃ KẾT LUẬN SAI MỘT LẦN — sửa lại ở đây

Bản báo cáo đầu tiên của tôi viết: «thư mục cũ hơn code đang chạy, vì 24h qua DB
có 0 lỗi 42703». **Kết luận đó SAI.** Bằng chứng phủ nhận: ảnh log 11:00–12:00
ngày 08/09 cho **145 lỗi 42703**.

Cái tôi đo được là **0 lỗi trong một khoảng lặng** (17:00 hôm trước → 08:40 sáng,
lúc tôi chạy câu truy vấn), rồi tôi đọc nó thành «code đã được sửa». Lỗi bắt đầu
đúng lúc **10:23 sáng** khi có người mở dashboard. Không có lỗi ≠ đã sửa; chỉ có
nghĩa là chưa ai chạm vào đoạn code đó.

Sự thật: **origin/main CHƯA có patch 0003.** Cả `crm_leads.budget` lẫn
`projects.due_date` đều đang hỏng thật trên máy chủ ngay lúc này.

## 9. Lỗi đang chạy thật, tìm ra nhờ ảnh log của anh

Bóc theo giờ (UTC, giờ VN = +7):

| Giờ UTC | 42703 | 23505 | Khác |
|---|---|---|---|
| 07/09 09:00 | 0 | 2 | 22P02 ×3 |
| 08/09 01:00 | 1 (của tôi) | 0 | 22P02 ×4 |
| 08/09 02:00 | 0 | 3 | |
| 08/09 03:00 | **12** | 0 | |
| 08/09 04:00 | **124** | **22** | |

**a) `column crm_leads.budget does not exist` — 91 lần**
Đã có trong patch 0003, chỉ chờ deploy.

**b) `column projects.due_date does not exist` — 45 lần → ĐÃ SỬA HÔM NAY**
`projects` không có `due_date` (cột đúng là `deadline`). Hai chỗ trong
`routes/dashboard.js` đếm «dự án trễ hạn» → cả câu hỏng → ô đó luôn trống.
Đây là lỗi **mới**, không nằm trong 29 cột của patch 0003.

**c) `crm_task_assignees_pkey` — 7 lần → ĐÃ SỬA HÔM NAY**
Cùng kiểu DELETE + INSERT không nguyên tử như `crm_assignment_assignees`, nhưng
là bảng thứ năm mà tôi chưa đụng tới sáng nay. Đã đổi sang upsert-ignore.
Cả cụm 22 lỗi 23505 nổ trong 13 giây (04:17:20 → 04:17:33) trên cùng một task —
một lần giao việc, ba rằng buộc đâm liên hoàn.

**d) `pps.role`, `unaccent(text)`, `GREATEST integer/interval`, `CREATE FUNCTION
in read-only transaction` — KHÔNG phải lỗi ứng dụng.**
Cả bốn đều có `application_name = mgmt-api`, tức người ta gõ tay trong SQL editor
của Supabase. Cùng loại với lỗi `r.display_name` do chính tôi gây ra lúc 01:36.

## 10. Quét thêm: cột sai trong BỘ LỌC (audit.py cũ không thấy)

`projects.due_date` lọt lưới vì `audit.py` chỉ đọc chuỗi trong `.select(...)`,
mà chỗ đó viết `.select('*')` rồi lọc bằng `.lt('due_date', …)`. Cột sai trong
bộ lọc cũng huỷ cả câu y hệt.

Đã viết bộ quét mới `audit/quet-cot-trong-bo-loc.py`: gom **1.223 cặp
(bảng, cột)** trong `.eq/.in/.lt/.order/...` rồi đối chiếu schema thật.
20 cặp nghi ngờ → rà tay từng cặp → **6 lỗi thật, 14 báo động giả**
(bộ quét gán cột cho `.from()` gần nhất nên nhầm khi một hàm dựng nhiều truy vấn).

| Cột sai | Hậu quả | Sửa |
|---|---|---|
| `projects.due_date` ×2 | Ô «dự án trễ hạn» trên dashboard luôn trống | → `deadline` |
| `projects.division_id` ×10 | **Lọc theo Khối trên bảng VC/Lắp đặt trả về RỖNG** | Khối nằm ở `companies.division_unit_id` → tra công ty rồi lọc `company_id`/`logistics_company_id` |
| `drive_files.is_trashed` | Hạn mức Drive của tenant luôn = 0 | → `.is('trashed_at', null)` |
| `ecosystem_levels.is_active` | Toàn bộ khối hệ sinh thái trên dashboard trả rỗng | Bảng không có cột này → bỏ hẳn bộ lọc |
| `crm_pipeline_stages.company_id` ×2 | Nhánh dự phòng «hồi lại giai đoạn» hỏng khi lead không có pipeline_id | Công ty nằm ở `crm_pipelines` → tra pipeline rồi `.in('pipeline_id', …)` |
| `role_permissions.role` | Script `test-permissions.js` luôn báo 0 quyền | Bảng nối `(role_id, permission_id)` → tra `roles.name` → id |

Sau khi sửa, chạy lại bộ quét: **6 cặp này biến mất**, 15 cặp còn lại đều đã rà
tay và xác nhận là báo động giả.

Điểm đáng nói về `projects.division_id`: nó **chưa** xuất hiện trong log hôm nay
vì chỉ nổ khi người dùng bấm lọc theo Khối. Không có nó trong log không có nghĩa
là không hỏng — đúng cái bẫy đã làm tôi kết luận sai ở mục 8.

## 11. Ô «dự án trễ hạn» — vì sao tôi để nguyên 0

Anh nói không có ưu tiên, nên tôi chọn phương án ít sai nhất và ghi rõ lý do vào
code để người sau không phải đoán lại.

`projects.deadline` **rỗng ở cả 669 dự án**. Các cột ngày có dữ liệu thật:

| Cột | Có giá trị | Đã qua ngày |
|---|---|---|
| `install_date` | 194 | 155 |
| `production_finish_date` | 94 | 47 |
| `production_deadline` | 91 | 43 |
| `delivery_date` | 82 | 43 |
| `deadline` | **0** | 0 |

**Tôi CỐ TÌNH không đổi sang `install_date`** dù nó nhiều dữ liệu nhất: 155 trong
194 dự án đã qua ngày lắp **vì đã lắp xong**. Đếm chúng là «trễ hạn» sẽ cho ra
con số 155 trông rất thuyết phục nhưng sai — tệ hơn hẳn việc hiện 0. Cùng lý do
với `production_finish_date` (ngày SX xong) và `delivery_date` (ngày đã giao).

Nên tôi giữ đúng tên cột (`deadline`), lỗi 42703 hết, ô hiện 0 — **đúng với dữ
liệu đang có**: chưa dự án nào được đặt hạn chót. Muốn ô này có số, chọn một
trong hai:

- **Điền `projects.deadline`** khi tạo/sửa dự án. Không phải sửa code gì thêm,
  và `isProjectOverdue` trong `routes/management.js` cũng chạy đúng luôn (nó
  cũng đang đọc `deadline` nên cũng đang chết theo).
- **Chốt lại định nghĩa** «trễ hạn» (ví dụ: `production_deadline` đã qua **và**
  status chưa `completed`/`warranty`) rồi bảo tôi, sửa một dòng là xong.

Ghi chú đầy đủ đã nằm ngay trên đoạn code trong `routes/dashboard.js`.
