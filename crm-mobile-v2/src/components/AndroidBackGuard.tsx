import { CommonActions } from '@react-navigation/native';
import React, { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { useCreateMenu } from '../context/CreateMenuContext';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Android hardware Back:
 * 1) Đóng sheet «Tạo mới» nếu đang mở
 * 2) Pop stack (Chat, CRM Hub, …)
 * 3) Ở tab khác → về Tổng quan
 * 4) Ở Tổng quan root → nhấn Back lần nữa trong 2s mới thoát app
 */
export default function AndroidBackGuard() {
  const { open, close } = useCreateMenu();
  const exitArmedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const armExit = () => {
      exitArmedRef.current = true;
      ToastAndroid.show('Nhấn Back lần nữa để thoát', ToastAndroid.SHORT);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        exitArmedRef.current = false;
      }, 2000);
    };

    const onBack = () => {
      if (openRef.current) {
        close();
        return true;
      }

      if (!navigationRef.isReady()) {
        return true;
      }

      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      const route = navigationRef.getCurrentRoute();
      const name = String(route?.name || '');
      if (name && name !== 'Overview') {
        navigationRef.dispatch(
          CommonActions.navigate({
            name: 'Tabs',
            params: { screen: 'Overview' },
          }),
        );
        return true;
      }

      if (exitArmedRef.current) {
        BackHandler.exitApp();
        return true;
      }
      armExit();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => {
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [close]);

  return null;
}
