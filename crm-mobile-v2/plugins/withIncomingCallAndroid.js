/**
 * Expo config plugin — copy native cuộc gọi (WebRTC + màn khóa) vào android/ khi prebuild.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const JAVA_PKG = ['vn', 'tubeppro', 'crmobilev2'];

const OVERLAY_FILES = [
  'overlay/OverlayBubbleService.kt',
  'overlay/OverlayChatPanel.kt',
  'overlay/BubbleChatApi.kt',
  'overlay/FloatingBubbleBridge.kt',
  'overlay/FloatingBubbleModule.kt',
  'overlay/FloatingBubbleOverlayPackage.kt',
  'overlay/BubbleFcmWake.kt',
];

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
  'call/CrmFirebaseMessagingService.kt',
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
  'res/values/ids.xml',
];

const APP_FILES = ['MainActivity.kt', 'MainApplication.kt'];

const CALL_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.CAMERA',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.WAKE_LOCK',
  'android.permission.DISABLE_KEYGUARD',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

function copyCallNative(projectRoot) {
  const androidJava = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...JAVA_PKG);
  const resRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

  for (const rel of [...CALL_FILES, ...OVERLAY_FILES, ...APP_FILES]) {
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
          'android:taskAffinity': 'vn.tubeppro.crmobilev2.call',
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

    if (!app.service.some((s) => s.$?.['android:name'] === '.overlay.OverlayBubbleService')) {
      app.service.push({
        $: {
          'android:name': '.overlay.OverlayBubbleService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'chat_bubble_overlay',
            },
          },
        ],
      });
    }

    // Thay ExpoFirebaseMessagingService mặc định — thêm xử lý incoming_call native.
    app.service = app.service.filter((s) => {
      const n = String(s.$?.['android:name'] || '');
      return n !== '.call.CrmFirebaseMessagingService'
        && n !== 'vn.tubeppro.crmobilev2.call.CrmFirebaseMessagingService';
    });
    const hasRemoveExpo = app.service.some(
      (s) => s.$?.['android:name'] === 'expo.modules.notifications.service.ExpoFirebaseMessagingService'
        && s.$?.['tools:node'] === 'remove',
    );
    if (!hasRemoveExpo) {
      app.service.push({
        $: {
          'android:name': 'expo.modules.notifications.service.ExpoFirebaseMessagingService',
          'tools:node': 'remove',
        },
      });
    }
    if (!app.service.some((s) => String(s.$?.['android:name'] || '').includes('CrmFirebaseMessagingService'))) {
      app.service.push({
        $: {
          'android:name': '.call.CrmFirebaseMessagingService',
          'android:exported': 'false',
        },
        'intent-filter': [{
          $: { 'android:priority': '1' },
          action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
        }],
      });
    }

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
  cfg = withAppBuildGradle(cfg, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('firebase-messaging')) {
      contents = contents.replace(
        /implementation\("com\.facebook\.react:react-android"\)/,
        'implementation("com.facebook.react:react-android")\n' +
          '    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))\n' +
          '    implementation("com.google.firebase:firebase-messaging")',
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
  return cfg;
}

module.exports = withIncomingCallAndroid;
