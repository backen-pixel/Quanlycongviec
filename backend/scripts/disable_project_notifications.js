#!/usr/bin/env node
/**
 * Tắt thông báo module "Quản lý công việc" (Dự án) cho tất cả user.
 * - Cập nhật notification_preferences.project_notifications = false cho mọi row.
 * - Nếu cột chưa tồn tại (chưa chạy migration 158_disable_project_notifications.sql),
 *   in cảnh báo và thoát: hãy chạy file SQL trong Supabase SQL Editor trước.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');

(async () => {
  try {
    const { data, error, count } = await supabase
      .from('notification_preferences')
      .update({ project_notifications: false }, { count: 'exact' })
      .neq('user_id', '00000000-0000-0000-0000-000000000000')
      .select('user_id');

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes("Could not find") || msg.includes('column') || msg.includes('does not exist')) {
        console.error('[!] Cột "project_notifications" chưa tồn tại trên DB.');
        console.error('    Hãy mở Supabase SQL Editor và chạy file:');
        console.error('    database/158_disable_project_notifications.sql');
        process.exit(2);
      }
      throw error;
    }

    const n = (data || []).length || count || 0;
    console.log(`[OK] Đã tắt project_notifications cho ${n} user.`);
    process.exit(0);
  } catch (e) {
    console.error('[ERR]', e.message || e);
    process.exit(1);
  }
})();
