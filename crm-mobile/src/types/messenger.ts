export type MessengerGroupListItem = {
  id: string;
  name?: string | null;
  raw_name?: string | null;
  /** Avatar nhóm (chỉ group chat, có thể null nếu chưa upload). */
  avatar?: string | null;
  is_direct?: boolean;
  peer_id?: string | null;
  /** Avatar URL/path của peer (chỉ chat 1-1). */
  peer_avatar?: string | null;
  crm_lead_id?: string | null;
  my_role?: string | null;
  message_count?: number;
  last_message_at?: string | null;
  /** Preview nội dung tin nhắn cuối (tối đa 100 ký tự). */
  last_message?: string | null;
  /** ID của user gửi tin cuối — dùng để hiển thị prefix "Bạn: " trong list. */
  last_user_id?: string | null;
  /** Số tin chưa đọc của user hiện tại trong nhóm này. */
  unread_count?: number;
};

/** Read receipt của 1 user trong 1 group. */
export type MessengerReadReceipt = {
  user_id: string;
  last_read_at: string;
};

export type MessengerMember = {
  id?: string;
  user_id: string;
  role?: string | null;
  user?: { id?: string; full_name?: string | null; email?: string | null; avatar?: string | null } | null;
};

export type MessengerGroupDetail = MessengerGroupListItem & {
  members?: MessengerMember[];
  is_direct?: boolean;
};

export type MessengerAttachment = {
  name?: string;
  url?: string;
  type?: string;
  size?: number;
};

export type MessengerReaction = {
  emoji?: string | null;
  user_id?: string | null;
  user?: { id?: string | null; full_name?: string | null } | null;
};

export type MessengerMessage = {
  id: string;
  group_id?: string;
  user_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_system?: boolean;
  message_type?: string | null;
  attachments?: MessengerAttachment[] | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  reply_to?: string | null;
  user?: { id?: string; full_name?: string | null; avatar?: string | null; is_bot?: boolean | null } | null;
  reactions?: MessengerReaction[] | null;
  /** Tin đã thu hồi — content/attachments sẽ bị wipe phía server. */
  is_recalled?: boolean | null;
  recalled_at?: string | null;
};
