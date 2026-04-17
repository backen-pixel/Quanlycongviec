import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { promptAppPermissionsIfNeeded } from '../lib/appPermissions';

/**
 * Sau khi đăng nhập: kiểm tra micro + thông báo; mỗi lần app vào foreground vẫn kiểm tra lại nếu chưa đủ.
 */
export default function PermissionBootstrap() {
  const { token, loading } = useAuth();
  const lastPromptRef = useRef(0);

  useEffect(() => {
    if (loading || !token) return;

    const maybePrompt = () => {
      const now = Date.now();
      if (now - lastPromptRef.current < 1500) return;
      lastPromptRef.current = now;
      promptAppPermissionsIfNeeded();
    };

    maybePrompt();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybePrompt();
    });
    return () => sub.remove();
  }, [loading, token]);

  return null;
}
