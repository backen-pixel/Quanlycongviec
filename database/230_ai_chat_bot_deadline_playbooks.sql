-- 230_ai_chat_bot_deadline_playbooks.sql
-- Seed thêm 3 playbook cảnh báo deadline cho 🤖 AI Assistant:
--   - lead_deadline_expired : Lead/Deal đã quá expected_close_date (kèm link sâu).
--   - tasks_due_week        : Nhiệm vụ giao việc hết hạn trong 7 ngày tới.
--   - tasks_due_month       : Nhiệm vụ giao việc hết hạn trong 30 ngày tới.
--
-- Các field tương ứng đã được aiBotSender.buildChannelContextPayload xuất ra
-- trong context_pack (leads_expired, tasks_due_this_week, tasks_due_this_month).
--
-- Idempotent — chỉ seed khi chưa có code đó.

-- ──────────────── 1) Lead/Deal hết hạn ────────────────
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'lead_deadline_expired',
       'Cảnh báo Lead/Deal hết hạn',
       'Liệt kê các lead/deal đã quá expected_close_date nhưng chưa đóng — kèm link mở thẳng trên web.',
       '🔴',
       'channel_context',
       'Bạn đang cảnh báo kênh về các lead/deal đã VƯỢT hạn dự kiến đóng (expected_close_date) nhưng vẫn còn mở.
Dữ liệu: context_pack.leads_expired (đã sort theo expected_close_date tăng dần — trễ lâu nhất trước).
Mỗi item gồm: code, title, type (lead/deal), assignee, stage, estimated_value_text, days_overdue, link.

Cấu trúc tin nhắn:
1) Tiêu đề 1 dòng: "🔴 Có N lead/deal trễ hạn — cần xử lý ngay" (N = leads_expired.length).
   Nếu N=0: viết "Hôm nay không có lead/deal nào trễ hạn." rồi dừng.
2) Liệt kê 3–8 mục đầu, mỗi dòng theo định dạng:
   - <code> · <title> · @assignee · trễ <days_overdue> ngày · <estimated_value_text>đ → <link>
   (BẮT BUỘC kèm field "link" nếu có giá trị — đó là URL mở chi tiết trên web.)
3) Câu kết: nhắc trực tiếp các assignee được liệt kê, đề nghị cập nhật trạng thái HÔM NAY.',
       NULL, 700, 0.45, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'lead_deadline_expired');

-- ──────────────── 2) Nhiệm vụ hết hạn trong TUẦN ────────────────
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'tasks_due_week',
       'Nhiệm vụ hết hạn trong tuần',
       'Tổng hợp các task được giao có deadline trong 7 ngày tới — gồm cả task CRM và task dự án.',
       '📅',
       'channel_context',
       'Bạn đang nhắc kênh về các nhiệm vụ ĐƯỢC GIAO có deadline trong 7 ngày tới.
Dữ liệu: context_pack.tasks_due_this_week (đã sort theo deadline gần nhất trước).
Mỗi item gồm: kind (crm_task/task), title, deadline, assignee, days_to_deadline, lead_code (nếu kind=crm_task), lead_link (link mở lead trên web).

Cấu trúc tin nhắn:
1) Tiêu đề 1 dòng: "📅 Nhiệm vụ phải xong trong tuần (N)" — N = tasks_due_this_week.length.
   Nếu N=0: viết "Tuần này không có nhiệm vụ nào tới hạn — cả nhà nhẹ nhõm!" rồi dừng.
2) Nhóm theo assignee, mỗi assignee 1 cụm. Trong cụm là gạch đầu dòng:
   - <title> · còn <days_to_deadline> ngày · <ngày deadline dd/MM> [→ <lead_link> nếu có]
3) Câu kết: chúc cả tuần làm việc thuận lợi, nhắc cập nhật trạng thái khi xong.

LƯU Ý: BẮT BUỘC chèn lead_link đúng nguyên văn khi có giá trị — không rút gọn URL.',
       NULL, 900, 0.5, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'tasks_due_week');

-- ──────────────── 3) Nhiệm vụ hết hạn trong THÁNG ────────────────
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'tasks_due_month',
       'Nhiệm vụ hết hạn trong tháng',
       'Tổng hợp các task được giao có deadline trong 30 ngày tới — phù hợp chạy đầu tuần / đầu tháng.',
       '🗓',
       'channel_context',
       'Bạn đang tóm lược nhiệm vụ phải xong trong 30 ngày tới của kênh.
Dữ liệu: context_pack.tasks_due_this_month (đã sort theo deadline tăng dần).
Mỗi item gồm: kind, title, deadline, assignee, days_to_deadline, lead_code, lead_link.

Cấu trúc tin nhắn:
1) Tiêu đề 1 dòng: "🗓 Kế hoạch nhiệm vụ tháng tới (N)" — N = tasks_due_this_month.length.
2) Phân loại theo MỐC THỜI GIAN (đếm số lượng) — dùng days_to_deadline:
   - "Tuần này (≤7 ngày): X"
   - "Tuần sau (8–14 ngày): Y"
   - "Cuối tháng (15–30 ngày): Z"
3) Liệt kê 5–10 mục ưu tiên (trễ trước, ưu tiên cao trước) — mỗi dòng:
   - <title> · @assignee · còn <days_to_deadline> ngày [→ <lead_link>]
4) Câu kết: gợi ý team review đầu tuần.

Nếu N=0: viết "Tháng tới chưa có nhiệm vụ nào — tranh thủ chăm sóc lead mới." và dừng.',
       NULL, 900, 0.5, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'tasks_due_month');
