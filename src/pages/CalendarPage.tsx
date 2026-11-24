import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Award,
  Sparkles,
  Sun,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Check,
  X,
  Users,
  CalendarCheck2,
  Save,
  BookOpen,
  Filter,
  ShieldCheck,
  Download,
  FileText,
  GraduationCap,
  Layers,
  CheckSquare,
  Eye,
  Power,
  Video,
  PlayCircle,
  Pencil,
  Film,
  UserPlus,
  TrendingUp,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db, sanitizeFirestoreDoc, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ALL_BATCHES_ID, useBatch, isInBatch } from '../context/BatchContext';
import {
  SchoolEvent,
  SchoolEventType,
  STUDY_GROUP_ROOMS,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceDayControl,
  UserProfile,
  SchoolClass,
  ScheduledClass,
  RosterStudent,
  ClassRecording,
  RecordingTeacher,
  RecordingWatchProgress,
} from '../types';
import {
  syncGoogleCalendarToFirestore,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from '../services/googleCalendarService';
import { PDFPreviewModal, PDFPreviewData } from '../components/common/PDFPreviewModal';
import { CalendarRecordingPlayer } from '../components/calendar/CalendarRecordingPlayer';
import {
  TeacherNameHoverTrigger,
  TeacherProfileSummary,
  formatRecordingViewCount,
} from '../components/calendar/TeacherHoverCard';
import { extractYouTubeVideoId, getYouTubeThumbnailUrl } from '../utils/youtubeUtils';
import { isFakeSeedRosterStudent } from '../services/dataService';
import {
  buildAttendanceRecordId,
  buildAttendanceDayControlId,
  isAttendanceDateEnabled,
  isAttendanceRecordActive,
} from '../utils/attendanceUtils';

class CalendarSectionErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackTitle?: string; fallbackDescription?: string },
  { hasError: boolean; errorMessage: string | null }
> {
  constructor(props: { children: React.ReactNode; fallbackTitle?: string; fallbackDescription?: string }) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('CalendarSectionErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-6 sm:p-8 text-center space-y-4 shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-white">
              {this.props.fallbackTitle || 'Unable to display this section cleanly'}
            </h3>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              {this.props.fallbackDescription ||
                'A temporary connection or rendering issue occurred. Please retry below.'}
            </p>
            {this.state.errorMessage && (
              <p className="mt-2 rounded-lg bg-stone-50 dark:bg-slate-800 px-3 py-1.5 text-[11px] font-mono text-stone-600 dark:text-slate-300 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Section</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface CalendarPageProps {
  initialTab?: 'events' | 'attendance' | 'recordings';
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ initialTab = 'events' }) => {
  const { activeRole, userProfile, googleAccessToken, connectGoogleCalendar } = useAuth();
  const { batches, activeBatchId, activeBatch, setActiveBatchId, isBatchLocked, getBatchName, resolveWriteBatchId } = useBatch();

  // Active view tab: 'events' | 'attendance' | 'recordings'
  const [activeTab, setActiveTab] = useState<'events' | 'attendance' | 'recordings'>(initialTab);
  const [recordingsSyncError, setRecordingsSyncError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Calendar date state (for browsing months)
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => new Date().toISOString().split('T')[0]);

  // Firestore real-time collections
  const [schoolEvents, setSchoolEvents] = useState<SchoolEvent[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  // Filtering
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  // Modals & operations
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<SchoolEvent | null>(null);

  // New Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventType, setEventType] = useState<SchoolEventType>('exam');
  const [eventStartDate, setEventStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventTime, setEventTime] = useState('08:30');
  const [eventLocation, setEventLocation] = useState('Science Complex Hall 28');
  const [eventStudyRoomId, setEventStudyRoomId] = useState<string>('general');
  const [pushToGoogle, setPushToGoogle] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  // Attendance Register State
  const [selectedClassId, setSelectedClassId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [register, setRegister] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [dayControlsMap, setDayControlsMap] = useState<Record<string, AttendanceDayControl>>({});
  const [togglingDay, setTogglingDay] = useState(false);

  // Scheduled Classes State
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClass[]>([]);
  const [dismissedDefaultsByDate, setDismissedDefaultsByDate] = useState<Record<string, string[]>>({});
  const [selectedScheduledClassId, setSelectedScheduledClassId] = useState<string | null>(null);
  const [isScheduleClassModalOpen, setIsScheduleClassModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ScheduledClass | null>(null);
  const [cohortToDelete, setCohortToDelete] = useState<SchoolClass | null>(null);
  const [newClassDate, setNewClassDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newClassSubject, setNewClassSubject] = useState('Combined Mathematics');
  const [newClassTimeSlot, setNewClassTimeSlot] = useState('08:00 - 09:30');
  const [newClassPeriod, setNewClassPeriod] = useState('Period 1');
  const [newClassTopic, setNewClassTopic] = useState('');
  const [newClassRoom, setNewClassRoom] = useState('Science Complex Hall 28');
  const [savingScheduledClass, setSavingScheduledClass] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [previewPDFData, setPreviewPDFData] = useState<PDFPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Class Recordings State (Multiple YouTube recordings per single day)
  const [classRecordings, setClassRecordings] = useState<ClassRecording[]>([]);
  const [recordingTeachers, setRecordingTeachers] = useState<RecordingTeacher[]>([]);
  const [watchProgressMap, setWatchProgressMap] = useState<Record<string, RecordingWatchProgress>>({});
  const [recordingDate, setRecordingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [recordingViewScope, setRecordingViewScope] = useState<'day' | 'all'>('day');
  const [recordingCategoryFilter, setRecordingCategoryFilter] = useState<string>('all');
  const [recordingTeacherFilter, setRecordingTeacherFilter] = useState<string>('all');
  const [groupRecordingsByTeacher, setGroupRecordingsByTeacher] = useState<boolean>(true);
  const [recordingSortMode, setRecordingSortMode] = useState<'latest' | 'most_watched'>('latest');
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [savingWatchId, setSavingWatchId] = useState<string | null>(null);
  const viewedRecordingIdsRef = useRef<Set<string>>(new Set());

  // Recording Upload / Edit / Delete Modal State (Teachers & Admins Only)
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [editingRecording, setEditingRecording] = useState<ClassRecording | null>(null);
  const [recTitle, setRecTitle] = useState('');
  const [recYoutubeUrl, setRecYoutubeUrl] = useState('');
  const [recDate, setRecDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [recCategory, setRecCategory] = useState('Physics');
  const [recCustomCategory, setRecCustomCategory] = useState('');
  const [recTeacherSelectionMode, setRecTeacherSelectionMode] = useState<'directory' | 'manual'>('directory');
  const [recSelectedTeacherId, setRecSelectedTeacherId] = useState('');
  const [recTeacherName, setRecTeacherName] = useState('');
  const [recTeacherSubject, setRecTeacherSubject] = useState('');
  const [recSessionLabel, setRecSessionLabel] = useState('');
  const [recDurationLabel, setRecDurationLabel] = useState('');
  const [recQualityLabel, setRecQualityLabel] = useState('720p');
  const [recDescription, setRecDescription] = useState('');
  const [recFormError, setRecFormError] = useState<string | null>(null);
  const [savingRecording, setSavingRecording] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<ClassRecording | null>(null);

  // Bulk Teachers Directory Modal State (Teachers & Admins Only — never synced with user accounts)
  const [isTeacherDirectoryModalOpen, setIsTeacherDirectoryModalOpen] = useState(false);
  const [bulkTeacherPasteText, setBulkTeacherPasteText] = useState('');
  const [bulkTeacherRows, setBulkTeacherRows] = useState<
    Array<{ localId: string; name: string; subject: string }>
  >([
    { localId: 'row-init-1', name: '', subject: '' },
    { localId: 'row-init-2', name: '', subject: '' },
    { localId: 'row-init-3', name: '', subject: '' },
  ]);
  const [bulkTeacherApplyAllBatches, setBulkTeacherApplyAllBatches] = useState(true);
  const [teacherDirectoryError, setTeacherDirectoryError] = useState<string | null>(null);
  const [savingBulkTeachers, setSavingBulkTeachers] = useState(false);
  const [editingTeacherEntryId, setEditingTeacherEntryId] = useState<string | null>(null);
  const [editingTeacherEntryName, setEditingTeacherEntryName] = useState('');
  const [editingTeacherEntrySubject, setEditingTeacherEntrySubject] = useState('');
  const [editingTeacherEntryBio, setEditingTeacherEntryBio] = useState('');
  const [savingTeacherEntryEdit, setSavingTeacherEntryEdit] = useState(false);
  const [teacherEntryToDelete, setTeacherEntryToDelete] = useState<RecordingTeacher | null>(null);

  const isTeacherOrAdmin = activeRole === 'admin' || activeRole === 'teacher';

  // 1. Real-time listener for school events
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'schoolEvents'), (snapshot) => {
      const list: SchoolEvent[] = [];
      snapshot.forEach((d) => list.push(d.data() as SchoolEvent));
      // Sort chronologically by startDate
      list.sort((a, b) => a.startDate.localeCompare(b.startDate));
      setSchoolEvents(list);
    });
    return () => unsub();
  }, []);

  // 2. Real-time listener for scheduled classes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'scheduledClasses'), (snapshot) => {
      const list: ScheduledClass[] = [];
      snapshot.forEach((d) => list.push(d.data() as ScheduledClass));
      list.sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
      setScheduledClasses(list);
    });
    return () => unsub();
  }, []);

  // 2b. Real-time listener for dismissed default weekday sessions per date
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'scheduledClassOverrides'), (snapshot) => {
      const map: Record<string, string[]> = {};
      snapshot.forEach((d) => {
        const data = d.data() as { date?: string; dismissedDefaultIds?: string[] };
        if (data?.date && Array.isArray(data.dismissedDefaultIds)) {
          map[data.date] = data.dismissedDefaultIds;
        }
      });
      setDismissedDefaultsByDate(map);
    });
    return () => unsub();
  }, []);

  // 3. Real-time listener for attendance
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const list: AttendanceRecord[] = [];
      snapshot.forEach((d) => list.push(d.data() as AttendanceRecord));
      setAttendanceRecords(list);
    });
    return () => unsub();
  }, []);

  // 2b. Real-time listener for per-date Attendance ON/OFF controls
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'attendanceDaySettings'),
      (snap) => {
        const map: Record<string, AttendanceDayControl> = {};
        snap.forEach((d) => {
          const data = d.data() as AttendanceDayControl;
          const dateKey = data.date || d.id;
          if (dateKey) map[d.id] = { ...data, id: d.id, date: dateKey };
        });
        setDayControlsMap(map);
      },
      (error) => {
        console.warn('Attendance day controls listener warning:', error?.message || error);
      }
    );
    return () => unsub();
  }, []);

  // 3. Real-time listener for student roster (strictly real entries; purges legacy fake seed rows)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'attendanceRoster'),
      (snapshot) => {
        const list: RosterStudent[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as RosterStudent;
          if (isFakeSeedRosterStudent(d.id, data?.fullName)) {
            deleteDoc(doc(db, 'attendanceRoster', d.id)).catch(() => {});
            return;
          }
          list.push({ ...data, id: d.id });
        });
        list.sort((a, b) => (a.indexNumber || '').localeCompare(b.indexNumber || ''));
        setStudents(list);

        setRegister((prev) => {
          const validIds = new Set(list.map((s) => s.id));
          const updated: Record<string, AttendanceStatus> = {};
          Object.entries(prev).forEach(([k, v]) => {
            if (validIds.has(k)) updated[k] = v;
          });
          list.forEach((s) => {
            if (!updated[s.id]) {
              updated[s.id] = 'present';
            }
          });
          return updated;
        });
      },
      (error) => {
        console.warn('Attendance roster listener warning:', error?.message || error);
      }
    );
    return () => unsub();
  }, []);

  // 4. Real-time listener for classes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const list: SchoolClass[] = [];
      snapshot.forEach((d) => list.push(d.data() as SchoolClass));
      setClasses(list);
    });
    return () => unsub();
  }, []);

  // 5. Real-time listener for Class Recordings (supports multiple recordings per single day)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'classRecordings'),
      (snapshot) => {
        const list: ClassRecording[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as ClassRecording;
          list.push({ ...data, id: d.id });
        });
        list.sort((a, b) => {
          const dateCmp = (b.date || '').localeCompare(a.date || '');
          if (dateCmp !== 0) return dateCmp;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
        setClassRecordings(list);
        setRecordingsSyncError(null);
      },
      (error) => {
        console.warn('Class recordings listener error:', error?.message || error);
        setRecordingsSyncError(
          'Unable to load live class recordings from Firestore right now. Check your network connection or Firebase configuration.'
        );
      }
    );
    return () => unsub();
  }, []);

  // 6. Real-time listener for per-user Mark as Watched tracking
  useEffect(() => {
    const currentUserId = userProfile?.userId || 'guest';
    const progressQuery = query(
      collection(db, 'recordingWatchProgress'),
      where('userId', '==', currentUserId)
    );
    const unsub = onSnapshot(
      progressQuery,
      (snapshot) => {
        const map: Record<string, RecordingWatchProgress> = {};
        snapshot.forEach((d) => {
          const data = d.data() as RecordingWatchProgress;
          if (data.recordingId) {
            map[data.recordingId] = { ...data, id: d.id };
          }
        });
        setWatchProgressMap(map);
      },
      (error) => {
        console.warn('Recording watch progress listener warning:', error?.message || error);
      }
    );
    return () => unsub();
  }, [userProfile?.userId]);

  // 7. Real-time listener for manual Recording Teachers Directory (strictly Admin/Teacher entered, NEVER synced with accounts)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'recordingTeachers'),
      (snapshot) => {
        const list: RecordingTeacher[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as RecordingTeacher;
          list.push({ ...data, id: d.id });
        });
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setRecordingTeachers(list);
      },
      (error) => {
        console.warn('Recording teachers directory listener warning:', error?.message || error);
      }
    );
    return () => unsub();
  }, []);

  const activeBatchName = activeBatch?.name || getBatchName(activeBatchId);
  const writeBatchId = resolveWriteBatchId(activeBatchId);
  const writeBatchName = getBatchName(writeBatchId);
  const batchClasses = classes.filter((c) => isInBatch(c.batchId, activeBatchId));
  const batchStudents = students.filter((s) => isInBatch(s.batchId, activeBatchId));
  const batchSchoolEvents = schoolEvents.filter((ev) => isInBatch(ev.batchId, activeBatchId));
  const batchScheduledClasses = scheduledClasses.filter((sc) => isInBatch(sc.batchId, activeBatchId));
  const batchAttendanceRecords = attendanceRecords.filter((r) => isInBatch(r.batchId, activeBatchId));
  const batchRecordings = classRecordings.filter((rec) => isInBatch(rec.batchId, activeBatchId));
  const batchRecordingTeachers = recordingTeachers.filter(
    (t) => t.batchId === ALL_BATCHES_ID || isInBatch(t.batchId, activeBatchId)
  );

  useEffect(() => {
    if (batchClasses.length > 0) {
      if (!batchClasses.some((c) => c.id === selectedClassId)) {
        setSelectedClassId(batchClasses[0].id);
      }
    } else if (selectedClassId) {
      setSelectedClassId('');
    }
  }, [activeBatchId, classes]);

  useEffect(() => {
    const existing =
      batchAttendanceRecords.find(
        (r) =>
          r.date === attendanceDate &&
          (selectedClassId ? r.classId === selectedClassId : !r.classId || r.classId === 'general')
      ) || batchAttendanceRecords.find((r) => r.date === attendanceDate);
    if (existing?.records) {
      const merged: Record<string, AttendanceStatus> = {};
      batchStudents.forEach((s) => {
        merged[s.id] = existing.records[s.id] || 'present';
      });
      setRegister(merged);
    } else {
      const fresh: Record<string, AttendanceStatus> = {};
      batchStudents.forEach((s) => {
        fresh[s.id] = 'present';
      });
      setRegister(fresh);
    }
  }, [selectedClassId, attendanceDate, attendanceRecords, students, activeBatchId]);

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateStr(now.toISOString().split('T')[0]);
    setAttendanceDate(now.toISOString().split('T')[0]);
  };

  // Google Calendar Synchronization
  const handleSyncGoogleCalendar = async () => {
    setSyncingGoogle(true);
    setSyncMessage(null);
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await connectGoogleCalendar();
      }

      if (!token) {
        throw new Error('Google authorization was not completed.');
      }

      const res = await syncGoogleCalendarToFirestore(
        token,
        userProfile?.userId || 'faculty',
        userProfile?.fullName || 'Zahira Faculty'
      );
      setSyncMessage(res.message);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setSyncMessage(err.message || 'Failed to sync with Google Calendar');
      setTimeout(() => setSyncMessage(null), 6000);
    } finally {
      setSyncingGoogle(false);
    }
  };

  // Create School Event (Holiday, Exam, or Academic)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventStartDate) return;

    setSavingEvent(true);
    try {
      const eventId = `ev-${Date.now()}`;
      let googleEventId: string | undefined = undefined;

      // Push to Google Calendar if requested and token is present
      if (pushToGoogle && googleAccessToken) {
        try {
          const gcalRes = await createGoogleCalendarEvent(googleAccessToken, {
            title: eventTitle,
            description: eventDesc,
            startDate: eventStartDate,
            endDate: eventEndDate || eventStartDate,
            time: eventTime || undefined,
            type: eventType,
            location: eventLocation,
          });
          googleEventId = gcalRes.googleEventId;
        } catch (gcalErr) {
          console.warn('Could not sync directly to Google Calendar:', gcalErr);
        }
      }

      const selectedStudyRoom = STUDY_GROUP_ROOMS.find((r) => r.id === eventStudyRoomId);
      const newEvent: SchoolEvent = {
        id: eventId,
        title: eventTitle.trim(),
        description: eventDesc.trim(),
        startDate: eventStartDate,
        endDate: eventEndDate || undefined,
        time: eventTime || undefined,
        type: eventType,
        classId: selectedClassId || 'general',
        batchId: writeBatchId,
        batchName: writeBatchName,
        studyRoomId: eventType === 'study_group' ? (selectedStudyRoom?.id || 'general') : undefined,
        studyRoomName: eventType === 'study_group' ? (selectedStudyRoom?.name || 'General Science EM') : undefined,
        location: eventLocation.trim() || 'Zahira College Mawanella',
        createdBy: userProfile?.userId || 'faculty',
        createdByName: userProfile?.fullName || 'Zahira Faculty',
        googleEventId,
        isSyncedWithGoogle: !!googleEventId,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'schoolEvents', eventId), sanitizeFirestoreDoc(newEvent));

      // Reset form and close
      setEventTitle('');
      setEventDesc('');
      setIsAddModalOpen(false);
      setSyncMessage(`Marked "${newEvent.title}" on the school calendar.`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      console.error('Error creating event:', err);
      setSyncMessage('Failed to save event: ' + err.message);
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setSavingEvent(false);
    }
  };

  // Delete School Event (with confirmation dialog per Workspace guidelines)
  const executeDeleteEvent = async () => {
    if (!deleteConfirmEvent) return;
    const target = deleteConfirmEvent;
    setDeleteConfirmEvent(null);

    try {
      // If linked to Google Calendar, remove it there too
      if (target.googleEventId && googleAccessToken) {
        try {
          await deleteGoogleCalendarEvent(googleAccessToken, target.googleEventId);
        } catch (gErr) {
          console.warn('Could not remove from Google Calendar:', gErr);
        }
      }

      await deleteDoc(doc(db, 'schoolEvents', target.id));
      setSyncMessage(`Deleted "${target.title}" from school events.`);
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting event:', err);
      setSyncMessage('Failed to delete event: ' + err.message);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // Get all scheduled classes for a specific date (custom Firestore records + non-dismissed defaults)
  const getClassesForDate = (dateStr: string): ScheduledClass[] => {
    const directMatches = batchScheduledClasses.filter((sc) => sc.date === dateStr);
    const dismissedIds = dismissedDefaultsByDate[dateStr] || [];
    const legacySessionOverride = directMatches.some((sc) => sc.id.startsWith('session-'));

    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    const weekdayDefaults: ScheduledClass[] =
      !legacySessionOverride && dayOfWeek >= 1 && dayOfWeek <= 5
        ? [
            {
              id: `default-${dateStr}-maths`,
              classId: selectedClassId || 'general',
              className: writeBatchName,
              batchId: writeBatchId,
              batchName: writeBatchName,
              date: dateStr,
              timeSlot: '08:00 - 09:30',
              periodName: 'Period 1',
              subject: 'Combined Mathematics (Pure & Applied Mechanics)',
              topic: 'Calculus Theorems & Vector Kinematics',
              teacherId: userProfile?.userId || 'faculty',
              teacherName: 'ZNC Science Project management',
              room: 'Science Complex - Hall 28',
              createdAt: dateStr,
            },
            {
              id: `default-${dateStr}-physics`,
              classId: selectedClassId || 'general',
              className: writeBatchName,
              batchId: writeBatchId,
              batchName: writeBatchName,
              date: dateStr,
              timeSlot: '09:45 - 11:15',
              periodName: 'Period 2',
              subject: 'Physics (Mechanics, Optics & Electronics)',
              topic: 'Rotational Dynamics & Wave Interference',
              teacherId: userProfile?.userId || 'faculty',
              teacherName: 'ZNC Science Project management',
              room: 'Science Complex - Physics Lab 1',
              createdAt: dateStr,
            },
            {
              id: `default-${dateStr}-chemistry`,
              classId: selectedClassId || 'general',
              className: writeBatchName,
              batchId: writeBatchId,
              batchName: writeBatchName,
              date: dateStr,
              timeSlot: '11:30 - 13:00',
              periodName: 'Period 3',
              subject: 'Chemistry (Inorganic & Physical Chemistry)',
              topic: 'Equilibrium Constant & Electrochemistry',
              teacherId: userProfile?.userId || 'faculty',
              teacherName: 'ZNC Science Project management',
              room: 'Science Complex - Chem Lab 2',
              createdAt: dateStr,
            },
          ].filter((def) => !dismissedIds.includes(def.id))
        : [];

    const combined = [...weekdayDefaults, ...directMatches];
    combined.sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
    return combined;
  };

  // Add a class session to a specific date (strictly Teachers & Admins only)
  const handleCreateScheduledClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherOrAdmin || !newClassDate || !newClassSubject.trim()) return;

    setSavingScheduledClass(true);
    try {
      const classSessionId = `class-session-${Date.now()}`;
      const defaultRegister: Record<string, AttendanceStatus> = {};
      batchStudents.forEach((s) => {
        defaultRegister[s.id] = 'present';
      });

      const newSession: ScheduledClass = {
        id: classSessionId,
        classId: selectedClassId || 'general',
        className: writeBatchName,
        batchId: writeBatchId,
        batchName: writeBatchName,
        date: newClassDate,
        timeSlot: newClassTimeSlot,
        periodName: newClassPeriod,
        subject: newClassSubject.trim(),
        topic: newClassTopic.trim() || undefined,
        teacherId: userProfile?.userId || 'faculty',
        teacherName: 'ZNC Science Project management',
        room: newClassRoom.trim() || 'Science Complex Hall 28',
        attendanceRecords: defaultRegister,
        attendanceTaken: false,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'scheduledClasses', classSessionId), sanitizeFirestoreDoc(newSession));

      // Also add corresponding calendar event so it appears in monthly view
      const eventId = `ev-class-${classSessionId}`;
      const newEv: SchoolEvent = {
        id: eventId,
        title: `${newClassSubject} (${newClassTimeSlot})`,
        description: `Class session: ${newClassTopic || 'Academic Lecture'} | Room: ${newClassRoom}`,
        startDate: newClassDate,
        time: newClassTimeSlot.split('-')[0].trim(),
        type: 'academic',
        classId: selectedClassId || 'general',
        batchId: writeBatchId,
        batchName: writeBatchName,
        location: newClassRoom,
        createdBy: userProfile?.userId || 'faculty',
        createdByName: 'ZNC Science Project management',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'schoolEvents', eventId), sanitizeFirestoreDoc(newEv));

      setIsScheduleClassModalOpen(false);
      setNewClassTopic('');
      setSelectedScheduledClassId(classSessionId);
      setSyncMessage(`Scheduled "${newClassSubject}" on ${newClassDate}.`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to schedule class:', err);
      setSyncMessage('Error scheduling class: ' + err.message);
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setSavingScheduledClass(false);
    }
  };

  // Delete scheduled class session occurring on date (strictly teacher and admin only, in-app confirmation)
  const handleConfirmDeleteScheduledClass = async () => {
    if (!sessionToDelete || !isTeacherOrAdmin) return;
    const target = sessionToDelete;
    setSessionToDelete(null);

    try {
      if (target.id.startsWith('default-')) {
        const currentDismissed = dismissedDefaultsByDate[attendanceDate] || [];
        const updatedDismissed = Array.from(new Set([...currentDismissed, target.id]));
        setDismissedDefaultsByDate((prev) => ({
          ...prev,
          [attendanceDate]: updatedDismissed,
        }));
        await setDoc(
          doc(db, 'scheduledClassOverrides', attendanceDate),
          {
            date: attendanceDate,
            dismissedDefaultIds: updatedDismissed,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        setScheduledClasses((prev) => prev.filter((sc) => sc.id !== target.id));
        await deleteDoc(doc(db, 'scheduledClasses', target.id));
        await deleteDoc(doc(db, 'schoolEvents', `ev-class-${target.id}`)).catch(() => {});
      }
      setSelectedScheduledClassId(null);
      setSyncMessage(`Removed academic session "${target.subject}" on ${attendanceDate}.`);
      setTimeout(() => setSyncMessage(null), 3500);
    } catch (err) {
      console.error('Failed to remove scheduled class:', err);
    }
  };

  // Delete class cohort (teacher and admin, in-app confirmation)
  const handleConfirmDeleteClassCohort = async () => {
    if (!cohortToDelete || !isTeacherOrAdmin) return;
    const targetId = cohortToDelete.id;
    const targetName = cohortToDelete.name;
    setCohortToDelete(null);
    try {
      await deleteDoc(doc(db, 'classes', targetId));
      setSelectedClassId('');
      setSyncMessage(`Removed class cohort "${targetName}".`);
      setTimeout(() => setSyncMessage(null), 3500);
    } catch (err) {
      console.error('Failed to delete class cohort:', err);
    }
  };

  const isDayAttendanceEnabled = isAttendanceDateEnabled(attendanceDate, dayControlsMap, writeBatchId);

  const handleToggleCalendarDayAttendance = async () => {
    if (!isTeacherOrAdmin || togglingDay) return;
    const nextEnabled = !isDayAttendanceEnabled;
    setTogglingDay(true);
    try {
      const controlId = buildAttendanceDayControlId(attendanceDate, writeBatchId);
      const payload: AttendanceDayControl = {
        id: controlId,
        date: attendanceDate,
        batchId: writeBatchId,
        batchName: writeBatchName,
        enabled: nextEnabled,
        updatedBy: userProfile?.userId || 'faculty',
        updatedByName: userProfile?.fullName || 'Faculty Lead',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'attendanceDaySettings', controlId), sanitizeFirestoreDoc(payload));
      setSyncMessage(
        nextEnabled
          ? `Attendance marking turned ON for ${attendanceDate} (${writeBatchName}).`
          : `Attendance marking turned OFF for ${attendanceDate} (${writeBatchName}) (excluded from dashboard graphs).`
      );
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      console.error('Failed to toggle attendance setting:', err);
    } finally {
      setTogglingDay(false);
    }
  };

  // Save attendance for the selected class session
  const handleSaveClassAttendance = async (targetClass?: ScheduledClass) => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    const activeClass = targetClass || (selectedScheduledClassId ? batchScheduledClasses.find((c) => c.id === selectedScheduledClassId) : null);
    const activeSubject = activeClass ? activeClass.subject : 'General Roll-Call';
    const activeClassId = activeClass?.classId || selectedClassId || 'general';
    const activeDate = attendanceDate;

    try {
      // 1. Save to attendance collection with batch + session isolation
      const recordId = activeClass
        ? buildAttendanceRecordId(activeDate, activeClassId, activeClass.id, writeBatchId)
        : buildAttendanceRecordId(activeDate, activeClassId, 'daily', writeBatchId);
      const record: AttendanceRecord = sanitizeFirestoreDoc({
        id: recordId,
        classId: activeClassId,
        batchId: writeBatchId,
        batchName: writeBatchName,
        date: activeDate,
        sessionId: activeClass?.id,
        sessionSubject: activeSubject,
        timeSlot: activeClass?.timeSlot,
        teacherId: userProfile?.userId || 'faculty_lead',
        records: register,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'attendance', recordId), record, { merge: true });

      // 2. If it's a scheduledClass doc in Firestore, update it
      if (activeClass && !activeClass.id.startsWith('default-')) {
        await setDoc(
          doc(db, 'scheduledClasses', activeClass.id),
          { attendanceRecords: register, attendanceTaken: true },
          { merge: true }
        );
      } else if (activeClass && activeClass.id.startsWith('default-')) {
        // Persist default template into a real Firestore doc
        const newId = `sc-${writeBatchId}-${activeDate}-${activeClass.periodName?.replace(/\s+/g, '_') || 'period'}`;
        await setDoc(doc(db, 'scheduledClasses', newId), sanitizeFirestoreDoc({
          ...activeClass,
          id: newId,
          batchId: writeBatchId,
          batchName: writeBatchName,
          attendanceRecords: register,
          attendanceTaken: true,
        }));
      }

      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 3000);
    } catch (err: any) {
      console.error('Failed to save attendance:', err);
      setSyncMessage('Error saving attendance: ' + err.message);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleMarkAllPresent = () => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    const updated: Record<string, AttendanceStatus> = {};
    batchStudents.forEach((st) => {
      updated[st.id] = 'present';
    });
    setRegister(updated);
  };

  const handleAttendanceStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    setRegister((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Generate comprehensive Single-Day Multi-Class Attendance jsPDF instance
  const generateDailyAttendanceDoc = (dateStr: string): jsPDF => {
    const doc = new jsPDF();
    const dayDate = new Date(`${dateStr}T00:00:00`);
    const formattedDay = dayDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 1. Collect all classes that happened on this SINGLE DAY only
    const dayClasses = getClassesForDate(dateStr);
    const classesToRender = dayClasses.length > 0 ? dayClasses : [
      {
        id: `day-${dateStr}-general`,
        classId: selectedClassId,
        className: activeBatchName,
        date: dateStr,
        timeSlot: '08:00 - 13:30',
        periodName: 'Academic Schedule',
        subject: 'Standard Science Cohort Sessions',
        topic: 'Daily Lecture & Laboratory Practical Block',
        teacherId: userProfile?.userId || 'faculty',
        teacherName: userProfile?.fullName || 'Zahira Faculty',
        room: 'Science Complex Hall 28',
        createdAt: dateStr,
      },
    ];

    // Page 1: Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`ZAHIRA COLLEGE MAWANELLA • ${activeBatchName.toUpperCase()}`, 20, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text('OFFICIAL DAILY ACADEMIC REGISTER & ALL-CLASSES ATTENDANCE REPORT', 20, 26);
    doc.text('Certified Single-Day Roll-Call Summary • Internal Faculty & Administration Record', 20, 31);

    doc.setDrawColor(203, 213, 225);
    doc.line(20, 35, 190, 35);

    // Single Day Audit Banner
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(20, 39, 170, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text(`DAILY AUDIT DATE: ${formattedDay.toUpperCase()} (${dateStr})`, 24, 46);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Batch: ${activeBatchName} • Total Classes Conducted Today: ${classesToRender.length}`, 24, 52);
    doc.text('Supervisor: ZNC Science Project management', 115, 52);

    let y = 65;

    // Iterate through EVERY CLASS that happened on this SINGLE DAY
    classesToRender.forEach((cls, classIdx) => {
      if (y > 215) {
        doc.addPage();
        y = 25;
      }

      // Class Session Title Banner
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(20, y, 170, 11, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Class ${classIdx + 1}: ${cls.subject} (${cls.timeSlot})`, 24, y + 7.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Room: ${cls.room} • Faculty: ${cls.teacherName}`, 120, y + 7.5);

      y += 15;

      // Table Header
      doc.setFillColor(248, 250, 252);
      doc.rect(20, y, 170, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('ROLL / INDEX', 24, y + 4.8);
      doc.text('SCHOLAR NAME', 60, y + 4.8);
      doc.text('STATUS', 135, y + 4.8);
      doc.text('VERIFICATION', 165, y + 4.8);

      y += 10;

      const classRecords = cls.attendanceRecords || register;
      let pCount = 0;
      let lCount = 0;
      let aCount = 0;

      batchStudents.forEach((st, sIdx) => {
        if (y > 275) {
          doc.addPage();
          y = 25;
        }

        const status: AttendanceStatus = classRecords[st.id] || 'present';
        if (status === 'present') pCount++;
        else if (status === 'late') lCount++;
        else if (status === 'absent') aCount++;

        const indexNo = st.indexNumber || `286000${sIdx + 1}`;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(indexNo, 24, y);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(st.fullName || 'Scholar', 60, y);

        if (status === 'present') {
          doc.setTextColor(22, 101, 52);
          doc.text('PRESENT', 135, y);
        } else if (status === 'late') {
          doc.setTextColor(180, 83, 9);
          doc.text('LATE', 135, y);
        } else if (status === 'absent') {
          doc.setTextColor(185, 28, 28);
          doc.text('ABSENT', 135, y);
        } else {
          doc.setTextColor(71, 85, 105);
          doc.text('EXCUSED', 135, y);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Verified', 165, y);

        y += 7;
      });

      // Class Summary Line
      const classTotal = batchStudents.length || 1;
      const classRate = Math.round(((pCount + lCount * 0.5) / classTotal) * 100);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Class Summary: ${pCount} Present, ${lCount} Late, ${aCount} Absent • Attendance Rate: ${classRate}%`,
        24,
        y + 2
      );
      y += 11;
    });

    // End of Single-Day Document Certification Block
    if (y > 240) {
      doc.addPage();
      y = 30;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(20, y + 4, 190, y + 4);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Certified by Academic Administration:', 20, y);

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text('ZNC Science Project management', 20, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Official Single-Day All-Classes Academic Attendance Record • Generated on ${new Date().toLocaleString()}`,
      20,
      y
    );

    return doc;
  };

  // Preview Single-Day Attendance in interactive in-app modal
  const handlePreviewDailyComprehensivePDF = (dateStr: string) => {
    try {
      const doc = generateDailyAttendanceDoc(dateStr);
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPreviewPDFData({
        title: `Daily Attendance: ${dateStr}`,
        filename: `Zahira_College_Daily_Attendance_AllClasses_${dateStr}.pdf`,
        blobUrl,
        blob,
        category: 'Daily Academic Register',
      });
      setIsPreviewOpen(true);
    } catch (e) {
      console.error('Daily PDF preview error:', e);
    }
  };

  // Export comprehensive Single-Day Multi-Class Attendance PDF download
  const handleExportDailyComprehensivePDF = (dateStr: string) => {
    setExportingPDF(true);
    try {
      const doc = generateDailyAttendanceDoc(dateStr);
      doc.save(`Zahira_College_Daily_Attendance_AllClasses_${dateStr}.pdf`);
    } catch (e) {
      console.error('Daily PDF export error:', e);
    } finally {
      setExportingPDF(false);
    }
  };

  // Build calendar matrix
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Filtered events
  const filteredEvents = batchSchoolEvents.filter((ev) => {
    if (eventTypeFilter === 'all') return true;
    return ev.type === eventTypeFilter;
  });

  const getEventsForDate = (dateStr: string) => {
    return filteredEvents.filter((ev) => {
      if (ev.startDate === dateStr) return true;
      if (ev.endDate && dateStr >= ev.startDate && dateStr <= ev.endDate) return true;
      return false;
    });
  };

  const validBatchStudentIds = new Set(batchStudents.map((s) => s.id));

  const getAttendanceSummaryForDate = (dateStr: string) => {
    const rec = batchAttendanceRecords.find(
      (r) =>
        r.date === dateStr &&
        (!r.classId || r.classId === selectedClassId || selectedClassId === '') &&
        isAttendanceRecordActive(r, dayControlsMap, validBatchStudentIds, activeBatchId)
    );
    if (!rec) return null;
    const values = Object.values(rec.records);
    const present = values.filter((v) => v === 'present').length;
    return {
      present,
      total: values.length,
      rate: values.length > 0 ? Math.round((present / values.length) * 100) : 0,
    };
  };

  // Recording helpers & handlers
  const RECORDING_BASE_CATEGORIES = [
    'Physics',
    'Mathematics',
    'Chemistry',
    'Biology',
    'Revision',
    'ICT',
    'Past Papers',
    'Practical',
  ] as const;

  const formatDisplaySessionDate = (isoDate: string) => {
    if (!isoDate || !isoDate.includes('-')) return isoDate;
    const [y, m, d] = isoDate.split('-');
    return `${d}-${m}-${y}`;
  };

  const getRecordingCategory = (rec: ClassRecording): string => {
    const raw = (rec.category || rec.subject || 'Physics').trim();
    if (raw === 'Combined Mathematics') return 'Mathematics';
    return raw;
  };

  const getRecordingTeacherLabel = (rec: ClassRecording): string => {
    if (rec.teacherId) {
      const matched = batchRecordingTeachers.find((t) => t.id === rec.teacherId);
      if (matched?.name) return matched.name.trim();
    }
    return (rec.teacherName || '').trim() || 'Teacher Not Specified';
  };

  const getRecordingTeacherSubject = (rec: ClassRecording): string => {
    if ((rec.teacherSubject || '').trim()) return rec.teacherSubject!.trim();
    if (rec.teacherId) {
      const byId = batchRecordingTeachers.find((t) => t.id === rec.teacherId);
      if (byId?.subject) return byId.subject.trim();
    }
    const label = (rec.teacherName || '').trim().toLowerCase();
    if (label) {
      const byName = batchRecordingTeachers.find((t) => t.name.trim().toLowerCase() === label);
      if (byName?.subject) return byName.subject.trim();
    }
    return '';
  };

  const matchesRecordingCategory = (rec: ClassRecording, categoryFilter: string): boolean => {
    if (categoryFilter === 'all') return true;
    const cat = getRecordingCategory(rec);
    if (cat.toLowerCase() === categoryFilter.toLowerCase()) return true;
    if (
      categoryFilter.toLowerCase() === 'mathematics' &&
      (rec.subject || '').toLowerCase().includes('math')
    ) {
      return true;
    }
    return false;
  };

  const matchesRecordingTeacher = (rec: ClassRecording, teacherFilter: string): boolean => {
    if (teacherFilter === 'all') return true;
    return getRecordingTeacherLabel(rec).toLowerCase() === teacherFilter.toLowerCase();
  };

  const getRecordingsForDate = (dateStr: string) => {
    return batchRecordings.filter((rec) => rec.date === dateStr);
  };

  const filteredRecordingsRaw = batchRecordings.filter((rec) => {
    if (recordingViewScope === 'day' && rec.date !== recordingDate) return false;
    if (!matchesRecordingCategory(rec, recordingCategoryFilter)) return false;
    if (!matchesRecordingTeacher(rec, recordingTeacherFilter)) return false;
    return true;
  });

  const filteredRecordings = React.useMemo(() => {
    if (recordingSortMode !== 'most_watched') return filteredRecordingsRaw;
    return [...filteredRecordingsRaw].sort((a, b) => {
      const diff = (b.viewCount || 0) - (a.viewCount || 0);
      if (diff !== 0) return diff;
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [filteredRecordingsRaw, recordingSortMode]);

  // Top most-watched recordings in the active batch (shown with Trending indicator)
  const trendingRecordingIds = React.useMemo(() => {
    const withViews = batchRecordings
      .filter((r) => (r.viewCount || 0) > 0)
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    const topThresholdCount = Math.min(2, withViews.length);
    const ids = new Set<string>();
    for (let i = 0; i < topThresholdCount; i++) {
      ids.add(withViews[i].id);
    }
    return ids;
  }, [batchRecordings]);

  // Track unique session views per recording in Firestore cleanly
  const recordRecordingView = useCallback(async (recordingId: string) => {
    if (!recordingId || viewedRecordingIdsRef.current.has(recordingId)) return;
    viewedRecordingIdsRef.current.add(recordingId);
    try {
      await updateDoc(doc(db, 'classRecordings', recordingId), {
        viewCount: increment(1),
        lastViewedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Could not increment recording view count:', err);
    }
  }, []);

  const handleSelectRecordingItem = (rec: ClassRecording) => {
    setActiveRecordingId(rec.id);
    recordRecordingView(rec.id);
  };

  // Aggregate teacher profile summary & all subjects they teach (from manual directory + recordings, NEVER synced to user accounts)
  const getTeacherProfileSummary = useCallback(
    (teacherName: string, currentSubject?: string): TeacherProfileSummary => {
      const normalizedTarget = teacherName.trim().toLowerCase();

      const matchingDirEntries = batchRecordingTeachers.filter(
        (t) => t.name.trim().toLowerCase() === normalizedTarget
      );

      const matchingRecordings = batchRecordings.filter((r) => {
        const label = getRecordingTeacherLabel(r).toLowerCase();
        return label === normalizedTarget;
      });

      const subjectsMap = new Map<string, string>();
      const addSubject = (raw?: string) => {
        const clean = (raw || '').trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!subjectsMap.has(key)) {
          subjectsMap.set(key, clean);
        }
      };

      if (currentSubject) addSubject(currentSubject);
      matchingDirEntries.forEach((t) => addSubject(t.subject));
      matchingRecordings.forEach((r) => {
        addSubject(r.teacherSubject);
        addSubject(getRecordingCategory(r));
      });

      const allSubjects = Array.from(subjectsMap.values());
      const primarySubject =
        (currentSubject || '').trim() ||
        matchingDirEntries[0]?.subject?.trim() ||
        allSubjects[0] ||
        'Science Faculty';

      const otherSubjects = allSubjects.filter(
        (s) => s.toLowerCase() !== primarySubject.toLowerCase()
      );

      const totalRecordings = matchingRecordings.length;
      const totalViews = matchingRecordings.reduce((sum, r) => sum + (r.viewCount || 0), 0);
      const customSummary = matchingDirEntries.find((t) => t.profileSummary?.trim())?.profileSummary?.trim();

      const defaultSummary =
        totalRecordings > 0
          ? `Zahira College faculty educator teaching ${
              allSubjects.length > 0 ? allSubjects.join(', ') : primarySubject
            }, with ${totalRecordings} recorded ${
              totalRecordings === 1 ? 'lesson' : 'lessons'
            } and ${totalViews.toLocaleString()} cumulative student ${
              totalViews === 1 ? 'view' : 'views'
            }.`
          : `Zahira College faculty educator registered for ${
              allSubjects.length > 0 ? allSubjects.join(', ') : primarySubject
            }. Recordings uploaded under this teacher appear here.`;

      const sortedDates = matchingRecordings
        .map((r) => r.date)
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));

      return {
        name: matchingDirEntries[0]?.name || teacherName.trim(),
        primarySubject,
        otherSubjects,
        allSubjects: allSubjects.length > 0 ? allSubjects : [primarySubject],
        profileSummary: customSummary || defaultSummary,
        totalRecordings,
        totalViews,
        latestDate: sortedDates[0],
      };
    },
    [batchRecordingTeachers, batchRecordings]
  );

  const dayRecordingsForSelectedRecDate = batchRecordings.filter(
    (rec) =>
      rec.date === recordingDate &&
      matchesRecordingCategory(rec, recordingCategoryFilter) &&
      matchesRecordingTeacher(rec, recordingTeacherFilter)
  );

  // Unique dates in batch that contain recordings (newest first)
  const recordedDatesList = Array.from(new Set(batchRecordings.map((r) => r.date))).sort((a, b) =>
    b.localeCompare(a)
  );

  // Categories available in filter chips (presets + teacher directory subjects + recording categories)
  const availableRecordingCategories = Array.from(
    new Set([
      ...RECORDING_BASE_CATEGORIES,
      ...batchRecordingTeachers
        .map((t) => (t.subject === 'Combined Mathematics' ? 'Mathematics' : t.subject.trim()))
        .filter(Boolean),
      ...batchRecordings.map((r) => getRecordingCategory(r)).filter(Boolean),
    ])
  );

  // Unified Teacher filter entries: bulk-added manual teachers directory + any recording teacher names
  const teacherFilterOptions = React.useMemo(() => {
    const map = new Map<string, { name: string; subject: string; count: number }>();
    batchRecordingTeachers.forEach((t) => {
      const cleanName = t.name.trim();
      if (!cleanName) return;
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: cleanName, subject: t.subject.trim(), count: 0 });
      }
    });
    batchRecordings.forEach((rec) => {
      const cleanName = getRecordingTeacherLabel(rec);
      if (!cleanName || cleanName === 'Teacher Not Specified') return;
      const key = cleanName.toLowerCase();
      const existing = map.get(key);
      const inferredSubj = getRecordingTeacherSubject(rec) || getRecordingCategory(rec);
      if (existing) {
        existing.count += 1;
        if (!existing.subject && inferredSubj) existing.subject = inferredSubj;
      } else {
        map.set(key, { name: cleanName, subject: inferredSubj, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [batchRecordingTeachers, batchRecordings]);

  // Group filtered recordings by Teacher Name (preserving teacher subject)
  const recordingsGroupedByTeacher = React.useMemo(() => {
    const groups = new Map<string, { teacher: string; subject: string; items: ClassRecording[] }>();
    filteredRecordings.forEach((rec) => {
      const teacher = getRecordingTeacherLabel(rec);
      const subj = getRecordingTeacherSubject(rec);
      const key = teacher.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(rec);
        if (!existing.subject && subj) existing.subject = subj;
      } else {
        groups.set(key, { teacher, subject: subj, items: [rec] });
      }
    });
    return Array.from(groups.values());
  }, [filteredRecordings, batchRecordingTeachers]);

  // Keep activeRecordingId synced to a valid recording in the active list
  useEffect(() => {
    const pool =
      recordingSortMode === 'most_watched'
        ? filteredRecordings
        : recordingViewScope === 'day'
        ? dayRecordingsForSelectedRecDate
        : filteredRecordings;
    if (pool.length === 0) {
      if (activeRecordingId !== null) setActiveRecordingId(null);
      return;
    }
    if (!activeRecordingId || !pool.some((r) => r.id === activeRecordingId)) {
      setActiveRecordingId(pool[0].id);
    }
  }, [
    recordingDate,
    recordingViewScope,
    recordingCategoryFilter,
    recordingTeacherFilter,
    recordingSortMode,
    classRecordings,
    activeBatchId,
  ]);

  const activeRecording =
    filteredRecordings.find((r) => r.id === activeRecordingId) ||
    filteredRecordings[0] ||
    null;

  const handleSelectCategoryFilter = (nextCat: string) => {
    setRecordingCategoryFilter(nextCat);
    if (recordingViewScope === 'day' && nextCat !== 'all') {
      const hasMatchOnDay = batchRecordings.some(
        (rec) =>
          rec.date === recordingDate &&
          matchesRecordingCategory(rec, nextCat) &&
          matchesRecordingTeacher(rec, recordingTeacherFilter)
      );
      const hasMatchAnywhere = batchRecordings.some(
        (rec) =>
          matchesRecordingCategory(rec, nextCat) &&
          matchesRecordingTeacher(rec, recordingTeacherFilter)
      );
      if (!hasMatchOnDay && hasMatchAnywhere) {
        setRecordingViewScope('all');
      }
    }
  };

  const handleSelectTeacherFilter = (nextTeacher: string) => {
    setRecordingTeacherFilter(nextTeacher);
    if (recordingViewScope === 'day' && nextTeacher !== 'all') {
      const hasMatchOnDay = batchRecordings.some(
        (rec) =>
          rec.date === recordingDate &&
          matchesRecordingCategory(rec, recordingCategoryFilter) &&
          matchesRecordingTeacher(rec, nextTeacher)
      );
      const hasMatchAnywhere = batchRecordings.some(
        (rec) =>
          matchesRecordingCategory(rec, recordingCategoryFilter) &&
          matchesRecordingTeacher(rec, nextTeacher)
      );
      if (!hasMatchOnDay && hasMatchAnywhere) {
        setRecordingViewScope('all');
      }
    }
  };

  const shiftRecordingDate = (deltaDays: number) => {
    const d = new Date(`${recordingDate}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const nextIso = d.toISOString().split('T')[0];
    setRecordingDate(nextIso);
    setSelectedDateStr(nextIso);
    setRecordingViewScope('day');
  };

  const applySubjectToCategoryFields = (subjectRaw: string) => {
    const trimmed = subjectRaw.trim();
    if (!trimmed) return;
    const normalized = trimmed === 'Combined Mathematics' ? 'Mathematics' : trimmed;
    const matchedPreset = RECORDING_BASE_CATEGORIES.find(
      (cat) => cat.toLowerCase() === normalized.toLowerCase()
    );
    if (matchedPreset) {
      setRecCategory(matchedPreset);
      setRecCustomCategory('');
    } else {
      setRecCategory('__custom__');
      setRecCustomCategory(trimmed);
    }
  };

  const handleSelectDirectoryTeacherForUpload = (teacherId: string) => {
    setRecSelectedTeacherId(teacherId);
    const found = batchRecordingTeachers.find((t) => t.id === teacherId);
    if (found) {
      setRecTeacherName(found.name);
      setRecTeacherSubject(found.subject);
      applySubjectToCategoryFields(found.subject);
    } else {
      setRecTeacherName('');
      setRecTeacherSubject('');
    }
    if (recFormError) setRecFormError(null);
  };

  const openRecordingModal = (
    prefillDate?: string,
    target?: ClassRecording | null,
    preselectedTeacher?: RecordingTeacher | null
  ) => {
    if (!isTeacherOrAdmin) return;
    setRecFormError(null);
    if (target) {
      const targetCat = getRecordingCategory(target);
      const isPreset = (RECORDING_BASE_CATEGORIES as readonly string[]).includes(targetCat);
      const matchedDirTeacher =
        (target.teacherId && batchRecordingTeachers.find((t) => t.id === target.teacherId)) ||
        (target.teacherName &&
          batchRecordingTeachers.find(
            (t) => t.name.trim().toLowerCase() === target.teacherName!.trim().toLowerCase()
          )) ||
        null;

      setEditingRecording(target);
      setRecTitle(target.title);
      setRecYoutubeUrl(target.youtubeUrl);
      setRecDate(target.date);
      setRecCategory(isPreset ? targetCat : '__custom__');
      setRecCustomCategory(isPreset ? '' : targetCat);
      if (matchedDirTeacher) {
        setRecTeacherSelectionMode('directory');
        setRecSelectedTeacherId(matchedDirTeacher.id);
        setRecTeacherName(matchedDirTeacher.name);
        setRecTeacherSubject(target.teacherSubject || matchedDirTeacher.subject);
      } else {
        setRecTeacherSelectionMode(batchRecordingTeachers.length > 0 && !target.teacherName ? 'directory' : 'manual');
        setRecSelectedTeacherId('');
        setRecTeacherName(target.teacherName || '');
        setRecTeacherSubject(target.teacherSubject || '');
      }
      setRecSessionLabel(target.sessionLabel);
      setRecDurationLabel(target.durationLabel || '');
      setRecQualityLabel(target.qualityLabel || '720p');
      setRecDescription(target.description || '');
    } else {
      const targetDate = prefillDate || recordingDate || selectedDateStr;
      setEditingRecording(null);
      setRecTitle('');
      setRecYoutubeUrl('');
      setRecDate(targetDate);
      if (preselectedTeacher) {
        setRecTeacherSelectionMode('directory');
        setRecSelectedTeacherId(preselectedTeacher.id);
        setRecTeacherName(preselectedTeacher.name);
        setRecTeacherSubject(preselectedTeacher.subject);
        applySubjectToCategoryFields(preselectedTeacher.subject);
      } else {
        setRecCategory('Physics');
        setRecCustomCategory('');
        // Do NOT auto-sync from teacher accounts — admin/teacher picks from manually managed directory or types manually
        setRecTeacherSelectionMode(batchRecordingTeachers.length > 0 ? 'directory' : 'manual');
        setRecSelectedTeacherId('');
        setRecTeacherName('');
        setRecTeacherSubject('');
      }
      setRecSessionLabel(
        `${writeBatchName.toUpperCase()} THEORY ${formatDisplaySessionDate(targetDate)}`
      );
      setRecDurationLabel('');
      setRecQualityLabel('720p');
      setRecDescription('');
    }
    setIsRecordingModalOpen(true);
  };

  const handleSaveRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherOrAdmin) return;
    setRecFormError(null);

    const parsedVideoId = extractYouTubeVideoId(recYoutubeUrl);
    if (!parsedVideoId) {
      setRecFormError(
        'Please enter a valid YouTube link (e.g. youtube.com/watch?v=..., youtu.be/..., or youtube.com/live/...).'
      );
      return;
    }

    const resolvedCategory =
      recCategory === '__custom__' ? recCustomCategory.trim() : recCategory.trim();
    if (!resolvedCategory) {
      setRecFormError('Please select or enter a category (e.g. Physics, Mathematics, Revision).');
      return;
    }

    let resolvedTeacherId: string | undefined;
    let resolvedTeacherName = recTeacherName.trim();
    let resolvedTeacherSubject = recTeacherSubject.trim();

    if (recTeacherSelectionMode === 'directory') {
      const dirTeacher = batchRecordingTeachers.find((t) => t.id === recSelectedTeacherId);
      if (!dirTeacher) {
        setRecFormError('Please select a teacher from the list (or switch to Custom Name).');
        return;
      }
      resolvedTeacherId = dirTeacher.id;
      resolvedTeacherName = dirTeacher.name.trim();
      resolvedTeacherSubject = dirTeacher.subject.trim();
    } else if (!resolvedTeacherName) {
      setRecFormError('Please select or enter the teacher’s name for this recording.');
      return;
    }

    if (!recTitle.trim() || !recDate) {
      setRecFormError('Please provide both a recording title and calendar date.');
      return;
    }

    setSavingRecording(true);
    try {
      const nowIso = new Date().toISOString();
      const recordingId = editingRecording?.id || `rec-${Date.now()}`;
      const payload: ClassRecording = sanitizeFirestoreDoc({
        id: recordingId,
        title: recTitle.trim(),
        youtubeUrl: recYoutubeUrl.trim(),
        youtubeVideoId: parsedVideoId,
        date: recDate,
        batchId: editingRecording?.batchId || writeBatchId,
        batchName: editingRecording?.batchName || writeBatchName,
        subject: resolvedCategory,
        category: resolvedCategory,
        teacherId: resolvedTeacherId,
        teacherName: resolvedTeacherName,
        teacherSubject: resolvedTeacherSubject || resolvedCategory,
        sessionLabel:
          recSessionLabel.trim() ||
          `${writeBatchName.toUpperCase()} ${formatDisplaySessionDate(recDate)}`,
        durationLabel: recDurationLabel.trim() || undefined,
        qualityLabel: recQualityLabel || '720p',
        description: recDescription.trim() || undefined,
        viewCount: editingRecording?.viewCount ?? 0,
        lastViewedAt: editingRecording?.lastViewedAt,
        uploadedBy: editingRecording?.uploadedBy || userProfile?.userId || 'faculty',
        uploadedByName: editingRecording?.uploadedByName || userProfile?.fullName || 'Faculty Lead',
        uploadedByRole:
          editingRecording?.uploadedByRole || (activeRole === 'admin' ? 'admin' : 'teacher'),
        createdAt: editingRecording?.createdAt || nowIso,
        updatedAt: nowIso,
      });

      await setDoc(doc(db, 'classRecordings', recordingId), payload, { merge: true });

      setIsRecordingModalOpen(false);
      setRecordingDate(recDate);
      setSelectedDateStr(recDate);
      setRecordingViewScope('day');
      setActiveRecordingId(recordingId);
      setActiveTab('recordings');
      setSyncMessage(
        editingRecording
          ? `Updated class recording "${payload.title}".`
          : `Uploaded recording "${payload.title}" under ${resolvedTeacherName}${
              resolvedTeacherSubject ? ` (${resolvedTeacherSubject})` : ''
            }.`
      );
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      console.warn('Save recording failed:', err);
      setRecFormError(err?.message || 'Unable to save class recording. Please verify Firestore permissions.');
    } finally {
      setSavingRecording(false);
    }
  };

  // Bulk Recording Teachers Directory Handlers (Admin & Teacher Only — zero account sync)
  const createEmptyBulkTeacherRow = () => ({
    localId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    subject: '',
  });

  const openTeacherDirectoryModal = () => {
    if (!isTeacherOrAdmin) return;
    setTeacherDirectoryError(null);
    setBulkTeacherPasteText('');
    setEditingTeacherEntryId(null);
    setTeacherEntryToDelete(null);
    setBulkTeacherRows([
      createEmptyBulkTeacherRow(),
      createEmptyBulkTeacherRow(),
      createEmptyBulkTeacherRow(),
    ]);
    setIsTeacherDirectoryModalOpen(true);
  };

  const handleParseBulkTeachersPaste = () => {
    setTeacherDirectoryError(null);
    const lines = bulkTeacherPasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setTeacherDirectoryError(
        'Paste at least one line in the format "Teacher Name - Subject" or "Teacher Name, Subject".'
      );
      return;
    }

    const parsedRows: Array<{ localId: string; name: string; subject: string }> = [];
    const invalidLines: number[] = [];

    lines.forEach((line, index) => {
      // Split by tab, pipe, comma, em/en dash, or space-padded hyphen (so hyphenated names stay intact)
      let parts: string[] = [];
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes('|')) parts = line.split('|');
      else if (line.includes('—')) parts = line.split('—');
      else if (line.includes('–')) parts = line.split('–');
      else if (line.includes(',')) parts = line.split(',');
      else if (/\s+-\s+/.test(line)) parts = line.split(/\s+-\s+/);
      else if (line.includes('-')) parts = line.split('-');

      const name = (parts[0] || '').trim();
      const subject = parts.slice(1).join(' ').trim();
      if (!name || !subject) {
        invalidLines.push(index + 1);
      } else {
        parsedRows.push({
          localId: `parsed-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          subject,
        });
      }
    });

    if (parsedRows.length === 0) {
      setTeacherDirectoryError(
        'Could not parse Name and Subject from lines. Use format like: Mr. M.F.M. Rizwan - Physics'
      );
      return;
    }

    setBulkTeacherRows((prev) => {
      const nonEmptyExisting = prev.filter((r) => r.name.trim() || r.subject.trim());
      return [...nonEmptyExisting, ...parsedRows];
    });
    setBulkTeacherPasteText('');

    if (invalidLines.length > 0) {
      setTeacherDirectoryError(
        `Loaded ${parsedRows.length} teacher(s). Line(s) ${invalidLines.join(
          ', '
        )} skipped because a subject separator (-, comma, or |) was missing.`
      );
    }
  };

  const handleSaveBulkTeachers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherOrAdmin) return;
    setTeacherDirectoryError(null);

    const populatedRows = bulkTeacherRows.filter(
      (row) => row.name.trim().length > 0 || row.subject.trim().length > 0
    );

    if (populatedRows.length === 0) {
      setTeacherDirectoryError('Add at least one teacher name and subject before saving.');
      return;
    }

    const incompleteRow = populatedRows.find((r) => !r.name.trim() || !r.subject.trim());
    if (incompleteRow) {
      setTeacherDirectoryError('Every row needs both a Teacher Name and a Subject.');
      return;
    }

    setSavingBulkTeachers(true);
    try {
      const targetBatchId = bulkTeacherApplyAllBatches ? ALL_BATCHES_ID : writeBatchId;
      const targetBatchName = bulkTeacherApplyAllBatches ? 'All Batches' : writeBatchName;
      const nowIso = new Date().toISOString();

      const existingKeys = new Set(
        batchRecordingTeachers.map(
          (t) => `${t.name.trim().toLowerCase()}::${t.subject.trim().toLowerCase()}`
        )
      );

      const batch = writeBatch(db);
      let addedCount = 0;

      populatedRows.forEach((row, idx) => {
        const cleanName = row.name.trim();
        const cleanSubject = row.subject.trim();
        const dedupKey = `${cleanName.toLowerCase()}::${cleanSubject.toLowerCase()}`;
        if (existingKeys.has(dedupKey)) return;
        existingKeys.add(dedupKey);

        const docId = `rteacher-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        const entry: RecordingTeacher = sanitizeFirestoreDoc({
          id: docId,
          name: cleanName,
          subject: cleanSubject,
          batchId: targetBatchId,
          batchName: targetBatchName,
          createdBy: userProfile?.userId || 'faculty',
          createdByName: userProfile?.fullName || 'Faculty Lead',
          createdByRole: activeRole === 'admin' ? 'admin' : 'teacher',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        batch.set(doc(db, 'recordingTeachers', docId), entry);
        addedCount += 1;
      });

      if (addedCount === 0) {
        setTeacherDirectoryError(
          'All entered teacher and subject pairs are already in your directory.'
        );
        setSavingBulkTeachers(false);
        return;
      }

      await batch.commit();

      setBulkTeacherRows([
        createEmptyBulkTeacherRow(),
        createEmptyBulkTeacherRow(),
        createEmptyBulkTeacherRow(),
      ]);
      setBulkTeacherPasteText('');
      setSyncMessage(`Added ${addedCount} teacher${addedCount === 1 ? '' : 's'} with subjects to Recordings.`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      console.warn('Bulk teachers save error:', err);
      setTeacherDirectoryError(err?.message || 'Unable to save teachers list. Please try again.');
    } finally {
      setSavingBulkTeachers(false);
    }
  };

  const handleSaveTeacherEntryEdit = async (entry: RecordingTeacher) => {
    if (!isTeacherOrAdmin) return;
    const cleanName = editingTeacherEntryName.trim();
    const cleanSubject = editingTeacherEntrySubject.trim();
    if (!cleanName || !cleanSubject) {
      setTeacherDirectoryError('Both Teacher Name and Subject are required.');
      return;
    }
    setSavingTeacherEntryEdit(true);
    try {
      const updated = sanitizeFirestoreDoc({
        ...entry,
        name: cleanName,
        subject: cleanSubject,
        profileSummary: editingTeacherEntryBio.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'recordingTeachers', entry.id), updated, { merge: true });
      setEditingTeacherEntryId(null);
      setEditingTeacherEntryBio('');
      setTeacherDirectoryError(null);
    } catch (err: any) {
      console.warn('Edit teacher entry error:', err);
      setTeacherDirectoryError(err?.message || 'Unable to update teacher entry.');
    } finally {
      setSavingTeacherEntryEdit(false);
    }
  };

  const handleConfirmDeleteTeacherEntry = async () => {
    if (!teacherEntryToDelete || !isTeacherOrAdmin) return;
    const target = teacherEntryToDelete;
    setTeacherEntryToDelete(null);
    try {
      await deleteDoc(doc(db, 'recordingTeachers', target.id));
      if (
        recordingTeacherFilter !== 'all' &&
        recordingTeacherFilter.toLowerCase() === target.name.trim().toLowerCase()
      ) {
        setRecordingTeacherFilter('all');
      }
      if (recSelectedTeacherId === target.id) {
        setRecSelectedTeacherId('');
        setRecTeacherName('');
        setRecTeacherSubject('');
      }
      setSyncMessage(`Removed "${target.name} (${target.subject})" from recording teachers list.`);
      setTimeout(() => setSyncMessage(null), 3500);
    } catch (err: any) {
      console.warn('Delete teacher entry error:', err);
      setTeacherDirectoryError(err?.message || 'Unable to remove teacher entry.');
    }
  };

  const handleConfirmDeleteRecording = async () => {
    if (!recordingToDelete || !isTeacherOrAdmin) return;
    const target = recordingToDelete;
    setRecordingToDelete(null);
    try {
      await deleteDoc(doc(db, 'classRecordings', target.id));
      if (activeRecordingId === target.id) {
        setActiveRecordingId(null);
      }
      setSyncMessage(`Removed recording "${target.title}".`);
      setTimeout(() => setSyncMessage(null), 3500);
    } catch (err: any) {
      console.warn('Delete recording error:', err);
      setSyncMessage(err?.message || 'Unable to delete recording right now.');
    }
  };

  const handleToggleWatched = async (recording: ClassRecording) => {
    const uid = userProfile?.userId || 'guest';
    const progressId = `${uid}__${recording.id}`;
    const currentlyWatched = !!watchProgressMap[recording.id]?.watched;
    const nextWatched = !currentlyWatched;

    setSavingWatchId(recording.id);
    try {
      const nowIso = new Date().toISOString();
      const payload: RecordingWatchProgress = sanitizeFirestoreDoc({
        id: progressId,
        recordingId: recording.id,
        userId: uid,
        userName: userProfile?.fullName || 'Scholar',
        batchId: recording.batchId,
        watched: nextWatched,
        watchedAt: nextWatched ? nowIso : undefined,
        updatedAt: nowIso,
      });
      await setDoc(doc(db, 'recordingWatchProgress', progressId), payload, { merge: true });
    } catch (err: any) {
      console.warn('Watch progress toggle warning:', err);
    } finally {
      setSavingWatchId(null);
    }
  };

  // Stats for the active attendance date (calculated strictly from active real scholars in active batch)
  const totalStudents = batchStudents.length;
  const presentCount = batchStudents.filter((s) => (register[s.id] || 'present') === 'present').length;
  const absentCount = batchStudents.filter((s) => register[s.id] === 'absent').length;
  const lateCount = batchStudents.filter((s) => register[s.id] === 'late').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-lg bg-stone-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              {activeBatchName}
            </span>
            <span className="text-xs font-semibold text-stone-500">Zahira College Mawanella</span>
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-stone-900 mt-1">
            Academic Calendar & Student Attendance
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Manage school holidays, examination timetables, Google Calendar synchronization, and batch roll calls for {activeBatchName}.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!isBatchLocked && (
            <select
              value={activeBatchId}
              onChange={(e) => setActiveBatchId(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800 shadow-xs"
              aria-label="Filter calendar by batch"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch: {b.name}
                </option>
              ))}
              <option value={ALL_BATCHES_ID}>All Batches ({batches.length})</option>
            </select>
          )}
          {/* Google Calendar Sync Button */}
          <button
            onClick={handleSyncGoogleCalendar}
            disabled={syncingGoogle}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all shadow-xs ${
              googleAccessToken
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
            title="Synchronize Google Calendar events with Firestore in real time"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingGoogle ? 'animate-spin text-emerald-600' : 'text-stone-500'}`} />
            <span>
              {syncingGoogle
                ? 'Syncing...'
                : googleAccessToken
                ? 'Sync Google Calendar'
                : 'Connect & Sync Google Calendar'}
            </span>
          </button>

          {/* Quick Access to Class Recordings when viewing Events or Attendance */}
          {activeTab !== 'recordings' && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('recordings');
                setRecordingDate(selectedDateStr);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-[#0284c7]/30 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 px-3.5 py-2 text-xs font-bold text-[#0284c7] dark:text-sky-300 transition-colors shadow-xs"
            >
              <Video className="w-4 h-4 shrink-0" />
              <span>Class Recordings ({batchRecordings.length})</span>
            </button>
          )}

          {/* Upload Recording CTA when on Recordings tab (Teachers & Admins Only) */}
          {activeTab === 'recordings' && isTeacherOrAdmin && (
            <button
              onClick={() => openRecordingModal(recordingDate)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] px-4 py-2 text-xs font-bold text-white transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Class Recording</span>
            </button>
          )}

          {/* Mark Holiday, Exam, or Study Group Button */}
          {isTeacherOrAdmin ? (
            <button
              onClick={() => {
                setEventStartDate(selectedDateStr);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Mark Holiday, Exam or Study Group</span>
            </button>
          ) : (
            userProfile && (
              <button
                onClick={() => {
                  setEventType('study_group');
                  setEventStartDate(selectedDateStr);
                  setIsAddModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white hover:bg-violet-800 transition-colors shadow-xs"
              >
                <Users className="w-4 h-4 text-violet-200" />
                <span>Schedule Study Group</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncMessage}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* View Tabs (Wrap cleanly so Class Recordings is never clipped off-screen on mobile or desktop) */}
      <div
        role="tablist"
        aria-label="Calendar sections"
        className="flex flex-wrap items-center gap-1.5 sm:gap-2 border-b border-stone-200 dark:border-slate-800 pb-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'events'}
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'events'
              ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-xs'
              : 'bg-stone-100/80 dark:bg-slate-800/80 text-stone-600 dark:text-slate-300 hover:bg-stone-200/80 dark:hover:bg-slate-800'
          }`}
        >
          <CalendarIcon className="w-4 h-4 shrink-0" />
          <span>School Events & Holidays</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono tabular-nums ${
              activeTab === 'events'
                ? 'bg-white/20 text-white dark:bg-stone-900/15 dark:text-stone-900'
                : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300'
            }`}
          >
            {batchSchoolEvents.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'attendance'}
          onClick={() => {
            setActiveTab('attendance');
            setAttendanceDate(selectedDateStr);
          }}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-xs'
              : 'bg-stone-100/80 dark:bg-slate-800/80 text-stone-600 dark:text-slate-300 hover:bg-stone-200/80 dark:hover:bg-slate-800'
          }`}
        >
          <CalendarCheck2 className="w-4 h-4 shrink-0" />
          <span>Attendance Calendar & Roll-Call</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono tabular-nums ${
              activeTab === 'attendance'
                ? 'bg-emerald-500/25 text-emerald-100 dark:bg-emerald-600/20 dark:text-emerald-800'
                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {totalStudents} Scholars
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'recordings'}
          onClick={() => {
            setActiveTab('recordings');
            setRecordingDate(selectedDateStr);
          }}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'recordings'
              ? 'bg-[#0284c7] text-white shadow-xs'
              : 'bg-sky-50/90 dark:bg-sky-950/40 text-[#0284c7] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-sky-200/80 dark:border-sky-800/60'
          }`}
        >
          <Video className="w-4 h-4 shrink-0" />
          <span>Class Recordings</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono tabular-nums ${
              activeTab === 'recordings'
                ? 'bg-white/25 text-white'
                : 'bg-sky-100 dark:bg-sky-900/70 text-sky-800 dark:text-sky-200'
            }`}
          >
            {batchRecordings.length}
          </span>
        </button>
      </div>

      {/* TAB 1: SCHOOL EVENTS & EXAM TIMETABLES */}
      {activeTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Monthly Calendar View */}
          <div className="lg:col-span-2 space-y-4">
            {/* Calendar Controls */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg font-bold text-stone-900">{monthName}</h3>
                  <button
                    onClick={handleToday}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                  >
                    Today
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Event Type Filter */}
                  <div className="flex items-center gap-1 rounded-lg border border-stone-200 p-0.5 text-[11px] font-semibold overflow-x-auto no-scrollbar max-w-full">
                    <button
                      onClick={() => setEventTypeFilter('all')}
                      className={`rounded px-2 py-1 ${
                        eventTypeFilter === 'all' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setEventTypeFilter('holiday')}
                      className={`rounded px-2 py-1 ${
                        eventTypeFilter === 'holiday' ? 'bg-emerald-700 text-white' : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      Holidays
                    </button>
                    <button
                      onClick={() => setEventTypeFilter('exam')}
                      className={`rounded px-2 py-1 ${
                        eventTypeFilter === 'exam' ? 'bg-rose-700 text-white' : 'text-rose-700 hover:bg-rose-50'
                      }`}
                    >
                      Exams
                    </button>
                    <button
                      onClick={() => setEventTypeFilter('academic')}
                      className={`rounded px-2 py-1 ${
                        eventTypeFilter === 'academic' ? 'bg-sky-700 text-white' : 'text-sky-700 hover:bg-sky-50'
                      }`}
                    >
                      Academic
                    </button>
                    <button
                      onClick={() => setEventTypeFilter('study_group')}
                      className={`rounded px-2 py-1 ${
                        eventTypeFilter === 'study_group' ? 'bg-violet-700 text-white' : 'text-violet-700 hover:bg-violet-50'
                      }`}
                    >
                      Study Groups
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={handlePrevMonth}
                      className="rounded-lg border border-stone-200 p-1.5 text-stone-600 hover:bg-stone-100 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="rounded-lg border border-stone-200 p-1.5 text-stone-600 hover:bg-stone-100 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Day of week headers */}
              <div className="grid grid-cols-7 gap-1 pt-3 text-center text-[11px] font-bold uppercase tracking-wider text-stone-400">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {/* Calendar Days Matrix */}
              <div className="grid grid-cols-7 gap-1 pt-2">
                {/* Empty offset days */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-16 sm:h-24 rounded-xl bg-stone-50/40 p-1" />
                ))}

                {/* Month Days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const isSelected = selectedDateStr === dateStr;
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;
                  const dayEvents = getEventsForDate(dateStr);
                  const dayRecordings = getRecordingsForDate(dateStr);
                  const attSummary = getAttendanceSummaryForDate(dateStr);

                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDateStr(dateStr)}
                      className={`h-16 sm:h-24 rounded-xl border p-1 sm:p-1.5 flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'border-stone-900 bg-amber-50/40 shadow-xs ring-1 ring-stone-900'
                          : isToday
                          ? 'border-amber-400 bg-amber-50/20'
                          : 'border-stone-100 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-bold inline-flex h-5 w-5 items-center justify-center rounded-full ${
                            isToday
                              ? 'bg-amber-400 text-stone-900 font-extrabold'
                              : isSelected
                              ? 'bg-stone-900 text-white'
                              : 'text-stone-700'
                          }`}
                        >
                          {dayNum}
                        </span>

                        <div className="flex items-center gap-1">
                          {dayRecordings.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDateStr(dateStr);
                                setRecordingDate(dateStr);
                                setRecordingViewScope('day');
                                setActiveTab('recordings');
                              }}
                              className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 bg-sky-100 text-[#0284c7] hover:bg-sky-200 text-[9px] font-bold transition-colors"
                              title={`${dayRecordings.length} class recording${dayRecordings.length > 1 ? 's' : ''} on ${dateStr}`}
                            >
                              <PlayCircle className="w-2.5 h-2.5" />
                              <span className="hidden sm:inline">{dayRecordings.length}</span>
                            </button>
                          )}

                          {attSummary && (
                            <span
                              className={`h-2 w-2 rounded-full ${
                                attSummary.rate >= 80
                                  ? 'bg-emerald-500'
                                  : attSummary.rate >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              title={`Attendance on ${dateStr}: ${attSummary.rate}% (${attSummary.present}/${attSummary.total})`}
                            />
                          )}
                        </div>
                      </div>

                      {/* Event Chips */}
                      <div className="space-y-1 overflow-y-auto max-h-12 text-[10px]">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className={`truncate rounded px-1 py-0.5 font-semibold text-[9px] border leading-tight ${
                              ev.type === 'holiday'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : ev.type === 'exam'
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : ev.type === 'academic'
                                ? 'bg-sky-100 text-sky-800 border-sky-200'
                                : ev.type === 'study_group'
                                ? 'bg-violet-100 text-violet-800 border-violet-200'
                                : 'bg-stone-100 text-stone-700 border-stone-200'
                            }`}
                            title={`${ev.title} (${ev.type.toUpperCase()})`}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[9px] font-bold text-stone-400 block text-right">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 bg-white rounded-xl border border-stone-200 p-3">
              <span className="font-bold uppercase tracking-wider text-[10px] text-stone-400">Legend:</span>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Holiday / College Closure</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span>Examination / Test Date</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                <span>Academic Lab & Lecture</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                <span>Peer Study Group</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-500" />
                <span>Meeting / General</span>
              </div>
            </div>
          </div>

          {/* Right Col: Selected Date Events & Actions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                    Selected Date Schedule
                  </span>
                  <h4 className="font-serif text-lg font-bold text-stone-900 mt-0.5">
                    {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h4>
                </div>

                {isTeacherOrAdmin && (
                  <button
                    onClick={() => {
                      setEventStartDate(selectedDateStr);
                      setIsAddModalOpen(true);
                    }}
                    className="rounded-lg bg-stone-900 p-1.5 text-amber-400 hover:bg-stone-800 transition-colors"
                    title="Add Event on this date"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Events on selected date */}
              <div className="mt-4 space-y-3">
                {getEventsForDate(selectedDateStr).length === 0 ? (
                  <div className="text-center py-8 text-stone-400">
                    <CalendarIcon className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    <p className="text-xs font-semibold text-stone-600">No events scheduled for this day.</p>
                    {isTeacherOrAdmin && (
                      <p className="text-[11px] text-stone-400 mt-1">
                        Click "Mark Holiday or Exam" to schedule a date.
                      </p>
                    )}
                  </div>
                ) : (
                  getEventsForDate(selectedDateStr).map((ev) => (
                    <div
                      key={ev.id}
                      className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                        ev.type === 'holiday'
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : ev.type === 'exam'
                          ? 'border-rose-200 bg-rose-50/40'
                          : ev.type === 'academic'
                          ? 'border-sky-200 bg-sky-50/40'
                          : ev.type === 'study_group'
                          ? 'border-violet-200 bg-violet-50/40'
                          : 'border-stone-200 bg-stone-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                ev.type === 'holiday'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ev.type === 'exam'
                                  ? 'bg-rose-100 text-rose-800'
                                  : ev.type === 'academic'
                                  ? 'bg-sky-100 text-sky-800'
                                  : ev.type === 'study_group'
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-stone-200 text-stone-800'
                              }`}
                            >
                              {ev.type === 'study_group' ? 'Study Group' : ev.type}
                            </span>
                            {ev.studyRoomName && (
                              <span className="rounded bg-white px-2 py-0.5 text-[9px] font-bold text-violet-700 border border-violet-200">
                                Room: {ev.studyRoomName}
                              </span>
                            )}
                          </div>
                          <h5 className="font-bold text-stone-900 text-sm mt-1">{ev.title}</h5>
                        </div>

                        {isTeacherOrAdmin && (
                          <button
                            onClick={() => setDeleteConfirmEvent(ev)}
                            className="rounded p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remove event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-xs text-stone-600 leading-relaxed">{ev.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-500 pt-1 border-t border-stone-200/50">
                        {ev.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            {ev.time}
                          </span>
                        )}
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-stone-400" />
                            {ev.location}
                          </span>
                        )}
                        {ev.isSyncedWithGoogle && (
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Google Calendar
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Scheduled Classes for this Date */}
              <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">
                    Day's Classes ({getClassesForDate(selectedDateStr).length})
                  </span>
                  {isTeacherOrAdmin && (
                    <button
                      onClick={() => {
                        setNewClassDate(selectedDateStr);
                        setIsScheduleClassModalOpen(true);
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Class</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {getClassesForDate(selectedDateStr).map((cls) => (
                    <div
                      key={cls.id}
                      className="p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-stone-900 text-[11px]">{cls.subject}</p>
                        <p className="text-[10px] text-stone-500 font-normal">
                          {cls.timeSlot} • {cls.room}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                        {cls.periodName || 'Class'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Class Recordings for this Date */}
              <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">
                    Day's Recordings ({getRecordingsForDate(selectedDateStr).length})
                  </span>
                  {isTeacherOrAdmin && (
                    <button
                      onClick={() => openRecordingModal(selectedDateStr)}
                      className="text-[10px] font-bold text-[#0284c7] hover:text-[#0369a1] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Upload Recording</span>
                    </button>
                  )}
                </div>

                {getRecordingsForDate(selectedDateStr).length === 0 ? (
                  <p className="text-[11px] text-stone-400">No class recordings uploaded for {selectedDateStr}.</p>
                ) : (
                  <div className="space-y-1.5">
                    {getRecordingsForDate(selectedDateStr).map((rec) => {
                      const teacherLabel = getRecordingTeacherLabel(rec);
                      const teacherSubj = getRecordingTeacherSubject(rec);
                      const isTrending = trendingRecordingIds.has(rec.id);
                      return (
                        <div
                          key={rec.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setRecordingDate(selectedDateStr);
                            setRecordingViewScope('day');
                            handleSelectRecordingItem(rec);
                            setActiveTab('recordings');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setRecordingDate(selectedDateStr);
                              setRecordingViewScope('day');
                              handleSelectRecordingItem(rec);
                              setActiveTab('recordings');
                            }
                          }}
                          className="w-full text-left p-2 rounded-lg bg-sky-50/70 hover:bg-sky-100/80 border border-sky-200/80 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-bold text-stone-900 text-[11px] truncate">{rec.title}</p>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
                              <span>{getRecordingCategory(rec)}</span>
                              {rec.teacherName && (
                                <>
                                  <span>·</span>
                                  <TeacherNameHoverTrigger
                                    teacherName={teacherLabel}
                                    currentSubject={teacherSubj || getRecordingCategory(rec)}
                                    getSummary={getTeacherProfileSummary}
                                    onFilterByTeacher={(name) => {
                                      setRecordingViewScope('all');
                                      handleSelectTeacherFilter(name);
                                      setActiveTab('recordings');
                                    }}
                                    className="font-semibold text-stone-700"
                                  >
                                    <span>
                                      {teacherLabel}
                                      {teacherSubj ? ` (${teacherSubj})` : ''}
                                    </span>
                                  </TeacherNameHoverTrigger>
                                </>
                              )}
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-stone-600">
                                <Eye className="w-2.5 h-2.5 text-[#0284c7]" />
                                {formatRecordingViewCount(rec.viewCount)}
                              </span>
                              {isTrending && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800">
                                  <TrendingUp className="w-2.5 h-2.5" />
                                  Trending
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-[#0284c7] px-2 py-1 text-[10px] font-bold text-white">
                            <PlayCircle className="w-3 h-3" />
                            Watch
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Actions for this Date */}
              <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
                <button
                  onClick={() => {
                    setAttendanceDate(selectedDateStr);
                    setActiveTab('attendance');
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-2 px-3 text-xs font-bold text-white transition-colors shadow-xs"
                >
                  <CalendarCheck2 className="w-4 h-4 text-white" />
                  <span>Mark Attendance for {selectedDateStr}</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePreviewDailyComprehensivePDF(selectedDateStr)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 py-2 px-2 text-xs font-bold text-blue-700 transition-colors shadow-2xs"
                    title={`Preview ${selectedDateStr} attendance PDF`}
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>Preview PDF</span>
                  </button>

                  <button
                    onClick={() => handleExportDailyComprehensivePDF(selectedDateStr)}
                    disabled={exportingPDF}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 py-2 px-2 text-xs font-bold text-stone-800 transition-colors shadow-xs"
                    title={`Export ${selectedDateStr} attendance PDF`}
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>{exportingPDF ? 'Exporting...' : 'Export PDF'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Upcoming Academic Milestones List */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
              <h4 className="font-serif text-sm font-bold text-stone-900 mb-3 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Upcoming Milestones & Exams</span>
              </h4>

              <div className="space-y-2.5">
                {batchSchoolEvents
                  .filter((e) => e.type === 'exam' || e.type === 'holiday' || e.type === 'study_group')
                  .slice(0, 5)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedDateStr(ev.startDate)}
                      className="group cursor-pointer rounded-xl border border-stone-100 hover:border-stone-300 p-2.5 transition-all hover:bg-stone-50/50"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-bold text-stone-800 group-hover:text-stone-900 truncate">
                          {ev.title}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0 ${
                            ev.type === 'holiday'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ev.type === 'study_group'
                              ? 'bg-violet-100 text-violet-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {ev.type === 'study_group' ? 'Study Group' : ev.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {ev.startDate}{ev.studyRoomName ? ` • ${ev.studyRoomName}` : ''}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT ATTENDANCE CALENDAR & QUICK REGISTER */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          {!isTeacherOrAdmin && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-blue-900 block mb-0.5">
                  Teacher-Certified Attendance Policy (View-Only Mode)
                </span>
                Official student roll-calls are conducted exclusively by authorized teachers and administration. Students have certified read-only access.
              </div>
            </div>
          )}

          {/* Controls Bar */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="font-semibold text-stone-500 uppercase tracking-wider block mb-1 text-[10px]">
                  Class Cohort
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-stone-800 font-semibold focus:outline-none"
                  >
                    {batchClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.grade})
                      </option>
                    ))}
                  </select>
                  {isTeacherOrAdmin && selectedClassId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetCohort = batchClasses.find((c) => c.id === selectedClassId);
                        if (targetCohort) setCohortToDelete(targetCohort);
                      }}
                      className="p-1.5 rounded-lg border border-stone-200 hover:bg-rose-50 hover:text-rose-600 text-stone-400 transition-colors"
                      title="Remove class cohort"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-500 uppercase tracking-wider block mb-1 text-[10px]">
                  Roll-Call Session Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => {
                    setAttendanceDate(e.target.value);
                    setSelectedDateStr(e.target.value);
                  }}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-stone-800 font-semibold focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {attendanceSaved && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Saved to Firestore in real time!</span>
                </div>
              )}

              {/* SINGLE DAY MULTI-CLASS PDF PREVIEW & EXPORT BUTTONS */}
              <button
                onClick={() => handlePreviewDailyComprehensivePDF(attendanceDate)}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3.5 py-1.5 text-xs font-bold text-blue-700 transition-colors shadow-2xs"
                title="Preview certified single-day PDF in-app"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>Preview Daily PDF</span>
              </button>

              <button
                onClick={() => handleExportDailyComprehensivePDF(attendanceDate)}
                disabled={exportingPDF}
                className="flex items-center gap-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 px-3.5 py-1.5 text-xs font-bold text-white transition-colors shadow-xs"
                title="Export certified single-day PDF with all classes and student attendance"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>{exportingPDF ? 'Exporting...' : 'Export Daily PDF'}</span>
              </button>

              {isTeacherOrAdmin && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleCalendarDayAttendance}
                    disabled={togglingDay}
                    role="switch"
                    aria-checked={isDayAttendanceEnabled}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-all ${
                      isDayAttendanceEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-700 hover:bg-slate-800 text-white border-slate-600'
                    }`}
                    title="Turn attendance marking ON or OFF for this date"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Attendance: {isDayAttendanceEnabled ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewClassDate(attendanceDate);
                      setIsScheduleClassModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                    <span>Add Class Session</span>
                  </button>

                  <button
                    onClick={handleMarkAllPresent}
                    disabled={!isDayAttendanceEnabled}
                    className="rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-45 disabled:pointer-events-none px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors"
                  >
                    Mark All Present
                  </button>
                  <button
                    onClick={() => {
                      const activeClass = selectedScheduledClassId
                        ? batchScheduledClasses.find((c) => c.id === selectedScheduledClassId) ||
                          getClassesForDate(attendanceDate).find((c) => c.id === selectedScheduledClassId)
                        : getClassesForDate(attendanceDate)[0];
                      handleSaveClassAttendance(activeClass);
                    }}
                    disabled={!isDayAttendanceEnabled}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 disabled:pointer-events-none px-4 py-1.5 text-xs font-bold text-white transition-colors shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>Save Class Attendance</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {!isDayAttendanceEnabled && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Attendance Marking is OFF for {attendanceDate}:</strong> No need to mark attendance today, and records from this day are not synced to Student &amp; Teacher Dashboard graphs.
                </span>
              </div>
              {isTeacherOrAdmin && (
                <button
                  type="button"
                  onClick={handleToggleCalendarDayAttendance}
                  disabled={togglingDay}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[11px] font-bold shrink-0"
                >
                  <Power className="w-3 h-3" />
                  <span>Turn ON Attendance</span>
                </button>
              )}
            </div>
          )}

          {/* Daily Multi-Class Session Selector */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 shadow-xs space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">
                  Classes Occurring on {attendanceDate}
                </span>
                <p className="text-xs font-bold text-stone-900 mt-0.5">
                  Click a class session below to mark its individual roll call:
                </p>
              </div>
              <span className="text-[11px] font-semibold text-stone-500">
                {getClassesForDate(attendanceDate).length} class session(s) scheduled
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              {getClassesForDate(attendanceDate).map((cls, idx) => {
                const isSelected =
                  selectedScheduledClassId === cls.id || (!selectedScheduledClassId && idx === 0);
                const classRecs = cls.attendanceRecords || (isSelected ? register : {});
                const pCount = Object.values(classRecs).filter((s) => s === 'present').length;
                const total = batchStudents.length || 1;
                const rate = Math.round((pCount / total) * 100);

                return (
                  <div
                    key={cls.id}
                    className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-white border-blue-600 text-blue-900 shadow-xs ring-1 ring-blue-600'
                        : 'bg-white/80 border-stone-200 text-stone-700 hover:bg-white hover:border-stone-300'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setSelectedScheduledClassId(cls.id);
                        if (cls.attendanceRecords) {
                          setRegister(cls.attendanceRecords);
                        }
                      }}
                      className="flex items-center gap-2.5 text-left"
                    >
                      <GraduationCap className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-stone-400'}`} />
                      <div>
                        <p className="font-bold text-[11px] leading-tight">{cls.subject}</p>
                        <p className="text-[10px] text-stone-500 font-normal">
                          {cls.timeSlot} • {cls.room}
                        </p>
                      </div>
                    </button>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        rate >= 85 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rate}% Present
                    </span>
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(cls);
                        }}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
                        title="Remove scheduled class occurring on this date"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Total Scholars
              </span>
              <p className="font-serif text-2xl font-bold text-stone-900 mt-1">{totalStudents}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Present</span>
              <p className="font-serif text-2xl font-bold text-emerald-900 mt-1">{presentCount}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-2xs">
              <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">Absent</span>
              <p className="font-serif text-2xl font-bold text-rose-900 mt-1">{absentCount}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Rate</span>
              <p className="font-serif text-2xl font-bold text-amber-900 mt-1">{attendanceRate}%</p>
            </div>
          </div>

          {/* Student Roster & Live Status Marker */}
          <div className="rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Student Scholar</th>
                    <th className="py-3 px-4 font-mono">Index No</th>
                    <th className="py-3 px-4">Status on {attendanceDate}</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {batchStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-stone-500">
                        <Users className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                        <p className="font-semibold text-stone-700">No scholars enrolled in {activeBatchName} attendance roster yet.</p>
                        <p className="text-xs text-stone-400 mt-1">
                          Teachers can bulk import or add student names for {activeBatchName} from the Attendance page.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    batchStudents.map((student) => {
                      const status = register[student.id] || 'present';

                      return (
                        <tr key={student.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                                {student.fullName ? student.fullName.charAt(0) : 'S'}
                              </div>
                              <div>
                                <p className="font-bold text-stone-900">{student.fullName}</p>
                                <p className="text-[10px] text-stone-400">
                                  Index: {student.indexNumber} • {getBatchName(student.batchId)} Scholar
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-blue-900">{student.indexNumber}</td>

                          <td className="py-3 px-4">
                            <span
                              className={`rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                status === 'present'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : status === 'absent'
                                  ? 'bg-rose-100 text-rose-800'
                                  : status === 'late'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {isTeacherOrAdmin ? (
                              <div className={`inline-flex items-center rounded-lg border border-stone-200 bg-white p-0.5 shadow-2xs whitespace-nowrap ${!isDayAttendanceEnabled ? 'opacity-45 pointer-events-none' : ''}`}>
                                <button
                                  type="button"
                                  disabled={!isDayAttendanceEnabled}
                                  onClick={() => handleAttendanceStatusChange(student.id, 'present')}
                                  className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                    status === 'present'
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  Present
                                </button>
                                <button
                                  type="button"
                                  disabled={!isDayAttendanceEnabled}
                                  onClick={() => handleAttendanceStatusChange(student.id, 'absent')}
                                  className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                    status === 'absent'
                                      ? 'bg-rose-600 text-white'
                                      : 'text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  Absent
                                </button>
                                <button
                                  type="button"
                                  disabled={!isDayAttendanceEnabled}
                                  onClick={() => handleAttendanceStatusChange(student.id, 'late')}
                                  className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                    status === 'late'
                                      ? 'bg-amber-500 text-white'
                                      : 'text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  Late
                                </button>
                                <button
                                  type="button"
                                  disabled={!isDayAttendanceEnabled}
                                  onClick={() => handleAttendanceStatusChange(student.id, 'excused')}
                                  className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                    status === 'excused'
                                      ? 'bg-sky-600 text-white'
                                      : 'text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  Excused
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-stone-400">View only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CLASS RECORDINGS (MULTIPLE YOUTUBE RECORDINGS PER DAY) */}
      {activeTab === 'recordings' && (
        <div className="space-y-5">
          {recordingsSyncError && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{recordingsSyncError}</span>
              </div>
              <button
                type="button"
                onClick={() => setRecordingsSyncError(null)}
                className="text-amber-600 hover:text-amber-800 dark:text-amber-300"
                aria-label="Dismiss warning"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Date Navigator & Filters Bar */}
          <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Date Picker & Quick Day Stepping */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftRecordingDate(-1)}
                  className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                  title="Previous Day"
                  aria-label="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <input
                  type="date"
                  value={recordingDate}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setRecordingDate(e.target.value);
                    setSelectedDateStr(e.target.value);
                    setRecordingViewScope('day');
                  }}
                  aria-label="Select recording calendar date"
                  className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 min-h-[40px] text-xs font-bold font-mono tabular-nums text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                />

                <button
                  type="button"
                  onClick={() => shiftRecordingDate(1)}
                  className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                  title="Next Day"
                  aria-label="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setRecordingDate(today);
                    setSelectedDateStr(today);
                    setRecordingViewScope('day');
                  }}
                  className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 min-h-[40px] text-xs font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Today
                </button>

                {/* Scope Toggle: Single Day vs All Batch Dates */}
                <div className="inline-flex items-center rounded-xl bg-stone-100 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setRecordingViewScope('day')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      recordingViewScope === 'day'
                        ? 'bg-white dark:bg-slate-700 text-stone-900 dark:text-white shadow-2xs'
                        : 'text-stone-600 dark:text-slate-400 hover:text-stone-900'
                    }`}
                  >
                    Day ({dayRecordingsForSelectedRecDate.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordingViewScope('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      recordingViewScope === 'all'
                        ? 'bg-white dark:bg-slate-700 text-stone-900 dark:text-white shadow-2xs'
                        : 'text-stone-600 dark:text-slate-400 hover:text-stone-900'
                    }`}
                  >
                    All Dates ({batchRecordings.length})
                  </button>
                </div>
              </div>

              {/* Date / Upload Action Row */}
              <div className="flex flex-wrap items-center gap-2">
                {(recordingCategoryFilter !== 'all' || recordingTeacherFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordingCategoryFilter('all');
                      setRecordingTeacherFilter('all');
                    }}
                    className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 min-h-[40px] text-xs font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    Clear Filters
                  </button>
                )}

                {isTeacherOrAdmin && (
                  <button
                    type="button"
                    onClick={openTeacherDirectoryModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 px-3.5 py-2 min-h-[40px] text-xs font-bold text-stone-800 dark:text-slate-100 shadow-2xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-[#0284c7]" />
                    <span>Manage Teachers</span>
                    <span className="font-mono tabular-nums text-[10px] opacity-75">
                      ({batchRecordingTeachers.length})
                    </span>
                  </button>
                )}

                {isTeacherOrAdmin && (
                  <button
                    type="button"
                    onClick={() => openRecordingModal(recordingDate)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] px-4 py-2 min-h-[40px] text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Recording to Day</span>
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Buttons (e.g. Physics, Mathematics, Revision) */}
            <div className="flex flex-col gap-2.5 pt-2.5 border-t border-stone-100 dark:border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  <Filter className="w-3.5 h-3.5 text-stone-400" />
                  Category:
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectCategoryFilter('all')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    recordingCategoryFilter === 'all'
                      ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-2xs'
                      : 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>All</span>
                  <span className="font-mono tabular-nums text-[10px] opacity-80">
                    ({batchRecordings.length})
                  </span>
                </button>
                {availableRecordingCategories.map((cat) => {
                  const catCount = batchRecordings.filter((r) =>
                    matchesRecordingCategory(r, cat)
                  ).length;
                  const isActiveCat =
                    recordingCategoryFilter.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleSelectCategoryFilter(cat)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isActiveCat
                          ? 'bg-[#0284c7] text-white shadow-2xs'
                          : 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{cat}</span>
                      {catCount > 0 && (
                        <span className="font-mono tabular-nums text-[10px] opacity-85">
                          ({catCount})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Teacher & Subject Filter Bar (Manually entered directory + labels only — never synced to accounts) */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  <GraduationCap className="w-3.5 h-3.5 text-stone-400" />
                  Teacher:
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectTeacherFilter('all')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    recordingTeacherFilter === 'all'
                      ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900 shadow-2xs'
                      : 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>All Teachers</span>
                </button>
                {teacherFilterOptions.length === 0 ? (
                  <span className="text-[11px] text-stone-400 dark:text-slate-500 whitespace-nowrap">
                    {isTeacherOrAdmin
                      ? 'Add teachers in bulk using "Manage Teachers" so students can identify each teacher & subject'
                      : 'Teachers will appear here once added by Admin or Teacher'}
                  </span>
                ) : (
                  teacherFilterOptions.map((item) => {
                    const isActiveTeacher =
                      recordingTeacherFilter.toLowerCase() === item.name.toLowerCase();
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleSelectTeacherFilter(item.name)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isActiveTeacher
                            ? 'bg-[#13295B] dark:bg-sky-600 text-white shadow-2xs'
                            : 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>{item.name}</span>
                        {item.subject && (
                          <span
                            className={`text-[10px] font-medium ${
                              isActiveTeacher ? 'text-sky-200' : 'text-stone-500 dark:text-slate-400'
                            }`}
                          >
                            · {item.subject}
                          </span>
                        )}
                        <span className="font-mono tabular-nums text-[10px] opacity-80">
                          ({item.count})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Jump Chips for Dates That Have Recordings */}
            {recordedDatesList.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-slate-800 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-semibold text-stone-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                  Recorded dates:
                </span>
                {recordedDatesList.slice(0, 10).map((d) => {
                  const countForDay = batchRecordings.filter((r) => r.date === d).length;
                  const isActiveDate = recordingViewScope === 'day' && recordingDate === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setRecordingDate(d);
                        setSelectedDateStr(d);
                        setRecordingViewScope('day');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                        isActiveDate
                          ? 'bg-[#0284c7] text-white border-[#0284c7]'
                          : 'bg-stone-50 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-700 hover:bg-stone-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{d}</span>
                      <span
                        className={`text-[10px] ${
                          isActiveDate ? 'text-sky-100' : 'text-stone-400 dark:text-slate-500'
                        }`}
                      >
                        ({countForDay})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Two-Zone Player Stage & Multi-Recording Day Queue */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Primary Stage: Sample-Matched YouTube Video Player + Metadata Card */}
            <div className="xl:col-span-8">
              {activeRecording ? (
                <CalendarSectionErrorBoundary
                  key={activeRecording.id}
                  fallbackTitle="Unable to initialize video player"
                  fallbackDescription="Please retry or open the YouTube link directly."
                >
                  <CalendarRecordingPlayer
                    recording={activeRecording}
                    isWatched={!!watchProgressMap[activeRecording.id]?.watched}
                    isTrending={trendingRecordingIds.has(activeRecording.id)}
                    savingWatchState={savingWatchId === activeRecording.id}
                    onToggleWatched={handleToggleWatched}
                    onFirstPlay={(rec) => recordRecordingView(rec.id)}
                    getTeacherSummary={getTeacherProfileSummary}
                    onFilterByTeacher={(name) => handleSelectTeacherFilter(name)}
                    isTeacherOrAdmin={isTeacherOrAdmin}
                    onEdit={(rec) => openRecordingModal(rec.date, rec)}
                    onDelete={(rec) => setRecordingToDelete(rec)}
                  />
                </CalendarSectionErrorBoundary>
              ) : (
                <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-12 text-center space-y-4 shadow-xs">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-[#0284c7] dark:text-sky-400">
                    <Film className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h3 className="font-serif text-lg sm:text-xl font-bold text-stone-900 dark:text-white">
                      {recordingViewScope === 'day'
                        ? `No recordings match for ${recordingDate}`
                        : 'No matching class recordings found'}
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-500 dark:text-slate-400">
                      {isTeacherOrAdmin
                        ? 'Upload YouTube class recordings with a category and teacher name for any calendar date, or clear filters to browse all lessons.'
                        : 'Try switching to All Dates, choosing a different category/teacher filter, or selecting a highlighted date from the calendar.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    {recordingViewScope === 'day' && batchRecordings.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRecordingViewScope('all')}
                        className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <PlayCircle className="w-4 h-4 text-[#0284c7]" />
                        <span>Browse All Dates ({batchRecordings.length})</span>
                      </button>
                    )}
                    {(recordingCategoryFilter !== 'all' || recordingTeacherFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordingCategoryFilter('all');
                          setRecordingTeacherFilter('all');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <span>Reset Filters</span>
                      </button>
                    )}
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        onClick={() => openRecordingModal(recordingDate)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] px-4 py-2.5 min-h-[42px] text-xs sm:text-sm font-bold text-white shadow-xs transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Upload Recording for {recordingDate}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: Recordings Categorized by Teacher Name + Mini Calendar */}
            <div className="xl:col-span-4 space-y-4">
              {/* Day / Filtered Playlist Card */}
              <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-slate-800">
                  <div>
                    <h4 className="font-serif text-base font-bold text-stone-900 dark:text-white">
                      {recordingViewScope === 'day'
                        ? `Recordings on ${recordingDate}`
                        : `All Batch Recordings`}
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-slate-400">
                      {filteredRecordings.length}{' '}
                      {filteredRecordings.length === 1 ? 'recording' : 'recordings'}
                      {recordingCategoryFilter !== 'all' ? ` · ${recordingCategoryFilter}` : ''}
                      {recordingTeacherFilter !== 'all' ? ` · ${recordingTeacherFilter}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingSortMode((prev) =>
                          prev === 'most_watched' ? 'latest' : 'most_watched'
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        recordingSortMode === 'most_watched'
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          : 'border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-stone-600 dark:text-slate-300'
                      }`}
                      title="Sort playlist by most viewed lessons"
                    >
                      <TrendingUp className="w-3 h-3" />
                      <span>Most Watched</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGroupRecordingsByTeacher((prev) => !prev)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        groupRecordingsByTeacher
                          ? 'border-[#0284c7]/40 bg-sky-50 dark:bg-sky-950/50 text-[#0284c7] dark:text-sky-300'
                          : 'border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-stone-600 dark:text-slate-300'
                      }`}
                      title="Toggle grouping recordings by teacher name"
                    >
                      By Teacher
                    </button>

                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        onClick={() => openRecordingModal(recordingDate)}
                        className="inline-flex items-center gap-1 rounded-lg bg-stone-900 dark:bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-stone-800 dark:hover:bg-sky-500 transition-colors"
                        title="Add another recording to this date"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>

                {filteredRecordings.length === 0 ? (
                  <p className="text-xs text-stone-400 dark:text-slate-500 py-4 text-center">
                    No recordings match the selected filters.
                  </p>
                ) : groupRecordingsByTeacher ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-0.5 side-view-scrollbar">
                    {recordingsGroupedByTeacher.map((group) => (
                      <div key={group.teacher} className="space-y-2">
                        {/* Teacher & Subject Group Header */}
                        <div className="flex items-center justify-between gap-2 px-1 pb-1 border-b border-stone-100 dark:border-slate-800">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <GraduationCap className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                            <TeacherNameHoverTrigger
                              teacherName={group.teacher}
                              currentSubject={group.subject}
                              getSummary={getTeacherProfileSummary}
                              onFilterByTeacher={(name) => handleSelectTeacherFilter(name)}
                              className="text-xs font-bold text-stone-900 dark:text-slate-100 truncate"
                            >
                              <span className="truncate">{group.teacher}</span>
                            </TeacherNameHoverTrigger>
                            {group.subject && (
                              <span className="text-[11px] font-medium text-[#0284c7] dark:text-sky-400 truncate">
                                · {group.subject}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-stone-400 dark:text-slate-500 shrink-0">
                            {group.items.length} {group.items.length === 1 ? 'lesson' : 'lessons'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {group.items.map((rec, idx) => {
                            const isCurrent = activeRecording?.id === rec.id;
                            const watched = !!watchProgressMap[rec.id]?.watched;
                            const categoryLabel = getRecordingCategory(rec);
                            const teacherLabel = getRecordingTeacherLabel(rec);
                            const teacherSubj = getRecordingTeacherSubject(rec);
                            const isTrending = trendingRecordingIds.has(rec.id);
                            return (
                              <div
                                key={rec.id}
                                onClick={() => handleSelectRecordingItem(rec)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelectRecordingItem(rec);
                                  }
                                }}
                                className={`group rounded-xl border p-2.5 transition-all cursor-pointer flex gap-3 items-start ${
                                  isCurrent
                                    ? 'border-[#0284c7] bg-sky-50/70 dark:bg-sky-950/35 ring-1 ring-[#0284c7]/40'
                                    : 'border-stone-200/80 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-800/40 hover:border-stone-300 dark:hover:border-slate-700'
                                }`}
                              >
                                {/* Thumbnail */}
                                <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0">
                                  <img
                                    src={getYouTubeThumbnailUrl(rec.youtubeVideoId)}
                                    alt={rec.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                                    <PlayCircle
                                      className={`w-6 h-6 ${
                                        isCurrent ? 'text-sky-300 scale-110' : 'text-white/90 group-hover:scale-110'
                                      } transition-transform`}
                                    />
                                  </div>
                                  {isTrending && (
                                    <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-amber-500/95 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-xs">
                                      <TrendingUp className="w-2.5 h-2.5" />
                                      Hot
                                    </span>
                                  )}
                                  {rec.durationLabel && (
                                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.2 font-mono tabular-nums text-[9px] font-semibold text-white">
                                      {rec.durationLabel}
                                    </span>
                                  )}
                                </div>

                                {/* Info */}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="text-[10px] font-mono tabular-nums text-stone-500 dark:text-slate-400 truncate">
                                      #{idx + 1} · {categoryLabel}
                                      {recordingViewScope === 'all' ? ` · ${rec.date}` : ''}
                                    </span>
                                    {watched && (
                                      <span
                                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0"
                                        title="Watched"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Watched</span>
                                      </span>
                                    )}
                                  </div>

                                  <h5 className="text-xs font-bold text-stone-900 dark:text-slate-100 line-clamp-2 leading-snug">
                                    {rec.title}
                                  </h5>

                                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500 dark:text-slate-400 min-w-0">
                                      <TeacherNameHoverTrigger
                                        teacherName={teacherLabel}
                                        currentSubject={teacherSubj || categoryLabel}
                                        getSummary={getTeacherProfileSummary}
                                        onFilterByTeacher={(name) => handleSelectTeacherFilter(name)}
                                        className="font-semibold text-stone-700 dark:text-slate-200 truncate max-w-[140px]"
                                      >
                                        <span className="truncate">{teacherLabel}</span>
                                      </TeacherNameHoverTrigger>
                                      <span aria-hidden="true">·</span>
                                      <span
                                        className="inline-flex items-center gap-1 font-mono tabular-nums text-stone-600 dark:text-slate-300"
                                        title="Views on this recording"
                                      >
                                        <Eye className="w-3 h-3 text-[#0284c7]" />
                                        <span>{formatRecordingViewCount(rec.viewCount)}</span>
                                      </span>
                                    </div>

                                    {isTeacherOrAdmin && (
                                      <div
                                        className="flex items-center gap-1 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => openRecordingModal(rec.date, rec)}
                                          className="p-1 rounded hover:bg-stone-200 dark:hover:bg-slate-700 text-stone-500 dark:text-slate-400"
                                          title="Edit recording"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setRecordingToDelete(rec)}
                                          className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-stone-500 hover:text-rose-600"
                                          title="Delete recording"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-0.5 side-view-scrollbar">
                    {filteredRecordings.map((rec, idx) => {
                      const isCurrent = activeRecording?.id === rec.id;
                      const watched = !!watchProgressMap[rec.id]?.watched;
                      const categoryLabel = getRecordingCategory(rec);
                      const teacherLabel = getRecordingTeacherLabel(rec);
                      const teacherSubj = getRecordingTeacherSubject(rec);
                      const isTrending = trendingRecordingIds.has(rec.id);
                      return (
                        <div
                          key={rec.id}
                          onClick={() => handleSelectRecordingItem(rec)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectRecordingItem(rec);
                            }
                          }}
                          className={`group rounded-xl border p-2.5 transition-all cursor-pointer flex gap-3 items-start ${
                            isCurrent
                              ? 'border-[#0284c7] bg-sky-50/70 dark:bg-sky-950/35 ring-1 ring-[#0284c7]/40'
                              : 'border-stone-200/80 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-800/40 hover:border-stone-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0">
                            <img
                              src={getYouTubeThumbnailUrl(rec.youtubeVideoId)}
                              alt={rec.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                              <PlayCircle
                                className={`w-6 h-6 ${
                                  isCurrent ? 'text-sky-300 scale-110' : 'text-white/90 group-hover:scale-110'
                                } transition-transform`}
                              />
                            </div>
                            {isTrending && (
                              <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-amber-500/95 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-xs">
                                <TrendingUp className="w-2.5 h-2.5" />
                                Hot
                              </span>
                            )}
                            {rec.durationLabel && (
                              <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.2 font-mono tabular-nums text-[9px] font-semibold text-white">
                                {rec.durationLabel}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono tabular-nums text-stone-500 dark:text-slate-400 min-w-0">
                                <span>#{idx + 1} · {categoryLabel}</span>
                                <span>·</span>
                                <TeacherNameHoverTrigger
                                  teacherName={teacherLabel}
                                  currentSubject={teacherSubj || categoryLabel}
                                  getSummary={getTeacherProfileSummary}
                                  onFilterByTeacher={(name) => handleSelectTeacherFilter(name)}
                                  className="font-sans font-semibold text-stone-700 dark:text-slate-200 truncate"
                                >
                                  <span>
                                    {teacherLabel}
                                    {teacherSubj ? ` (${teacherSubj})` : ''}
                                  </span>
                                </TeacherNameHoverTrigger>
                              </div>
                              {watched && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0"
                                  title="Watched"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Watched</span>
                                </span>
                              )}
                            </div>

                            <h5 className="text-xs font-bold text-stone-900 dark:text-slate-100 line-clamp-2 leading-snug">
                              {rec.title}
                            </h5>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-mono tabular-nums font-medium text-stone-600 dark:text-slate-300 shrink-0"
                                  title="Views on this recording"
                                >
                                  <Eye className="w-3 h-3 text-[#0284c7]" />
                                  <span>{formatRecordingViewCount(rec.viewCount)}</span>
                                </span>
                                <span className="text-[10px] font-medium text-stone-400 dark:text-slate-500 truncate">
                                  · {rec.sessionLabel}
                                </span>
                              </div>

                              {isTeacherOrAdmin && (
                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openRecordingModal(rec.date, rec)}
                                    className="p-1 rounded hover:bg-stone-200 dark:hover:bg-slate-700 text-stone-500 dark:text-slate-400"
                                    title="Edit recording"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRecordingToDelete(rec)}
                                    className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-stone-500 hover:text-rose-600"
                                    title="Delete recording"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mini Month Calendar for Selecting Any Day with Multiple Recordings */}
              <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-slate-800">
                  <span className="font-serif text-sm font-bold text-stone-900 dark:text-white">
                    {monthName}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="rounded-lg border border-stone-200 dark:border-slate-700 p-1 text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="rounded-lg border border-stone-200 dark:border-slate-700 p-1 text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800"
                      aria-label="Next month"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 pt-2 text-center text-[10px] font-bold text-stone-400">
                  <span>S</span>
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                </div>

                <div className="grid grid-cols-7 gap-1 pt-1.5">
                  {Array.from({ length: firstDayIndex }).map((_, i) => (
                    <div key={`rec-empty-${i}`} className="h-8" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const count = getRecordingsForDate(dateStr).length;
                    const isPicked = recordingViewScope === 'day' && recordingDate === dateStr;
                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          setRecordingDate(dateStr);
                          setSelectedDateStr(dateStr);
                          setRecordingViewScope('day');
                        }}
                        className={`relative h-8 rounded-lg text-[11px] font-mono tabular-nums font-semibold flex flex-col items-center justify-center transition-colors ${
                          isPicked
                            ? 'bg-[#0284c7] text-white font-bold'
                            : count > 0
                            ? 'bg-sky-50 dark:bg-sky-950/50 text-[#0284c7] dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60'
                            : 'text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                        title={
                          count > 0
                            ? `${count} recording${count > 1 ? 's' : ''} on ${dateStr}`
                            : dateStr
                        }
                      >
                        <span>{dayNum}</span>
                        {count > 0 && (
                          <span
                            className={`h-1 w-1 rounded-full ${
                              isPicked ? 'bg-white' : 'bg-[#0284c7] dark:bg-sky-400'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MARK HOLIDAY OR EXAM DATE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h3 className="font-serif text-xl font-bold text-stone-900">
                {isTeacherOrAdmin ? 'Schedule Academic Calendar Event' : 'Schedule Peer Study Group'}
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                {isTeacherOrAdmin
                  ? 'Add an official exam, holiday, lab, or peer study group session for Zahira College Mawanella.'
                  : 'Propose a peer study group session so classmates in your batch can request to join a study room.'}
              </p>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              {/* Event Type Selector */}
              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                  Category / Event Type
                </label>
                <div className={`grid grid-cols-2 ${isTeacherOrAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-1'} gap-2`}>
                  {isTeacherOrAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEventType('holiday')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl p-2.5 font-bold border transition-all ${
                          eventType === 'holiday'
                            ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Holiday</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventType('exam')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl p-2.5 font-bold border transition-all ${
                          eventType === 'exam'
                            ? 'bg-rose-800 text-white border-rose-800 shadow-xs'
                            : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Exam Date</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventType('academic')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl p-2.5 font-bold border transition-all ${
                          eventType === 'academic'
                            ? 'bg-sky-800 text-white border-sky-800 shadow-xs'
                            : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Academic Lab</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setEventType('study_group')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl p-2.5 font-bold border transition-all ${
                      eventType === 'study_group'
                        ? 'bg-violet-800 text-white border-violet-800 shadow-xs'
                        : 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Study Group</span>
                  </button>
                </div>
              </div>

              {eventType === 'study_group' && (
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                    Target Study Room
                  </label>
                  <select
                    value={eventStudyRoomId}
                    onChange={(e) => setEventStudyRoomId(e.target.value)}
                    className="w-full rounded-xl border border-violet-200 bg-violet-50/50 p-2.5 font-semibold text-stone-800 focus:bg-white focus:outline-none"
                  >
                    {STUDY_GROUP_ROOMS.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} — {room.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder={
                    eventType === 'holiday'
                      ? 'e.g. National Poya Day Holiday'
                      : eventType === 'exam'
                      ? 'e.g. Combined Mathematics Mid-Term Paper'
                      : eventType === 'study_group'
                      ? 'e.g. Organic Chemistry Mechanisms Peer Study'
                      : 'e.g. Physics Mechanics Practical Lab'
                  }
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                    Date (Start)
                  </label>
                  <input
                    type="date"
                    required
                    value={eventStartDate}
                    onChange={(e) => setEventStartDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Time & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                    Time (e.g. 08:30)
                  </label>
                  <input
                    type="text"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    placeholder="08:30"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                    Location / Room
                  </label>
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="Science Complex Hall 28"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[10px]">
                  Description & Syllabus Scope
                </label>
                <textarea
                  rows={2}
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  placeholder="Details for scholars and teachers..."
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-800 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Push to Google Calendar Toggle */}
              {googleAccessToken && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <input
                    type="checkbox"
                    id="pushGCal"
                    checked={pushToGoogle}
                    onChange={(e) => setPushToGoogle(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <label htmlFor="pushGCal" className="font-semibold text-emerald-900 cursor-pointer text-xs">
                    Also synchronize this date into connected Google Calendar
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold px-5 py-2 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {savingEvent ? 'Saving...' : 'Publish to Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXPLICIT CONFIRMATION FOR DELETION (Workspace Integration Rule) */}
      {deleteConfirmEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-serif text-lg font-bold text-stone-900">Remove School Event</h3>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to remove <strong className="text-stone-900">"{deleteConfirmEvent.title}"</strong> scheduled for {deleteConfirmEvent.startDate}?
              {deleteConfirmEvent.isSyncedWithGoogle && ' This will also remove the entry from your Google Calendar.'}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirmEvent(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteEvent}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 shadow-xs transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SCHEDULE CLASS ON DATE (Teachers & Admins) */}
      {isScheduleClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-stone-900">
                    Schedule Class Session
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Add a cohort class lecture or laboratory practical on this date
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScheduleClassModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateScheduledClass} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Class Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newClassDate}
                    onChange={(e) => setNewClassDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Period / Time Slot *
                  </label>
                  <select
                    value={newClassTimeSlot}
                    onChange={(e) => {
                      setNewClassTimeSlot(e.target.value);
                      if (e.target.value.includes('08:00')) setNewClassPeriod('Period 1');
                      else if (e.target.value.includes('09:45')) setNewClassPeriod('Period 2');
                      else if (e.target.value.includes('11:30')) setNewClassPeriod('Period 3');
                      else setNewClassPeriod('Period 4');
                    }}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="08:00 - 09:30">Period 1 (08:00 - 09:30)</option>
                    <option value="09:45 - 11:15">Period 2 (09:45 - 11:15)</option>
                    <option value="11:30 - 13:00">Period 3 (11:30 - 13:00)</option>
                    <option value="13:45 - 15:15">Period 4 (13:45 - 15:15)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Subject *
                </label>
                <select
                  value={newClassSubject}
                  onChange={(e) => setNewClassSubject(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Combined Mathematics (Pure & Applied Mechanics)">Combined Mathematics (Pure & Applied Mechanics)</option>
                  <option value="Physics (Mechanics, Optics & Electronics)">Physics (Mechanics, Optics & Electronics)</option>
                  <option value="Chemistry (Inorganic & Physical Chemistry)">Chemistry (Inorganic & Physical Chemistry)</option>
                  <option value="Biology (Plant & Animal Physiology, Genetics)">Biology (Plant & Animal Physiology, Genetics)</option>
                  <option value="Information & Communication Technology (ICT)">Information & Communication Technology (ICT)</option>
                  <option value="General Science Practical & Revision">General Science Practical & Revision</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Lesson Topic / Unit Outline (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Calculus Integration Theorems / Newton's 2nd Law Experiment"
                  value={newClassTopic}
                  onChange={(e) => setNewClassTopic(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Classroom / Laboratory Hall
                </label>
                <input
                  type="text"
                  placeholder="e.g. Science Complex Hall 28 / Physics Lab 1"
                  value={newClassRoom}
                  onChange={(e) => setNewClassRoom(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleClassModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingScheduledClass}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingScheduledClass ? 'Scheduling...' : 'Confirm & Schedule Class'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Live PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={previewPDFData}
      />

      {/* CONFIRM DELETE ACADEMIC SESSION MODAL (IFrame-safe, Teachers & Admins Only) */}
      {sessionToDelete && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">Remove Academic Session?</h3>
                <p className="text-[11px] text-stone-500">Scheduled on {attendanceDate}</p>
              </div>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Remove <strong className="text-stone-900">&quot;{sessionToDelete.subject}&quot;</strong> ({sessionToDelete.timeSlot}) from {attendanceDate}?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteScheduledClass}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
              >
                Yes, Remove Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE CLASS COHORT MODAL (IFrame-safe, Teachers & Admins Only) */}
      {cohortToDelete && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900">Remove Class Cohort?</h3>
                <p className="text-[11px] text-stone-500">Teachers &amp; Admins Only</p>
              </div>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to remove the class cohort <strong className="text-stone-900">&quot;{cohortToDelete.name}&quot;</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setCohortToDelete(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteClassCohort}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
              >
                Yes, Remove Cohort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD OR EDIT YOUTUBE CLASS RECORDING (Teachers & Admins Only) */}
      {isRecordingModalOpen && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsRecordingModalOpen(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-700"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950 text-[#0284c7] dark:text-sky-400 shrink-0">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-stone-900 dark:text-white">
                  {editingRecording ? 'Edit Class Recording' : 'Upload YouTube Class Recording'}
                </h3>
                <p className="text-xs text-stone-500 dark:text-slate-400">
                  Add multiple recordings to any calendar date for {writeBatchName}.
                </p>
              </div>
            </div>

            {recFormError && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRecording} className="space-y-4 text-xs">
              {/* YouTube URL */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                  YouTube Video Link *
                </label>
                <input
                  type="text"
                  required
                  value={recYoutubeUrl}
                  onChange={(e) => {
                    setRecYoutubeUrl(e.target.value);
                    if (recFormError) setRecFormError(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                />
                {(() => {
                  const previewId = extractYouTubeVideoId(recYoutubeUrl);
                  if (!recYoutubeUrl.trim()) return null;
                  if (!previewId) {
                    return (
                      <p className="mt-1 text-[11px] text-rose-600">
                        Enter a valid YouTube watch, share, live, shorts, or embed URL.
                      </p>
                    );
                  }
                  return (
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-2">
                      <img
                        src={getYouTubeThumbnailUrl(previewId)}
                        alt="YouTube preview"
                        referrerPolicy="no-referrer"
                        className="w-20 aspect-video rounded-lg object-cover bg-slate-900 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-emerald-800 dark:text-emerald-300 text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>YouTube Video Linked ({previewId})</span>
                        </p>
                        <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                          Ready for in-website playback
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Title */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                  Recording Title *
                </label>
                <input
                  type="text"
                  required
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="e.g. NEWTON'S LAW DAY 8 RATE OF CHANGE OF MOMENTUM EM RECORDING | 20-11-2026"
                  className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                />
              </div>

              {/* Date + Category + Teacher Name (Manually entered by Admin/Teacher Only) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Calendar Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={recDate}
                    onChange={(e) => {
                      const d = e.target.value;
                      setRecDate(d);
                      if (!editingRecording && d) {
                        setRecSessionLabel(
                          `${writeBatchName.toUpperCase()} THEORY ${formatDisplaySessionDate(d)}`
                        );
                      }
                    }}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 font-mono tabular-nums text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Category *
                  </label>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 font-semibold text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  >
                    {RECORDING_BASE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">Other (Custom Category)</option>
                  </select>
                </div>
              </div>

              {recCategory === '__custom__' && (
                <div>
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={recCustomCategory}
                    onChange={(e) => setRecCustomCategory(e.target.value)}
                    placeholder="e.g. Organic Chemistry Seminar"
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  />
                </div>
              )}

              {/* Teacher & Subject Selector (Picked from Bulk Directory or Entered Manually) */}
              <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-800/40 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                    Upload Under Teacher *
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecordingModalOpen(false);
                        openTeacherDirectoryModal();
                      }}
                      className="text-[11px] font-bold text-[#0284c7] hover:underline"
                    >
                      + Bulk Add Teachers
                    </button>
                    <span className="text-stone-300 dark:text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecTeacherSelectionMode((prev) =>
                          prev === 'directory' ? 'manual' : 'directory'
                        );
                        setRecFormError(null);
                      }}
                      className="text-[11px] font-semibold text-stone-600 dark:text-slate-300 hover:underline"
                    >
                      {recTeacherSelectionMode === 'directory'
                        ? 'Or enter custom name'
                        : `Choose from list (${batchRecordingTeachers.length})`}
                    </button>
                  </div>
                </div>

                {recTeacherSelectionMode === 'directory' ? (
                  batchRecordingTeachers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-center space-y-2">
                      <p className="text-[11px] text-stone-500 dark:text-slate-400">
                        No teachers added to the recording teachers list yet. Add your bulk teachers list with subjects once, then select any teacher here.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsRecordingModalOpen(false);
                            openTeacherDirectoryModal();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] px-3 py-1.5 text-[11px] font-bold text-white"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Bulk Teachers List</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecTeacherSelectionMode('manual')}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-stone-700 dark:text-slate-200"
                        >
                          Type Manually Instead
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <select
                        required
                        value={recSelectedTeacherId}
                        onChange={(e) => handleSelectDirectoryTeacherForUpload(e.target.value)}
                        aria-label="Select teacher and subject"
                        className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 font-semibold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      >
                        <option value="">-- Select Teacher &amp; Subject --</option>
                        {batchRecordingTeachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} — {t.subject}
                          </option>
                        ))}
                      </select>
                      {recSelectedTeacherId && (
                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Visible to students as <strong>{recTeacherName}</strong>
                            {recTeacherSubject ? ` (${recTeacherSubject})` : ''}
                          </span>
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <input
                        type="text"
                        required
                        value={recTeacherName}
                        onChange={(e) => setRecTeacherName(e.target.value)}
                        placeholder="Teacher name (e.g. Mr. M.F.M. Rizwan)"
                        className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={recTeacherSubject}
                        onChange={(e) => setRecTeacherSubject(e.target.value)}
                        placeholder="Teacher subject (e.g. Physics)"
                        className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Session Tag + Duration + Default Quality */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Duration (Optional)
                  </label>
                  <input
                    type="text"
                    value={recDurationLabel}
                    onChange={(e) => setRecDurationLabel(e.target.value)}
                    placeholder="e.g. 4:19:58"
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 font-mono tabular-nums text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Default Quality
                  </label>
                  <select
                    value={recQualityLabel}
                    onChange={(e) => setRecQualityLabel(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 font-mono text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                    Session Label *
                  </label>
                  <input
                    type="text"
                    required
                    value={recSessionLabel}
                    onChange={(e) => setRecSessionLabel(e.target.value)}
                    placeholder="2028 THEORY 20-11-2026"
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                  />
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[10px]">
                  Lesson Notes / Chapters Covered (Optional)
                </label>
                <textarea
                  rows={2}
                  value={recDescription}
                  onChange={(e) => setRecDescription(e.target.value)}
                  placeholder="Topics covered or past paper questions discussed in this recording..."
                  className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRecordingModalOpen(false)}
                  className="rounded-xl border border-stone-200 dark:border-slate-700 px-4 py-2 min-h-[40px] font-semibold text-stone-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRecording}
                  className="rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold px-5 py-2 min-h-[40px] transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {savingRecording
                      ? 'Publishing...'
                      : editingRecording
                      ? 'Save Changes'
                      : 'Publish Recording'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE RECORDING MODAL (In-App, Teachers & Admins Only) */}
      {recordingToDelete && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-white">
                  Delete Class Recording?
                </h3>
                <p className="text-[11px] text-stone-500 dark:text-slate-400">
                  Scheduled on {recordingToDelete.date}
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to remove{' '}
              <strong className="text-stone-900 dark:text-white">"{recordingToDelete.title}"</strong> from the
              calendar recordings list?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRecordingToDelete(null)}
                className="rounded-xl border border-stone-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-stone-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRecording}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK TEACHERS & SUBJECTS DIRECTORY (Admin & Teacher Only — Not Synced to Accounts) */}
      {isTeacherDirectoryModalOpen && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
            <button
              type="button"
              onClick={() => setIsTeacherDirectoryModalOpen(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-700"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pr-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950 text-[#0284c7] dark:text-sky-400 shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-stone-900 dark:text-white">
                  Bulk Recording Teachers &amp; Subjects
                </h3>
                <p className="text-xs text-stone-500 dark:text-slate-400">
                  Add multiple teachers with their subjects at once. These entries stay separate from login accounts and let uploaders choose a teacher when posting recordings.
                </p>
              </div>
            </div>

            {teacherDirectoryError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{teacherDirectoryError}</span>
              </div>
            )}

            {/* Quick Bulk Text Paste Helper */}
            <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/80 dark:bg-slate-800/40 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-slate-200">
                  Quick Paste Multiple Teachers (Optional)
                </label>
                <span className="text-[10px] font-mono text-stone-400 dark:text-slate-500">
                  Format: Name - Subject (one per line)
                </span>
              </div>
              <textarea
                rows={3}
                value={bulkTeacherPasteText}
                onChange={(e) => setBulkTeacherPasteText(e.target.value)}
                placeholder={'Mr. M.F.M. Rizwan - Physics\nMr. A.S.M. Farook, Mathematics\nMr. K.L.M. Nazeer | Chemistry'}
                className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseBulkTeachersPaste}
                  disabled={!bulkTeacherPasteText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0284c7]/40 bg-sky-50 dark:bg-sky-950/60 px-3 py-1.5 text-xs font-bold text-[#0284c7] dark:text-sky-300 hover:bg-sky-100 disabled:opacity-45 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Load Lines into Rows Below</span>
                </button>
              </div>
            </div>

            {/* Multi-Row Bulk Builder Form */}
            <form onSubmit={handleSaveBulkTeachers} className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-slate-300">
                  Teachers List Builder ({bulkTeacherRows.length} rows)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBulkTeacherRows((prev) => [...prev, createEmptyBulkTeacherRow()])
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+1 Row</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkTeacherRows((prev) => [
                        ...prev,
                        createEmptyBulkTeacherRow(),
                        createEmptyBulkTeacherRow(),
                        createEmptyBulkTeacherRow(),
                        createEmptyBulkTeacherRow(),
                        createEmptyBulkTeacherRow(),
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-stone-700 dark:text-slate-200 hover:bg-stone-100"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+5 Rows</span>
                  </button>
                </div>
              </div>

              <datalist id="recording-teacher-subject-presets">
                {RECORDING_BASE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
                <option value="Combined Mathematics" />
              </datalist>

              <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1 side-view-scrollbar">
                {bulkTeacherRows.map((row, idx) => (
                  <div
                    key={row.localId}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <span className="col-span-1 text-[11px] font-mono tabular-nums text-stone-400 text-center">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBulkTeacherRows((prev) =>
                          prev.map((r) => (r.localId === row.localId ? { ...r, name: val } : r))
                        );
                      }}
                      placeholder="Teacher Name (e.g. Mr. M.F.M. Rizwan)"
                      aria-label={`Teacher name row ${idx + 1}`}
                      className="col-span-6 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                    />
                    <input
                      type="text"
                      list="recording-teacher-subject-presets"
                      value={row.subject}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBulkTeacherRows((prev) =>
                          prev.map((r) =>
                            r.localId === row.localId ? { ...r, subject: val } : r
                          )
                        );
                      }}
                      placeholder="Subject (e.g. Physics)"
                      aria-label={`Subject row ${idx + 1}`}
                      className="col-span-4 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                    />
                    <button
                      type="button"
                      disabled={bulkTeacherRows.length <= 1}
                      onClick={() =>
                        setBulkTeacherRows((prev) =>
                          prev.filter((r) => r.localId !== row.localId)
                        )
                      }
                      className="col-span-1 flex items-center justify-center rounded-lg p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkTeacherApplyAllBatches}
                    onChange={(e) => setBulkTeacherApplyAllBatches(e.target.checked)}
                    className="h-4 w-4 rounded text-[#0284c7]"
                  />
                  <span>
                    Make teachers available across <strong>All Batches</strong> (uncheck for{' '}
                    {writeBatchName} only)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={savingBulkTeachers}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] px-4 py-2.5 min-h-[40px] text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {savingBulkTeachers
                      ? 'Saving Bulk List...'
                      : `Save Teachers (${
                          bulkTeacherRows.filter((r) => r.name.trim() && r.subject.trim()).length
                        })`}
                  </span>
                </button>
              </div>
            </form>

            {/* Existing Saved Teachers List */}
            <div className="pt-4 border-t border-stone-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-sm font-bold text-stone-900 dark:text-white">
                  Saved Recording Teachers ({batchRecordingTeachers.length})
                </h4>
                <span className="text-[11px] text-stone-400 dark:text-slate-500">
                  Shown in recording upload &amp; student filters
                </span>
              </div>

              {batchRecordingTeachers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-200 dark:border-slate-800 py-5 text-center text-xs text-stone-400 dark:text-slate-500">
                  No teachers saved yet. Add rows above to create your directory.
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 side-view-scrollbar">
                  {batchRecordingTeachers.map((entry) => {
                    const isEditing = editingTeacherEntryId === entry.id;
                    const isConfirmingDelete = teacherEntryToDelete?.id === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-800/40 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        {isEditing ? (
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={editingTeacherEntryName}
                                onChange={(e) => setEditingTeacherEntryName(e.target.value)}
                                className="flex-1 min-w-[140px] rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-stone-900 dark:text-white"
                                placeholder="Teacher Name"
                              />
                              <input
                                type="text"
                                list="recording-teacher-subject-presets"
                                value={editingTeacherEntrySubject}
                                onChange={(e) => setEditingTeacherEntrySubject(e.target.value)}
                                className="w-36 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-stone-900 dark:text-white"
                                placeholder="Subject"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={editingTeacherEntryBio}
                                onChange={(e) => setEditingTeacherEntryBio(e.target.value)}
                                className="flex-1 min-w-[200px] rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-stone-800 dark:text-slate-200"
                                placeholder="Optional profile summary (e.g. B.Sc. Physics · Past Paper Panel Lead)"
                              />
                              <button
                                type="button"
                                disabled={savingTeacherEntryEdit}
                                onClick={() => handleSaveTeacherEntryEdit(entry)}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTeacherEntryId(null)}
                                className="rounded-lg border border-stone-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 dark:text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-stone-900 dark:text-white">
                                  {entry.name}
                                </span>
                                <span className="rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2 py-0.5 text-[10px] font-semibold text-[#0284c7] dark:text-sky-300">
                                  {entry.subject}
                                </span>
                                <span className="text-[10px] text-stone-400 dark:text-slate-500">
                                  {entry.batchId === ALL_BATCHES_ID ? 'All Batches' : entry.batchName}
                                </span>
                              </div>
                              {entry.profileSummary && (
                                <p className="text-[10px] text-stone-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                  {entry.profileSummary}
                                </p>
                              )}
                            </div>

                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-rose-600">
                                  Remove?
                                </span>
                                <button
                                  type="button"
                                  onClick={handleConfirmDeleteTeacherEntry}
                                  className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-[11px] font-bold text-white"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTeacherEntryToDelete(null)}
                                  className="rounded-lg border border-stone-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-stone-600 dark:text-slate-300"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsTeacherDirectoryModalOpen(false);
                                    openRecordingModal(recordingDate, null, entry);
                                  }}
                                  className="rounded-lg border border-[#0284c7]/30 bg-sky-50 dark:bg-sky-950/50 px-2.5 py-1 text-[11px] font-bold text-[#0284c7] dark:text-sky-300 hover:bg-sky-100"
                                  title={`Upload a recording under ${entry.name}`}
                                >
                                  Upload Recording
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTeacherEntryId(entry.id);
                                    setEditingTeacherEntryName(entry.name);
                                    setEditingTeacherEntrySubject(entry.subject);
                                    setEditingTeacherEntryBio(entry.profileSummary || '');
                                  }}
                                  className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200 dark:hover:bg-slate-700"
                                  title="Edit teacher"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTeacherEntryToDelete(entry)}
                                  className="rounded-lg p-1.5 text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Delete teacher"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
