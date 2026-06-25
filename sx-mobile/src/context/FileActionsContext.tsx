import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import FileActionsSheet from '../components/messenger/FileActionsSheet';
import type { FileActionTarget } from '../lib/messengerFileOpen';
import { registerFileActionsPrompt } from '../lib/messengerFileOpen';

type Ctx = {
  promptFileActions: (url: string, opts?: Omit<FileActionTarget, 'url'>) => void;
};

const FileActionsContext = createContext<Ctx | null>(null);

export function FileActionsProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<FileActionTarget | null>(null);

  const promptFileActions = useCallback((url: string, opts?: Omit<FileActionTarget, 'url'>) => {
    setFile({ url, name: opts?.name, mime: opts?.mime });
  }, []);

  useEffect(() => {
    registerFileActionsPrompt(promptFileActions);
    return () => registerFileActionsPrompt(null);
  }, [promptFileActions]);

  const value = useMemo(() => ({ promptFileActions }), [promptFileActions]);

  return (
    <FileActionsContext.Provider value={value}>
      {children}
      <FileActionsSheet visible={!!file} file={file} onDismiss={() => setFile(null)} />
    </FileActionsContext.Provider>
  );
}

export function useFileActions(): Ctx {
  const ctx = useContext(FileActionsContext);
  if (!ctx) throw new Error('useFileActions must be used within FileActionsProvider');
  return ctx;
}
