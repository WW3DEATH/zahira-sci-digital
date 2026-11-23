/**
 * Utilities for parsing YouTube URLs, extracting video IDs, formatting
 * playback timestamps, and building resilient thumbnails.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts a valid 11-character YouTube video ID from standard watch, short,
 * live, shorts, or embed URLs, or a raw 11-char ID.
 */
export function extractYouTubeVideoId(rawInput: string): string | null {
  const input = (rawInput || '').trim();
  if (!input) return null;

  if (YOUTUBE_ID_REGEX.test(input)) {
    return input;
  }

  let normalized = input;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      const vParam = parsed.searchParams.get('v');
      if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
        return vParam;
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        ['embed', 'shorts', 'live', 'v', 'e'].includes(segments[0]) &&
        YOUTUBE_ID_REGEX.test(segments[1])
      ) {
        return segments[1];
      }
    }
  } catch {
    // Fallback regex scan for partial pasted URLs
    const match = input.match(/(?:v=|youtu\.be\/|youtube\.com\/(?:embed|live|shorts)\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extracts optional start time (?t=120 or ?t=1m30s or ?start=90) in seconds.
 */
export function extractYouTubeStartSeconds(rawInput: string): number {
  const input = (rawInput || '').trim();
  if (!input) return 0;

  let normalized = input;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const tVal = parsed.searchParams.get('t') || parsed.searchParams.get('start') || '';
    if (!tVal) return 0;
    if (/^\d+$/.test(tVal)) return Math.max(0, parseInt(tVal, 10));

    let total = 0;
    const hMatch = tVal.match(/(\d+)h/i);
    const mMatch = tVal.match(/(\d+)m/i);
    const sMatch = tVal.match(/(\d+)s/i);
    if (hMatch) total += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) total += parseInt(mMatch[1], 10) * 60;
    if (sMatch) total += parseInt(sMatch[1], 10);
    return total;
  } catch {
    return 0;
  }
}

/**
 * Formats seconds as H:MM:SS (when >= 1 hour) or M:SS / 0:MM:SS cleanly
 * matching the sample player's `0:09:25` / `-4:10:32` / `4:19:58` style.
 */
export function formatVideoDuration(totalSeconds: number, padHoursZero = false): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return padHoursZero ? '0:00:00' : '0:00';
  }
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  if (hours > 0 || padHoursZero) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parses a human duration label like "4:19:58" or "42:15" back to seconds.
 */
export function parseDurationLabelToSeconds(label?: string): number {
  if (!label) return 0;
  const parts = label
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
