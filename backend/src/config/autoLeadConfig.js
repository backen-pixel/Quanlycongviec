/**
 * Auto Lead Config — lưu điều kiện tự động tạo lead từ Facebook
 * Lưu file JSON (không cần migration DB)
 */
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'auto-lead-config.json');

const DEFAULT_CONFIG = {
  // Điều kiện tạo lead
  trigger: 'first_message',  // 'first_message' | 'message_count' | 'has_phone' | 'manual'
  message_count_threshold: 1, // Số tin nhắn tối thiểu (khi trigger = 'message_count')

  // Tên khách mặc định
  default_customer_name: 'User', // Tên mặc định khi chưa biết

  // Tự động cập nhật
  auto_update_name: true,     // Tự động cập nhật tên khi fetch được từ FB
  auto_update_phone: true,    // Tự động cập nhật SĐT khi tìm được trong tin nhắn
  auto_update_address: true,  // Tự động cập nhật địa chỉ khi tìm được

  // Auto-reply
  auto_reply_first_message: true, // Tự động trả lời tin nhắn đầu tiên

  // Xử lý khách cũ (lead bị xóa)
  recreate_deleted_leads: false, // Tạo lại lead nếu lead cũ bị xóa

  // Thông báo
  notify_on_new_lead: true,     // Thông báo khi tạo lead mới
  notify_on_phone_found: true,  // Thông báo khi tìm được SĐT
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[AutoLead] Config load error:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try {
    const merged = { ...DEFAULT_CONFIG, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (e) {
    console.error('[AutoLead] Config save error:', e.message);
    throw e;
  }
}

function getConfig() {
  return loadConfig();
}

module.exports = { getConfig, saveConfig, DEFAULT_CONFIG };
