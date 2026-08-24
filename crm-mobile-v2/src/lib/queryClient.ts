/**
 * Cache dùng chung (TanStack Query) cho KPI / board page / detail.
 *
 * Mặc định thiên về stale-while-revalidate: luôn trả dữ liệu cũ ngay rồi
 * refetch nền, để đổi tab/mở lại chi tiết không bị trắng màn.
 */
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

export const QUERY_STALE_MS = {
  /** KPI đổi chậm — 2 phút vẫn coi là tươi. */
  kpi: 2 * 60 * 1000,
  /** Trang cột board: 60s, khớp nhịp người dùng lướt qua lại. */
  boardPage: 60 * 1000,
  /** Đếm cột/bucket: 90s. */
  counts: 90 * 1000,
  /** Chi tiết: 45s, trùng TTL realtime cũ của LeadDealDetailScreen. */
  detail: 45 * 1000,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_MS.boardPage,
      gcTime: 15 * 60 * 1000,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnMount: 'always',
      refetchOnReconnect: true,
      // Mobile: focus do AppState quyết định (xem setupQueryAppBridges).
      refetchOnWindowFocus: true,
      // 'always': không để query bị pause khi NetInfo báo offline.
      // Pause = promise của fetchQuery không bao giờ settle → màn hình treo spinner
      // vì khối finally của caller không chạy. Thà để request lỗi rồi caller tự xử.
      networkMode: 'always',
    },
    mutations: { retry: 0, networkMode: 'always' },
  },
});

let bridged = false;

/** Nối AppState/NetInfo vào query cache. Gọi 1 lần khi app khởi động. */
export function setupQueryAppBridges(): () => void {
  if (bridged) return () => {};
  bridged = true;

  const onAppState = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const appSub = AppState.addEventListener('change', onAppState);

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );

  return () => {
    appSub.remove();
    bridged = false;
  };
}
