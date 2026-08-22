# Hệ thống Voice/Video Call (Messenger-like)

Tài liệu kiến trúc cho hệ thống gọi thoại/video realtime giữa **Android (sx-mobile)** và **Web (frontend)** qua **WebRTC P2P**, dùng **Socket.IO** làm signaling, **FCM** để đánh thức cuộc gọi đến khi app tắt/khóa máy, và **Coturn (TURN/STUN)** để relay media khi P2P thất bại.

> Giai đoạn 1: **Voice call**. Giai đoạn 2: thêm **Video + chuyển camera trước/sau**. Tài liệu này mô tả cả hai để thiết kế không phải đập đi làm lại.

---

## 1. Sơ đồ kiến trúc tổng thể

```
            ┌───────────────────────────┐         ┌───────────────────────────┐
            │      App A (Caller)        │         │      App B (Callee)        │
            │  React Native / Web        │         │  React Native / Web        │
            │ ┌───────────────────────┐  │         │ ┌───────────────────────┐  │
            │ │ Call UI (CallScreen)  │  │         │ │ IncomingCall + Call   │  │
            │ ├───────────────────────┤  │         │ ├───────────────────────┤  │
            │ │ CallController (state)│  │         │ │ CallController (state)│  │
            │ ├───────────────────────┤  │         │ ├───────────────────────┤  │
            │ │ WebRTCService         │  │         │ │ WebRTCService         │  │
            │ │ SignalingClient (sock)│  │         │ │ SignalingClient (sock)│  │
            │ └───────────────────────┘  │         │ └───────────────────────┘  │
            └─────────────┬─────────────┘         └─────────────┬─────────────┘
                          │  Socket.IO (signaling)              │
                          │  call-user / incoming-call /        │
                          │  answer-call / ice-candidate /      │
                          │  end-call / reject-call / busy      │
                          ▼                                     ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │                  NodeJS Signaling Server (Express)                │
            │  ┌───────────────┐   ┌───────────────┐   ┌────────────────────┐  │
            │  │ Socket.IO     │   │ Call Registry │   │ TURN credentials   │  │
            │  │ (auth=JWT)    │   │ (in-mem/Redis)│   │ (HMAC ephemeral)   │  │
            │  └───────┬───────┘   └───────────────┘   └────────────────────┘  │
            │          │ Redis adapter (scale nhiều instance)                   │
            │          ▼                                                        │
            │  ┌───────────────┐        ┌─────────────────────────────────┐    │
            │  │ Redis Pub/Sub │        │ FCM Push (đánh thức callee)      │    │
            │  └───────────────┘        └─────────────────────────────────┘    │
            └─────────────────────────────────────────────────────────────────┘
                          │ media (SRTP)                         │ media (SRTP)
                          ▼                                     ▼
        ── P2P trực tiếp nếu được (host/srflx qua STUN) ───────────────
                          │  Nếu NAT/firewall chặn → fallback        │
                          ▼                                          ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │                Coturn TURN/STUN Server (relay media)              │
            │   stun:stun.l.google.com:19302  (STUN công cộng, dự phòng)        │
            │   turn:your-domain.com:3478  (UDP/TCP)                            │
            │   turns:your-domain.com:5349 (TLS)                                │
            │   relay ports: 49152-65535/UDP                                    │
            └─────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc media:** WebRTC luôn thử kết nối trực tiếp P2P trước (ICE: host → srflx qua STUN). Nếu cả hai ở sau NAT đối xứng/firewall nghiêm ngặt thì ICE tự dùng **relay candidate** từ TURN. Signaling **không bao giờ** đi qua media path — chỉ trao đổi SDP/ICE.

---

## 2. Công nghệ

| Layer | Công nghệ |
|------|-----------|
| Mobile | React Native (Android), `react-native-webrtc`, `socket.io-client`, FCM (native incoming) |
| Web | React, WebRTC API trình duyệt, `socket.io-client` |
| Signaling | NodeJS + Express + Socket.IO |
| Scale | Redis (`@socket.io/redis-adapter`) — tùy chọn, bật khi chạy nhiều instance |
| ICE | STUN `stun:stun.l.google.com:19302`, TURN `turn(s):your-domain.com:3478/5349` (Coturn) |
| Push | FCM (đánh thức cuộc gọi đến khi socket offline) |

---

## 3. Hợp đồng sự kiện Socket (Signaling Contract)

Tất cả payload kèm `callId` (string, do caller sinh). Server xác thực `userId` qua JWT từ handshake; client **không** tự khai `fromUserId` (server gắn).

### Client → Server

| Event | Payload | Ý nghĩa |
|-------|---------|---------|
| `call-user` | `{ callId, toUserId, media: 'audio'\|'video' }` | A bắt đầu gọi B |
| `answer-call` | `{ callId, toUserId }` | B chấp nhận → server báo caller |
| `reject-call` | `{ callId, toUserId, reason }` | B từ chối |
| `end-call` | `{ callId, toUserId }` | Một bên cúp máy |
| `ice-candidate` | `{ callId, toUserId, candidate }` | Trao đổi ICE candidate |
| `sdp` | `{ callId, toUserId, description }` | Trao đổi SDP offer/answer |

### Server → Client

| Event | Payload | Ý nghĩa |
|-------|---------|---------|
| `incoming-call` | `{ callId, fromUserId, fromName, fromAvatar, media }` | B nhận cuộc gọi đến |
| `call-answered` | `{ callId, byUserId }` | Caller biết callee đã nghe → tạo offer |
| `call-rejected` | `{ callId, reason }` | Caller biết bị từ chối |
| `call-ended` | `{ callId }` | Bên kia đã cúp |
| `ice-candidate` | `{ callId, fromUserId, candidate }` | Relay ICE |
| `sdp` | `{ callId, fromUserId, description }` | Relay SDP |
| `busy` | `{ callId }` | Callee đang bận cuộc khác → caller dừng |
| `call-unavailable` | `{ callId, reason: 'offline'\|'timeout' }` | Callee offline/không bắt máy |

> Server relay theo room `user:<id>` (đã join khi handshake), nên **bền vững khi client reconnect** (room theo userId, không theo socketId).

---

## 4. State machine cuộc gọi

```
        startCall                 call-answered / answer-call
 IDLE ───────────► OUTGOING(RINGING) ───────────────► CONNECTING
   ▲   incoming-call│                                     │ onTrack / iceConnected
   │                ▼                                     ▼
   │           INCOMING(RINGING) ── answer ──► CONNECTING ──► CONNECTED
   │                │                                          │
   │      reject/   │ timeout(30s)                  end-call /  │ ice 'failed'
   │      timeout   ▼                               disconnect  ▼
   └──────────── ENDED / REJECTED / MISSED ◄────────────────  ENDED
```

| State | Mô tả |
|-------|-------|
| `IDLE` | Không có cuộc gọi |
| `RINGING` | Đang đổ chuông (OUTGOING ở caller / INCOMING ở callee) |
| `CONNECTING` | Đã chấp nhận, đang trao đổi SDP/ICE |
| `CONNECTED` | Đã có media (onTrack / iceConnectionState=connected) |
| `ENDED` | Kết thúc bình thường |
| `MISSED` | Hết 30s không bắt máy |
| `REJECTED` | Bị từ chối / máy bận |

**Timeout:** caller đặt timer 30s kể từ `call-user`; nếu chưa `call-answered` → `MISSED`, gửi `end-call`.

---

## 5. Sequence diagram — Cuộc gọi thành công (P2P)

```
 A (Caller)            Server                 B (Callee)            Coturn
   │  call-user           │                       │                   │
   ├─────────────────────►│  incoming-call        │                   │
   │                      ├──────────────────────►│ (app mở / FCM nếu  │
   │                      │   + FCM nếu offline    │  socket offline)   │
   │                      │                        │ hiển thị màn gọi   │
   │                      │      answer-call       │                   │
   │   call-answered      │◄───────────────────────┤ (user bấm nghe)   │
   │◄─────────────────────┤                        │                   │
   │ createOffer          │                        │                   │
   │   sdp(offer)         │        sdp(offer)      │                   │
   ├─────────────────────►├───────────────────────►│ setRemote+answer  │
   │                      │       sdp(answer)      │                   │
   │   sdp(answer)        │◄───────────────────────┤                   │
   │◄─────────────────────┤                        │                   │
   │  ice-candidate ⇄ ⇄ ⇄ │ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ ⇄ │ ice-candidate     │
   │      (thu thập STUN/TURN candidate, trao đổi qua server)          │
   │                      │                        │                   │
   │═════ media SRTP P2P trực tiếp (nếu được) ═════│                   │
   │       ── hoặc fallback relay qua TURN ──      │                   │
   │═════════════════════ relay ═══════════════════╪══════════════════►│
   │                      │       end-call         │                   │
   │   call-ended         │◄───────────────────────┤                   │
   │◄─────────────────────┤                        │                   │
```

## 5b. Sequence — App B đang KILL / màn hình khóa

```
 A            Server          FCM            B(native)        B(RN/WebRTC)
 │ call-user   │               │                │                 │
 ├────────────►│ socket offline?│                │                 │
 │             ├── pushIncoming►│  data message  │                 │
 │             │               ├───────────────►│ Hiện IncomingCall│
 │             │               │                │ full-screen +    │
 │             │               │                │ Ring + FGS       │
 │             │               │   user bấm nghe │                 │
 │             │               │                ├ boot RN ─────────►│ socket connect
 │             │  answer-call   │                │                 │ rejoin user:<id>
 │ call-answered◄──────────────┼────────────────┼─────────────────┤
 │◄────────────┤               │                │                 │
 │ … (offer/answer/ICE như trên) …              │                 │
```

## 5c. Sequence — Máy bận (cuộc gọi thứ 2)

```
 A2           Server                 B (đang trong cuộc với A1)
 │ call-user   │  B đang CONNECTED?   │
 ├────────────►│  có → busy           │
 │   busy      │◄─────────────────────┤ (server tự trả, không làm phiền B)
 │◄────────────┤                      │
```

---

## 6. WebRTC

```js
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: ['turn:your-domain.com:3478?transport=udp',
             'turn:your-domain.com:3478?transport=tcp',
             'turns:your-domain.com:5349'],
      username: '<ephemeral>',   // lấy từ GET /api/turn/credentials
      credential: '<ephemeral>',
    },
  ],
  iceCandidatePoolSize: 4,
});
```

- **Perfect Negotiation lite:** Caller là `polite=false` (tạo offer sau `call-answered`), Callee `polite=true` (chờ offer, tạo answer). Tránh glare.
- **Reconnect khi mất mạng:** lắng `oniceconnectionstatechange`; khi `disconnected` → chờ; khi `failed` → `pc.restartIce()` và caller tạo lại offer (ICE restart). Quá `RECONNECT_TIMEOUT` (15s) chưa lại được → `ENDED`.
- **TURN fallback:** tự động qua relay candidate; để test ép TURN, set `iceTransportPolicy: 'relay'`.

---

## 7. TURN Server (Coturn)

Xem `docs/COTURN_SETUP.md` (cấu hình `turnserver.conf`, mở port, TLS, ephemeral auth bằng `use-auth-secret`). Server NodeJS cấp credential ngắn hạn qua `GET /api/turn/credentials` (HMAC-SHA1 theo secret chung với Coturn).

---

## 8. Android (sx-mobile)

- **Foreground Service** (`InCallForegroundService`, type=microphone|camera) giữ tiến trình + mic/camera khi màn khóa.
- **WakeLock + showWhenLocked + turnScreenOn** trên `IncomingCallActivity` (full-screen).
- **Một màn hình cuộc gọi duy nhất:** `currentCallId` guard ở native; RN `CallController` là singleton state — `IncomingCallActivity` Accept → `finish()` → RN `CallScreen` lên. Không tạo trùng.
- **FCM** `incoming_call` data message → native dựng IncomingCall ngay cả khi app kill.
- Tái dùng lớp native đã ổn định (lock-screen, ring service, FGS); chỉ thay lớp signaling/WebRTC JS theo hợp đồng mới.

## 9. Cấu trúc module (Clean Architecture)

### Mobile `sx-mobile/src/calling/`
```
calling/
├─ domain/
│  ├─ CallState.ts          # enum + types (IDLE..REJECTED)
│  └─ CallSession.ts        # entity cuộc gọi
├─ data/
│  ├─ SignalingClient.ts    # bọc socket.io, phát/nhận event hợp đồng mới
│  ├─ WebRTCService.ts      # RTCPeerConnection, SDP/ICE, restartIce
│  └─ TurnConfigRepo.ts     # fetch /api/turn/credentials
├─ presentation/
│  ├─ CallProvider.tsx      # controller/state machine (React context)
│  ├─ CallScreen.tsx        # UI đang gọi
│  └─ IncomingCallBridge.tsx# nối native incoming → controller
└─ index.ts
```

### Web `frontend/src/calling/` (gương theo mobile)
```
calling/
├─ domain/callState.js
├─ data/signalingClient.js
├─ data/webrtcService.js
├─ data/turnConfig.js
└─ presentation/CallProvider.jsx, CallScreen.jsx, IncomingCallModal.jsx
```

---

## 10. Trường hợp đặc biệt (xử lý)

| Tình huống | Xử lý |
|-----------|-------|
| Người nhận bận | Server thấy callee đang trong cuộc → trả `busy` cho caller, không làm phiền callee |
| Người nhận offline | Không có socket → gửi FCM; nếu cũng không có token/không bắt máy 30s → `call-unavailable`/`MISSED` |
| Mất mạng giữa cuộc | `restartIce()` + ICE restart offer; quá 15s → kết thúc |
| App bị kill | FCM data message → native IncomingCall + boot RN; resend `answer-call` khi socket reconnect |
| Màn hình khóa | `IncomingCallActivity` showWhenLocked + FGS |
| Cuộc gọi đến lần 2 khi đang gọi | Tự `busy` (server) + client guard `currentCallId` |

---

## 11. Lộ trình triển khai

1. ✅ Tài liệu kiến trúc + diagram (file này).
2. Backend: module signaling mới (`callSignaling`) + `GET /api/turn/credentials` + Redis adapter optional.
3. Coturn config + hướng dẫn cài (`docs/COTURN_SETUP.md`).
4. sx-mobile: module `calling/` mới, gỡ code call cũ.
5. frontend web: module `calling/` mới, gỡ code call cũ.
6. Build APK + web, kiểm thử kịch bản đặc biệt.
