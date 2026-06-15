/** Helper ghi nhật ký hoạt động module Drive. Không throw nếu fail. */
const { supabase } = require('../config/supabase');

async function logDriveActivity({
  user,
  action,
  targetType,
  targetId,
  targetName,
  rootId = null,
  meta = null,
}) {
  try {
    await supabase.from('drive_activity_log').insert({
      actor_id: user?.userId || user?.id || null,
      action,
      target_type: targetType,
      target_id: targetId,
      target_name: targetName || null,
      root_id: rootId,
      meta,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('drive activity log failed:', e?.message || e);
    }
  }
}

module.exports = { logDriveActivity };
