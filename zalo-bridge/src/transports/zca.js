/**
 * Transport chính — nói trực tiếp với endpoint Zalo Web qua zca-js.
 *
 * Mỗi tài khoản một instance. Phiên đăng nhập lưu ở sessions/<oa_id>.json
 * (cookie + imei + userAgent). Quét QR một lần; lần sau nạp lại session.
 */
const fs = require('fs');
const config = require('../config');

/** Số lần thử nạp lại phiên khi lỗi mạng, và giãn cách tăng dần giữa các lần. */
const LOGIN_RETRIES = 4;
const LOGIN_RETRY_MS = 5000;

/** Lỗi mạng (không tới được Zalo) khác hẳn lỗi phiên bị từ chối. */
function isNetworkError(e) {
  const m = String(e?.message || '').toLowerCase();
  const code = String(e?.cause?.code || e?.code || '');
  return m.includes('fetch failed')
    || m.includes('network')
    || m.includes('timeout')
    || m.includes('socket')
    || /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH/.test(code);
}

// zca-js là ESM, nạp động từ CommonJS. Dùng chung một promise cho mọi tài khoản.
let zcaPromise = null;
function loadZca() {
  if (!zcaPromise) zcaPromise = import('zca-js');
  return zcaPromise;
}

function readSession(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeSession(file, api) {
  try {
    const ctx = api.getContext();
    const jar = api.getCookie();
    const payload = {
      imei: ctx.imei,
      userAgent: ctx.userAgent,
      language: ctx.language || 'vi',
      cookie: typeof jar?.toJSON === 'function' ? jar.toJSON() : jar,
      savedAt: new Date().toISOString(),
    };
    // Ghi nguyên tử — cúp điện giữa chừng mà file cụt thì phải quét QR lại.
    const tmp = `${file}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('[zca] Không lưu được session:', e.message);
  }
}

/** Chuẩn hoá về 0xxxxxxxxx; null nếu không phải di động Việt Nam hợp lệ. */
function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  else if (d.length === 9 && !d.startsWith('0')) d = `0${d}`;
  if (d.length !== 10 || !d.startsWith('0')) return null;
  return /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/.test(d) ? d : null;
}

/** Bỏ phiên vừa lập và xoá sạch dấu vết trên đĩa. */
async function hardLogout(api, sessionFile, qrFile) {
  try { api.listener.stop(); } catch (_) { /* ignore */ }
  for (const f of [sessionFile, qrFile]) {
    try { fs.rmSync(f, { force: true }); } catch (_) { /* ignore */ }
  }
}

/** Nhãn tiếng Việt cho từng loại tin, dùng khi không có nội dung chữ. */
const TYPE_LABEL = {
  image: 'Hình ảnh',
  video: 'Video',
  audio: 'Tin thoại',
  file: 'Tệp đính kèm',
  sticker: 'Nhãn dán',
  gif: 'Ảnh động',
  location: 'Vị trí',
  link: 'Liên kết',
  contact: 'Danh thiếp',
  unknown: 'Tin nhắn',
};

/** Đoán loại tin từ msgType của Zalo. */
function guessType(msgType, hasUrl) {
  const t = String(msgType || '').toLowerCase();
  if (t.includes('sticker')) return 'sticker';
  if (t.includes('gif')) return 'gif';
  if (t.includes('photo') || t.includes('image')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('voice') || t.includes('audio')) return 'audio';
  if (t.includes('file') || t.includes('doc')) return 'file';
  if (t.includes('location') || t.includes('map')) return 'location';
  if (t.includes('contact') || t.includes('business_card')) return 'contact';
  if (t.includes('link') || hasUrl) return 'link';
  return 'unknown';
}

/**
 * Moi URL ra khỏi nội dung đính kèm.
 *
 * Zalo đặt tên trường khác nhau tuỳ loại tin — sticker dùng `stickerUrl`, ảnh
 * dùng `href`, có loại chỉ có `thumb`. Thử hết thay vì đoán một cái.
 */
function pickUrl(o) {
  if (!o || typeof o !== 'object') return null;
  for (const k of ['href', 'url', 'stickerWebpUrl', 'stickerUrl', 'oriUrl', 'normalUrl', 'thumbUrl', 'thumb']) {
    const v = o[k];
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

/**
 * Moi tên tệp và dung lượng. Zalo đặt tên trường khác nhau tuỳ loại tin, và có
 * khi nhét trong chuỗi JSON ở `params` — thử hết thay vì đoán một cái.
 */
function pickFileInfo(o) {
  if (!o || typeof o !== 'object') return { name: null, size: null };

  let extra = {};
  if (typeof o.params === 'string') {
    try { extra = JSON.parse(o.params) || {}; } catch (_) { extra = {}; }
  } else if (o.params && typeof o.params === 'object') {
    extra = o.params;
  }

  const pick = (keys) => {
    for (const k of keys) {
      for (const src of [o, extra]) {
        const v = src?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
    }
    return null;
  };

  const rawName = pick(['fileName', 'filename', 'fName', 'name', 'title']);
  const rawSize = pick(['fileSize', 'filesize', 'size', 'totalSize', 'fSize']);
  const size = Number(String(rawSize ?? '').replace(/\D/g, ''));

  return {
    name: rawName ? String(rawName).slice(0, 255) : null,
    size: Number.isFinite(size) && size > 0 ? size : null,
  };
}

/** Quy về payload mà /api/zalo-bridge/inbound hiểu được. */
function toPayload(message, ThreadType) {
  if (message.type !== ThreadType.User) return null; // chỉ chat 1-1

  const data = message.data || {};
  const rawContent = data.content;

  // Tin chữ thuần
  if (typeof rawContent === 'string') {
    return {
      thread_id: message.threadId,
      thread_type: 'user',
      msg_id: data.msgId || data.cliMsgId || null,
      direction: message.isSelf ? 'outbound' : 'inbound',
      content: rawContent,
      message_type: 'text',
      attachment_url: null,
      display_name: message.isSelf ? null : (data.dName || null),
      transport: 'zca',
      raw: { msgType: data.msgType, ts: data.ts },
    };
  }

  // Tin có đính kèm: sticker, ảnh, video, tệp, vị trí…
  const obj = rawContent && typeof rawContent === 'object' ? rawContent : {};
  const url = pickUrl(obj);
  const messageType = guessType(data.msgType, !!url);

  // Nội dung chữ đi kèm (chú thích ảnh, tiêu đề liên kết). Không có thì dùng
  // nhãn trong ngoặc — tuyệt đối không để bong bóng chat trống trơn.
  const caption = [obj.title, obj.description, obj.text]
    .find((v) => typeof v === 'string' && v.trim()) || '';
  const { name: fileName, size: fileSize } = pickFileInfo(obj);
  const content = caption.trim() || fileName || `[${TYPE_LABEL[messageType] || 'Tin nhắn'}]`;

  return {
    thread_id: message.threadId,
    thread_type: 'user',
    msg_id: data.msgId || data.cliMsgId || null,
    direction: message.isSelf ? 'outbound' : 'inbound',
    content,
    message_type: messageType,
    attachment_url: url,
    attachment_type: messageType,
    attachment_name: fileName,
    attachment_size: fileSize,
    display_name: message.isSelf ? null : (data.dName || null),
    transport: 'zca',
    // Giữ nguyên nội dung thô (cắt bớt) để còn dò được khi Zalo đổi cấu trúc
    raw: { msgType: data.msgType, ts: data.ts, content: JSON.stringify(obj).slice(0, 800) },
  };
}

/**
 * @param {object} account { oa_id, oa_name }
 * @param {object} hooks   { onMessage(payload), onStatus(status, note), onQr(base64|null) }
 */
async function createZcaTransport(account, hooks) {
  const { Zalo, ThreadType, LoginQRCallbackEventType } = await loadZca();
  const tag = `[zca ${account.oa_name || account.oa_id}]`;
  const sessionFile = config.sessionFileFor(account.oa_id);
  const qrFile = config.qrFileFor(account.oa_id);

  const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
  const saved = readSession(sessionFile);
  let api = null;

  if (saved?.cookie && saved?.imei && saved?.userAgent) {
    const creds = {
      cookie: saved.cookie,
      imei: saved.imei,
      userAgent: saved.userAgent,
      language: saved.language || 'vi',
    };

    // Mạng chập một cái mà vứt phiên là bắt người ta ra tận máy quét QR lại.
    // Lỗi mạng thì thử lại có giãn cách; chỉ khi Zalo thật sự từ chối phiên
    // mới chịu quay về quét QR.
    for (let attempt = 1; attempt <= LOGIN_RETRIES; attempt += 1) {
      try {
        api = await zalo.login(creds);
        console.log(`${tag} Đăng nhập lại bằng session đã lưu.`);
        break;
      } catch (e) {
        const network = isNetworkError(e);
        const last = attempt === LOGIN_RETRIES;
        if (!network) {
          console.warn(`${tag} Zalo từ chối phiên cũ, cần quét QR lại:`, e.message);
          break;
        }
        if (last) {
          console.warn(`${tag} Không nối được Zalo sau ${LOGIN_RETRIES} lần (${e.message}) — chuyển sang quét QR.`);
          break;
        }
        const wait = LOGIN_RETRY_MS * attempt;
        console.warn(`${tag} Lỗi mạng khi nạp phiên (${e.message}) — thử lại sau ${wait / 1000}s.`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  if (!api) {
    hooks.onStatus('need_qr', 'Đang chờ quét mã QR');
    api = await zalo.loginQR({}, (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          // `qrPath` trong options KHÔNG tự ghi file — phải tự lưu ở đây.
          const b64 = String(event.data.image || '').replace(/^data:image\/\w+;base64,/, '');
          try {
            fs.writeFileSync(qrFile, Buffer.from(b64, 'base64'), { mode: 0o600 });
          } catch (e) {
            console.error(`${tag} Không lưu được mã QR:`, e.message);
          }
          console.log(`${tag} Mã QR mới — quét tại trang quản trị hoặc ${qrFile}`);
          hooks.onQr?.(b64);
          hooks.onStatus('need_qr', 'Chờ quét mã QR');
          break;
        }
        case LoginQRCallbackEventType.QRCodeExpired:
          event.actions.retry();
          break;
        case LoginQRCallbackEventType.QRCodeScanned:
          console.log(`${tag} Đã quét bởi: ${event.data.display_name}`);
          hooks.onStatus('need_qr', `Đã quét bởi ${event.data.display_name}, chờ xác nhận`);
          break;
        case LoginQRCallbackEventType.QRCodeDeclined:
          console.warn(`${tag} Người dùng từ chối đăng nhập.`);
          hooks.onStatus('error', 'Đăng nhập bị từ chối trên điện thoại');
          break;
        default:
          break;
      }
    });
    try { fs.rmSync(qrFile, { force: true }); } catch (_) { /* ignore */ }
    hooks.onQr?.(null);
  }

  let selfInfo = null;
  try {
    selfInfo = await api.fetchAccountInfo();
  } catch (e) {
    console.warn(`${tag} Không lấy được thông tin tài khoản:`, e.message);
  }

  const selfPhoneRaw = selfInfo?.profile?.phoneNumber || null;

  // Mã QR đăng nhập Zalo Web là mã CHUNG — ai quét trước thì tài khoản của
  // người đó vào ô này. Có khai báo số dự kiến thì phải đối chiếu NGAY, trước
  // khi lưu phiên hay bật listener: quét nhầm là tin nhắn riêng của người khác
  // chảy vào CRM.
  const expected = normalizePhone(account.expected_phone);
  if (expected) {
    const actual = normalizePhone(selfPhoneRaw);
    if (!actual) {
      await hardLogout(api, sessionFile, qrFile);
      throw new Error(`Không đọc được số của tài khoản vừa quét, trong khi ô này chốt cho ${expected}`);
    }
    if (actual !== expected) {
      await hardLogout(api, sessionFile, qrFile);
      hooks.onQr?.(null);
      throw new Error(`Quét nhầm tài khoản: ô này chốt cho ${expected} nhưng người quét dùng ${actual}. Đã huỷ phiên, không lưu gì.`);
    }
    console.log(`${tag} Số khớp khai báo (${actual}).`);
  }

  writeSession(sessionFile, api);

  // Đăng nhập xong thì mã QR cũ (nếu còn sót từ lần hỏng trước) hết ý nghĩa —
  // xoá cả trên đĩa lẫn trên CRM, kẻo trang quản trị hiện mã chết.
  try { fs.rmSync(qrFile, { force: true }); } catch (_) { /* ignore */ }
  hooks.onQr?.(null);

  api.listener.on('connected', () => {
    console.log(`${tag} WebSocket đã kết nối.`);
    hooks.onStatus('online', 'zca-js đã kết nối');
  });

  api.listener.on('message', (message) => {
    try {
      const payload = toPayload(message, ThreadType);
      if (payload) hooks.onMessage(payload);
    } catch (e) {
      console.error(`${tag} Lỗi xử lý tin nhắn:`, e.message);
    }
  });

  api.listener.on('error', (err) => {
    console.error(`${tag} Lỗi listener:`, err?.message || err);
    hooks.onStatus('error', String(err?.message || err).slice(0, 200));
  });

  api.listener.on('closed', (code, reason) => {
    console.warn(`${tag} WebSocket đóng (${code}): ${reason}`);
    hooks.onStatus('offline', `WebSocket đóng: ${reason || code}`);
  });

  api.listener.start({ retryOnClose: true });

  // Số của CHÍNH tài khoản đang đăng nhập. CRM dùng số này để biết tài khoản
  // Zalo thuộc về nhân viên nào — không ai nhập tay nên không gán nhầm được.
  const selfPhone = selfPhoneRaw;
  if (selfPhone) console.log(`${tag} Số của tài khoản: ${selfPhone}`);

  return {
    name: 'zca',
    selfInfo,
    selfPhone,
    async send(threadId, content) {
      const result = await api.sendMessage(String(content), String(threadId), ThreadType.User);
      const msgId = result?.message?.msgId ?? result?.attachment?.[0]?.msgId ?? null;
      return { msgId: msgId != null ? String(msgId) : null };
    },
    async stop() {
      try { api.listener.stop(); } catch (_) { /* ignore */ }
    },
    /**
     * Lấy hồ sơ của người vừa nhắn tới. Zalo CHỈ trả `phoneNumber` khi người đó
     * là bạn bè / có chia sẻ số — với người lạ thường rỗng, nên đây là đường
     * khớp lead "được thì tốt", không phải đường chính.
     *
     * Đây là xem hồ sơ của người vừa chủ động nhắn cho mình, không phải dò số.
     */
    async getProfile(threadId) {
      const res = await api.getUserInfo(String(threadId));
      const profile = res?.changed_profiles?.[threadId]
        || Object.values(res?.changed_profiles || {})[0]
        || null;
      if (!profile) return null;
      return {
        phone: profile.phoneNumber || null,
        display_name: profile.displayName || profile.zaloName || null,
        avatar_url: profile.avatar || null,
      };
    },
    /** Tra một số điện thoại ra tài khoản Zalo. Dùng rất tiết kiệm — xem ghi chú
     *  về hạn mức ở account.js. */
    async findUserByPhone(phone) {
      let user;
      try {
        user = await api.findUser(String(phone));
      } catch (e) {
        // Mã 216 = số không có tài khoản Zalo. Đây là câu trả lời hợp lệ
        // ("không tìm thấy"), không phải lỗi hệ thống — zca-js định bỏ qua mã
        // này nhưng vẫn ném ra ngoài.
        if (e?.code === 216) return null;
        throw e;
      }
      if (!user) return null;
      return {
        uid: String(user.uid || user.userId || ''),
        display_name: user.display_name || user.zalo_name || null,
        avatar_url: user.avatar || null,
      };
    },
    /** Đăng xuất hẳn: huỷ phiên và xoá file đăng nhập (dùng khi nhân viên nghỉ). */
    async logout() {
      try { api.listener.stop(); } catch (_) { /* ignore */ }
      try { fs.rmSync(sessionFile, { force: true }); } catch (_) { /* ignore */ }
      try { fs.rmSync(qrFile, { force: true }); } catch (_) { /* ignore */ }
    },
  };
}

module.exports = { createZcaTransport };
