/**
 * Android ACTION_SEND — mỗi mimeType một intent-filter riêng (OR, không AND).
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @param {{ mimeTypes?: string[] }} props
 */
const path = require('path');

function loadConfigPlugins() {
  const searchPaths = [
    process.cwd(),
    path.resolve(__dirname, '../../../crm-mobile-v2'),
    path.resolve(__dirname, '../../../sx-mobile'),
  ];
  return require(require.resolve('@expo/config-plugins', { paths: searchPaths }));
}

const { withAndroidManifest, AndroidConfig } = loadConfigPlugins();

const DEFAULT_SEND_MIME_TYPES = [
  'audio/*',
  'application/octet-stream',
  'video/mp4',
  'video/*',
  '*/*',
];

function isShareIntentFilter(filter) {
  const actions = [filter.action].flat().filter(Boolean);
  return actions.some((a) => {
    const name = a.$?.['android:name'] || '';
    return name === 'android.intent.action.SEND' || name === 'android.intent.action.SEND_MULTIPLE';
  });
}

function buildSendFilter(mimeType) {
  return {
    action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    data: [{ $: { 'android:mimeType': mimeType } }],
  };
}

function withAndroidShareIntentFilters(config, props = {}) {
  const mimeTypes = Array.isArray(props.mimeTypes) && props.mimeTypes.length
    ? props.mimeTypes
    : DEFAULT_SEND_MIME_TYPES;

  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    const kept = (mainActivity['intent-filter'] || []).filter((f) => !isShareIntentFilter(f));

    const shareFilters = mimeTypes.map(buildSendFilter);
    if (mimeTypes.some((m) => String(m).startsWith('audio/'))) {
      shareFilters.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'audio/*' } }],
      });
    }

    mainActivity['intent-filter'] = kept.concat(shareFilters);
    return cfg;
  });
}

module.exports = withAndroidShareIntentFilters;
