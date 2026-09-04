export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function createProgressBar(
  progressMs: number,
  durationMs: number,
  width = 24,
): string {
  const safeWidth = Math.max(1, Math.floor(width));
  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, progressMs / durationMs)) : 0;
  const completed = Math.round(ratio * safeWidth);
  return `${'━'.repeat(completed)}${'─'.repeat(safeWidth - completed)}`;
}
