/**
 * Gửi push tray khi bản APK được phát hành (is_active).
 * Fire-and-forget — không chặn response admin.
 */
const { sendAppUpdateBroadcast } = require('../services/pushSender');

/**
 * @param {object} app — mobile_apps row (cần app_key)
 * @param {object} release — app_releases row
 */
function notifyAppReleaseIfActive(app, release) {
  try {
    if (!app?.app_key || !release) return;
    if (release.update_type && release.update_type !== 'apk') return;
    const active = release.is_active === true || release.is_active === 'true';
    if (!active) return;

    void sendAppUpdateBroadcast({
      appKey: app.app_key,
      version: release.version,
      versionCode: release.version_code,
      releaseNotes: release.release_notes,
      releaseId: release.id,
      mandatory: release.is_mandatory === true,
    }).catch((e) => {
      console.warn('[appUpdateNotify] broadcast failed:', e?.message || e);
    });
  } catch (e) {
    console.warn('[appUpdateNotify]', e?.message || e);
  }
}

module.exports = { notifyAppReleaseIfActive };
