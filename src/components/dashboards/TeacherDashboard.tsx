import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  GraduationCap,
  FileText,
  Award,
  CalendarCheck2,
  Sparkles,
  ArrowRight,
  BrainCircuit,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Plus,
  TrendingUp,
  BarChart3,
  Activity,
  Users,
  Filter,
  CheckCircle,
  ShieldCheck,
  ChevronRight,
  QrCode,
  RefreshCw,
  AlertTriangle,
  Send,
  FlaskConical,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  SchoolClass,
  Assignment,
  Submission,
  Quiz,
  AttendanceRecord,
  AttendanceDayControl,
  RosterStudent,
  UserProfile,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { sendAdminAttendanceAlert } from '../../services/notificationService';
import {
  LiveMorphIcon,
  LivePaperScannerGraphic,
  LiveOrbitalScienceGraphic,
  HERO_SCIENCE_ICONS,
  LAB_CYCLE_ICONS,
} from '../common/LiveVisuals';
import {
  getMatchingStudentIds,
  getValidAttendanceRecordsMap,
  isAttendanceRecordActive,
  resolveStudentStatusInRecord,
} from '../../utils/attendanceUtils';
import { isFakeSeedRosterStudent } from '../../services/dataService';

interface TeacherDashboardProps {
  onNavigate: (page: string) => void;
  onGradeSubmission?: (sub: Submission) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  onNavigate,
  onGradeSubmission,
}) => {
  const { userProfile } = useAuth();
  const { isDark } = useTheme();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [dayControlsMap, setDayControlsMap] = useState<Record<string, AttendanceDayControl>>({});
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [chartMode, setChartMode] = useState<'rate' | 'breakdown'>('rate');
  const [loading, setLoading] = useState(true);

  // Real-time synchronization
  useEffect(() => {
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: SchoolClass[] = [];
      snap.forEach((d) => list.push(d.data() as SchoolClass));
      setClasses(list);
    });

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
      setAttendanceRecords(list);
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

    const unsubStudents = onSnapshot(collection(db, 'userProfiles'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.role === 'student') list.push(u);
      });
      setStudents(list);
      setLoading(false);
    });

    return () => {
      unsubClasses();
      unsubAssignments();
      unsubSubmissions();
      unsubQuizzes();
      unsubAttendance();
      unsubDaySettings();
      unsubRoster();
      unsubStudents();
    };
  }, []);

  const pendingSubmissions = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review');
  const myClasses = classes;

  const validStudentIds = useMemo(() => {
    const ids = new Set<string>();
    rosterStudents.forEach((r) => ids.add(r.id));
    students.forEach((s) => ids.add(s.userId));
    return ids;
  }, [rosterStudents, students]);

  // Strictly active saved attendance records (only dates where Attendance Marking is ON and real student logs exist)
  const activeAttendanceRecords = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      if (!isAttendanceRecordActive(rec, dayControlsMap, validStudentIds)) return false;
      if (selectedClassId !== 'all' && rec.classId && rec.classId !== selectedClassId) return false;
      return true;
    });
  }, [attendanceRecords, dayControlsMap, selectedClassId, validStudentIds]);

  // Build trend points strictly from real saved registers (supports multiple classes per date)
  const attendanceTrendData = useMemo(() => {
    const sorted = [...activeAttendanceRecords].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    const countByDate = new Map<string, number>();
    sorted.forEach((rec) => countByDate.set(rec.date, (countByDate.get(rec.date) || 0) + 1));

    return sorted.map((rec) => {
      const validRecordsMap = getValidAttendanceRecordsMap(rec, validStudentIds);
      const studentStatuses = Object.values(validRecordsMap);
      let present = 0;
      let absent = 0;
      let late = 0;
      let excused = 0;
      studentStatuses.forEach((status) => {
        if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else if (status === 'late') late++;
        else if (status === 'excused') excused++;
      });

      const total = present + absent + late + excused;
      const rate = total > 0 ? Math.round(((present + excused + late * 0.5) / total) * 100) : 0;

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
      const shortSubject = sessionLabel.length > 10 ? `${sessionLabel.slice(0, 9)}…` : sessionLabel;

      return {
        id: rec.id,
        date: rec.date,
        displayDate: hasMultipleToday ? `${shortDate} (${shortSubject})` : shortDate,
        fullDate,
        sessionLabel,
        timeSlot: rec.timeSlot || '',
        present,
        absent,
        late,
        excused,
        total,
        rate,
      };
    });
  }, [activeAttendanceRecords, validStudentIds]);

  // Real Attendance KPIs strictly from saved active sessions (zero fake fallback numbers)
  const kpis = useMemo(() => {
    if (attendanceTrendData.length === 0) {
      return {
        hasData: false,
        avgRate: null as number | null,
        peakRate: null as number | null,
        totalAbsences: 0,
        totalLate: 0,
        onTimeRate: null as number | null,
        totalSessions: 0,
      };
    }
    const totalRate = attendanceTrendData.reduce((acc, curr) => acc + curr.rate, 0);
    const avgRate = Math.round(totalRate / attendanceTrendData.length);
    const peakRate = Math.max(...attendanceTrendData.map((d) => d.rate));
    const totalAbsences = attendanceTrendData.reduce((acc, curr) => acc + curr.absent, 0);
    const totalLate = attendanceTrendData.reduce((acc, curr) => acc + curr.late, 0);
    const totalPresent = attendanceTrendData.reduce((acc, curr) => acc + curr.present, 0);
    const onTimeRate =
      totalPresent + totalLate > 0 ? Math.round((totalPresent / (totalPresent + totalLate)) * 100) : null;

    return {
      hasData: true,
      avgRate,
      peakRate,
      totalAbsences,
      totalLate,
      onTimeRate,
      totalSessions: attendanceTrendData.length,
    };
  }, [attendanceTrendData]);

  // Individual student attendance rate calculation strictly from saved active records (<75% threshold)
  const studentAttendanceStats = useMemo(() => {
    return students
      .map((st) => {
        const candidateIds = getMatchingStudentIds(st, rosterStudents);
        let sessions = 0;
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;

        activeAttendanceRecords.forEach((rec) => {
          const status = resolveStudentStatusInRecord(rec, candidateIds);
          if (status) {
            sessions++;
            if (status === 'present' || status === 'excused') presentCount++;
            else if (status === 'late') lateCount++;
            else if (status === 'absent') absentCount++;
          }
        });

        if (sessions === 0) return null;

        const rate = Math.round(((presentCount + lateCount * 0.5) / sessions) * 100);
        const indexNumber =
          st.indexNumber ||
          (st.bio?.includes('Index:') ? st.bio.split('Index:')[1].split('•')[0].trim() : undefined);

        return {
          userId: st.userId,
          fullName: st.fullName || 'Scholar',
          email: st.email,
          indexNumber,
          sessions,
          presentCount,
          lateCount,
          absentCount,
          attendanceRate: rate,
          isBelowThreshold: rate < 75,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [students, rosterStudents, activeAttendanceRecords]);

  const atRiskStudents = useMemo(() => {
    return studentAttendanceStats.filter((s) => s.isBelowThreshold);
  }, [studentAttendanceStats]);

  const [alertDispatchedMap, setAlertDispatchedMap] = useState<Record<string, boolean>>({});

  // Automated notification dispatch to Admin portal when a student drops below 75%
  useEffect(() => {
    if (atRiskStudents.length === 0) return;
    const today = new Date().toISOString().split('T')[0];

    atRiskStudents.forEach((st) => {
      const storageKey = `zahira_low_att_admin_alert_${st.userId}_${today}`;
      const alreadySent = localStorage.getItem(storageKey);

      if (!alreadySent) {
        sendAdminAttendanceAlert({
          studentId: st.userId,
          studentName: st.fullName,
          studentIndex: st.indexNumber,
          attendanceRate: st.attendanceRate,
          totalSessions: st.sessions,
          classId: selectedClassId !== 'all' ? selectedClassId : 'general',
        });
        localStorage.setItem(storageKey, 'true');
        setAlertDispatchedMap((prev) => ({ ...prev, [st.userId]: true }));
      } else {
        setAlertDispatchedMap((prev) => ({ ...prev, [st.userId]: true }));
      }
    });
  }, [atRiskStudents, selectedClassId]);

  const handleManualDispatchAlert = async (student: (typeof studentAttendanceStats)[0]) => {
    await sendAdminAttendanceAlert({
      studentId: student.userId,
      studentName: student.fullName,
      studentIndex: student.indexNumber,
      attendanceRate: student.attendanceRate,
      totalSessions: student.sessions,
      classId: selectedClassId !== 'all' ? selectedClassId : 'general',
    });
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(`zahira_low_att_admin_alert_${student.userId}_${today}`, 'true');
    setAlertDispatchedMap((prev) => ({ ...prev, [student.userId]: true }));
  };

  // Custom tooltip for Recharts attendance charts
  const CustomAttendanceTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isExcellence = data.rate >= 90;
      const isModerate = data.rate >= 80 && data.rate < 90;

      return (
        <div
          className={`p-3.5 rounded-xl border shadow-xl text-xs backdrop-blur-md transition-all ${
            isDark
              ? 'bg-slate-900/95 border-slate-700 text-white'
              : 'bg-white/95 border-blue-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/50 pb-2 mb-2">
            <p className="font-bold text-[12px] flex items-center gap-1.5">
              <CalendarCheck2 className="w-3.5 h-3.5 text-blue-600" />
              <span>{data.fullDate}</span>
            </p>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isExcellence
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                  : isModerate
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300'
              }`}
            >
              {data.rate}% Attendance
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50">
              <span className="block text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                {data.present}
              </span>
              <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">Present</span>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50">
              <span className="block text-amber-700 dark:text-amber-400 font-bold text-sm">
                {data.late}
              </span>
              <span className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">Late</span>
            </div>
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/50">
              <span className="block text-red-700 dark:text-red-400 font-bold text-sm">
                {data.absent}
              </span>
              <span className="text-[10px] text-red-800 dark:text-red-300 font-medium">Absent</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-blue-700 dark:text-blue-300 font-semibold">
            <span className="truncate">{data.sessionLabel}{data.timeSlot ? ` (${data.timeSlot})` : ''}</span>
            <span className="flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3 h-3 text-blue-600" />
              <span>Saved Log</span>
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Welcome Banner - Blue, White, Red Collegiate Theme */}
      <div className="live-gradient-banner relative overflow-hidden rounded-2xl border border-blue-900 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-6 md:p-8 text-white shadow-xl">
        <LiveOrbitalScienceGraphic className="w-24 h-24 opacity-20 pointer-events-none hidden xl:block absolute right-6 top-3" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <LiveMorphIcon icons={HERO_SCIENCE_ICONS} intervalMs={2200} className="w-3.5 h-3.5" />
              <span>Zahira College Mawanella • Faculty Workspace</span>
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-white mt-2 flex items-center flex-wrap gap-2">
              <span>Welcome back, {userProfile?.fullName || 'Faculty Instructor'}</span>
              {userProfile?.subject && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-600/30 text-white border border-red-400 font-sans font-semibold">
                  {userProfile.subject}
                </span>
              )}
            </h2>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              You are managing the Zahira College 2k28 Science EM cohort. You have {pendingSubmissions.length} coursework submission(s) awaiting grading review. Gemini Flash AI is active.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigate('labs')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md"
            >
              <LiveMorphIcon icons={LAB_CYCLE_ICONS} intervalMs={2100} className="w-4 h-4 text-emerald-200" />
              <span>Virtual Science Labs</span>
            </button>
            <button
              onClick={() => onNavigate('quizzes')}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              <span>Gemini Flash Quiz Generator</span>
            </button>
            <button
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              <CalendarCheck2 className="w-4 h-4" />
              <span>Calendar & Attendance</span>
            </button>
            <button
              onClick={() => onNavigate('teacher_assistant')}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>Lesson Planner</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Assigned Classes</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <LiveMorphIcon icons={[GraduationCap, Users, BookOpen]} intervalMs={2600} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-stone-900 mt-2">{myClasses.length}</p>
          <p className="text-[11px] text-stone-500 mt-2">2k28 Science EM (A/L Batch 2028)</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Grading</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <LiveMorphIcon icons={[FileText, Clock, CheckCircle2]} intervalMs={3000} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-stone-900 mt-2">{pendingSubmissions.length}</p>
          <div className="flex items-center gap-1 mt-2 text-[11px] text-amber-700 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Gemini Flash rubric ready</span>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Quizzes</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
              <LiveMorphIcon icons={[FileCheck2, Sparkles, BrainCircuit]} intervalMs={3400} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-stone-900 mt-2">{quizzes.length}</p>
          <p className="text-[11px] text-stone-500 mt-2">Auto-scored objective questions</p>
        </div>

        <div
          onClick={() => onNavigate('attendance')}
          className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-all cursor-pointer hover:border-blue-400 group"
        >
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Saved Attendance</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
              <LiveMorphIcon icons={[CalendarCheck2, TrendingUp, Activity]} intervalMs={2800} className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl font-bold text-stone-900 mt-2">
            {kpis.hasData && kpis.avgRate !== null ? `${kpis.avgRate}%` : '—'}
          </p>
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="text-emerald-700 font-medium">
              {kpis.hasData ? `${kpis.totalSessions} saved session(s)` : 'No saved active logs'}
            </span>
            <span className="text-blue-600 font-bold group-hover:underline flex items-center gap-0.5">
              <span>Inspect</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Saved Student Attendance Trends Visualizer (Recharts - Zero Fake Data) */}
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-xs space-y-6">
        {/* Chart Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-blue-50">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-900 border border-blue-200 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
              <span>Zahira College 2k28 Science EM • Saved Attendance Only</span>
            </div>
            <h3 className="font-serif text-xl font-bold text-blue-950 flex items-center gap-2">
              <span>Saved Student Attendance Trends</span>
              <span className="text-xs font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                {kpis.hasData && kpis.avgRate !== null ? `${kpis.avgRate}% Avg Rate` : 'Awaiting Saved Logs'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Plotted strictly from saved class attendance registers on days where Attendance Marking is turned ON.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Class Filter */}
            <div className="flex items-center gap-1 bg-slate-50 rounded-xl border border-slate-200 px-2 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-transparent font-medium text-slate-700 focus:outline-none text-xs pr-1"
              >
                <option value="all">All Assigned Cohorts</option>
                {myClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 text-xs font-semibold">
              <button
                onClick={() => setChartMode('rate')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  chartMode === 'rate'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Rate (%)</span>
              </button>
              <button
                onClick={() => setChartMode('breakdown')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  chartMode === 'breakdown'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Counts Breakdown</span>
              </button>
            </div>

            {/* Quick Action: Take Roll Call */}
            <button
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-1.5 text-xs transition-colors shadow-xs"
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              <span>Mark Roll Call</span>
            </button>
          </div>
        </div>

        {/* Saved Attendance KPI Summary Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100">
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider block">
              Saved Average
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif text-2xl font-bold text-blue-950">
                {kpis.hasData && kpis.avgRate !== null ? `${kpis.avgRate}%` : '—'}
              </span>
              {kpis.hasData && kpis.avgRate !== null ? (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    kpis.avgRate >= 90
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {kpis.avgRate >= 90 ? 'Target Met (≥90%)' : 'Needs Focus (<90%)'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">No logs yet</span>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
            <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider block">
              Peak Session Rate
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif text-2xl font-bold text-emerald-950">
                {kpis.hasData && kpis.peakRate !== null ? `${kpis.peakRate}%` : '—'}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">
                {kpis.hasData ? `${kpis.totalSessions} saved class(es)` : 'Mark attendance'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-sky-50/60 border border-sky-100">
            <span className="text-[11px] font-semibold text-sky-900 uppercase tracking-wider block">
              Punctuality Rate
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif text-2xl font-bold text-sky-950">
                {kpis.hasData && kpis.onTimeRate !== null ? `${kpis.onTimeRate}%` : '—'}
              </span>
              <span className="text-[11px] text-sky-700 font-medium">{kpis.totalLate} late total</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100">
            <span className="text-[11px] font-semibold text-rose-900 uppercase tracking-wider block">
              Total Absences
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-serif text-2xl font-bold text-rose-950">{kpis.totalAbsences}</span>
              <span className="text-[11px] text-rose-700 font-medium">Saved student logs</span>
            </div>
          </div>
        </div>

        {/* Recharts Chart Canvas or Clean Empty State */}
        <div className="w-full h-80 pt-2">
          {attendanceTrendData.length === 0 ? (
            <div className="h-full w-full rounded-2xl border border-dashed border-blue-200 bg-slate-50/60 flex flex-col items-center justify-center text-center p-6">
              <LivePaperScannerGraphic accent="blue" className="w-20 h-20 mb-2" />
              <h4 className="font-serif text-base font-bold text-slate-800">
                No Saved Active Attendance Records Yet
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Only attendance saved on days with <strong>Attendance: ON</strong> appears here. Dates turned OFF or unmarked days never show synthetic estimates.
              </p>
              <button
                onClick={() => onNavigate('attendance')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
              >
                <CalendarCheck2 className="w-3.5 h-3.5" />
                <span>Open Attendance Register</span>
              </button>
            </div>
          ) : chartMode === 'rate' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="teacherAttendanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomAttendanceTooltip />} />
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
                <Area
                  type="monotone"
                  dataKey="rate"
                  name="Attendance Rate (%)"
                  stroke="#1e3a8a"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#teacherAttendanceGradient)"
                  dot={{ r: 3.5, fill: '#1e3a8a', strokeWidth: 1 }}
                  activeDot={{ r: 5.5, fill: '#dc2626', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomAttendanceTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(val) => <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{val}</span>}
                />
                <Bar dataKey="present" name="Present Scholars" fill="#10b981" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="late" name="Late Arrivals" fill="#f59e0b" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="absent" name="Absent" fill="#dc2626" radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart Card Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Institutional 90% attendance policy applies to all 2k28 Science EM academic term evaluations.</span>
          </div>

          <button
            onClick={() => onNavigate('attendance')}
            className="text-xs font-bold text-blue-900 hover:text-blue-700 flex items-center gap-1 shrink-0 self-end sm:self-auto"
          >
            <span>Open Attendance Register & QR Session</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Low Attendance Intervention & Automated Admin Alerts (< 75% Threshold) */}
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/70 via-white to-amber-50/40 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold text-slate-900">
                  Low Attendance Threshold Intervention (&lt; 75%)
                </h3>
                <span className="rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold">
                  Automated Directorate Alerts Active
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Students below 75% attendance are automatically flagged and dispatched as priority intervention notifications to the Directorate portal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-600">
              At-Risk Scholars: <strong className="text-rose-700">{atRiskStudents.length}</strong>
            </span>
            <button
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors shadow-2xs"
            >
              <span>Manage Register</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {atRiskStudents.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-emerald-900 font-medium">
                <strong>Cohort Attendance Optimal:</strong> All 2k28 Science EM students are currently maintaining attendance above the 75% institutional alert threshold.
              </p>
            </div>
            <span className="text-[11px] text-emerald-700 font-bold shrink-0">
              Directorate Status: Clear
            </span>
          </div>
        ) : (
          <div className="divide-y divide-rose-100 rounded-xl border border-rose-200 bg-white overflow-hidden shadow-2xs">
            {atRiskStudents.map((st) => {
              const isSent = alertDispatchedMap[st.userId];
              return (
                <div
                  key={st.userId}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/30 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs shrink-0">
                      {st.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{st.fullName}</span>
                        {st.indexNumber && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            {st.indexNumber}
                          </span>
                        )}
                        <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-extrabold">
                          {st.attendanceRate}% Attendance
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {st.absentCount} absences recorded across {st.sessions} sessions ({st.email || 'Email on file'})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                      <span>{isSent ? 'Dispatched to Directorate' : 'Directorate Alert Queued'}</span>
                    </div>
                    <button
                      onClick={() => handleManualDispatchAlert(st)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-colors shadow-2xs"
                    >
                      <Send className="w-3 h-3" />
                      <span>Re-send Alert</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Action Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submissions Pending Grading - 2 columns */}
        <div className="lg:col-span-2 rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-stone-900">
                Pending Submissions Review
              </h3>
              <p className="text-xs text-stone-500">
                Evaluate student coursework with Gemini Flash AI rubric suggestions
              </p>
            </div>
            <button
              onClick={() => onNavigate('assignments')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              <span>View All Assignments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {pendingSubmissions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-stone-50 border border-stone-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-800">All submissions graded!</p>
                <p className="text-xs text-stone-500 mt-1">There are no pending submissions awaiting review right now.</p>
              </div>
            ) : (
              pendingSubmissions.map((sub) => {
                const parentAssign = assignments.find((a) => a.id === sub.assignmentId);
                return (
                  <div
                    key={sub.id}
                    className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white hover:border-amber-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-stone-900">{sub.studentName}</h4>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                          Pending Review
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 mt-1 line-clamp-1">
                        {parentAssign?.title || 'Academic Assignment Submission'}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        Submitted: {new Date(sub.submittedAt).toLocaleString()}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        if (onGradeSubmission) {
                          onGradeSubmission(sub);
                        } else {
                          onNavigate('assignments');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Grade with AI</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Tools & Academic Shortcuts - 1 column */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
            <h3 className="font-serif text-lg font-bold text-stone-900 mb-3">
              Faculty AI Assistant Suite
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Accelerate curriculum preparation and grading with Gemini Flash AI.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('quizzes')}
                className="flex items-center justify-between w-full p-3 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all text-left"
              >
                <div>
                  <p className="text-xs font-bold text-stone-900">Quiz Generator</p>
                  <p className="text-[11px] text-stone-500">Topic, difficulty & question count</p>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => onNavigate('teacher_assistant')}
                className="flex items-center justify-between w-full p-3 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all text-left"
              >
                <div>
                  <p className="text-xs font-bold text-stone-900">Lesson Plan Generator</p>
                  <p className="text-[11px] text-stone-500">Syllabus breakdown & time pacing</p>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => onNavigate('teacher_assistant')}
                className="flex items-center justify-between w-full p-3 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all text-left"
              >
                <div>
                  <p className="text-xs font-bold text-stone-900">Grading Rubric Architect</p>
                  <p className="text-[11px] text-stone-500">Structured evaluation matrix</p>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                onClick={() => onNavigate('attendance')}
                className="flex items-center justify-between w-full p-3 rounded-xl border border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all text-left"
              >
                <div>
                  <p className="text-xs font-bold text-stone-900">Attendance Register</p>
                  <p className="text-[11px] text-stone-500">Mark Present / Absent / Late</p>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
