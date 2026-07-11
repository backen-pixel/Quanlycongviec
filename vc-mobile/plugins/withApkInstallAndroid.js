/**
 * Quyền + native module cài APK in-app (Android 8+).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const INSTALL_FILES = [
  'install/ApkInstallModule.kt',
  'install/ApkInstallPackage.kt',
];

function copyInstallNative(projectRoot) {
  const androidJava = path.join(
    projectRoot, 'android', 'app', 'src', 'main', 'java', 'vn', 'tubeppro', 'vcmobile',
  );
  for (const rel of INSTALL_FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function withApkInstallManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    if (!permNames.has('android.permission.REQUEST_INSTALL_PACKAGES')) {
      perms.push({ $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' } });
    }
    manifest.manifest['uses-permission'] = perms;
    return cfg;
  });
}

function withApkInstallAndroid(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyInstallNative(c.modRequest.projectRoot);
      return c;
    },
  ]);
  cfg = withApkInstallManifest(cfg);
  return cfg;
}

module.exports = withApkInstallAndroid;
