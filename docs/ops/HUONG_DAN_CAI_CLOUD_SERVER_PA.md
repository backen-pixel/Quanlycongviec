# Hướng dẫn thuê và cài QLCV trên Cloud Server P.A Việt Nam

App hiện chạy trên **Render (Linux + Node.js)**. Cloud Server P.A cũng là Linux: **cùng code**, nhưng phải tự cài Node, Nginx, PM2, SSL.

**Không thuê:** Hosting NodeJS (cPanel/DirectAdmin). Đó là hosting chia sẻ, chat realtime dễ hỏng.

**Nên thuê:** [Cloud Server](https://www.pavietnam.vn/vn/server/cloud-server) — VPS, root SSH.

---

## 1. Gói nên chọn

| Gói | Cấu hình | Khi nào |
|---|---|---|
| Cloud Server #3 | 6 CPU, 6+1 GB RAM, 80 GB | Đủ dùng |
| **Cloud Server #5** | 9 CPU, 10+1 GB RAM, 200 GB SSD | Dư tài nguyên, ít phải nâng cấp |

Khi đăng ký:

- Ổ: **SSD**, không SAS
- OS: **Ubuntu 22.04 hoặc 24.04** — không Windows, không mẫu n8n
- Chu kỳ: **12 tháng** (để tặng RAM). Không khóa 4 năm nếu chưa chắc
- Không mua: cPanel, ElasticCached, Server Manager Cao cấp
- Database vẫn để **Supabase**, không cài MySQL trên VPS

---

## 2. Hỏi nhân viên tư vấn (copy gửi)

> Chào anh/chị, em muốn thuê **Cloud Server #5** để chạy phần mềm quản lý công việc (web Node.js). Nhờ xác nhận giúp:
>
> 1. Đây là **máy chủ ảo riêng (VPS)**, em **SSH được**, có **quyền root**, tự cài phần mềm?
> 2. Chọn hệ điều hành **Ubuntu** được không? **Không** cần cài sẵn n8n hay Docker.
> 3. Em tự cài Node.js, Nginx, Redis trên máy, chạy **cả ngày không bị tắt** chứ ạ?
> 4. App có **chat realtime** (WebSocket). Máy có chặn không?
> 5. Đăng ký **12 tháng** (không khóa 4 năm): còn giá khuyến mãi và còn **tặng 1GB RAM** không?
> 6. Ổ cứng chọn **SSD 200GB**. Tự cài SSL miễn phí được không? Máy kết nối ra internet (Supabase) có bị chặn không?
>
> Cảm ơn anh/chị.

Chỉ thuê khi họ xác nhận đủ 6 ý.

---

## 3. Chuẩn bị trước khi SSH

- Domain: bản ghi **A** trỏ về IP VPS (và `www` nếu dùng)
- Copy toàn bộ biến môi trường từ **Render → Environment**
- Máy local có Git, quyền clone repo

Thay trong toàn bộ hướng dẫn:

| Placeholder | Ý nghĩa |
|---|---|
| `your-domain.com` | Domain production |
| `<URL_REPO>` | URL Git của dự án |
| `<IP_VPS>` | IP Cloud Server |

---

## 4. Cài phần mềm trên Ubuntu

SSH vào máy rồi chạy:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx redis-server certbot python3-certbot-nginx ufw curl build-essential

# Node 20 (app yêu cầu Node >= 18)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2

# Firewall: chỉ web + SSH — không mở port 4000 ra ngoài
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

sudo systemctl enable --now redis-server
node -v
nginx -v
redis-cli ping
```

`redis-cli ping` phải ra `PONG`.

---

## 5. Lấy code và build

```bash
sudo mkdir -p /var/www/qlcv
sudo chown "$USER:$USER" /var/www/qlcv
cd /var/www/qlcv
git clone <URL_REPO> .
cd backend
npm ci
npm run build:frontend
```

`build:frontend` build React vào `frontend/dist`. Backend vừa phục vụ **API** vừa phục vụ **giao diện** — chỉ cần **1 domain**, không cần 2 service như Render.

---

## 6. File môi trường

Tạo `/var/www/qlcv/backend/.env`. Copy từ Render, **sửa các dòng domain**:

```env
NODE_ENV=production
PORT=4000
TRUST_PROXY_HOPS=1
NODE_OPTIONS=--max-old-space-size=4096

FRONTEND_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

REDIS_URL=redis://127.0.0.1:6379
REDIS_DISABLED=0
```

Giữ nguyên (copy từ Render, không tự bịa):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_DB_DIRECT_URL`
- `JWT_SECRET`
- `FCM_SA_JSON` và các key push/bot/Drive nếu đang dùng

Quyền file:

```bash
chmod 600 /var/www/qlcv/backend/.env
```

---

## 7. Nginx (API + web + WebSocket)

```bash
sudo nano /etc/nginx/sites-available/qlcv
```

Dán (đổi `your-domain.com`):

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

`Upgrade` / `Connection "upgrade"` để **Socket.IO** (chat, realtime) chạy được.

Bật site:

```bash
sudo ln -s /etc/nginx/sites-available/qlcv /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. SSL (Let’s Encrypt)

DNS đã trỏ xong rồi mới chạy:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot tự gia hạn. Kiểm tra: `sudo certbot renew --dry-run`.

---

## 9. Chạy app bằng PM2

Giống lệnh Render `npm start` (`node --use-system-ca src/server.js`):

```bash
cd /var/www/qlcv/backend
pm2 start npm --name qlcv -- start
pm2 save
pm2 startup
```

Lệnh `pm2 startup` in ra **một dòng `sudo ...`** — copy chạy đúng dòng đó.

Kiểm tra:

```bash
curl -I https://your-domain.com/api/health
pm2 status
pm2 logs qlcv
```

`/api/health` trả **200** là ổn.

---

## 10. Cập nhật code sau này

```bash
cd /var/www/qlcv
git pull
cd backend
npm ci
npm run build:frontend
pm2 restart qlcv
```

---

## 11. Checklist sau khi lên

- [ ] `https://your-domain.com` mở được giao diện
- [ ] Đăng nhập được
- [ ] Chat / thông báo realtime không mất kết nối
- [ ] Upload file được
- [ ] App mobile (nếu có) đổi API URL sang domain mới
- [ ] Render chỉ tắt sau khi chạy ổn định vài ngày

---

## 12. Khác Render ở chỗ nào

| | Render | Cloud Server P.A |
|---|---|---|
| OS | Linux (họ giữ) | Ubuntu (bạn giữ) |
| Deploy | Git → web | `git pull` + `pm2 restart` |
| HTTPS | Có sẵn | Let’s Encrypt |
| Crash | Họ restart | PM2 restart |
| File upload trên disk | Dễ mất khi redeploy | Giữ trên VPS |
| Scale nhiều instance | Có (cần Redis) | 1 máy là đủ |

Gọi video (WebRTC) nếu dùng Coturn: xem thêm `docs/COTURN_SETUP.md`.
