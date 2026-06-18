/**
 * Chỉ build native libs arm64-v8a — APK nhỏ hơn (~40–55 MB), đủ cho điện thoại hiện đại.
 */
const { withGradleProperties } = require('@expo/config-plugins');

function withArm64Apk(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const key = 'reactNativeArchitectures';
    const existing = props.find((p) => p.type === 'property' && p.key === key);
    if (existing) existing.value = 'arm64-v8a';
    else props.push({ type: 'property', key, value: 'arm64-v8a' });
    return cfg;
  });
}

module.exports = withArm64Apk;
