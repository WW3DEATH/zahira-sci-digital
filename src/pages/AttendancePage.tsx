import React, { useState, useEffect } from 'react';
import {
  CalendarCheck2,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Save,
  AlertCircle,
  Users,
  Lock,
  QrCode,
  Camera,
  Plus,
  UserPlus,
  Trash2,
  Edit2,
  UploadCloud,
  X,
  CheckCheck,
  FileSpreadsheet,
  FileText,
  Eye,
  GraduationCap,
  Power,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { AttendanceRecord, AttendanceStatus, AttendanceDayControl, SchoolClass, RosterStudent, ScheduledClass, StudentStream } from '../types';
import { QRAttendanceModal } from '../components/attendance/QRAttendanceModal';
import { PDFPreviewModal, PDFPreviewData } from '../components/common/PDFPreviewModal';
import { isFakeSeedRosterStudent } from '../services/dataService';
import {
  buildAttendanceRecordId,
  isAttendanceDateEnabled,
  isAttendanceRecordActive,
} from '../utils/attendanceUtils';

export const AttendancePage: React.FC = () => {
  const { activeRole, userProfile } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('daily');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [dayControlsMap, setDayControlsMap] = useState<Record<string, AttendanceDayControl>>({});
  const [togglingDay, setTogglingDay] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledClass[]>([]);
  const [dismissedDefaultsByDate, setDismissedDefaultsByDate] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrModalMode, setQrModalMode] = useState<'generate' | 'scan'>('generate');
  const [previewData, setPreviewData] = useState<PDFPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showGoogleCalendar, setShowGoogleCalendar] = useState(true);

  // Add / Delete Academic Session state (Teacher & Admin only)
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [newSessionSubject, setNewSessionSubject] = useState('Combined Mathematics');
  const [newSessionTimeSlot, setNewSessionTimeSlot] = useState('08:00 - 09:30');
  const [newSessionPeriod, setNewSessionPeriod] = useState('Period 1');
  const [newSessionTopic, setNewSessionTopic] = useState('');
  const [newSessionRoom, setNewSessionRoom] = useState('Science Complex - Hall 28');
  const [savingSession, setSavingSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ScheduledClass | null>(null);
  const [cohortToDelete, setCohortToDelete] = useState<SchoolClass | null>(null);

  // Direct Student Roll-Call Entry state (no student account creation required)
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentIndex, setNewStudentIndex] = useState('');
  const [newStudentStream, setNewStudentStream] = useState<StudentStream>('bio');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStudentText, setBulkStudentText] = useState('');
  const [bulkStudentStream, setBulkStudentStream] = useState<StudentStream>('bio');
  const [streamFilter, setStreamFilter] = useState<'all' | 'bio' | 'physical' | 'unassigned'>('all');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // Current editing register state: studentId -> status (only used by teacher/admin)
  const [register, setRegister] = useState<Record<string, AttendanceStatus>>({});

  // Real-time listener for classes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: SchoolClass[] = [];
      snap.forEach((d) => list.push(d.data() as SchoolClass));
      setClasses(list);
      if (list.length > 0) {
        if (!list.some((c) => c.id === selectedClassId)) {
          setSelectedClassId(list[0].id);
        }
      } else {
        setSelectedClassId('');
      }
    });
    return () => unsub();
  }, [selectedClassId]);

  // Real-time listener for scheduled classes occurring in calendar & attendance
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'scheduledClasses'), (snap) => {
      const list: ScheduledClass[] = [];
      snap.forEach((d) => list.push(d.data() as ScheduledClass));
      list.sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
      setScheduledClasses(list);
    });
    return () => unsub();
  }, []);

  // Real-time listener for dismissed default sessions per date
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'scheduledClassOverrides'), (snap) => {
      const map: Record<string, string[]> = {};
      snap.forEach((d) => {
        const data = d.data() as { date?: string; dismissedDefaultIds?: string[] };
        if (data?.date && Array.isArray(data.dismissedDefaultIds)) {
          map[data.date] = data.dismissedDefaultIds;
        }
      });
      setDismissedDefaultsByDate(map);
    });
    return () => unsub();
  }, []);

  // Real-time listener for attendance roster (strictly real entries; auto-purges legacy fake seed rows)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'attendanceRoster'),
      (snap) => {
        const list: RosterStudent[] = [];
        snap.forEach((d) => {
          const data = d.data() as RosterStudent;
          if (isFakeSeedRosterStudent(d.id, data?.fullName)) {
            deleteDoc(doc(db, 'attendanceRoster', d.id)).catch(() => {});
            return;
          }
          list.push({ ...data, id: d.id });
        });

        list.sort((a, b) => (a.indexNumber || '').localeCompare(b.indexNumber || ''));
        setStudents(list);

        // Sync register cleanly with active real students only
        setRegister((prev) => {
          const validIds = new Set(list.map((s) => s.id));
          const updated: Record<string, AttendanceStatus> = {};
          Object.entries(prev).forEach(([key, val]) => {
            if (validIds.has(key)) updated[key] = val;
          });
          list.forEach((s) => {
            if (!updated[s.id]) {
              updated[s.id] = 'present';
            }
          });
          return updated;
        });
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'attendanceRoster');
      }
    );
    return () => unsub();
  }, []);

  // Real-time listener for per-date Attendance ON/OFF controls
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'attendanceDaySettings'),
      (snap) => {
        const map: Record<string, AttendanceDayControl> = {};
        snap.forEach((d) => {
          const data = d.data() as AttendanceDayControl;
          const dateKey = data.date || d.id;
          if (dateKey) {
            map[dateKey] = { ...data, id: d.id, date: dateKey };
          }
        });
        setDayControlsMap(map);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'attendanceDaySettings');
      }
    );
    return () => unsub();
  }, []);

  // Real-time listener for attendance records
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'attendance'), (snap) => {
      const list: AttendanceRecord[] = [];
      snap.forEach((d) => {
        const rec = d.data() as AttendanceRecord;
        list.push({ ...rec, id: rec.id || d.id });
      });
      setAttendanceRecords(list);
    });
    return () => unsub();
  }, []);

  // Sync register whenever selectedClassId, selectedDate, selectedSessionId, attendanceRecords, or students change
  useEffect(() => {
    const targetRecordId = buildAttendanceRecordId(selectedDate, selectedClassId || 'general', selectedSessionId);
    const existing =
      attendanceRecords.find((r) => r.id === targetRecordId) ||
      (selectedSessionId === 'daily'
        ? attendanceRecords.find(
            (r) => r.classId === selectedClassId && r.date === selectedDate && (!r.sessionId || r.sessionId === 'daily')
          )
        : undefined);

    if (existing && existing.records) {
      const merged: Record<string, AttendanceStatus> = {};
      students.forEach((s) => {
        merged[s.id] = existing.records[s.id] || 'present';
      });
      setRegister(merged);
    } else if (students.length > 0) {
      const fresh: Record<string, AttendanceStatus> = {};
      students.forEach((s) => {
        fresh[s.id] = 'present';
      });
      setRegister(fresh);
    }
  }, [selectedClassId, selectedDate, selectedSessionId, attendanceRecords, students]);

  // Attendance can ONLY be marked/toggled by teacher or admin
  const isTeacherOrAdmin = activeRole === 'teacher' || activeRole === 'admin';
  const isDayAttendanceEnabled = isAttendanceDateEnabled(selectedDate, dayControlsMap);
  const currentDayControl = dayControlsMap[selectedDate];

  const handleSetDayAttendance = async (nextEnabled: boolean) => {
    if (!isTeacherOrAdmin || togglingDay) return;
    setTogglingDay(true);
    try {
      const payload: AttendanceDayControl = {
        id: selectedDate,
        date: selectedDate,
        enabled: nextEnabled,
        updatedBy: userProfile?.userId || 'faculty',
        updatedByName: userProfile?.fullName || 'Faculty Lead',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'attendanceDaySettings', selectedDate), sanitizeFirestoreDoc(payload));
      setStatusNotice(
        nextEnabled
          ? `Attendance marking turned ON for ${selectedDate}. Teachers can now mark attendance across multiple classes today, and saved records sync with dashboards.`
          : `Attendance marking turned OFF for ${selectedDate}. No attendance is needed today and this date will not sync with Student & Teacher attendance graphs.`
      );
      setTimeout(() => setStatusNotice(null), 4500);
    } catch (err) {
      console.error('Failed to toggle attendance setting for date:', err);
    } finally {
      setTogglingDay(false);
    }
  };

  const handleToggleDayAttendance = () => handleSetDayAttendance(!isDayAttendanceEnabled);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    setRegister((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleMarkAllPresent = () => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      updated[s.id] = 'present';
    });
    setRegister(updated);
  };

  const handleSaveAttendance = async () => {
    if (!isTeacherOrAdmin || !isDayAttendanceEnabled) return;
    try {
      const activeSessionObj =
        selectedSessionId !== 'daily'
          ? getClassesForDate(selectedDate).find((c) => c.id === selectedSessionId)
          : undefined;

      const effectiveClassId = selectedClassId || 'general';
      const recordId = buildAttendanceRecordId(selectedDate, effectiveClassId, selectedSessionId);
      const record: AttendanceRecord = sanitizeFirestoreDoc({
        id: recordId,
        classId: effectiveClassId,
        date: selectedDate,
        sessionId: selectedSessionId !== 'daily' ? selectedSessionId : undefined,
        sessionSubject: activeSessionObj ? activeSessionObj.subject : 'General Daily Roll-Call',
        timeSlot: activeSessionObj ? activeSessionObj.timeSlot : undefined,
        teacherId: userProfile?.userId || 'teacher_official',
        records: register,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'attendance', recordId), record, { merge: true });

      // Mirror status on custom scheduled class card if applicable
      if (activeSessionObj && !activeSessionObj.id.startsWith('default-')) {
        await setDoc(
          doc(db, 'scheduledClasses', activeSessionObj.id),
          { attendanceTaken: true, attendanceRecords: register },
          { merge: true }
        );
      }

      setSavedSuccess(true);
      setStatusNotice(
        `Saved attendance for ${
          activeSessionObj ? `${activeSessionObj.subject} (${activeSessionObj.timeSlot})` : 'Daily Roll-Call'
        } on ${selectedDate}.`
      );
      setTimeout(() => {
        setSavedSuccess(false);
        setStatusNotice(null);
      }, 3500);
    } catch (e) {
      console.error('Failed to save attendance:', e);
    }
  };

  // Direct student roll-call entry (strictly in attendanceRoster, no website account created)
  const handleAddStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newStudentName.trim() || !isTeacherOrAdmin) return;
    const name = newStudentName.trim();
    const index = newStudentIndex.trim() || `286${String(students.length + 1).padStart(4, '0')}`;
    const studentId = `roster_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newStudent: RosterStudent = {
      id: studentId,
      fullName: name,
      indexNumber: index,
      stream: newStudentStream,
      classId: selectedClassId || 'general',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'attendanceRoster', studentId), sanitizeFirestoreDoc(newStudent));
      setRegister((prev) => ({ ...prev, [studentId]: 'present' }));
      setNewStudentName('');
      setNewStudentIndex('');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `attendanceRoster/${studentId}`);
    }
  };

  // Update a student's Academic Stream (Bio / Physical) and sync directly to Firestore (Teachers & Admins Only)
  const handleUpdateStudentStream = async (studentId: string, nextStream: StudentStream) => {
    if (!isTeacherOrAdmin) return;
    try {
      await setDoc(
        doc(db, 'attendanceRoster', studentId),
        { stream: nextStream },
        { merge: true }
      );
      setStatusNotice(
        `Updated stream to ${nextStream === 'bio' ? 'Bio Stream' : 'Physical Stream'} — synced live with Marks & Assessments.`
      );
      setTimeout(() => setStatusNotice(null), 3500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `attendanceRoster/${studentId}`);
    }
  };

  // Bulk add multiple student names, indexes & streams directly into attendanceRoster
  const handleBulkAddStudents = async () => {
    if (!bulkStudentText.trim() || !isTeacherOrAdmin) return;
    const lines = bulkStudentText.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      let count = students.length;
      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const name = parts[0];
        if (!name) continue;
        count++;
        const index = parts[1] || `286${String(count).padStart(4, '0')}`;
        const rawStream = (parts[2] || '').toLowerCase();
        const parsedStream: StudentStream =
          rawStream.includes('phys') || rawStream.includes('math')
            ? 'physical'
            : rawStream.includes('bio')
            ? 'bio'
            : bulkStudentStream;
        const studentId = `roster_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newStudent: RosterStudent = {
          id: studentId,
          fullName: name,
          indexNumber: index,
          stream: parsedStream,
          classId: selectedClassId || 'general',
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'attendanceRoster', studentId), sanitizeFirestoreDoc(newStudent));
        setRegister((prev) => ({ ...prev, [studentId]: 'present' }));
      }
      setBulkStudentText('');
      setShowBulkModal(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendanceRoster');
    }
  };


  // Edit student name in attendanceRoster
  const handleSaveEditedName = async (studentId: string) => {
    if (!editingNameValue.trim() || !isTeacherOrAdmin) return;
    try {
      await setDoc(
        doc(db, 'attendanceRoster', studentId),
        { fullName: editingNameValue.trim() },
        { merge: true }
      );
      setEditingStudentId(null);
      setEditingNameValue('');
    } catch (err) {
      console.error('Failed to update student name:', err);
    }
  };

  // Delete student from roll call
  const handleDeleteStudent = async (studentId: string) => {
    if (!isTeacherOrAdmin) return;
    try {
      setRegister((prev) => {
        const updated = { ...prev };
        delete updated[studentId];
        return updated;
      });
      await deleteDoc(doc(db, 'attendanceRoster', studentId));
    } catch (err) {
      console.error('Failed to delete student:', err);
    }
  };

  // Delete class cohort (strictly teacher and admin only, in-app confirmation)
  const handleConfirmDeleteClassCohort = async () => {
    if (!cohortToDelete || !isTeacherOrAdmin) return;
    const targetId = cohortToDelete.id;
    const targetName = cohortToDelete.name;
    setCohortToDelete(null);
    try {
      await deleteDoc(doc(db, 'classes', targetId));
      setSelectedClassId('');
      setStatusNotice(`Removed class cohort "${targetName}".`);
      setTimeout(() => setStatusNotice(null), 3500);
    } catch (err) {
      console.error('Failed to delete class cohort:', err);
    }
  };

  // Get default weekday academic sessions
  const getDefaultWeekdayClasses = (dateStr: string): ScheduledClass[] => {
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    if (dayOfWeek < 1 || dayOfWeek > 5) return [];
    return [
      {
        id: `default-${dateStr}-maths`,
        classId: selectedClassId || 'general',
        className: '2k28 Science EM',
        date: dateStr,
        timeSlot: '08:00 - 09:30',
        periodName: 'Period 1',
        subject: 'Combined Mathematics',
        topic: 'Calculus Theorems & Vector Kinematics',
        teacherId: userProfile?.userId || 'faculty',
        teacherName: 'ZNC Science Project management',
        room: 'Science Complex - Hall 28',
        createdAt: dateStr,
      },
      {
        id: `default-${dateStr}-physics`,
        classId: selectedClassId || 'general',
        className: '2k28 Science EM',
        date: dateStr,
        timeSlot: '09:45 - 11:15',
        periodName: 'Period 2',
        subject: 'Physics',
        topic: 'Rotational Dynamics & Wave Interference',
        teacherId: userProfile?.userId || 'faculty',
        teacherName: 'ZNC Science Project management',
        room: 'Science Complex - Physics Lab 1',
        createdAt: dateStr,
      },
      {
        id: `default-${dateStr}-chemistry`,
        classId: selectedClassId || 'general',
        className: '2k28 Science EM',
        date: dateStr,
        timeSlot: '11:30 - 13:00',
        periodName: 'Period 3',
        subject: 'Chemistry',
        topic: 'Equilibrium Constant & Electrochemistry',
        teacherId: userProfile?.userId || 'faculty',
        teacherName: 'ZNC Science Project management',
        room: 'Science Complex - Chem Lab 2',
        createdAt: dateStr,
      },
    ];
  };

  // Get scheduled classes occurring on selected date (merging custom Firestore records + non-dismissed defaults)
  const getClassesForDate = (dateStr: string): ScheduledClass[] => {
    const directMatches = scheduledClasses.filter((sc) => sc.date === dateStr);
    const dismissedIds = dismissedDefaultsByDate[dateStr] || [];
    const legacySessionOverride = directMatches.some((sc) => sc.id.startsWith('session-'));
    const activeDefaults = legacySessionOverride
      ? []
      : getDefaultWeekdayClasses(dateStr).filter((def) => !dismissedIds.includes(def.id));
    const combined = [...activeDefaults, ...directMatches];
    combined.sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
    return combined;
  };

  // Reset selectedSessionId if it does not exist on newly selected date (except 'daily')
  useEffect(() => {
    if (selectedSessionId === 'daily') return;
    const daySessions = getClassesForDate(selectedDate);
    if (!daySessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId('daily');
    }
  }, [selectedDate, selectedSessionId, scheduledClasses, dismissedDefaultsByDate]);

  // Add new academic session on selectedDate (Teachers & Admins only)
  const handleCreateAcademicSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSubject = newSessionSubject.trim();
    const trimmedPeriod = newSessionPeriod.trim();
    const trimmedTimeSlot = newSessionTimeSlot.trim();
    if (!isTeacherOrAdmin || !trimmedSubject || !trimmedPeriod || !trimmedTimeSlot) return;
    setSavingSession(true);
    try {
      const classSessionId = `class-session-${Date.now()}`;
      const newSession: ScheduledClass = {
        id: classSessionId,
        classId: selectedClassId || 'general',
        className: '2k28 Science EM',
        date: selectedDate,
        timeSlot: trimmedTimeSlot,
        periodName: trimmedPeriod,
        subject: trimmedSubject,
        topic: newSessionTopic.trim() || undefined,
        teacherId: userProfile?.userId || 'faculty',
        teacherName: 'ZNC Science Project management',
        room: newSessionRoom.trim() || 'Science Complex - Hall 28',
        attendanceTaken: false,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'scheduledClasses', classSessionId), sanitizeFirestoreDoc(newSession));

      // Mirror in schoolEvents calendar feed
      await setDoc(
        doc(db, 'schoolEvents', `ev-class-${classSessionId}`),
        sanitizeFirestoreDoc({
          id: `ev-class-${classSessionId}`,
          title: `${newSession.subject} (${newSession.timeSlot})`,
          description: `Academic session (${newSession.periodName}): ${newSession.topic || 'Academic Lecture'} | Room: ${newSession.room}`,
          startDate: selectedDate,
          time: trimmedTimeSlot.split(/[-–]/)[0]?.trim() || trimmedTimeSlot,
          type: 'academic',
          classId: selectedClassId || 'general',
          location: newSession.room,
          createdBy: userProfile?.userId || 'faculty',
          createdByName: 'ZNC Science Project management',
          createdAt: new Date().toISOString(),
        })
      );

      setShowAddSessionModal(false);
      setNewSessionTopic('');
      setSelectedSessionId(classSessionId);
      setStatusNotice(`Added academic session "${newSession.subject}" (${newSession.periodName} • ${newSession.timeSlot}) on ${selectedDate}. You can now mark attendance for it separately.`);
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Failed to add academic session:', err);
    } finally {
      setSavingSession(false);
    }
  };

  // Delete scheduled academic session occurring on date (strictly teacher and admin only)
  const handleConfirmDeleteScheduledClass = async () => {
    if (!sessionToDelete || !isTeacherOrAdmin) return;
    const target = sessionToDelete;
    setSessionToDelete(null);

    try {
      if (target.id.startsWith('default-')) {
        const currentDismissed = dismissedDefaultsByDate[selectedDate] || [];
        const updatedDismissed = Array.from(new Set([...currentDismissed, target.id]));
        setDismissedDefaultsByDate((prev) => ({
          ...prev,
          [selectedDate]: updatedDismissed,
        }));
        await setDoc(
          doc(db, 'scheduledClassOverrides', selectedDate),
          {
            date: selectedDate,
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
      setStatusNotice(`Removed academic session "${target.subject}" on ${selectedDate}.`);
      setTimeout(() => setStatusNotice(null), 3500);
    } catch (err) {
      console.error('Failed to remove scheduled class:', err);
    }
  };

  // Generate Daily Attendance PDF Document
  const generateDailyAttendanceDoc = (): jsPDF => {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('ZAHIRA COLLEGE MAWANELLA • 2K28 SCIENCE EM', 20, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('OFFICIAL STUDENT ATTENDANCE REGISTER • G.C.E. ADVANCED LEVEL', 20, 28);
    doc.text('Mawanella, Sri Lanka • Certified Teacher Roll-Call Record', 20, 33);

    doc.setDrawColor(203, 213, 225);
    doc.line(20, 37, 190, 37);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Class: 2k28 Science EM`, 20, 46);
    doc.text(`Roll-Call Date: ${selectedDate}`, 20, 52);
    doc.text(`Supervisor: ZNC Science Project management`, 115, 46);
    doc.text(`Total Enrolled: ${students.length}`, 115, 52);

    let y = 65;
    doc.setFillColor(241, 245, 249);
    doc.rect(20, y, 170, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('SCHOLAR NAME', 24, y + 5.5);
    doc.text('EMAIL ADDRESS', 90, y + 5.5);
    doc.text('STATUS', 150, y + 5.5);
    doc.text('VERIFICATION', 172, y + 5.5);

    y += 12;
    students.forEach((st) => {
      const status = register[st.id] || 'present';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(st.fullName || 'Student', 24, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Index: ${st.indexNumber || '—'}`, 90, y);

      if (status === 'present') {
        doc.setTextColor(22, 101, 52); // green
      } else if (status === 'absent') {
        doc.setTextColor(185, 28, 28); // red
      } else {
        doc.setTextColor(180, 83, 9); // amber
      }
      doc.text(status.toUpperCase(), 150, y);

      doc.setTextColor(100, 116, 139);
      doc.text('Certified', 172, y);

      y += 10;
      if (y > 270) {
        doc.addPage();
        y = 25;
      }
    });

    doc.setFont('helvetica', 'normal');
    doc.text('Certified by ZNC Science Project management • Official Academic Record', 20, y + 15);

    return doc;
  };

  // Export Attendance Register to PDF
  const handleExportPDF = () => {
    try {
      const doc = generateDailyAttendanceDoc();
      doc.save(`Zahira_College_Mawanella_Attendance_${selectedDate}.pdf`);
    } catch (e) {
      console.error('PDF generation error:', e);
    }
  };

  // Preview Daily Attendance Register PDF
  const handlePreviewDailyPDF = () => {
    try {
      const doc = generateDailyAttendanceDoc();
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPreviewData({
        title: `Official Daily Attendance Register: ${selectedDate}`,
        subtitle: 'Zahira College Mawanella • 2k28 Science English Medium',
        category: 'Attendance Register',
        filename: `Zahira_College_Mawanella_Attendance_${selectedDate}.pdf`,
        blobUrl,
        blob,
      });
      setIsPreviewOpen(true);
    } catch (e) {
      console.error('Preview error:', e);
    }
  };

  // Export Attendance Register to Excel / CSV format
  const handleExportExcel = () => {
    try {
      const activeClass = classes.find((c) => c.id === selectedClassId);
      const className = activeClass ? activeClass.name : '2k28 Science EM';

      let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel compatibility
      csv += 'ZAHIRA COLLEGE MAWANELLA • OFFICIAL STUDENT ATTENDANCE REGISTER\n';
      csv += `Academic Cohort:,"${className} (G.C.E. Advanced Level 2028)"\n`;
      csv += `Roll-Call Session Date:,"${selectedDate}"\n`;
      csv += `Supervisor:,"ZNC Science Project management"\n`;
      csv += `Total Enrolled Scholars:,${totalStudents}\n`;
      csv += `Present Scholars:,${presentCount}\n`;
      csv += `Absent Scholars:,${absentCount}\n`;
      csv += `Late Arrivals:,${lateCount}\n`;
      csv += `Attendance Rate:,${attendanceRate}%\n`;
      csv += `School Record Generated At:,"${new Date().toLocaleString()}"\n\n`;

      csv += 'Index / Scholar ID,Scholar Full Name,Email / Reference,Academic Stream,Certified Status,Session Date,Supervisor,Verification Method\n';

      const currentRecordId = buildAttendanceRecordId(selectedDate, selectedClassId || 'general', selectedSessionId);
      const currentRecord = attendanceRecords.find((r) => r.id === currentRecordId);

      students.forEach((st) => {
        const status = register[st.id] || 'present';
        const checkIn = currentRecord?.checkInLogs?.find((l) => l.studentId === st.id);
        const method = checkIn
          ? `QR Verified (${new Date(checkIn.checkInTime).toLocaleTimeString()})`
          : 'Manual Teacher Roll-Call';
        const indexOrId = st.indexNumber || st.id;

        const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

        const streamLabel =
          st.stream === 'bio' ? 'Bio Stream' : st.stream === 'physical' ? 'Physical Stream' : '2k28 Science EM';

        csv += `${escape(indexOrId)},${escape(st.fullName)},${escape(st.indexNumber)},${escape(
          streamLabel
        )},${escape(status.toUpperCase())},${escape(selectedDate)},${escape(
          'ZNC Science Project management'
        )},${escape(method)}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Zahira_College_Attendance_${selectedDate}_${selectedClassId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Excel/CSV export error:', e);
    }
  };

  // Export Monthly Attendance Summary PDF for Internal Staff (Filters out all watermarks)
  const handleExportMonthlySummaryPDF = () => {
    try {
      const doc = new jsPDF();
      const currentYearMonth = selectedDate.substring(0, 7); // e.g. "2026-11"
      const monthDateObj = new Date(`${currentYearMonth}-01T00:00:00`);
      const monthName = monthDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      // Filter attendance records belonging to this month and class
      const monthRecords = attendanceRecords.filter((r) => {
        const matchesClass = !r.classId || r.classId === selectedClassId;
        const matchesMonth = r.date ? r.date.startsWith(currentYearMonth) : true;
        return matchesClass && matchesMonth;
      });

      const totalRecordedSessions = Math.max(monthRecords.length, 1);

      // Clean Official Internal Header - No Watermark
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text('ZAHIRA COLLEGE MAWANELLA • 2K28 SCIENCE EM', 20, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('MONTHLY ATTENDANCE AUDIT SUMMARY — INTERNAL FACULTY & ADMIN REPORT', 20, 26);
      doc.text('Faculty Workspace Report • Staff Confidential Document', 20, 31);

      // Internal staff audit banner
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(20, 35, 170, 14, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(67, 56, 202);
      doc.text('INTERNAL STAFF AUDIT ONLY • UNWATERMARKED FACULTY SUMMARY', 24, 41);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(79, 70, 229);
      doc.text(`Official record for academic term evaluations • Generated on ${new Date().toLocaleDateString()}`, 24, 46);

      // Metadata summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Evaluation Period: ${monthName}`, 20, 56);
      doc.text(`Target Class: 2k28 Science EM`, 20, 62);
      doc.text(`Sessions Evaluated: ${totalRecordedSessions}`, 115, 56);
      doc.text(`Supervisor: ZNC Science Project management`, 115, 62);

      // Table Header
      let y = 72;
      doc.setFillColor(241, 245, 249);
      doc.rect(20, y, 170, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('SCHOLAR NAME / ROLL NO', 24, y + 5.5);
      doc.text('PRESENT', 95, y + 5.5);
      doc.text('LATE', 115, y + 5.5);
      doc.text('ABSENT', 133, y + 5.5);
      doc.text('RATE (%)', 152, y + 5.5);
      doc.text('AUDIT STATUS', 170, y + 5.5);

      y += 13;

      let scholarsBelow75 = 0;
      let totalCohortRateSum = 0;

      students.forEach((st) => {
        let pCount = 0;
        let lCount = 0;
        let aCount = 0;

        monthRecords.forEach((rec) => {
          const status = rec.records?.[st.id];
          if (status === 'present') pCount++;
          else if (status === 'late') lCount++;
          else if (status === 'absent') aCount++;
        });

        const hasSessions = pCount + lCount + aCount > 0;
        const effectiveSessions = pCount + lCount + aCount;
        const rate = hasSessions
          ? Math.round(((pCount + lCount * 0.5) / effectiveSessions) * 100)
          : 0;

        totalCohortRateSum += rate;
        if (hasSessions && rate < 75) scholarsBelow75++;

        const indexNo = st.indexNumber || `—`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(st.fullName || 'Scholar', 24, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(indexNo, 24, y + 4);

        doc.setFontSize(8.5);
        doc.setTextColor(22, 101, 52);
        doc.text(String(pCount), 98, y + 1);

        doc.setTextColor(180, 83, 9);
        doc.text(String(lCount), 118, y + 1);

        doc.setTextColor(185, 28, 28);
        doc.text(String(aCount), 136, y + 1);

        doc.setFont('helvetica', 'bold');
        if (!hasSessions) doc.setTextColor(100, 116, 139);
        else if (rate >= 90) doc.setTextColor(22, 101, 52);
        else if (rate >= 75) doc.setTextColor(30, 64, 175);
        else doc.setTextColor(185, 28, 28);
        doc.text(hasSessions ? `${rate}%` : '—', 154, y + 1);

        doc.setFontSize(7.5);
        if (!hasSessions) {
          doc.setTextColor(100, 116, 139);
          doc.text('No Logs Yet', 170, y + 1);
        } else if (rate >= 75) {
          doc.setTextColor(71, 85, 105);
          doc.text('Satisfactory', 170, y + 1);
        } else {
          doc.setTextColor(185, 28, 28);
          doc.text('Alert (<75%)', 170, y + 1);
        }

        y += 10;
        if (y > 265) {
          doc.addPage();
          y = 25;
        }
      });

      const avgCohortRate = students.length > 0 ? Math.round(totalCohortRateSum / students.length) : 0;

      // Bottom Cohort Audit Summary
      doc.setDrawColor(226, 232, 240);
      doc.line(20, y + 4, 190, y + 4);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Cohort Monthly Average: ${avgCohortRate}%`, 20, y + 11);
      doc.text(`Total Enrolled: ${students.length}`, 85, y + 11);
      doc.text(`Scholars Below Threshold (<75%): ${scholarsBelow75}`, 130, y + 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'CONFIDENTIAL: Prepared exclusively by ZNC Science Project management for Internal Staff Records.',
        20,
        y + 18
      );

      // Notice: No watermark added anywhere in the document!
      doc.save(`Zahira_College_Monthly_Attendance_Summary_InternalStaff_${currentYearMonth}.pdf`);
    } catch (e) {
      console.error('Monthly PDF generation error:', e);
    }
  };

  const totalStudents = students.length;
  const presentCount = students.filter((s) => (register[s.id] || 'present') === 'present').length;
  const absentCount = students.filter((s) => register[s.id] === 'absent').length;
  const lateCount = students.filter((s) => register[s.id] === 'late').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  // Compute logged-in student's real attendance metrics strictly from active (ON) saved Firestore logs
  const studentMatchingRosterIds = students
    .filter(
      (s) =>
        s.id === userProfile?.userId ||
        (userProfile?.indexNumber && s.indexNumber === userProfile.indexNumber) ||
        (userProfile?.fullName && s.fullName.trim().toLowerCase() === userProfile.fullName.trim().toLowerCase())
    )
    .map((s) => s.id);
  const candidateIds = Array.from(new Set([userProfile?.userId, ...studentMatchingRosterIds].filter(Boolean) as string[]));
  const studentRecordedSessions = attendanceRecords.filter(
    (rec) =>
      isAttendanceRecordActive(rec, dayControlsMap) &&
      candidateIds.some((cid) => rec.records && rec.records[cid] !== undefined)
  );
  const studentPresentSessions = studentRecordedSessions.filter((rec) =>
    candidateIds.some((cid) => rec.records?.[cid] === 'present' || rec.records?.[cid] === 'late' || rec.records?.[cid] === 'excused')
  ).length;
  const studentAbsentSessions = studentRecordedSessions.filter((rec) =>
    candidateIds.some((cid) => rec.records?.[cid] === 'absent')
  ).length;
  const personalRate =
    studentRecordedSessions.length > 0
      ? `${Math.round((studentPresentSessions / studentRecordedSessions.length) * 100)}%`
      : '—';

  // Active session & saved records info on selectedDate
  const classesToday = getClassesForDate(selectedDate);
  const activeSessionObj =
    selectedSessionId !== 'daily' ? classesToday.find((c) => c.id === selectedSessionId) : undefined;
  const activeRecordId = buildAttendanceRecordId(selectedDate, selectedClassId || 'general', selectedSessionId);
  const savedSessionsCountToday = attendanceRecords.filter(
    (r) => r.date === selectedDate && Object.keys(r.records || {}).length > 0
  ).length;

  // Student's personal attendance status for selectedDate & selectedSessionId
  const activeSavedRecord = attendanceRecords.find((r) => r.id === activeRecordId);
  const studentUserRecord = !isDayAttendanceEnabled
    ? 'attendance off'
    : (activeSavedRecord && candidateIds.map((cid) => activeSavedRecord.records?.[cid]).find(Boolean)) ||
      (studentRecordedSessions.length > 0 ? 'not marked' : 'not marked');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-900">
              Official Attendance Register
            </h2>
            <span className="rounded-full bg-blue-100 text-blue-700 px-3 py-0.5 text-[11px] font-bold border border-blue-200">
              Zahira College Mawanella
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            2k28 Science English Medium • Supervisor: <strong className="text-slate-700">ZNC Science Project management</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export & Preview Options for School Record-Keeping */}
          <button
            onClick={handlePreviewDailyPDF}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 px-3.5 py-2 text-xs font-bold text-blue-900 transition-colors shadow-2xs"
            title="Preview Daily PDF in Browser"
          >
            <Eye className="w-3.5 h-3.5 text-blue-700" />
            <span>Preview Daily</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-900 transition-colors shadow-2xs"
            title="Download Official Daily PDF Register"
          >
            <FileText className="w-3.5 h-3.5 text-blue-700" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={handleExportMonthlySummaryPDF}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 px-3.5 py-2 text-xs font-bold text-indigo-900 transition-colors shadow-2xs"
            title="Generate Monthly Attendance Summary PDF for Internal Staff (Unwatermarked)"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>Monthly Staff PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 transition-colors shadow-2xs"
            title="Download Excel / CSV Document for School Record-Keeping"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export as Excel (CSV)</span>
          </button>

          {savedSuccess && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Attendance saved in real time!</span>
            </div>
          )}
        </div>
      </div>

      {statusNotice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-900 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{statusNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-blue-400 hover:text-blue-700 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* POLICY NOTICE FOR STUDENTS & PARENTS */}
      {!isTeacherOrAdmin && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <span className="font-bold text-blue-900 block mb-0.5">
              Teacher-Certified Attendance Policy (View-Only Mode)
            </span>
            Under Zahira College Mawanella academic regulations, student attendance records are strictly taken, verified, and certified by authorized subject teachers and school administrators. Students and parents have certified read-only access to their official logs and cannot modify attendance records.
          </div>
        </div>
      )}

      {/* PARENT / GUARDIAN CHILD ATTENDANCE MONITORING CARD */}
      {activeRole === 'parent' && (
        <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-amber-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Parent / Guardian Attendance Monitoring Portal
                </h3>
                <p className="text-[11px] text-slate-500">
                  {userProfile?.bio || 'Parent Portal • Zahira College 2k28 Science EM'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                Official Read-Only Access
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <div className="rounded-xl bg-amber-50/50 p-3 border border-amber-200/60">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Cohort Present Rate</span>
              <p className="font-serif text-xl font-bold text-amber-950 mt-0.5">{totalStudents > 0 ? `${attendanceRate}%` : '—'}</p>
              <p className="text-[10px] text-emerald-700 font-medium mt-0.5">{totalStudents > 0 ? `${totalStudents} registered scholars` : 'No scholars registered yet'}</p>
            </div>
            <div className="rounded-xl bg-emerald-50/50 p-3 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Present Today</span>
              <p className="font-serif text-xl font-bold text-emerald-900 mt-0.5">{presentCount}</p>
              <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Session: {selectedDate}</p>
            </div>
            <div className="rounded-xl bg-rose-50/50 p-3 border border-rose-100">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Absent Today</span>
              <p className="font-serif text-xl font-bold text-rose-900 mt-0.5">{absentCount}</p>
              <p className="text-[10px] text-rose-700 font-medium mt-0.5">Recorded by faculty</p>
            </div>
            <div className="rounded-xl bg-blue-50/50 p-3 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Faculty Marking</span>
              <p className="font-serif text-xl font-bold text-blue-900 mt-0.5">Certified</p>
              <p className="text-[10px] text-blue-700 font-medium mt-0.5">Teacher Verified Daily</p>
            </div>
          </div>

          <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Parents have certified view-only access to verify daily attendance. Only authorized Zahira College faculty can mark or edit student records.
            </span>
          </div>
        </div>
      )}

      {/* STUDENT PERSONAL OVERVIEW CARD (IF LOGGED IN AS STUDENT) */}
      {activeRole === 'student' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {userProfile?.fullName?.charAt(0) || 'S'}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {userProfile?.fullName || 'Enrolled Student Scholar'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Admission ID: {userProfile?.userId?.slice(0, 12)} • 2k28 Science EM Cohort
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Session Status ({selectedDate}):</span>
              <span
                className={`rounded px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  studentUserRecord === 'present'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : studentUserRecord === 'absent'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {studentUserRecord}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Attendance Rate</span>
              <p className="font-serif text-xl font-bold text-blue-600 mt-0.5">{personalRate}</p>
              <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                {studentRecordedSessions.length > 0 ? `${studentRecordedSessions.length} recorded session(s)` : 'Awaiting first roll-call'}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/50 p-3 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Present Days</span>
              <p className="font-serif text-xl font-bold text-emerald-900 mt-0.5">
                {studentRecordedSessions.length > 0 ? `${studentPresentSessions} / ${studentRecordedSessions.length}` : '0 / 0'}
              </p>
              <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Verified Logs</p>
            </div>
            <div className="rounded-xl bg-red-50/50 p-3 border border-red-100">
              <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider">Absences</span>
              <p className="font-serif text-xl font-bold text-red-900 mt-0.5">{studentAbsentSessions}</p>
              <p className="text-[10px] text-red-700 font-medium mt-0.5">Recorded by faculty</p>
            </div>
            <div className="rounded-xl bg-blue-50/50 p-3 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Teacher Certification</span>
              <p className="font-serif text-xl font-bold text-blue-900 mt-0.5">Verified</p>
              <p className="text-[10px] text-blue-700 font-medium mt-0.5">Faculty Approved</p>
            </div>
          </div>
        </div>
      )}

      {/* Date, Class Session & Teacher/Admin ON-OFF Control Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="font-semibold text-slate-500 uppercase tracking-wider block mb-1 text-[10px]">
                Class Cohort
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.grade})
                    </option>
                  ))}
                </select>

                {isTeacherOrAdmin && selectedClassId && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetCohort = classes.find((c) => c.id === selectedClassId);
                      if (targetCohort) setCohortToDelete(targetCohort);
                    }}
                    className="p-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                    title="Remove this class cohort"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-500 uppercase tracking-wider block mb-1 text-[10px]">
                Session Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-500 uppercase tracking-wider block mb-1 text-[10px]">
                Class / Period to Mark Today
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="daily">General Daily Roll-Call (All Day)</option>
                {classesToday.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.subject} ({cls.periodName ? `${cls.periodName} • ` : ''}{cls.timeSlot})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Teacher / Admin Master Attendance ON/OFF Button + Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isTeacherOrAdmin ? (
              <>
                <button
                  type="button"
                  onClick={handleToggleDayAttendance}
                  disabled={togglingDay}
                  role="switch"
                  aria-checked={isDayAttendanceEnabled}
                  aria-label={
                    isDayAttendanceEnabled
                      ? `Attendance is ON for ${selectedDate}. Click to turn OFF attendance marking.`
                      : `Attendance is OFF for ${selectedDate}. Click to turn ON attendance marking.`
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all border shadow-xs disabled:opacity-60 ${
                    isDayAttendanceEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-700 hover:bg-slate-800 text-white border-slate-600'
                  }`}
                  title="Turn attendance marking ON or OFF for this day. When OFF, no attendance is needed and records do not sync with Student or Teacher graphs."
                >
                  <Power className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Attendance: {isDayAttendanceEnabled ? 'ON' : 'OFF'}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors ${
                      isDayAttendanceEnabled ? 'bg-emerald-900/50 justify-end' : 'bg-slate-900/60 justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                  </span>
                </button>

                <button
                  onClick={() => {
                    setQrModalMode('generate');
                    setShowQrModal(true);
                  }}
                  disabled={!isDayAttendanceEnabled}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 disabled:pointer-events-none px-3.5 py-2 text-xs font-bold text-white transition-all shadow-sm"
                >
                  <QrCode className="w-3.5 h-3.5 text-white" />
                  <span>Project Classroom QR</span>
                </button>

                <button
                  onClick={handleMarkAllPresent}
                  disabled={!isDayAttendanceEnabled}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:pointer-events-none px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
                >
                  Mark All Present
                </button>

                <button
                  onClick={handleSaveAttendance}
                  disabled={!isDayAttendanceEnabled}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:pointer-events-none px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm"
                >
                  <Save className="w-3.5 h-3.5 text-white" />
                  <span>Save Register</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border ${
                    isDayAttendanceEnabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  <span>Day Status: {isDayAttendanceEnabled ? 'Attendance Active' : 'Attendance OFF'}</span>
                </span>
                {isDayAttendanceEnabled && (
                  <button
                    onClick={() => {
                      setQrModalMode('scan');
                      setShowQrModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition-all shadow-md animate-pulse"
                  >
                    <Camera className="w-4 h-4 text-white" />
                    <span>Scan Classroom Attendance QR</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Indicator Banner for Day Control */}
        {!isDayAttendanceEnabled ? (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-200">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold">Attendance Marking is OFF for {selectedDate}</span>
                <span className="mx-1.5 text-amber-400">•</span>
                <span>
                  No attendance needs to be marked today. Any records on this date are excluded from Student &amp; Teacher Dashboard attendance graphs
                  {currentDayControl?.updatedByName ? ` (set by ${currentDayControl.updatedByName})` : ''}.
                </span>
              </div>
            </div>
            {isTeacherOrAdmin && (
              <button
                type="button"
                onClick={() => handleSetDayAttendance(true)}
                disabled={togglingDay}
                aria-label={`Turn ON attendance for ${selectedDate}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1.5 text-[11px] font-bold shrink-0 shadow-2xs"
              >
                <Power className="w-3 h-3" aria-hidden="true" />
                <span>Turn ON Attendance</span>
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-emerald-900 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>
                Marking Register:{' '}
                <strong>
                  {activeSessionObj ? `${activeSessionObj.subject} (${activeSessionObj.timeSlot})` : 'General Daily Roll-Call'}
                </strong>{' '}
                on <strong>{selectedDate}</strong> • Syncs live with Student &amp; Teacher graphs when saved.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {savedSessionsCountToday} saved register(s) on {selectedDate}
              </span>
              {isTeacherOrAdmin && (
                <button
                  type="button"
                  onClick={() => handleSetDayAttendance(false)}
                  disabled={togglingDay}
                  aria-label={`Turn OFF attendance for ${selectedDate}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-3 py-1.5 text-[11px] font-bold shadow-2xs"
                >
                  <Power className="w-3 h-3" aria-hidden="true" />
                  <span>Turn OFF Attendance</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Student QR Check-In Banner */}
      {!isTeacherOrAdmin && isDayAttendanceEnabled && (
        <div className="rounded-2xl border-2 border-emerald-500/80 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-transparent p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-sm shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Classroom QR Attendance Active in Hall 28
                </span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5">
                  Instant Verification
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Scan the QR code projected on the classroom screen to log your presence automatically in real time and maintain your diligence streak!
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setQrModalMode('scan');
              setShowQrModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>Launch Scanner</span>
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Enrolled Scholars</span>
          <p className="font-serif text-2xl font-bold text-slate-900 mt-1">{totalStudents}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Present</span>
          <p className="font-serif text-2xl font-bold text-emerald-900 mt-1">{presentCount}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-red-800 uppercase tracking-wider">Absent</span>
          <p className="font-serif text-2xl font-bold text-red-900 mt-1">{absentCount}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Attendance Rate</span>
          <p className="font-serif text-2xl font-bold text-blue-900 mt-1">{attendanceRate}%</p>
        </div>
      </div>

      {/* Classes Occurring on Selected Date (Select any class or add as many classes as needed to mark attendance) */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Classes Occurring on {selectedDate}
            </span>
            <p className="text-xs font-bold text-slate-900 mt-0.5">
              Select a class below to mark separate attendance, or add as many classes today as needed
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">
              {classesToday.length} class session(s)
            </span>
            {isTeacherOrAdmin && (
              <button
                type="button"
                onClick={() => setShowAddSessionModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Academic Session</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {/* General Daily Roll Call Card */}
          {(() => {
            const dailyDocId = buildAttendanceRecordId(selectedDate, selectedClassId || 'general', 'daily');
            const isDailySaved = attendanceRecords.some(
              (r) =>
                (r.id === dailyDocId || (r.date === selectedDate && r.classId === selectedClassId && !r.sessionId)) &&
                Object.keys(r.records || {}).length > 0
            );
            const isSelected = selectedSessionId === 'daily';
            return (
              <button
                type="button"
                onClick={() => setSelectedSessionId('daily')}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-semibold shadow-2xs transition-all text-left ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <CalendarCheck2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-[11px] text-slate-900">General Daily Roll-Call</p>
                    {isDailySaved && (
                      <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold">
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">Full-day cohort register</p>
                </div>
              </button>
            );
          })()}

          {classesToday.map((cls) => {
            const sessDocId = buildAttendanceRecordId(selectedDate, selectedClassId || 'general', cls.id);
            const isSessSaved = attendanceRecords.some(
              (r) => r.id === sessDocId && Object.keys(r.records || {}).length > 0
            );
            const isSelected = selectedSessionId === cls.id;

            return (
              <div
                key={cls.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-2xs transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(cls.id)}
                  className="flex items-center gap-2.5 text-left min-w-0"
                >
                  <GraduationCap className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-[11px] text-slate-900 truncate">{cls.subject}</p>
                      {isSessSaved && (
                        <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold shrink-0">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {cls.periodName ? `${cls.periodName} • ` : ''}{cls.timeSlot} • {cls.room}
                    </p>
                  </div>
                </button>
                {isTeacherOrAdmin && (
                  <button
                    type="button"
                    onClick={() => setSessionToDelete(cls)}
                    className="min-h-[30px] min-w-[30px] flex items-center justify-center p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    title="Remove this academic session"
                    aria-label={`Remove ${cls.subject}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* GOOGLE CALENDAR VIEW SECTION */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Google Calendar • Schedule & Timetable (View Only)
              </h3>
              <p className="text-xs text-slate-500">
                Official Zahira College 2k28 Science EM academic sessions, exams & holiday schedule
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGoogleCalendar(!showGoogleCalendar)}
              className="text-xs text-blue-700 font-bold hover:underline px-2 py-1"
            >
              {showGoogleCalendar ? 'Hide Calendar' : 'Show Calendar'}
            </button>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-[11px] font-bold border border-emerald-200">
              Live View
            </span>
          </div>
        </div>

        {showGoogleCalendar && (
          <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs">
            <iframe
              src="https://calendar.google.com/calendar/embed?src=en.lk%23holiday%40group.v.calendar.google.com&ctz=Asia%2FColombo&mode=AGENDA&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0"
              style={{ border: 0, width: '100%', height: '320px' }}
              frameBorder="0"
              scrolling="no"
              title="Official Academic Google Calendar (View Only)"
            />
          </div>
        )}
      </div>

      {/* DIRECT STUDENT ROLL-CALL ENTRY PANEL FOR TEACHERS */}
      {isTeacherOrAdmin && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 md:p-5 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Direct Student Roll-Call Entry (No Student Account Creation Needed)
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Bulk Import Names &amp; Indexes</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleAddStudent} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
            <div className="sm:col-span-5">
              <input
                type="text"
                placeholder="Enter real student full name..."
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Index No (opt.)"
                value={newStudentIndex}
                onChange={(e) => setNewStudentIndex(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <select
                value={newStudentStream}
                onChange={(e) => setNewStudentStream(e.target.value as StudentStream)}
                aria-label="Select Student Stream"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="bio">Bio Stream</option>
                <option value="physical">Physical Stream</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={!newStudentName.trim()}
                className="w-full h-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-all shadow-xs whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Add &amp; Mark Present</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STUDENT STREAM ALLOCATION & FILTER BAR (Synced with Marks & Assessments) */}
      {(() => {
        const bioCount = students.filter((s) => s.stream === 'bio').length;
        const physicalCount = students.filter((s) => s.stream === 'physical').length;
        const unassignedCount = students.filter((s) => s.stream !== 'bio' && s.stream !== 'physical').length;

        return (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Academic Stream Classification (Bio &amp; Physical Science)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isTeacherOrAdmin
                  ? 'Select Bio or Physical stream for each student below — changes sync automatically to Term Exams in Marks & Assessments.'
                  : 'Filtered view of students by Bio Stream and Physical Stream.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setStreamFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  streamFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('bio')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  streamFilter === 'bio'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Bio Stream ({bioCount})
              </button>
              <button
                type="button"
                onClick={() => setStreamFilter('physical')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  streamFilter === 'physical'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Physical Stream ({physicalCount})
              </button>
              {unassignedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStreamFilter('unassigned')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    streamFilter === 'unassigned'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                >
                  Unassigned ({unassignedCount})
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Attendance Roll Call Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Student Scholar</th>
                <th className="py-3 px-4">Student Index</th>
                <th className="py-3 px-4">Academic Stream</th>
                <th className="py-3 px-4">Certified Status ({selectedDate})</th>
                <th className="py-3 px-4 text-right">
                  {isTeacherOrAdmin ? 'Teacher Action' : 'Verification'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
              {loading && students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2 animate-pulse" />
                    <p className="font-semibold text-slate-600 text-xs">Loading official scholar register...</p>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    <Users className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">No students registered yet in the attendance register.</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {isTeacherOrAdmin
                        ? 'Enter real student names above or use Bulk Import Names & Indexes to populate your class register.'
                        : 'Teachers can add enrolled scholars to the roll-call register.'}
                    </p>
                  </td>
                </tr>
              ) : (
                students
                  .filter((student) => {
                    if (streamFilter === 'all') return true;
                    if (streamFilter === 'bio') return student.stream === 'bio';
                    if (streamFilter === 'physical') return student.stream === 'physical';
                    return student.stream !== 'bio' && student.stream !== 'physical';
                  })
                  .map((student) => {
                  const status = register[student.id] || 'present';
                  const currentRecord = attendanceRecords.find((r) => r.id === activeRecordId);
                  const checkIn = currentRecord?.checkInLogs?.find((l) => l.studentId === student.id);
                  const isEditingThisStudent = editingStudentId === student.id;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {student.fullName ? student.fullName.charAt(0) : 'S'}
                          </div>

                          {isEditingThisStudent ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                className="rounded-lg border border-blue-400 px-2 py-1 text-xs text-slate-900 focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveEditedName(student.id)}
                                className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                title="Save name"
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingStudentId(null)}
                                className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{student.fullName}</p>
                                <p className="text-[10px] text-slate-400">Index: {student.indexNumber} · {student.stream === 'bio' ? 'Bio Stream' : student.stream === 'physical' ? 'Physical Stream' : 'Stream Unassigned'}</p>
                              </div>
                              {isTeacherOrAdmin && (
                                <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingStudentId(student.id);
                                      setEditingNameValue(student.fullName);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded"
                                    title="Edit student name"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStudent(student.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                                    title="Remove from roll call"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-blue-900 dark:text-blue-300 tabular-nums">{student.indexNumber}</td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isTeacherOrAdmin ? (
                          <div
                            role="group"
                            aria-label={`Stream selection for ${student.fullName}`}
                            className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 shadow-2xs"
                          >
                            <button
                              type="button"
                              onClick={() => handleUpdateStudentStream(student.id, 'bio')}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                                student.stream === 'bio'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              Bio
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStudentStream(student.id, 'physical')}
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                                student.stream === 'physical'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              Physical
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              student.stream === 'bio'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : student.stream === 'physical'
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {student.stream === 'bio'
                              ? 'Bio Stream'
                              : student.stream === 'physical'
                              ? 'Physical Stream'
                              : 'Unassigned'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span
                            className={`rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              status === 'present'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : status === 'absent'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {status}
                          </span>
                          {checkIn && (
                            <span className="inline-flex items-center gap-1 rounded bg-teal-50 text-teal-800 text-[9px] font-bold px-1.5 py-0.5 border border-teal-200">
                              <ShieldCheck className="w-2.5 h-2.5 text-teal-600" />
                              QR Verified ({new Date(checkIn.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isTeacherOrAdmin ? (
                          <div className={`inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs whitespace-nowrap ${!isDayAttendanceEnabled ? 'opacity-45 pointer-events-none' : ''}`}>
                            <button
                              type="button"
                              disabled={!isDayAttendanceEnabled}
                              onClick={() => handleStatusChange(student.id, 'present')}
                              className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                status === 'present' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              disabled={!isDayAttendanceEnabled}
                              onClick={() => handleStatusChange(student.id, 'absent')}
                              className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                status === 'absent' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              Absent
                            </button>
                            <button
                              type="button"
                              disabled={!isDayAttendanceEnabled}
                              onClick={() => handleStatusChange(student.id, 'late')}
                              className={`rounded px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition-colors ${
                                status === 'late' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              Late
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-slate-400 text-xs">
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>Faculty Certified</span>
                          </div>
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

      {/* QR Attendance Modal for Generation (Teacher) and Scanning (Student) */}
      <QRAttendanceModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        classId={selectedClassId}
        className={classes.find((c) => c.id === selectedClassId)?.name || '2k28 Science EM'}
        selectedDate={selectedDate}
        sessionId={selectedSessionId}
        sessionSubject={activeSessionObj?.subject}
        defaultRoom={activeSessionObj?.room}
        mode={qrModalMode}
      />

      {/* Bulk Add Student Roster Modal for Teachers & Admins */}
      {showBulkModal && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-600" />
                <h3 className="font-serif font-bold text-base text-slate-900 dark:text-slate-100">
                  Bulk Import Student Names into Roll Call
                </h3>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Default Stream for Imported Students
                </label>
                <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setBulkStudentStream('bio')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      bulkStudentStream === 'bio'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Bio Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkStudentStream('physical')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      bulkStudentStream === 'physical'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Physical Stream
                  </button>
                </div>
              </div>

              <p className="text-slate-600 dark:text-slate-300">
                Paste student names from your attendance register sheet (one scholar per line). Optionally add Index Number and Stream (<code>Bio</code> or <code>Physical</code>), e.g. <code>Mohamed Bilal, 2860101, Physical</code>.
              </p>
              <textarea
                rows={6}
                placeholder={`Student Full Name 1, 2860101, Bio\nStudent Full Name 2, 2860102, Physical`}
                value={bulkStudentText}
                onChange={(e) => setBulkStudentText(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-900 dark:text-slate-100 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400">
                Students and their Bio / Physical stream sync directly to Attendance and Marks &amp; Assessments.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowBulkModal(false)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAddStudents}
                disabled={!bulkStudentText.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-all shadow-xs"
              >
                Import Scholars & Mark Present
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Live PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          if (previewData?.blobUrl) {
            URL.revokeObjectURL(previewData.blobUrl);
          }
        }}
        pdfData={previewData}
      />

      {/* ADD ACADEMIC SESSION MODAL (Teachers & Admins Only) */}
      {showAddSessionModal && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-slate-900">
                    Add Academic Session
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Date: {selectedDate} • Teachers &amp; Admins Only
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSessionModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAcademicSession} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  list="attendance-subject-suggestions"
                  value={newSessionSubject}
                  onChange={(e) => setNewSessionSubject(e.target.value)}
                  placeholder="e.g. Combined Mathematics, Physics Revision"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="attendance-subject-suggestions">
                  <option value="Combined Mathematics" />
                  <option value="Physics" />
                  <option value="Chemistry" />
                  <option value="Biology" />
                  <option value="Information & Communication Technology (ICT)" />
                  <option value="General English" />
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Time Period *
                  </label>
                  <input
                    type="text"
                    required
                    list="attendance-period-suggestions"
                    value={newSessionPeriod}
                    onChange={(e) => setNewSessionPeriod(e.target.value)}
                    placeholder="e.g. Period 1, Extra Class"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="attendance-period-suggestions">
                    <option value="Period 1" />
                    <option value="Period 2" />
                    <option value="Period 3" />
                    <option value="Period 4" />
                    <option value="Period 5" />
                    <option value="Morning Revision" />
                    <option value="Evening Extra Class" />
                    <option value="Practical Lab" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Time Slot *
                  </label>
                  <input
                    type="text"
                    required
                    list="attendance-timeslot-suggestions"
                    value={newSessionTimeSlot}
                    onChange={(e) => setNewSessionTimeSlot(e.target.value)}
                    placeholder="e.g. 08:00 - 09:30"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="attendance-timeslot-suggestions">
                    <option value="08:00 - 09:30" />
                    <option value="09:45 - 11:15" />
                    <option value="11:30 - 13:00" />
                    <option value="13:45 - 15:15" />
                    <option value="15:30 - 17:00" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Room / Lecture Hall
                </label>
                <input
                  type="text"
                  value={newSessionRoom}
                  onChange={(e) => setNewSessionRoom(e.target.value)}
                  placeholder="Science Complex - Hall 28"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Session Topic (Optional)
                </label>
                <input
                  type="text"
                  value={newSessionTopic}
                  onChange={(e) => setNewSessionTopic(e.target.value)}
                  placeholder="e.g. Organic Reaction Mechanisms"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSessionModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSession || !newSessionSubject.trim() || !newSessionPeriod.trim() || !newSessionTimeSlot.trim()}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 font-bold text-white shadow-xs"
                >
                  {savingSession ? 'Adding...' : 'Add Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ACADEMIC SESSION MODAL (IFrame-safe, Teachers & Admins Only) */}
      {sessionToDelete && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900">Remove Academic Session?</h3>
                <p className="text-[11px] text-slate-500">Scheduled on {selectedDate}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Remove <strong className="text-slate-900">&quot;{sessionToDelete.subject}&quot;</strong> ({sessionToDelete.timeSlot}) from the {selectedDate} academic sessions list?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900">Remove Class Cohort?</h3>
                <p className="text-[11px] text-slate-500">Teachers &amp; Admins Only</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove the class cohort <strong className="text-slate-900">&quot;{cohortToDelete.name}&quot;</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCohortToDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
    </div>
  );
};
