/**
 * Expo config plugin — copy native overlay bubble vào android/ khi prebuild.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const OVERLAY_FILES = [
  'overlay/OverlayBubbleService.kt',
  'overlay/FloatingBubbleModule.kt',
  'overlay/FloatingBubbleOverlayPackage.kt',
  'overlay/BubbleFcmWake.kt',
  'overlay/SxFirebaseMessagingService.kt',
];

function copyOverlayNative(projectRoot) {
  const androidJava = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'vn',
    'tubeppro',
    'sxmobile',
  );
  for (const rel of OVERLAY_FILES) {
    const src = path.join(SOURCE_ROOT, rel);
    const dest = path.join(androidJava, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  const mainAppSrc = path.join(SOURCE_ROOT, 'MainApplication.kt');
  const mainAppDest = path.join(androidJava, 'MainApplication.kt');
  if (fs.existsSync(mainAppSrc)) {
    fs.copyFileSync(mainAppSrc, mainAppDest);
  }

  const idsSrc = path.join(SOURCE_ROOT, 'res', 'values', 'ids.xml');
  const idsDest = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'values', 'ids.xml');
  if (fs.existsSync(idsSrc)) {
    fs.mkdirSync(path.dirname(idsDest), { recursive: true });
    fs.copyFileSync(idsSrc, idsDest);
  }
}

function withFloatingBubbleManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    if (!manifest.manifest.$) manifest.manifest.$ = {};
    manifest.manifest.$['xmlns:tools'] =
      manifest.manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    if (!permNames.has('android.permission.SYSTEM_ALERT_WINDOW')) {
      perms.push({ $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } });
    }
    if (!permNames.has('android.permission.FOREGROUND_SERVICE')) {
      perms.push({ $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' } });
    }
    if (!permNames.has('android.permission.FOREGROUND_SERVICE_SPECIAL_USE')) {
      perms.push({ $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE' } });
    }
    manifest.manifest['uses-permission'] = perms;

    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    app.service = app.service || [];

    const hasSvc = app.service.some(
      (s) => s.$?.['android:name'] === '.overlay.OverlayBubbleService',
    );
    if (!hasSvc) {
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

    // ExpoFirebaseMessagingService được merge từ AAR lúc Gradle build — gỡ bằng tools:node
    // rồi đăng ký SxFirebaseMessagingService (kế thừa Expo, thêm bubble_wake).
    app.service = app.service.filter((s) => {
      const n = String(s.$?.['android:name'] || '');
      return (
        n !== '.overlay.SxFirebaseMessagingService'
        && n !== 'vn.tubeppro.sxmobile.overlay.SxFirebaseMessagingService'
      );
    });

    const hasRemoveExpo = app.service.some(
      (s) =>
        s.$?.['android:name'] === 'expo.modules.notifications.service.ExpoFirebaseMessagingService'
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

    const hasSx = app.service.some((s) =>
      String(s.$?.['android:name'] || '').includes('SxFirebaseMessagingService'),
    );
    if (!hasSx) {
      app.service.push({
        $: {
          'android:name': '.overlay.SxFirebaseMessagingService',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '1' },
            action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
          },
        ],
      });
    }

    return cfg;
  });
}

function withFloatingBubbleAndroid(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyOverlayNative(c.modRequest.projectRoot);
      return c;
    },
  ]);
  cfg = withFloatingBubbleManifest(cfg);
  cfg = withAppBuildGradle(cfg, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('firebase-messaging')) {
      contents = contents.replace(
        /implementation\("com\.facebook\.react:react-android"\)\n/,
        'implementation("com.facebook.react:react-android")\n' +
          '    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))\n' +
          '    implementation("com.google.firebase:firebase-messaging")\n',
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
  return cfg;
}

module.exports = withFloatingBubbleAndroid;
