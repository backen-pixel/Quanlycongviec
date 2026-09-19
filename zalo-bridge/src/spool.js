/**
 * Hàng đợi tin đến chờ gửi lên CRM, lưu xuống đĩa, riêng cho từng tài khoản.
 *
 * CRM nằm trên VPS nên mọi lần mất mạng văn phòng, VPS restart hay deploy đều
 * làm POST /inbound thất bại. Tin rơi vào đây và được gửi lại, không mất.
 */
const fs = require('fs');

const MAX_ENTRIES = 5000;

/**
 * Ghi đè nguyên tử: ghi ra file tạm, ép xuống đĩa, rồi đổi tên đè lên.
 * Máy chưa có UPS — cúp điện giữa lúc writeFileSync đang chạy sẽ để lại file
 * cụt và mất sạch tin đang chờ. rename() trên cùng một phân vùng thì không.
 */
function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function createSpool(file) {
  function append(payload) {
    try {
      // fsync sau mỗi tin: không có UPS thì tin nằm trong bộ đệm của hệ điều hành
      // sẽ bay mất khi cúp điện. Lưu lượng chat đủ thấp để chịu được chi phí này.
      const fd = fs.openSync(file, 'a', 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(payload)}\n`);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      console.error(`[spool ${file}] Không ghi được xuống đĩa:`, e.message);
    }
  }

  function readAll() {
    try {
      return fs.readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function rewrite(entries) {
    const kept = entries.slice(-MAX_ENTRIES);
    try {
      if (!kept.length) fs.rmSync(file, { force: true });
      else writeAtomic(file, `${kept.map((e) => JSON.stringify(e)).join('\n')}\n`);
    } catch (e) {
      console.error(`[spool ${file}] Không dọn được hàng đợi:`, e.message);
    }
  }

  /**
   * Gửi lại toàn bộ tin đang chờ. Gửi theo lô; lô nào lỗi thì giữ lại lô đó và
   * những lô sau, để tin không bị đảo thứ tự.
   */
  async function flush(push, batchSize = 20) {
    const entries = readAll();
    if (!entries.length) return { sent: 0, remaining: 0 };

    let sent = 0;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      try {
        await push(batch);
        sent += batch.length;
      } catch (e) {
        rewrite(entries.slice(sent));
        return { sent, remaining: entries.length - sent, error: e.message };
      }
    }

    rewrite([]);
    return { sent, remaining: 0 };
  }

  return { append, flush, size: () => readAll().length, file };
}

module.exports = { createSpool };
