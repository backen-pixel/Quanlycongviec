/**
 * Android intent-filter: nhiều <data mimeType> trong CÙNG một filter = AND (không khớp được).
 * expo-share-intent gộp audio/* + octet-stream + video/mp4 → app không hiện trong Share sheet.
 * Plugin này tạo từng filter riêng cho mỗi MIME (OR).
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const SEND_MIME_TYPES = [
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

function withAndroidShareIntentFilters(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    const kept = (mainActivity['intent-filter'] || []).filter((f) => !isShareIntentFilter(f));

    const shareFilters = SEND_MIME_TYPES.map(buildSendFilter);
    shareFilters.push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:mimeType': 'audio/*' } }],
    });

    mainActivity['intent-filter'] = kept.concat(shareFilters);
    return cfg;
  });
}

module.exports = withAndroidShareIntentFilters;
