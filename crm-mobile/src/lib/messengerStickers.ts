/** Microsoft Fluent Emoji 3D — đồng bộ với web (LeadChatTabs.jsx). */
export const STICKER_PREFIX = ':sticker:';

export type StickerItem = { emoji: string; name: string };

export const STICKER_PACK: StickerItem[] = [
  { emoji: '😀', name: 'Grinning face' },
  { emoji: '😃', name: 'Grinning face with big eyes' },
  { emoji: '😄', name: 'Grinning face with smiling eyes' },
  { emoji: '😁', name: 'Beaming face with smiling eyes' },
  { emoji: '😂', name: 'Face with tears of joy' },
  { emoji: '🤣', name: 'Rolling on the floor laughing' },
  { emoji: '😅', name: 'Grinning face with sweat' },
  { emoji: '😊', name: 'Smiling face with smiling eyes' },
  { emoji: '😍', name: 'Smiling face with heart-eyes' },
  { emoji: '🥰', name: 'Smiling face with hearts' },
  { emoji: '😘', name: 'Face blowing a kiss' },
  { emoji: '🤩', name: 'Star-struck' },
  { emoji: '🥳', name: 'Partying face' },
  { emoji: '😎', name: 'Smiling face with sunglasses' },
  { emoji: '🤓', name: 'Nerd face' },
  { emoji: '🥸', name: 'Disguised face' },
  { emoji: '🤔', name: 'Thinking face' },
  { emoji: '🙄', name: 'Face with rolling eyes' },
  { emoji: '😏', name: 'Smirking face' },
  { emoji: '😴', name: 'Sleeping face' },
  { emoji: '😪', name: 'Sleepy face' },
  { emoji: '🥱', name: 'Yawning face' },
  { emoji: '🤤', name: 'Drooling face' },
  { emoji: '😭', name: 'Loudly crying face' },
  { emoji: '😢', name: 'Crying face' },
  { emoji: '😱', name: 'Face screaming in fear' },
  { emoji: '🥺', name: 'Pleading face' },
  { emoji: '😡', name: 'Pouting face' },
  { emoji: '🤬', name: 'Face with symbols on mouth' },
  { emoji: '🤯', name: 'Exploding head' },
  { emoji: '🥵', name: 'Hot face' },
  { emoji: '🥶', name: 'Cold face' },
  { emoji: '🤢', name: 'Nauseated face' },
  { emoji: '🤮', name: 'Face vomiting' },
  { emoji: '🤧', name: 'Sneezing face' },
  { emoji: '😷', name: 'Face with medical mask' },
  { emoji: '🤒', name: 'Face with thermometer' },
  { emoji: '😈', name: 'Smiling face with horns' },
  { emoji: '👹', name: 'Ogre' },
  { emoji: '👻', name: 'Ghost' },
  { emoji: '💀', name: 'Skull' },
  { emoji: '🤡', name: 'Clown face' },
  { emoji: '🤖', name: 'Robot' },
  { emoji: '👽', name: 'Alien' },
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '👎', name: 'Thumbs down' },
  { emoji: '👏', name: 'Clapping hands' },
  { emoji: '🙏', name: 'Folded hands' },
  { emoji: '🙌', name: 'Raising hands' },
  { emoji: '💪', name: 'Flexed biceps' },
  { emoji: '🤝', name: 'Handshake' },
  { emoji: '🤞', name: 'Crossed fingers' },
  { emoji: '👌', name: 'OK hand' },
  { emoji: '🤙', name: 'Call me hand' },
  { emoji: '✌️', name: 'Victory hand' },
  { emoji: '❤️', name: 'Red heart' },
  { emoji: '💔', name: 'Broken heart' },
  { emoji: '💖', name: 'Sparkling heart' },
  { emoji: '💕', name: 'Two hearts' },
  { emoji: '💝', name: 'Heart with ribbon' },
  { emoji: '💯', name: 'Hundred points' },
  { emoji: '🔥', name: 'Fire' },
  { emoji: '✨', name: 'Sparkles' },
  { emoji: '🌟', name: 'Glowing star' },
  { emoji: '⭐', name: 'Star' },
  { emoji: '🎉', name: 'Party popper' },
  { emoji: '🎊', name: 'Confetti ball' },
  { emoji: '🎁', name: 'Wrapped gift' },
  { emoji: '🎂', name: 'Birthday cake' },
  { emoji: '🍰', name: 'Shortcake' },
  { emoji: '🎈', name: 'Balloon' },
  { emoji: '🌹', name: 'Rose' },
  { emoji: '🌸', name: 'Cherry blossom' },
  { emoji: '☕', name: 'Hot beverage' },
  { emoji: '🍵', name: 'Teacup without handle' },
  { emoji: '🍻', name: 'Clinking beer mugs' },
  { emoji: '🥂', name: 'Clinking glasses' },
  { emoji: '🍕', name: 'Pizza' },
  { emoji: '🍔', name: 'Hamburger' },
  { emoji: '🍦', name: 'Soft ice cream' },
  { emoji: '🚀', name: 'Rocket' },
  { emoji: '🏆', name: 'Trophy' },
  { emoji: '🥇', name: '1st place medal' },
  { emoji: '🎯', name: 'Bullseye' },
  { emoji: '🌈', name: 'Rainbow' },
  { emoji: '☀️', name: 'Sun' },
  { emoji: '🌙', name: 'Crescent moon' },
  { emoji: '❄️', name: 'Snowflake' },
];

export const STICKER_BY_EMOJI = new Map(STICKER_PACK.map((s) => [s.emoji, s]));

export function fluentStickerUrl(name: string): string {
  const folder = encodeURIComponent(name);
  const file = name.toLowerCase().replace(/\s+/g, '_');
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${folder}/3D/${file}_3d.png`;
}

export function buildStickerContent(emoji: string): string {
  return `${STICKER_PREFIX}${emoji}`;
}

export function stripStickerPrefix(text: string): string {
  return String(text || '').slice(STICKER_PREFIX.length).trim();
}
