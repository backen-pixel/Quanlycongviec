/**
 * Kiểu dữ liệu cho "Bảng tin nội bộ" — mirror backend `routes/internalSocial.js`
 * (xem `hydratePostsToResponse` ~ line 371).
 */

export type SocialAuthor = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
  position?: string | null;
};

export type SocialAttachment = {
  id: string;
  post_id?: string;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  sort_index?: number | null;
};

export type SocialReactionCounts = Record<string, number>;

export type SocialPost = {
  id: string;
  company_id?: string | null;
  author_id: string;
  body?: string | null;
  link_url?: string | null;
  link_title?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  visibility?: 'company' | 'selected_users' | 'selected_companies' | string | null;
  hidden_at?: string | null;
  deleted_at?: string | null;
  author?: SocialAuthor | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  my_reaction?: string | null;
  reaction_counts?: SocialReactionCounts;
  attachments?: SocialAttachment[];
  audience_users?: SocialAuthor[];
  audience_companies?: { id: string; name?: string | null; short_name?: string | null }[];
};

export type SocialComment = {
  id: string;
  post_id?: string | null;
  author_id: string;
  body?: string | null;
  parent_id?: string | null;
  created_at?: string | null;
  author?: SocialAuthor | null;
};

export type SocialFeedResponse = {
  posts: SocialPost[];
  next_offset?: number | null;
  has_more?: boolean;
};
