# BepPro — một image, chạy cạnh bộ Supabase self-host đang có trên Docker Desktop.
#
# Backend serve luôn frontend đã build (xem server.js: production thì phục vụ frontend/dist),
# nên chỉ cần MỘT container cho cả web lẫn API.

# ─────────────────────────── Tầng 1: build frontend ───────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Cài dependency trước, tách khỏi mã nguồn để Docker dùng lại lớp cache khi chỉ sửa code.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --prefer-offline --no-audit

# `npm run build` của frontend gọi scripts/knowledge/sync-screenshots-deploy.js,
# script đó đọc <gốc repo>/uploads/knowledge-screenshots → phải copy trước khi build.
COPY scripts ./scripts
COPY uploads/knowledge-screenshots ./uploads/knowledge-screenshots
COPY frontend ./frontend
# Kho kiến thức của trợ lý — `guide:sync` ĐỌC bản cũ để giữ lại tóm tắt/từ khoá viết tay, rồi
# GHI ĐÈ bản mới. Thiếu thư mục này là nó sinh ra 199 màn hình trống mô tả, và cổng chặn ngay
# dưới sẽ dừng build.
COPY backend/data ./backend/data

# Vite build ngốn bộ nhớ — giữ đúng mức mà render.yaml đang dùng.
ENV NODE_OPTIONS=--max-old-space-size=4096

# CHẾ ĐỘ TOÀN QUYỀN của trợ lý — mặc định BẬT cho bản chạy Docker nội bộ.
#
# Bật ở đây chứ KHÔNG bật trong frontend/.env.production: file đó dùng chung với bản build trên
# Render, tức bản khách hàng thật đang dùng. Trợ lý ở chế độ này tự bấm nút và tự điền trường
# thay người dùng, kể cả nút Xoá — thứ đó chỉ nên có trên máy của chủ hệ thống.
#
# Tắt khi cần:  GUIDE_FULL_ACCESS=0 docker compose up -d --build
# (Vite đọc mọi biến môi trường có tiền tố VITE_ lúc build — xem src/features/guide/lib/guideAccess.js)
ARG VITE_GUIDE_FULL_ACCESS=1
ENV VITE_GUIDE_FULL_ACCESS=$VITE_GUIDE_FULL_ACCESS

# ĐỒNG BỘ DANH MỤC MÀN HÌNH RỒI MỚI BUILD — không có bước này thì thêm một route mới là kho
# kiến thức lệch âm thầm: trợ lý trả lời "đường dẫn đó không tồn tại" cho một trang có thật.
#
# Đã xảy ra: thêm `/settings/tro-ly-huong-dan` xong, trợ lý khẳng định nó không tồn tại — và nó
# nói đúng theo kho, vì kho chưa được sinh lại. Render chạy `npm run build:frontend` (đã có hai
# bước này); nhánh Docker gọi thẳng `npm run build` của frontend nên trước đây bỏ qua cả hai.
RUN node scripts/guide/generate-registry.js && node scripts/guide/check-drift.js

RUN cd frontend && npm run build

# ─────────────────────────── Tầng 2: chạy thật ───────────────────────────
FROM node:24-bookworm-slim AS runtime

# ca-certificates: `npm start` chạy node --use-system-ca, thiếu CA là MỌI lệnh HTTPS hỏng
#                  (Anthropic, Google, web-push…).
# socat          : chuyển tiếp cổng nội bộ — xem ghi chú ở docker-entrypoint.sh.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates socat \
 && rm -rf /var/lib/apt/lists/*

# WORKDIR BẮT BUỘC là thư mục backend: một số chỗ ghi file bằng đường dẫn TƯƠNG ĐỐI
# (multer `destination: 'uploads/lead-chat/'` trong crm/shared/helpersBundle.js).
# Đặt sai thư mục là file đính kèm rơi ra ngoài volume rồi mất khi dựng lại container.
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
# `npm ci` phải chạy TRONG image Linux: ffmpeg-static tải binary theo nền tảng, copy
# node_modules từ Windows sang là được file .exe không chạy nổi.
RUN npm ci --omit=dev --prefer-offline --no-audit

COPY backend ./
# Kho kiến thức lấy bản VỪA SINH LẠI ở tầng build, không lấy bản trên máy dev.
# `COPY backend ./` ngay trên chép từ ngữ cảnh build (tức đĩa của bạn), nên nếu dừng ở đó thì
# `screens.json` trong image vẫn là bản cũ và cả bước generate ở tầng kia thành công cốc.
COPY --from=build /app/backend/data/guide-knowledge ./data/guide-knowledge
COPY scripts /app/scripts
COPY --from=build /app/frontend/dist /app/frontend/dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# `sed` BỎ CR trước khi chmod — không phải dọn dẹp cho đẹp, mà là chặn một lỗi đã xảy ra thật.
# Máy Windows để `core.autocrlf=true`, và tệp này KHÔNG nằm trong git (nó là tệp cục bộ), nên chỉ
# cần một lần mở-lưu bằng trình soạn thảo Windows là dòng đầu thành `#!/bin/sh\r`. Kernel đi tìm
# trình thông dịch tên "/bin/sh\r", không có, và báo đúng một câu vô nghĩa:
#     exec /usr/local/bin/docker-entrypoint.sh: no such file or directory
# — nghe như thiếu tệp trong khi tệp nằm ngay đó. Image build thành công, container crash loop.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

# server.js có sẵn /api/health (render.yaml đang dùng làm healthCheckPath).
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
