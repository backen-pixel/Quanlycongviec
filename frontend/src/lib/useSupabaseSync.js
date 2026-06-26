import { useSyncExternalStore } from 'react';
import { getSupabaseSyncState, subscribeSupabaseSync } from './supabaseSyncStore';

export function useSupabaseSync() {
  return useSyncExternalStore(subscribeSupabaseSync, getSupabaseSyncState, getSupabaseSyncState);
}
