import React, { useState, useEffect, useMemo } from 'react';
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
  Calendar,
  MapPin,
  GraduationCap,
  Users,
  UserPlus,
  Hash,
  Send,
  Hourglass,
  Trash2,
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
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeFirestoreDoc } from '../../firebase';
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
  SchoolEvent,
  StudyGroupJoinRequest,
  STUDY_GROUP_ROOMS,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { isInBatch, resolveItemBatchId, useBatch } from '../../context/BatchContext';
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
  const { activeBatchId, activeBatch, getBatchName } = useBatch();
  const activeBatchName = activeBatch?.name || getBatchName(activeBatchId);
  const { isDark } = useTheme();
  const [allAssignments, setAllAssignments] = useState<Assignment[]>(SEED_ASSIGNMENTS);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>(SEED_SUBMISSIONS);
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [allMarks, setAllMarks] = useState<TestMark[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [dayControlsMap, setDayControlsMap] = useState<Record<string, AttendanceDayControl>>({});
  const [allRosterStudents, setAllRosterStudents] = useState<RosterStudent[]>([]);
  const [allQuizAttempts, setAllQuizAttempts] = useState<QuizAttempt[]>([]);
  const [allDiscussions, setAllDiscussions] = useState<Discussion[]>(SEED_DISCUSSIONS);
  const [allDiscussionReplies, setAllDiscussionReplies] = useState<DiscussionReply[]>(SEED_DISCUSSION_REPLIES);
  const [allSchoolEvents, setAllSchoolEvents] = useState<SchoolEvent[]>([]);
  const [allStudyGroupRequests, setAllStudyGroupRequests] = useState<StudyGroupJoinRequest[]>([]);
  const [selectedRoomByEventId, setSelectedRoomByEventId] = useState<Record<string, string>>({});
  const [studyNoteByEventId, setStudyNoteByEventId] = useState<Record<string, string>>({});
  const [submittingStudyReqKey, setSubmittingStudyReqKey] = useState<string | null>(null);
  const [studyReqNotice, setStudyReqNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<'term1' | 'term2' | 'all'>('term1');
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [showQRScanModal, setShowQRScanModal] = useState(false);
  const [showStudyPlanner, setShowStudyPlanner] = useState(false);
  const [showStudentIDModal, setShowStudentIDModal] = useState(false);
  const [completionCadence, setCompletionCadence] = useState<'daily' | 'weekly'>('daily');
  const [attChartMode, setAttChartMode] = useState<'rate' | 'counts'>('rate');

  // 1-second live tick for Upcoming Exams countdown timer
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

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
      setAllAssignments(list);
    });

    const unsubSubmissions = onSnapshot(collection(db, 'submissions'), (snap) => {
      const list: Submission[] = [];
      snap.forEach((d) => list.push(d.data() as Submission));
      setAllSubmissions(list);
    });

    const unsubQuizzes = onSnapshot(collection(db, 'quizzes'), (snap) => {
      const list: Quiz[] = [];
      snap.forEach((d) => list.push(d.data() as Quiz));
      setAllQuizzes(list);
    });

    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      const list: AttendanceRecord[] = [];
      snap.forEach((d) => {
        const rec = d.data() as AttendanceRecord;
        list.push({ ...rec, id: rec.id || d.id });
      });
      setAllAttendance(list);
    });

    const unsubDaySettings = onSnapshot(
      collection(db, 'attendanceDaySettings'),
      (snap) => {
        const map: Record<string, AttendanceDayControl> = {};
        snap.forEach((d) => {
          const data = d.data() as AttendanceDayControl;
          const dateKey = data.date || d.id;
          map[d.id] = { ...data, id: d.id, date: dateKey };
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
      setAllRosterStudents(list);
    });

    const unsubAttempts = onSnapshot(collection(db, 'quizAttempts'), (snap) => {
      const list: QuizAttempt[] = [];
      snap.forEach((d) => list.push(d.data() as QuizAttempt));
      setAllQuizAttempts(list);
    });

    const unsubDiscussions = onSnapshot(collection(db, 'discussions'), (snap) => {
      const list: Discussion[] = [];
      snap.forEach((d) => list.push(d.data() as Discussion));
      setAllDiscussions(list);
    });

    const unsubReplies = onSnapshot(collection(db, 'discussionReplies'), (snap) => {
      const list: DiscussionReply[] = [];
      snap.forEach((d) => list.push(d.data() as DiscussionReply));
      setAllDiscussionReplies(list);
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
      setAllMarks(userMarks);
      setLoading(false);
    });

    const unsubSchoolEvents = onSnapshot(collection(db, 'schoolEvents'), (snap) => {
      const list: SchoolEvent[] = [];
      snap.forEach((d) => {
        const data = d.data() as SchoolEvent;
        list.push({ ...data, id: data.id || d.id });
      });
      setAllSchoolEvents(list);
    });

    const unsubStudyRequests = onSnapshot(
      collection(db, 'studyGroupRequests'),
      (snap) => {
        const list: StudyGroupJoinRequest[] = [];
        snap.forEach((d) => {
          const data = d.data() as StudyGroupJoinRequest;
          list.push({ ...data, id: data.id || d.id });
        });
        list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
        setAllStudyGroupRequests(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'studyGroupRequests')
    );

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
      unsubSchoolEvents();
      unsubStudyRequests();
    };
  }, [userProfile?.userId, userProfile?.fullName, userProfile?.indexNumber]);

  // Batch-isolated academic collections
  const assignments = useMemo(
    () => allAssignments.filter((a) => isInBatch(a.batchId, activeBatchId)),
    [allAssignments, activeBatchId]
  );
  const submissions = useMemo(
    () => allSubmissions.filter((s) => isInBatch(s.batchId, activeBatchId)),
    [allSubmissions, activeBatchId]
  );
  const quizzes = useMemo(
    () => allQuizzes.filter((q) => isInBatch(q.batchId, activeBatchId)),
    [allQuizzes, activeBatchId]
  );
  const marks = useMemo(
    () => allMarks.filter((m) => isInBatch(m.batchId, activeBatchId)),
    [allMarks, activeBatchId]
  );
  const attendance = useMemo(
    () => allAttendance.filter((rec) => isInBatch(rec.batchId, activeBatchId)),
    [allAttendance, activeBatchId]
  );
  const rosterStudents = useMemo(
    () => allRosterStudents.filter((r) => isInBatch(r.batchId, activeBatchId)),
    [allRosterStudents, activeBatchId]
  );
  const quizAttempts = useMemo(
    () => allQuizAttempts.filter((a) => isInBatch(a.batchId, activeBatchId)),
    [allQuizAttempts, activeBatchId]
  );
  const discussions = useMemo(
    () => allDiscussions.filter((d) => isInBatch(d.batchId, activeBatchId)),
    [allDiscussions, activeBatchId]
  );
  const discussionReplies = useMemo(
    () => allDiscussionReplies.filter((r) => isInBatch(r.batchId, activeBatchId)),
    [allDiscussionReplies, activeBatchId]
  );

  // Scheduled upcoming exams sourced strictly from Firestore Calendar (schoolEvents where type === 'exam')
  const upcomingExams = useMemo(() => {
    const parseExamStartMs = (startDate: string, timeStr?: string): number | null => {
      if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
      const datePart = startDate.slice(0, 10);
      let hours = 8;
      let minutes = 30;
      if (timeStr) {
        const cleaned = timeStr.trim();
        const match = cleaned.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const meridiem = match[3]?.toLowerCase();
          if (meridiem === 'pm' && h < 12) h += 12;
          if (meridiem === 'am' && h === 12) h = 0;
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            hours = h;
            minutes = m;
          }
        }
      }
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const dt = new Date(`${datePart}T${hh}:${mm}:00`);
      return Number.isNaN(dt.getTime()) ? null : dt.getTime();
    };

    const parseExamEndMs = (endDate: string, fallbackStartMs: number): number => {
      if (endDate && /^\d{4}-\d{2}-\d{2}/.test(endDate)) {
        const dt = new Date(`${endDate.slice(0, 10)}T23:59:59`);
        if (!Number.isNaN(dt.getTime())) return dt.getTime();
      }
      const d = new Date(fallbackStartMs);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    };

    return allSchoolEvents
      .filter((ev) => ev.type === 'exam' && isInBatch(ev.batchId, activeBatchId))
      .map((ev) => {
        const startMs = parseExamStartMs(ev.startDate, ev.time);
        if (startMs === null) return null;
        const endMs = parseExamEndMs(ev.endDate || ev.startDate, startMs);
        return { event: ev, startMs, endMs };
      })
      .filter((item): item is { event: SchoolEvent; startMs: number; endMs: number } => {
        if (!item) return false;
        return item.endMs >= nowMs;
      })
      .sort((a, b) => a.startMs - b.startMs);
  }, [allSchoolEvents, activeBatchId, nowMs]);

  const nextExamEntry = upcomingExams.find((item) => item.startMs > nowMs) || upcomingExams[0] || null;
  const activeTodayExamEntry = upcomingExams.find((item) => item.startMs <= nowMs && item.endMs >= nowMs) || null;
  const remainingExamQueue = useMemo(() => {
    if (!nextExamEntry) return [];
    return upcomingExams.filter((item) => item.event.id !== nextExamEntry.event.id).slice(0, 3);
  }, [upcomingExams, nextExamEntry]);

  const examCountdown = useMemo(() => {
    if (!nextExamEntry) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isInProgress: false };
    }
    const diffMs = Math.max(0, nextExamEntry.startMs - nowMs);
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return {
      days,
      hours,
      minutes,
      seconds,
      totalMs: diffMs,
      isInProgress: diffMs === 0 && nextExamEntry.endMs >= nowMs,
    };
  }, [nextExamEntry, nowMs]);

  const inferStudyRoomId = (ev: SchoolEvent): string => {
    if (ev.studyRoomId && STUDY_GROUP_ROOMS.some((r) => r.id === ev.studyRoomId)) {
      return ev.studyRoomId;
    }
    const text = `${ev.title} ${ev.description || ''} ${ev.location || ''}`.toLowerCase();
    if (text.includes('math') || text.includes('calculus') || text.includes('mechanics')) return 'cmath';
    if (text.includes('bio') || text.includes('genetics') || text.includes('cell')) return 'bio';
    if (text.includes('phys') || text.includes('optic') || text.includes('wave')) return 'physics';
    if (text.includes('chem') || text.includes('organic') || text.includes('titration')) return 'chemistry';
    if (text.includes('ict') || text.includes('code') || text.includes('program') || text.includes('database')) return 'ict';
    return 'general';
  };

  // Upcoming Peer Study Group sessions fetched dynamically from Firestore Calendar events
  const upcomingStudySessions = useMemo(() => {
    const parseSessionStartMs = (startDate: string, timeStr?: string): number | null => {
      if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
      const datePart = startDate.slice(0, 10);
      let hours = 14;
      let minutes = 0;
      if (timeStr) {
        const match = timeStr.trim().match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const meridiem = match[3]?.toLowerCase();
          if (meridiem === 'pm' && h < 12) h += 12;
          if (meridiem === 'am' && h === 12) h = 0;
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            hours = h;
            minutes = m;
          }
        }
      }
      const dt = new Date(`${datePart}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      return Number.isNaN(dt.getTime()) ? null : dt.getTime();
    };

    const studyKeywordRegex = /\b(study\s*group|peer\s*study|study\s*room|group\s*study|study\s*session)\b/i;

    return allSchoolEvents
      .filter((ev) => {
        if (!isInBatch(ev.batchId, activeBatchId)) return false;
        const isStudySession =
          ev.type === 'study_group' ||
          Boolean(ev.studyRoomId) ||
          studyKeywordRegex.test(`${ev.title || ''} ${ev.description || ''}`);
        return isStudySession;
      })
      .map((ev) => {
        const startMs = parseSessionStartMs(ev.startDate, ev.time);
        if (startMs === null) return null;
        const endDateStr = ev.endDate && /^\d{4}-\d{2}-\d{2}/.test(ev.endDate) ? ev.endDate.slice(0, 10) : ev.startDate.slice(0, 10);
        const endDt = new Date(`${endDateStr}T23:59:59`);
        const endMs = Number.isNaN(endDt.getTime()) ? startMs + 6 * 3600 * 1000 : endDt.getTime();
        return {
          event: ev,
          startMs,
          endMs,
          defaultRoomId: inferStudyRoomId(ev),
        };
      })
      .filter((item): item is { event: SchoolEvent; startMs: number; endMs: number; defaultRoomId: string } => {
        if (!item) return false;
        return item.endMs >= nowMs;
      })
      .sort((a, b) => a.startMs - b.startMs);
  }, [allSchoolEvents, activeBatchId, nowMs]);

  const batchStudyRequests = useMemo(
    () => allStudyGroupRequests.filter((r) => isInBatch(r.batchId, activeBatchId)),
    [allStudyGroupRequests, activeBatchId]
  );

  const myStudyRequests = useMemo(() => {
    if (!userProfile?.userId) return [];
    return batchStudyRequests.filter((r) => r.studentId === userProfile.userId);
  }, [batchStudyRequests, userProfile?.userId]);

  const handleRequestJoinStudyRoom = async (ev: SchoolEvent, targetRoomId: string) => {
    if (!userProfile?.userId) {
      setStudyReqNotice({ type: 'error', message: 'Please sign in as a student to request joining a study room.' });
      return;
    }
    const roomObj = STUDY_GROUP_ROOMS.find((r) => r.id === targetRoomId) || STUDY_GROUP_ROOMS[0];
    const roomName = ev.studyRoomId === targetRoomId && ev.studyRoomName ? ev.studyRoomName : roomObj.name;
    const reqKey = `${ev.id}__${targetRoomId}`;
    const docId = `${ev.id}__${targetRoomId}__${userProfile.userId}`;
    const targetBatchId = resolveItemBatchId(ev.batchId || userProfile.batchId || activeBatchId);
    const targetBatchName = getBatchName(targetBatchId);
    const trimmedNote = (studyNoteByEventId[ev.id] || '').trim().slice(0, 240);

    setSubmittingStudyReqKey(reqKey);
    setStudyReqNotice(null);
    try {
      const nowIso = new Date().toISOString();
      const payload: StudyGroupJoinRequest = {
        id: docId,
        eventId: ev.id,
        eventTitle: ev.title,
        eventDate: ev.startDate,
        eventTime: ev.time || '14:00',
        eventLocation: ev.location || 'Study Hall / Online Room',
        roomId: targetRoomId,
        roomName,
        studentId: userProfile.userId,
        studentName: userProfile.fullName || userProfile.username || 'Student Scholar',
        studentEmail: userProfile.email,
        studentIndex: studentIndexNumber,
        batchId: targetBatchId,
        batchName: targetBatchName,
        note: trimmedNote || undefined,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(doc(db, 'studyGroupRequests', docId), sanitizeFirestoreDoc(payload), { merge: true });
      setStudyNoteByEventId((prev) => ({ ...prev, [ev.id]: '' }));
      setStudyReqNotice({
        type: 'success',
        message: `Join request sent for "${roomName}" study room (${ev.title}).`,
      });
      window.setTimeout(() => setStudyReqNotice(null), 4500);
    } catch (err) {
      setStudyReqNotice({ type: 'error', message: 'Could not submit study room join request. Please try again.' });
      handleFirestoreError(err, OperationType.WRITE, `studyGroupRequests/${docId}`);
    } finally {
      setSubmittingStudyReqKey(null);
    }
  };

  const handleWithdrawStudyRequest = async (requestId: string) => {
    setSubmittingStudyReqKey(requestId);
    try {
      await deleteDoc(doc(db, 'studyGroupRequests', requestId));
      setStudyReqNotice({ type: 'success', message: 'Study room join request withdrawn.' });
      window.setTimeout(() => setStudyReqNotice(null), 3500);
    } catch (err) {
      setStudyReqNotice({ type: 'error', message: 'Failed to withdraw request.' });
      handleFirestoreError(err, OperationType.DELETE, `studyGroupRequests/${requestId}`);
    } finally {
      setSubmittingStudyReqKey(null);
    }
  };

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
    () => attendance.filter((rec) => isAttendanceRecordActive(rec, dayControlsMap, undefined, activeBatchId)),
    [attendance, dayControlsMap, activeBatchId]
  );

  const last30DaysAttendance = React.useMemo(() => {
    const toLocalIsoDate = (dt: Date): string => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const nowDate = new Date();
    const localTodayStr = toLocalIsoDate(nowDate);
    const utcTodayStr = nowDate.toISOString().split('T')[0];
    const anchorStr = utcTodayStr > localTodayStr ? utcTodayStr : localTodayStr;
    const anchorDate = new Date(`${anchorStr}T00:00:00`);

    // Group student's real saved attendance entries by YYYY-MM-DD date
    const byDate = new Map<
      string,
      Array<{ status: 'present' | 'late' | 'excused' | 'absent'; subject: string; timeSlot: string }>
    >();

    activeAttendanceRecords.forEach((rec) => {
      const status = resolveStudentStatusInRecord(rec, candidateStudentIds);
      if (!status || !rec.date) return;
      const list = byDate.get(rec.date) || [];
      list.push({
        status,
        subject: rec.sessionSubject || 'Daily Roll-Call',
        timeSlot: rec.timeSlot || '',
      });
      byDate.set(rec.date, list);
    });

    const days: Array<{
      date: string;
      shortDate: string;
      axisLabel: string;
      fullDate: string;
      hasRecord: boolean;
      present: number;
      late: number;
      excused: number;
      absent: number;
      totalSessions: number;
      realRate: number | null;
      chartRate: number | null;
      barColor: string;
      sessions: Array<{ status: 'present' | 'late' | 'excused' | 'absent'; subject: string; timeSlot: string }>;
    }> = [];

    for (let offset = 29; offset >= 0; offset--) {
      const d = new Date(anchorDate);
      d.setDate(anchorDate.getDate() - offset);
      const dateStr = toLocalIsoDate(d);
      const entries = byDate.get(dateStr) || [];

      let present = 0;
      let late = 0;
      let excused = 0;
      let absent = 0;

      entries.forEach((entry) => {
        if (entry.status === 'present') present++;
        else if (entry.status === 'late') late++;
        else if (entry.status === 'excused') excused++;
        else if (entry.status === 'absent') absent++;
      });

      const totalSessions = entries.length;
      const hasRecord = totalSessions > 0;
      const realRate = hasRecord
        ? Math.round(((present + excused + late * 0.5) / totalSessions) * 100)
        : null;

      // Ensure an explicitly marked 0% (Absent) day still draws a slim red indicator bar,
      // while days with no marked attendance remain empty (null).
      const chartRate = hasRecord ? Math.max(realRate ?? 0, 7) : null;
      const barColor = !hasRecord
        ? 'transparent'
        : (realRate ?? 0) >= 85
        ? '#10b981'
        : (realRate ?? 0) > 0
        ? '#f59e0b'
        : '#ef4444';

      const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const axisLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      const fullDate = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      days.push({
        date: dateStr,
        shortDate,
        axisLabel,
        fullDate,
        hasRecord,
        present,
        late,
        excused,
        absent,
        totalSessions,
        realRate,
        chartRate,
        barColor,
        sessions: entries,
      });
    }

    const markedDays = days.filter((d) => d.hasRecord);
    const totalSessions = markedDays.reduce((s, d) => s + d.totalSessions, 0);
    const presentSessions = markedDays.reduce((s, d) => s + d.present + d.excused, 0);
    const lateSessions = markedDays.reduce((s, d) => s + d.late, 0);
    const absentSessions = markedDays.reduce((s, d) => s + d.absent, 0);
    const avgRate =
      totalSessions > 0
        ? Math.round(((presentSessions + lateSessions * 0.5) / totalSessions) * 100)
        : null;
    const punctualityRate =
      presentSessions + lateSessions > 0
        ? Math.round((presentSessions / (presentSessions + lateSessions)) * 100)
        : null;

    return {
      days,
      markedDaysCount: markedDays.length,
      totalSessions,
      presentSessions,
      lateSessions,
      absentSessions,
      avgRate,
      punctualityRate,
      startDateLabel: days[0]?.shortDate || '',
      endDateLabel: days[days.length - 1]?.shortDate || '',
    };
  }, [activeAttendanceRecords, candidateStudentIds]);

  const studentAttTotal = activeAttendanceRecords.filter(
    (rec) => resolveStudentStatusInRecord(rec, candidateStudentIds) !== undefined
  ).length;
  const studentAttPresent = activeAttendanceRecords.filter((rec) => {
    const st = resolveStudentStatusInRecord(rec, candidateStudentIds);
    return st === 'present' || st === 'late' || st === 'excused';
  }).length;
  const studentAttAvgNum = last30DaysAttendance.avgRate;
  const studentAttRate =
    studentAttTotal > 0
      ? `${Math.round(
          (activeAttendanceRecords.reduce((sum, rec) => {
            const st = resolveStudentStatusInRecord(rec, candidateStudentIds);
            if (!st) return sum;
            return sum + (st === 'present' || st === 'excused' ? 1 : st === 'late' ? 0.5 : 0);
          }, 0) /
            studentAttTotal) *
            100
        )}%`
      : '—';

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
              <span>Zahira College Mawanella • {activeBatchName} Scholar Portal</span>
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
              onClick={() => onNavigate('timetable')}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-3 text-xs font-semibold text-white transition-colors"
              title="View your weekly class timetable"
            >
              <Clock className="w-4 h-4 text-amber-300" />
              <span>Class Timetable</span>
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

      {/* UPCOMING EXAMS & LIVE COUNTDOWN WIDGET */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-7 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60">
              <Timer className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
                  Upcoming Exams &amp; Countdown
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-2.5 py-0.5 border border-slate-200 dark:border-slate-700">
                  {activeBatchName}
                </span>
                {upcomingExams.length > 0 && (
                  <span className="rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-2.5 py-0.5 border border-rose-200 dark:border-rose-800">
                    {upcomingExams.length} Scheduled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Live countdown calculated from official Academic Calendar examination dates.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 self-start sm:self-auto"
          >
            <Calendar className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Open Exam Calendar</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {nextExamEntry ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Primary Next Exam Spotlight + Live Ticking Countdown */}
            <div className="lg:col-span-7 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/40 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900 p-5 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      examCountdown.isInProgress
                        ? 'bg-emerald-600 text-white'
                        : examCountdown.days === 0 && examCountdown.totalMs > 0
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    <GraduationCap className="w-3 h-3" />
                    <span>
                      {examCountdown.isInProgress
                        ? 'Exam Scheduled Today'
                        : examCountdown.days === 0
                        ? 'Starting Within 24 Hours'
                        : 'Next Scheduled Exam'}
                    </span>
                  </span>

                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {new Date(`${nextExamEntry.event.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <h4 className="font-serif text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                  {nextExamEntry.event.title}
                </h4>

                {nextExamEntry.event.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {nextExamEntry.event.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>{nextExamEntry.event.time || '08:30 AM'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>{nextExamEntry.event.location || 'Zahira College Mawanella'}</span>
                  </span>
                  {nextExamEntry.event.batchId && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Layers className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>{getBatchName(nextExamEntry.event.batchId)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 4-Tile Live Countdown Display */}
              {examCountdown.isInProgress ? (
                <div className="rounded-xl bg-emerald-600/10 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Examination Window Active Today</p>
                      <p className="text-[11px] opacity-85">Best wishes for your examination paper.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Time remaining until next exam">
                  {[
                    { label: 'Days', value: examCountdown.days },
                    { label: 'Hours', value: examCountdown.hours },
                    { label: 'Mins', value: examCountdown.minutes },
                    { label: 'Secs', value: examCountdown.seconds },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-white/90 dark:bg-slate-950/70 px-2 py-2.5 text-center shadow-2xs"
                    >
                      <p className="font-mono text-2xl sm:text-3xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums leading-none">
                        {String(unit.value).padStart(2, '0')}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1.5">
                        {unit.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Exam Schedule Queue */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Subsequent Exam Schedule
                </span>
                {activeTodayExamEntry && activeTodayExamEntry.event.id !== nextExamEntry.event.id && (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                    1 Exam Active Today
                  </span>
                )}
              </div>

              {remainingExamQueue.length > 0 ? (
                <div className="space-y-2.5 flex-1">
                  {remainingExamQueue.map((item) => {
                    const daysUntil = Math.max(0, Math.ceil((item.startMs - nowMs) / (1000 * 60 * 60 * 24)));
                    return (
                      <div
                        key={item.event.id}
                        onClick={() => onNavigate('calendar')}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-rose-300 dark:hover:border-rose-700 transition-colors cursor-pointer flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.event.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {new Date(`${item.event.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            • {item.event.time || '08:30'} • {item.event.location || 'Exam Hall'}
                          </p>
                        </div>
                        <span className="rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-1 text-[10px] font-bold whitespace-nowrap shrink-0">
                          {daysUntil === 0 ? 'Today' : `${daysUntil}d left`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
                  <Calendar className="w-6 h-6 text-slate-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Only 1 upcoming exam on calendar
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Additional exam dates published in the Academic Calendar will appear here automatically.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => onNavigate('assessments')}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-amber-600" />
                <span>Review Past Marks &amp; Papers</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <h4 className="font-serif text-base font-bold text-slate-900 dark:text-slate-100">
              No Upcoming Exams Scheduled
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              There are currently no future exam dates marked on the Academic Calendar for {activeBatchName}. Once faculty publish an exam event, the live countdown timer will start automatically.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Check Academic Calendar</span>
            </button>
          </div>
        )}
      </div>

      {/* PEER STUDY GROUP WIDGET (CALENDAR SESSIONS + ROOM JOIN REQUESTS) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-7 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200/80 dark:border-violet-800/60">
              <Users className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
                  Peer Study Group
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-2.5 py-0.5 border border-slate-200 dark:border-slate-700">
                  {activeBatchName}
                </span>
                {upcomingStudySessions.length > 0 && (
                  <span className="rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[10px] font-bold px-2.5 py-0.5 border border-violet-200 dark:border-violet-800">
                    {upcomingStudySessions.length} Upcoming Session{upcomingStudySessions.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upcoming group study sessions from the Academic Calendar — select a study room and request to join peers.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('discussions')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 px-3.5 py-2 text-xs font-bold text-violet-800 dark:text-violet-300 transition-colors"
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Discussion Rooms</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Study Calendar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {studyReqNotice && (
          <div
            className={`mt-4 rounded-xl border px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 ${
              studyReqNotice.type === 'success'
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {studyReqNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{studyReqNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStudyReqNotice(null)}
              className="opacity-70 hover:opacity-100 p-0.5"
              aria-label="Dismiss study request notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {upcomingStudySessions.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingStudySessions.slice(0, 4).map((session) => {
              const ev = session.event;
              const chosenRoomId = selectedRoomByEventId[ev.id] || session.defaultRoomId;
              const chosenRoom = STUDY_GROUP_ROOMS.find((r) => r.id === chosenRoomId) || STUDY_GROUP_ROOMS[0];
              const existingReq = myStudyRequests.find(
                (r) => r.eventId === ev.id && r.roomId === chosenRoomId
              );
              const sessionRequestsCount = batchStudyRequests.filter((r) => r.eventId === ev.id).length;
              const reqKey = `${ev.id}__${chosenRoomId}`;
              const isSubmitting = submittingStudyReqKey === reqKey || (existingReq ? submittingStudyReqKey === existingReq.id : false);

              return (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/30 dark:from-violet-950/25 dark:via-slate-900 dark:to-slate-900 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/80 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          <Users className="w-3 h-3" />
                          <span>Study Session</span>
                        </span>
                        {ev.studyRoomName && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-bold">
                            <Hash className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" />
                            <span>{ev.studyRoomName}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {sessionRequestsCount} peer{sessionRequestsCount === 1 ? '' : 's'} joined/requested
                      </span>
                    </div>

                    <h4 className="font-serif text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {ev.title}
                    </h4>

                    {ev.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {ev.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                        <span>
                          {new Date(`${ev.startDate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                        <span>{ev.time || '14:00'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                        <span>{ev.location || 'Science Complex Study Hall'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Specific Study Room Selector & Join Request Action */}
                  <div className="space-y-2.5 pt-3 border-t border-violet-200/60 dark:border-violet-900/40">
                    <div>
                      <label
                        htmlFor={`study-room-select-${ev.id}`}
                        className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Select Study Room
                      </label>
                      <select
                        id={`study-room-select-${ev.id}`}
                        value={chosenRoomId}
                        onChange={(e) =>
                          setSelectedRoomByEventId((prev) => ({
                            ...prev,
                            [ev.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                      >
                        {STUDY_GROUP_ROOMS.map((room) => (
                          <option key={room.id} value={room.id}>
                            #{room.name} — {room.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    {existingReq ? (
                      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-white/90 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {existingReq.status === 'approved' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : existingReq.status === 'declined' ? (
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          ) : (
                            <Hourglass className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {existingReq.status === 'approved'
                                ? `Approved for #${existingReq.roomName}`
                                : existingReq.status === 'declined'
                                ? `Declined for #${existingReq.roomName}`
                                : `Request Pending (#${existingReq.roomName})`}
                            </p>
                            {existingReq.note && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                Topic: {existingReq.note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {existingReq.status === 'approved' ? (
                            <button
                              type="button"
                              onClick={() => onNavigate('discussions')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              <span>Enter Room</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleWithdrawStudyRequest(existingReq.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Withdraw</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={studyNoteByEventId[ev.id] || ''}
                          onChange={(e) =>
                            setStudyNoteByEventId((prev) => ({
                              ...prev,
                              [ev.id]: e.target.value,
                            }))
                          }
                          placeholder={`Optional focus topic for #${chosenRoom.name}...`}
                          maxLength={140}
                          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                        />
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleRequestJoinStudyRoom(ev, chosenRoomId)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors shadow-xs shrink-0"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{isSubmitting ? 'Sending...' : 'Request to Join'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 mb-3">
              <Users className="w-5 h-5" />
            </div>
            <h4 className="font-serif text-base font-bold text-slate-900 dark:text-slate-100">
              No Upcoming Study Group Sessions
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              No upcoming group study sessions are currently published on the Academic Calendar for {activeBatchName}. Schedule a study group session on the Calendar to invite peers and request a study room.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 px-4 py-2 text-xs font-bold text-white transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule on Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('discussions')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                <span>Open Study Rooms</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Requests Summary Bar (visible whenever the student has submitted room requests) */}
        {myStudyRequests.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                My Study Room Join Requests ({myStudyRequests.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {myStudyRequests.slice(0, 6).map((req) => (
                <div
                  key={req.id}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-1.5 text-xs"
                >
                  <Hash className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span className="font-bold text-slate-800 dark:text-slate-200">{req.roomName}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                    {req.eventTitle}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        : req.status === 'declined'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
              Live assignment submission and coursework milestones synced directly from Firestore for Zahira College {activeBatchName} scholars.
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

      {/* LAST 30 DAYS ATTENDANCE TREND BAR CHART (Synced Strictly With Attendance Marking Page) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs transition-colors space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                Attendance Trend • Last 30 Days
              </h3>
              <span className="rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold px-2.5 py-0.5">
                {last30DaysAttendance.totalSessions > 0
                  ? `${last30DaysAttendance.avgRate}% • ${last30DaysAttendance.markedDaysCount} Active Day(s)`
                  : 'Real-Time Sync Active'}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {last30DaysAttendance.startDateLabel} – {last30DaysAttendance.endDateLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live 30-day attendance bar chart built strictly from real registers saved in the Attendance Marking page (OFF days excluded)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAttChartMode('rate')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  attChartMode === 'rate'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Daily Rate (%)
              </button>
              <button
                type="button"
                onClick={() => setAttChartMode('counts')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  attChartMode === 'counts'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Session Breakdown
              </button>
            </div>

            <button
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Open Attendance Register</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Live 30-Day Attendance Summary Cards (Strictly Real Saved Data) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
            <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider block">
              30-Day Rate
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
                      : studentAttAvgNum >= 75
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {studentAttAvgNum >= 90
                    ? 'Target Met (≥90%)'
                    : studentAttAvgNum >= 75
                    ? 'On Track (≥75%)'
                    : 'Needs Focus (<75%)'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">No logs in 30d</span>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider block">
              Present Sessions (30d)
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-emerald-950 dark:text-emerald-100">
                {last30DaysAttendance.presentSessions}
              </span>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                {last30DaysAttendance.totalSessions > 0
                  ? `of ${last30DaysAttendance.totalSessions} marked`
                  : 'Awaiting roll-call'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
            <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wider block">
              Punctuality &amp; Late (30d)
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-amber-950 dark:text-amber-100">
                {last30DaysAttendance.punctualityRate !== null
                  ? `${last30DaysAttendance.punctualityRate}%`
                  : '—'}
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                {last30DaysAttendance.lateSessions} late arrival(s)
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
            <span className="text-[11px] font-semibold text-rose-900 dark:text-rose-300 uppercase tracking-wider block">
              Absences (30d)
            </span>
            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
              <span className="font-serif text-2xl font-bold text-rose-950 dark:text-rose-100">
                {last30DaysAttendance.absentSessions}
              </span>
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                Saved teacher logs
              </span>
            </div>
          </div>
        </div>

        {last30DaysAttendance.totalSessions === 0 ? (
          <div className="h-64 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
            <LivePaperScannerGraphic accent="emerald" className="w-20 h-20 mb-2" />
            <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">
              No Saved Attendance Marked in the Last 30 Days
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              Once your teacher marks and saves attendance on the Attendance page (with day marking ON), your real 30-day attendance bars will update here automatically in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-full overflow-x-auto pb-1">
              <div className="h-72 min-w-[640px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {attChartMode === 'rate' ? (
                    <BarChart
                      data={last30DaysAttendance.days}
                      margin={{ top: 14, right: 16, left: -16, bottom: 4 }}
                      barCategoryGap="22%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis
                        dataKey="axisLabel"
                        tick={{ fill: textFill, fontSize: 10 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: textFill, fontSize: 11 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(59, 130, 246, 0.06)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const day = payload[0]?.payload as (typeof last30DaysAttendance.days)[number] | undefined;
                          if (!day) return null;
                          return (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg text-xs max-w-xs">
                              <p className="font-bold text-slate-900 dark:text-slate-100">{day.fullDate}</p>
                              {!day.hasRecord ? (
                                <p className="text-slate-400 mt-1">No attendance marked on this date</p>
                              ) : (
                                <div className="mt-1.5 space-y-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-500 dark:text-slate-400">Daily Rate:</span>
                                    <span
                                      className={`font-bold ${
                                        (day.realRate ?? 0) >= 85
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : (day.realRate ?? 0) > 0
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {day.realRate}%
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[11px] pt-0.5">
                                    {day.present > 0 && <span className="text-emerald-600 font-semibold">Present: {day.present}</span>}
                                    {day.late > 0 && <span className="text-amber-600 font-semibold">Late: {day.late}</span>}
                                    {day.excused > 0 && <span className="text-blue-600 font-semibold">Excused: {day.excused}</span>}
                                    {day.absent > 0 && <span className="text-rose-600 font-semibold">Absent: {day.absent}</span>}
                                  </div>
                                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-1 space-y-0.5">
                                    {day.sessions.map((s, i) => (
                                      <div key={i} className="flex items-center justify-between gap-3 text-[10px]">
                                        <span className="text-slate-600 dark:text-slate-300 truncate">
                                          {s.subject}
                                          {s.timeSlot ? ` (${s.timeSlot})` : ''}
                                        </span>
                                        <span className="font-bold uppercase text-slate-800 dark:text-slate-200 shrink-0">
                                          {s.status}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine
                        y={75}
                        stroke="#2563eb"
                        strokeDasharray="4 4"
                        label={{
                          value: '75% Min',
                          fill: '#2563eb',
                          fontSize: 10,
                          position: 'insideTopRight',
                          fontWeight: 'bold',
                        }}
                      />
                      <Bar dataKey="chartRate" radius={[5, 5, 0, 0]} maxBarSize={18}>
                        {last30DaysAttendance.days.map((entry) => (
                          <Cell key={entry.date} fill={entry.barColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart
                      data={last30DaysAttendance.days}
                      margin={{ top: 14, right: 16, left: -16, bottom: 4 }}
                      barCategoryGap="22%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis
                        dataKey="axisLabel"
                        tick={{ fill: textFill, fontSize: 10 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: textFill, fontSize: 11 }}
                        axisLine={{ stroke: gridStroke }}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(59, 130, 246, 0.06)' }}
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          borderColor: tooltipBorder,
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: isDark ? '#f8fafc' : '#0f172a',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        }}
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullDate || ''}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={28}
                        formatter={(val) => (
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize">
                            {val}
                          </span>
                        )}
                      />
                      <Bar dataKey="present" stackId="att" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="excused" stackId="att" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="late" stackId="att" fill="#f59e0b" radius={[0, 0, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="absent" stackId="att" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                  <span>Present (≥85%)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                  <span>Late / Partial (1–84%)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                  <span>Absent (0%)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-700 inline-block" />
                  <span>Blank = No Session Marked</span>
                </span>
              </div>
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                30-Day Window: {last30DaysAttendance.totalSessions} verified session(s)
              </span>
            </div>
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
                  {activeBatchName} subject breakdown &amp; assessment standing
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
        batchId={activeBatchId}
        batchName={activeBatchName}
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
                Zahira College Mawanella • {activeBatchName} Scholar
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
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{activeBatchName}</span>
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
