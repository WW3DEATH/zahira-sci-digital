import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Atom,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  GraduationCap,
  Layers,
  LogIn,
  Mail,
  MapPin,
  Menu,
  Microscope,
  Moon,
  Phone,
  Send,
  Sparkles,
  Sun,
  Swords,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBatch } from '../../context/BatchContext';
import { useSiteConfig } from '../../context/SiteConfigContext';
import { useTheme } from '../../context/ThemeContext';
import {
  AdmissionFormRecord,
  QuizScoreEvent,
  YearlyResultReport,
} from '../../types';
import { ZahiraLogo } from '../common/ZahiraLogo';
import { Rotating3DSchoolLogo } from '../common/Rotating3DSchoolLogo';

import boysHeroImg from '../../assets/images/zahira_boys_science_hero_1795362820631.jpg';
import boysBioImg from '../../assets/images/zahira_boys_bio_lab_1795362821598.jpg';
import boysSeminarImg from '../../assets/images/zahira_boys_seminar_hall_1795362820867.jpg';
import physicalBenchImg from '../../assets/images/zahira_physical_stream_lab_1795362374488.jpg';

interface ZahiraHomePageProps {
  onSignIn: (targetPage?: string) => void;
  onSignUp: (targetPage?: string) => void;
}

type StreamKey = 'physical' | 'biological';
type RankPeriod = 'year' | 'month' | 'all';
type ResultGraphMode = 'rates' | 'selections';

interface GalleryEntry {
  id: string;
  src: string;
  title: string;
  location: string;
  caption: string;
}

interface RankRow {
  userId: string;
  userName: string;
  indexNumber?: string;
  batchName?: string;
  totalPoints: number;
  quizzesDone: number;
  pvpWins: number;
  accuracyPercent: number;
}

interface PdfViewerState {
  title: string;
  subtitle?: string;
  url: string;
  fileName: string;
}

const PROCESS_PILLARS = [
  {
    step: '01',
    title: 'Two Teachers per Subject',
    summary: 'Dual-specialist division across every A/L Science subject',
    detail:
      'Every Advanced Level English Medium subject is guided by two specialist educators—splitting Pure and Applied Mathematics, Theory and Practical Physics, Physical/Inorganic and Organic Chemistry, Botany and Zoology, and Systems and Programming ICT so no syllabus module is rushed.',
    metric: '2 Educators / Subject',
    icon: UserCheck,
  },
  {
    step: '02',
    title: 'Structured Theory & Practicals',
    summary: 'Synchronized lab sessions, notes & past-paper workshops',
    detail:
      'Launched in 2024 at Science Complex Hall 28, Zahira scholars follow weekly practical schedules, structured unit packs, and continuous term paper marking designed specifically for G.C.E. A/L English Medium standards.',
    metric: 'Since 2024 · Hall 28',
    icon: FlaskConical,
  },
  {
    step: '03',
    title: 'Cohort Tracking & Parent Visibility',
    summary: 'Live attendance, term marks & stream rankings',
    detail:
      'Daily attendance roll-calls, Physical and Bio stream report cards, and batch-isolated term transcripts keep scholars, parents, and faculty aligned without paper bottlenecks.',
    metric: 'Real-Time Sync',
    icon: Award,
  },
  {
    step: '04',
    title: 'AI-Era Guided Revision',
    summary: 'Gemini-powered study assistance & live 1v1 quiz duels',
    detail:
      'Beyond classroom hours, students practice in 50-question academic PvP arenas, discuss proofs with teachers in subject rooms, and resolve step-by-step derivations using curriculum-grounded AI support.',
    metric: '24/7 Digital Portal',
    icon: Sparkles,
  },
];

const SUBJECT_DIRECTORY = [
  {
    code: 'C.Maths',
    name: 'Combined Mathematics',
    stream: 'physical' as const,
    facultySplit: '2 Teachers · Pure & Applied',
    topics: 'Calculus, Differential Equations, Coordinate Geometry, Statics, Dynamics & Vectors',
  },
  {
    code: 'Physics',
    name: 'Physics',
    stream: 'both' as const,
    facultySplit: '2 Teachers · Theory & Practical',
    topics: 'Mechanics, Oscillations & Waves, Thermal Physics, Gravitational/Electric Fields & Electronics',
  },
  {
    code: 'Chemistry',
    name: 'Chemistry',
    stream: 'both' as const,
    facultySplit: '2 Teachers · Physical/Inorganic & Organic',
    topics: 'Atomic Structure, Chemical Energetics, Kinetics, Equilibrium, s/p/d-Block & Organic Synthesis',
  },
  {
    code: 'Bio',
    name: 'Biology',
    stream: 'biological' as const,
    facultySplit: '2 Teachers · Botany/Genetics & Zoology',
    topics: 'Cellular Metabolism, Molecular Genetics, Plant & Animal Physiology, Microbiology & Ecology',
  },
  {
    code: 'ICT',
    name: 'Information & Comm. Technology',
    stream: 'both' as const,
    facultySplit: '2 Teachers · Systems & Programming',
    topics: 'Logic Gates, Computer Architecture, Networking, Relational SQL Databases & Python Algorithms',
  },
];

const GALLERY_ITEMS: GalleryEntry[] = [
  {
    id: 'science-hall',
    src: boysHeroImg,
    title: 'A/L Science Complex Practical Session',
    location: 'Hall 28 · Mawanella Campus',
    caption:
      'Scholars in white uniforms and lab coats conducting microscope analyses and titration experiments across sunlit oak benches.',
  },
  {
    id: 'physical-lab',
    src: physicalBenchImg,
    title: 'Physics Optics & Analytical Chemistry Bench',
    location: 'Physical Science Wing',
    caption:
      'Precision optical glass prisms, digital oscilloscopes, vernier calipers, and burette titration rigs for A/L Physical Science.',
  },
  {
    id: 'bio-lab',
    src: boysBioImg,
    title: 'Biological Microscopy & Specimen Station',
    location: 'Biological Science Wing',
    caption:
      'Dual-ocular microscopy workstations and botanical specimen kits supporting Biological Science practical preparation.',
  },
  {
    id: 'seminar-hall',
    src: boysSeminarImg,
    title: 'Dual-Faculty Seminar & Derivation Commons',
    location: 'Lecture Commons',
    caption:
      'Collaborative study tables and derivation boards where Zahira Science Project cohorts prepare for G.C.E. A/L examinations.',
  },
];


export const ZahiraHomePage: React.FC<ZahiraHomePageProps> = ({
  onSignIn,
  onSignUp,
}) => {
  const { batches, activeBatch } = useBatch();
  const { siteConfig } = useSiteConfig();
  const { isDark, toggleTheme } = useTheme();
  const prefersReducedMotion = useReducedMotion();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeStream, setActiveStream] = useState<StreamKey>('physical');
  const [rankPeriod, setRankPeriod] = useState<RankPeriod>('year');
  const [resultGraphMode, setResultGraphMode] = useState<ResultGraphMode>('rates');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pdfViewer, setPdfViewer] = useState<PdfViewerState | null>(null);

  // Live Firestore collections synced across LMS & Homepage
  const [scoreEvents, setScoreEvents] = useState<QuizScoreEvent[]>([]);
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  const [admissionForms, setAdmissionForms] = useState<AdmissionFormRecord[]>([]);
  const [yearlyResults, setYearlyResults] = useState<YearlyResultReport[]>([]);

  // Inquiry form state
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [inquiryStream, setInquiryStream] = useState('Physical Science Stream');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [inquiryFeedback, setInquiryFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Global scroll progress & crest scroll acceleration
  const { scrollYProgress } = useScroll();
  const smoothGlobalProgress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 28,
    restDelta: 0.001,
  });
  const crestScrollSpin = useTransform(smoothGlobalProgress, [0, 1], [0, 360]);

  // Apple iPhone-style Sticky Scroll Showcase Track
  const appleStageRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: rawAppleProgress } = useScroll({
    target: appleStageRef,
    offset: ['start start', 'end end'],
  });
  const appleProgress = useSpring(rawAppleProgress, {
    stiffness: 110,
    damping: 26,
    mass: 0.45,
  });

  const [activeAppleChapter, setActiveAppleChapter] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    return rawAppleProgress.on('change', (val) => {
      if (val < 0.34) setActiveAppleChapter(0);
      else if (val < 0.68) setActiveAppleChapter(1);
      else setActiveAppleChapter(2);
    });
  }, [rawAppleProgress]);

  const stageCardScale = useTransform(appleProgress, [0, 0.22, 0.52, 0.85, 1], [0.86, 1.0, 1.03, 1.0, 0.96]);
  const stageCardRotateX = useTransform(appleProgress, [0, 0.25, 0.75, 1], [11, 0, -2, -5]);
  const stageCardRotateY = useTransform(appleProgress, [0, 0.5, 1], [-4, 0, 4]);
  const stageCardY = useTransform(appleProgress, [0, 0.3, 1], [28, 0, -14]);

  const ch1Opacity = useTransform(appleProgress, [0, 0.26, 0.38], [1, 1, 0]);
  const ch1Y = useTransform(appleProgress, [0, 0.38], [0, -28]);

  const ch2Opacity = useTransform(appleProgress, [0.26, 0.38, 0.62, 0.74], [0, 1, 1, 0]);
  const ch2Y = useTransform(appleProgress, [0.26, 0.38, 0.74], [28, 0, -28]);

  const ch3Opacity = useTransform(appleProgress, [0.62, 0.74, 1], [0, 1, 1]);
  const ch3Y = useTransform(appleProgress, [0.62, 0.74, 1], [28, 0, 0]);

  const ch1ImgScale = useTransform(appleProgress, [0, 0.38], [1.06, 1.0]);
  const ch2ImgScale = useTransform(appleProgress, [0.28, 0.72], [1.0, 1.06]);
  const ch3ImgScale = useTransform(appleProgress, [0.64, 1], [1.04, 1.1]);

  const streamsVisualRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: streamScroll } = useScroll({
    target: streamsVisualRef,
    offset: ['start end', 'end start'],
  });
  const streamImageY = useTransform(streamScroll, [0, 1], [-18, 18]);

  // Subscribe to real Firestore collections synced from Admin & Teacher panels
  useEffect(() => {
    const unsubScores = onSnapshot(
      collection(db, 'quizScoreEvents'),
      (snap) => {
        const list: QuizScoreEvent[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as QuizScoreEvent), id: docSnap.id });
        });
        setScoreEvents(list);
      },
      () => setScoreEvents([])
    );

    const unsubRoster = onSnapshot(
      collection(db, 'attendanceRoster'),
      (snap) => setRosterCount(snap.size),
      () => setRosterCount(null)
    );

    const unsubAdmissions = onSnapshot(
      collection(db, 'admissionForms'),
      (snap) => {
        const list: AdmissionFormRecord[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as AdmissionFormRecord), id: docSnap.id });
        });
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setAdmissionForms(list);
      },
      () => setAdmissionForms([])
    );

    const unsubResults = onSnapshot(
      collection(db, 'yearlyResultsReports'),
      (snap) => {
        const list: YearlyResultReport[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as YearlyResultReport), id: docSnap.id });
        });
        list.sort((a, b) => a.examYear.localeCompare(b.examYear));
        setYearlyResults(list);
      },
      () => setYearlyResults([])
    );

    return () => {
      unsubScores();
      unsubRoster();
      unsubAdmissions();
      unsubResults();
    };
  }, []);

  // Keyboard navigation for gallery lightbox & PDF viewer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
        setPdfViewer(null);
      }
      if (lightboxIndex !== null) {
        if (e.key === 'ArrowRight') {
          setLightboxIndex((prev) => (prev === null ? 0 : (prev + 1) % GALLERY_ITEMS.length));
        }
        if (e.key === 'ArrowLeft') {
          setLightboxIndex((prev) =>
            prev === null ? 0 : (prev - 1 + GALLERY_ITEMS.length) % GALLERY_ITEMS.length
          );
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex]);

  const topRanks = useMemo<RankRow[]>(() => {
    const now = new Date();
    const startBoundary =
      rankPeriod === 'month'
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : rankPeriod === 'year'
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(2020, 0, 1);

    const byUser = new Map<
      string,
      RankRow & { totalCorrect: number; totalQuestions: number }
    >();

    scoreEvents.forEach((ev) => {
      if (!ev.completedAt) return;
      const dt = new Date(ev.completedAt);
      if (isNaN(dt.getTime()) || dt < startBoundary) return;
      if (ev.userRole && ev.userRole !== 'student') return;

      const existing = byUser.get(ev.userId) || {
        userId: ev.userId,
        userName: ev.userName || 'Zahira Scholar',
        indexNumber: ev.indexNumber,
        batchName: ev.batchName,
        totalPoints: 0,
        quizzesDone: 0,
        pvpWins: 0,
        accuracyPercent: 0,
        totalCorrect: 0,
        totalQuestions: 0,
      };

      existing.totalPoints += ev.pointsEarned || 0;
      existing.quizzesDone += 1;
      if (ev.mode === 'pvp' && ev.isWin) existing.pvpWins += 1;
      existing.totalCorrect += ev.correctCount || 0;
      existing.totalQuestions += ev.totalQuestions || 0;
      if (ev.indexNumber && !existing.indexNumber) existing.indexNumber = ev.indexNumber;
      if (ev.batchName && !existing.batchName) existing.batchName = ev.batchName;

      byUser.set(ev.userId, existing);
    });

    return Array.from(byUser.values())
      .map((row) => ({
        userId: row.userId,
        userName: row.userName,
        indexNumber: row.indexNumber,
        batchName: row.batchName,
        totalPoints: row.totalPoints,
        quizzesDone: row.quizzesDone,
        pvpWins: row.pvpWins,
        accuracyPercent:
          row.totalQuestions > 0
            ? Math.round((row.totalCorrect / row.totalQuestions) * 100)
            : 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || b.accuracyPercent - a.accuracyPercent)
      .slice(0, 6);
  }, [scoreEvents, rankPeriod]);

  const activeAdmissionForm = useMemo(
    () => admissionForms.find((f) => f.isActive) || null,
    [admissionForms]
  );

  const resultsChartData = useMemo(
    () =>
      yearlyResults.map((r) => ({
        year: r.examYear,
        'Overall Pass %': r.universityPassRate,
        'Physical Pass %': r.physicalPassRate,
        'Bio Pass %': r.bioPassRate,
        'Uni Qualified': r.universityQualifiedCount,
        '3 A Distinctions': r.a3Count,
        Medicine: r.medicineCount || 0,
        Engineering: r.engineeringCount || 0,
      })),
    [yearlyResults]
  );

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const jumpToAppleChapter = (chapterIndex: 0 | 1 | 2) => {
    const el = appleStageRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const scrollable = Math.max(el.offsetHeight - window.innerHeight, 1);
    const ratios = [0.06, 0.5, 0.9];
    window.scrollTo({
      top: top + scrollable * ratios[chapterIndex],
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = senderName.trim();
    const cleanEmail = senderEmail.trim();
    const cleanMsg = inquiryMessage.trim();

    if (!cleanName || !cleanEmail || !cleanMsg) {
      setInquiryFeedback({
        type: 'error',
        text: 'Please complete your name, email address, and message before sending.',
      });
      return;
    }

    setSubmittingInquiry(true);
    setInquiryFeedback(null);
    try {
      await addDoc(collection(db, 'contactInquiries'), {
        name: cleanName,
        email: cleanEmail,
        stream: inquiryStream,
        message: cleanMsg,
        createdAt: new Date().toISOString(),
        source: 'public_project_homepage',
      });
      setSenderName('');
      setSenderEmail('');
      setInquiryMessage('');
      setInquiryFeedback({
        type: 'success',
        text: 'Inquiry recorded for the Zahira Science Project faculty coordinator.',
      });
    } catch {
      setInquiryFeedback({
        type: 'error',
        text: 'Could not submit online right now. Please contact science@zahiracollegemw.lk directly.',
      });
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const filteredSubjects = useMemo(
    () =>
      SUBJECT_DIRECTORY.filter(
        (sub) => sub.stream === 'both' || sub.stream === activeStream
      ),
    [activeStream]
  );

  const navItems = [
    { id: 'showcase', label: 'Showcase' },
    { id: 'batches', label: 'Batches' },
    { id: 'results', label: 'Results' },
    { id: 'admissions', label: 'Admissions' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'ranks', label: 'Ranks' },
  ];

  const currentYear = new Date().getFullYear();
  const fadeUp = {
    hidden: prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 selection:text-blue-950 dark:selection:bg-blue-900/60 dark:selection:text-blue-100 transition-colors duration-200">
      {/* Scroll-Driven Top Progress Line */}
      {!prefersReducedMotion && (
        <motion.div
          aria-hidden="true"
          className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-blue-800 via-blue-600 to-red-600 origin-left z-50 pointer-events-none"
          style={{ scaleX: smoothGlobalProgress }}
        />
      )}

      {/* =================================================================== */}
      {/* 1. 3-ZONE TOP BAR (Brand Left · Links Center · Sign In & Sign Up)   */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-full px-3 sm:px-6 lg:px-10 flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })}
            className="flex items-center gap-2 sm:gap-2.5 text-left min-w-0 shrink group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg py-1"
          >
            <ZahiraLogo size="sm" className="group-hover:scale-105 transition-transform shrink-0" />
            <span className="font-serif text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
              Zahira Science Project
            </span>
          </button>

          <nav
            aria-label="Primary Page Navigation"
            className="hidden lg:flex items-center gap-6"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="relative py-1 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 after:absolute after:left-0 after:bottom-0 after:h-[1.5px] after:w-0 hover:after:w-full after:bg-blue-700 dark:after:bg-blue-400 after:transition-all after:duration-200"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="min-w-[44px] min-h-[44px] sm:w-9 sm:h-9 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onSignIn('dashboard')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => onSignUp('dashboard')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 min-h-[40px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Toggle Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Clean Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 space-y-3 shadow-xl max-h-[calc(100dvh-4rem)] overflow-y-auto"
            >
              <div className="flex flex-col space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className="w-full text-left px-3.5 min-h-[44px] flex items-center rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 active:bg-slate-200 dark:active:bg-slate-800 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignIn('dashboard');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 min-h-[44px] py-2.5 text-sm font-semibold"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignUp('dashboard');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-900 dark:bg-blue-600 text-white min-h-[44px] py-2.5 text-sm font-semibold"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* =================================================================== */}
      {/* 2. HERO SECTION (3D Rotating School Crest + Sign Up / Sign In CTAs) */}
      {/* =================================================================== */}
      <section className="relative overflow-hidden border-b border-slate-200/80 dark:border-slate-800/80">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_75%_25%,rgba(30,64,175,0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_75%_55%_at_75%_25%,rgba(59,130,246,0.14),transparent_70%)]"
        />

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-16 lg:py-24 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="lg:col-span-6 space-y-6 sm:space-y-7"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-400">
                <span className="text-red-700 dark:text-red-400">Zahira College Mawanella</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Since 2024</span>
                <span aria-hidden="true">·</span>
                <span>A/L English Medium Science Project</span>
              </div>

              <div className="space-y-4">
                <h1 className="font-serif text-3xl sm:text-5xl xl:text-[3.5rem] font-bold tracking-tight text-slate-950 dark:text-white leading-[1.1] text-balance">
                  Advancing{' '}
                  <span className="text-blue-800 dark:text-blue-400">Science</span>
                  <br />
                  Zahira College Mawanella
                </h1>

                <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  A dedicated Boys&apos; Advanced Level English Medium Science initiative built on our{' '}
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    Two Teachers per Subject
                  </strong>{' '}
                  model, modern science laboratories, and AI-guided exam mastery.
                </p>
              </div>

              {/* Hero CTAs: Sign Up + Sign In + Admissions shortcut */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 sm:gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => onSignUp('dashboard')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 min-h-[46px] px-5 sm:px-6 py-3 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSignIn('dashboard')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[46px] px-5 sm:px-6 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4 text-blue-800 dark:text-blue-400" />
                  <span>Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('admissions')}
                  className="col-span-2 sm:col-span-1 inline-flex items-center justify-center sm:justify-start gap-1.5 min-h-[44px] px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-900 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileText className="w-4 h-4" />
                  <span>Admission Form</span>
                </button>
              </div>

              <div className="pt-5 sm:pt-6 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-3 gap-3 sm:gap-6 max-w-xl">
                <div>
                  <p className="font-mono text-lg sm:text-2xl font-semibold text-slate-950 dark:text-white tabular-nums">
                    2 : 1
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Teachers per Subject
                  </p>
                </div>
                <div>
                  <p className="font-mono text-lg sm:text-2xl font-semibold text-blue-900 dark:text-blue-400 tabular-nums">
                    {batches.length || 1}
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Active LMS Batches
                  </p>
                </div>
                <div>
                  <p className="font-mono text-lg sm:text-2xl font-semibold text-slate-950 dark:text-white tabular-nums">
                    {rosterCount !== null && rosterCount > 0 ? rosterCount : '5 Core'}
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {rosterCount !== null && rosterCount > 0
                      ? 'Enrolled Scholars'
                      : 'Science Subjects'}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Right Column: Boys Lab Photo + 3D Rotating Official Crest */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-6"
            >
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl shadow-slate-900/5 dark:shadow-black/40">
                <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
                  <img
                    src={boysHeroImg}
                    alt="Zahira College Mawanella boys science scholars working at laboratory benches"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />

                  <div className="absolute bottom-3.5 left-4 right-4 sm:bottom-4 sm:left-5 sm:right-5 flex items-end justify-between gap-4 text-white">
                    <div>
                      <p className="text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-amber-300">
                        Science Complex · Hall 28
                      </p>
                      <p className="font-serif text-base sm:text-xl font-bold leading-snug">
                        G.C.E. A/L English Medium Science
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-8 flex flex-col sm:flex-row items-center gap-5 sm:gap-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/30 border-t border-slate-100 dark:border-slate-800">
                  <Rotating3DSchoolLogo size="hero" scrollSpinDeg={crestScrollSpin} />

                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-400">
                      Official Institutional Crest
                    </p>
                    <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-950 dark:text-white leading-snug">
                      {siteConfig.schoolName || 'Zahira College Mawanella'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      &ldquo;{siteConfig.motto || 'Excellence in Science, Knowledge, and Discipline'}&rdquo; — scroll down for the interactive showcase, LMS batches, results &amp; admission form.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. APPLE-STYLE STICKY SCROLL-SCRUBBED SHOWCASE (#showcase)          */}
      {/* =================================================================== */}
      <section
        id="showcase"
        ref={appleStageRef}
        aria-label="Interactive Science Project Scroll Showcase"
        className="relative h-[205vh] sm:h-[235vh] bg-slate-950 text-white border-b border-slate-800"
      >
        <div className="sticky top-16 h-[calc(100dvh-4rem)] overflow-hidden flex flex-col justify-between py-4 sm:py-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,rgba(37,99,235,0.22),transparent_72%)]"
          />

          <div className="max-w-[1440px] w-full flex-1 min-h-0 mx-auto px-4 sm:px-6 lg:px-10 relative z-10 flex flex-col justify-between gap-3 sm:gap-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4 shrink-0">
              <div className="relative min-h-[6.5rem] sm:min-h-[5.75rem] flex-1">
                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 0 ? 1 : 0 }
                      : { opacity: ch1Opacity, y: ch1Y }
                  }
                  className={`absolute inset-0 flex flex-col justify-end space-y-1.5 ${
                    activeAppleChapter === 0 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <p className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-amber-300">
                    Chapter 01 · The Foundation
                  </p>
                  <h2 className="font-serif text-xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white text-balance leading-tight">
                    Built for A/L Science. Two Teachers per Subject.
                  </h2>
                </motion.div>

                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 1 ? 1 : 0 }
                      : { opacity: ch2Opacity, y: ch2Y }
                  }
                  className={`absolute inset-0 flex flex-col justify-end space-y-1.5 ${
                    activeAppleChapter === 1 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <p className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-blue-300">
                    Chapter 02 · Seminar Discipline
                  </p>
                  <h2 className="font-serif text-xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white text-balance leading-tight">
                    Focused Boys&apos; Study Halls &amp; Paper Mastery.
                  </h2>
                </motion.div>

                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 2 ? 1 : 0 }
                      : { opacity: ch3Opacity, y: ch3Y }
                  }
                  className={`absolute inset-0 flex flex-col justify-end space-y-1.5 ${
                    activeAppleChapter === 2 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <p className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-emerald-300">
                    Chapter 03 · Laboratory &amp; AI Precision
                  </p>
                  <h2 className="font-serif text-xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white text-balance leading-tight">
                    Real Practicals Meets AI-Era Revision.
                  </h2>
                </motion.div>
              </div>

              <div className="hidden md:flex items-center gap-4 shrink-0">
                <Rotating3DSchoolLogo size="compact" scrollSpinDeg={crestScrollSpin} />
              </div>
            </div>

            <div style={{ perspective: '1400px' }} className="w-full flex-1 min-h-0 flex items-center">
              <motion.div
                style={
                  prefersReducedMotion
                    ? undefined
                    : {
                        scale: stageCardScale,
                        rotateX: stageCardRotateX,
                        rotateY: stageCardRotateY,
                        y: stageCardY,
                        transformStyle: 'preserve-3d',
                      }
                }
                className="relative w-full h-full min-h-[210px] sm:min-h-[300px] rounded-2xl sm:rounded-3xl border border-white/15 bg-slate-900 overflow-hidden shadow-[0_32px_90px_-15px_rgba(0,0,0,0.75)]"
              >
                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 0 ? 1 : 0 }
                      : { opacity: ch1Opacity }
                  }
                  className={`absolute inset-0 ${
                    activeAppleChapter === 0 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <motion.img
                    src={boysHeroImg}
                    alt="Zahira College Mawanella boys science lab session"
                    referrerPolicy="no-referrer"
                    style={prefersReducedMotion ? undefined : { scale: ch1ImgScale }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 sm:bottom-8 sm:left-8 sm:right-8 flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
                    <p className="text-xs sm:text-base text-slate-200 max-w-xl leading-relaxed">
                      Every English Medium Science subject divides complex theory and lab sessions across two specialist teachers so students grasp every proof early.
                    </p>
                    <span className="font-mono text-[11px] sm:text-xs text-amber-300 shrink-0 tabular-nums">
                      01 / 03 · Scroll to continue
                    </span>
                  </div>
                </motion.div>

                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 1 ? 1 : 0 }
                      : { opacity: ch2Opacity }
                  }
                  className={`absolute inset-0 ${
                    activeAppleChapter === 1 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <motion.img
                    src={boysSeminarImg}
                    alt="Zahira College Mawanella boys seminar study hall"
                    referrerPolicy="no-referrer"
                    style={prefersReducedMotion ? undefined : { scale: ch2ImgScale }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 sm:bottom-8 sm:left-8 sm:right-8 flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
                    <p className="text-xs sm:text-base text-slate-200 max-w-xl leading-relaxed">
                      Dedicated study seminars pair past-paper walkthroughs with continuous term tracking across Physical Science and Biological Science cohorts.
                    </p>
                    <span className="font-mono text-[11px] sm:text-xs text-blue-300 shrink-0 tabular-nums">
                      02 / 03 · Hall 28 Commons
                    </span>
                  </div>
                </motion.div>

                <motion.div
                  style={
                    prefersReducedMotion
                      ? { opacity: activeAppleChapter === 2 ? 1 : 0 }
                      : { opacity: ch3Opacity }
                  }
                  className={`absolute inset-0 ${
                    activeAppleChapter === 2 ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <motion.img
                    src={boysBioImg}
                    alt="Zahira College Mawanella boys biology microscopy laboratory"
                    referrerPolicy="no-referrer"
                    style={prefersReducedMotion ? undefined : { scale: ch3ImgScale }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 sm:bottom-8 sm:left-8 sm:right-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
                    <p className="text-xs sm:text-base text-slate-200 max-w-xl leading-relaxed">
                      Sign up or sign in to access unit materials, subject discussions, PvP quiz arenas, and live faculty attendance inside the portal.
                    </p>
                    <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => onSignUp('dashboard')}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 min-h-[42px] px-4 py-2 text-xs font-semibold text-white transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Sign Up</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSignIn('dashboard')}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 min-h-[42px] px-4 py-2 text-xs font-semibold text-white transition-colors"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign In</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            <div className="flex items-center justify-between gap-3 sm:gap-4 pt-1 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar w-full sm:w-auto pb-0.5 sm:pb-0">
                {[
                  { idx: 0 as const, label: '01 · Dual Faculty' },
                  { idx: 1 as const, label: '02 · Boys Seminars' },
                  { idx: 2 as const, label: '03 · Lab & AI Portal' },
                ].map((ch) => {
                  const active = activeAppleChapter === ch.idx;
                  return (
                    <button
                      key={ch.idx}
                      type="button"
                      onClick={() => jumpToAppleChapter(ch.idx)}
                      className={`px-3 min-h-[40px] sm:min-h-0 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white text-slate-950'
                          : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 shrink-0">
                <span>Scroll Progress</span>
                <div className="w-28 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-400 origin-left"
                    style={{ scaleX: appleProgress }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. SECTION 01: ALL LMS BATCHES LINKED LIVE TO HOMEPAGE (#batches)   */}
      {/* =================================================================== */}
      <section
        id="batches"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-red-700 dark:text-red-400">
                01. Active Academic Batches (Synced with LMS)
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                Every Batch Created in the LMS Portal
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md">
              All student cohorts managed by school administration appear live below. Select your batch and sign up or sign in to enter your classroom portal.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {batches.map((batch, idx) => (
              <motion.div
                key={batch.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 flex flex-col justify-between gap-6 hover:border-blue-400 dark:hover:border-blue-600 transition-colors shadow-2xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-900/10 dark:bg-blue-500/15 text-blue-900 dark:text-blue-300 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      {batch.academicYear && (
                        <span className="font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                          {batch.academicYear}
                        </span>
                      )}
                      {batch.isDefault && (
                        <span className="text-[11px] font-sans font-bold text-emerald-700 dark:text-emerald-400">
                          · Active Intake
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                      {batch.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {batch.description ||
                        'Advanced Level English Medium Physical & Biological Science batch synced across schedules, marks, and discussions.'}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSignUp('dashboard')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSignIn('dashboard')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. SECTION 02: YEARLY A/L RESULTS (PDF REPORTS + GRAPH ANALYSIS)    */}
      {/* =================================================================== */}
      <section
        id="results"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-blue-800 dark:text-blue-400">
                02. Annual G.C.E. A/L Results &amp; Graph Analysis
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                Every Year&apos;s Official Results in PDF &amp; Interactive Graphs
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Synced directly from the Admin &amp; Teacher Panels—compare pass percentages, university selections, and download full yearly result sheets.
              </p>
            </div>

            {yearlyResults.length > 0 && (
              <div
                role="tablist"
                aria-label="Graph Analysis Mode"
                className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 self-start"
              >
                <button
                  type="button"
                  onClick={() => setResultGraphMode('rates')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 min-h-[40px] py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    resultGraphMode === 'rates'
                      ? 'bg-blue-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                  <span>Pass Rate Graph</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultGraphMode('selections')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 min-h-[40px] py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    resultGraphMode === 'selections'
                      ? 'bg-blue-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span>Selection Trend</span>
                </button>
              </div>
            )}
          </div>

          {yearlyResults.length > 0 ? (
            <div className="space-y-8">
              {/* Interactive Recharts Graph Panel */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-8 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="font-serif text-lg sm:text-xl font-bold text-slate-950 dark:text-white">
                      {resultGraphMode === 'rates'
                        ? 'Year-by-Year University & Stream Pass Rates (%)'
                        : 'Year-by-Year University Qualified, 3 A Distinctions & Faculty Selections'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Live figures published and maintained by Zahira College Mawanella Teachers &amp; Admin
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-blue-800 dark:text-blue-400 tabular-nums">
                    {yearlyResults.length} {yearlyResults.length === 1 ? 'Year' : 'Years'} Published
                  </span>
                </div>

                <div className="h-64 sm:h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {resultGraphMode === 'rates' ? (
                      <BarChart
                        data={resultsChartData}
                        margin={{ top: 10, right: 8, left: -18, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.45} />
                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="Overall Pass %" fill="#1e3a8a" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="Physical Pass %" fill="#2563eb" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="Bio Pass %" fill="#059669" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    ) : (
                      <AreaChart
                        data={resultsChartData}
                        margin={{ top: 10, right: 16, left: -10, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.45} />
                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Area
                          type="monotone"
                          dataKey="Uni Qualified"
                          stroke="#1e3a8a"
                          fill="#1e3a8a"
                          fillOpacity={0.16}
                          strokeWidth={2.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="3 A Distinctions"
                          stroke="#dc2626"
                          fill="#dc2626"
                          fillOpacity={0.12}
                          strokeWidth={2.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="Medicine"
                          stroke="#059669"
                          fill="#059669"
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="Engineering"
                          stroke="#d97706"
                          fill="#d97706"
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Individual Year Breakdown & PDF Downloads */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {yearlyResults.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-5 shadow-2xs"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-blue-900 dark:text-blue-300">
                          Exam Year {report.examYear}
                        </span>
                        <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {report.universityPassRate}% University Eligible
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white leading-snug">
                          {report.title}
                        </h3>
                        {report.summary && (
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {report.summary}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Candidates</p>
                          <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                            {report.totalCandidates}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">3 A&apos;s Scholars</p>
                          <p className="font-mono text-sm font-bold text-red-700 dark:text-red-400 tabular-nums">
                            {report.a3Count}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Physical Pass</p>
                          <p className="font-mono text-sm font-bold text-blue-800 dark:text-blue-400 tabular-nums">
                            {report.physicalPassRate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Bio Pass</p>
                          <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {report.bioPassRate}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:flex sm:items-center justify-between gap-2">
                      {report.pdfFileUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setPdfViewer({
                                title: report.title,
                                subtitle: `Exam Year ${report.examYear} · Official Results Sheet`,
                                url: report.pdfFileUrl!,
                                fileName: report.pdfFileName || `Zahira_AL_Results_${report.examYear}.pdf`,
                              })
                            }
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview PDF</span>
                          </button>

                          <a
                            href={report.pdfFileUrl}
                            download={report.pdfFileName || `Zahira_AL_Results_${report.examYear}.pdf`}
                            target={report.pdfFileUrl.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </a>
                        </>
                      ) : (
                        <span className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
                          Graph figures verified · PDF sheet pending upload
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                    Yearly Results PDF &amp; Graph Reports Sync Live Here
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Teachers and School Administrators can upload any exam year&apos;s official A/L results PDF and performance breakdown from the Teacher Panel or Admin Master Control Panel, and interactive graphs will automatically render here.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSignIn('admin_panel:homepage_sync')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-5 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4 text-blue-800 dark:text-blue-400" />
                <span>Teacher / Admin Sign In</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 6. SECTION 03: ADMISSION FORM (Teacher & Admin Synced PDF)          */}
      {/* =================================================================== */}
      <section
        id="admissions"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 sm:p-10 lg:p-12 shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-red-700 dark:text-red-400">
                  <span>03. Student Admissions</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Synced from Admin &amp; Teacher Panel
                  </span>
                </div>

                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                  {activeAdmissionForm
                    ? activeAdmissionForm.title
                    : 'Download Official A/L Science Admission Form'}
                </h2>

                {activeAdmissionForm ? (
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p>
                      {activeAdmissionForm.instructions ||
                        'Download and complete the official Zahira College Mawanella Advanced Level English Medium Science Project admission application form, attach your GCE O/L results verification, and submit at Science Complex Hall 28.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-700 dark:text-slate-300 pt-1">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-blue-800 dark:text-blue-400" />
                        Intake Year: <strong className="font-mono">{activeAdmissionForm.academicYear}</strong>
                      </span>
                      {activeAdmissionForm.batchName && (
                        <span className="inline-flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-blue-800 dark:text-blue-400" />
                          Batch: <strong>{activeAdmissionForm.batchName}</strong>
                        </span>
                      )}
                      {activeAdmissionForm.deadline && (
                        <span className="text-red-700 dark:text-red-400 font-semibold">
                          {activeAdmissionForm.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    Admission forms are uploaded and maintained exclusively by Zahira College Mawanella Science Project Teachers and Administrators. Check back here when the next intake PDF is published, or send an inquiry below.
                  </p>
                )}
              </div>

              <div className="lg:col-span-5">
                {activeAdmissionForm ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 space-y-5 shadow-sm">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          Official Active Admission PDF
                        </p>
                        <p className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
                          {activeAdmissionForm.fileName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {activeAdmissionForm.fileSize ? `${activeAdmissionForm.fileSize} · ` : ''}
                          Uploaded by {activeAdmissionForm.uploadedByName} ({activeAdmissionForm.uploadedByRole})
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPdfViewer({
                            title: activeAdmissionForm.title,
                            subtitle: `Intake ${activeAdmissionForm.academicYear} · Official Admission Application`,
                            url: activeAdmissionForm.fileUrl,
                            fileName: activeAdmissionForm.fileName,
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Preview Form</span>
                      </button>

                      <a
                        href={activeAdmissionForm.fileUrl}
                        download={activeAdmissionForm.fileName}
                        target={activeAdmissionForm.fileUrl.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-3 text-xs font-semibold text-white transition-colors shadow-xs"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download PDF</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-6 space-y-4">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Faculty Upload Required
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Teachers and Administrators can upload the latest admission PDF inside the <strong>Homepage Sync</strong> tab of either the Admin Panel or Teacher Panel.
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSignIn('teacher_panel')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Faculty Sign In</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollToSection('contact')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                      >
                        <span>Contact Office</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 7. SECTION 04: OUR ACADEMIC ARCHITECTURE (4 Pillars)                */}
      {/* =================================================================== */}
      <section
        id="process"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-12">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            variants={fadeUp}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-blue-800 dark:text-blue-400">
                04. Our Academic Architecture
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                Four Pillars of the Zahira Science Project
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md leading-relaxed">
              From dual-teacher mentorship at Science Complex Hall 28 to structured revision inside the student portal.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS_PILLARS.map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <motion.div
                  key={pillar.step}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.45, delay: idx * 0.07 }}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-800 dark:text-blue-400 tabular-nums">
                        {pillar.step}
                      </span>
                      <div className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-900 dark:text-blue-300">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-serif text-xl font-bold text-slate-950 dark:text-white leading-snug">
                        {pillar.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {pillar.detail}
                      </p>
                    </div>
                  </div>

                  <p className="pt-4 border-t border-slate-200/80 dark:border-slate-800 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    {pillar.metric}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 8. SECTION 05: ACADEMIC STREAMS (Physical Science vs Bio Science)   */}
      {/* =================================================================== */}
      <section
        id="streams"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-red-700 dark:text-red-400">
                05. Academic Streams &amp; Curriculum
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                Physical Science &amp; Biological Science Pathways
              </h2>
            </div>

            <div
              role="tablist"
              aria-label="Science Stream Selector"
              className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeStream === 'physical'}
                onClick={() => setActiveStream('physical')}
                className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 min-h-[42px] py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeStream === 'physical'
                    ? 'bg-blue-900 text-white dark:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Atom className="w-4 h-4 shrink-0" />
                <span>Physical Science</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeStream === 'biological'}
                onClick={() => setActiveStream('biological')}
                className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 min-h-[42px] py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeStream === 'biological'
                    ? 'bg-blue-900 text-white dark:bg-blue-600'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Microscope className="w-4 h-4 shrink-0" />
                <span>Biological Science</span>
              </button>
            </div>
          </div>

          <div
            ref={streamsVisualRef}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
          >
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-md">
                <div className="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={activeStream}
                      src={activeStream === 'physical' ? physicalBenchImg : boysBioImg}
                      alt={
                        activeStream === 'physical'
                          ? 'Zahira Physical Science & Chemistry Laboratory Workstation'
                          : 'Zahira Boys Biological Science Microscopy Laboratory'
                      }
                      referrerPolicy="no-referrer"
                      initial={prefersReducedMotion ? false : { opacity: 0.3, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0.3 }}
                      transition={{ duration: 0.35 }}
                      style={prefersReducedMotion ? undefined : { y: streamImageY }}
                      className="w-full h-full object-cover"
                    />
                  </AnimatePresence>
                </div>
                <div className="p-5 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-400">
                    {activeStream === 'physical'
                      ? 'Engineering, Computing & Mathematical Sciences'
                      : 'Medicine, Biotechnology & Life Sciences'}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {activeStream === 'physical'
                      ? 'Combined Mathematics, Physics, Chemistry, and optional ICT guided by dual-faculty labs and derivation sessions.'
                      : 'Biology, Chemistry, and Physics practical mastery supported by dedicated botany, zoology, and chemical titration sessions.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSubjects.map((subject) => (
                <div
                  key={subject.code}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="space-y-1 max-w-lg">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-300">
                        {subject.code}
                      </span>
                      <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                        {subject.name}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      {subject.topics}
                    </p>
                  </div>

                  <div className="sm:text-right shrink-0">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {subject.facultySplit}
                    </span>
                  </div>
                </div>
              ))}

              <div className="p-5 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/70 rounded-b-2xl">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Access unit notes, past papers &amp; practical simulations after signing in
                </span>
                <button
                  type="button"
                  onClick={() => onSignUp('subjects')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Sign Up for Units</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 9. SECTION 06: OUR GALLERY (Boys Science Complex Lightbox)          */}
      {/* =================================================================== */}
      <section
        id="gallery"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4"
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider uppercase text-blue-800 dark:text-blue-400">
                06. Our Gallery
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
                Inside Science Complex Hall 28 &amp; Laboratories
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md">
              Select any photograph to inspect Zahira College Mawanella boys&apos; science labs, microscopy bays, and study halls.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {GALLERY_ITEMS.map((item, idx) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.45, delay: idx * 0.06 }}
                className="group text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 relative">
                  <img
                    src={item.src}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/90 text-slate-950 px-2.5 py-1 text-[11px] font-semibold">
                      Inspect <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-400">
                    {item.location}
                  </p>
                  <h3 className="font-serif text-base font-bold text-slate-950 dark:text-white leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {item.caption}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 10. SECTION 07: LIVE STUDENT RANKS (Firestore Real-Time Sync)       */}
      {/* =================================================================== */}
      <section
        id="ranks"
        className="scroll-mt-20 py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/40"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold tracking-wider uppercase text-red-700 dark:text-red-400">
                07. Student Ranks &amp; Quiz Arena
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                Live Cohort Leaderboard
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Updated live from solo ranked quizzes and 1v1 academic duels completed by Zahira scholars.
              </p>
            </div>

            <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 self-start">
              {(
                [
                  { id: 'year', label: `Year ${currentYear}` },
                  { id: 'month', label: 'This Month' },
                  { id: 'all', label: 'All-Time' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRankPeriod(opt.id)}
                  className={`px-2.5 sm:px-3.5 min-h-[40px] py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    rankPeriod === opt.id
                      ? 'bg-blue-900 text-white dark:bg-blue-600'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {topRanks.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
              {/* Mobile Compact Stacked Leaderboard Rows */}
              <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {topRanks.map((row, idx) => (
                  <div
                    key={row.userId}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-sm font-bold text-blue-900 dark:text-blue-400 tabular-nums shrink-0">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950 dark:text-white truncate">
                          {row.userName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {row.batchName || activeBatch?.name || 'Science EM'} · {row.accuracyPercent}% Acc
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-slate-950 dark:text-white tabular-nums">
                        {row.totalPoints.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {row.quizzesDone} quizzes
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / Tablet Leaderboard Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/60">
                      <th className="py-3.5 px-5">Rank</th>
                      <th className="py-3.5 px-5">Scholar</th>
                      <th className="py-3.5 px-5">Batch</th>
                      <th className="py-3.5 px-5 text-right">Accuracy</th>
                      <th className="py-3.5 px-5 text-right">Quizzes</th>
                      <th className="py-3.5 px-5 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {topRanks.map((row, idx) => (
                      <tr
                        key={row.userId}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-5 font-mono font-semibold text-blue-900 dark:text-blue-400 tabular-nums">
                          #{String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {row.userName}
                          </p>
                          {row.indexNumber && (
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              Index {row.indexNumber}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-5 text-xs text-slate-600 dark:text-slate-300">
                          {row.batchName || activeBatch?.name || 'Science EM'}
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {row.accuracyPercent}%
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                          {row.quizzesDone}
                        </td>
                        <td className="py-4 px-5 text-right font-mono font-bold text-slate-950 dark:text-white tabular-nums">
                          {row.totalPoints.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sign in to compete in 1v1 duels and view full Top-20 standings.
                </span>
                <button
                  type="button"
                  onClick={() => onSignIn('leaderboard')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4 min-h-[36px]"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Sign In to View Full Ranks</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4 max-w-xl">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <Swords className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                    New Season Standings Open
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    No ranked quiz scores are recorded for this selected timeframe yet. Sign in or sign up to join the PvP Quiz Arena and climb the live cohort standings.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onSignUp('pvp_quiz')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSignIn('pvp_quiz')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 11. SECTION 08: CONTACT & ADMISSIONS INQUIRY + FOOTER               */}
      {/* =================================================================== */}
      <section
        id="contact"
        className="scroll-mt-20 py-16 sm:py-24"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wider uppercase text-blue-800 dark:text-blue-400">
                  08. Contact &amp; Inquiries
                </p>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white text-balance">
                  Connect with the Science Project Faculty
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Reach out regarding Advanced Level English Medium admissions, Physical &amp; Biological Science subject tracks, or scholar/parent registration.
                </p>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">
                      {siteConfig.room || 'Science Complex - Hall 28'}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      {siteConfig.address || 'Zahira College, Mawanella, Sri Lanka'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-blue-800 dark:text-blue-400 shrink-0" />
                  <a
                    href={`mailto:${siteConfig.contactEmail || 'science@zahiracollegemw.lk'}`}
                    className="text-slate-700 dark:text-slate-300 hover:underline underline-offset-4"
                  >
                    {siteConfig.contactEmail || 'science@zahiracollegemw.lk'}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-blue-800 dark:text-blue-400 shrink-0" />
                  <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {siteConfig.contactPhone || '+94 35 224 6214'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-4 h-4 text-blue-800 dark:text-blue-400 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                    Active Cohort · {activeBatch?.name || siteConfig.academicYear || '2026–2028'}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <form
                onSubmit={handleInquirySubmit}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5 shadow-2xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="inquiry-name"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Full Name
                    </label>
                    <input
                      id="inquiry-name"
                      type="text"
                      required
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Student or parent name"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="inquiry-email"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Email Address
                    </label>
                    <input
                      id="inquiry-email"
                      type="email"
                      required
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="inquiry-stream"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Stream / Topic of Interest
                  </label>
                  <select
                    id="inquiry-stream"
                    value={inquiryStream}
                    onChange={(e) => setInquiryStream(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Physical Science Stream">Physical Science Stream (C.Maths, Physics, Chem / ICT)</option>
                    <option value="Biological Science Stream">Biological Science Stream (Bio, Physics, Chem)</option>
                    <option value="Scholar / Parent Account Access">Scholar or Parent Account Access</option>
                    <option value="General Science Project Inquiry">General Science Project Inquiry</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="inquiry-message"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Message
                  </label>
                  <textarea
                    id="inquiry-message"
                    rows={4}
                    required
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    placeholder="Ask about subject combinations, admissions, timetables, or cohort registration..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
                  />
                </div>

                {inquiryFeedback && (
                  <div
                    role="status"
                    className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
                      inquiryFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    {inquiryFeedback.type === 'success' && (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                    <span>{inquiryFeedback.text}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Already registered? Sign in to message teachers directly.
                  </span>
                  <button
                    type="submit"
                    disabled={submittingInquiry}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 min-h-[46px] px-6 py-3 text-sm font-semibold text-white transition-colors shadow-xs whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submittingInquiry ? 'Sending...' : 'Send Inquiry'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Institutional Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Zahira College Mawanella · A/L English Medium Science Project
            </span>
            <span aria-hidden="true">·</span>
            <span>&copy; {currentYear} M. N. M. Jaasim</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSignIn('dashboard')}
              className="font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4 inline-flex items-center gap-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => onSignUp('dashboard')}
              className="font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4 inline-flex items-center gap-1"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
          </div>
        </div>
      </footer>

      {/* =================================================================== */}
      {/* GALLERY LIGHTBOX MODAL                                              */}
      {/* =================================================================== */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <div
              className="relative max-w-4xl w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="aspect-[16/10] w-full bg-slate-900 overflow-hidden">
                <img
                  src={GALLERY_ITEMS[lightboxIndex].src}
                  alt={GALLERY_ITEMS[lightboxIndex].title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-400">
                    {GALLERY_ITEMS[lightboxIndex].location}
                  </p>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-slate-950 dark:text-white">
                    {GALLERY_ITEMS[lightboxIndex].title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    {GALLERY_ITEMS[lightboxIndex].caption}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex(
                        (lightboxIndex - 1 + GALLERY_ITEMS.length) % GALLERY_ITEMS.length
                      )
                    }
                    className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxIndex((lightboxIndex + 1) % GALLERY_ITEMS.length)
                    }
                    className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(null)}
                    className="w-11 h-11 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center hover:bg-slate-800 dark:hover:bg-slate-700"
                    aria-label="Close gallery viewer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* IN-APP PDF VIEWER MODAL (Admission Form & Yearly Result PDFs)       */}
      {/* =================================================================== */}
      <AnimatePresence>
        {pdfViewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
            onClick={() => setPdfViewer(null)}
          >
            <div
              className="relative max-w-5xl w-full h-[90dvh] sm:h-[86dvh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-sm sm:text-lg font-bold text-slate-950 dark:text-white truncate">
                    {pdfViewer.title}
                  </h3>
                  {pdfViewer.subtitle && (
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                      {pdfViewer.subtitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={pdfViewer.url}
                    download={pdfViewer.fileName}
                    target={pdfViewer.url.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 min-h-[40px] px-3 sm:px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden min-[420px]:inline">Download PDF</span>
                    <span className="min-[420px]:hidden">PDF</span>
                  </a>
                  {pdfViewer.url.startsWith('http') && (
                    <a
                      href={pdfViewer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Open Link</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPdfViewer(null)}
                    className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700"
                    aria-label="Close PDF viewer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-hidden">
                <iframe
                  title={pdfViewer.title}
                  src={pdfViewer.url}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
