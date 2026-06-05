/**
 * Copy google-services.json → android/app/ khi prebuild hoặc build local.
 * File nguồn: crm-mobile/google-services.json (tải từ Firebase Console).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');

const PACKAGE = 'vn.tubeppro.crmobile';
const SOURCE_NAME = 'google-services.json';

function findSource(projectRoot) {
  const candidates = [
    path.join(projectRoot, SOURCE_NAME),
    path.join(projectRoot, 'android', 'app', SOURCE_NAME),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function validateGoogleServices(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const clients = json.client;
    if (!Array.isArray(clients) || !clients.length) {
      return 'Thiếu mảng client trong google-services.json';
    }
    const pkg = clients[0]?.client_info?.android_client_info?.package_name;
    if (pkg !== PACKAGE) {
      return `package_name phải là "${PACKAGE}", hiện tại: "${pkg || '(trống)'}"`;
    }
    return null;
  } catch (e) {
    return `JSON không hợp lệ: ${e.message}`;
  }
}

function copyGoogleServices(projectRoot) {
  const src = findSource(projectRoot);
  if (!src) {
    console.warn(
      `[withGoogleServices] Chưa có ${SOURCE_NAME}. ` +
        'Tải từ Firebase Console → Add app Android → package vn.tubeppro.crmobile. ' +
        'Chạy: npm run setup:google-services',
    );
    return false;
  }
  const err = validateGoogleServices(src);
  if (err) {
    console.warn(`[withGoogleServices] ${err}`);
    return false;
  }
  const dest = path.join(projectRoot, 'android', 'app', SOURCE_NAME);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[withGoogleServices] Đã copy → android/app/${SOURCE_NAME}`);
  return true;
}

function withGoogleServices(config) {
  let cfg = withDangerousMod(config, [
    'android',
    async (c) => {
      copyGoogleServices(c.modRequest.projectRoot);
      return c;
    },
  ]);

  cfg = withAppBuildGradle(cfg, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('com.google.gms.google-services')) {
      contents = contents.replace(
        /apply plugin: "com\.facebook\.react"\n/,
        'apply plugin: "com.facebook.react"\n\n' +
          'def googleServicesFile = file("google-services.json")\n' +
          'if (googleServicesFile.exists()) {\n' +
          '    apply plugin: "com.google.gms.google-services"\n' +
          '}\n',
      );
    }
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

module.exports = withGoogleServices;
