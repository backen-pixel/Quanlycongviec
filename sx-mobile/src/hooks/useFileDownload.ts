import { useCallback, useState } from 'react';
import {
  saveMessengerAttachment,
  type DownloadProgressInfo,
  type SaveAttachmentResult,
} from '../lib/messengerFileOpen';

export type FileDownloadState = {
  visible: boolean;
  fileName: string;
  percent: number;
  phase: 'downloading' | 'saving' | 'done' | 'error';
  error: string;
  locationHint: string;
};

const IDLE: FileDownloadState = {
  visible: false,
  fileName: '',
  percent: 0,
  phase: 'downloading',
  error: '',
  locationHint: '',
};

export function useFileDownload() {
  const [state, setState] = useState<FileDownloadState>(IDLE);

  const close = useCallback(() => setState(IDLE), []);

  const download = useCallback(async (opts: {
    url: string;
    name?: string | null;
    mime?: string | null;
  }): Promise<SaveAttachmentResult | null> => {
    const fileName = String(opts.name || 'file');
    setState({
      visible: true,
      fileName,
      percent: 0,
      phase: 'downloading',
      error: '',
      locationHint: '',
    });

    try {
      const result = await saveMessengerAttachment(opts.url, {
        name: opts.name,
        mime: opts.mime,
        onProgress: (info: DownloadProgressInfo) => {
          const percent =
            info.phase === 'saving' || info.phase === 'done'
              ? 100
              : info.total > 0
                ? Math.round(info.ratio * 100)
                // Không có Content-Length: ước lượng theo MB đã tải (cap 95%)
                : Math.min(95, Math.round((info.written / (1024 * 1024)) * 8));
          setState((prev) => ({
            ...prev,
            percent,
            phase: info.phase === 'done' ? 'done' : info.phase,
          }));
        },
      });
      setState((prev) => ({
        ...prev,
        percent: 100,
        phase: 'done',
        locationHint: result.locationHint,
      }));
      return result;
    } catch (e) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: (e as Error)?.message || 'Không tải được file.',
      }));
      return null;
    }
  }, []);

  return { state, download, close };
}
