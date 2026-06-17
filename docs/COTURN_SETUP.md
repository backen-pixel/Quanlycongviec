# Cài đặt Coturn (TURN/STUN) trên Ubuntu

TURN server relay media khi WebRTC P2P thất bại (NAT đối xứng / firewall doanh nghiệp). Hệ thống dùng **ephemeral credentials** (HMAC) — NodeJS và Coturn chia sẻ một `static-auth-secret`, server cấp username/credential ngắn hạn cho client qua `GET /api/turn/credentials`.

> Thay `your-domain.com` bằng domain thật, và `YOUR_PUBLIC_IP` bằng IP public của VPS.

## 1. Cài đặt

```bash
sudo apt update
sudo apt install -y coturn
# Bật service
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

## 2. Sinh secret dùng chung với NodeJS

```bash
openssl rand -hex 32
# => copy chuỗi này vào:
#   - /etc/turnserver.conf  (static-auth-secret=...)
#   - backend .env          (TURN_STATIC_SECRET=...)
```

## 3. `/etc/turnserver.conf`

```ini
# ── Network ──
listening-port=3478
tls-listening-port=5349
# IP public của server (bắt buộc nếu sau NAT/cloud)
external-ip=YOUR_PUBLIC_IP
# (tùy chọn) chỉ định IP nội bộ để bind
# listening-ip=0.0.0.0

# ── Relay ports (mở trên firewall + security group) ──
min-port=49152
max-port=65535

# ── Authentication: ephemeral (HMAC) dùng chung secret với NodeJS ──
use-auth-secret
static-auth-secret=PASTE_SECRET_TU_BUOC_2
realm=your-domain.com

# ── TLS (cho turns:5349) ──
cert=/etc/letsencrypt/live/your-domain.com/fullchain.pem
pkey=/etc/letsencrypt/live/your-domain.com/privkey.pem
# Bảo mật: tắt giao thức yếu
no-tlsv1
no-tlsv1_1
cipher-list="ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM"

# ── Relay / hiệu năng ──
fingerprint
no-multicast-peers
stale-nonce=600
# Chặn relay tới mạng nội bộ (an toàn SSRF)
no-loopback-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

# ── Logging ──
log-file=/var/log/turnserver/turn.log
simple-log
# verbose   # bật khi debug
```

## 4. Chứng chỉ TLS (Let's Encrypt)

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d your-domain.com
# Cho coturn đọc được cert
sudo usermod -aG ssl-cert turnserver 2>/dev/null || true
sudo chgrp ssl-cert /etc/letsencrypt/live /etc/letsencrypt/archive -R
sudo chmod g+rx /etc/letsencrypt/live /etc/letsencrypt/archive -R
```

## 5. Mở port (UFW + cloud security group)

```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
sudo ufw allow 49152:65535/udp
```
> Trên AWS/GCP/Azure phải mở **đồng thời** ở Security Group/Firewall của cloud (UDP 3478, 5349, 49152-65535; TCP 3478, 5349).

## 6. Khởi động

```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo systemctl status coturn
sudo tail -f /var/log/turnserver/turn.log
```

## 7. Kiểm thử

```bash
# Test bằng turnutils (gói coturn)
turnutils_uclient -v -t -u test -w test your-domain.com    # (chỉ check kết nối)
```
Test thực tế tốt nhất qua trang **https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/**:
1. Xóa STUN mặc định.
2. Thêm `turn:your-domain.com:3478` với username/credential lấy từ `GET /api/turn/credentials`.
3. Bấm *Gather candidates* — phải thấy candidate loại **relay** (`typ relay`). Nếu có → TURN hoạt động.

## 8. Biến môi trường NodeJS (backend `.env`)

```env
TURN_STATIC_SECRET=PASTE_SECRET_TU_BUOC_2
TURN_REALM=your-domain.com
TURN_URLS=turn:your-domain.com:3478?transport=udp,turn:your-domain.com:3478?transport=tcp,turns:your-domain.com:5349
TURN_TTL_SECONDS=86400
STUN_URLS=stun:stun.l.google.com:19302
```

Server sinh credential ephemeral:
```
username = floor(now/1000 + TTL) + ":" + userId
credential = base64( HMAC_SHA1( TURN_STATIC_SECRET, username ) )
```
Client gọi `GET /api/turn/credentials` để lấy `iceServers` rồi truyền vào `RTCPeerConnection`.
