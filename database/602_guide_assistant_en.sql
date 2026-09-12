-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 602 — TRỢ LÝ HƯỚNG DẪN (CopilotKit): TOÀN BỘ LƯỢC ĐỒ, TÊN TIẾNG ANH
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- TỆP DUY NHẤT của trợ lý hướng dẫn. Thay thế hẳn hai tệp đã bị xoá khỏi thư mục này:
--   593_guide_assistant_gop.sql       — lược đồ gốc, tên cột tiếng Việt
--   601_guide_assistant_rename_en.sql — đợt đổi tên sang tiếng Anh (2026-09-10)
--
-- CHẠY ĐƯỢC CHO CẢ HAI TÌNH HUỐNG, không phải chọn tệp:
--   · CSDL TRỐNG          → khối 0 không làm gì, khối 1–4 tạo mới toàn bộ.
--   · CSDL BẢN CŨ         → khối 0 đổi tên cột/bảng/hàm và chuyển dữ liệu bên trong JSONB,
--                            khối 1–4 bù nốt những gì còn thiếu.
-- Thứ tự đó là bắt buộc — xem lý do ở đầu khối 0.
--
-- Idempotent — chạy lại nhiều lần không sao. Năm khối, không phụ thuộc thứ tự (trừ khối 0 phải
-- đứng đầu):
--   0. nâng cấp lược đồ cũ       — không làm gì trên CSDL trống
--   1. guide_experiences         — kho KINH NGHIỆM (đường đi đã thành công) + vector ngữ nghĩa
--   2. guide_knowledge (+version)— kho KIẾN THỨC (danh mục màn hình + hướng dẫn thao tác)
--   3. guide_quota_turn (+4 hàm) — HẠN MỨC ngày (số câu hỏi / số token mỗi người)
--   4. guide_chat_log (+1 hàm)   — NHẬT KÝ đầy đủ mọi lượt hỏi-đáp
--
-- Bốn bảng KHÔNG chồng lấp nhau — đọc kỹ trước khi tưởng bảng này "thay được" bảng kia:
--   guide_experiences  chỉ giữ lượt ĐÁNG HỌC (≥2 bước, không lỗi, không giậm chân), lược bỏ kết
--                      quả thô — dạy lại ĐƯỜNG ĐI, không dạy lại DỮ LIỆU.
--   guide_knowledge    là danh mục TĨNH (màn hình nào có gì), không phải lịch sử hội thoại.
--   guide_quota_turn   chỉ ĐẾM lượt để áp hạn mức — không chứa một chữ nào của câu hỏi.
--   guide_chat_log     là bản ghi ĐẦY ĐỦ của MỌI lượt kể cả lượt hỏng, để đối chiếu khiếu nại.
--
-- MỘT KHÁC BIỆT CÓ CHỦ Ý so với lược đồ cũ: bật RLS cho CẢ `guide_quota_turn` và `guide_chat_log`.
-- 593 chỉ bật cho hai bảng đầu, nên nhật ký hỏi đáp — nơi chứa nguyên văn câu hỏi của nhân viên
-- — vẫn đọc được bằng anon key qua PostgREST. Backend đi bằng service role nên không ảnh hưởng
-- gì. Không muốn đổi thì bỏ hai dòng `ENABLE ROW LEVEL SECURITY` ở cuối khối 3 và 4.
--
-- pg_trgm đã được các migration 345/346/472 bật từ trước; khai lại ở đây (IF NOT EXISTS) chỉ để
-- tệp này tự chạy được độc lập trên một CSDL trống. `vector` (pgvector) thì CHƯA nơi nào khác
-- bật — tệp này là nơi DUY NHẤT cần nó.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- KHỐI 0 — NÂNG CẤP LƯỢC ĐỒ CŨ (tên tiếng Việt) TRƯỚC KHI TẠO
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- CSDL TRỐNG: khối này KHÔNG LÀM GÌ. Mọi lệnh đều bọc trong kiểm tra "cái tên cũ có tồn tại
-- không". Đọc lướt rồi xuống khối 1.
--
-- CSDL ĐANG CHẠY BẢN CŨ: đây là phần quan trọng nhất của tệp, và nó BẮT BUỘC phải chạy trước
-- các lệnh `CREATE TABLE IF NOT EXISTS` bên dưới. Lý do: `CREATE TABLE IF NOT EXISTS
-- guide_experiences` gặp bảng cũ (cột `cau_hoi`, `tu_khoa`…) sẽ bỏ qua ÊM — không tạo, không
-- sửa, không báo. Bảng giữ nguyên tên tiếng Việt trong khi mã nguồn đọc tên tiếng Anh: hỏng
-- trong im lặng, kiểu khó lần nhất. Đổi tên trước, rồi để phần tạo bảng bù nốt cái còn thiếu.
--
-- Khối này CHỈ đổi tên và chuyển dữ liệu; mọi việc TẠO MỚI (bảng, index, hàm, trigger, RLS)
-- nhường hết cho khối 1–4 — để một thứ chỉ được khai đúng một chỗ trong tệp.
--
-- `ALTER TABLE … RENAME COLUMN` không đụng tới dữ liệu, nhưng ba chỗ dưới đây thì phải chuyển
-- thật, vì chữ tiếng Việt nằm trong GIÁ TRỊ chứ không phải trong tên cột:
--   · `source` : 'tu_dong' → 'auto' (guide_experiences), 'thu_cong' → 'manual' (guide_knowledge)
--   · `steps`  : khoá `tom_tat` / `trang_thai` bên trong JSONB → `summary` / `status`
--   · `actions`: khoá `nhan` bên trong JSONB → `label`
--
-- Cả khối nằm trong MỘT transaction: hỏng giữa chừng thì rollback sạch, không để lại lược đồ
-- nửa vời — thứ còn tệ hơn cả hai đầu.

BEGIN;

-- Đổi tên một cột, chỉ khi tên cũ còn đó VÀ tên mới chưa có. Nhờ vế thứ hai mà chạy lại lần
-- thứ n không lỗi.
CREATE OR REPLACE FUNCTION pg_temp.rename_col(p_table text, p_old text, p_new text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_old
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_new
  ) THEN
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', p_table, p_old, p_new);
  END IF;
END;
$$;

-- ── 0.1 guide_experiences ────────────────────────────────────────────────────────────────
SELECT pg_temp.rename_col('guide_experiences', 'cau_hoi',   'question');
SELECT pg_temp.rename_col('guide_experiences', 'tu_khoa',   'keywords');
SELECT pg_temp.rename_col('guide_experiences', 'duong_dan', 'path');
SELECT pg_temp.rename_col('guide_experiences', 'cac_buoc',  'steps');
SELECT pg_temp.rename_col('guide_experiences', 'ngo_cut',   'dead_ends');
SELECT pg_temp.rename_col('guide_experiences', 'bai_hoc',   'lesson');
SELECT pg_temp.rename_col('guide_experiences', 'nguon',     'source');
SELECT pg_temp.rename_col('guide_experiences', 'dung_lai',  'use_count');
SELECT pg_temp.rename_col('guide_experiences', 'that_bai',  'fail_count');
SELECT pg_temp.rename_col('guide_experiences', 'tao_luc',   'created_at');
SELECT pg_temp.rename_col('guide_experiences', 'dung_luc',  'used_at');
SELECT pg_temp.rename_col('guide_experiences', 'bo_luc',    'discarded_at');
SELECT pg_temp.rename_col('guide_experiences', 'bo_ly_do',  'discard_reason');

DO $$
BEGIN
  IF to_regclass('public.guide_experiences') IS NOT NULL THEN
    ALTER TABLE public.guide_experiences ALTER COLUMN source SET DEFAULT 'auto';
    UPDATE public.guide_experiences SET source = 'auto' WHERE source = 'tu_dong';
    UPDATE public.guide_experiences
       SET steps = (
         SELECT coalesce(jsonb_agg(
           CASE WHEN s ? 'tom_tat' THEN (s - 'tom_tat') || jsonb_build_object('summary', s->'tom_tat')
                ELSE s END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(steps) AS s
       )
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(steps) e WHERE e ? 'tom_tat');
  END IF;
END;
$$;

-- Index cũ mang tên cột cũ trong chính tên nó, và điều kiện `WHERE bo_luc IS NULL` cũng đã
-- theo cột cũ — bỏ đi, khối 1 dựng lại bản đúng.
DROP INDEX IF EXISTS public.idx_guide_exp_company_tao_luc;
DROP INDEX IF EXISTS public.idx_guide_exp_company_active;

-- ── 0.2 guide_knowledge + guide_knowledge_version ────────────────────────────────────────
SELECT pg_temp.rename_col('guide_knowledge', 'nguon',        'source');
SELECT pg_temp.rename_col('guide_knowledge', 'noi_dung',     'content');
SELECT pg_temp.rename_col('guide_knowledge', 'thao_tac',     'actions');
SELECT pg_temp.rename_col('guide_knowledge', 'can_quan_tri', 'needs_admin');
SELECT pg_temp.rename_col('guide_knowledge', 'sua_tay',      'hand_edited');
SELECT pg_temp.rename_col('guide_knowledge', 'bo_luc',       'discarded_at');
SELECT pg_temp.rename_col('guide_knowledge', 'tao_luc',      'created_at');
SELECT pg_temp.rename_col('guide_knowledge', 'sua_luc',      'edited_at');
SELECT pg_temp.rename_col('guide_knowledge', 'sua_boi',      'edited_by');

DO $$
BEGIN
  IF to_regclass('public.guide_knowledge') IS NOT NULL THEN
    ALTER TABLE public.guide_knowledge ALTER COLUMN source SET DEFAULT 'manual';
    UPDATE public.guide_knowledge SET source = 'manual' WHERE source = 'thu_cong';
    UPDATE public.guide_knowledge
       SET actions = (
         SELECT coalesce(jsonb_agg(
           CASE WHEN a ? 'nhan' THEN (a - 'nhan') || jsonb_build_object('label', a->'nhan')
                ELSE a END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(actions) AS a
       )
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(actions) e WHERE e ? 'nhan');
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_guide_kb_active;
DROP INDEX IF EXISTS public.uq_guide_kb_nguon_path;

SELECT pg_temp.rename_col('guide_knowledge_version', 'phien',   'version');
SELECT pg_temp.rename_col('guide_knowledge_version', 'sua_luc', 'edited_at');

-- ── 0.3 guide_quota_luot → guide_quota_turn ──────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.guide_quota_luot') IS NOT NULL
     AND to_regclass('public.guide_quota_turn') IS NULL THEN
    ALTER TABLE public.guide_quota_luot RENAME TO guide_quota_turn;
  END IF;
END;
$$;

SELECT pg_temp.rename_col('guide_quota_turn', 'ngay',     'day');
SELECT pg_temp.rename_col('guide_quota_turn', 'luot',     'turn_no');
SELECT pg_temp.rename_col('guide_quota_turn', 'so_token', 'token_count');
SELECT pg_temp.rename_col('guide_quota_turn', 'tao_luc',  'created_at');

DROP INDEX IF EXISTS public.guide_quota_luot_ngay_user_idx;

-- Hàm cũ phải DROP chứ không `CREATE OR REPLACE` đè được: đổi tên tham số và đổi cả tên cột
-- trả về, mà Postgres coi đó là một hàm KHÁC — để nguyên thì hai bản cùng tồn tại và bên gọi
-- vẫn trúng bản cũ.
DROP FUNCTION IF EXISTS public.guide_quota_kiem(date, uuid, uuid, text, integer, integer, bigint);
DROP FUNCTION IF EXISTS public.guide_quota_cong_token(date, uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.guide_quota_theo_ngay(date, uuid);
DROP FUNCTION IF EXISTS public.guide_quota_don(integer);

-- ── 0.4 guide_chat_log ───────────────────────────────────────────────────────────────────
SELECT pg_temp.rename_col('guide_chat_log', 'ngay',         'day');
SELECT pg_temp.rename_col('guide_chat_log', 'tao_luc',      'created_at');
SELECT pg_temp.rename_col('guide_chat_log', 'luot',         'turn_no');
SELECT pg_temp.rename_col('guide_chat_log', 'duong_dan',    'path');
SELECT pg_temp.rename_col('guide_chat_log', 'cau_hoi',      'question');
SELECT pg_temp.rename_col('guide_chat_log', 'tra_loi',      'answer');
SELECT pg_temp.rename_col('guide_chat_log', 'cac_buoc',     'steps');
SELECT pg_temp.rename_col('guide_chat_log', 'so_buoc',      'step_count');
SELECT pg_temp.rename_col('guide_chat_log', 'co_buoc_hong', 'has_failed_step');
SELECT pg_temp.rename_col('guide_chat_log', 'nha_cung_cap', 'provider');

DO $$
BEGIN
  IF to_regclass('public.guide_chat_log') IS NOT NULL THEN
    UPDATE public.guide_chat_log
       SET steps = (
         SELECT coalesce(jsonb_agg(
           (s - 'tom_tat' - 'trang_thai')
           || CASE WHEN s ? 'tom_tat'    THEN jsonb_build_object('summary', s->'tom_tat')    ELSE '{}'::jsonb END
           || CASE WHEN s ? 'trang_thai' THEN jsonb_build_object('status',  s->'trang_thai') ELSE '{}'::jsonb END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(steps) AS s
       )
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(steps) e WHERE e ? 'tom_tat' OR e ? 'trang_thai');
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.guide_chat_log_ngay_user_idx;
DROP INDEX IF EXISTS public.guide_chat_log_tao_luc_idx;
DROP INDEX IF EXISTS public.guide_chat_log_cau_hoi_trgm_idx;
DROP FUNCTION IF EXISTS public.guide_chat_log_don(integer);

-- ── 0.5 Tên khoá chính / ràng buộc do Postgres tự đặt theo tên cột CŨ ────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'guide_quota_luot_pkey') THEN
    ALTER INDEX public.guide_quota_luot_pkey RENAME TO guide_quota_turn_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guide_chat_log_thread_id_luot_key') THEN
    ALTER TABLE public.guide_chat_log
      RENAME CONSTRAINT guide_chat_log_thread_id_luot_key TO guide_chat_log_thread_id_turn_no_key;
  END IF;
END;
$$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1. KHO KINH NGHIỆM — đường đi đã thành công cho những câu hỏi tương tự
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- VÌ SAO CÓ BẢNG NÀY: trước đây kho nằm ở một tệp JSON phẳng trong volume Docker
-- (backend/uploads/guide-memory/experience.json) — sống được qua rebuild nhưng có ba giới hạn:
-- (1) volume là của MỘT máy, kinh nghiệm học ở dev không sang production và ngược lại;
-- (2) nhiều instance thì lệch nhau, mỗi tiến trình học một nửa;
-- (3) không soi được bằng SQL, muốn biết trợ lý đã học gì phải đọc JSON bằng tay.
-- Tệp JSON KHÔNG bị bỏ: vẫn ghi song song làm bản dự phòng, và là nguồn đọc khi DB không với
-- tới được. Xem `backend/src/helpers/guideExperience.js`.
--
-- RANH GIỚI DỮ LIỆU: bảng này CỐ Ý không chứa dữ liệu khách hàng. Mọi chuỗi đi vào đều đã qua
-- bộ làm sạch ở `addExperience()`: email / số điện thoại / số tiền / ngày / số dài bị thay bằng
-- thẻ giữ chỗ, id trong đường dẫn quy về ':id', và trường `answer` (chỗ chở nhiều dữ liệu thật
-- nhất) đã bị bỏ hẳn khỏi bản ghi. Nguyên tắc: nhớ THAO TÁC, không nhớ KẾT QUẢ.
--
-- `company_id` là TEXT chứ không phải UUID có khoá ngoại — kho dùng chuỗi 'chung' cho những bản
-- ghi không thuộc công ty nào (người dùng chưa có company_id).
CREATE TABLE IF NOT EXISTS public.guide_experiences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT NOT NULL DEFAULT 'chung',

  question    TEXT NOT NULL,
  -- Token đã bỏ dấu, dùng để tính Jaccard. Lưu sẵn thay vì tính lại mỗi lần đọc.
  keywords    TEXT[] NOT NULL DEFAULT '{}',
  path        TEXT NOT NULL DEFAULT '',

  -- [{ tool, summary }] — đường đi đã thành công.
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Những cách đã thử mà KHÔNG được. Cộng dồn qua các lần gặp lại.
  dead_ends   TEXT[] NOT NULL DEFAULT '{}',
  lesson      TEXT NOT NULL DEFAULT '',

  -- 'auto' = hệ thống nhặt từ một lượt trót lọt; 'agent' = trợ lý chủ động ghi (đã qua biên tập,
  -- nên bản 'auto' thô KHÔNG được đè nội dung lên nó — xem `mayOverwriteContent`).
  source      TEXT NOT NULL DEFAULT 'auto',
  -- Số lần một câu hỏi tương tự gặp lại bản ghi này. Dùng để quyết định giữ ai khi kho chật.
  use_count   INT NOT NULL DEFAULT 0,
  /*
   * BỘ ĐẾM THẤT BẠI — đối trọng của `use_count`.
   *
   * Không có nó, một bản ghi SAI tự củng cố theo vòng kín: tiêm bản X → model làm theo → tool
   * trượt → đủ tín hiệu bí → cứu hộ tiêm LẠI X (vì X vẫn xếp hạng cao nhất theo `use_count`) →
   * `use_count` lại +1. Xếp hạng thật là `use_count - fail_count` (xem `confidence()`).
   *
   * TĂNG Ở ĐÚNG MỘT CHỖ: `discardExperience()` — tức trợ lý đã ĐỌC gợi ý, LÀM THEO, thấy sai rồi
   * tự gọi tool `discard_experience`. KHÔNG tăng ở cứu hộ: bản đầu làm thế và đã hạ bậc oan
   * 34/55 bản ghi (lượt bí vì hết ngân sách bước, vì model chậm, vì giao diện lọc ba tầng — mà
   * kinh nghiệm lãnh đủ). Đừng dựng lại suy luận đó.
   *
   * NGƯỠNG "hỏng" trong mã là 1, không phải 3 (`BROKEN_MIN` ở guideExperience.js): `fail_count`
   * chỉ tăng trong `discardExperience`, mà chính hàm đó cũng đặt `discarded_at`, nên bản ghi
   * không còn được tiêm lại để hỏng lần hai. Số ≥1 mang đúng một nghĩa dùng được: "đã TỪNG bị
   * trợ lý đánh giá là sai". Và nó chỉ HẠ BẬC xuống cuối bảng xếp hạng, KHÔNG loại khỏi kết quả.
   */
  fail_count  INT NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lần gần nhất được nhắc vào ngữ cảnh (khác `use_count`: nhắc không có nghĩa là gặp lại).
  used_at     TIMESTAMPTZ,

  -- XOÁ MỀM. Trợ lý tự bỏ được kinh nghiệm nó thấy sai, mà nó có thể sai — nên bản ghi ở lại
  -- kèm lý do để người quản trị lật lại được. NULL = còn dùng.
  discarded_at    TIMESTAMPTZ,
  discard_reason  TEXT NOT NULL DEFAULT '',

  -- VECTOR NGỮ NGHĨA của `question` — dò kinh nghiệm khi so token (Jaccard) trượt. Jaccard chạy
  -- TRƯỚC vì tốn 0 ms/0 ₫; chỉ khi nó về tay không mới nhúng câu hỏi và dò tiếp bằng cosine.
  -- 1536 chiều = `text-embedding-3-small` của OpenAI — đổi model khác chiều thì phải đổi cả cột;
  -- mã nguồn (guideEmbedding.js) BỎ QUA vector sai chiều thay vì tính bừa, vì trộn hai không gian
  -- vector cho ra điểm vô nghĩa mà không hề báo lỗi. NULL = chưa nhúng, backend tự bù dần ở nền.
  -- KHÔNG đánh index HNSW/IVFFlat: chấm điểm chạy trong Node trên kho đã nạp sẵn vào RAM (≤300
  -- bản mỗi công ty, cosine trong JS mất chưa tới 1 ms) — index đó chỉ có ích khi tìm trong SQL
  -- trên hàng chục nghìn dòng.
  embedding       vector(1536),
  -- Model đã sinh ra vector này (`STORE_ID` = "<model>|<công thức dựng chuỗi>"). Đổi công thức
  -- cũng phải đổi chuỗi này, nếu không vector cũ bị đem so với vector mới mà không ai hay.
  embedding_model TEXT NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.guide_experiences IS
  'Trợ lý hướng dẫn: đường đi đã thành công cho những câu hỏi tương tự. Không chứa dữ liệu '
  'khách hàng — mọi chuỗi đã qua bộ làm sạch PII ở guideExperience.js.';
COMMENT ON COLUMN public.guide_experiences.fail_count IS
  'Số lần trợ lý đã làm theo bản ghi này rồi tự gọi discard_experience. Xếp hạng = '
  'use_count - fail_count; ≥1 thì hạ xuống cuối bảng, KHÔNG loại. Xem guideExperience.js isBroken().';
COMMENT ON COLUMN public.guide_experiences.embedding IS
  'Vector ngữ nghĩa của `question`. NULL = chưa nhúng; backend tự bù dần ở nền. '
  'Chấm điểm chạy trong Node, không chạy trong SQL — xem guideEmbedding.js.';

-- Truy vấn nóng DUY NHẤT: lấy toàn bộ bản CÒN DÙNG của một công ty rồi chấm điểm trong Node.
-- Không đánh index cho việc tìm kiếm: phép so là Jaccard trên mảng token, Postgres không giúp
-- được gì mà kho mỗi công ty chỉ tối đa 300 bản — nạp hết vào RAM rẻ hơn mọi thứ khác.
CREATE INDEX IF NOT EXISTS idx_guide_exp_company_active
  ON public.guide_experiences (company_id)
  WHERE discarded_at IS NULL;

-- Cho màn hình soi (`GET /api/copilotkit/debug/experience`) và cho việc dọn khi kho chật.
CREATE INDEX IF NOT EXISTS idx_guide_exp_company_created
  ON public.guide_experiences (company_id, created_at DESC);

-- Backend nói chuyện với Supabase bằng service role nên nó đi xuyên RLS. Bật RLS mà KHÔNG tạo
-- policy nào là cách chặn đúng: client cầm anon key sẽ không đọc được gì. Kho này gộp chung theo
-- công ty và được tiêm vào ngữ cảnh của mọi người trong công ty đó, nên không có lý do nào để lộ
-- nó ra ngoài backend.
ALTER TABLE public.guide_experiences ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2. KHO KIẾN THỨC — danh mục màn hình + hướng dẫn thao tác, sửa được qua UI
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- VÌ SAO CHUYỂN TỪ JSON SANG BẢNG: kho từng nằm ở `backend/data/guide-knowledge/*.json`, được
-- COPY vào image lúc build. Ba hệ quả đã gặp thật: (1) sửa một dòng `summary` cũng phải build
-- lại image; (2) người không dùng git không sửa được — tài liệu nghiệp vụ do BA viết nhưng chỉ
-- lập trình viên mới đưa được vào kho; (3) `lead-detail.json` không tái tạo được trên server vì
-- nguồn của nó là một tệp .md nằm ngoài repo — quên commit là mất chunk vĩnh viễn.
--
-- BẢNG NÀY LÀ NGUỒN CHÍNH, TỆP LÀ HẠT GIỐNG VÀ LƯỚI AN TOÀN: bảng trống → backend tự gieo từ
-- tệp lần khởi động đầu; DB không với tới được → đọc tệp như trước, trợ lý vẫn chạy.
--
-- `hand_edited` là trường quan trọng nhất: các generator (`guide:sync`, `guide:lead-detail`) vẫn
-- sinh lại tệp và đồng bộ lên bảng, nhưng KHÔNG ĐƯỢC đè lên hàng có `hand_edited = true` — cùng
-- nguyên tắc mà `generate-registry.js` dùng để giữ `summary`/`keywords` viết tay. Thiếu cờ này
-- thì lần chạy generator kế tiếp xoá sạch công sửa trên UI, âm thầm.
CREATE TABLE IF NOT EXISTS public.guide_knowledge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Khoá nghiệp vụ là CẶP (source, path), KHÔNG phải riêng `path` — xem ràng buộc bên dưới.
  path          TEXT NOT NULL,
  -- Tệp gốc đã sinh ra chunk này ('screens.json', 'lead-detail.json'…). Giữ lại để biết
  -- generator nào sở hữu nó, và để lọc trên màn hình quản lý. 'manual' = tự thêm trên UI.
  source        TEXT NOT NULL DEFAULT 'manual',

  label         TEXT NOT NULL DEFAULT '',
  menu          TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL DEFAULT '',
  -- Phần chuyên sâu: quy tắc, phân biệt mục này với mục kia, điều kiện mục mới hiện.
  content       TEXT NOT NULL DEFAULT '',
  keywords      TEXT[] NOT NULL DEFAULT '{}',
  -- [{ label }] — nhãn nút thật, trả cho model dưới khoá `allowed_actions`.
  actions       JSONB NOT NULL DEFAULT '[]'::jsonb,

  needs_admin   BOOLEAN NOT NULL DEFAULT false,
  redirect      BOOLEAN NOT NULL DEFAULT false,

  -- Người đã sửa qua UI → generator không được đè. Xem ghi chú đầu khối.
  hand_edited   BOOLEAN NOT NULL DEFAULT false,
  -- Xoá MỀM: chunk sai vẫn nằm lại để đối chiếu và khôi phục, chỉ không được tra cứu nữa.
  discarded_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by     TEXT NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.guide_knowledge IS
  'Trợ lý hướng dẫn: danh mục màn hình + hướng dẫn thao tác. Nguồn chính; tệp JSON trong '
  'backend/data/guide-knowledge chỉ còn là hạt giống và bản dự phòng khi DB không với tới.';

CREATE INDEX IF NOT EXISTS idx_guide_kb_active
  ON public.guide_knowledge (source)
  WHERE discarded_at IS NULL;

-- KHOÁ DUY NHẤT LÀ CẶP (source, path), KHÔNG PHẢI RIÊNG `path`. Ép `path` là duy nhất tức là ép
-- mô hình dữ liệu chặt hơn thực tế: `/crm/leads/:id` có mặt ở CẢ HAI tệp và đó là chủ ý —
-- screens.json :: "Chi tiết Lead / Deal" (mục danh mục màn hình), guides.json :: "Các mục trong
-- chi tiết Lead / Deal" (bài hướng dẫn cho chính màn hình đó). Hai chunk khác nhau, cùng mô tả
-- một đường dẫn, và cả hai đều đáng có trong kết quả tra cứu.
ALTER TABLE public.guide_knowledge DROP CONSTRAINT IF EXISTS guide_knowledge_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_kb_source_path
  ON public.guide_knowledge (source, path);

-- SỐ PHIÊN BẢN — để nhiều instance không giữ cache cũ. Backend cache toàn bộ kho trong RAM (kèm
-- bảng IDF, tốn ~35 ms để dựng) nên không thể hỏi DB mỗi lượt. Render chạy 1–3 instance: instance
-- A sửa kiến thức thì instance B phải biết mà nạp lại, nếu không nó dùng bản cũ cho tới lần khởi
-- động sau. Bảng một dòng, rẻ để hỏi, tăng mỗi lần ghi — instance chỉ nạp lại cả kho khi thấy số
-- đổi.
CREATE TABLE IF NOT EXISTS public.guide_knowledge_version (
  id         BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  version    BIGINT NOT NULL DEFAULT 1,
  edited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.guide_knowledge_version (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guide_knowledge_bump() RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.guide_knowledge_version SET version = version + 1, edited_at = now() WHERE id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger STATEMENT-level, không phải row-level: nạp hàng trăm hàng một lượt thì chỉ cần tăng số
-- MỘT lần, không phải một lần cho mỗi hàng.
DROP TRIGGER IF EXISTS trg_guide_knowledge_bump ON public.guide_knowledge;
CREATE TRIGGER trg_guide_knowledge_bump
  AFTER INSERT OR UPDATE OR DELETE ON public.guide_knowledge
  FOR EACH STATEMENT EXECUTE FUNCTION public.guide_knowledge_bump();

-- Backend đi bằng service role nên xuyên RLS; bật mà không tạo policy = client anon không đọc
-- được gì. Kiến thức mô tả cấu trúc nội bộ hệ thống, không có lý do mở ra ngoài backend.
ALTER TABLE public.guide_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_knowledge_version ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3. HẠN MỨC NGÀY — số câu hỏi và/hoặc số token mỗi người mỗi ngày
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- VÌ SAO CẦN: trợ lý dùng chung toàn công ty, gọi model thật, và một lượt hỏi ở chế độ toàn
-- quyền tốn 5–6 lần gọi model. Không có trần thì một người hỏi liên tục cả buổi là đủ làm hoá
-- đơn tháng nhảy vọt, mà không ai biết cho tới lúc nhận bill.
--
-- ĐẾM THEO LƯỢT, KHÔNG ĐẾM THEO REQUEST: một câu hỏi KHÔNG phải một request. 10/13 tool của trợ
-- lý chạy trên trình duyệt và được dựng không có `execute` — model phát lời gọi tool xong thì
-- request ĐÓNG, trình duyệt chạy tool rồi mở một request MỚI để gửi kết quả về. Một câu hỏi đời
-- thường vì thế tốn 5–6 lần `POST /api/copilotkit` — đếm request là tính nhầm gấp sáu. Đơn vị
-- đúng là cặp (thread_id, turn_no).
--
-- LƯU TỪNG LƯỢT, KHÔNG LƯU MỘT Ô ĐẾM: bảng giữ MỘT DÒNG cho mỗi lượt hỏi, khoá chính là
-- (day, user_id, thread_id, turn_no). Nhờ vậy phép "đây là câu mới hay là bước tiếp của câu đang
-- chạy" trở thành một lần tra khoá chính, chính xác tuyệt đối, và sống sót qua khởi động lại lẫn
-- chạy nhiều instance — khác với một ô đếm cộng dồn + Set trong RAM, thứ mất khi container dựng
-- lại và lệch nhau giữa hai instance.
--
-- Số dòng: một người hỏi 30 câu/ngày × 200 người = 6.000 dòng/ngày. Nhỏ. Dọn bằng hàm ở cuối.
CREATE TABLE IF NOT EXISTS public.guide_quota_turn (
  -- NGÀY THEO GIỜ VIỆT NAM, do Node tính rồi truyền xuống (`vnDay()`). KHÔNG dùng current_date
  -- của DB: máy chủ DB có thể chạy UTC, và khi đó mốc sang ngày rơi vào 7 giờ sáng giờ Việt Nam.
  day         date        NOT NULL,
  user_id     uuid        NOT NULL,
  thread_id   text        NOT NULL,
  turn_no     integer     NOT NULL,
  company_id  uuid,
  -- Cộng dồn sau khi lượt chạy xong (xem guide_quota_add_tokens). Lượt đang chạy dở thì bằng 0 —
  -- cố ý: hạn mức token chặn câu TIẾP THEO, không cắt ngang câu đang trả lời.
  token_count integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, user_id, thread_id, turn_no)
);

-- Truy vấn duy nhất chạy nóng: đếm câu + cộng token của MỘT người trong MỘT ngày.
CREATE INDEX IF NOT EXISTS guide_quota_turn_day_user_idx
  ON public.guide_quota_turn (day, user_id) INCLUDE (token_count);

COMMENT ON TABLE public.guide_quota_turn IS
  'Mỗi dòng = một lượt hỏi Trợ lý hướng dẫn. Dùng để áp hạn mức ngày theo số câu và số token.';

-- KIỂM + GHI trong MỘT lượt đi DB. Ba nhánh: (1) dòng đã tồn tại → bước tiếp của câu đang chạy,
-- luôn cho qua, không trừ thêm; (2) vượt hạn mức → từ chối, KHÔNG chèn dòng; (3) còn hạn mức →
-- chèn dòng, cho qua. Hạn mức truyền vào từ tham số chứ không đọc trong DB: nó là núm chỉnh động
-- nằm ở tệp cấu hình của trợ lý (guideSettings.js); 0 = tắt hạn mức đó.
CREATE OR REPLACE FUNCTION public.guide_quota_check(
  p_day            date,
  p_user           uuid,
  p_company        uuid,
  p_thread         text,
  p_turn_no        integer,
  p_max_questions  integer,
  p_max_tokens     bigint
)
RETURNS TABLE (allowed boolean, reason text, question_count bigint, token_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_questions bigint;
  v_tokens    bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.guide_quota_turn
     WHERE day = p_day AND user_id = p_user AND thread_id = p_thread AND turn_no = p_turn_no
  ) THEN
    SELECT count(*), coalesce(sum(g.token_count), 0) INTO v_questions, v_tokens
      FROM public.guide_quota_turn g WHERE g.day = p_day AND g.user_id = p_user;
    RETURN QUERY SELECT true, 'next_step'::text, v_questions, v_tokens;
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(g.token_count), 0) INTO v_questions, v_tokens
    FROM public.guide_quota_turn g WHERE g.day = p_day AND g.user_id = p_user;

  IF p_max_questions > 0 AND v_questions >= p_max_questions THEN
    RETURN QUERY SELECT false, 'question_limit'::text, v_questions, v_tokens;
    RETURN;
  END IF;

  IF p_max_tokens > 0 AND v_tokens >= p_max_tokens THEN
    RETURN QUERY SELECT false, 'token_limit'::text, v_questions, v_tokens;
    RETURN;
  END IF;

  INSERT INTO public.guide_quota_turn (day, user_id, thread_id, turn_no, company_id)
  VALUES (p_day, p_user, p_thread, p_turn_no, p_company)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true, 'new'::text, v_questions + 1, v_tokens;
END;
$$;

-- Cộng token cho một lượt ĐÃ chạy xong. Cộng dồn chứ không gán: một lượt có nhiều bước gọi model,
-- và sổ chi phí chốt theo từng bước.
CREATE OR REPLACE FUNCTION public.guide_quota_add_tokens(
  p_day date, p_user uuid, p_thread text, p_turn_no integer, p_tokens integer
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.guide_quota_turn
     SET token_count = token_count + greatest(p_tokens, 0)
   WHERE day = p_day AND user_id = p_user AND thread_id = p_thread AND turn_no = p_turn_no;
$$;

-- Bảng theo dõi cho admin: ai đã dùng bao nhiêu trong một ngày.
CREATE OR REPLACE FUNCTION public.guide_quota_by_day(p_day date, p_company uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, question_count bigint, token_count bigint, last_at timestamptz)
LANGUAGE sql
AS $$
  SELECT g.user_id, count(*), coalesce(sum(g.token_count), 0), max(g.created_at)
    FROM public.guide_quota_turn g
   WHERE g.day = p_day
     AND (p_company IS NULL OR g.company_id = p_company)
   GROUP BY g.user_id
   ORDER BY 2 DESC;
$$;

-- Dọn dữ liệu cũ. Hạn mức là chuyện của NGÀY HÔM NAY; giữ 90 ngày là đủ để đối chiếu khi có
-- tranh cãi "sao tôi hết lượt sớm thế". Gọi tay hoặc gắn vào cron nếu có.
CREATE OR REPLACE FUNCTION public.guide_quota_prune(p_keep_days integer DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.guide_quota_turn WHERE day < current_date - p_keep_days;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Xem ghi chú RLS ở đầu tệp: bảng này 593 để mở, đây là chỗ đóng lại.
ALTER TABLE public.guide_quota_turn ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4. NHẬT KÝ HỎI ĐÁP — câu hỏi, câu trả lời, và các bước đã thực hiện, cho MỌI lượt
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- KHÁC BA CHỖ LƯU ĐÃ CÓ Ở TRÊN:
--   guide_quota_turn   đếm lượt để áp hạn mức — KHÔNG chứa chữ nào của câu hỏi
--   guide_experiences  chỉ giữ lượt ĐÁNG HỌC (≥2 bước, không lỗi, không giậm chân), và cố ý lược
--                      bỏ kết quả thô để dạy lại đường đi chứ không dạy lại dữ liệu
--   localStorage       nội dung hội thoại, chỉ trong trình duyệt, 8 lượt, 12 giờ
-- Bảng này là thứ còn thiếu: bản ghi ĐẦY ĐỦ của MỌI lượt, kể cả lượt hỏng — để đối chiếu khi
-- người dùng báo "trợ lý trả lời sai", và để nhìn được thật sự nhân viên đang hỏi những gì.
--
-- KHOÁ LÀ (thread_id, turn_no) — cùng đơn vị với hạn mức: một câu hỏi tốn 5–6 request nhưng chỉ
-- là MỘT lượt. Khoá duy nhất trên cặp đó khiến việc gửi lại (người dùng F5 giữa chừng, client
-- thử lại) không đẻ ra bản trùng, và cho phép nối với guide_quota_turn khi cần xem một lượt tốn
-- bao nhiêu token.
--
-- DUNG LƯỢNG: câu trả lời thường 200–2.000 ký tự; `steps` là TÓM TẮT chứ không phải kết quả thô
-- (kết quả thô của một lần đọc màn hình có thể vài nghìn ký tự dữ liệu của HÔM NAY, lưu lại vừa
-- phình vừa vô nghĩa sau một tuần). Ước 200 người × 30 câu × ~3 KB ≈ 18 MB/ngày ở mức dùng kịch
-- trần. Có hàm dọn ở cuối; gọi tay hoặc gắn cron.
CREATE TABLE IF NOT EXISTS public.guide_chat_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ngày theo giờ Việt Nam, do Node tính rồi truyền xuống — cùng lý do với guide_quota_turn.
  day             date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  user_id         uuid        NOT NULL,
  company_id      uuid,

  thread_id       text        NOT NULL,
  turn_no         integer     NOT NULL,

  path            text,                     -- màn hình người dùng đang xem lúc hỏi
  question        text        NOT NULL,
  answer          text,
  -- [{ tool, summary, status }] — `status` giữ lại để lọc ra lượt hỏng mà không phải đọc từng
  -- câu trả lời. Client gửi lên, server chỉ giữ đúng ba trường đó (xem `normalizeSteps`).
  steps           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  step_count      integer     NOT NULL DEFAULT 0,
  has_failed_step boolean     NOT NULL DEFAULT false,

  provider        text,
  model           text,

  UNIQUE (thread_id, turn_no)
);

-- Hai lối tra thường dùng: theo người trong một ngày, và theo thời gian gần nhất.
CREATE INDEX IF NOT EXISTS guide_chat_log_day_user_idx   ON public.guide_chat_log (day DESC, user_id);
CREATE INDEX IF NOT EXISTS guide_chat_log_created_at_idx ON public.guide_chat_log (created_at DESC);
-- Tìm toàn văn tiếng Việt không dấu thì phức tạp; trước mắt để tra bằng ILIKE trên câu hỏi.
CREATE INDEX IF NOT EXISTS guide_chat_log_question_trgm_idx
  ON public.guide_chat_log USING gin (question gin_trgm_ops);

COMMENT ON TABLE public.guide_chat_log IS
  'Nhật ký đầy đủ mọi lượt hỏi Trợ lý hướng dẫn: câu hỏi, câu trả lời, các bước. Khác '
  'guide_experiences (chỉ lượt đáng học) và guide_quota_turn (chỉ đếm, không có nội dung).';

-- Dọn theo số ngày muốn giữ. Nhật ký hỏi đáp là dữ liệu vận hành, không phải sổ kế toán — giữ
-- 180 ngày là quá đủ để đối chiếu một khiếu nại.
CREATE OR REPLACE FUNCTION public.guide_chat_log_prune(p_keep_days integer DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.guide_chat_log WHERE day < current_date - p_keep_days;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Bảng này chứa nguyên văn câu hỏi của nhân viên — lý do bật RLS mạnh hơn cả ba bảng trên.
ALTER TABLE public.guide_chat_log ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- KIỂM TRA SAU KHI CHẠY
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   SELECT company_id,
--          count(*) FILTER (WHERE discarded_at IS NULL)  AS con_dung,
--          count(*) FILTER (WHERE fail_count >= 1)       AS da_ha_bac,
--          count(*) FILTER (WHERE embedding IS NOT NULL) AS da_nhung
--   FROM public.guide_experiences GROUP BY company_id;
--
--   SELECT source,
--          count(*) FILTER (WHERE discarded_at IS NULL) AS dang_dung,
--          count(*) FILTER (WHERE hand_edited)          AS da_sua_tay
--   FROM public.guide_knowledge GROUP BY source ORDER BY source;
--
--   SELECT to_regclass('public.guide_quota_turn'), to_regclass('public.guide_chat_log');
--   SELECT proname FROM pg_proc WHERE proname LIKE 'guide_%' ORDER BY 1;
--
-- Bốn hàm hạn mức/nhật ký phải có đủ: guide_chat_log_prune, guide_knowledge_bump,
-- guide_quota_add_tokens, guide_quota_by_day, guide_quota_check, guide_quota_prune.
