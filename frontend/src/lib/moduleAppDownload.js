/** Cấu hình trang Tải app theo module — khớp mobile_apps.app_key trên server. */
export const MODULE_APP_DOWNLOAD = {
  crm: {
    appKey: 'crm-mobile-v2',
    title: 'CRM Mobile',
    subtitle: 'Ứng dụng CRM trên điện thoại Android',
    emoji: '📱',
    accent: 'blue',
    packageName: 'vn.tubeppro.crmobilev2',
    installHint: 'Tải file APK, mở và cho phép «Cài đặt từ nguồn không xác định» nếu máy hỏi.',
  },
  sx: {
    appKey: 'sx-mobile',
    title: 'App Xưởng SX',
    subtitle: 'Ứng dụng Sản xuất / xưởng trên điện thoại Android',
    emoji: '🏭',
    accent: 'emerald',
    packageName: 'vn.tubeppro.sxmobile',
    installHint: 'Tải file APK, mở và cho phép «Cài đặt từ nguồn không xác định» nếu máy hỏi.',
  },
};

export function getModuleAppDownloadConfig(module) {
  return MODULE_APP_DOWNLOAD[module] || null;
}
