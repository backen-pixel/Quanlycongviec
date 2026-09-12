#!/bin/sh
# Cầu nối cổng — LÝ DO TỒN TẠI, đọc kỹ trước khi bỏ:
#
# `backend/.env` đang trỏ Supabase vào localhost:
#     SUPABASE_URL=http://localhost:8000        (envoy)
#     SUPABASE_DB_URL=…@localhost:6543          (pooler)
#     SUPABASE_DB_DIRECT_URL=…@localhost:5432
#
# Trong container, `localhost` là CHÍNH container đó, không phải máy thật → mọi kết nối hỏng.
# Cách hiển nhiên là sửa .env thành tên service (`supabase-envoy`, `supabase-db`). NHƯNG:
# app lưu URL file TUYỆT ĐỐI vào database qua `getPublicUrl()` (9 file dùng, xem
# helpers/storageUpload.js…). Đổi SUPABASE_URL thành `supabase-envoy` thì mọi ảnh/tệp mới sinh
# ra URL `http://supabase-envoy:8000/...` — TRÌNH DUYỆT không phân giải nổi tên đó, ảnh hỏng hết.
#
# Đã thử `host.docker.internal`: từ máy thật nó trỏ ra IP LAN (192.168.1.23) và cổng 8000 không
# kết nối được, nên cũng không dùng chung một tên cho cả hai phía được.
#
# Nên: dựng đúng `localhost:<cổng>` NGAY TRONG container, chuyển tiếp sang service Supabase.
# Kết quả: .env giữ NGUYÊN không sửa một dòng, URL sinh ra vẫn là `http://localhost:8000/...`
# — thứ mà trình duyệt trên máy thật mở được.
set -e

cau_noi() {
  ten="$1"; cong_local="$2"; dich="$3"
  socat "TCP-LISTEN:${cong_local},fork,reuseaddr,bind=127.0.0.1" "TCP:${dich}" &
  echo "[cau-noi] localhost:${cong_local} -> ${dich}  (${ten})"
}

cau_noi "Supabase API (envoy)" 8000 "${SUPABASE_ENVOY_HOST:-supabase-envoy}:8000"
cau_noi "Postgres qua pooler"  6543 "${SUPABASE_POOLER_HOST:-supabase-pooler}:6543"
cau_noi "Postgres trực tiếp"   5432 "${SUPABASE_DB_HOST:-supabase-db}:5432"

# ── Chờ SUPABASE thật sự trả lời, không phải chỉ chờ socat ────────────────────────────────
#
# Ca cần lo: bật máy → Docker Desktop khởi động MỌI container gần như cùng lúc. Container này
# KHÔNG `depends_on` được Supabase vì Supabase là compose project khác. Chạy trước lúc Postgres
# sẵn sàng thì app gọi Supabase hỏng ngay từ boot.
#
# Bản trước kiểm bằng `socat -u OPEN:/dev/null TCP:127.0.0.1:8000` — VÔ DỤNG: socat nghe sẵn nên
# lệnh đó luôn trả 0 kể cả khi Supabase chết. Đã đo: cổng không ai nghe → 1, cổng có socat mà
# upstream chết → vẫn 0. Nên phải gửi HTTP thật và xem có phản hồi không.
#
# Bất kỳ mã HTTP nào cũng tính là sống (401 nghĩa là envoy + PostgREST đã trả lời, chỉ thiếu khoá).
CHO_TOI_DA=${SUPABASE_WAIT_SEC:-120}
i=0
while [ "$i" -lt "$CHO_TOI_DA" ]; do
  if node -e "fetch('http://127.0.0.1:8000/rest/v1/').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[cho] Supabase đã trả lời sau ${i}s"
    break
  fi
  i=$((i + 2))
  [ $((i % 20)) -eq 0 ] && echo "[cho] Supabase chưa trả lời… ${i}s/${CHO_TOI_DA}s"
  sleep 2
done

if [ "$i" -ge "$CHO_TOI_DA" ]; then
  # Vẫn chạy app: nó có vòng probe lại mỗi 15s và Docker sẽ restart nếu chết hẳn.
  # Nhưng phải NÓI RA, đừng im lặng để rồi tưởng lỗi ở chỗ khác.
  echo "[cho] CẢNH BÁO: quá ${CHO_TOI_DA}s Supabase vẫn chưa trả lời. Vẫn khởi động app."
  echo "[cho] Kiểm tra: docker ps | grep supabase   (cần supabase-db, -rest, -envoy, -storage)"
fi

exec "$@"
