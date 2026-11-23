import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, BookOpen, Eye, PlayCircle, Sparkles, ArrowRight } from 'lucide-react';

export interface TeacherProfileSummary {
  name: string;
  primarySubject: string;
  otherSubjects: string[];
  allSubjects: string[];
  profileSummary: string;
  totalRecordings: number;
  totalViews: number;
  latestDate?: string;
}

export interface TeacherNameHoverTriggerProps {
  teacherName: string;
  currentSubject?: string;
  getSummary: (teacherName: string, currentSubject?: string) => TeacherProfileSummary;
  onFilterByTeacher?: (teacherName: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export const TeacherNameHoverTrigger: React.FC<TeacherNameHoverTriggerProps> = ({
  teacherName,
  currentSubject,
  getSummary,
  onFilterByTeacher,
  className = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const cardWidth = Math.min(312, window.innerWidth - 24);
    const estimatedHeight = 230;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight ? 'top' : 'bottom';

    const rawLeft = rect.left;
    const clampedLeft = Math.max(12, Math.min(rawLeft, window.innerWidth - cardWidth - 12));
    const top = placement === 'bottom' ? rect.bottom + 8 : rect.top - 8;

    setCoords({ top, left: clampedLeft, placement });
  }, []);

  const handleOpenSoon = () => {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      updatePosition();
      setIsOpen(true);
    }, 110);
  };

  const handleCloseSoon = () => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        triggerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => () => clearTimers(), []);

  if (!teacherName || teacherName === 'Teacher Not Specified') {
    return <span className={className}>{children || teacherName}</span>;
  }

  const summary = isOpen ? getSummary(teacherName, currentSubject) : null;

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={`View profile and subjects taught by ${teacherName}`}
        onMouseEnter={handleOpenSoon}
        onMouseLeave={handleCloseSoon}
        onFocus={() => {
          clearTimers();
          updatePosition();
          setIsOpen(true);
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!popupRef.current?.contains(next)) {
            handleCloseSoon();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          clearTimers();
          updatePosition();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            updatePosition();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`inline-flex items-center gap-1 underline decoration-dotted decoration-stone-400/80 underline-offset-2 hover:text-[#0284c7] dark:hover:text-sky-400 hover:decoration-[#0284c7] transition-colors cursor-pointer ${className}`}
      >
        {children || teacherName}
      </span>

      {isOpen &&
        summary &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${summary.name} teacher profile`}
            onMouseEnter={clearTimers}
            onMouseLeave={handleCloseSoon}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: Math.min(312, typeof window !== 'undefined' ? window.innerWidth - 24 : 312),
              transform: coords.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
            }}
            className="z-[80] rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 text-left animate-in fade-in duration-150"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#13295B] dark:bg-sky-600 text-white font-serif font-bold text-base shadow-xs">
                {summary.name.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s*/i, '').charAt(0).toUpperCase() || 'T'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h5 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-white truncate">
                    {summary.name}
                  </h5>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 text-[10px] font-semibold text-[#0284c7] dark:text-sky-300">
                    <GraduationCap className="w-3 h-3" />
                    <span>{summary.primarySubject || 'Faculty Educator'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Summary */}
            <p className="mt-3 text-[11px] leading-relaxed text-stone-600 dark:text-slate-300">
              {summary.profileSummary}
            </p>

            {/* Other Subjects Taught */}
            <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500">
                <BookOpen className="w-3 h-3 text-[#0284c7]" />
                <span>
                  {summary.otherSubjects.length > 0
                    ? 'Other Subjects Taught'
                    : 'Subjects Taught'}
                </span>
              </div>

              {summary.otherSubjects.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.otherSubjects.map((subj) => (
                    <span
                      key={subj}
                      className="rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-stone-700 dark:text-slate-200"
                    >
                      {subj}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {summary.allSubjects.map((subj) => (
                    <span
                      key={subj}
                      className="rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-stone-700 dark:text-slate-200"
                    >
                      {subj}
                    </span>
                  ))}
                  <span className="text-[10px] text-stone-400 dark:text-slate-500">
                    (Primary focus)
                  </span>
                </div>
              )}
            </div>

            {/* Stats & Filter Action */}
            <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-[10px] font-mono tabular-nums text-stone-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1" title="Recorded lessons">
                  <PlayCircle className="w-3 h-3 text-[#0284c7]" />
                  {summary.totalRecordings} {summary.totalRecordings === 1 ? 'lesson' : 'lessons'}
                </span>
                <span className="inline-flex items-center gap-1" title="Total views across lessons">
                  <Eye className="w-3 h-3 text-stone-400" />
                  {summary.totalViews.toLocaleString()} views
                </span>
              </div>

              {onFilterByTeacher && (
                <button
                  type="button"
                  onClick={() => {
                    onFilterByTeacher(summary.name);
                    setIsOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-stone-900 dark:bg-sky-600 hover:bg-stone-800 dark:hover:bg-sky-500 px-2.5 py-1 text-[10px] font-bold text-white transition-colors cursor-pointer"
                >
                  <span>View Lessons</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export function formatRecordingViewCount(views?: number): string {
  const count = typeof views === 'number' && Number.isFinite(views) && views >= 0 ? Math.floor(views) : 0;
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M views`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K views`;
  }
  return `${count} ${count === 1 ? 'view' : 'views'}`;
}

export { Sparkles };
