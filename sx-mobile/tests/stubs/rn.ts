/** Stub react-native cho test Node — chỉ đủ để import module logic thuần. */
export const Alert = { alert: () => {} };
export const Linking = { openURL: async () => {} };
export const Platform = { OS: 'android', select: (o: Record<string, unknown>) => o.android };
export default { Alert, Linking, Platform };
