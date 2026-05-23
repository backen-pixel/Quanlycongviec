-- 224_ai_chat_bot_playbooks.sql
-- Thư viện "Mẫu nội dung AI" (playbooks) cho 🤖 AI Assistant trong chat.
-- Admin có thể tạo bao nhiêu mẫu cũng được (vd: "Nhắc CSKH", "Phân tích doanh thu tuần",
-- "Cảnh báo lead VIP chưa chốt"…) và bật/tắt từng mẫu độc lập.
--
-- Mỗi schedule trong ai_chat_bot_schedules sẽ THAM CHIẾU 1 playbook qua playbook_id.
-- Sau khi backfill, prompt_kind/custom_prompt cũ chỉ còn vai trò backward-compat.
--
-- Idempotent — an toàn chạy lại.

-- ───────────────────────── 1) Bảng playbooks ─────────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_bot_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Slug ổn định (vd: 'daily_brief'); UNIQUE để code backend dò mẫu builtin.
  code TEXT UNIQUE NOT NULL,

  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,  -- emoji hiển thị trên UI (vd: '📋', '⚠️', '📊')

  -- Loại dữ liệu bối cảnh AI sẽ thấy:
  --   'channel_context' — task/lead/CSKH của thành viên kênh (mặc định)
  --   'kpi'             — KPI tháng của thành viên kênh
  --   'none'            — không kèm dữ liệu, chỉ chạy theo prompt thuần
  data_source TEXT NOT NULL DEFAULT 'channel_context'
    CHECK (data_source IN ('channel_context', 'kpi', 'none')),

  -- Lệnh hệ thống gửi sang OpenAI (mô tả cách viết, định dạng, độ dài).
  -- Sẽ được nối thêm vào system_prompt chung của bot.
  system_prompt TEXT NOT NULL,

  -- Phần "yêu cầu thêm" (optional) — chèn vào user message dưới dạng admin_instruction.
  -- Hữu ích cho mẫu custom kiểu "tóm tắt lead VIP còn chưa chốt".
  user_prompt_extra TEXT,

  max_tokens INT NOT NULL DEFAULT 700,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.55,

  -- Builtin: 4 mẫu seed bên dưới, không cho xoá (admin chỉ sửa nội dung).
  is_builtin BOOLEAN NOT NULL DEFAULT false,

  enabled BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_pb_enabled ON ai_chat_bot_playbooks(enabled);

ALTER TABLE ai_chat_bot_playbooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_chat_bot_playbooks_all" ON ai_chat_bot_playbooks;
CREATE POLICY "ai_chat_bot_playbooks_all" ON ai_chat_bot_playbooks FOR ALL USING (true) WITH CHECK (true);

-- ───────────────────────── 2) Seed 4 builtin playbooks ─────────────────────────
-- UUID cố định để các seed/backfill khác có thể tham chiếu được sau này.
INSERT INTO ai_chat_bot_playbooks (id, code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
VALUES
  (
    '00000000-0000-0000-0000-0000000ab001',
    'daily_brief',
    'Tóm tắt việc cần làm hôm nay',
    'Tổng hợp quá hạn + sắp hạn + lead đang mở của thành viên kênh — phù hợp để chạy mỗi sáng.',
    '📋',
    'channel_context',
    'Loại: "Tóm tắt việc cần làm hôm nay" cho kênh.
Cấu trúc:
1) Một dòng tóm tắt: số quá hạn + số sắp hạn + số lead đang mở.
2) Gạch đầu dòng "- " 3–7 việc ưu tiên (ưu tiên overdue trước), mỗi dòng nêu rõ tên công việc + assignee + lead code (nếu có) + hạn (hoặc "QUÁ HẠN").
3) Một câu nhắc/cổ vũ ngắn.',
    700, 0.55, true, true
  ),
  (
    '00000000-0000-0000-0000-0000000ab002',
    'overdue',
    'Cảnh báo công việc quá hạn',
    'Chỉ liệt kê task/lead đã quá hạn — phù hợp chạy giữa ngày để team chốt cuối ngày.',
    '⚠️',
    'channel_context',
    'Loại: "Cảnh báo quá hạn".
Cấu trúc:
1) Một dòng cảnh báo: tổng số task/lead quá hạn của kênh.
2) Liệt kê 5–10 việc quá hạn (sắp xếp theo mức trễ hạn) — mỗi dòng nêu task + assignee + lead (nếu có) + đã trễ bao lâu.
3) Một câu nhắc xử lý ngay.
Nếu không có việc quá hạn nào, viết 1 câu chúc mừng kênh.',
    700, 0.5, true, true
  ),
  (
    '00000000-0000-0000-0000-0000000ab003',
    'kpi',
    'Tình hình KPI tháng',
    'Top điểm KPI ròng tháng của các thành viên kênh — cảnh báo người âm điểm.',
    '📊',
    'kpi',
    'Loại: "Tình hình KPI tháng" của thành viên trong kênh.
Cấu trúc:
1) Một dòng tổng quan tháng này.
2) Liệt kê top 5–8 nhân viên theo điểm ròng KPI (cả người âm điểm để cảnh báo).
3) Một câu khuyến khích hoặc gợi ý hành động (vd: ai âm điểm nên review giao việc).
Nếu rows rỗng, nói thẳng "Chưa có dữ liệu KPI tháng cho thành viên kênh."',
    700, 0.55, true, true
  ),
  (
    '00000000-0000-0000-0000-0000000ab004',
    'custom',
    'Tự do (tuỳ chỉnh)',
    'Mẫu mặc định cho các yêu cầu tuỳ chỉnh khi tạo lịch — admin sẽ nhập prompt riêng.',
    '✨',
    'channel_context',
    'Loại: tự do theo yêu cầu admin.
Đọc kỹ trường "admin_instruction" rồi viết nội dung phù hợp, vẫn dùng dữ liệu trong context_pack làm bằng chứng.',
    700, 0.6, true, true
  )
ON CONFLICT (id) DO UPDATE SET
  -- Cho phép migration cập nhật mô tả/system_prompt/icon — không đụng enabled
  -- để admin đã tắt thì giữ trạng thái tắt.
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  data_source = EXCLUDED.data_source,
  is_builtin = true,
  updated_at = now();

-- ───────────────────────── 3) Vài mẫu gợi ý (NON-builtin) ─────────────────────────
-- Admin có thể xoá / sửa thoải mái. Chỉ seed nếu chưa có (idempotent qua code).
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'vip_lead_warning',
       'Cảnh báo lead VIP chưa chốt',
       'Chốt nhanh các lead giá trị lớn đang treo — chạy 1 lần/ngày lúc 16h là hợp lý.',
       '💎',
       'channel_context',
       'Bạn đang nhắc kênh về các lead có giá trị ước tính cao đang treo.
- Trong context_pack.leads_open, tìm các lead có estimated_value lớn (top 5).
- Viết tiêu đề 1 dòng, sau đó liệt kê 3-5 lead (mã + tên + người phụ trách + giá trị + giai đoạn).
- Một câu nhắc cuối: "Hãy chốt trước 18h hôm nay".
Nếu không có lead nào, nói thẳng "Hôm nay không có lead VIP đang treo."',
       NULL, 600, 0.5, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'vip_lead_warning');

INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'end_of_day_recap',
       'Nhắc khoá sổ cuối ngày',
       'Đẩy tin nhắn cuối ngày 17h30: tổng kết task hoàn thành + còn lại + nhắc cập nhật trạng thái.',
       '🌙',
       'channel_context',
       'Bạn đang đăng tin cuối giờ làm. Văn phong nhẹ nhàng, cảm ơn team.
Cấu trúc:
1) Câu mở đầu: "Cuối ngày rồi cả nhà."
2) Tóm tắt: số task quá hạn còn lại + số task sắp hạn (≤72h).
3) Gạch đầu dòng 3-5 việc quan trọng còn treo (assignee + tên việc).
4) Câu kết: nhắc cập nhật trạng thái trên hệ thống trước khi tan ca.',
       NULL, 600, 0.6, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'end_of_day_recap');

INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, user_prompt_extra, max_tokens, temperature, is_builtin, enabled)
SELECT 'team_pep_talk',
       'Lời chào & động viên buổi sáng',
       'Câu chào sáng + 1 thông tin tích cực rút từ KPI/leads — vài câu ngắn, không nặng dữ liệu.',
       '☀️',
       'kpi',
       'Bạn đang gửi lời chào buổi sáng cho kênh chat. Văn phong tích cực, ngắn (3-5 câu).
- Nếu có thành viên KPI cao tháng này, khen 1 người.
- Sau đó 1 câu chúc cả team có ngày làm việc hiệu quả.
- KHÔNG dùng gạch đầu dòng.',
       NULL, 350, 0.8, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'team_pep_talk');

-- ───────────────────────── 4) Link schedules ↔ playbooks ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'playbook_id'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN playbook_id UUID REFERENCES ai_chat_bot_playbooks(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill: schedule cũ (chỉ có prompt_kind) → trỏ về builtin playbook tương ứng
UPDATE ai_chat_bot_schedules s
SET playbook_id = p.id
FROM ai_chat_bot_playbooks p
WHERE s.playbook_id IS NULL
  AND s.prompt_kind IS NOT NULL
  AND p.code = s.prompt_kind
  AND p.is_builtin = true;

CREATE INDEX IF NOT EXISTS idx_ai_bot_sched_playbook ON ai_chat_bot_schedules(playbook_id);

-- Vẫn giữ cột prompt_kind/custom_prompt cho backward-compat, nhưng code mới chỉ dùng playbook_id.
