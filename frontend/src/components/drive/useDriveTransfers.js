import { useSyncExternalStore } from 'react';
import { subscribeDriveTransfers, getDriveTransferState } from './driveTransferStore';

export function useDriveTransfers() {
  return useSyncExternalStore(subscribeDriveTransfers, getDriveTransferState, getDriveTransferState);
}
