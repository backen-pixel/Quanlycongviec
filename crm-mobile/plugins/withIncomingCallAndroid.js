/**
 * Expo config plugin — copy native incoming-call sources vào android/ khi prebuild.
 * Giữ mã Kotlin trong repo dù thư mục android/ bị gitignore.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const FILES = [
  'call/IncomingCallHelper.kt',
  'call/IncomingCallActivity.kt',
  'call/IncomingCallActionReceiver.kt',
  'call/IncomingCallRingService.kt',
  'call/CallRejectApi.kt',
  'call/CrmFirebaseMessagingService.kt',
];

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
  for (const rel of FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function withIncomingCallAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      copyNativeCall(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

module.exports = withIncomingCallAndroid;
