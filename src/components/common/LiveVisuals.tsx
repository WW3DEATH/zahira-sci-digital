import React, { useState, useEffect } from 'react';
import {
  Atom,
  FlaskConical,
  TrendingUp,
  GraduationCap,
  FileCheck2,
  Sparkles,
  BookOpen,
  Cpu,
  type LucideIcon,
} from 'lucide-react';

interface LiveMorphIconProps {
  icons: LucideIcon[];
  intervalMs?: number;
  initialIndex?: number;
  className?: string;
}

/**
 * Smoothly cycles through an array of Lucide icons over time with a morph animation.
 */
export const LiveMorphIcon: React.FC<LiveMorphIconProps> = ({
  icons,
  intervalMs = 2400,
  initialIndex = 0,
  className = 'w-5 h-5',
}) => {
  const [index, setIndex] = useState(() => (icons.length > 0 ? initialIndex % icons.length : 0));

  useEffect(() => {
    if (icons.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % icons.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [icons.length, intervalMs]);

  const ActiveIcon = icons[index] || icons[0];
  if (!ActiveIcon) return null;

  return <ActiveIcon key={index} className={`${className} live-icon-swap`} />;
};

interface LivePaperScannerGraphicProps {
  accent?: 'emerald' | 'blue' | 'amber';
  className?: string;
}

/**
 * Animated SVG document analysis graphic with a sweeping laser scanner beam
 * and pulsing metric bars for empty / awaiting states.
 */
export const LivePaperScannerGraphic: React.FC<LivePaperScannerGraphicProps> = ({
  accent = 'emerald',
  className = 'w-20 h-20',
}) => {
  const palette =
    accent === 'blue'
      ? {
          beam: '#2563eb',
          glow: 'rgba(37, 99, 235, 0.26)',
          lineStrong: '#1d4ed8',
          lineSoft: '#60a5fa',
          sheetBg: '#eff6ff',
          sheetBorder: '#bfdbfe',
        }
      : accent === 'amber'
      ? {
          beam: '#d97706',
          glow: 'rgba(217, 119, 6, 0.25)',
          lineStrong: '#b45309',
          lineSoft: '#fbbf24',
          sheetBg: '#fffbeb',
          sheetBorder: '#fde68a',
        }
      : {
          beam: '#16a34a',
          glow: 'rgba(22, 163, 74, 0.26)',
          lineStrong: '#15803d',
          lineSoft: '#4ade80',
          sheetBg: '#f0fdf4',
          sheetBorder: '#bbf7d0',
        };

  return (
    <svg
      viewBox="0 0 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} live-float-soft select-none`}
      aria-hidden="true"
    >
      {/* Document Base */}
      <rect
        x="18"
        y="10"
        width="52"
        height="66"
        rx="8"
        fill={palette.sheetBg}
        stroke={palette.sheetBorder}
        strokeWidth="2"
      />
      {/* Folded Corner Accent */}
      <path d="M54 10V22C54 24.2 55.8 26 58 26H70" stroke={palette.sheetBorder} strokeWidth="2" />

      {/* Pulsing Document Content Bars */}
      <rect
        x="26"
        y="24"
        width="18"
        height="5"
        rx="2.5"
        fill={palette.lineStrong}
        className="live-line-pulse"
      />
      <rect
        x="26"
        y="35"
        width="34"
        height="4.5"
        rx="2.25"
        fill={palette.lineSoft}
        className="live-line-pulse"
        style={{ animationDelay: '0.25s' }}
      />
      <rect
        x="26"
        y="45"
        width="26"
        height="4.5"
        rx="2.25"
        fill={palette.lineStrong}
        className="live-line-pulse"
        style={{ animationDelay: '0.5s' }}
      />
      <rect
        x="26"
        y="55"
        width="30"
        height="4.5"
        rx="2.25"
        fill={palette.lineSoft}
        className="live-line-pulse"
        style={{ animationDelay: '0.75s' }}
      />
      <circle cx="60" cy="57" r="3" fill={palette.beam} className="animate-pulse" />

      {/* Sweeping Scanner Beam & Halo */}
      <g className="live-scanner-beam">
        <rect x="13" y="4" width="62" height="9" rx="4.5" fill={palette.glow} />
        <rect x="11" y="7" width="66" height="2.6" rx="1.3" fill={palette.beam} />
      </g>
    </svg>
  );
};

interface LiveOrbitalScienceGraphicProps {
  className?: string;
}

/**
 * Animated molecular / orbital rings SVG for Science EM hero banners.
 */
export const LiveOrbitalScienceGraphic: React.FC<LiveOrbitalScienceGraphicProps> = ({
  className = 'w-16 h-16',
}) => {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} select-none`}
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 4" />

      <g className="live-orbit-spin">
        <ellipse
          cx="40"
          cy="40"
          rx="30"
          ry="12"
          transform="rotate(28 40 40)"
          stroke="rgba(125,211,252,0.75)"
          strokeWidth="1.6"
        />
        <circle cx="65" cy="53" r="3.2" fill="#38bdf8" />
      </g>

      <g className="live-orbit-spin-reverse">
        <ellipse
          cx="40"
          cy="40"
          rx="30"
          ry="12"
          transform="rotate(-32 40 40)"
          stroke="rgba(251,191,36,0.7)"
          strokeWidth="1.6"
        />
        <circle cx="15" cy="54" r="3" fill="#fbbf24" />
      </g>

      <circle cx="40" cy="40" r="6" fill="#ffffff" className="animate-pulse" />
      <circle cx="40" cy="40" r="10.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
    </svg>
  );
};

interface SpotlightSlide {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  actionPage?: string;
}

const DEFAULT_SPOTLIGHT_SLIDES: SpotlightSlide[] = [
  {
    eyebrow: 'LIVE SCIENCE SPOTLIGHT',
    title: 'Combined Mathematics',
    subtitle: 'Pure Calculus, Vectors & Applied Dynamics',
    icon: TrendingUp,
    actionPage: 'tutor',
  },
  {
    eyebrow: 'VIRTUAL APPARATUS LAB',
    title: 'Physics & Chemistry',
    subtitle: 'Pendulum g, Titration & Organic Mechanisms',
    icon: FlaskConical,
    actionPage: 'labs',
  },
  {
    eyebrow: 'INSTANT TRANSCRIPT SYNC',
    title: 'Marks & Report Cards',
    subtitle: 'Real-time Exam Evaluations & Certified PDFs',
    icon: FileCheck2,
    actionPage: 'assessments',
  },
  {
    eyebrow: '24/7 AI REASONING',
    title: 'Gemini Science Tutor',
    subtitle: 'Step-by-step A/L Problem Solving & Math.js',
    icon: Atom,
    actionPage: 'tutor',
  },
  {
    eyebrow: 'ZAHIRA 2K28 COHORT',
    title: 'Biology & ICT Systems',
    subtitle: 'Microscopy, Algorithms & Past Paper Drills',
    icon: GraduationCap,
    actionPage: 'materials',
  },
];

interface LiveHeroSpotlightCardProps {
  onNavigate?: (page: string) => void;
  className?: string;
}

/**
 * Interactive time-cycling spotlight card (animated gradient + morphing feature icon + rotating text)
 * inspired by modern dynamic AI hero cards.
 */
export const LiveHeroSpotlightCard: React.FC<LiveHeroSpotlightCardProps> = ({
  onNavigate,
  className = '',
}) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % DEFAULT_SPOTLIGHT_SLIDES.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  const current = DEFAULT_SPOTLIGHT_SLIDES[idx];
  const SlideIcon = current.icon;

  return (
    <button
      type="button"
      onClick={() => current.actionPage && onNavigate?.(current.actionPage)}
      className={`live-gradient-vibrant group relative w-full text-left rounded-2xl p-4 sm:p-5 text-white shadow-lg border border-white/20 overflow-hidden transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${className}`}
    >
      <div className="flex items-center justify-between gap-4 relative z-10">
        <div key={idx} className="min-w-0 live-slide-up-fade">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100/90 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-ping" />
            <span>{current.eyebrow}</span>
          </p>
          <p className="font-serif text-base sm:text-lg font-bold text-white truncate mt-0.5">
            {current.title}
          </p>
          <p className="text-[11px] text-blue-100/90 truncate mt-0.5">{current.subtitle}</p>
        </div>

        <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-xs border border-white/25 flex items-center justify-center shrink-0 shadow-inner">
          <SlideIcon key={idx} className="w-6 h-6 text-white live-icon-swap" />
        </div>
      </div>

      {/* Subtle indicator dots */}
      <div className="flex items-center gap-1.5 mt-3 relative z-10">
        {DEFAULT_SPOTLIGHT_SLIDES.map((slide, sIdx) => (
          <span
            key={slide.title}
            className={`h-1 rounded-full transition-all duration-300 ${
              sIdx === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
            }`}
          />
        ))}
      </div>
    </button>
  );
};

export const HERO_SCIENCE_ICONS: LucideIcon[] = [
  Sparkles,
  Atom,
  FlaskConical,
  TrendingUp,
  GraduationCap,
];

export const LAB_CYCLE_ICONS: LucideIcon[] = [
  FlaskConical,
  Atom,
  BookOpen,
  Cpu,
];
