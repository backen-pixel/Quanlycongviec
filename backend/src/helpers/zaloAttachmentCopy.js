/**
 * Chép ảnh và tệp khách gửi qua Zalo về kho của công ty.
 *
 * Link của Zalo hiện tải công khai được, nhưng không ai đảm bảo nó sống mãi.
 * Hợp đồng tủ bếp có vòng đời dài — ảnh khảo sát mặt bằng mất là mất bằng chứng.
 *
 * Tệp lớn hơn ngưỡng thì CỐ Ý không chép: chỉ giữ tên và dung lượng để nhân
 * viên biết khách đã gửi cái gì, và còn link gốc của Zalo để mở khi cần.
 */
const { supabase } = require('../config/supabase');
const { uploadBufferToStorage } = require('./storageUpload');

/** Ngưỡng chép. Trên mức này chỉ ghi nhận tên + dung lượng. */
const MAX_COPY_BYTES = 10 * 1024 * 1024;

/** Sticker là hình vui, mất cũng không sao — không tốn kho cho chúng. */
const COPY_TYPES = new Set(['image', 'file', 'video', 'audio', 'gif']);

const MIME_BY_TYPE = {
  image: 'image/jpeg',
  gif: 'image/gif',
  video: 'video/mp4',
  audio: 'audio/aac',
  file: 'application/octet-stream',
};

const FETCH_TIMEOUT_MS = 30000;

function extFromUrl(url) {
  const m = String(url || '').match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
  return m ? `.${m[1].toLowerCase()}` : '';
}

function fallbackName(message) {
  if (message.attachment_name) return message.attachment_name;
  const ext = extFromUrl(message.attachment_url) || (message.message_type === 'image' ? '.jpg' : '.bin');
  return `zalo-${message.message_type || 'file'}-${String(message.id).slice(0, 8)}${ext}`;
}

/** Đánh dấu trạng thái chép, kèm số liệu đo được. */
async function mark(messageId, patch) {
  await supabase.from('zalo_messages').update(patch).eq('id', messageId);
}

/**
 * Chép một tin. Không ném lỗi ra ngoài — hỏng thì ghi trạng thái rồi đi tiếp,
 * vì đây là việc nền, không được làm hỏng luồng nhận tin.
 *
 * @returns {Promise<'stored'|'too_large'|'failed'|'skipped'>}
 */
async function copyOne(message) {
  const url = message.attachment_url;
  if (!url || !COPY_TYPES.has(message.message_type)) {
    await mark(message.id, { attachment_status: 'skipped' });
    return 'skipped';
  }

  // Dung lượng Zalo khai sẵn thì chặn luôn, khỏi tải về rồi mới biết quá cỡ
  if (message.attachment_size && message.attachment_size > MAX_COPY_BYTES) {
    await mark(message.id, { attachment_status: 'too_large' });
    return 'too_large';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // Hỏi kích thước trước qua header, tránh tải hết rồi mới phát hiện quá cỡ
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      await mark(message.id, { attachment_status: 'failed' });
      return 'failed';
    }

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > MAX_COPY_BYTES) {
      await mark(message.id, {
        attachment_status: 'too_large',
        attachment_size: message.attachment_size || declared,
      });
      return 'too_large';
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Máy chủ có thể không khai content-length — kiểm lại sau khi tải xong
    if (buffer.length > MAX_COPY_BYTES) {
      await mark(message.id, {
        attachment_status: 'too_large',
        attachment_size: buffer.length,
      });
      return 'too_large';
    }

    const name = fallbackName(message);
    const mimetype = res.headers.get('content-type')
      || MIME_BY_TYPE[message.message_type]
      || 'application/octet-stream';

    const uploaded = await uploadBufferToStorage(buffer, {
      originalName: name,
      mimetype,
      size: buffer.length,
      entityType: 'zalo',
      entityId: message.contact_id,
      folderPrefix: `zalo/${message.contact_id}`,
    });

    if (!uploaded?.storage_path) {
      await mark(message.id, { attachment_status: 'failed' });
      return 'failed';
    }

    // Lưu ĐƯỜNG DẪN, không lưu URL công khai của Supabase: URL đó mang địa chỉ
    // nội bộ (localhost:8000) nên trình duyệt chặn khi trang chạy HTTPS, và nó
    // công khai với bất kỳ ai có link. Phục vụ qua endpoint có kiểm quyền.
    await mark(message.id, {
      stored_path: uploaded.storage_path,
      stored_bucket: uploaded.bucket || null,
      stored_url: `/api/zalo/messages/${message.id}/attachment`,
      attachment_name: message.attachment_name || name,
      attachment_size: buffer.length,
      attachment_status: 'stored',
    });
    return 'stored';
  } catch (e) {
    console.warn('[Zalo đính kèm] Chép thất bại:', message.id, e.message);
    await mark(message.id, { attachment_status: 'failed' });
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Xử lý hàng đợi. Gọi từ vòng nền, KHÔNG gọi trong luồng nhận tin — tải tệp
 * chậm hơn ghi cơ sở dữ liệu hàng chục lần.
 */
async function processPending(limit = 5) {
  const { data: rows } = await supabase
    .from('zalo_messages')
    .select('id, contact_id, message_type, attachment_url, attachment_name, attachment_size')
    .eq('attachment_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!rows?.length) return { processed: 0 };

  const tally = { stored: 0, too_large: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    tally[await copyOne(row)] += 1;
  }

  const done = Object.entries(tally).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(' ');
  if (done) console.log(`[Zalo đính kèm] ${done}`);
  return { processed: rows.length, ...tally };
}

/** Tin mới có đính kèm thì xếp vào hàng đợi chép. */
function statusForNewMessage(messageType, attachmentUrl) {
  if (!attachmentUrl) return null;
  return COPY_TYPES.has(messageType) ? 'pending' : 'skipped';
}

module.exports = {
  copyOne,
  processPending,
  statusForNewMessage,
  MAX_COPY_BYTES,
};
