export type MessengerThread = {
  id: string;
  name: string;
  preview: string;
  timeLabel: string;
  unread: number;
  online?: boolean;
  isGroup?: boolean;
  isDirect?: boolean;
  avatarColor?: string;
  avatarUrl?: string | null;
  peerId?: string | null;
  lastMessageAt?: string | null;
  lastUserId?: string | null;
  myUserId?: string | null;
};

export type MessengerReaction = {
  emoji: string;
  user_id?: string | null;
  user?: { id?: string; full_name?: string | null } | null;
};

export type MessengerReadReceipt = {
  user_id: string;
  last_read_at: string;
};

export type MessengerMessage = {
  id: string;
  group_id: string;
  user_id?: string | null;
  content: string;
  message_type?: string;
  created_at: string;
  is_system?: boolean;
  is_recalled?: boolean;
  recalled_at?: string | null;
  recalled_by?: string | null;
  reply_to?: string | null;
  reply_to_message?: MessengerMessage | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachments?: unknown[] | null;
  reactions?: MessengerReaction[] | null;
  user?: {
    id?: string;
    full_name?: string | null;
    avatar?: string | null;
  } | null;
};

export type MessengerGroupRow = Record<string, unknown>;

export type ChatMessage = {
  id: string;
  text: string;
  time: string;
  mine: boolean;
  read?: boolean;
  seenLabel?: string;
  raw?: MessengerMessage;
};

export type CallLogItem = {
  id: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed';
  kind: 'voice' | 'video';
  timeLabel: string;
  avatarColor?: string;
};
