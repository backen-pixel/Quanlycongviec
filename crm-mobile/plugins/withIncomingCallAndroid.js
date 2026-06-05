/**
 * Expo config plugin — copy native incoming-call sources vào android/ khi prebuild.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const CALL_FILES = [
  'call/IncomingCallHelper.kt',
  'call/IncomingCallActivity.kt',
  'call/IncomingCallActionReceiver.kt',
  'call/IncomingCallRingService.kt',
  'call/InCallForegroundService.kt',
  'call/CallRejectApi.kt',
  'call/PushTokenRegistrar.kt',
  'call/CrmFirebaseMessagingService.kt',
  'call/LockScreenCallBridge.kt',
  'call/LockScreenCallModule.kt',
  'call/LockScreenCallPackage.kt',
];
const APP_FILES = ['MainActivity.kt', 'MainApplication.kt'];

function copyNativeCall(projectRoot) {
  const androidJava = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'vn',
    'tubeppro',
    'crmobile',
  );
  for (const rel of [...CALL_FILES, ...APP_FILES]) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function withIncomingCallAndroidManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    if (!permNames.has('android.permission.FOREGROUND_SERVICE_MICROPHONE')) {
      perms.push({ $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_MICROPHONE' } });
    }
    manifest.manifest['uses-permission'] = perms;

    app.service = app.service || [];
    const hasInCall = app.service.some(
      (s) => s.$?.['android:name'] === '.call.InCallForegroundService',
    );
    if (!hasInCall) {
      app.service.push({
        $: {
          'android:name': '.call.InCallForegroundService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
    }
    return cfg;
  });
}

function withIncomingCallAndroid(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyNativeCall(c.modRequest.projectRoot);
      return c;
    },
  ]);
  cfg = withIncomingCallAndroidManifest(cfg);
  return cfg;
}

module.exports = withIncomingCallAndroid;
