/**
 * Giảm dung lượng APK release:
 * - nén .so (legacy packaging)
 * - R8 minify + shrink resources
 * - nén JS bundle
 * - tắt Fresco GIF/WebP (Android hệ thống đã decode WebP)
 * - chỉ giữ locale vi/en
 * - loại font icon không dùng (app chỉ dùng Ionicons)
 */
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const PROPS = {
  'expo.useLegacyPackaging': 'true',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'android.enableBundleCompression': 'true',
  'expo.gif.enabled': 'false',
  'expo.webp.enabled': 'false',
  'expo.webp.animated': 'false',
};

const UNUSED_ICON_FONTS = [
  'AntDesign.ttf',
  'Entypo.ttf',
  'EvilIcons.ttf',
  'Feather.ttf',
  'FontAwesome.ttf',
  'FontAwesome5_Brands.ttf',
  'FontAwesome5_Regular.ttf',
  'FontAwesome5_Solid.ttf',
  'FontAwesome6_Brands.ttf',
  'FontAwesome6_Regular.ttf',
  'FontAwesome6_Solid.ttf',
  'Fontisto.ttf',
  'Foundation.ttf',
  'MaterialCommunityIcons.ttf',
  'MaterialIcons.ttf',
  'Octicons.ttf',
  'SimpleLineIcons.ttf',
  'Zocial.ttf',
];

function upsertProp(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

function applyAppBuildGradleSizeOpts(contents) {
  let next = contents;
  if (!next.includes('resourceConfigurations += ["en", "vi"]') && !next.includes("resourceConfigurations += ['en', 'vi']")) {
    next = next.replace(
      /defaultConfig\s*\{/,
      'defaultConfig {\n        resourceConfigurations += ["en", "vi"]',
    );
  }
  if (!next.includes('IoniconsOnlyPackaging')) {
    const excludes = UNUSED_ICON_FONTS.map((f) => `"**/${f}"`).join(',\n          ');
    next = next.replace(
      /packagingOptions\s*\{/,
      `packagingOptions {
        // IoniconsOnlyPackaging — app chỉ dùng Ionicons
        excludes += [
          ${excludes}
        ]`,
    );
  }
  return next;
}

function withApkSizeOptimizations(config) {
  let cfg = withGradleProperties(config, (mod) => {
    const props = mod.modResults;
    for (const [key, value] of Object.entries(PROPS)) {
      upsertProp(props, key, value);
    }
    return mod;
  });

  cfg = withAppBuildGradle(cfg, (mod) => {
    mod.modResults.contents = applyAppBuildGradleSizeOpts(mod.modResults.contents);
    return mod;
  });

  return cfg;
}

module.exports = withApkSizeOptimizations;
module.exports.applyAppBuildGradleSizeOpts = applyAppBuildGradleSizeOpts;
module.exports.UNUSED_ICON_FONTS = UNUSED_ICON_FONTS;
