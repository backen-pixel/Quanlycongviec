import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type NetworkStatus = {
  /** false khi chắc chắn mất kết nối / không ra Internet. */
  isOnline: boolean;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

const NetworkStatusContext = createContext<NetworkStatus>({
  isOnline: true,
  isConnected: true,
  isInternetReachable: true,
});

function deriveOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    let mounted = true;
    const apply = (state: NetInfoState) => {
      if (!mounted) return;
      setStatus({
        isOnline: deriveOnline(state),
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
      });
    };
    void NetInfo.fetch().then(apply).catch(() => undefined);
    const unsub = NetInfo.addEventListener(apply);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const value = useMemo(() => status, [status]);
  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatus {
  return useContext(NetworkStatusContext);
}

/** true đúng một lần khi chuyển online → offline (để toast/banner nhấn mạnh). */
export function useWentOffline(): boolean {
  const { isOnline } = useNetworkStatus();
  const prev = useRef(isOnline);
  const [wentOffline, setWentOffline] = useState(false);

  useEffect(() => {
    if (prev.current && !isOnline) {
      setWentOffline(true);
      const t = setTimeout(() => setWentOffline(false), 3200);
      prev.current = isOnline;
      return () => clearTimeout(t);
    }
    prev.current = isOnline;
    if (isOnline) setWentOffline(false);
    return undefined;
  }, [isOnline]);

  return wentOffline;
}
