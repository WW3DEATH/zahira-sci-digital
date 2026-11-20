import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  User,
  BookOpen,
  Layers,
  Filter,
  Download,
  Copy,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Sparkles,
  LayoutGrid,
  List,
  Bell,
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType, sanitizeFirestoreDoc } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ALL_BATCHES_ID, isInBatch, useBatch } from '../context/BatchContext';
import {
  TIMETABLE_DAYS,
  TimetableAccent,
  TimetableDay,
  TimetableEntry,
  TimetableStream,
  UserProfile,
} from '../types';
import { broadcastSystemNotification } from '../services/notificationService';
import { PDFPreviewData, PDFPreviewModal } from '../components/common/PDFPreviewModal';

const SUBJECT_PRESETS = [
  'Combined Mathematics',
  'Biology',
  'Physics',
  'Chemistry',
  'ICT',
  'General English',
  'General Common Test',
  'Practical Lab Session',
];

const PERIOD_PRESETS = [
  'Period 1',
  'Period 2',
  'Period 3',
  'Period 4',
  'Period 5',
  'Period 6',
  'Period 7',
  'Period 8',
  'Morning Assembly',
  'Practical Lab',
  'Afternoon Seminar',
];

const ACCENT_STYLES: Record<
  TimetableAccent,
  {
    border: string;
    bg: string;
    badge: string;
    dot: string;
  }
> = {
  blue: {
    border: 'border-blue-200 dark:border-blue-900/60',
    bg: 'bg-blue-50/60 dark:bg-blue-950/25',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-200',
    dot: 'bg-blue-600',
  },
  emerald: {
    border: 'border-emerald-200 dark:border-emerald-900/60',
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/25',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200',
    dot: 'bg-emerald-600',
  },
  amber: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bg: 'bg-amber-50/60 dark:bg-amber-950/25',
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  rose: {
    border: 'border-rose-200 dark:border-rose-900/60',
    bg: 'bg-rose-50/60 dark:bg-rose-950/25',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/70 dark:text-rose-200',
    dot: 'bg-rose-600',
  },
  violet: {
    border: 'border-violet-200 dark:border-violet-900/60',
    bg: 'bg-violet-50/60 dark:bg-violet-950/25',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/70 dark:text-violet-200',
    dot: 'bg-violet-600',
  },
  cyan: {
    border: 'border-cyan-200 dark:border-cyan-900/60',
    bg: 'bg-cyan-50/60 dark:bg-cyan-950/25',
    badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/70 dark:text-cyan-200',
    dot: 'bg-cyan-600',
  },
};

function getTodayWeekdayName(): TimetableDay {
  const idx = new Date().getDay(); // 0 = Sun, 1 = Mon, ...
  const map: TimetableDay[] = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return map[idx] || 'Monday';
}

function getDefaultAccentForSubject(subject: string): TimetableAccent {
  const s = subject.toLowerCase();
  if (s.includes('bio')) return 'emerald';
  if (s.includes('phys')) return 'cyan';
  if (s.includes('chem')) return 'rose';
  if (s.includes('ict') || s.includes('comp')) return 'violet';
  if (s.includes('eng') || s.includes('common')) return 'amber';
  return 'blue';
}

function formatTime12h(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm;
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatStreamLabel(stream: TimetableStream): string {
  if (stream === 'bio') return 'Bio Science';
  if (stream === 'physical') return 'Physical Science';
  return 'All Streams';
}

export const TimetablePage: React.FC = () => {
  const { activeRole, userProfile } = useAuth();
  const {
    batches,
    activeBatchId,
    activeBatch,
    setActiveBatchId,
    isBatchLocked,
    resolveWriteBatchId,
    getBatchName,
  } = useBatch();

  const isTeacherOrAdmin = activeRole === 'teacher' || activeRole === 'admin';
  const activeBatchName = activeBatch?.name || getBatchName(activeBatchId);
  const defaultWriteBatchId = resolveWriteBatchId(activeBatchId);
  const todayDay = getTodayWeekdayName();

  // Firestore real-time state
  const [allEntries, setAllEntries] = useState<TimetableEntry[]>([]);
  const [facultyUsers, setFacultyUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // View & Filter state
  const [streamFilter, setStreamFilter] = useState<'all' | 'bio' | 'physical'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid');
  const [selectedAgendaDay, setSelectedAgendaDay] = useState<TimetableDay>(todayDay);
  const [showWeekend, setShowWeekend] = useState<boolean>(
    todayDay === 'Saturday' || todayDay === 'Sunday'
  );
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Notice & Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal state for creating / editing timetable slots
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formBatchId, setFormBatchId] = useState<string>(defaultWriteBatchId);
  const [formDay, setFormDay] = useState<TimetableDay>('Monday');
  const [formPeriodLabel, setFormPeriodLabel] = useState<string>('Period 1');
  const [formStartTime, setFormStartTime] = useState<string>('07:50');
  const [formEndTime, setFormEndTime] = useState<string>('08:30');
  const [formSubject, setFormSubject] = useState<string>('Combined Mathematics');
  const [formStream, setFormStream] = useState<TimetableStream>('all');
  const [formTeacherName, setFormTeacherName] = useState<string>('');
  const [formTeacherId, setFormTeacherId] = useState<string>('');
  const [formRoom, setFormRoom] = useState<string>('Science Complex - Hall 28');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formAccent, setFormAccent] = useState<TimetableAccent>('blue');
  const [notifyBatchOnSave, setNotifyBatchOnSave] = useState<boolean>(false);
  const [savingSlot, setSavingSlot] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // PDF Export Modal
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<PDFPreviewData | null>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);

  // Minute ticker for live "Ongoing Now" highlight
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time Firestore listener for timetableEntries
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'timetableEntries'),
      (snap) => {
        const list: TimetableEntry[] = [];
        snap.forEach((d) => {
          list.push({ ...(d.data() as TimetableEntry), id: d.id });
        });
        list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        setAllEntries(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'timetableEntries');
      }
    );
    return () => unsub();
  }, []);

  // Load faculty list for convenient teacher selection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'userProfiles'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const u = d.data() as UserProfile;
          if (u.role === 'teacher' || u.role === 'admin') {
            list.push({ ...u, userId: u.userId || d.id });
          }
        });
        list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setFacultyUsers(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Batch & Stream filtered entries
  const batchEntries = useMemo(
    () => allEntries.filter((entry) => isInBatch(entry.batchId, activeBatchId)),
    [allEntries, activeBatchId]
  );

  const visibleEntries = useMemo(() => {
    return batchEntries
      .filter((entry) => {
        if (streamFilter === 'all') return true;
        return entry.stream === 'all' || entry.stream === streamFilter;
      })
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [batchEntries, streamFilter]);

  const hasWeekendSlots = useMemo(
    () => visibleEntries.some((e) => e.dayOfWeek === 'Saturday' || e.dayOfWeek === 'Sunday'),
    [visibleEntries]
  );

  const displayedDays = useMemo<TimetableDay[]>(() => {
    if (showWeekend || hasWeekendSlots) {
      return [...TIMETABLE_DAYS];
    }
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  }, [showWeekend, hasWeekendSlots]);

  const entriesByDay = useMemo(() => {
    const map: Record<TimetableDay, TimetableEntry[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    };
    visibleEntries.forEach((entry) => {
      if (map[entry.dayOfWeek]) {
        map[entry.dayOfWeek].push(entry);
      }
    });
    return map;
  }, [visibleEntries]);

  const todayEntries = useMemo(() => entriesByDay[todayDay] || [], [entriesByDay, todayDay]);

  const currentHHMM = useMemo(() => {
    const dt = new Date(nowTick);
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }, [nowTick]);

  const openCreateModal = (presetDay?: TimetableDay) => {
    setEditingEntryId(null);
    setFormBatchId(resolveWriteBatchId(activeBatchId));
    setFormDay(presetDay || (todayDay === 'Sunday' ? 'Monday' : todayDay));
    setFormPeriodLabel('Period 1');
    setFormStartTime('07:50');
    setFormEndTime('08:30');
    setFormSubject('Combined Mathematics');
    setFormStream('all');
    setFormTeacherName(
      userProfile?.role === 'teacher' ? userProfile.fullName : facultyUsers[0]?.fullName || ''
    );
    setFormTeacherId(userProfile?.role === 'teacher' ? userProfile.userId : '');
    setFormRoom('Science Complex - Hall 28');
    setFormNotes('');
    setFormAccent('blue');
    setNotifyBatchOnSave(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntryId(entry.id);
    setFormBatchId(entry.batchId || resolveWriteBatchId(activeBatchId));
    setFormDay(entry.dayOfWeek);
    setFormPeriodLabel(entry.periodLabel);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormSubject(entry.subject);
    setFormStream(entry.stream || 'all');
    setFormTeacherName(entry.teacherName || '');
    setFormTeacherId(entry.teacherId || '');
    setFormRoom(entry.room || 'Science Complex - Hall 28');
    setFormNotes(entry.notes || '');
    setFormAccent(entry.color || getDefaultAccentForSubject(entry.subject));
    setNotifyBatchOnSave(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openDuplicateModal = (entry: TimetableEntry) => {
    const currentIdx = TIMETABLE_DAYS.indexOf(entry.dayOfWeek);
    const nextDay = TIMETABLE_DAYS[(currentIdx + 1) % 5] || 'Monday';
    setEditingEntryId(null);
    setFormBatchId(entry.batchId || resolveWriteBatchId(activeBatchId));
    setFormDay(nextDay);
    setFormPeriodLabel(entry.periodLabel);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormSubject(entry.subject);
    setFormStream(entry.stream || 'all');
    setFormTeacherName(entry.teacherName || '');
    setFormTeacherId(entry.teacherId || '');
    setFormRoom(entry.room || 'Science Complex - Hall 28');
    setFormNotes(entry.notes || '');
    setFormAccent(entry.color || getDefaultAccentForSubject(entry.subject));
    setNotifyBatchOnSave(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherOrAdmin || !userProfile) return;

    const cleanSubject = formSubject.trim();
    const cleanPeriod = formPeriodLabel.trim();
    const cleanTeacher = formTeacherName.trim();
    const cleanRoom = formRoom.trim();

    if (!cleanSubject || !cleanPeriod || !cleanTeacher || !cleanRoom) {
      setFormError('Please fill in Subject, Period Label, Teacher Name, and Room/Lab.');
      return;
    }
    if (!formStartTime || !formEndTime || formEndTime <= formStartTime) {
      setFormError('End time must be later than start time.');
      return;
    }

    setSavingSlot(true);
    setFormError(null);

    const targetBatchId = resolveWriteBatchId(formBatchId);
    const targetBatchName = getBatchName(targetBatchId);
    const entryId = editingEntryId || `tt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const existing = editingEntryId ? allEntries.find((item) => item.id === editingEntryId) : undefined;

    const payload: TimetableEntry = {
      id: entryId,
      batchId: targetBatchId,
      batchName: targetBatchName,
      dayOfWeek: formDay,
      periodLabel: cleanPeriod,
      startTime: formStartTime,
      endTime: formEndTime,
      subject: cleanSubject,
      stream: formStream,
      teacherName: cleanTeacher,
      teacherId: formTeacherId || undefined,
      room: cleanRoom,
      notes: formNotes.trim() || undefined,
      color: formAccent,
      createdBy: existing?.createdBy || userProfile.userId,
      createdByName: existing?.createdByName || userProfile.fullName,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    try {
      await setDoc(doc(db, 'timetableEntries', entryId), sanitizeFirestoreDoc(payload), {
        merge: true,
      });

      if (notifyBatchOnSave) {
        await broadcastSystemNotification({
          title: `Timetable Updated (${targetBatchName})`,
          message: `${payload.dayOfWeek} • ${payload.periodLabel} (${formatTime12h(payload.startTime)}–${formatTime12h(payload.endTime)}): ${payload.subject} in ${payload.room}.`,
          type: 'announcement',
          link: 'timetable',
          batchId: targetBatchId,
          batchName: targetBatchName,
        }).catch(() => {});
      }

      setIsModalOpen(false);
      setFeedback({
        type: 'success',
        message: `${editingEntryId ? 'Updated' : 'Added'} ${payload.dayOfWeek} ${payload.periodLabel} (${payload.subject}) for ${targetBatchName}.`,
      });
      window.setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFormError('Failed to save timetable slot to Firestore.');
      handleFirestoreError(err, OperationType.WRITE, `timetableEntries/${entryId}`);
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (entryId: string) => {
    if (!isTeacherOrAdmin) return;
    setDeletingId(entryId);
    try {
      await deleteDoc(doc(db, 'timetableEntries', entryId));
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        message: 'Timetable slot removed successfully.',
      });
      window.setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'Could not delete timetable slot. Please try again.',
      });
      handleFirestoreError(err, OperationType.DELETE, `timetableEntries/${entryId}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportPDF = () => {
    if (visibleEntries.length === 0) return;
    setExportingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;

      // Top Header Banner
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageW, 24, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('ZAHIRA COLLEGE MAWANELLA SCIENCE PROJECT EM', margin, 11);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(203, 213, 225);
      pdf.text(
        `Official Weekly Class Timetable • ${activeBatchName} • Stream: ${
          streamFilter === 'all' ? 'All Streams' : formatStreamLabel(streamFilter)
        }`,
        margin,
        18
      );
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageW - margin, 18, { align: 'right' });

      const activeDays = displayedDays;
      const colW = (pageW - margin * 2) / activeDays.length;
      let startY = 30;

      // Day Headers
      activeDays.forEach((day, idx) => {
        const x = margin + idx * colW;
        pdf.setFillColor(30, 58, 138);
        pdf.rect(x + 0.5, startY, colW - 1, 8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(day.toUpperCase(), x + colW / 2, startY + 5.5, { align: 'center' });
      });

      startY += 10;

      const maxRows = Math.max(1, ...activeDays.map((d) => entriesByDay[d].length));
      const cardH = 22;

      for (let row = 0; row < maxRows; row++) {
        if (startY + cardH > pageH - 12) {
          pdf.addPage();
          startY = 14;
        }
        activeDays.forEach((day, colIdx) => {
          const entry = entriesByDay[day][row];
          const x = margin + colIdx * colW + 0.5;
          const w = colW - 1;
          if (!entry) {
            pdf.setDrawColor(226, 232, 240);
            pdf.rect(x, startY, w, cardH - 1.5);
            return;
          }
          pdf.setFillColor(248, 250, 252);
          pdf.setDrawColor(191, 219, 254);
          pdf.rect(x, startY, w, cardH - 1.5, 'FD');

          pdf.setTextColor(30, 64, 175);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.5);
          pdf.text(`${entry.startTime}-${entry.endTime} • ${entry.periodLabel}`.slice(0, 32), x + 2, startY + 4.5);

          pdf.setTextColor(15, 23, 42);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.text((entry.subject || '').slice(0, 26), x + 2, startY + 9.5);

          pdf.setTextColor(71, 85, 105);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.2);
          pdf.text((entry.teacherName || '').slice(0, 28), x + 2, startY + 14);
          pdf.text(`${entry.room} (${formatStreamLabel(entry.stream)})`.slice(0, 30), x + 2, startY + 18);
        });
        startY += cardH;
      }

      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const safeBatch = activeBatchName.replace(/[^a-zA-Z0-9_-]/g, '_');
      setPdfPreviewData({
        title: `Class Timetable — ${activeBatchName}`,
        filename: `Zahira_Timetable_${safeBatch}.pdf`,
        blobUrl,
        blob,
        category: 'Weekly Timetable',
      });
      setIsPdfPreviewOpen(true);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Collegiate Header */}
      <div className="rounded-3xl border border-blue-900/30 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-bold text-blue-200 mb-3">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              <span>Zahira College Mawanella • {activeBatchName}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] uppercase tracking-wider text-white">
                {isTeacherOrAdmin ? 'Faculty / Admin Editor' : 'Student Schedule'}
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Weekly Class Timetable
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 mt-1.5 max-w-2xl">
              {isTeacherOrAdmin
                ? `Configure and publish weekly lecture periods, laboratory sessions, and assigned rooms for ${activeBatchName}. Changes sync in real time to students and parents.`
                : `Live weekly class schedule, room allocations, and daily lecture timings for ${activeBatchName}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!isBatchLocked && (
              <select
                value={activeBatchId}
                onChange={(e) => setActiveBatchId(e.target.value)}
                className="min-h-[40px] rounded-xl bg-white/15 border border-white/25 px-3 py-2 text-xs font-bold text-white focus:outline-none"
                aria-label="Filter timetable by batch"
              >
                <option value={ALL_BATCHES_ID} className="text-slate-900">
                  All Batches ({batches.length})
                </option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id} className="text-slate-900">
                    Batch: {b.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exportingPdf || visibleEntries.length === 0}
              className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/20 px-4 py-2 text-xs font-bold text-white transition-colors"
            >
              <Download className="w-4 h-4 text-sky-300" />
              <span>{exportingPdf ? 'Generating...' : 'Export PDF'}</span>
            </button>

            {isTeacherOrAdmin && (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 px-4 py-2 text-xs font-extrabold shadow-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Timetable Slot</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-2xl border p-3.5 text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Today's Live Schedule Highlight */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60">
              <Calendar className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-serif text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>Today&apos;s Classes ({todayDay})</span>
                <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 text-[10px] font-bold">
                  {todayEntries.length} Period{todayEntries.length === 1 ? '' : 's'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Real-time daily schedule for {activeBatchName}
              </p>
            </div>
          </div>

          {isTeacherOrAdmin && (
            <button
              type="button"
              onClick={() => openCreateModal(todayDay)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 text-xs font-bold text-blue-800 dark:text-blue-300 transition-colors self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to {todayDay}</span>
            </button>
          )}
        </div>

        {todayEntries.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            No classes timetabled for {todayDay} in {activeBatchName} yet.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {todayEntries.map((slot) => {
              const isOngoing =
                currentHHMM >= (slot.startTime || '') && currentHHMM <= (slot.endTime || '');
              const style = ACCENT_STYLES[slot.color || getDefaultAccentForSubject(slot.subject)];
              return (
                <div
                  key={slot.id}
                  className={`min-w-[220px] max-w-[260px] shrink-0 rounded-xl border p-3.5 space-y-1.5 transition-all ${
                    isOngoing
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                      : `${style.border} ${style.bg}`
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
                      {slot.periodLabel}
                    </span>
                    {isOngoing ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Live Now
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {formatStreamLabel(slot.stream)}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {slot.subject}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>
                      {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                    <User className="w-3 h-3 shrink-0" />
                    <span>{slot.teacherName}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{slot.room}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter & View Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Stream:</span>
          </span>
          {(
            [
              { id: 'all', label: 'All Streams' },
              { id: 'bio', label: 'Biological Science' },
              { id: 'physical', label: 'Physical Science' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStreamFilter(item.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                streamFilter === item.id
                  ? 'bg-blue-900 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWeekend || hasWeekendSlots}
              onChange={(e) => setShowWeekend(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show Sat &amp; Sun</span>
          </label>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Weekly Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'agenda'
                  ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Day Agenda</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Timetable Body */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-xs text-slate-500">
          Synchronizing timetable from Firestore...
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
            No Timetable Periods Set for {activeBatchName}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {isTeacherOrAdmin
              ? 'Start building the official weekly timetable by adding periods, subjects, teachers, and room allocations for this batch.'
              : 'Your teachers or administrators have not published timetable periods for this batch yet. Check back soon.'}
          </p>
          {isTeacherOrAdmin && (
            <button
              type="button"
              onClick={() => openCreateModal('Monday')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white px-5 py-2.5 text-xs font-bold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Set First Timetable Slot</span>
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {displayedDays.map((day) => {
            const daySlots = entriesByDay[day] || [];
            const isToday = day === todayDay;
            return (
              <div
                key={day}
                className={`rounded-2xl border flex flex-col overflow-hidden shadow-xs transition-colors ${
                  isToday
                    ? 'border-blue-400 dark:border-blue-700 bg-white dark:bg-slate-900 ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                {/* Day Column Header */}
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${
                    isToday
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm font-bold">{day}</span>
                    {isToday && (
                      <span className="rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[9px] font-extrabold uppercase">
                        Today
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isToday
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {daySlots.length}
                    </span>
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        onClick={() => openCreateModal(day)}
                        title={`Add slot to ${day}`}
                        className={`p-1 rounded-lg transition-colors ${
                          isToday
                            ? 'hover:bg-white/20 text-white'
                            : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Day Slots List */}
                <div className="p-3 space-y-2.5 flex-1">
                  {daySlots.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
                      No sessions scheduled
                    </div>
                  ) : (
                    daySlots.map((slot) => {
                      const accent = slot.color || getDefaultAccentForSubject(slot.subject);
                      const style = ACCENT_STYLES[accent];
                      const isConfirmingDelete = confirmDeleteId === slot.id;
                      const isLiveNow =
                        isToday &&
                        currentHHMM >= (slot.startTime || '') &&
                        currentHHMM <= (slot.endTime || '');

                      return (
                        <div
                          key={slot.id}
                          className={`rounded-xl border p-3 space-y-2 transition-all ${style.border} ${style.bg} ${
                            isLiveNow ? 'ring-2 ring-emerald-500' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              <span>{slot.periodLabel}</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                              {formatTime12h(slot.startTime)}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug">
                              {slot.subject}
                            </h4>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                              {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
                            </p>
                          </div>

                          <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <p className="flex items-center gap-1.5 truncate">
                              <User className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{slot.teacherName}</span>
                            </p>
                            <p className="flex items-center gap-1.5 truncate">
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{slot.room}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="rounded bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-300">
                                {formatStreamLabel(slot.stream)}
                              </span>
                              {activeBatchId === ALL_BATCHES_ID && (
                                <span className="rounded bg-blue-900/10 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 text-[9px] font-bold">
                                  {slot.batchName || getBatchName(slot.batchId)}
                                </span>
                              )}
                            </div>
                          </div>

                          {slot.notes && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-2">
                              {slot.notes}
                            </p>
                          )}

                          {isTeacherOrAdmin && (
                            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-end gap-1">
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1.5 w-full justify-end">
                                  <button
                                    type="button"
                                    disabled={deletingId === slot.id}
                                    onClick={() => handleDeleteSlot(slot.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold disabled:opacity-50"
                                  >
                                    {deletingId === slot.id ? 'Removing...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openDuplicateModal(slot)}
                                    title="Duplicate to another day"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(slot)}
                                    title="Edit slot"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(slot.id)}
                                    title="Delete slot"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Day-by-Day Agenda View */
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            {displayedDays.map((day) => {
              const count = (entriesByDay[day] || []).length;
              const isSelected = selectedAgendaDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedAgendaDay(day)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{day}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(entriesByDay[selectedAgendaDay] || []).length === 0 ? (
            <div className="py-10 text-center space-y-3 text-xs text-slate-500">
              <p>No periods scheduled on {selectedAgendaDay} for {activeBatchName}.</p>
              {isTeacherOrAdmin && (
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedAgendaDay)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 text-white px-4 py-2 text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Slot to {selectedAgendaDay}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(entriesByDay[selectedAgendaDay] || []).map((slot) => {
                const accent = slot.color || getDefaultAccentForSubject(slot.subject);
                const style = ACCENT_STYLES[accent];
                const isConfirmingDelete = confirmDeleteId === slot.id;
                return (
                  <div
                    key={slot.id}
                    className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${style.border} ${style.bg}`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg px-2.5 py-0.5 text-[11px] font-bold ${style.badge}`}>
                          {slot.periodLabel}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                          {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
                        </span>
                        <span className="rounded bg-white/80 dark:bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {formatStreamLabel(slot.stream)}
                        </span>
                        {activeBatchId === ALL_BATCHES_ID && (
                          <span className="rounded bg-blue-900/10 text-blue-800 dark:text-blue-200 px-2 py-0.5 text-[10px] font-bold">
                            {slot.batchName || getBatchName(slot.batchId)}
                          </span>
                        )}
                      </div>
                      <h4 className="font-serif text-base font-bold text-slate-900 dark:text-slate-100">
                        {slot.subject}
                      </h4>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{slot.teacherName}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{slot.room}</span>
                        </span>
                      </div>
                      {slot.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">{slot.notes}</p>
                      )}
                    </div>

                    {isTeacherOrAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              disabled={deletingId === slot.id}
                              onClick={() => handleDeleteSlot(slot.id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
                            >
                              {deletingId === slot.id ? 'Removing...' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openDuplicateModal(slot)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(slot)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(slot.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Timetable Slot Modal (Teachers & Admins Only) */}
      {isModalOpen && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-900 text-amber-300">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                    {editingEntryId ? 'Edit Timetable Slot' : 'Add Weekly Timetable Slot'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Saved directly to Firestore and synced with student schedules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSlot} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Academic Batch *
                  </label>
                  <select
                    value={formBatchId}
                    onChange={(e) => setFormBatchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Day of Week *
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as TimetableDay)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    {TIMETABLE_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    list="timetable-subject-presets"
                    value={formSubject}
                    onChange={(e) => {
                      setFormSubject(e.target.value);
                      if (!editingEntryId) {
                        setFormAccent(getDefaultAccentForSubject(e.target.value));
                      }
                    }}
                    placeholder="e.g. Combined Mathematics"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="timetable-subject-presets">
                    {SUBJECT_PRESETS.map((sub) => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Academic Stream *
                  </label>
                  <select
                    value={formStream}
                    onChange={(e) => setFormStream(e.target.value as TimetableStream)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">All Science Streams (Common)</option>
                    <option value="bio">Biological Science</option>
                    <option value="physical">Physical Science</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Period Label *
                  </label>
                  <input
                    type="text"
                    required
                    list="timetable-period-presets"
                    value={formPeriodLabel}
                    onChange={(e) => setFormPeriodLabel(e.target.value)}
                    placeholder="Period 1"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="timetable-period-presets">
                    {PERIOD_PRESETS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Assigned Teacher *
                  </label>
                  <input
                    type="text"
                    required
                    list="timetable-faculty-list"
                    value={formTeacherName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormTeacherName(val);
                      const matched = facultyUsers.find(
                        (u) => u.fullName?.toLowerCase() === val.trim().toLowerCase()
                      );
                      setFormTeacherId(matched?.userId || '');
                    }}
                    placeholder="e.g. Mr. M. Kareem"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="timetable-faculty-list">
                    {facultyUsers.map((u) => (
                      <option key={u.userId} value={u.fullName} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Classroom / Laboratory *
                  </label>
                  <input
                    type="text"
                    required
                    value={formRoom}
                    onChange={(e) => setFormRoom(e.target.value)}
                    placeholder="Science Complex - Hall 28"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Card Color Theme
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(ACCENT_STYLES) as TimetableAccent[]).map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setFormAccent(colorKey)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold capitalize transition-all ${
                        formAccent === colorKey
                          ? 'border-slate-900 dark:border-white bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${ACCENT_STYLES[colorKey].dot}`} />
                      <span>{colorKey}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Topic / Unit Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Integration by Parts & Past Paper Drill"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={notifyBatchOnSave}
                  onChange={(e) => setNotifyBatchOnSave(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Send timetable update notification to {getBatchName(formBatchId)}</span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSlot}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-950 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingSlot ? 'Saving...' : editingEntryId ? 'Save Changes' : 'Add to Timetable'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Export Preview Modal */}
      <PDFPreviewModal
        isOpen={isPdfPreviewOpen}
        onClose={() => {
          setIsPdfPreviewOpen(false);
          if (pdfPreviewData?.blobUrl) {
            URL.revokeObjectURL(pdfPreviewData.blobUrl);
          }
          setPdfPreviewData(null);
        }}
        pdfData={pdfPreviewData}
      />
    </div>
  );
};
