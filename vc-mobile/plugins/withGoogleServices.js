/**
 * Copy google-services.json → android/app/ khi prebuild.
 * Cần file vc-mobile/google-services.json (package vn.tubeppro.vcmobile).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');

const PACKAGE = 'vn.tubeppro.vcmobile';
const SOURCE_NAME = 'google-services.json';

function findSource(projectRoot) {
  const candidates = [
    path.join(projectRoot, SOURCE_NAME),
    path.join(projectRoot, 'android', 'app', SOURCE_NAME),
    path.join(projectRoot, '..', 'crm-mobile', SOURCE_NAME),
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
    const match = clients.find(
      (c) => c?.client_info?.android_client_info?.package_name === PACKAGE,
    );
    if (!match) {
      return `Chưa có client cho package "${PACKAGE}" — thêm app Android trong Firebase Console (project tubep-crm) rồi tải lại google-services.json`;
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
      `[withGoogleServices] Chưa có ${SOURCE_NAME} cho ${PACKAGE}. ` +
        'Firebase Console → thêm app Android vn.tubeppro.vcmobile → tải google-services.json vào vc-mobile/',
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
    mod.modResults.contents = contents;
    return mod;
  });

  return cfg;
}

module.exports = withGoogleServices;
