import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  ExternalLink,
  AlertCircle,
  Eye,
  TrendingUp,
} from 'lucide-react';
import { ClassRecording } from '../../types';
import {
  extractYouTubeStartSeconds,
  formatVideoDuration,
  getYouTubeThumbnailUrl,
  parseDurationLabelToSeconds,
} from '../../utils/youtubeUtils';
import {
  TeacherNameHoverTrigger,
  TeacherProfileSummary,
  formatRecordingViewCount,
} from './TeacherHoverCard';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates?: () => number[];
  setPlaybackQuality?: (quality: string) => void;
  getPlaybackQuality?: () => string;
  getAvailableQualityLevels?: () => string[];
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onPlaybackQualityChange?: (event: { data: string }) => void;
            onPlaybackRateChange?: (event: { data: number }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') prevCallback();
      resolve();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube Player API'));
      };
      document.head.appendChild(tag);
    }

    // Safety fallback poll in case callback fired before hook attached
    const checkTimer = window.setInterval(() => {
      if (window.YT && window.YT.Player) {
        window.clearInterval(checkTimer);
        resolve();
      }
    }, 150);

    window.setTimeout(() => {
      window.clearInterval(checkTimer);
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        ytApiPromise = null;
        reject(new Error('YouTube Player API timed out'));
      }
    }, 10000);
  });

  return ytApiPromise;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const QUALITY_DISPLAY_MAP: Record<string, string> = {
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
  small: '240p',
  auto: 'Auto',
};

const Rewind10Icon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 5V2L7.5 5.5L12 9V6.5C15.59 6.5 18.5 9.41 18.5 13C18.5 16.59 15.59 19.5 12 19.5C8.41 19.5 5.5 16.59 5.5 13H3.75C3.75 17.55 7.45 21.25 12 21.25C16.55 21.25 20.25 17.55 20.25 13C20.25 8.45 16.55 4.75 12 4.75V5Z"
      fill="currentColor"
    />
    <text
      x="12"
      y="15.3"
      textAnchor="middle"
      fill="currentColor"
      fontSize="6.7"
      fontWeight="700"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
    >
      10
    </text>
  </svg>
);

const Forward10Icon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 5V2L16.5 5.5L12 9V6.5C8.41 6.5 5.5 9.41 5.5 13C5.5 16.59 8.41 19.5 12 19.5C15.59 19.5 18.5 16.59 18.5 13H20.25C20.25 17.55 16.55 21.25 12 21.25C7.45 21.25 3.75 17.55 3.75 13C3.75 8.45 7.45 4.75 12 4.75V5Z"
      fill="currentColor"
    />
    <text
      x="12"
      y="15.3"
      textAnchor="middle"
      fill="currentColor"
      fontSize="6.7"
      fontWeight="700"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
    >
      10
    </text>
  </svg>
);

export interface CalendarRecordingPlayerProps {
  recording: ClassRecording;
  isWatched: boolean;
  isTrending?: boolean;
  savingWatchState?: boolean;
  onToggleWatched: (recording: ClassRecording) => void;
  onFirstPlay?: (recording: ClassRecording) => void;
  getTeacherSummary?: (teacherName: string, currentSubject?: string) => TeacherProfileSummary;
  onFilterByTeacher?: (teacherName: string) => void;
  isTeacherOrAdmin?: boolean;
  onEdit?: (recording: ClassRecording) => void;
  onDelete?: (recording: ClassRecording) => void;
}

export const CalendarRecordingPlayer: React.FC<CalendarRecordingPlayerProps> = ({
  recording,
  isWatched,
  isTrending = false,
  savingWatchState = false,
  onToggleWatched,
  onFirstPlay,
  getTeacherSummary,
  onFilterByTeacher,
  isTeacherOrAdmin = false,
  onEdit,
  onDelete,
}) => {
  const [newPlayerEnabled, setNewPlayerEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [apiError, setApiError] = useState(false);

  const fallbackDuration = parseDurationLabelToSeconds(recording.durationLabel);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration);
  const [isSeeking, setIsSeeking] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [showVolumePopover, setShowVolumePopover] = useState(false);

  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const [qualityLabel, setQualityLabel] = useState<string>(recording.qualityLabel || '480p');
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [thumbFailed, setThumbFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const firstPlayNotifiedRef = useRef<string | null>(null);

  const startSeconds = extractYouTubeStartSeconds(recording.youtubeUrl);

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setControlsVisible(true);
    if (isPlaying) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        setShowSpeedMenu(false);
        setShowQualityMenu(false);
        setShowVolumePopover(false);
      }, 3200);
    }
  }, [isPlaying]);

  useEffect(() => {
    setControlsVisible(true);
    if (isPlaying) {
      scheduleHideControls();
    }
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, scheduleHideControls]);

  // Reset state whenever recording changes
  useEffect(() => {
    setIsPlaying(false);
    setHasStarted(false);
    setIsBuffering(false);
    setIsReady(false);
    setApiError(false);
    setCurrentTime(startSeconds);
    setDuration(parseDurationLabelToSeconds(recording.durationLabel));
    setPlaybackRate(1);
    setQualityLabel(recording.qualityLabel || '480p');
    setThumbFailed(false);
    setShowSpeedMenu(false);
    setShowQualityMenu(false);
    setShowVolumePopover(false);
  }, [recording.id, recording.youtubeVideoId, recording.durationLabel, recording.qualityLabel, startSeconds]);

  // Initialize YouTube IFrame API when New player mode is active
  useEffect(() => {
    if (!newPlayerEnabled) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    loadYouTubeIframeAPI()
      .then(() => {
        if (cancelled || !ytHostRef.current || !window.YT?.Player) return;

        ytHostRef.current.innerHTML = '';
        const mountNode = document.createElement('div');
        mountNode.className = 'w-full h-full';
        ytHostRef.current.appendChild(mountNode);

        const player = new window.YT.Player(mountNode, {
          videoId: recording.youtubeVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            fs: 0,
            iv_load_policy: 3,
            disablekb: 1,
            enablejsapi: 1,
            start: startSeconds > 0 ? startSeconds : 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setIsReady(true);
              const d = event.target.getDuration?.() || 0;
              if (d > 0) setDuration(d);
              const qLevels = event.target.getAvailableQualityLevels?.() || [];
              if (qLevels.length > 0) {
                setAvailableQualities(qLevels);
              }
              const currentQ = event.target.getPlaybackQuality?.();
              if (currentQ && QUALITY_DISPLAY_MAP[currentQ]) {
                setQualityLabel(QUALITY_DISPLAY_MAP[currentQ]);
              }
              event.target.setVolume?.(volume);
              if (isMuted) event.target.mute?.();
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING
              if (state === 1) {
                setIsPlaying(true);
                setHasStarted(true);
                setIsBuffering(false);
                if (firstPlayNotifiedRef.current !== recording.id) {
                  firstPlayNotifiedRef.current = recording.id;
                  onFirstPlay?.(recording);
                }
                const d = event.target.getDuration?.() || 0;
                if (d > 0) setDuration(d);
                const qLevels = event.target.getAvailableQualityLevels?.() || [];
                if (qLevels.length > 0) setAvailableQualities(qLevels);
              } else if (state === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (state === 3) {
                setIsBuffering(true);
              } else if (state === 0) {
                setIsPlaying(false);
                setIsBuffering(false);
              }
            },
            onPlaybackQualityChange: (event) => {
              if (cancelled) return;
              const mapped = QUALITY_DISPLAY_MAP[event.data];
              if (mapped) setQualityLabel(mapped);
            },
            onPlaybackRateChange: (event) => {
              if (cancelled) return;
              if (typeof event.data === 'number') setPlaybackRate(event.data);
            },
            onError: () => {
              if (cancelled) return;
              setApiError(true);
            },
          },
        });

        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) {
          setApiError(true);
        }
      });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [newPlayerEnabled, recording.youtubeVideoId, startSeconds]);

  // Poll elapsed playback progress smoothly while playing
  useEffect(() => {
    if (!newPlayerEnabled || !isReady || isSeeking) return;
    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = p.getCurrentTime?.();
        const dur = p.getDuration?.();
        if (typeof cur === 'number' && Number.isFinite(cur)) {
          setCurrentTime(cur);
        }
        if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
        }
      } catch {
        // ignore destroyed iframe reads
      }
    }, 350);

    return () => window.clearInterval(timer);
  }, [newPlayerEnabled, isReady, isSeeking]);

  // Fullscreen listener
  useEffect(() => {
    const handleFsChange = () => {
      const activeEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
      setIsFullscreen(!!activeEl && activeEl === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const togglePlayPause = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (isPlaying) {
        p.pauseVideo();
      } else {
        setHasStarted(true);
        if (firstPlayNotifiedRef.current !== recording.id) {
          firstPlayNotifiedRef.current = recording.id;
          onFirstPlay?.(recording);
        }
        p.playVideo();
      }
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const seekBy = (deltaSeconds: number) => {
    const p = playerRef.current;
    if (!p) return;
    const total = duration > 0 ? duration : currentTime + 60;
    const target = Math.max(0, Math.min(total, currentTime + deltaSeconds));
    setCurrentTime(target);
    try {
      p.seekTo(target, true);
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number(e.target.value);
    setIsSeeking(true);
    setCurrentTime(nextVal);
  };

  const handleScrubCommit = (value: number) => {
    setIsSeeking(false);
    try {
      playerRef.current?.seekTo(value, true);
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (isMuted) {
        p.unMute();
        if (volume === 0) {
          setVolume(70);
          p.setVolume(70);
        }
        setIsMuted(false);
      } else {
        p.mute();
        setIsMuted(true);
      }
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(val);
      if (val === 0) {
        p.mute();
        setIsMuted(true);
      } else if (isMuted) {
        p.unMute();
        setIsMuted(false);
      }
    } catch {
      // ignore
    }
  };

  const handleSelectSpeed = (rate: number) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    try {
      playerRef.current?.setPlaybackRate(rate);
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const handleSelectQuality = (rawQuality: string) => {
    const label = QUALITY_DISPLAY_MAP[rawQuality] || rawQuality;
    setQualityLabel(label);
    setShowQualityMenu(false);
    try {
      playerRef.current?.setPlaybackQuality?.(rawQuality);
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {
      // ignore browser fullscreen restrictions inside sandboxed frames
    }
  };

  const effectiveDuration = duration > 0 ? duration : fallbackDuration;
  const useHourPadding = effectiveDuration >= 3600;
  const remainingSeconds = Math.max(0, effectiveDuration - currentTime);
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;

  const displayDurationLabel =
    effectiveDuration > 0
      ? formatVideoDuration(effectiveDuration, false)
      : recording.durationLabel || 'Video';

  const qualityChoices =
    availableQualities.length > 0
      ? availableQualities.filter((q) => QUALITY_DISPLAY_MAP[q])
      : ['hd1080', 'hd720', 'large', 'medium'];

  return (
    <div className="space-y-4">
      {/* VIDEO VIEWPORT */}
      <div
        ref={containerRef}
        onMouseMove={scheduleHideControls}
        onTouchStart={scheduleHideControls}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!newPlayerEnabled) return;
          if (e.key === ' ' || e.key.toLowerCase() === 'k') {
            e.preventDefault();
            togglePlayPause();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            seekBy(-10);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            seekBy(10);
          } else if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            toggleMute();
          } else if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFullscreen();
          }
        }}
        className="relative w-full aspect-video rounded-2xl sm:rounded-[20px] overflow-hidden bg-slate-950 shadow-xl ring-1 ring-stone-900/10 dark:ring-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
      >
        {newPlayerEnabled && !apiError ? (
          <>
            {/* YouTube IFrame Mount */}
            <div ref={ytHostRef} className="w-full h-full pointer-events-none" />

            {/* Pre-start Thumbnail + Center Play Button */}
            {!hasStarted && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950">
                {!thumbFailed ? (
                  <img
                    src={getYouTubeThumbnailUrl(recording.youtubeVideoId)}
                    alt={recording.title}
                    referrerPolicy="no-referrer"
                    onError={() => setThumbFailed(true)}
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#13295B] to-slate-950" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/20" />
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={`Play ${recording.title}`}
                  className="relative z-20 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black/65 backdrop-blur-md text-white ring-1 ring-white/30 shadow-2xl hover:scale-105 hover:bg-[#0284c7] transition-all cursor-pointer"
                >
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
                </button>
              </div>
            )}

            {/* Click & Double-Click Catcher during playback */}
            {hasStarted && (
              <div
                onClick={togglePlayPause}
                onDoubleClick={toggleFullscreen}
                className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center"
                aria-hidden="true"
              >
                {isBuffering && (
                  <div className="h-11 w-11 rounded-full border-3 border-white/30 border-t-white animate-spin" />
                )}
                {!isPlaying && !isBuffering && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white ring-1 ring-white/25 shadow-xl">
                    <Play className="w-7 h-7 fill-current ml-0.5" />
                  </div>
                )}
              </div>
            )}

            {/* Bottom Frosted Transport Bar (Matched to Uploaded Sample) */}
            <div
              className={`absolute inset-x-0 bottom-0 z-20 p-2 sm:p-3.5 transition-opacity duration-200 ${
                controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl sm:rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 px-2 sm:px-3.5 py-1.5 sm:py-2 text-white shadow-2xl flex items-center gap-1.5 sm:gap-2.5">
                {/* Play / Pause */}
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                  aria-label={isPlaying ? 'Pause video' : 'Play video'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
                  ) : (
                    <Play className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current ml-0.5" />
                  )}
                </button>

                {/* Rewind 10s */}
                <button
                  type="button"
                  onClick={() => seekBy(-10)}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                  title="Rewind 10 seconds"
                  aria-label="Rewind 10 seconds"
                >
                  <Rewind10Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                </button>

                {/* Forward 10s */}
                <button
                  type="button"
                  onClick={() => seekBy(10)}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                  title="Forward 10 seconds"
                  aria-label="Forward 10 seconds"
                >
                  <Forward10Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                </button>

                {/* Elapsed Timestamp */}
                <span className="font-mono tabular-nums text-[10px] sm:text-xs font-medium text-white/95 shrink-0 pl-0.5">
                  {formatVideoDuration(currentTime, useHourPadding)}
                </span>

                {/* Interactive Timeline Scrubber */}
                <div className="relative flex-1 min-w-[48px] flex items-center h-6 group/scrubber">
                  <div className="w-full h-[3px] rounded-full bg-white/25 overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-white shadow-md transition-transform group-hover/scrubber:scale-125"
                    style={{ left: `${progressPct}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={effectiveDuration > 0 ? effectiveDuration : 100}
                    step={0.5}
                    value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 100)}
                    onChange={handleScrubChange}
                    onMouseUp={(e) => handleScrubCommit(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleScrubCommit(Number((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => handleScrubCommit(Number((e.target as HTMLInputElement).value))}
                    aria-label="Seek video timeline"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                {/* Remaining Countdown */}
                <span className="font-mono tabular-nums text-[10px] sm:text-xs font-medium text-white/85 shrink-0 hidden sm:inline">
                  -{formatVideoDuration(remainingSeconds, useHourPadding)}
                </span>

                {/* Volume Control */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      toggleMute();
                    }}
                    onMouseEnter={() => setShowVolumePopover(true)}
                    onMouseLeave={() => setShowVolumePopover(false)}
                    className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                    aria-label={isMuted || volume === 0 ? 'Unmute audio' : 'Mute audio'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                    ) : (
                      <Volume2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                    )}
                  </button>

                  {showVolumePopover && (
                    <div
                      onMouseEnter={() => setShowVolumePopover(true)}
                      onMouseLeave={() => setShowVolumePopover(false)}
                      className="hidden sm:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/15 shadow-xl items-center gap-2"
                    >
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        aria-label="Volume level"
                        className="w-20 accent-white cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Playback Speed Selector */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSpeedMenu((prev) => !prev);
                      setShowQualityMenu(false);
                    }}
                    className="h-8 px-1.5 sm:px-2 rounded-lg hover:bg-white/15 font-mono tabular-nums text-[11px] sm:text-xs font-semibold text-white/95 transition-colors cursor-pointer"
                    title="Playback speed"
                  >
                    {playbackRate}x
                  </button>

                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-24 rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/15 p-1 shadow-2xl z-30">
                      {SPEED_OPTIONS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handleSelectSpeed(rate)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums flex items-center justify-between transition-colors ${
                            playbackRate === rate
                              ? 'bg-[#0284c7] text-white font-bold'
                              : 'text-white/85 hover:bg-white/10'
                          }`}
                        >
                          <span>{rate}x</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality Indicator / Menu */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQualityMenu((prev) => !prev);
                      setShowSpeedMenu(false);
                    }}
                    className="h-8 px-1.5 sm:px-2 rounded-lg hover:bg-white/15 font-mono tabular-nums text-[11px] sm:text-xs font-semibold text-white/95 transition-colors cursor-pointer"
                    title="Video quality"
                  >
                    {qualityLabel}
                  </button>

                  {showQualityMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-24 rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/15 p-1 shadow-2xl z-30">
                      {qualityChoices.map((q) => {
                        const label = QUALITY_DISPLAY_MAP[q] || q;
                        return (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleSelectQuality(q)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors ${
                              qualityLabel === label
                                ? 'bg-[#0284c7] text-white font-bold'
                                : 'text-white/85 hover:bg-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                  ) : (
                    <Maximize2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Standard Native YouTube Embed (when "New player" is toggled OFF or API unavailable) */
          <iframe
            key={`${recording.youtubeVideoId}-native`}
            src={`https://www.youtube.com/embed/${recording.youtubeVideoId}?rel=0&modestbranding=1&playsinline=1${
              startSeconds > 0 ? `&start=${startSeconds}` : ''
            }`}
            title={recording.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        )}
      </div>

      {/* API Error notice if sandbox blocked script */}
      {apiError && newPlayerEnabled && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Switched to standard YouTube player for this network environment.</span>
        </div>
      )}

      {/* METADATA & ACTION CARD (Matched to Sample Design + Zahira LMS Theme) */}
      <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-xs transition-colors">
        {/* Top Row: YouTube Tag · Duration · New player Switch + Teacher Edit/Delete */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* YouTube Source Tag */}
            <a
              href={recording.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors"
              title="Open original YouTube link"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.95C17.93 4.75 12 4.75 12 4.75s-5.93 0-7.64.49A2.75 2.75 0 0 0 2.42 7.19C1.93 8.9 1.93 12 1.93 12s0 3.1.49 4.81a2.75 2.75 0 0 0 1.94 1.95c1.71.49 7.64.49 7.64.49s5.93 0 7.64-.49a2.75 2.75 0 0 0 1.94-1.95c.49-1.71.49-4.81.49-4.81s0-3.1-.49-4.81ZM10 15.1V8.9L15.2 12 10 15.1Z" />
              </svg>
              <span>YouTube</span>
              <ExternalLink className="w-3 h-3 opacity-65" />
            </a>

            {/* Duration Tag */}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-mono tabular-nums font-medium text-stone-600 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-stone-400 dark:text-slate-400" />
              <span>{displayDurationLabel}</span>
            </span>

            {/* Live View Count Tag */}
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-mono tabular-nums font-medium text-stone-700 dark:text-slate-200"
              title="Total lesson views"
            >
              <Eye className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>{formatRecordingViewCount(recording.viewCount)}</span>
            </span>

            {/* Trending / Most Watched Indicator */}
            {isTrending && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300/80 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-300">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Trending</span>
              </span>
            )}

            {/* New Player Switch (exact match to sample toggle) */}
            <button
              type="button"
              role="switch"
              aria-checked={newPlayerEnabled}
              onClick={() => setNewPlayerEnabled((prev) => !prev)}
              className="inline-flex items-center gap-2.5 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  newPlayerEnabled ? 'bg-[#0284c7]' : 'bg-stone-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    newPlayerEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </span>
              <span>New player</span>
            </button>
          </div>

          {isTeacherOrAdmin && (
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(recording)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(recording)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recording Title */}
        <h3 className="mt-4 text-base sm:text-xl font-bold tracking-tight text-stone-900 dark:text-white leading-snug">
          {recording.title}
        </h3>

        {/* Mark as Watched Primary Action + Unboxed Context Metadata */}
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={savingWatchState}
            onClick={() => onToggleWatched(recording)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60 ${
              isWatched
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savingWatchState ? 'Saving...' : isWatched ? 'Watched' : 'Mark as watched'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
            <span className="font-semibold text-stone-700 dark:text-slate-200">
              {recording.category || recording.subject}
            </span>
            {recording.teacherName && (
              <>
                <span aria-hidden="true">·</span>
                {getTeacherSummary ? (
                  <TeacherNameHoverTrigger
                    teacherName={recording.teacherName}
                    currentSubject={recording.teacherSubject || recording.category || recording.subject}
                    getSummary={getTeacherSummary}
                    onFilterByTeacher={onFilterByTeacher}
                    className="font-semibold text-stone-700 dark:text-slate-200"
                  >
                    <span>
                      {recording.teacherName}
                      {recording.teacherSubject ? ` (${recording.teacherSubject})` : ''}
                    </span>
                  </TeacherNameHoverTrigger>
                ) : (
                  <span className="font-semibold text-stone-700 dark:text-slate-200">
                    {recording.teacherName}
                    {recording.teacherSubject ? ` (${recording.teacherSubject})` : ''}
                  </span>
                )}
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{recording.date}</span>
          </div>
        </div>

        {/* Divider & Session Subtitle Row */}
        <div className="mt-5 pt-4 border-t border-stone-200/80 dark:border-slate-800 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-bold tracking-wide text-stone-900 dark:text-slate-100">
              {recording.sessionLabel || `${recording.batchName} · ${recording.date}`}
            </p>
            <p className="text-xs text-stone-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
              {recording.teacherName ? (
                <>
                  <span>Teacher:</span>
                  {getTeacherSummary ? (
                    <TeacherNameHoverTrigger
                      teacherName={recording.teacherName}
                      currentSubject={recording.teacherSubject || recording.category || recording.subject}
                      getSummary={getTeacherSummary}
                      onFilterByTeacher={onFilterByTeacher}
                      className="font-semibold text-stone-700 dark:text-slate-200"
                    >
                      <span>
                        {recording.teacherName}
                        {recording.teacherSubject ? ` (${recording.teacherSubject})` : ''}
                      </span>
                    </TeacherNameHoverTrigger>
                  ) : (
                    <span>
                      {recording.teacherName}
                      {recording.teacherSubject ? ` (${recording.teacherSubject})` : ''}
                    </span>
                  )}
                  <span>· {recording.batchName}</span>
                </>
              ) : (
                <span>{recording.batchName}</span>
              )}
            </p>
          </div>

          {recording.description && (
            <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed pt-1">
              {recording.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
