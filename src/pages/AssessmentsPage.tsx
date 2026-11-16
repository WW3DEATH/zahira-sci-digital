import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Plus,
  Download,
  CheckCircle2,
  FileText,
  ShieldCheck,
  X,
  Eye,
  Sparkles,
  BookOpen,
  Check,
  Trash2,
  Search,
  ClipboardList,
  Users,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { AcademicTest, TestMark, Subject, RosterStudent } from '../types';
import { SEED_TESTS, SEED_SUBJECTS, isFakeSeedRosterStudent } from '../services/dataService';
import { PDFPreviewModal, PDFPreviewData } from '../components/common/PDFPreviewModal';
import {
  LiveMorphIcon,
  LivePaperScannerGraphic,
  LiveOrbitalScienceGraphic,
} from '../components/common/LiveVisuals';

interface ActiveReportSubject {
  id: string;
  fullName: string;
  indexNumber: string;
  classId?: string;
}

const DEFAULT_SUBJECT_OPTIONS = [
  'Combined Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Information & Communication Technology',
  'General English',
];

export const AssessmentsPage: React.FC = () => {
  const { activeRole, userProfile } = useAuth();
  const isTeacherOrAdmin = activeRole === 'teacher' || activeRole === 'admin';

  const [tests, setTests] = useState<AcademicTest[]>(SEED_TESTS);
  const [testMarks, setTestMarks] = useState<TestMark[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(SEED_SUBJECTS);
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  const [previewData, setPreviewData] = useState<PDFPreviewData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Active tab: 'batch_entry' (teachers/admins) | 'report_card' | 'tests'
  const [activeTab, setActiveTab] = useState<'batch_entry' | 'report_card' | 'tests'>(
    isTeacherOrAdmin ? 'batch_entry' : 'report_card'
  );

  // Schedule Examination Modal (optional upcoming exam scheduling without marks)
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);

  // Keep non-teachers off teacher/admin-only batch entry & exam creation controls
  useEffect(() => {
    if (!isTeacherOrAdmin) {
      if (activeTab === 'batch_entry') setActiveTab('report_card');
      if (showCreateTestModal) setShowCreateTestModal(false);
    }
  }, [isTeacherOrAdmin, activeTab, showCreateTestModal]);
  const [newTestTitle, setNewTestTitle] = useState('');
  const [newTestSubject, setNewTestSubject] = useState('Combined Mathematics');
  const [newTestMax, setNewTestMax] = useState(100);
  const [newTestDate, setNewTestDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newTestTerm, setNewTestTerm] = useState('Term 1 (2026)');

  // Batch Mark Entry Workspace State (Topic/Exam + All Synced Bulk Students)
  const [batchMode, setBatchMode] = useState<'new' | 'existing'>('new');
  const [batchSelectedTestId, setBatchSelectedTestId] = useState('');
  const [batchExamTitle, setBatchExamTitle] = useState('');
  const [batchSubject, setBatchSubject] = useState('Combined Mathematics');
  const [batchMaxMarks, setBatchMaxMarks] = useState<number>(100);
  const [batchTerm, setBatchTerm] = useState('Term 1 (2026)');
  const [batchExamDate, setBatchExamDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchMarksMap, setBatchMarksMap] = useState<Record<string, string>>({});
  const [batchFeedbackMap, setBatchFeedbackMap] = useState<Record<string, string>>({});
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Selected Student for Report Card (strictly from bulk-added attendanceRoster for teachers/admins)
  const [selectedReportStudentId, setSelectedReportStudentId] = useState('');

  // Real-time tests listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tests'),
      (snap) => {
        const list: AcademicTest[] = [];
        snap.forEach((d) => list.push(d.data() as AcademicTest));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setTests(list.length > 0 ? list : SEED_TESTS);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'tests');
      }
    );
    return () => unsub();
  }, []);

  // Real-time testMarks listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'testMarks'),
      (snap) => {
        const list: TestMark[] = [];
        snap.forEach((d) => list.push(d.data() as TestMark));
        setTestMarks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'testMarks');
      }
    );
    return () => unsub();
  }, []);

  // Real-time subjects listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subjects'), (snap) => {
      const list: Subject[] = [];
      snap.forEach((d) => list.push(d.data() as Subject));
      if (list.length > 0) setSubjects(list);
    });
    return () => unsub();
  }, []);

  // Real-time listener strictly for Bulk-Added Roll-Call Students (`attendanceRoster`)
  // Strictly restricted to Teachers & Admins; intentionally does NOT sync website accounts (`userProfiles`)
  useEffect(() => {
    if (!isTeacherOrAdmin) {
      setRosterStudents([]);
      setLoadingRoster(false);
      return;
    }

    setLoadingRoster(true);
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
          if (data?.fullName) {
            list.push({ ...data, id: d.id });
          }
        });

        list.sort((a, b) => {
          const idxCmp = (a.indexNumber || '').localeCompare(b.indexNumber || '', undefined, {
            numeric: true,
          });
          return idxCmp !== 0 ? idxCmp : (a.fullName || '').localeCompare(b.fullName || '');
        });

        setRosterStudents(list);
        setLoadingRoster(false);
      },
      (error) => {
        setLoadingRoster(false);
        handleFirestoreError(error, OperationType.LIST, 'attendanceRoster');
      }
    );
    return () => unsub();
  }, [isTeacherOrAdmin]);

  // Keep selected report card student synced to valid bulk-added roster students
  useEffect(() => {
    if (rosterStudents.length === 0) {
      if (selectedReportStudentId) setSelectedReportStudentId('');
      return;
    }
    if (!selectedReportStudentId || !rosterStudents.some((s) => s.id === selectedReportStudentId)) {
      setSelectedReportStudentId(rosterStudents[0].id);
    }
  }, [rosterStudents, selectedReportStudentId]);

  // Subject dropdown options combining defaults and Firestore subjects
  const subjectOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_SUBJECT_OPTIONS);
    subjects.forEach((s) => {
      if (s.name) set.add(s.name);
    });
    return Array.from(set);
  }, [subjects]);

  // Helper: populate batch marks table from an existing exam (Teacher & Admin only)
  const populateBatchFromExistingTest = (testId: string) => {
    if (!isTeacherOrAdmin) return;
    const foundTest = tests.find((t) => t.id === testId);
    if (!foundTest) return;

    const existingForTest = testMarks.filter((m) => m.testId === testId);
    const nextMarks: Record<string, string> = {};
    const nextFeedback: Record<string, string> = {};

    rosterStudents.forEach((student) => {
      const match = existingForTest.find(
        (m) =>
          m.studentId === student.id ||
          (student.indexNumber &&
            m.studentIndex &&
            m.studentIndex.trim() === student.indexNumber.trim()) ||
          m.studentName.trim().toLowerCase() === student.fullName.trim().toLowerCase()
      );
      if (match) {
        nextMarks[student.id] = String(match.marksObtained);
        if (match.feedback) nextFeedback[student.id] = match.feedback;
      }
    });

    setBatchMarksMap(nextMarks);
    setBatchFeedbackMap(nextFeedback);
    setBatchError(null);
  };

  // Re-sync existing exam marks into inputs when switching existing exam selection
  useEffect(() => {
    if (batchMode === 'existing' && batchSelectedTestId) {
      populateBatchFromExistingTest(batchSelectedTestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchMode, batchSelectedTestId, rosterStudents.length]);

  const activeExistingTest = useMemo(
    () => (batchMode === 'existing' ? tests.find((t) => t.id === batchSelectedTestId) || null : null),
    [batchMode, tests, batchSelectedTestId]
  );

  const effectiveMaxMarks = activeExistingTest
    ? activeExistingTest.maxMarks || 100
    : Math.max(1, Number(batchMaxMarks) || 100);

  const effectiveExamTitle = activeExistingTest ? activeExistingTest.title : batchExamTitle.trim();
  const effectiveSubject = activeExistingTest ? activeExistingTest.subjectId : batchSubject;

  const filteredBatchStudents = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return rosterStudents;
    return rosterStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.indexNumber || '').toLowerCase().includes(q)
    );
  }, [rosterStudents, batchSearch]);

  const enteredBatchCount = useMemo(() => {
    return rosterStudents.filter((s) => {
      const val = (batchMarksMap[s.id] ?? '').trim();
      return val !== '' && !Number.isNaN(Number(val));
    }).length;
  }, [rosterStudents, batchMarksMap]);

  const handleOpenBatchForExistingTest = (exam: AcademicTest) => {
    if (!isTeacherOrAdmin) return;
    setBatchMode('existing');
    setBatchSelectedTestId(exam.id);
    setBatchError(null);
    setActiveTab('batch_entry');
    // Pre-fill immediately
    const existingForTest = testMarks.filter((m) => m.testId === exam.id);
    const nextMarks: Record<string, string> = {};
    const nextFeedback: Record<string, string> = {};
    rosterStudents.forEach((student) => {
      const match = existingForTest.find(
        (m) =>
          m.studentId === student.id ||
          (student.indexNumber &&
            m.studentIndex &&
            m.studentIndex.trim() === student.indexNumber.trim()) ||
          m.studentName.trim().toLowerCase() === student.fullName.trim().toLowerCase()
      );
      if (match) {
        nextMarks[student.id] = String(match.marksObtained);
        if (match.feedback) nextFeedback[student.id] = match.feedback;
      }
    });
    setBatchMarksMap(nextMarks);
    setBatchFeedbackMap(nextFeedback);
  };

  const handleStartNewExamBatch = () => {
    if (!isTeacherOrAdmin) return;
    setBatchMode('new');
    setBatchSelectedTestId('');
    setBatchExamTitle('');
    setBatchMarksMap({});
    setBatchFeedbackMap({});
    setBatchError(null);
    setActiveTab('batch_entry');
  };

  const handleSaveBatchMarks = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isTeacherOrAdmin) return;
    setBatchError(null);

    if (rosterStudents.length === 0) {
      setBatchError(
        'No bulk-added students found in Attendance Roster. Add students in Attendance Register first.'
      );
      return;
    }

    if (batchMode === 'new' && !batchExamTitle.trim()) {
      setBatchError('Please enter an Examination or Topic title before saving.');
      return;
    }

    if (batchMode === 'existing' && !batchSelectedTestId) {
      setBatchError('Please select an existing examination or switch to Create New Exam / Topic.');
      return;
    }

    // Validate numeric entries
    for (const student of rosterStudents) {
      const raw = (batchMarksMap[student.id] ?? '').trim();
      if (raw === '') continue;
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0 || num > effectiveMaxMarks) {
        setBatchError(
          `Invalid mark "${raw}" for ${student.fullName}. Marks must be between 0 and ${effectiveMaxMarks}.`
        );
        return;
      }
    }

    if (enteredBatchCount === 0 && batchMode === 'new') {
      setBatchError('Enter marks for at least one student to save this assessment.');
      return;
    }

    setIsSavingBatch(true);
    try {
      let targetTestId = batchSelectedTestId;
      let targetClassId = 'general';
      let targetSubject = batchSubject;
      let targetMaxMarks = Math.max(1, Number(batchMaxMarks) || 100);
      let targetTitle = batchExamTitle.trim();

      if (batchMode === 'new') {
        targetTestId = `test-${Date.now()}`;
        const newTestDoc: AcademicTest = {
          id: targetTestId,
          title: targetTitle,
          classId: 'general',
          subjectId: targetSubject,
          teacherId: userProfile?.userId || 'faculty',
          examDate: batchExamDate || new Date().toISOString().split('T')[0],
          maxMarks: targetMaxMarks,
          term: batchTerm.trim() || 'Term 1 (2026)',
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'tests', targetTestId), sanitizeFirestoreDoc(newTestDoc));
      } else if (activeExistingTest) {
        targetTestId = activeExistingTest.id;
        targetClassId = activeExistingTest.classId || 'general';
        targetSubject = activeExistingTest.subjectId || batchSubject;
        targetMaxMarks = activeExistingTest.maxMarks || 100;
        targetTitle = activeExistingTest.title;
      }

      const nowIso = new Date().toISOString();
      const writePromises: Promise<void>[] = [];
      let savedCount = 0;

      rosterStudents.forEach((student) => {
        const raw = (batchMarksMap[student.id] ?? '').trim();
        const markId = `mark-${targetTestId}-${student.id}`;

        if (raw !== '' && !Number.isNaN(Number(raw))) {
          const score = Math.max(0, Math.min(Number(raw), targetMaxMarks));
          const markDoc: TestMark = {
            id: markId,
            testId: targetTestId,
            studentId: student.id,
            studentName: student.fullName,
            studentIndex: student.indexNumber || '',
            classId: student.classId || targetClassId,
            subjectId: targetSubject,
            marksObtained: score,
            maxMarks: targetMaxMarks,
            feedback: (batchFeedbackMap[student.id] || '').trim(),
            createdAt: nowIso,
          };
          writePromises.push(
            setDoc(doc(db, 'testMarks', markId), sanitizeFirestoreDoc(markDoc))
          );
          savedCount += 1;
        } else if (batchMode === 'existing') {
          // If an existing mark row for this student & test was explicitly cleared to blank, remove it
          const existingDoc = testMarks.find(
            (m) =>
              m.testId === targetTestId &&
              (m.studentId === student.id ||
                m.studentName.trim().toLowerCase() === student.fullName.trim().toLowerCase())
          );
          if (existingDoc) {
            writePromises.push(deleteDoc(doc(db, 'testMarks', existingDoc.id)));
          }
        }
      });

      await Promise.all(writePromises);

      setBatchMode('existing');
      setBatchSelectedTestId(targetTestId);
      setStatusToast(
        `Saved marks for ${savedCount} student${savedCount === 1 ? '' : 's'} under "${targetTitle}". Synced to Report Cards & Student Trends.`
      );
      setTimeout(() => setStatusToast(null), 5000);
    } catch (err) {
      console.error('Failed to batch save marks:', err);
      setBatchError('Could not save marks to Firestore. Please try again.');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleCreateTest = async () => {
    if (!newTestTitle.trim() || !isTeacherOrAdmin) return;
    try {
      const id = `test-${Date.now()}`;
      const newT: AcademicTest = {
        id,
        title: newTestTitle.trim(),
        classId: 'general',
        subjectId: newTestSubject,
        teacherId: userProfile?.userId || 'faculty',
        examDate: newTestDate,
        maxMarks: newTestMax,
        term: newTestTerm,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'tests', id), sanitizeFirestoreDoc(newT));
      setShowCreateTestModal(false);
      setNewTestTitle('');
      setStatusToast(`Examination "${newT.title}" scheduled successfully.`);
      setTimeout(() => setStatusToast(null), 4000);
    } catch (e) {
      console.error('Failed to create test:', e);
    }
  };

  // Delete an uploaded mark
  const handleDeleteMark = async (markId: string) => {
    if (!isTeacherOrAdmin) return;
    try {
      await deleteDoc(doc(db, 'testMarks', markId));
      setStatusToast('Assessment mark removed.');
      setTimeout(() => setStatusToast(null), 3500);
    } catch (err) {
      console.error('Failed to delete mark:', err);
    }
  };

  // Resolve active student for Report Card tab:
  // Teachers/Admins view synced bulk-added roster students ONLY; Students/Parents view their own profile.
  const activeStudent: ActiveReportSubject | null = useMemo(() => {
    if (isTeacherOrAdmin) {
      const found = rosterStudents.find((s) => s.id === selectedReportStudentId) || rosterStudents[0];
      if (!found) return null;
      return {
        id: found.id,
        fullName: found.fullName,
        indexNumber: found.indexNumber || '—',
        classId: found.classId,
      };
    }

    if (userProfile) {
      return {
        id: userProfile.userId,
        fullName: userProfile.fullName,
        indexNumber: userProfile.indexNumber || '—',
      };
    }

    return null;
  }, [isTeacherOrAdmin, rosterStudents, selectedReportStudentId, userProfile]);

  // Match student marks strictly by roster/user ID, indexNumber, or exact name (case-insensitive)
  const studentMarks = useMemo(() => {
    if (!activeStudent) return [];
    const targetName = activeStudent.fullName.trim().toLowerCase();
    const targetIndex =
      activeStudent.indexNumber && activeStudent.indexNumber !== '—'
        ? activeStudent.indexNumber.trim()
        : '';

    return testMarks.filter(
      (m) =>
        m.studentId === activeStudent.id ||
        (targetIndex && m.studentIndex && m.studentIndex.trim() === targetIndex) ||
        (targetName && m.studentName && m.studentName.trim().toLowerCase() === targetName)
    );
  }, [testMarks, activeStudent]);

  const totalScore = studentMarks.reduce((sum, m) => sum + m.marksObtained, 0);
  const totalMax = studentMarks.reduce((sum, m) => sum + m.maxMarks, 0);
  const hasUploadedMarks = studentMarks.length > 0;
  const averagePercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  const getLetterGrade = (percent: number, hasMarks = true) => {
    if (!hasMarks) return '—';
    if (percent >= 90) return 'A';
    if (percent >= 80) return 'B';
    if (percent >= 70) return 'C';
    if (percent >= 60) return 'S';
    return 'F';
  };

  const getStanding = (percent: number) => {
    if (!hasUploadedMarks) return 'Pending Examination Marks Release';
    if (percent >= 90) return 'Distinction Honors (Island Top Tier)';
    if (percent >= 80) return 'Very Good Pass (University Track)';
    if (percent >= 70) return 'Credit Pass';
    if (percent >= 60) return 'Ordinary Pass';
    return 'Re-assessment Recommended';
  };

  // Generate High-Fidelity Certified Academic Performance PDF
  const generateAcademicPerformancePDF = (): jsPDF => {
    const studentName = activeStudent?.fullName || 'Science Scholar';
    const studentIndex = activeStudent?.indexNumber || '—';

    const pdf = new jsPDF();

    // 1. Header Banner & Letterhead
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.setTextColor(15, 23, 42);
    pdf.text('ZAHIRA COLLEGE MAWANELLA • 2K28 SCIENCE EM', 20, 20);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(30, 64, 175);
    pdf.text('ZNC SCIENCE PROJECT • ACADEMIC EXAMINATION DIRECTORATE', 20, 26);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text('G.C.E. ADVANCED LEVEL OFFICIAL ACADEMIC PERFORMANCE TRANSCRIPT & REPORT CARD', 20, 31);
    pdf.text('Mawanella, Sabaragamuwa Province, Sri Lanka • Certified Institutional Assessment Digest', 20, 35);

    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.6);
    pdf.line(20, 39, 190, 39);

    // 2. Candidate Information Card
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, 43, 170, 28, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(20, 43, 170, 28, 2, 2, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('STUDENT SCHOLAR:', 24, 50);
    pdf.text('STUDENT INDEX / ID:', 24, 57);
    pdf.text('BATCH & COHORT:', 24, 64);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 64, 175);
    pdf.text(studentName.toUpperCase(), 65, 50);
    pdf.setTextColor(51, 65, 85);
    pdf.text(studentIndex, 65, 57);
    pdf.text('2k28 Science EM (Combined Maths & Bio Science)', 65, 64);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('ACADEMIC TERM:', 118, 50);
    pdf.text('CERTIFIED AVERAGE:', 118, 57);
    pdf.text('LETTER GRADE:', 118, 64);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    pdf.text('Term 1 (2026-2028)', 160, 50);
    if (hasUploadedMarks) {
      pdf.setTextColor(22, 101, 52);
      pdf.text(`${averagePercent}%`, 160, 57);
      pdf.text(`Grade ${getLetterGrade(averagePercent)}`, 160, 64);
    } else {
      pdf.setTextColor(148, 163, 184);
      pdf.text('PENDING', 160, 57);
      pdf.text('PENDING', 160, 64);
    }

    // 3. Performance Summary Ribbon
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(20, 75, 170, 10, 1.5, 1.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 64, 175);
    pdf.text(`OFFICIAL ACADEMIC STANDING: ${getStanding(averagePercent).toUpperCase()}`, 24, 81.5);

    // 4. Detailed Exam & Assessment Marks Table
    let y = 92;
    pdf.setFillColor(241, 245, 249);
    pdf.rect(20, y, 170, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    pdf.text('EXAMINATION / ASSESSMENT TITLE', 24, y + 5.5);
    pdf.text('ACADEMIC TERM', 95, y + 5.5);
    pdf.text('MAX', 125, y + 5.5);
    pdf.text('MARKS', 140, y + 5.5);
    pdf.text('PCT %', 158, y + 5.5);
    pdf.text('GRADE', 174, y + 5.5);

    y += 13;

    if (studentMarks.length === 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text('No examination marks officially released or evaluated yet for this candidate.', 24, y + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        'Uploaded marks from faculty evaluations will automatically populate this transcript upon release.',
        24,
        y + 12
      );
      y += 24;
    } else {
      studentMarks.forEach((mk, idx) => {
        if (y > 240) {
          pdf.addPage();
          y = 25;
        }

        const testObj = tests.find((t) => t.id === mk.testId);
        const testTitle = testObj?.title || mk.subjectId || `Examination Paper 0${idx + 1}`;
        const termTitle = testObj?.term || 'Term 1 (2026)';
        const pct = mk.maxMarks > 0 ? Math.round((mk.marksObtained / mk.maxMarks) * 100) : 0;
        const grade = getLetterGrade(pct);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(15, 23, 42);
        pdf.text(testTitle, 24, y);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(71, 85, 105);
        pdf.text(termTitle, 95, y);
        pdf.text(String(mk.maxMarks), 125, y);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 64, 175);
        pdf.text(String(mk.marksObtained), 140, y);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(51, 65, 85);
        pdf.text(`${pct}%`, 158, y);

        if (grade === 'A') pdf.setTextColor(22, 101, 52);
        else if (grade === 'B') pdf.setTextColor(30, 64, 175);
        else pdf.setTextColor(180, 83, 9);
        pdf.setFont('helvetica', 'bold');
        pdf.text(grade, 176, y);

        if (mk.feedback) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Faculty Evaluator Remark: ${mk.feedback}`, 24, y + 4.5);
        }

        pdf.setDrawColor(241, 245, 249);
        pdf.line(20, y + 7, 190, y + 7);

        y += 13;
      });
    }

    if (y > 235) {
      pdf.addPage();
      y = 25;
    }

    y += 4;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, y, 170, 20, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(20, y, 170, 20, 2, 2, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('INSTITUTIONAL VERIFICATION & ACADEMIC COMPLIANCE:', 24, y + 6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(
      `• Official Evaluated Records Included: ${studentMarks.length} Verified Examination${studentMarks.length === 1 ? '' : 's'}`,
      24,
      y + 11
    );
    pdf.text(
      '• G.C.E. A/L Science Stream • Zahira College Mawanella • Hall 28 Digital Assessment Registry',
      24,
      y + 16
    );

    y += 28;

    pdf.setDrawColor(203, 213, 225);
    pdf.line(20, y, 190, y);
    y += 7;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('CERTIFIED AND SEALED BY ACADEMIC DIRECTORATE:', 20, y);

    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 64, 175);
    pdf.text('ZNC Science Project Management • Zahira College Mawanella', 20, y);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `Verified Academic Transcript • Generated for ${studentName} on ${new Date().toLocaleString()}`,
      20,
      y + 5
    );

    pdf.setDrawColor(148, 163, 184);
    pdf.line(130, y + 2, 190, y + 2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text('ZNC Science Project Management', 130, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Zahira College 2k28 Science EM', 133, y + 10);

    return pdf;
  };

  const handleExportPDF = () => {
    if (!activeStudent) return;
    try {
      const pdf = generateAcademicPerformancePDF();
      const filename = `ZNC_Academic_Performance_${activeStudent.fullName.replace(/\s+/g, '_')}_2k28_Science.pdf`;
      pdf.save(filename);
      setStatusToast(`Downloaded academic performance PDF for ${activeStudent.fullName}.`);
      setTimeout(() => setStatusToast(null), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreviewPDF = () => {
    if (!activeStudent) return;
    try {
      const pdf = generateAcademicPerformancePDF();
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      setPreviewData({
        title: `Official Academic Performance: ${activeStudent.fullName}`,
        subtitle: 'ZNC Science Project • Zahira College 2k28 Science EM Report Card',
        category: 'Academic Performance PDF',
        filename: `ZNC_Academic_Performance_${activeStudent.fullName.replace(/\s+/g, '_')}_2k28_Science.pdf`,
        blobUrl,
        blob,
      });
      setIsPreviewOpen(true);
    } catch (e) {
      console.error('Preview error:', e);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Marks &amp; Assessments
            </h2>
            {isTeacherOrAdmin ? (
              <span className="rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-2.5 py-0.5 text-[11px] font-bold border border-blue-200 dark:border-blue-800 tabular-nums">
                {rosterStudents.length} Synced Roster Student{rosterStudents.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="rounded-md bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 px-2.5 py-0.5 text-[11px] font-bold border border-stone-200 dark:border-slate-700 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Read-Only Student Transcript</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isTeacherOrAdmin
              ? 'Bulk-added roll-call students sync automatically from the Attendance Roster • Certified G.C.E. A/L Report Cards & Transcripts'
              : 'Official G.C.E. A/L performance records & downloadable certified transcripts (exam creation and mark entry are restricted to Teachers & Admins)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isTeacherOrAdmin && (
            <>
              <button
                onClick={handleStartNewExamBatch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-900 hover:bg-indigo-800 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-xs shrink-0"
              >
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>Create Exam &amp; Enter Marks</span>
              </button>

              <button
                onClick={() => setShowCreateTestModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all shadow-2xs shrink-0"
              >
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Schedule Exam</span>
              </button>
            </>
          )}

          {activeStudent && (
            <>
              <button
                onClick={handlePreviewPDF}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-4 py-2.5 text-xs font-bold text-blue-900 dark:text-blue-200 transition-all shadow-2xs shrink-0"
              >
                <Eye className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                <span>Preview PDF</span>
              </button>

              <button
                onClick={handleExportPDF}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md shrink-0"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Download PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Toast */}
      {statusToast && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{statusToast}</span>
          </div>
          <button
            onClick={() => setStatusToast(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        {isTeacherOrAdmin && (
          <button
            onClick={() => setActiveTab('batch_entry')}
            className={`rounded-lg px-4 py-2 transition-colors inline-flex items-center gap-1.5 ${
              activeTab === 'batch_entry'
                ? 'bg-blue-600 text-white shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Create Exam &amp; Enter All Marks</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('report_card')}
          className={`rounded-lg px-4 py-2 transition-colors inline-flex items-center gap-1.5 ${
            activeTab === 'report_card'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Official Report Card &amp; Transcript</span>
        </button>

        <button
          onClick={() => setActiveTab('tests')}
          className={`rounded-lg px-4 py-2 transition-colors inline-flex items-center gap-1.5 ${
            activeTab === 'tests'
              ? 'bg-blue-600 text-white shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Scheduled Examinations ({tests.length})</span>
        </button>
      </div>

      {/* TAB 1: TEACHER BATCH MARK ENTRY (CREATE EXAM/TOPIC + ALL BULK STUDENTS) */}
      {activeTab === 'batch_entry' && isTeacherOrAdmin && (
        <form onSubmit={handleSaveBatchMarks} className="space-y-5">
          {/* Exam / Topic Configuration Panel */}
          <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                  1. Examination / Topic Details
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Create a new exam topic or select an existing assessment, then enter marks for every bulk-added student below.
                </p>
              </div>

              <div className="inline-flex rounded-xl bg-stone-100 dark:bg-slate-800 p-1 text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setBatchMode('new');
                    setBatchSelectedTestId('');
                    setBatchMarksMap({});
                    setBatchFeedbackMap({});
                    setBatchError(null);
                  }}
                  className={`rounded-lg px-3.5 py-1.5 transition-all ${
                    batchMode === 'new'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 font-bold shadow-2xs'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  + New Exam / Topic
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBatchMode('existing');
                    const fallbackId = batchSelectedTestId || tests[0]?.id || '';
                    if (fallbackId) {
                      setBatchSelectedTestId(fallbackId);
                    }
                    setBatchError(null);
                  }}
                  className={`rounded-lg px-3.5 py-1.5 transition-all ${
                    batchMode === 'existing'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 font-bold shadow-2xs'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  Existing Exam ({tests.length})
                </button>
              </div>
            </div>

            {batchMode === 'existing' ? (
              tests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/50 p-4 text-xs text-stone-600 dark:text-slate-300 flex items-center justify-between gap-3">
                  <span>No examinations created yet. Switch to &ldquo;+ New Exam / Topic&rdquo; to create one right now.</span>
                  <button
                    type="button"
                    onClick={() => setBatchMode('new')}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-white font-bold shrink-0"
                  >
                    Create Exam
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="md:col-span-2">
                    <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                      Select Scheduled Exam / Topic
                    </label>
                    <select
                      value={batchSelectedTestId}
                      onChange={(e) => setBatchSelectedTestId(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      {tests.map((t) => {
                        const countForTest = testMarks.filter((m) => m.testId === t.id).length;
                        return (
                          <option key={t.id} value={t.id}>
                            {t.title} — {t.subjectId} (Max: {t.maxMarks} • {countForTest} saved)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                      Exam Metadata
                    </label>
                    <div className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/60 px-3 py-2.5 text-stone-700 dark:text-slate-300 font-medium tabular-nums">
                      Max: <strong>{effectiveMaxMarks}</strong> • {activeExistingTest?.term || 'Term 1'} •{' '}
                      {activeExistingTest?.examDate || 'Scheduled'}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                <div className="md:col-span-5">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                    Exam / Topic Title *
                  </label>
                  <input
                    type="text"
                    value={batchExamTitle}
                    onChange={(e) => setBatchExamTitle(e.target.value)}
                    placeholder="e.g. Unit Test 01: Kinematics & Vectors"
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                    Subject
                  </label>
                  <select
                    value={batchSubject}
                    onChange={(e) => setBatchSubject(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    {subjectOptions.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                    Max Marks
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={batchMaxMarks}
                    onChange={(e) => setBatchMaxMarks(parseInt(e.target.value, 10) || 100)}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                    Exam Date
                  </label>
                  <input
                    type="date"
                    value={batchExamDate}
                    onChange={(e) => setBatchExamDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="font-semibold text-stone-700 dark:text-slate-300 uppercase tracking-wider block mb-1.5 text-[11px]">
                    Academic Term
                  </label>
                  <input
                    type="text"
                    value={batchTerm}
                    onChange={(e) => setBatchTerm(e.target.value)}
                    placeholder="Term 1 (2026)"
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {batchError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3.5 text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span className="font-semibold">{batchError}</span>
              </div>
              <button type="button" onClick={() => setBatchError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Synced Bulk Students Mark Sheet */}
          <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="bg-stone-50 dark:bg-slate-800/70 px-5 py-4 border-b border-stone-200 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">
                    2. Synced Bulk Students Mark Sheet
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Showing bulk-added roll-call students only ({enteredBatchCount} / {rosterStudents.length} marks entered) • Website login accounts are excluded
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-60">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    placeholder="Search student or index..."
                    className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-2 text-xs text-stone-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                {rosterStudents.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchMarksMap({});
                        setBatchFeedbackMap({});
                      }}
                      className="rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-stone-600 dark:text-slate-300 transition-colors"
                    >
                      Clear Inputs
                    </button>

                    <button
                      type="submit"
                      disabled={isSavingBatch}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors"
                    >
                      {isSavingBatch ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>{isSavingBatch ? 'Saving...' : `Save Marks (${enteredBatchCount})`}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingRoster ? (
              <div className="p-12 text-center text-xs text-stone-500 dark:text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span>Syncing bulk-added student roster...</span>
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="p-12 text-center max-w-lg mx-auto">
                <Users className="w-10 h-10 text-stone-300 dark:text-slate-600 mx-auto mb-3" />
                <h4 className="font-serif text-base font-bold text-stone-800 dark:text-slate-100">
                  No bulk-added students synced yet
                </h4>
                <p className="text-xs text-stone-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Add or bulk-import students in the <strong>Attendance Register</strong> to make every student appear here automatically. Website user accounts are intentionally kept separate and not synced into this mark sheet.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[740px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-slate-700 bg-stone-50/80 dark:bg-slate-800/40 text-stone-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4 w-32">Index No.</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4 w-44">Marks Scored (/{effectiveMaxMarks})</th>
                        <th className="py-3 px-4 w-32">Pct &amp; Grade</th>
                        <th className="py-3 px-4">Remark / Feedback (Optional)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
                      {filteredBatchStudents.map((student, idx) => {
                        const rawVal = batchMarksMap[student.id] ?? '';
                        const trimmed = rawVal.trim();
                        const hasNumber = trimmed !== '' && !Number.isNaN(Number(trimmed));
                        const numVal = hasNumber ? Number(trimmed) : 0;
                        const isOutOfRange = hasNumber && (numVal < 0 || numVal > effectiveMaxMarks);
                        const pct = hasNumber
                          ? Math.round((Math.max(0, Math.min(numVal, effectiveMaxMarks)) / effectiveMaxMarks) * 100)
                          : 0;
                        const grade = getLetterGrade(pct, hasNumber);

                        return (
                          <tr
                            key={student.id}
                            className="hover:bg-blue-50/30 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-4 text-stone-400 dark:text-slate-500 font-mono tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-semibold text-stone-600 dark:text-slate-300 tabular-nums">
                              {student.indexNumber || '—'}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-stone-900 dark:text-white">
                              {student.fullName}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={effectiveMaxMarks}
                                  step="any"
                                  value={rawVal}
                                  onChange={(e) =>
                                    setBatchMarksMap((prev) => ({
                                      ...prev,
                                      [student.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="—"
                                  className={`w-24 rounded-lg border px-2.5 py-1.5 font-bold text-sm tabular-nums focus:outline-none focus:ring-2 ${
                                    isOutOfRange
                                      ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-500/30'
                                      : 'border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 text-stone-900 dark:text-white focus:ring-blue-500/30 focus:border-blue-500'
                                  }`}
                                />
                                <span className="text-[11px] text-stone-400 dark:text-slate-500 tabular-nums">
                                  / {effectiveMaxMarks}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 tabular-nums">
                              {hasNumber ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                    {pct}%
                                  </span>
                                  <span
                                    className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                                      grade === 'A'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                                        : grade === 'B'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                                        : grade === 'C' || grade === 'S'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                    }`}
                                  >
                                    {grade}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-stone-400 dark:text-slate-500">
                                  Not entered
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={batchFeedbackMap[student.id] ?? ''}
                                onChange={(e) =>
                                  setBatchFeedbackMap((prev) => ({
                                    ...prev,
                                    [student.id]: e.target.value,
                                  }))
                                }
                                placeholder="Optional remark..."
                                className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-stone-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Save Action Footer */}
                <div className="bg-stone-50 dark:bg-slate-800/70 px-5 py-4 border-t border-stone-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-stone-600 dark:text-slate-300">
                    Ready to save <strong className="tabular-nums">{enteredBatchCount}</strong> mark
                    {enteredBatchCount === 1 ? '' : 's'} for{' '}
                    <strong>{effectiveExamTitle || effectiveSubject}</strong>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingBatch}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-6 py-2.5 text-xs font-bold text-white shadow-sm transition-colors"
                  >
                    {isSavingBatch ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>
                      {isSavingBatch
                        ? 'Saving All Marks...'
                        : batchMode === 'new'
                        ? 'Save Exam & All Student Marks'
                        : 'Save All Updated Marks'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
      )}

      {/* TAB 2: OFFICIAL REPORT CARD & TRANSCRIPT */}
      {activeTab === 'report_card' && (
        <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-xs space-y-6">
          {/* Teacher/Admin Selector Strictly From Bulk-Added Attendance Roster */}
          {isTeacherOrAdmin && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-50 dark:bg-slate-800/70 border border-stone-200 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <span className="text-xs font-semibold text-stone-700 dark:text-slate-200">
                  Select Synced Roster Student:
                </span>
                {rosterStudents.length > 0 ? (
                  <select
                    value={selectedReportStudentId}
                    onChange={(e) => setSelectedReportStudentId(e.target.value)}
                    className="w-full sm:w-auto rounded-lg border border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-stone-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    {rosterStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} (Index: {s.indexNumber || 'N/A'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                    No bulk-added students found yet. Add students in Attendance Register.
                  </span>
                )}
              </div>

              <button
                onClick={handleStartNewExamBatch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Enter Marks for Class</span>
              </button>
            </div>
          )}

          {!activeStudent ? (
            <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/40 p-12 text-center">
              <LivePaperScannerGraphic accent="amber" className="w-20 h-20 mx-auto mb-2" />
              <h3 className="font-serif text-base font-bold text-stone-800 dark:text-slate-100">
                No Bulk-Added Students Synced Yet
              </h3>
              <p className="text-xs text-stone-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Add or bulk-import students in the Attendance Register to view individual report cards and enter exam marks.
              </p>
            </div>
          ) : (
            <>
              {/* STUDENT HERO PERFORMANCE CARD */}
              <div className="live-gradient-banner relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
                <LiveOrbitalScienceGraphic className="w-24 h-24 opacity-20 pointer-events-none hidden lg:block absolute right-6 top-3" />
                <div className="space-y-1 relative z-10">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 border border-blue-400/30">
                    <LiveMorphIcon icons={[Sparkles, Award, ShieldCheck]} intervalMs={2300} className="w-3.5 h-3.5 text-amber-300" />
                    <span>Certified G.C.E. A/L Academic Record</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold font-serif text-white mt-1">
                    {activeStudent.fullName}
                  </h3>
                  <p className="text-xs text-blue-200">
                    Student Index:{' '}
                    <span className="font-mono font-bold text-white tabular-nums">
                      {activeStudent.indexNumber}
                    </span>{' '}
                    • Zahira College 2k28 Science EM
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-xs tabular-nums">
                    <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
                      Overall Average: <strong>{hasUploadedMarks ? `${averagePercent}%` : 'Pending'}</strong>
                    </span>
                    <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-400/30 font-bold">
                      {hasUploadedMarks ? `Grade ${getLetterGrade(averagePercent)}` : 'Awaiting Evaluation'}
                    </span>
                    <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
                      Exams Recorded: <strong>{studentMarks.length}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 relative z-10">
                  <button
                    onClick={handlePreviewPDF}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-3 text-xs font-bold text-white transition-all shadow-xs"
                  >
                    <Eye className="w-4 h-4 text-blue-300" />
                    <span>Preview Document</span>
                  </button>

                  <button
                    onClick={handleExportPDF}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-600 px-5 py-3 text-xs font-bold text-white transition-all shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Report PDF</span>
                  </button>
                </div>
              </div>

              {/* Official Marks Table */}
              <div className="rounded-xl border border-stone-200 dark:border-slate-700 overflow-hidden shadow-2xs">
                <div className="bg-stone-50 dark:bg-slate-800/70 px-4 py-3 border-b border-stone-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-bold text-xs text-stone-900 dark:text-white uppercase tracking-wider">
                      Evaluated Subject Examinations
                    </h4>
                  </div>
                  <span className="text-[11px] text-stone-500 dark:text-slate-400 font-semibold tabular-nums">
                    {studentMarks.length} Record{studentMarks.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/40 text-stone-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Examination / Topic</th>
                        <th className="py-3 px-4">Subject</th>
                        <th className="py-3 px-4">Academic Term</th>
                        <th className="py-3 px-4">Marks Scored</th>
                        <th className="py-3 px-4">Max Score</th>
                        <th className="py-3 px-4">Percentage</th>
                        <th className="py-3 px-4">Grade</th>
                        <th className="py-3 px-4">Faculty Feedback</th>
                        {isTeacherOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {studentMarks.length > 0 ? (
                        studentMarks.map((m) => {
                          const testObj = tests.find((t) => t.id === m.testId);
                          const pct = m.maxMarks > 0 ? Math.round((m.marksObtained / m.maxMarks) * 100) : 0;
                          return (
                            <tr
                              key={m.id}
                              className="hover:bg-stone-50/50 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-white">
                                {testObj?.title || m.subjectId || 'Academic Assessment'}
                              </td>
                              <td className="py-3.5 px-4 text-stone-600 dark:text-slate-300">
                                {testObj?.subjectId || m.subjectId || 'Science'}
                              </td>
                              <td className="py-3.5 px-4 text-stone-500 dark:text-slate-400">
                                {testObj?.term || 'Term 1'}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                {m.marksObtained}
                              </td>
                              <td className="py-3.5 px-4 text-stone-500 dark:text-slate-400 tabular-nums">
                                {m.maxMarks}
                              </td>
                              <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                {pct}%
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 text-[11px]">
                                  {getLetterGrade(pct)}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-stone-600 dark:text-slate-300 max-w-xs truncate">
                                {m.feedback || 'Verified Record'}
                              </td>
                              {isTeacherOrAdmin && (
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => handleDeleteMark(m.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                    title="Delete Mark"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={isTeacherOrAdmin ? 9 : 8} className="py-12 px-4 text-center">
                            <div className="flex flex-col items-center justify-center text-stone-400 dark:text-slate-500">
                              <LivePaperScannerGraphic accent="emerald" className="w-20 h-20 mb-2" />
                              <p className="font-bold text-stone-700 dark:text-slate-200 text-sm">
                                No evaluated examination marks recorded yet for {activeStudent.fullName}.
                              </p>
                              <p className="text-xs text-stone-400 dark:text-slate-500 mt-1 max-w-md">
                                Marks entered under &ldquo;Create Exam &amp; Enter All Marks&rdquo; will appear here in real time and sync to the Report Card PDF.
                              </p>
                              {isTeacherOrAdmin && (
                                <button
                                  onClick={handleStartNewExamBatch}
                                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shadow-2xs"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Create Exam &amp; Enter Marks</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Institutional Certification Footer */}
              <div className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Certified and sealed by Zahira College 2k28 Science EM Academic Board.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-stone-800 dark:text-slate-100">
                    {hasUploadedMarks ? 'Term 1 Official Release' : 'Awaiting Examination Release'}
                  </span>
                  <button
                    onClick={handleExportPDF}
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save Copy</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: SCHEDULED EXAMINATIONS LIST */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          {tests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
              <LivePaperScannerGraphic accent="emerald" className="w-20 h-20 mx-auto mb-2" />
              <h3 className="font-serif text-base font-bold text-stone-800 dark:text-slate-100">
                No scheduled examinations yet
              </h3>
              <p className="text-xs text-stone-400 dark:text-slate-500 mt-1 max-w-md mx-auto">
                Create an exam topic and enter marks for all bulk-added students at once, or schedule an upcoming paper.
              </p>
              {isTeacherOrAdmin && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleStartNewExamBatch}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-2xs"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>Create Exam &amp; Enter All Marks</span>
                  </button>
                  <button
                    onClick={() => setShowCreateTestModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs hover:bg-slate-800 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Schedule Future Exam</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tests.map((t) => {
                const recordedCount = testMarks.filter((m) => m.testId === t.id).length;
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xs hover:border-stone-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="rounded bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 font-bold px-2 py-0.5 text-[10px] uppercase tabular-nums">
                          Max: {t.maxMarks} Marks
                        </span>
                        <span className="text-[11px] text-stone-400 dark:text-slate-500">{t.term}</span>
                      </div>

                      <h3 className="font-serif text-base font-bold text-stone-900 dark:text-white">
                        {t.title}
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-slate-400 mt-1 tabular-nums">
                        Exam Date: {t.examDate}
                      </p>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                        {t.subjectId || 'Science'}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      {isTeacherOrAdmin ? (
                        <>
                          <span className="text-[11px] font-semibold text-stone-500 dark:text-slate-400 tabular-nums">
                            {recordedCount} / {rosterStudents.length} Graded
                          </span>
                          <button
                            onClick={() => handleOpenBatchForExistingTest(t)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 dark:bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 dark:hover:bg-blue-700 transition-colors"
                          >
                            <ClipboardList className="w-3.5 h-3.5 text-amber-400 dark:text-white" />
                            <span>Enter / Edit Marks</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">
                          {studentMarks.some((m) => m.testId === t.id) ? 'Marks Released' : 'Awaiting Marks'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Schedule Exam Modal (Teacher/Admin) */}
      {showCreateTestModal && isTeacherOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-serif text-base font-bold text-stone-900 dark:text-white">
                Schedule Academic Examination
              </h3>
              <button
                onClick={() => setShowCreateTestModal(false)}
                className="rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-slate-800 text-stone-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-stone-600 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[11px]">
                  Exam / Topic Title
                </label>
                <input
                  type="text"
                  value={newTestTitle}
                  onChange={(e) => setNewTestTitle(e.target.value)}
                  placeholder="e.g. Combined Maths: Term 1 Final Paper"
                  className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-600 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[11px]">
                  Subject
                </label>
                <select
                  value={newTestSubject}
                  onChange={(e) => setNewTestSubject(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {subjectOptions.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-600 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[11px]">
                    Max Marks
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newTestMax}
                    onChange={(e) => setNewTestMax(parseInt(e.target.value, 10) || 100)}
                    className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-800 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-600 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[11px]">
                    Exam Date
                  </label>
                  <input
                    type="date"
                    value={newTestDate}
                    onChange={(e) => setNewTestDate(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-800 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-600 dark:text-slate-300 uppercase tracking-wider block mb-1 text-[11px]">
                  Term
                </label>
                <input
                  type="text"
                  value={newTestTerm}
                  onChange={(e) => setNewTestTerm(e.target.value)}
                  placeholder="Term 1 (2026)"
                  className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 p-2.5 text-stone-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCreateTestModal(false)}
                className="rounded-lg border border-stone-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTest}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-xs"
              >
                Save Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Interactive Preview Modal */}
      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfData={previewData}
      />
    </div>
  );
};
