import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface Rotating3DSchoolLogoProps {
  size?: 'compact' | 'hero' | 'loader';
  scrollSpinDeg?: any;
  className?: string;
}

/**
 * True 3D Rotating Medallion using the website's official school logo (/assets/aistudio/image_27ea2622.png).
 */
export const Rotating3DSchoolLogo: React.FC<Rotating3DSchoolLogoProps> = ({
  size = 'hero',
  scrollSpinDeg,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [imgError, setImgError] = useState(false);

  const dims =
    size === 'loader'
      ? 'w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44'
      : size === 'hero'
        ? 'w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40'
        : 'w-20 h-20 sm:w-24 sm:h-24';

  const LogoContent = (
    <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-2.5 sm:p-3 overflow-hidden border-[3px] border-amber-400/90 shadow-inner">
      {!imgError ? (
        <img
          src="/assets/aistudio/image_27ea2622.png"
          alt="Zahira College Mawanella Official Crest"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain select-none scale-105"
        />
      ) : (
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full" aria-hidden="true">
          <circle cx="32" cy="32" r="24" stroke="#13295B" strokeWidth="3" />
          <rect x="20" y="20" width="12" height="12" fill="#7B1123" />
          <rect x="32" y="32" width="12" height="12" fill="#13295B" />
        </svg>
      )}
    </div>
  );

  return (
    <div
      className={`relative ${dims} shrink-0 select-none ${className}`}
      style={{ perspective: '1100px' }}
    >
      <div
        aria-hidden="true"
        className={`absolute -inset-3 rounded-full blur-xl pointer-events-none ${
          size === 'loader'
            ? 'bg-gradient-to-tr from-blue-600/15 via-amber-400/15 to-red-600/15'
            : 'bg-gradient-to-tr from-blue-600/20 via-amber-400/15 to-red-600/20'
        }`}
      />

      <motion.div
        style={{
          transformStyle: 'preserve-3d',
          rotateY: scrollSpinDeg ?? 0,
        }}
        className="w-full h-full relative"
      >
        <motion.div
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  rotateY: [0, 360],
                  rotateX: size === 'loader' ? [6, -6, 6] : [4, -4, 4],
                }
          }
          transition={
            prefersReducedMotion
              ? undefined
              : {
                  rotateY: {
                    repeat: Infinity,
                    duration: size === 'loader' ? 4.2 : 11,
                    ease: 'linear',
                  },
                  rotateX: {
                    repeat: Infinity,
                    duration: size === 'loader' ? 2.6 : 5.5,
                    ease: 'easeInOut',
                  },
                }
          }
          whileHover={prefersReducedMotion ? undefined : { scale: 1.07 }}
          style={{ transformStyle: 'preserve-3d' }}
          className="w-full h-full relative cursor-grab active:cursor-grabbing"
        >
          {[-6, -3, 0, 3, 6].map((zOffset) => (
            <div
              key={zOffset}
              aria-hidden="true"
              style={{ transform: `translateZ(${zOffset}px)` }}
              className="absolute inset-0 rounded-full bg-gradient-to-b from-blue-950 via-amber-500 to-red-900 border border-amber-300/60 shadow-sm"
            />
          ))}

          <div
            style={{
              transform: 'translateZ(8px)',
              backfaceVisibility: 'hidden',
            }}
            className="absolute inset-0 rounded-full shadow-2xl"
          >
            {LogoContent}
          </div>

          <div
            style={{
              transform: 'rotateY(180deg) translateZ(8px)',
              backfaceVisibility: 'hidden',
            }}
            className="absolute inset-0 rounded-full shadow-2xl"
          >
            {LogoContent}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
