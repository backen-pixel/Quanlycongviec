import { resolveMediaUrl } from './mediaUrl';

/** Nội dung text để chia sẻ / copy. */
export function buildMessengerShareText(msg, { groupTitle } = {}) {
  if (!msg) return '';
  const header = groupTitle ? `[${groupTitle}] ` : '';
  const who = msg.user?.full_name || 'Ai đó';
  const body = (msg.content || '').trim();
  const atts = collectMessengerAttachments(msg);
  const lines = [`${header}${who}:`];
  if (body) lines.push(body);
  for (const a of atts) {
    const u = resolveMediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!body && !atts.length && msg.attachment_url) {
    lines.push(resolveMediaUrl(msg.attachment_url) || '');
  }
  return lines.filter(Boolean).join('\n').trim();
}

export function collectMessengerAttachments(message) {
  if (Array.isArray(message?.attachments) && message.attachments.length) {
    return message.attachments;
  }
  if (message?.attachment_url) {
    return [{
      url: message.attachment_url,
      name: message.attachment_name,
      type: message.attachment_mime,
      size: message.attachment_size,
    }];
  }
  return [];
}

export function getFirstImageAttachment(msg) {
  const items = collectMessengerAttachments(msg);
  for (const a of items) {
    if ((a.type || '').startsWith('image/')) return a;
  }
  const mime = msg?.attachment_mime || '';
  if (mime.startsWith('image/') && msg?.attachment_url) {
    return { url: msg.attachment_url, name: msg.attachment_name, type: mime };
  }
  return null;
}

export function getFirstDownloadableAttachment(msg) {
  const img = getFirstImageAttachment(msg);
  if (img) return img;
  const items = collectMessengerAttachments(msg);
  if (items.length) return items[0];
  if (msg?.attachment_url) {
    return {
      url: msg.attachment_url,
      name: msg.attachment_name,
      type: msg.attachment_mime,
    };
  }
  return null;
}

export async function copyTextToClipboard(text) {
  const t = (text || '').trim();
  if (!t) throw new Error('Không có nội dung để sao chép');
  await navigator.clipboard.writeText(t);
}

async function loadImageBlobViaCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Không tạo được ảnh'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh'))),
          'image/png',
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Không tải được ảnh'));
    img.src = url;
  });
}

async function fetchMessengerImageBlob(url) {
  // /uploads trả ACAO * — không dùng credentials: 'include' (trình duyệt chặn kết hợp này).
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('Không tải được ảnh');
  const blob = await res.blob();
  if (blob.size > 0) return blob;
  throw new Error('Ảnh rỗng');
}

export async function copyImageToClipboard(url) {
  const full = resolveMediaUrl(url);
  if (!full) throw new Error('URL ảnh không hợp lệ');
  let blob;
  try {
    blob = await fetchMessengerImageBlob(full);
  } catch {
    blob = await loadImageBlobViaCanvas(full);
  }
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    await navigator.clipboard.writeText(full);
    return 'url';
  }
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
  return 'image';
}

export function downloadMessengerFile(url, name) {
  const full = resolveMediaUrl(url);
  if (!full) throw new Error('URL không hợp lệ');
  const a = document.createElement('a');
  a.href = full;
  a.download = name || 'download';
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Tên nguồn chia sẻ (chat / người gửi gốc) — một nhãn, không lặp. */
function forwardSourceLabel(sourceTitle, msg) {
  const who = msg?.user?.full_name || msg?.user?.email || '';
  const title = String(sourceTitle || '')
    .trim()
    .replace(/^«\s*|\s*»$/g, '');
  return title || who || '';
}

/** Rút gọn header chia sẻ cũ khi hiển thị (tin đã gửi trước khi đổi format). */
export function normalizeForwardDisplayContent(content) {
  if (!content || typeof content !== 'string') return content;
  return content
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) «([^»]+)» — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n')
    .replace(/^↪ Chia sẻ((?: \d+ tin)? từ) ([^\n—]+?) — \2:\s*/i, '↪ Chia sẻ$1 $2\n\n');
}

/** Nội dung gửi sang chat khác khi chuyển tiếp / chia sẻ tin nhắn. */
export function buildForwardMessageContent(msg, { sourceTitle, note } = {}) {
  if (!msg) return '';
  const from = forwardSourceLabel(sourceTitle, msg);
  const lines = [];
  if (note?.trim()) lines.push(note.trim());
  lines.push(from ? `↪ Chia sẻ từ ${from}` : '↪ Chia sẻ tin nhắn');
  const text = (msg.content || '').trim();
  if (text) lines.push(text);
  const atts = collectMessengerAttachments(msg);
  for (const a of atts) {
    const u = resolveMediaUrl(a.url);
    if (u) lines.push(u);
  }
  if (!text && !atts.length && msg.attachment_url) {
    const u = resolveMediaUrl(msg.attachment_url);
    if (u) lines.push(u);
  }
  return lines.filter(Boolean).join('\n\n');
}

/** Gộp nhiều tin để sao chép / chia sẻ hàng loạt. */
export function buildBulkMessengerShareText(messages, opts = {}) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  return list.map((m) => buildMessengerShareText(m, opts)).filter(Boolean).join('\n\n———\n\n');
}

export function buildBulkForwardMessageContent(messages, opts = {}) {
  const list = (Array.isArray(messages) ? messages : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return buildForwardMessageContent(list[0], opts);
  const { sourceTitle, note } = opts;
  const lines = [];
  if (note?.trim()) lines.push(note.trim());
  const from = forwardSourceLabel(sourceTitle, list[0]);
  lines.push(
    from ? `↪ Chia sẻ ${list.length} tin từ ${from}` : `↪ Chia sẻ ${list.length} tin nhắn`,
  );
  list.forEach((msg, i) => {
    const text = (msg.content || '').trim();
    lines.push(`\n${i + 1}.`);
    if (text) lines.push(text);
    const atts = collectMessengerAttachments(msg);
    for (const a of atts) {
      const u = resolveMediaUrl(a.url);
      if (u) lines.push(u);
    }
    if (!text && !atts.length && msg.attachment_url) {
      const u = resolveMediaUrl(msg.attachment_url);
      if (u) lines.push(u);
    }
  });
  return lines.filter(Boolean).join('\n').trim();
}

export async function shareMessengerMessage(msg, opts) {
  const text = buildMessengerShareText(msg, opts);
  if (!text) throw new Error('Không có nội dung để chia sẻ');
  if (navigator.share) {
    try {
      await navigator.share({ text, title: opts?.groupTitle || 'Tin nhắn' });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  await copyTextToClipboard(text);
}
