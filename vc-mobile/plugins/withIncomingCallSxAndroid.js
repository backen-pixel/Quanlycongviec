/**
 * Expo config plugin — copy native incoming-call vào android/ (Xưởng SX).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const PACKAGE = 'vn.tubeppro.vcmobile';
const CALL_FILES = [
  'MainActivity.kt',
  'call/IncomingCallHelper.kt',
  'call/IncomingCallActivity.kt',
  'call/IncomingCallActionReceiver.kt',
  'call/IncomingCallRingService.kt',
  'call/InCallForegroundService.kt',
  'call/CallRejectApi.kt',
  'call/PushTokenRegistrar.kt',
  'call/LockScreenCallBridge.kt',
  'call/LockScreenCallModule.kt',
  'call/LockScreenCallPackage.kt',
];

function copyNativeCall(projectRoot) {
  const androidJava = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'vn', 'tubeppro', 'vcmobile');
  for (const rel of CALL_FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  const androidRes = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
  const sourceRes = path.join(SOURCE_ROOT, 'res');
  if (!fs.existsSync(sourceRes)) return;
  const copyResRecursive = (srcDir, destDir) => {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) copyResRecursive(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    }
  };
  copyResRecursive(sourceRes, androidRes);
}

function withIncomingCallSxManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    const addPerm = (name) => {
      if (!permNames.has(name)) perms.push({ $: { 'android:name': name } });
    };
    addPerm('android.permission.RECORD_AUDIO');
    addPerm('android.permission.MODIFY_AUDIO_SETTINGS');
    addPerm('android.permission.WAKE_LOCK');
    addPerm('android.permission.USE_FULL_SCREEN_INTENT');
    addPerm('android.permission.FOREGROUND_SERVICE_MICROPHONE');
    manifest.manifest['uses-permission'] = perms;

    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    app.service = app.service || [];
    const services = [
      { name: '.call.InCallForegroundService', type: 'microphone' },
      { name: '.call.IncomingCallRingService', type: 'mediaPlayback' },
    ];
    for (const svc of services) {
      if (!app.service.some((s) => s.$?.['android:name'] === svc.name)) {
        app.service.push({
          $: {
            'android:name': svc.name,
            'android:exported': 'false',
            'android:foregroundServiceType': svc.type,
          },
        });
      }
    }

    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$?.['android:name'] === '.call.IncomingCallActivity')) {
      app.activity.push({
        $: {
          'android:name': '.call.IncomingCallActivity',
          'android:exported': 'false',
          'android:launchMode': 'singleTop',
          'android:taskAffinity': `${PACKAGE}.call`,
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:theme': '@style/Theme.IncomingCall',
        },
      });
    } else {
      const callAct = app.activity.find((a) => a.$?.['android:name'] === '.call.IncomingCallActivity');
      if (callAct) {
        callAct.$['android:launchMode'] = 'singleTop';
        callAct.$['android:taskAffinity'] = `${PACKAGE}.call`;
        callAct.$['android:showWhenLocked'] = 'true';
        callAct.$['android:turnScreenOn'] = 'true';
      }
    }

    app.receiver = app.receiver || [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.call.IncomingCallActionReceiver')) {
      app.receiver.push({
        $: {
          'android:name': '.call.IncomingCallActionReceiver',
          'android:exported': 'false',
        },
      });
    }

    return cfg;
  });
}

function withIncomingCallSxAndroid(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyNativeCall(c.modRequest.projectRoot);
      return c;
    },
  ]);
  cfg = withIncomingCallSxManifest(cfg);
  return cfg;
}

module.exports = withIncomingCallSxAndroid;
