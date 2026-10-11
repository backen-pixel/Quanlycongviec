-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 603 — VECTOR CHO KHO KIẾN THỨC CỦA TRỢ LÝ HƯỚNG DẪN
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Chạy tay qua Supabase Dashboard → SQL Editor (repo này không có migration runner).
-- Chạy lại nhiều lần không sao: mọi lệnh đều IF NOT EXISTS.
--
-- ═══════════════ VIỆC NÀY LÀM GÌ ═══════════════
--
-- Trước 603, tầng ngữ nghĩa của kho kiến thức đọc vector từ HAI tệp:
--   backend/data/guide-knowledge/knowledge-vectors.json          (nhúng lúc dựng image)
--   backend/uploads/guide-memory/knowledge-vectors-runtime.json  (lớp phủ lúc chạy)
--
-- Cách đó có ba chỗ lệch không vá được bằng mã:
--   1. Tệp nhúng sẵn nằm trong image → mục thêm qua giao diện không bao giờ có mặt trong đó.
--   2. Lớp phủ nằm trong volume của MỘT container → chạy nhiều bản thì mỗi bản thấy một tập
--      vector khác nhau, trong khi kiến thức thì đồng bộ qua DB. Hai nguồn lệch pha nhau.
--   3. `npm run guide:embed` đọc tệp JSON, tức nó nhúng bản GIEO HẠT chứ không nhúng bản đang
--      thật sự phục vụ (bản trong DB, đã qua sửa tay).
--
-- Đưa vector về đúng chỗ kiến thức đang sống — cùng một hàng, cùng một nguồn sự thật — thì cả ba
-- biến mất. Sửa `summary` và nhúng lại trở thành một việc, không phải hai việc ở hai nơi.
--
-- ═══════════════ VÌ SAO CÓ `embedding_hash` ═══════════════
--
-- Không phải để chống va chạm. Nó trả lời đúng một câu: "vector này còn tả đúng nội dung đang có
-- trên hàng này không?". Nội dung sửa được bất cứ lúc nào (giao diện Kiến thức, bảng quét trang),
-- mà nhúng lại thì tốn một vòng gọi mạng nên phải chạy nền, không thể đồng bộ trong cùng giao
-- dịch. Giữa hai thời điểm đó, hàng mang một vector CŨ — và một vector tả nội dung cũ còn tệ hơn
-- không có vector: nó vẫn ăn điểm, vẫn xếp hạng, chỉ là xếp theo một bản ghi không còn tồn tại.
--
-- Có băm thì tầng ngữ nghĩa bỏ qua hàng lệch (hàng đó lùi về thuần từ khoá), và vòng lặp nền biết
-- chính xác phải nhúng lại hàng nào. Hỏng về phía an toàn, và tự lành.
--
-- ═══════════════ VÌ SAO KHÔNG TẠO INDEX ANN ═══════════════
--
-- ivfflat/hnsw giải bài toán "quét tuyến tính quá chậm". Kho này có ~330 hàng, và đo thật thì
-- cosine trên toàn bộ tốn ~1,8 ms — nút cổ chai nằm ở lời gọi nhúng câu hỏi (~230 ms), không nằm
-- ở phép so. Thêm index lúc này chỉ thêm một thứ phải bảo trì và phải chỉnh tham số.
--
-- Ngưỡng nên xem lại: khoảng vài nghìn hàng. Lúc đó thêm:
--   CREATE INDEX idx_guide_kb_embedding ON public.guide_knowledge
--     USING hnsw (embedding vector_cosine_ops);
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- pgvector đã được 602 bật; khai lại để tệp này chạy được độc lập trên CSDL trống.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.guide_knowledge
  -- 1536 chiều = `text-embedding-3-small`. Đổi sang model khác chiều thì PHẢI đổi cả cột này,
  -- không có cách nào chuyển đổi vector giữa hai model.
  ADD COLUMN IF NOT EXISTS embedding       vector(1536),
  -- Ghi lại model + "công thức" chuỗi đem nhúng (STORE_ID phía Node). Đổi một trong hai là mọi
  -- vector cũ thành lạc lõng dù con số vẫn hợp lệ — cột này là thứ duy nhất phát hiện được.
  ADD COLUMN IF NOT EXISTS embedding_model TEXT NOT NULL DEFAULT '',
  -- Băm của ĐÚNG chuỗi đã đem nhúng. Lệch = nội dung đã sửa sau lần nhúng gần nhất.
  ADD COLUMN IF NOT EXISTS embedding_hash  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS embedded_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.guide_knowledge.embedding IS
  'Vector ngữ nghĩa của chunk (text-embedding-3-small, 1536 chiều). NULL = chưa nhúng, vòng lặp nền sẽ bù.';
COMMENT ON COLUMN public.guide_knowledge.embedding_hash IS
  'Băm chuỗi đã đem nhúng. Khác băm của nội dung hiện tại = vector lỗi thời, tầng ngữ nghĩa bỏ qua hàng này.';

-- Vòng lặp nền hỏi đúng một câu mỗi nhịp: "còn hàng nào chưa nhúng không?". Index một phần chỉ
-- phủ đúng những hàng đó nên nó rất nhỏ, và co lại dần khi kho được nhúng xong.
CREATE INDEX IF NOT EXISTS idx_guide_kb_need_embed
  ON public.guide_knowledge (path)
  WHERE embedding IS NULL AND discarded_at IS NULL;

-- ═══════════════ KIỂM SAU KHI CHẠY ═══════════════
--
--   SELECT count(*) AS tong,
--          count(embedding) AS da_nhung,
--          count(*) FILTER (WHERE embedding IS NULL AND discarded_at IS NULL) AS con_thieu
--   FROM public.guide_knowledge;
--
-- Ngay sau migration: `da_nhung` = 0, `con_thieu` = toàn bộ. Đó là ĐÚNG — vòng lặp nền trong
-- `helpers/guideKnowledge.js` sẽ bù dần theo lô, và trong lúc chờ thì trợ lý tra bằng từ khoá y
-- như trước. Không có bước nhúng tay nào bắt buộc.
