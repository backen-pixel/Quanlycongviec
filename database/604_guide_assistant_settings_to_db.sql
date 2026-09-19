-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 604 — ĐƯA CẤU HÌNH TRỢ LÝ HƯỚNG DẪN VÀO app_settings
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Chạy tay qua Supabase Dashboard → SQL Editor (repo này không có migration runner).
-- Chạy lại nhiều lần không sao: xem phần "VÌ SAO DO NOTHING" bên dưới.
--
-- ═══════════════ VIỆC NÀY CHỮA GÌ ═══════════════
--
-- Cấu hình trợ lý hiện nằm ở MỘT TỆP, không nằm trong DB:
--
--     backend/uploads/guide-memory/settings.json
--
-- Trên Docker thì tệp đó sống trong volume nên không sao. Rời Docker sang Render thì hỏng, vì
-- `render.yaml` KHÔNG khai `disk:` — thư mục `uploads/` là tạm, sạch sau mỗi lần deploy.
--
-- Hậu quả nặng nhất KHÔNG phải mất vài con số tinh chỉnh, mà là hạn mức ngày:
--
--     daily_question_quota = 30   →  mất tệp  →  quay về mặc định 0
--
-- Mà cổng hạn mức TỰ TẮT khi cả hai trần đều bằng 0 (xem `isEnabled()` trong guideQuota.js).
-- Tức sau mỗi lần deploy, trợ lý im lặng chạy KHÔNG GIỚI HẠN cho tới khi có người nhớ vào chỉnh
-- lại — mà không ai biết là phải chỉnh, vì màn hình cấu hình hiện đúng giá trị mặc định chứ không
-- báo lỗi gì. Hỏng kiểu fail-OPEN, không phải fail-closed.
--
-- Thêm nữa, `render.yaml` cho co giãn tới 3 instance. Tệp là cục bộ từng instance, nên ba instance
-- là ba cấu hình khác nhau, và bấm Lưu chỉ sửa được đúng instance đang phục vụ request đó.
--
-- ═══════════════ VÌ SAO DÙNG app_settings, KHÔNG DỰNG BẢNG RIÊNG ═══════════════
--
-- Dự án đã có sẵn đúng cơ chế này: bảng `app_settings` (xem 45_app_settings.sql) cộng
-- `backend/src/helpers/appSettingsCache.js` — cache hai tầng RAM 90 giây + Redis 10 phút, kèm
-- `invalidateAppSettingKey()` để gọi ngay sau khi Lưu. Dựng bảng thứ hai cho riêng trợ lý là
-- chép lại thứ đã chạy được, rồi phải bảo trì hai bản.
--
-- MỘT HÀNG, một khối JSON — không phải mỗi núm một hàng. Lý do: `getAppSettingValue(key, fallback)`
-- trả về nguyên khối JSON cho một khoá, nên một hàng là một lần đọc. Ba mươi núm thành ba mươi
-- hàng thì thành ba mươi lần đọc cho một việc.
--
-- ═══════════════ CHỈ CHỨA PHẦN ĐÃ ĐỔI ═══════════════
--
-- Khối JSON dưới đây là BẢN ĐÈ, không phải toàn bộ cấu hình. Đúng ngữ nghĩa của settings.json
-- hiện nay: chỉ ghi những gì admin đã chỉnh, mọi khoá khác lấy mặc định từ biến môi trường rồi
-- tới giá trị cứng trong `guideSettings.js`.
--
-- Giữ đúng ngữ nghĩa đó là có lợi: thêm một núm mới vào mã thì nó tự có mặc định, không phải
-- đụng tới DB. Nhét cả 30 khoá vào đây là biến DB thành bản sao thứ hai của lược đồ, và hai bản
-- sao thì sớm muộn lệch nhau.
--
-- ═══════════════ VÌ SAO `DO NOTHING` CHỨ KHÔNG `DO UPDATE` ═══════════════
--
-- Đây là lệnh GIEO HẠT, chạy một lần lúc chuyển đổi. Nếu ứng dụng đã ghi cấu hình mới hơn vào
-- hàng này rồi, chạy lại migration mà `DO UPDATE` là ĐÈ NGƯỢC giá trị đang dùng bằng ảnh chụp
-- của ngày 16/09/2026 — âm thầm, và không ai biết cho tới lúc thấy trợ lý hành xử lạ.
--
-- Muốn sửa giá trị thì sửa ở màn hình cấu hình trợ lý, hoặc chạy tay lệnh UPDATE ở cuối tệp này.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

INSERT INTO app_settings (key, value)
VALUES (
  'guide_assistant',
  jsonb_build_object(
    -- Ảnh chụp settings.json trên bản đang chạy, ngày 16/09/2026.
    'reasoning_effort',       'low',
    'daily_question_quota',   30,
    'intent_model',           'claude-sonnet-5',
    'background_learn_model', 'claude-sonnet-5',
    'semantic_threshold',     0.39,
    'remembered_turns',       6
  )
)
ON CONFLICT (key) DO NOTHING;


-- ═══════════════ KIỂM LẠI ═══════════════
--
-- SELECT key, jsonb_pretty(value), updated_at FROM app_settings WHERE key = 'guide_assistant';


-- ═══════════════ SỬA MỘT NÚM BẰNG TAY ═══════════════
--
-- Gộp chứ không thay cả khối — `||` chỉ đè đúng khoá được nêu, giữ nguyên phần còn lại:
--
-- UPDATE app_settings
--    SET value = value || jsonb_build_object('daily_question_quota', 50),
--        updated_at = now()
--  WHERE key = 'guide_assistant';


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- CÒN PHẢI LÀM GÌ SAU MIGRATION NÀY
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Migration này MỚI CHỈ GIEO DỮ LIỆU. `guideSettings.js` vẫn đang đọc tệp JSON, nên chạy xong
-- hàng này thì CHƯA có gì đổi trong hành vi. Ba việc còn lại, theo thứ tự:
--
--  1. `guideSettings.js` đọc từ `app_settings` thay cho tệp. Ràng buộc bắt buộc: `get()` phải
--     GIỮ NGUYÊN dạng ĐỒNG BỘ — nó bị gọi trong vòng lặp chấm điểm từng bản ghi, biến thành
--     async là kéo theo sửa mọi tệp `guide*`. Nên DB chỉ là tầng bền, không nằm trên đường nóng:
--         khởi động  → nạp một lần vào RAM
--         mỗi 60 giây → dò xem đổi chưa, đổi thì nạp lại   (đúng khuôn guideCache đang dùng
--                                                            cho kho kiến thức, đã chạy thật)
--         bấm Lưu     → ghi DB + làm mới RAM ngay
--         get()       → vẫn đọc RAM, nơi gọi không phải sửa một dòng nào
--
--  2. Chuyển đổi một lần lúc khởi động: còn tệp `settings.json` mà DB chưa có hàng thì đẩy lên,
--     giống hệt cách kho kinh nghiệm hợp nhất JSON → DB. Người dùng không thấy gì khác.
--
--  3. SÀN HẠN MỨC PHẢI Ở BIẾN MÔI TRƯỜNG, không chỉ ở DB:
--
--         GUIDE_HAN_MUC_CAU_HOI=30
--
--     Vì cổng hạn mức fail-OPEN. Nếu con số 30 chỉ sống trong DB và DB không với tới được, trợ lý
--     lại chạy không giới hạn — đúng cái lỗi mà migration này sinh ra để chữa, chỉ đổi nguyên
--     nhân từ "mất tệp" sang "mất DB". DB được phép NÂNG trần lên, không được hạ xuống dưới sàn.
--
-- Việc 3 làm được NGAY và độc lập với hai việc kia. Nếu chỉ làm được một việc thì làm việc đó.
