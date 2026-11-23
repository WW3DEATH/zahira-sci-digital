import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Rotating3DSchoolLogo } from './Rotating3DSchoolLogo';

interface ZahiraLoadingScreenProps {
  isVisible: boolean;
}

export const ZahiraLoadingScreen: React.FC<ZahiraLoadingScreenProps> = ({ isVisible }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-label="Loading Zahira College Mawanella Science Project"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] bg-white text-slate-950 flex flex-col items-center justify-center px-6 py-8 select-none"
        >
          <div className="flex flex-col items-center text-center space-y-6 max-w-xs sm:max-w-sm">
            {/* Centered 3D Rotating Official School Crest */}
            <Rotating3DSchoolLogo size="loader" />

            <div className="space-y-1.5">
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                Zahira College Mawanella
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500">
                A/L English Medium Science Project
              </p>
            </div>

            {/* Clean Linear Progress Bar */}
            <div className="w-40 sm:w-48 h-1 rounded-full bg-slate-100 overflow-hidden">
              {prefersReducedMotion ? (
                <div className="h-full w-2/3 bg-blue-900 rounded-full" />
              ) : (
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.25,
                    ease: 'easeInOut',
                  }}
                  className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-900 via-blue-600 to-red-700"
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
