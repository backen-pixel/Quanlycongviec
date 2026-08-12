/**
 * AppTheme.windowBackground = splash drawable (nền + logo) —
 * tránh màn đen trống khi MainActivity chuyển SplashScreen → AppTheme
 * trước khi React kịp vẽ BootLoadingScreen.
 */
const {
  withAndroidStyles,
  withAndroidColors,
  AndroidConfig,
} = require('@expo/config-plugins');

const SPLASH_BG = '#00071F';

function withSplashWindowBackground(config) {
  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'splashscreen_background',
      value: SPLASH_BG,
    });
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: 'activityBackground',
      value: SPLASH_BG,
    });
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      parent: {
        name: 'AppTheme',
        parent: 'Theme.AppCompat.DayNight.NoActionBar',
      },
      name: 'android:windowBackground',
      // Cùng drawable splash (có logo) — không chỉ màu đặc.
      value: '@drawable/ic_launcher_background',
    });
    return cfg;
  });

  return config;
}

module.exports = withSplashWindowBackground;
