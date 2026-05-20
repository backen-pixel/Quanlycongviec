import { useEffect, useRef } from 'react';
import { sendDevicePing } from '../lib/deviceHeartbeat';

const PING_MS = 60 * 1000;

/** Ping /devices/ping mỗi 60s để cập nhật trạng thái online cho thiết bị này. */
export function useDeviceHeartbeat(enabled) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return undefined;

    sendDevicePing({ isLogin: true });

    const id = setInterval(() => {
      if (enabledRef.current) sendDevicePing({});
    }, PING_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        sendDevicePing({});
      }
    };
    const onFocus = () => {
      if (enabledRef.current) sendDevicePing({});
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);
}
