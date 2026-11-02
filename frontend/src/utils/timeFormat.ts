/**
 * Formats seconds into MM:SS or MM:SS.S, handling rounding cleanly without "0:60" bugs.
 */
export function formatTime(seconds: number, includeDecimals = true): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  
  if (includeDecimals) {
    const totalTenths = Math.round(seconds * 10);
    const totalSecs = Math.floor(totalTenths / 10);
    const dec = totalTenths % 10;
    const mins = Math.floor(totalSecs / 60);
    const remSecs = totalSecs % 60;
    const padded = remSecs.toString().padStart(2, '0');
    return dec > 0 ? `${mins}:${padded}.${dec}` : `${mins}:${padded}`;
  }

  const totalSecs = Math.round(seconds);
  const mins = Math.floor(totalSecs / 60);
  const remSecs = totalSecs % 60;
  const padded = remSecs.toString().padStart(2, '0');
  return `${mins}:${padded}`;
}

/**
 * Parses user input like "1:25.5", "01:25", "1:05:10", "85", "85.5" into numeric seconds.
 */
export function parseTime(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Format: MM:SS or HH:MM:SS
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (!isNaN(mins) && !isNaN(secs) && mins >= 0 && secs >= 0) {
        return Math.round((mins * 60 + secs) * 10) / 10;
      }
    } else if (parts.length === 3) {
      const hrs = parseFloat(parts[0]);
      const mins = parseFloat(parts[1]);
      const secs = parseFloat(parts[2]);
      if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs) && hrs >= 0 && mins >= 0 && secs >= 0) {
        return Math.round((hrs * 3600 + mins * 60 + secs) * 10) / 10;
      }
    }
  }

  // Format: plain seconds number e.g. "85.5"
  const val = parseFloat(trimmed);
  if (!isNaN(val) && val >= 0) {
    return Math.round(val * 10) / 10;
  }

  return null;
}
