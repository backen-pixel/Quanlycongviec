import { Heart, ThumbsUp } from 'lucide-react';
import { REACTION_EMOJI } from '../lib/reactions';

/** Icon tròn kiểu Facebook (picker + tóm tắt) */
export default function ReactionCircle({ reactionKey, size = 'lg' }) {
  const wrap =
    size === 'lg'
      ? 'h-10 w-10 min-h-[2.5rem] min-w-[2.5rem]'
      : size === 'md'
        ? 'h-7 w-7 min-h-7 min-w-7'
        : 'h-[18px] w-[18px] min-h-[18px] min-w-[18px]';
  const thumb =
    size === 'lg' ? 'h-[22px] w-[22px]' : size === 'md' ? 'h-4 w-4' : 'h-2.5 w-2.5';
  const heart = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';
  const em =
    size === 'lg' ? 'text-[22px] leading-none' : size === 'md' ? 'text-sm leading-none' : 'text-[10px] leading-none';
  const ring = size === 'sm' ? 'border border-white shadow-sm' : 'border-2 border-white shadow-md';
  const base = `flex ${wrap} shrink-0 items-center justify-center rounded-full ${ring}`;

  switch (reactionKey) {
    case 'like':
      return (
        <span className={`${base} bg-[#1877f2]`} aria-hidden>
          <ThumbsUp className={`${thumb} text-white`} strokeWidth={2.2} fill="currentColor" />
        </span>
      );
    case 'love':
      return (
        <span className={`${base} bg-gradient-to-br from-pink-500 to-red-600`} aria-hidden>
          <Heart className={`${heart} text-white`} fill="currentColor" stroke="none" />
        </span>
      );
    case 'care':
      return (
        <span className={`${base} bg-amber-100 ${em}`} aria-hidden>
          {REACTION_EMOJI.care}
        </span>
      );
    case 'haha':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.haha}
        </span>
      );
    case 'wow':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.wow}
        </span>
      );
    case 'sad':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.sad}
        </span>
      );
    case 'angry':
      return (
        <span className={`${base} bg-gradient-to-b from-orange-500 to-red-700 ${em}`} aria-hidden>
          {REACTION_EMOJI.angry}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-[#1877f2]`} aria-hidden>
          <ThumbsUp className={`${thumb} text-white`} strokeWidth={2.2} fill="currentColor" />
        </span>
      );
  }
}
