import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  FileText,
  FileCheck2,
  Award,
  CalendarCheck2,
  Sparkles,
  ArrowRight,
  Lightbulb,
  Clock,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Filter,
  CheckCircle,
  AlertCircle,
  Activity,
  Layers,
  BellRing,
  AlertTriangle,
  Timer,
  Bell,
  MessageSquare,
  QrCode,
  Camera,
  Dna,
  Flame,
  Zap,
  Target,
  FlaskConical,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  Assignment,
  Quiz,
  TestMark,
  Submission,
  AttendanceRecord,
  AttendanceDayControl,
  RosterStudent,
  QuizAttempt,
  Discussion,
  DiscussionReply,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  LiveMorphIcon,
  LivePaperScannerGraphic,
  LiveOrbitalScienceGraphic,
  HERO_SCIENCE_ICONS,
  LAB_CYCLE_ICONS,
} from '../common/LiveVisuals';
import {
  SEED_ASSIGNMENTS,
  SEED_SUBMISSIONS,
  SEED_TESTS,
  SEED_ATTENDANCE,
  SEED_DISCUSSIONS,
  SEED_DISCUSSION_REPLIES,
  isFakeSeedRosterStudent,
} from '../../services/dataService';
import { calculateStudentBadges } from '../../services/badgeService';
import { StudentBadgeSection } from '../common/StudentBadgeSection';
import { checkUpcomingDeadlinesAndNotify, requestNotificationPermission } from '../../services/notificationService';
import { QRAttendanceModal } from '../attendance/QRAttendanceModal';
import { AIStudyPlannerModal } from '../study/AIStudyPlannerModal';
import { ensureStudentIndexNumber } from '../../services/studentIndexService';
import {
  getMatchingStudentIds,
  isAttendanceRecordActive,
  resolveStudentStatusInRecord,
} from '../../utils/attendanceUtils';

interface StudentDashboardProps {
  onNavigate: (page: string) => void;
  onLaunchTutorTopic?: (topic: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onNavigate,
  onLaunchTutorTopic,
}) => {
  const { userProfile } = useAuth();
  const { isDark } = useTheme();
  const [assignments, setAssignments] = useState<Assignment[]>(SEED_ASSIGNMENTS);
  const [submissions, setSubmissions] = useState<Submission[]>(SEED_SUBMISSIONS);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [marks, setMarks] = useState<TestMark[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(SEED_ATTENDANCE);
  const [dayControlsMap, setDayControlsMap] = useState<Record<string, AttendanceDayControl>>({});
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>(SEED_DISCUSSIONS);
  const [discussionReplies, setDiscussionReplies] = useState<DiscussionReply[]>(SEED_DISCUSSION_REPLIES);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<'term1' | 'term2' | 'all'>('term1');
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [showQRScanModal, setShowQRScanModal] = useState(false);
  const [showStudyPlanner, setShowStudyPlanner] = useState(false);
  const [showStudentIDModal, setShowStudentIDModal] = useState(false);
  const [completionCadence, setCompletionCadence] = useState<'daily' | 'weekly'>('daily');

  // Ensure current student profile has their allocated 7-digit student index number
  useEffect(() => {
    if (userProfile && !userProfile.indexNumber) {
      ensureStudentIndexNumber(userProfile).catch(() => {});
    }
  }, [userProfile]);

  const studentIndexNumber =
    userProfile?.indexNumber ||
    (userProfile?.email?.toLowerCase().trim() === 'mnmjaasim@gmail.com'
      ? '2860003'
      : userProfile?.userId
      ? userProfile.userId.replace(/\D/g, '').padEnd(7, '3').slice(0, 7) || '2860003'
      : '2860003');

  // Real-time synchronization
  useEffect(() => {
    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snap) => {
      const list: Assignment[] = [];
      snap.forEach((d) => list.push(d.data() as Assignment));
      setAssignments(list);
    });

    const unsubSubmissions = onSnapshot(collection(db, 'submissions'), (snap) => {
      const list: Submission[] = [];
      snap.forEach((d) => list.push(d.data() as Submission));
      setSubmissions(list);
    });

    const unsubQuizzes = onSnapshot(collection(db, 'quizzes'), (snap) => {
      const list: Quiz[] = [];
      snap.forEach((d) => list.push(d.data() as Quiz));
      setQuizzes(list);
    });

    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      const list: AttendanceRecord[] = [];
      snap.forEach((d) => {
        const rec = d.data() as AttendanceRecord;
        list.push({ ...rec, id: rec.id || d.id });
      });
      setAttendance(list);
    });

    const unsubDaySettings = onSnapshot(
      collection(db, 'attendanceDaySettings'),
      (snap) => {
        const map: Record<string, AttendanceDayControl> = {};
        snap.forEach((d) => {
          const data = d.data() as AttendanceDayControl;
          const dateKey = data.date || d.id;
          if (dateKey) map[dateKey] = { ...data, id: d.id, date: dateKey };
        });
        setDayControlsMap(map);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'attendanceDaySettings')
    );

    const unsubRoster = onSnapshot(collection(db, 'attendanceRoster'), (snap) => {
      const list: RosterStudent[] = [];
      snap.forEach((d) => {
        const data = d.data() as RosterStudent;
        if (isFakeSeedRosterStudent(d.id, data?.fullName)) return;
        list.push({ ...data, id: d.id });
      });
      setRosterStudents(list);
    });

    const unsubAttempts = onSnapshot(collection(db, 'quizAttempts'), (snap) => {
      const list: QuizAttempt[] = [];
      snap.forEach((d) => list.push(d.data() as QuizAttempt));
      setQuizAttempts(list);
    });

    const unsubDiscussions = onSnapshot(collection(db, 'discussions'), (snap) => {
      const list: Discussion[] = [];
      snap.forEach((d) => list.push(d.data() as Discussion));
      setDiscussions(list);
    });

    const unsubReplies = onSnapshot(collection(db, 'discussionReplies'), (snap) => {
      const list: DiscussionReply[] = [];
      snap.forEach((d) => list.push(d.data() as DiscussionReply));
      setDiscussionReplies(list);
    });

    const unsubMarks = onSnapshot(collection(db, 'testMarks'), (snap) => {
      const list: TestMark[] = [];
      snap.forEach((d) => list.push(d.data() as TestMark));
      const userMarks = list.filter(
        (m) =>
          m.studentId === userProfile?.userId ||
          (userProfile?.indexNumber && m.studentIndex && m.studentIndex.trim() === userProfile.indexNumber.trim()) ||
          (userProfile?.fullName && m.studentName && m.studentName.trim().toLowerCase() === userProfile.fullName.trim().toLowerCase())
      );
      setMarks(userMarks);
      setLoading(false);
    });

    return () => {
      unsubAssignments();
      unsubSubmissions();
      unsubQuizzes();
      unsubAttendance();
      unsubDaySettings();
      unsubRoster();
      unsubAttempts();
      unsubDiscussions();
      unsubReplies();
      unsubMarks();
    };
  }, [userProfile?.userId, userProfile?.fullName, userProfile?.indexNumber]);

  // Check for upcoming deadlines (<24h) and trigger desktop notification
  useEffect(() => {
    if (assignments.length > 0 && userProfile?.userId) {
      checkUpcomingDeadlinesAndNotify(assignments, submissions, userProfile.userId);
    }
  }, [assignments, submissions, userProfile?.userId]);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setBrowserPermission(res);
  };

  // Match logged-in student across Auth profile ID & Attendance Roll-Call roster, strictly on active (ON) days
  const candidateStudentIds = React.useMemo(
    () => getMatchingStudentIds(userProfile, rosterStudents),
    [userProfile, rosterStudents]
  );

  const activeAttendanceRecords = React.useMemo(
    () => attendance.filter((rec) => isAttendanceRecordActive(rec, dayControlsMap)),
    [attendance, dayControlsMap]
  );

  const studentAttendanceTrendData = React.useMemo(() => {
    const sorted = [...activeAttendanceRecords].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    // Include sessions where the student has an explicit entry
    const matched = sorted
      .map((rec) => {
        const status = resolveStudentStatusInRecord(rec, candidateStudentIds);
        if (!status) return null;
        return { rec, status };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const countByDate = new Map<string, number>();
    matched.forEach((m) => countByDate.set(m.rec.date, (countByDate.get(m.rec.date) || 0) + 1));

    let presentOrExcusedCount = 0;
    let lateCount = 0;

    return matched.map(({ rec, status }, idx) => {
      if (status === 'present' || status === 'excused') presentOrExcusedCount++;
      else if (status === 'late') lateCount++;

      const sessionScore =
        status === 'present' || status === 'excused' ? 100 : status === 'late' ? 50 : 0;
      const cumulativeRate = Math.round(
        ((presentOrExcusedCount + lateCount * 0.5) / (idx + 1)) * 100
      );

      const parsedDate = new Date(`${rec.date}T00:00:00`);
      const validDate = !Number.isNaN(parsedDate.getTime());
      const shortDate = validDate
        ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : rec.date;
      const fullDate = validDate
        ? parsedDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : rec.date;
      const sessionLabel = rec.sessionSubject || 'Daily Roll-Call';
      const hasMultipleToday = (countByDate.get(rec.date) || 0) > 1;
      const shortSubject = sessionLabel.length > 9 ? `${sessionLabel.slice(0, 8)}…` : sessionLabel;

      return {
        id: rec.id,
        date: rec.date,
        displayDate: hasMultipleToday ? `${shortDate} (${shortSubject})` : shortDate,
        fullDate,
        sessionLabel,
        timeSlot: rec.timeSlot || '',
        status,
        sessionScore,
        cumulativeRate,
      };
    });
  }, [activeAttendanceRecords, candidateStudentIds]);

  const studentAttTotal = studentAttendanceTrendData.length;
  const studentAttPresent = studentAttendanceTrendData.filter(
    (d) => d.status === 'present' || d.status === 'late' || d.status === 'excused'
  ).length;
  const studentAttExactPresent = studentAttendanceTrendData.filter(
    (d) => d.status === 'present' || d.status === 'excused'
  ).length;
  const studentAttLateCount = studentAttendanceTrendData.filter((d) => d.status === 'late').length;
  const studentAttAbsences = studentAttendanceTrendData.filter((d) => d.status === 'absent').length;
  const studentAttAvgNum =
    studentAttTotal > 0
      ? Math.round(
          (studentAttendanceTrendData.reduce(
            (sum, d) => sum + (d.status === 'present' || d.status === 'excused' ? 1 : d.status === 'late' ? 0.5 : 0),
            0
          ) /
            studentAttTotal) *
            100
        )
      : null;
  const studentAttRate = studentAttAvgNum !== null ? `${studentAttAvgNum}%` : '—';
  const studentAttPeakRate =
    studentAttTotal > 0
      ? Math.max(...studentAttendanceTrendData.map((d) => d.sessionScore))
      : null;
  const studentAttPunctualityRate =
    studentAttExactPresent + studentAttLateCount > 0
      ? Math.round((studentAttExactPresent / (studentAttExactPresent + studentAttLateCount)) * 100)
      : null;

  const badgeSummary = calculateStudentBadges({
    studentId: userProfile?.userId || 'student_scholar',
    candidateIds: candidateStudentIds,
    submissions,
    quizAttempts,
    attendanceRecords: activeAttendanceRecords,
    totalAssignmentsCount: assignments.length,
    assignments,
    discussions,
    discussionReplies,
  });

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const myCompletedSet = new Set(
    submissions.filter((s) => s.studentId === userProfile?.userId).map((s) => s.assignmentId)
  );

  // Urgent assignments due in 24 hours that student has not yet submitted
  const urgentAssignments = assignments.filter((a) => {
    if (myCompletedSet.has(a.id)) return false;
    const dueTime = new Date(a.dueDate).getTime();
    const diff = dueTime - now;
    return diff > -2 * 60 * 60 * 1000 && diff <= oneDayMs; // Due within 24h or recently due in last 2h
  });

  const upcomingAssignments = assignments.slice(0, 3);
  const myCompletedSubmissions = submissions.filter((s) => s.studentId === userProfile?.userId);

  // Compute stats
  const totalScore = marks.reduce((sum, m) => sum + m.marksObtained, 0);
  const totalMax = marks.reduce((sum, m) => sum + m.maxMarks, 0);
  const gpaPercent = totalMax > 0 ? `${Math.round((totalScore / totalMax) * 100)}%` : '—';

  // Semester Grade Trends Data strictly from real marks in Firestore
  const gradeTrendsData = marks.length > 0
    ? marks.map((m, idx) => {
        const pct = m.maxMarks > 0 ? Math.round((m.marksObtained / m.maxMarks) * 100) : 0;
        return {
          period: `Paper 0${idx + 1}`,
          studentScore: pct,
          classAverage: pct,
          benchmark: 85,
          assessment: m.subjectId || `Assessment ${idx + 1}`,
        };
      })
    : [];

  // Monthly Assignment Completion Data strictly from real Firestore assignments & submissions
  const assignmentCompletionData = React.useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; assigned: number; submittedOnTime: number }>();
    assignments.forEach((a) => {
      const d = new Date(a.dueDate);
      if (Number.isNaN(d.getTime())) return;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const curr = map.get(sortKey) || { month, sortKey, assigned: 0, submittedOnTime: 0 };
      curr.assigned++;
      if (myCompletedSet.has(a.id)) curr.submittedOnTime++;
      map.set(sortKey, curr);
    });
    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [assignments, myCompletedSet]);

  // Coursework Status Breakdown strictly from real assignments & student submissions
  const gradedCount = myCompletedSubmissions.filter((s) => s.status === 'graded').length;
  const inReviewCount = myCompletedSubmissions.filter((s) => s.status !== 'graded').length;
  const activeCount = Math.max(0, assignments.length - myCompletedSubmissions.length);
  const completedCount = myCompletedSubmissions.length;
  const totalTasks = assignments.length;
  const completionPercentage = totalTasks > 0 ? Math.min(100, Math.round((completedCount / totalTasks) * 100)) : 0;

  const onTimeSubsCount = myCompletedSubmissions.filter((s) => {
    const target = assignments.find((a) => a.id === s.assignmentId);
    if (!target?.dueDate || !s.submittedAt) return true;
    return new Date(s.submittedAt).getTime() <= new Date(target.dueDate).getTime();
  }).length;
  const onTimeVelocityRate =
    completedCount > 0 ? `${Math.round((onTimeSubsCount / completedCount) * 100)}%` : '—';

  const pieStatusData = [
    { name: 'Graded & Verified', value: gradedCount, color: '#16a34a' },
    { name: 'Submitted (In Review)', value: inReviewCount, color: '#2563eb' },
    { name: 'Active / Due Soon', value: activeCount, color: '#d97706' },
  ].filter((d) => d.value > 0);

  // Subject Performance strictly calculated from real testMarks - ZERO FAKE MARKS
  const scienceSubjects = [
    { name: 'Combined Maths', key: 'math', color: '#2563eb' },
    { name: 'Physics', key: 'phys', color: '#0284c7' },
    { name: 'Chemistry', key: 'chem', color: '#dc2626' },
    { name: 'Biology / ICT', key: 'bio', color: '#059669' },
  ];

  const subjectPerformance = scienceSubjects.map((s) => {
    const matchingMarks = marks.filter((m) =>
      m.subjectId?.toLowerCase().includes(s.key)
    );
    const score =
      matchingMarks.length > 0
        ? Math.round(
            (matchingMarks.reduce((sum, m) => sum + m.marksObtained, 0) /
              matchingMarks.reduce((sum, m) => sum + m.maxMarks, 0)) *
              100
          )
        : null;
    return {
      subject: s.name,
      score,
      target: 85,
      color: s.color,
      count: matchingMarks.length,
    };
  });

  // Daily & Weekly Assignment Completion Metrics strictly from real Firestore assignments & submissions
  const dailyMetrics = React.useMemo(() => {
    const byDay = new Map<string, { day: string; shortDay: string; sortKey: string; assigned: number; completed: number; earlyBonus: number; xpEarned: number }>();
    assignments.forEach((a) => {
      const d = new Date(a.dueDate);
      if (Number.isNaN(d.getTime())) return;
      const sortKey = d.toISOString().split('T')[0];
      const shortDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const entry = byDay.get(sortKey) || { day: shortDay, shortDay, sortKey, assigned: 0, completed: 0, earlyBonus: 0, xpEarned: 0 };
      entry.assigned++;
      const sub = myCompletedSubmissions.find((s) => s.assignmentId === a.id);
      if (sub) {
        entry.completed++;
        const isOnTime = !sub.submittedAt || new Date(sub.submittedAt).getTime() <= d.getTime();
        if (isOnTime) entry.earlyBonus++;
        entry.xpEarned += sub.marksObtained ?? 20;
      }
      byDay.set(sortKey, entry);
    });
    return Array.from(byDay.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [assignments, myCompletedSubmissions]);

  const weeklyMetrics = React.useMemo(() => {
    return assignmentCompletionData.map((m) => ({
      week: m.month,
      shortWeek: m.month,
      assigned: m.assigned,
      completed: m.submittedOnTime,
      velocityXP: m.submittedOnTime * 25,
    }));
  }, [assignmentCompletionData]);

  // Theme-aware colors for Recharts
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const textFill = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#cbd5e1';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner - Collegiate Royal Blue & Crimson */}
      <div className="live-gradient-banner relative overflow-hidden rounded-2xl border border-blue-900 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-6 md:p-8 text-white shadow-xl">
        <LiveOrbitalScienceGraphic className="w-24 h-24 opacity-20 pointer-events-none hidden xl:block absolute right-6 top-3" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <LiveMorphIcon icons={HERO_SCIENCE_ICONS} intervalMs={2200} className="w-3.5 h-3.5" />
              <span>Zahira College Mawanella • 2k28 Science EM Scholar Portal</span>
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-white mt-2 flex items-center flex-wrap gap-2">
              <span>Assalamu Alaikum, {userProfile?.fullName || 'Scholar'}!</span>
              <span className="text-xs px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-300/40 font-mono font-bold tracking-wider">
                Index No: {studentIndexNumber}
              </span>
              {userProfile?.stream && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-600/30 text-white border border-red-400 font-sans font-semibold">
                  {userProfile.stream}
                </span>
              )}
            </h2>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Real-time academic performance dashboard, G.C.E. A/L semester grade trends, and coursework completion metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowStudentIDModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-3 text-xs font-bold text-white transition-all shadow-md shrink-0"
              title="View your official Zahira College Student Identity Pass & QR code"
            >
              <QrCode className="w-4 h-4 text-sky-300" />
              <span>Student ID Pass</span>
            </button>
            <button
              onClick={() => setShowQRScanModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3 text-xs font-bold text-white transition-all shadow-md shrink-0"
              title="Scan classroom attendance QR code projected in Hall 28"
            >
              <Camera className="w-4 h-4 text-white" />
              <span>Scan Classroom QR</span>
            </button>
            <button
              onClick={() => setShowStudyPlanner(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-3 text-xs font-bold text-white transition-all shadow-md shrink-0"
              title="Generate personalized science study schedule based on deadlines & performance"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>AI Science Study Planner</span>
            </button>
            <button
              onClick={() => onNavigate('labs')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-3 text-xs font-bold text-white transition-all shadow-md shrink-0"
              title="Launch Bio Science and Physical Science interactive practical simulations"
            >
              <FlaskConical className="w-4 h-4 text-emerald-200" />
              <span>Virtual Science Labs</span>
            </button>
            <button
              onClick={() => onNavigate('assignments')}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-3 text-xs font-semibold text-white transition-colors"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>View Coursework</span>
            </button>
            <button
              onClick={() => onNavigate('tutor')}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-3 text-xs font-bold text-white transition-all shadow-md shrink-0"
            >
              <Lightbulb className="w-4 h-4 text-white" />
              <span>Gemini AI Tutor</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIRTUAL SCIENCE LABS QUICK ACCESS FEATURE BANNER */}
      <div className="live-gradient-banner rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-slate-900/40 p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-md shrink-0">
              <LiveMorphIcon icons={LAB_CYCLE_ICONS} intervalMs={2000} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  A/L Syllabus Interactive Laboratories
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Bio Science & Physical Science</span>
              </div>
              <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                G.C.E. A/L Virtual Practical Laboratories & Digital Apparatus
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
                Perform real-time simulations for Cell Microscopy, Catalase Enzyme Kinetics, Transpiration Potometer, Vernier & Micrometer Zero Error, Simple Pendulum $g$, Ohm’s & Wheatstone Bridge, and Acid-Base Titration with automated report generation.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('labs')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all shrink-0 self-start md:self-center"
          >
            <span>Open Science Labs</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* URGENT 24-HOUR DEADLINE NOTIFICATION BANNER */}
      {urgentAssignments.length > 0 && (
        <div className="rounded-2xl border-2 border-red-500/80 dark:border-red-500/60 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-transparent p-5 md:p-6 shadow-md transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Urgent Assignment Deadline Warning</span>
                </span>
                <span className="rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-0.5">
                  {urgentAssignments.length} Pending &lt; 24h
                </span>
              </div>
              <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-serif">
                Coursework due within 24 hours — Submit your solutions promptly
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Assignments submitted before the deadline are evaluated for timely completion and early-bird badges.
              </p>
            </div>

            {/* Browser notification permission trigger */}
            {browserPermission !== 'granted' && (
              <button
                onClick={handleRequestPermission}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-400/40 px-3.5 py-2 text-xs font-semibold transition-all shrink-0"
              >
                <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-bounce" />
                <span>Enable Browser Notifications</span>
              </button>
            )}
          </div>

          {/* List of urgent assignments */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {urgentAssignments.map((ua) => {
              const diffMs = new Date(ua.dueDate).getTime() - now;
              const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
              const minsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
              const isOverdue = diffMs <= 0;

              return (
                <div
                  key={ua.id}
                  className="rounded-xl border border-red-200 dark:border-red-900/60 bg-white/80 dark:bg-slate-900/80 p-3.5 shadow-xs flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {ua.title}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          isOverdue
                            ? 'bg-red-600 text-white'
                            : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800'
                        }`}
                      >
                        {isOverdue ? '⚠️ Overdue' : `⚡ Due in ${hoursLeft}h ${minsLeft}m`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                      Due: {new Date(ua.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(ua.dueDate).toLocaleDateString()} • {ua.maxMarks} Marks
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate('assignments')}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-xs shrink-0"
                  >
                    <span>Submit</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Overall Academic Average</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
              <LiveMorphIcon icons={[Award, TrendingUp, Sparkles]} intervalMs={2500} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{gpaPercent}</p>
          <p className="text-[11px] font-medium mt-2 flex items-center gap-1">
            {totalMax > 0 ? (
              <>
                <TrendingUp className="w-3.5 h-3.5 inline text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-400">
                  {Math.round((totalScore / totalMax) * 100) >= 85 ? '+' : ''}
                  {Math.round((totalScore / totalMax) * 100) - 85}% vs cohort benchmark
                </span>
              </>
            ) : (
              <span className="text-slate-400">Pending examination marks upload</span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Task Completion Rate</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
              <LiveMorphIcon icons={[CheckCircle2, FileCheck2, Target]} intervalMs={2900} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{completionPercentage}%</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {completedCount} of {totalTasks} assignments completed
          </p>
        </div>

        <div
          onClick={() => onNavigate('attendance')}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors cursor-pointer hover:border-purple-400"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Attendance Standing</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400">
              <LiveMorphIcon icons={[CalendarCheck2, Clock, CheckCircle]} intervalMs={3300} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{studentAttRate}</p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-2">
            {studentAttTotal > 0 ? `${studentAttPresent} of ${studentAttTotal} active session(s)` : 'No saved attendance yet'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Academic Standing</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              <LiveMorphIcon icons={[Sparkles, Flame, Zap]} intervalMs={2700} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            {totalMax > 0
              ? totalScore / totalMax >= 0.85
                ? 'Grade A'
                : totalScore / totalMax >= 0.75
                ? 'Grade B'
                : 'Grade C'
              : '—'}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-2">
            {marks.length > 0 ? `Verified across ${marks.length} paper(s)` : 'Awaiting evaluated papers'}
          </p>
        </div>
      </div>

      {/* MOTIVATIONAL ASSIGNMENT PROGRESS TRACKER (RECHARTS) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Target className="w-4 h-4" />
              </span>
              <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
                Assignment Completion & Diligence Tracker
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 border border-emerald-300 dark:border-emerald-800">
                <Flame className="w-3 h-3 text-emerald-600" />
                <span>{badgeSummary.totalXp} Merit XP</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Live assignment submission and coursework milestones synced directly from Firestore for Zahira College 2k28 Science EM scholars.
            </p>
          </div>

          {/* Daily vs Monthly Toggle */}
          <div className="flex flex-wrap sm:inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800 text-xs shrink-0 w-full sm:w-auto gap-1 sm:gap-0">
            <button
              onClick={() => setCompletionCadence('daily')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 sm:py-1.5 font-bold transition-all whitespace-nowrap ${
                completionCadence === 'daily'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>By Due Date</span>
            </button>
            <button
              onClick={() => setCompletionCadence('weekly')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 sm:py-1.5 font-bold transition-all whitespace-nowrap ${
                completionCadence === 'weekly'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span>Monthly</span>
            </button>
          </div>
        </div>

        {/* Real Coursework Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Merit XP Earned</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <p className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{badgeSummary.totalXp} XP</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-0.5">
              {badgeSummary.unlockedCount} badge(s) unlocked
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">On-Time Rate</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{onTimeVelocityRate}</p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
              {completedCount > 0 ? `${onTimeSubsCount} submitted before due` : 'No submissions yet'}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3.5">
            <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Graded Submissions</span>
              <Zap className="w-4 h-4 text-blue-500" />
            </div>
            <p className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{gradedCount}</p>
            <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
              {inReviewCount} awaiting review
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-950/20 p-3.5">
            <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Semester Coursework</span>
              <Award className="w-4 h-4 text-purple-500" />
            </div>
            <p className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {completedCount} / {totalTasks}
            </p>
            <p className="text-[11px] text-purple-700 dark:text-purple-400 font-medium mt-0.5">
              {totalTasks > 0 ? `${completionPercentage}% completed` : 'No assignments posted'}
            </p>
          </div>
        </div>

        {/* Visual Recharts Progress Chart or Clean Empty State */}
        <div className="h-72 w-full pt-2">
          {(completionCadence === 'daily' ? dailyMetrics.length === 0 : weeklyMetrics.length === 0) ? (
            <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/40 dark:bg-slate-800/20">
              <LivePaperScannerGraphic accent="blue" className="w-20 h-20 mb-2" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                No Coursework Submissions Recorded Yet
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Real assignments posted by teachers and your submitted coursework will automatically plot here.
              </p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            {completionCadence === 'daily' ? (
              <ComposedChart data={dailyMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="completedDailyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="earlyDailyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="shortDay" tick={{ fill: textFill, fontSize: 11 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                <YAxis yAxisId="left" domain={[0, 4]} allowDecimals={false} tick={{ fill: textFill, fontSize: 11 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 150]} tick={{ fill: textFill, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} XP`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(val: any, name?: any) => {
                    if (name === 'completed') return [`${val} Tasks`, 'Completed Solutions'];
                    if (name === 'assigned') return [`${val} Tasks`, 'Daily Assignment Target'];
                    if (name === 'earlyBonus') return [`${val} Tasks`, 'Early-Bird Submissions'];
                    if (name === 'xpEarned') return [`${val} XP`, 'Diligence XP Earned'];
                    return [val, name];
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.day || label}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={32}
                  formatter={(val) => (
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {val === 'assigned' ? 'Assigned Target' : val === 'completed' ? 'Completed Tasks' : val === 'earlyBonus' ? 'Early Submissions' : 'Diligence XP'}
                    </span>
                  )}
                />
                <Bar yAxisId="left" dataKey="assigned" fill={isDark ? '#334155' : '#e2e8f0'} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="left" dataKey="completed" fill="url(#completedDailyGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="left" dataKey="earlyBonus" fill="url(#earlyDailyGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line yAxisId="right" type="monotone" dataKey="xpEarned" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
              </ComposedChart>
            ) : (
              <ComposedChart data={weeklyMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="weeklyCompletedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#1e40af" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="shortWeek" tick={{ fill: textFill, fontSize: 11 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                <YAxis yAxisId="left" domain={[0, 6]} allowDecimals={false} tick={{ fill: textFill, fontSize: 11 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[150, 320]} tick={{ fill: textFill, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} XP`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(val: any, name?: any) => {
                    if (name === 'completed') return [`${val} Coursework Tasks`, 'Completed Solutions'];
                    if (name === 'assigned') return [`${val} Coursework Tasks`, 'Assigned Curriculum'];
                    if (name === 'velocityXP') return [`${val} Velocity XP`, 'Weekly Mastery Points'];
                    return [val, name];
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.week || label}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={32}
                  formatter={(val) => (
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {val === 'assigned' ? 'Curriculum Assigned' : val === 'completed' ? 'Completed & Submitted' : 'Mastery Velocity XP'}
                    </span>
                  )}
                />
                <Bar yAxisId="left" dataKey="assigned" fill={isDark ? '#334155' : '#e2e8f0'} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar yAxisId="left" dataKey="completed" fill="url(#weeklyCompletedGrad)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line yAxisId="right" type="monotone" dataKey="velocityXP" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
          )}
        </div>

        {/* Motivational Footer Note */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Award className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Academic Progress Note:</strong>{' '}
              {totalTasks > 0
                ? `${completedCount} of ${totalTasks} posted assignment(s) submitted (${completionPercentage}%). Early submissions unlock Science EM Merit XP badges.`
                : 'No coursework assignments are currently pending.'}
            </span>
          </div>
          <button
            onClick={() => onNavigate('assignments')}
            className="inline-flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            <span>Solve Today&apos;s Homework</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* VISUAL DASHBOARD SECTION - RECHARTS ANALYTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART 1: GRADE TRENDS OVER THE SEMESTER (Span 2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                    Academic Grade Trends Over Semester
                  </h3>
                  <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5">
                    Live Recharts
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Track individual test scores, class cohort average, and honors benchmark
                </p>
              </div>

              {/* Term Filter */}
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800 text-xs">
                <button
                  onClick={() => setSelectedTerm('term1')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                    selectedTerm === 'term1'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Term 1 (2026)
                </button>
                <button
                  onClick={() => setSelectedTerm('all')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                    selectedTerm === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Full Year
                </button>
              </div>
            </div>

            {/* Area & Line Chart or Clean Empty State */}
            {gradeTrendsData.length === 0 ? (
              <div className="h-64 w-full mt-6 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <LivePaperScannerGraphic accent="emerald" className="w-20 h-20 mb-2" />
                <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">No examination marks evaluated yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Marks recorded in "Marks and Assessments" will automatically plot your academic trajectory curve here.
                </p>
                <button
                  onClick={() => onNavigate('assessments')}
                  className="mt-4 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shadow-2xs"
                >
                  Go to Marks & Assessments
                </button>
              </div>
            ) : (
            <div className="h-72 w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={gradeTrendsData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="studentScoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="classAvgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: textFill, fontSize: 11 }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[60, 100]}
                    tick={{ fill: textFill, fontSize: 11 }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderColor: tooltipBorder,
                      borderRadius: '12px',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                    formatter={(val: any, name?: any) => [
                      `${val}%`,
                      name === 'studentScore' ? 'My Score' : name === 'classAverage' ? 'Class Average' : 'Honors Target',
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item?.assessment ? `${label} - ${item.assessment}` : label;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={36}
                    formatter={(val) => (
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {val === 'studentScore' ? 'My Performance' : val === 'classAverage' ? 'Batch Average' : 'Benchmark'}
                      </span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="studentScore"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#studentScoreGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="classAverage"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#dc2626"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs mt-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Highest Score</span>
              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                {marks.length > 0
                  ? `${Math.max(...marks.map((m) => Math.round((m.marksObtained / m.maxMarks) * 100)))}%`
                  : 'Pending'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Semester Average</span>
              <p className="font-bold text-blue-600 dark:text-blue-400 text-sm mt-0.5">
                {totalMax > 0 ? `${Math.round((totalScore / totalMax) * 100)}%` : 'Pending'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Grade Band</span>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">
                {marks.length > 0
                  ? totalScore / totalMax >= 0.9
                    ? 'Grade A (Distinction)'
                    : totalScore / totalMax >= 0.75
                    ? 'Grade B (Credit)'
                    : 'Grade C (Pass)'
                  : 'Awaiting Release'}
              </p>
            </div>
          </div>
        </div>

        {/* CHART 2: ASSIGNMENT COMPLETION DONUT (Span 1 Col) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                Coursework Completion Status
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Semester submission distribution
              </p>
            </div>

            {pieStatusData.length === 0 ? (
              <div className="h-60 w-full mt-4 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  No coursework assigned yet
                </p>
              </div>
            ) : (
            <div className="relative h-60 w-full mt-4 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderColor: tooltipBorder,
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Stat inside Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {completionPercentage}%
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  Completed
                </span>
              </div>
            </div>
            )}

            {/* Custom Legend */}
            <div className="space-y-2 mt-2 text-xs">
              {pieStatusData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-none">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{item.value} tasks</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigate('assignments')}
            className="w-full mt-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 p-2 text-center text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Open All Assignments</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SAVED ATTENDANCE GRAPH (Synced ONLY with Saved Registers on Active/ON Days) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs transition-colors space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                My Attendance Record Over Time
              </h3>
              <span className="rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold px-2.5 py-0.5">
                {studentAttTotal > 0 ? `${studentAttRate} • ${studentAttTotal} Saved Log(s)` : 'Synced Live'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Synced strictly with teacher-saved registers on active attendance days (days turned OFF are automatically excluded)
            </p>
          </div>
          <button
            onClick={() => onNavigate('attendance')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 self-start sm:self-auto"
          >
            <span>Open Attendance Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 4 Live Attendance Summary Cards (Strictly Real Saved Data) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
            <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider block">
              Saved Average
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-blue-950 dark:text-blue-100">
                {studentAttAvgNum !== null ? `${studentAttAvgNum}%` : '—'}
              </span>
              {studentAttAvgNum !== null ? (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    studentAttAvgNum >= 90
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {studentAttAvgNum >= 90 ? 'Target Met (≥90%)' : 'Needs Focus (<90%)'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">No logs yet</span>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider block">
              Peak Session Rate
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-emerald-950 dark:text-emerald-100">
                {studentAttPeakRate !== null ? `${studentAttPeakRate}%` : '—'}
              </span>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                {studentAttTotal > 0 ? `${studentAttTotal} saved class(es)` : 'Awaiting roll-call'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
            <span className="text-[11px] font-semibold text-sky-900 dark:text-sky-300 uppercase tracking-wider block">
              Punctuality Rate
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-sky-950 dark:text-sky-100">
                {studentAttPunctualityRate !== null ? `${studentAttPunctualityRate}%` : '—'}
              </span>
              <span className="text-[11px] text-sky-700 dark:text-sky-400 font-medium">
                {studentAttLateCount} late total
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
            <span className="text-[11px] font-semibold text-rose-900 dark:text-rose-300 uppercase tracking-wider block">
              Total Absences
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-rose-950 dark:text-rose-100">
                {studentAttAbsences}
              </span>
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                Saved student logs
              </span>
            </div>
          </div>
        </div>

        {studentAttendanceTrendData.length === 0 ? (
          <div className="h-60 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
            <LivePaperScannerGraphic accent="emerald" className="w-20 h-20 mb-2" />
            <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">
              No Saved Active Attendance Logs Yet
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              When your teacher turns Attendance Marking ON and saves your roll-call register in the Attendance page, your real attendance trend graph will sync here automatically.
            </p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studentAttendanceTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="studentAttendanceCumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fill: textFill, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: textFill, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(val: any, name?: any) => [
                    `${val}%`,
                    name === 'cumulativeRate' ? 'Cumulative Attendance Rate' : 'Session Score',
                  ]}
                  labelFormatter={(_label, payload) => {
                    const p = payload?.[0]?.payload;
                    if (!p) return '';
                    return `${p.fullDate} • ${p.sessionLabel}${p.timeSlot ? ` (${p.timeSlot})` : ''} • Status: ${String(p.status).toUpperCase()}`;
                  }}
                />
                <ReferenceLine
                  y={90}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Target: 90%',
                    fill: '#dc2626',
                    fontSize: 10,
                    position: 'insideTopRight',
                    fontWeight: 'bold',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={30}
                  formatter={(val) => (
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {val === 'cumulativeRate' ? 'Running Attendance Rate (%)' : 'Session Attendance (%)'}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeRate"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#studentAttendanceCumGrad)"
                  dot={{ r: 3.5, fill: '#7c3aed' }}
                />
                <Line
                  type="monotone"
                  dataKey="sessionScore"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#10b981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* CHART 3: MONTHLY ASSIGNMENT FLOW & SUBJECT MASTERY ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Submission Flow BarChart */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                Monthly Assignment Submissions Flow
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tasks assigned vs submitted on time by month
              </p>
            </div>
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>

          {assignmentCompletionData.length === 0 ? (
            <div className="h-60 w-full mt-6 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                No monthly assignment records yet
              </p>
            </div>
          ) : (
          <div className="h-60 w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={assignmentCompletionData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: textFill, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: textFill, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: '10px',
                    fontSize: '11px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={30}
                  formatter={(val) => (
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {val === 'assigned' ? 'Assigned Tasks' : 'Submitted On-Time'}
                    </span>
                  )}
                />
                <Bar dataKey="assigned" fill={isDark ? '#475569' : '#cbd5e1'} radius={[6, 6, 0, 0]} />
                <Bar dataKey="submittedOnTime" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Subject Mastery Progress Bars */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                  Subject-Wise Academic Mastery
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  2k28 Science EM subject breakdown & assessment standing
                </p>
              </div>
              <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div className="space-y-4 mt-6">
              {subjectPerformance.map((sp, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{sp.subject}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Target: {sp.target}%</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                        {sp.score !== null ? `${sp.score}%` : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${sp.score || 0}%`, backgroundColor: sp.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Overall Evaluation: <strong>{marks.length > 0 ? `${gpaPercent} Average` : 'No Papers Released'}</strong></span>
            <span className={marks.length > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}>
              {marks.length > 0 ? 'Verified In System' : 'Awaiting Examination Entry'}
            </span>
          </div>
        </div>
      </div>

      {/* AI-DRIVEN SCIENCE STUDY PLANNER SPOTLIGHT SECTION */}
      <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 p-6 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/40 px-3 py-1 text-xs font-bold text-indigo-300">
              <Dna className="w-3.5 h-3.5 text-teal-400" />
              <span>Personalized AI Science Study Planner • Google DeepMind Science Skills</span>
            </div>
            <h3 className="font-serif text-xl md:text-2xl font-bold tracking-tight text-white">
              Intelligent 7-Day Study Schedules Tailored to Deadlines & Biological Databases
            </h3>
            <p className="text-xs text-indigo-200 leading-relaxed">
              Powered by <strong>Gemini 3.8 Flash</strong>, the study planner dynamically prioritizes pending coursework due within 24 hours, weights your G.C.E. A/L test scores, and cross-references authoritative biological databases (AlphaFold DB protein structures, Reactome metabolic pathways, and PubChem stoichiometry).
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-white border border-white/10">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>Urgent &lt;24h Deadlines Prioritized</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-white border border-white/10">
                <Dna className="w-3.5 h-3.5 text-teal-300" />
                <span>AlphaFold DB & Reactome Integrated</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-white border border-white/10">
                <Award className="w-3.5 h-3.5 text-emerald-300" />
                <span>92% Exam Readiness Target</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <button
              onClick={() => setShowStudyPlanner(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 px-5 py-3 text-xs font-bold text-white transition-all shadow-md"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Launch AI Study Planner</span>
            </button>

            <button
              onClick={() => setShowQRScanModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3 text-xs font-bold text-white transition-all shadow-md"
            >
              <Camera className="w-4 h-4" />
              <span>Scan Classroom QR (Hall 28)</span>
            </button>
          </div>
        </div>
      </div>

      {/* DIGITAL BADGES & ENGAGEMENT HONOURS */}
      <StudentBadgeSection summary={badgeSummary} />

      {/* Main Student Section: Coursework & AI Tutor Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Coursework */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                  Active Coursework Assignments
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Submit solutions for evaluation by Zahira College faculty
                </p>
              </div>
              <button
                onClick={() => onNavigate('assignments')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {upcomingAssignments.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500">
                  No pending assignments right now.
                </div>
              ) : (
                upcomingAssignments.map((a) => {
                  const isSubmitted = submissions.some(
                    (s) => s.assignmentId === a.id && s.studentId === userProfile?.userId
                  );
                  const isUrgent = !isSubmitted && urgentAssignments.some((u) => u.id === a.id);
                  const diffMs = new Date(a.dueDate).getTime() - now;
                  const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

                  return (
                    <div
                      key={a.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                        isUrgent
                          ? 'border-red-300 dark:border-red-800/80 bg-red-50/40 dark:bg-red-950/20 hover:border-red-400'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{a.title}</h4>
                          {isSubmitted ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Submitted
                            </span>
                          ) : isUrgent ? (
                            <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                              Due in {hoursLeft}h (Urgent)
                            </span>
                          ) : (
                            <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">{a.description}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>Due: {new Date(a.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(a.dueDate).toLocaleDateString()} • Max Marks: {a.maxMarks}</span>
                        </p>
                      </div>

                      <button
                        onClick={() => onNavigate('assignments')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors shrink-0 shadow-xs ${
                          isUrgent
                            ? 'bg-red-600 hover:bg-red-700 font-bold'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <span>{isSubmitted ? 'View Submission' : isUrgent ? 'Submit Solution (Urgent)' : 'Submit Solution'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick AI Tutor Topics */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Gemini AI Study Assistant
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Get instant step-by-step guidance on G.C.E. A/L Science questions.
            </p>

            <div className="space-y-2">
              {[
                { title: 'Combined Maths: Differential Calculus', topic: 'Limits, First Principles & Chain Rule' },
                { title: 'Physics: Mechanics & Newton Laws', topic: 'Free-Body Diagrams and Friction' },
                { title: 'Chemistry: Mole Concept & Titration', topic: 'Stoichiometry & Redox Reactions' },
                { title: 'Biology: Cell Structure & Function', topic: 'Organelles and Membrane Transport' },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (onLaunchTutorTopic) onLaunchTutorTopic(item.topic);
                    else onNavigate('tutor');
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-slate-800/80 transition-all group"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.topic}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QR Attendance Camera Scanner Modal */}
      <QRAttendanceModal
        isOpen={showQRScanModal}
        onClose={() => setShowQRScanModal(false)}
        mode="scan"
      />

      {/* AI Science Study Planner Modal */}
      <AIStudyPlannerModal
        isOpen={showStudyPlanner}
        onClose={() => setShowStudyPlanner(false)}
        assignments={assignments}
        testMarks={marks}
        onLaunchTutorTopic={onLaunchTutorTopic}
      />

      {/* Student Identity Pass Modal */}
      {showStudentIDModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative">
            <button
              onClick={() => setShowStudentIDModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-3 py-1 rounded-full border border-sky-200 dark:border-sky-800">
                Official Student Identity Pass
              </span>
              <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 mt-3">
                {userProfile?.fullName || 'Scholar'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zahira College Mawanella • 2k28 Science EM Scholar
              </p>

              {/* QR Code Graphic */}
              <div className="my-5 p-4 rounded-2xl bg-white border border-slate-200 shadow-inner inline-block">
                <div className="w-40 h-40 flex items-center justify-center bg-slate-50 rounded-xl relative overflow-hidden">
                  <QrCode className="w-36 h-36 text-slate-900" />
                </div>
                <p className="text-sm font-mono font-extrabold text-blue-700 mt-2 tracking-widest">
                  INDEX: {studentIndexNumber}
                </p>
              </div>

              <div className="text-left text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-1.5 border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Student Index:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{studentIndexNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Batch Cohort:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">2k28 Science EM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Stream:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {userProfile?.stream || 'Physical & Biological Science'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-emerald-600">Active Verified</span>
                </div>
              </div>

              <button
                onClick={() => setShowStudentIDModal(false)}
                className="w-full mt-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-bold transition-colors"
              >
                Close Pass
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
