import { createContext } from 'react';

/**
 * Context tách riêng để identity không đổi khi Vite HMR reload `auth.jsx`
 * (file đó export cả AuthProvider lẫn useAuth — Fast Refresh dễ tạo AuthCtx mới
 * → useAuth ném "phải dùng bên trong AuthProvider" dù cây React vẫn còn Provider).
 *
 * globalThis: cùng một AuthCtx dù module bị load 2 lần (/src vs /@fs).
 */
const g = typeof globalThis !== 'undefined' ? globalThis : {};
export const AuthCtx = g.__QLCV_AUTH_CTX__ || createContext(null);
g.__QLCV_AUTH_CTX__ = AuthCtx;
