/**
 * Khi CALLING_ENABLED=false: không link native WebRTC (~11 MB .so).
 * Bật lại cuộc gọi: xóa block này và khôi phục plugin @config-plugins/react-native-webrtc trong app.json.
 */
module.exports = {
  dependencies: {
    'react-native-webrtc': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
