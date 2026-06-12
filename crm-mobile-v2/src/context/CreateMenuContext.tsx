import React, { createContext, useContext, useMemo, useState } from 'react';

type CreateMenuCtx = {
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const Ctx = createContext<CreateMenuCtx | null>(null);

export function CreateMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<CreateMenuCtx>(
    () => ({
      open,
      toggle: () => setOpen((v) => !v),
      close: () => setOpen(false),
    }),
    [open],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCreateMenu(): CreateMenuCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCreateMenu phải nằm trong CreateMenuProvider');
  return v;
}
