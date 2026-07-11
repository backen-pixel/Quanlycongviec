/** MIME cho upload voice — dùng khi DocumentPicker không trả mime. */
export function guessAudioMimeFromFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/m4a';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.amr')) return 'audio/amr';
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) return 'audio/3gpp';
  if (lower.endsWith('.opus')) return 'audio/opus';
  return 'application/octet-stream';
}
