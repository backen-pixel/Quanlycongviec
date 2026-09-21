/**
 * Giảm dung lượng APK release:
 * - .so không nén, map thẳng từ APK (khởi động nhanh, ít tốn bộ nhớ máy)
 * - R8 minify + shrink resources
 * - nén JS bundle
 * - tắt Fresco GIF (app không dùng GIF)
 */
const { withGradleProperties } = require('@expo/config-plugins');

const PROPS = {
  'expo.useLegacyPackaging': 'false',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'android.enableBundleCompression': 'true',
  'expo.gif.enabled': 'false',
};

function upsertProp(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

function withApkSizeOptimizations(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    for (const [key, value] of Object.entries(PROPS)) {
      upsertProp(props, key, value);
    }
    return cfg;
  });
}

module.exports = withApkSizeOptimizations;
