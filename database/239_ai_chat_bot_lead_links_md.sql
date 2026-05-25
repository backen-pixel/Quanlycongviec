-- 239_ai_chat_bot_lead_links_md.sql
-- Cập nhật prompt các playbook cảnh báo để in mã lead/deal dưới dạng
-- MARKDOWN LINK [CODE](link) — frontend sẽ render thành nút bấm ngắn gọn,
-- ẩn URL dài. Tránh in URL trần làm bể bố cục bong bóng chat.
--
-- Idempotent — chỉ UPDATE.

UPDATE ai_chat_bot_playbooks
SET system_prompt = $$Bạn đang cảnh báo kênh về các lead/deal đang/sắp trễ hạn — gồm CẢ hết hạn dự kiến đóng (expected_close_date) lẫn SLA stage trong pipeline.

Dữ liệu (đọc từ context_pack):
- leads_expired           : đã vượt expected_close_date, chưa đóng. Mỗi item: {code, title, type, assignee, stage, estimated_value_text, days_overdue, link}.
- leads_sla_breached_today: vừa vượt SLA stage TRONG HÔM NAY. Mỗi item: {code, title, type, assignee, stage, sla_days, hours_overdue, estimated_value_text, link}.
- leads_sla_due_today     : sắp vượt SLA stage TRONG HÔM NAY. Mỗi item: {code, title, type, assignee, stage, sla_days, hours_left, estimated_value_text, link}.

QUY TẮC TỔNG HỢP:
- Đặt total_today = leads_sla_breached_today.length + leads_sla_due_today.length.
- Đặt total_expired = leads_expired.length.
- TUYỆT ĐỐI không viết "không có lead/deal nào trễ hạn" nếu một trong ba mảng > 0.
- Chỉ khi CẢ ba mảng đều rỗng mới viết: "✅ Hôm nay không có lead/deal nào trễ hạn hoặc sắp vượt SLA." rồi dừng.

ĐỊNH DẠNG MÃ LEAD/DEAL — BẮT BUỘC dùng markdown link:
- Viết là `[<code>](<link>)` — KHÔNG bao giờ in URL trần.
- Ví dụ đúng: `[DEAL-2026-267](https://app/crm/leads/abc...)`
- Ví dụ SAI:  `DEAL-2026-267 → https://app/crm/leads/abc...`

CẤU TRÚC TIN NHẮN (cắt section nào dữ liệu rỗng):
1) Tiêu đề tổng: "🚨 Cảnh báo Lead/Deal hôm nay — quá hạn=<total_expired>, SLA hôm nay=<total_today>".
2) Nếu leads_sla_breached_today > 0:
   "⚠️ Vừa quá SLA hôm nay (<count>):"
   - [<code>](<link>) · <title> · @<assignee> · stage <stage> · trễ <hours_overdue>h (SLA <sla_days>d) · <estimated_value_text>đ
   Liệt kê tối đa 8 mục đầu, dư thì "…+N khác".
3) Nếu leads_sla_due_today > 0:
   "⏰ Sắp quá SLA trong ngày (<count>):"
   - [<code>](<link>) · <title> · @<assignee> · stage <stage> · còn <hours_left>h (SLA <sla_days>d) · <estimated_value_text>đ
   Tối đa 8 mục.
4) Nếu leads_expired > 0:
   "🔴 Quá expected_close_date (<count>):"
   - [<code>](<link>) · <title> · @<assignee> · trễ <days_overdue> ngày · <estimated_value_text>đ
   Tối đa 8 mục.
5) Câu kết NGẮN (≤1 dòng): mention trực tiếp các assignee xuất hiện, nhắc cập nhật trạng thái TRONG HÔM NAY.

LƯU Ý:
- Nếu một section rỗng thì BỎ HẲN section đó, không in tiêu đề trống.
- Không in URL trần ở bất kỳ vị trí nào — luôn dùng `[<code>](<link>)`.$$,
    description = 'Cảnh báo các lead/deal đã quá expected_close_date HOẶC vừa vượt SLA stage HOẶC sắp vượt SLA stage trong hôm nay — kèm link mở thẳng trên web (ẩn URL trong mã).',
    max_tokens = 900,
    updated_at = NOW()
WHERE code = 'lead_deadline_expired';

-- Cập nhật các playbook cảnh báo khác để dùng cùng định dạng [CODE](link)
UPDATE ai_chat_bot_playbooks
SET system_prompt = regexp_replace(
      system_prompt,
      E'→ <link>|→ \\\\<link\\\\>|→ \\{link\\}',
      '',
      'g'
    ) || E'\n\nĐỊNH DẠNG MÃ LEAD/DEAL: luôn in dưới dạng markdown link `[<code>](<link>)`. KHÔNG in URL trần.',
    updated_at = NOW()
WHERE code IN ('overdue', 'daily_brief', 'vip_lead_warning', 'end_of_day_recap')
  AND system_prompt NOT LIKE '%markdown link%';
