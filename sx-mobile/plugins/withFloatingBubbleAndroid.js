/**
 * Expo config plugin — copy native overlay bubble (đồng bộ crm-mobile-v2) vào android/ khi prebuild.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const SOURCE_ROOT = path.join(__dirname, 'native-android');
const OVERLAY_FILES = [
  'overlay/OverlayBubbleService.kt',
  'overlay/OverlayChatPanel.kt',
  'overlay/OverlayChatTheme.kt',
  'overlay/BubbleChatApi.kt',
  'overlay/BubbleComposeBridge.kt',
  'overlay/BubbleComposeActivity.kt',
  'overlay/BubbleMediaBridge.kt',
  'overlay/BubbleMediaPickerActivity.kt',
  'overlay/FloatingBubbleBridge.kt',
  'overlay/FloatingBubbleModule.kt',
  'overlay/FloatingBubbleOverlayPackage.kt',
  'overlay/BubbleFcmWake.kt',
  'overlay/SxFirebaseMessagingService.kt',
  'MainActivity.kt',
  'MainApplication.kt',
];

const RES_FILES = [
  'res/values/ids.xml',
  'res/values/styles_bubble.xml',
  'res/xml/bubble_file_paths.xml',
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
  const resRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

  for (const rel of OVERLAY_FILES) {
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

function withFloatingBubbleManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    if (!manifest.manifest.$) manifest.manifest.$ = {};
    manifest.manifest.$['xmlns:tools'] =
      manifest.manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const perms = manifest.manifest['uses-permission'] || [];
    const permNames = new Set(perms.map((p) => p.$?.['android:name']));
    for (const name of [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
    ]) {
      if (!permNames.has(name)) perms.push({ $: { 'android:name': name } });
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

    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$?.['android:name'] === '.overlay.BubbleComposeActivity')) {
      app.activity.push({
        $: {
          'android:name': '.overlay.BubbleComposeActivity',
          'android:exported': 'false',
          'android:launchMode': 'singleTop',
          'android:theme': '@style/Theme.BubbleCompose',
          'android:windowSoftInputMode': 'adjustResize',
          'android:excludeFromRecents': 'true',
          'android:taskAffinity': 'vn.tubeppro.sxmobile.bubblecompose',
        },
      });
    }

    if (!app.activity.some((a) => a.$?.['android:name'] === '.overlay.BubbleMediaPickerActivity')) {
      app.activity.push({
        $: {
          'android:name': '.overlay.BubbleMediaPickerActivity',
          'android:exported': 'false',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
          'android:excludeFromRecents': 'true',
          'android:taskAffinity': 'vn.tubeppro.sxmobile.bubblepicker',
        },
      });
    }

    app.provider = app.provider || [];
    if (!app.provider.some((p) => String(p.$?.['android:authorities'] || '').includes('bubblefileprovider'))) {
      app.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': '${applicationId}.bubblefileprovider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/bubble_file_paths',
            },
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
