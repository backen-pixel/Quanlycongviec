/**
 * Expo config plugin — copy native cuộc gọi (WebRTC + màn khóa) vào android/ khi prebuild,
 * đăng ký activity/service/receiver + quyền cần thiết.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');

const CALL_FILES = [
  'call/IncomingCallHelper.kt',
  'call/IncomingCallActivity.kt',
  'call/IncomingCallRingService.kt',
  'call/InCallForegroundService.kt',
  'call/IncomingCallActionReceiver.kt',
  'call/LockScreenCallBridge.kt',
  'call/LockScreenCallModule.kt',
  'call/LockScreenCallPackage.kt',
  'call/CallRejectApi.kt',
  'call/CallAcceptApi.kt',
  'call/PushTokenRegistrar.kt',
];

const RES_FILES = [
  'res/layout/activity_incoming_call.xml',
  'res/values/styles_call.xml',
  'res/drawable/call_avatar_bg.xml',
  'res/drawable/call_avatar_pink.xml',
  'res/drawable/call_avatar_purple.xml',
  'res/drawable/call_btn_answer_bg.xml',
  'res/drawable/call_btn_decline_bg.xml',
  'res/drawable/call_btn_answer_circle.xml',
  'res/drawable/call_btn_decline_circle.xml',
  'res/drawable/call_btn_end_circle.xml',
  'res/drawable/call_control_circle.xml',
  'res/drawable/call_card_bg.xml',
  'res/drawable/call_swipe_pill_bg.xml',
  'res/drawable/call_action_btn_bg.xml',
  'res/drawable/call_decor_circle.xml',
  'res/drawable/call_pulse_ring.xml',
];

const CALL_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.WAKE_LOCK',
  'android.permission.DISABLE_KEYGUARD',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

function copyCallNative(projectRoot) {
  const androidJava = path.join(
    projectRoot, 'android', 'app', 'src', 'main', 'java', 'vn', 'tubeppro', 'sxmobile',
  );
  const resRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

  for (const rel of CALL_FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  for (const rel of RES_FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(resRoot, rel.replace(/^res[\\/]/, ''));
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function withIncomingCallManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    if (!manifest.manifest.$) manifest.manifest.$ = {};
    manifest.manifest.$['xmlns:tools'] =
      manifest.manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    for (const name of CALL_PERMISSIONS) {
      if (!permNames.has(name)) perms.push({ $: { 'android:name': name } });
    }
    manifest.manifest['uses-permission'] = perms;

    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$?.['android:name'] === '.call.IncomingCallActivity')) {
      app.activity.push({
        $: {
          'android:name': '.call.IncomingCallActivity',
          'android:exported': 'false',
          'android:theme': '@style/Theme.IncomingCall',
          'android:launchMode': 'singleTop',
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:taskAffinity': '',
          'android:configChanges': 'orientation|screenSize|keyboardHidden|uiMode',
        },
      });
    }

    app.service = app.service || [];
    const addService = (name, type) => {
      if (app.service.some((s) => s.$?.['android:name'] === name)) return;
      const $ = { 'android:name': name, 'android:exported': 'false' };
      if (type) $['android:foregroundServiceType'] = type;
      app.service.push({ $ });
    };
    addService('.call.IncomingCallRingService', 'mediaPlayback');
    addService('.call.InCallForegroundService', 'microphone');

    app.receiver = app.receiver || [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.call.IncomingCallActionReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.call.IncomingCallActionReceiver', 'android:exported': 'false' },
      });
    }

    return cfg;
  });
}

function withIncomingCallAndroid(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyCallNative(c.modRequest.projectRoot);
      return c;
    },
  ]);
  cfg = withIncomingCallManifest(cfg);
  return cfg;
}

module.exports = withIncomingCallAndroid;
