/** Constant arrays — tránh resubscribe socket mỗi lần render. */
export const REALTIME_BOARD_TASK = ['board', 'task'] as const;
export const REALTIME_BOARD_TASK_EVENT = ['board', 'task', 'event'] as const;
export const REALTIME_BOARD = ['board'] as const;
export const REALTIME_TASK = ['task'] as const;
export const REALTIME_COMMENT = ['comment'] as const;
export const REALTIME_EVENT = ['event'] as const;
export const REALTIME_LEAVE = ['leave'] as const;
