export type FileForwardContext = {
  excludeGroupId?: string;
  sourceTitle?: string;
};

let forwardContext: FileForwardContext | null = null;

export function setMessengerFileForwardContext(ctx: FileForwardContext | null): void {
  forwardContext = ctx;
}

export function getMessengerFileForwardContext(): FileForwardContext | null {
  return forwardContext;
}
