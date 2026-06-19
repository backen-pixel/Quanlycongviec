import { groupSenderNameProps } from '../lib/messengerSenderColors';

/** Tên người gửi trong chat nhóm — radial gradient nhẹ, màu ổn định theo user_id. */
export default function GroupSenderName({
  userId,
  name,
  isBot = false,
  isGroupChat = true,
  className = '',
  children,
  as: Tag = 'span',
  title,
}) {
  const label = children ?? name;
  const props = groupSenderNameProps(userId, name, { isBot, isGroupChat });
  return (
    <Tag
      className={[props.className, className].filter(Boolean).join(' ')}
      style={props.style}
      title={title ?? (typeof label === 'string' ? label : name)}
    >
      {label}
    </Tag>
  );
}
