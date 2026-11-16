import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Search,
  Plus,
  Trash2,
  Save,
  Download,
  Eye,
  Award,
  CheckCircle2,
  AlertCircle,
  Lock,
  Sparkles,
  Trophy,
  BookOpen,
  FileSpreadsheet,
  FlaskConical,
  Atom,
  ChevronRight,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc, handleFirestoreError, OperationType } from '../../firebase';
import {
  RosterStudent,
  StudentStream,
  TermExamReport,
  TermExamSubjectMark,
  UserProfile,
} from '../../types';
import { PDFPreviewData } from '../common/PDFPreviewModal';

interface TermExamMarksSectionProps {
  isTeacherOrAdmin: boolean;
  userProfile: UserProfile | null;
  rosterStudents: RosterStudent[];
  loadingRoster: boolean;
  subjectOptions: string[];
  onPreviewPDF: (data: PDFPreviewData) => void;
  onToast: (message: string) => void;
}

const DEFAULT_TERMS = [
  'Term 1 (2026)',
  'Term 2 (2027)',
  'Term 3 (2028)',
];

const BIO_DEFAULT_SUBJECTS = [
  'Biology',
  'Chemistry',
  'Physics',
  'General English',
];

const PHYSICAL_DEFAULT_SUBJECTS = [
  'Combined Mathematics',
  'Physics',
  'Chemistry',
  'Information & Communication Technology',
  'General English',
];

const slugifyTerm = (term: string): string =>
  term
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'term_1';

const getTermGrade = (pct: number): { grade: string; descriptor: string } => {
  if (pct >= 75) return { grade: 'A', descriptor: 'Distinction' };
  if (pct >= 65) return { grade: 'B', descriptor: 'Very Good Pass' };
  if (pct >= 55) return { grade: 'C', descriptor: 'Credit Pass' };
  if (pct >= 35) return { grade: 'S', descriptor: 'Ordinary Pass' };
  return { grade: 'F', descriptor: 'Needs Improvement' };
};

const formatOrdinal = (rank: number): string => {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
};

const getStreamLabel = (stream?: StudentStream): string => {
  if (stream === 'bio') return 'Bio Stream';
  if (stream === 'physical') return 'Physical Stream';
  return 'Unassigned Stream';
};

export const TermExamMarksSection: React.FC<TermExamMarksSectionProps> = ({
  isTeacherOrAdmin,
  userProfile,
  rosterStudents,
  loadingRoster,
  subjectOptions,
  onPreviewPDF,
  onToast,
}) => {
  const [termReports, setTermReports] = useState<TermExamReport[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>(DEFAULT_TERMS[0]);
  const [customTermInput, setCustomTermInput] = useState<string>('');
  const [streamViewFilter, setStreamViewFilter] = useState<'all' | 'bio' | 'physical'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Editable sheet state for the currently selected student (Teacher & Admin only)
  const [draftSubjects, setDraftSubjects] = useState<TermExamSubjectMark[]>([]);
  const [draftPosition, setDraftPosition] = useState<string>('');
  const [draftRemark, setDraftRemark] = useState<string>('');
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [newSubjectMarks, setNewSubjectMarks] = useState<string>('');
  const [newSubjectMax, setNewSubjectMax] = useState<string>('100');
  const [savingSheet, setSavingSheet] = useState<boolean>(false);
  const [rankingStreams, setRankingStreams] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Real-time listener for Term Exam Reports
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'termExamReports'),
      (snap) => {
        const list: TermExamReport[] = [];
        snap.forEach((d) => {
          const data = d.data() as TermExamReport;
          list.push({ ...data, id: d.id });
        });
        setTermReports(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'termExamReports');
      }
    );
    return () => unsub();
  }, []);

  const activeTerm = customTermInput.trim() || selectedTerm;
  const activeTermSlug = slugifyTerm(activeTerm);

  // Reports indexed by studentId for the selected term
  const reportsByStudentId = useMemo(() => {
    const map: Record<string, TermExamReport> = {};
    termReports.forEach((rep) => {
      if (slugifyTerm(rep.term) === activeTermSlug) {
        map[rep.studentId] = rep;
      }
    });
    return map;
  }, [termReports, activeTermSlug]);

  // All available term options (defaults + any custom terms stored in Firestore)
  const availableTerms = useMemo(() => {
    const set = new Set<string>(DEFAULT_TERMS);
    termReports.forEach((r) => {
      if (r.term?.trim()) set.add(r.term.trim());
    });
    return Array.from(set);
  }, [termReports]);

  // For students/parents: resolve their matched TermExamReport(s) read-only
  const personalReportsForViewer = useMemo(() => {
    if (isTeacherOrAdmin || !userProfile) return [];
    const targetName = (userProfile.fullName || '').trim().toLowerCase();
    const targetIndex = (userProfile.indexNumber || '').trim();
    return termReports.filter(
      (rep) =>
        rep.studentId === userProfile.userId ||
        (targetIndex && rep.studentIndex?.trim() === targetIndex) ||
        (targetName && rep.studentName?.trim().toLowerCase() === targetName)
    );
  }, [isTeacherOrAdmin, userProfile, termReports]);

  // Filter roster students by search query
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rosterStudents;
    return rosterStudents.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.indexNumber || '').toLowerCase().includes(q)
    );
  }, [rosterStudents, searchQuery]);

  // Separate synced Attendance Roster students by Bio Stream vs Physical Stream
  const bioStudents = useMemo(
    () => filteredStudents.filter((s) => s.stream === 'bio'),
    [filteredStudents]
  );
  const physicalStudents = useMemo(
    () => filteredStudents.filter((s) => s.stream === 'physical'),
    [filteredStudents]
  );
  const unassignedStudents = useMemo(
    () => filteredStudents.filter((s) => s.stream !== 'bio' && s.stream !== 'physical'),
    [filteredStudents]
  );

  // Auto-select first visible student if none selected or filtered out
  useEffect(() => {
    if (!isTeacherOrAdmin) return;
    if (rosterStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!selectedStudentId || !rosterStudents.some((s) => s.id === selectedStudentId)) {
      const firstBio = rosterStudents.find((s) => s.stream === 'bio');
      const firstPhysical = rosterStudents.find((s) => s.stream === 'physical');
      setSelectedStudentId((firstBio || firstPhysical || rosterStudents[0]).id);
    }
  }, [isTeacherOrAdmin, rosterStudents, selectedStudentId]);

  const selectedStudent = useMemo(
    () => rosterStudents.find((s) => s.id === selectedStudentId) || null,
    [rosterStudents, selectedStudentId]
  );

  const selectedExistingReport = selectedStudent
    ? reportsByStudentId[selectedStudent.id] || null
    : null;

  // Populate draft sheet whenever selected student, selected term, or saved report changes
  useEffect(() => {
    setSheetError(null);
    if (!selectedStudent) {
      setDraftSubjects([]);
      setDraftPosition('');
      setDraftRemark('');
      return;
    }
    if (selectedExistingReport) {
      setDraftSubjects(
        (selectedExistingReport.subjects || []).map((sub) => ({ ...sub }))
      );
      setDraftPosition(selectedExistingReport.position || '');
      setDraftRemark(selectedExistingReport.teacherRemark || '');
    } else {
      setDraftSubjects([]);
      setDraftPosition('');
      setDraftRemark('');
    }
    // Pre-fill suggested subject based on student's stream
    if (selectedStudent.stream === 'bio') {
      setNewSubjectName('Biology');
    } else if (selectedStudent.stream === 'physical') {
      setNewSubjectName('Combined Mathematics');
    } else {
      setNewSubjectName(subjectOptions[0] || 'Physics');
    }
    setNewSubjectMarks('');
    setNewSubjectMax('100');
  }, [selectedStudent?.id, activeTermSlug, selectedExistingReport, subjectOptions]);

  // Compute auto stream rank for each student with marks in Bio & Physical streams
  const autoRankMap = useMemo(() => {
    const map: Record<string, number> = {};
    (['bio', 'physical'] as const).forEach((streamKey) => {
      const candidates = rosterStudents
        .filter((s) => s.stream === streamKey)
        .map((s) => {
          const rep = reportsByStudentId[s.id];
          return rep && rep.subjects.length > 0
            ? { studentId: s.id, total: rep.totalMarks, avg: rep.average }
            : null;
        })
        .filter((x): x is { studentId: string; total: number; avg: number } => x !== null);

      candidates.sort((a, b) => (b.total !== a.total ? b.total - a.total : b.avg - a.avg));

      let currentRank = 0;
      let prevTotal = -1;
      let prevAvg = -1;
      candidates.forEach((item, idx) => {
        if (item.total !== prevTotal || item.avg !== prevAvg) {
          currentRank = idx + 1;
          prevTotal = item.total;
          prevAvg = item.avg;
        }
        map[item.studentId] = currentRank;
      });
    });
    return map;
  }, [rosterStudents, reportsByStudentId]);

  // Live totals from draft subjects
  const draftSummary = useMemo(() => {
    const totalMarks = draftSubjects.reduce(
      (sum, item) => sum + (Number.isFinite(item.marksObtained) ? item.marksObtained : 0),
      0
    );
    const totalMaxMarks = draftSubjects.reduce(
      (sum, item) => sum + (item.maxMarks > 0 ? item.maxMarks : 100),
      0
    );
    const average =
      totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 1000) / 10 : 0;
    const gradeInfo = getTermGrade(average);
    return { totalMarks, totalMaxMarks, average, ...gradeInfo };
  }, [draftSubjects]);

  // Combined subject suggestions datalist
  const mergedSubjectSuggestions = useMemo(() => {
    const set = new Set<string>([
      ...BIO_DEFAULT_SUBJECTS,
      ...PHYSICAL_DEFAULT_SUBJECTS,
      ...subjectOptions,
    ]);
    return Array.from(set);
  }, [subjectOptions]);

  // Update a student's stream directly on attendanceRoster so Attendance & Term Marks stay 100% synced
  const handleAssignStream = async (student: RosterStudent, stream: StudentStream) => {
    if (!isTeacherOrAdmin) return;
    try {
      await setDoc(
        doc(db, 'attendanceRoster', student.id),
        sanitizeFirestoreDoc({ ...student, stream })
      );
      // Also update existing term report stream metadata if present
      const existingRep = reportsByStudentId[student.id];
      if (existingRep) {
        await setDoc(
          doc(db, 'termExamReports', existingRep.id),
          sanitizeFirestoreDoc({
            ...existingRep,
            stream,
            updatedAt: new Date().toISOString(),
          })
        );
      }
      onToast(
        `${student.fullName} assigned to ${getStreamLabel(stream)} (synced with Attendance).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendanceRoster');
    }
  };

  const handleLoadStreamPresetSubjects = () => {
    if (!isTeacherOrAdmin || !selectedStudent) return;
    const preset =
      selectedStudent.stream === 'bio' ? BIO_DEFAULT_SUBJECTS : PHYSICAL_DEFAULT_SUBJECTS;
    const existingNames = new Set(draftSubjects.map((s) => s.subject.trim().toLowerCase()));
    const additions: TermExamSubjectMark[] = [];
    preset.forEach((subj, idx) => {
      if (!existingNames.has(subj.toLowerCase())) {
        additions.push({
          id: `sub-${Date.now()}-${idx}`,
          subject: subj,
          marksObtained: 0,
          maxMarks: 100,
        });
      }
    });
    if (additions.length > 0) {
      setDraftSubjects((prev) => [...prev, ...additions]);
    }
  };

  const handleAddSubjectRow = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isTeacherOrAdmin) return;
    setSheetError(null);

    const subj = newSubjectName.trim();
    if (!subj) {
      setSheetError('Please enter a subject name.');
      return;
    }

    const maxVal = Math.max(1, Number(newSubjectMax) || 100);
    const rawScore = newSubjectMarks.trim();
    const score = rawScore === '' ? 0 : Number(rawScore);

    if (Number.isNaN(score) || score < 0 || score > maxVal) {
      setSheetError(`Marks must be between 0 and ${maxVal}.`);
      return;
    }

    const existingIndex = draftSubjects.findIndex(
      (s) => s.subject.trim().toLowerCase() === subj.toLowerCase()
    );

    if (existingIndex >= 0) {
      setDraftSubjects((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, marksObtained: score, maxMarks: maxVal }
            : item
        )
      );
    } else {
      setDraftSubjects((prev) => [
        ...prev,
        {
          id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          subject: subj,
          marksObtained: score,
          maxMarks: maxVal,
        },
      ]);
    }

    setNewSubjectName('');
    setNewSubjectMarks('');
    setNewSubjectMax('100');
  };

  const handleUpdateSubjectField = (
    subId: string,
    field: 'subject' | 'marksObtained' | 'maxMarks',
    value: string
  ) => {
    if (!isTeacherOrAdmin) return;
    setDraftSubjects((prev) =>
      prev.map((item) => {
        if (item.id !== subId) return item;
        if (field === 'subject') {
          return { ...item, subject: value };
        }
        if (field === 'maxMarks') {
          const parsedMax = Math.max(1, Number(value) || 100);
          return {
            ...item,
            maxMarks: parsedMax,
            marksObtained: Math.min(item.marksObtained, parsedMax),
          };
        }
        const parsedScore = value.trim() === '' ? 0 : Math.max(0, Number(value) || 0);
        return {
          ...item,
          marksObtained: Math.min(parsedScore, item.maxMarks),
        };
      })
    );
  };

  const handleRemoveSubjectRow = (subId: string) => {
    if (!isTeacherOrAdmin) return;
    setDraftSubjects((prev) => prev.filter((s) => s.id !== subId));
  };

  const handleSaveStudentReport = async () => {
    if (!isTeacherOrAdmin || !selectedStudent) return;
    setSheetError(null);

    const cleanedSubjects = draftSubjects
      .map((s) => ({
        ...s,
        subject: s.subject.trim(),
        maxMarks: Math.max(1, Number(s.maxMarks) || 100),
        marksObtained: Math.max(
          0,
          Math.min(Number(s.marksObtained) || 0, Math.max(1, Number(s.maxMarks) || 100))
        ),
      }))
      .filter((s) => s.subject.length > 0);

    const totalMarks = cleanedSubjects.reduce((sum, s) => sum + s.marksObtained, 0);
    const totalMaxMarks = cleanedSubjects.reduce((sum, s) => sum + s.maxMarks, 0);
    const average =
      totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 1000) / 10 : 0;

    const docId = `${activeTermSlug}__${selectedStudent.id}`;
    const payload: TermExamReport = {
      id: docId,
      term: activeTerm,
      studentId: selectedStudent.id,
      studentName: selectedStudent.fullName,
      studentIndex: selectedStudent.indexNumber || '—',
      stream: selectedStudent.stream,
      subjects: cleanedSubjects,
      totalMarks,
      totalMaxMarks,
      average,
      position: draftPosition.trim(),
      teacherRemark: draftRemark.trim(),
      updatedBy: userProfile?.fullName || 'Faculty',
      updatedAt: new Date().toISOString(),
    };

    setSavingSheet(true);
    try {
      await setDoc(doc(db, 'termExamReports', docId), sanitizeFirestoreDoc(payload));
      onToast(
        `Saved ${activeTerm} marks & report sheet for ${selectedStudent.fullName}.`
      );
    } catch (err) {
      setSheetError('Could not save term report sheet. Please try again.');
      handleFirestoreError(err, OperationType.WRITE, 'termExamReports');
    } finally {
      setSavingSheet(false);
    }
  };

  // Auto-calculate and persist Stream Positions separately for Bio Stream & Physical Stream
  const handleAutoRankAllStreams = async () => {
    if (!isTeacherOrAdmin) return;
    const writes: Promise<void>[] = [];
    let updatedCount = 0;

    setRankingStreams(true);
    try {
      (['bio', 'physical'] as const).forEach((streamKey) => {
        const candidates = rosterStudents
          .filter((s) => s.stream === streamKey)
          .map((s) => ({ student: s, report: reportsByStudentId[s.id] }))
          .filter(
            (x): x is { student: RosterStudent; report: TermExamReport } =>
              Boolean(x.report && x.report.subjects && x.report.subjects.length > 0)
          );

        candidates.sort((a, b) =>
          b.report.totalMarks !== a.report.totalMarks
            ? b.report.totalMarks - a.report.totalMarks
            : b.report.average - a.report.average
        );

        let rank = 0;
        let prevTotal = -1;
        let prevAvg = -1;

        candidates.forEach(({ student, report }, idx) => {
          if (report.totalMarks !== prevTotal || report.average !== prevAvg) {
            rank = idx + 1;
            prevTotal = report.totalMarks;
            prevAvg = report.average;
          }
          const positionStr = formatOrdinal(rank);
          updatedCount += 1;
          writes.push(
            setDoc(
              doc(db, 'termExamReports', report.id),
              sanitizeFirestoreDoc({
                ...report,
                stream: student.stream,
                position: positionStr,
                updatedBy: userProfile?.fullName || 'Faculty',
                updatedAt: new Date().toISOString(),
              })
            )
          );
        });
      });

      if (writes.length === 0) {
        onToast(
          'Assign students to Bio or Physical stream and save their subject marks first to auto-rank.'
        );
      } else {
        await Promise.all(writes);
        onToast(
          `Updated ${activeTerm} stream positions for ${updatedCount} student${updatedCount === 1 ? '' : 's'} (Bio & Physical ranked separately).`
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'termExamReports');
    } finally {
      setRankingStreams(false);
    }
  };

  // Real Official Term Exam Report Card PDF Generator
  const buildReportCardPDF = (reportData: {
    studentName: string;
    studentIndex: string;
    stream?: StudentStream;
    term: string;
    subjects: TermExamSubjectMark[];
    totalMarks: number;
    totalMaxMarks: number;
    average: number;
    position?: string;
    teacherRemark?: string;
  }): jsPDF => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Outer double border like a real institutional report card
    pdf.setDrawColor(30, 58, 138); // deep royal navy
    pdf.setLineWidth(1.1);
    pdf.rect(10, 10, pageW - 20, pageH - 20);
    pdf.setDrawColor(180, 83, 9); // subtle gold accent inner line
    pdf.setLineWidth(0.35);
    pdf.rect(12.2, 12.2, pageW - 24.4, pageH - 24.4);

    // Institutional Masthead Banner
    pdf.setFillColor(15, 23, 42);
    pdf.rect(14, 14, pageW - 28, 28, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(255, 255, 255);
    pdf.text('ZAHIRA COLLEGE MAWANELLA', pageW / 2, 23, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(251, 191, 36);
    pdf.text('G.C.E. ADVANCED LEVEL SCIENCE SECTION (2K28 EM) • TERM REPORT CARD', pageW / 2, 30, {
      align: 'center',
    });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(203, 213, 225);
    pdf.text(
      'ZNC Science Project Directorate • Mawanella, Sri Lanka • Certified Academic Assessment Record',
      pageW / 2,
      36.5,
      { align: 'center' }
    );

    // Student Candidate Details Box
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(16, 46, pageW - 32, 26, 1.5, 1.5, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text('STUDENT NAME:', 20, 53);
    pdf.text('INDEX NUMBER:', 20, 60);
    pdf.text('ACADEMIC TERM:', 20, 67);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(reportData.studentName.toUpperCase(), 54, 53);
    pdf.setFont('helvetica', 'normal');
    pdf.text(reportData.studentIndex || '—', 54, 60);
    pdf.text(reportData.term, 54, 67);

    const streamDisplay =
      reportData.stream === 'bio'
        ? 'Biological Science Stream'
        : reportData.stream === 'physical'
          ? 'Physical Science Stream'
          : 'Science Stream (2k28 EM)';

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text('ACADEMIC STREAM:', 114, 53);
    pdf.text('STREAM POSITION:', 114, 60);
    pdf.text('DATE ISSUED:', 114, 67);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 64, 175);
    pdf.text(streamDisplay, 150, 53);
    pdf.setTextColor(180, 83, 9);
    pdf.text(reportData.position?.trim() || 'Not Assigned', 150, 60);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    pdf.text(new Date().toLocaleDateString(), 150, 67);

    // Subject Marks Table Header
    let y = 78;
    pdf.setFillColor(30, 58, 138);
    pdf.rect(16, y, pageW - 32, 9, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text('#', 19, y + 6);
    pdf.text('SUBJECT', 28, y + 6);
    pdf.text('MARKS', 112, y + 6, { align: 'right' });
    pdf.text('MAX', 129, y + 6, { align: 'right' });
    pdf.text('PCT %', 147, y + 6, { align: 'right' });
    pdf.text('GRADE', 162, y + 6, { align: 'center' });
    pdf.text('STANDING', 171, y + 6);

    y += 9;

    if (reportData.subjects.length === 0) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(16, y, pageW - 32, 14, 'S');
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text('No subject marks entered for this examination term yet.', pageW / 2, y + 8.5, {
        align: 'center',
      });
      y += 14;
    } else {
      reportData.subjects.forEach((sub, idx) => {
        if (y > 225) {
          pdf.addPage();
          pdf.setDrawColor(30, 58, 138);
          pdf.setLineWidth(1.1);
          pdf.rect(10, 10, pageW - 20, pageH - 20);
          y = 22;
        }

        const pct =
          sub.maxMarks > 0 ? Math.round((sub.marksObtained / sub.maxMarks) * 1000) / 10 : 0;
        const { grade, descriptor } = getTermGrade(pct);

        if (idx % 2 === 1) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(16, y, pageW - 32, 9, 'F');
        }
        pdf.setDrawColor(226, 232, 240);
        pdf.rect(16, y, pageW - 32, 9, 'S');

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(String(idx + 1).padStart(2, '0'), 19, y + 6);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(sub.subject.slice(0, 42), 28, y + 6);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 64, 175);
        pdf.text(String(sub.marksObtained), 112, y + 6, { align: 'right' });

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.text(String(sub.maxMarks), 129, y + 6, { align: 'right' });
        pdf.text(`${pct.toFixed(1)}%`, 147, y + 6, { align: 'right' });

        pdf.setFont('helvetica', 'bold');
        if (grade === 'A') pdf.setTextColor(21, 128, 61);
        else if (grade === 'B') pdf.setTextColor(29, 78, 216);
        else if (grade === 'C') pdf.setTextColor(180, 83, 9);
        else if (grade === 'S') pdf.setTextColor(100, 116, 139);
        else pdf.setTextColor(185, 28, 28);
        pdf.text(grade, 162, y + 6, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(descriptor, 171, y + 6);

        y += 9;
      });
    }

    // Performance Summary Grid (Total Marks | Average % | Position | Overall Grade)
    y += 6;
    if (y > 225) {
      pdf.addPage();
      y = 25;
    }

    const boxW = (pageW - 38) / 4;
    const overallGrade = getTermGrade(reportData.average);
    const summaryBoxes = [
      {
        label: 'TOTAL MARKS',
        val: `${reportData.totalMarks} / ${reportData.totalMaxMarks}`,
        color: [15, 23, 42] as [number, number, number],
      },
      {
        label: 'TERM AVERAGE',
        val: `${reportData.average.toFixed(1)}%`,
        color: [30, 64, 175] as [number, number, number],
      },
      {
        label: 'STREAM POSITION',
        val: reportData.position?.trim() || '—',
        color: [180, 83, 9] as [number, number, number],
      },
      {
        label: 'OVERALL STANDING',
        val: reportData.subjects.length > 0 ? `Grade ${overallGrade.grade}` : '—',
        color: [21, 128, 61] as [number, number, number],
      },
    ];

    summaryBoxes.forEach((box, idx) => {
      const bx = 16 + idx * (boxW + 2);
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(bx, y, boxW, 18, 1.5, 1.5, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);
      pdf.text(box.label, bx + boxW / 2, y + 6, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(box.color[0], box.color[1], box.color[2]);
      pdf.text(box.val, bx + boxW / 2, y + 13.5, { align: 'center' });
    });

    // Teacher's Remark Box
    y += 24;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(16, y, pageW - 32, 22, 1.5, 1.5, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    pdf.text("CLASS TEACHER / FACULTY EVALUATOR'S REMARK:", 20, y + 6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    const remarkText =
      reportData.teacherRemark?.trim() ||
      (reportData.subjects.length > 0
        ? `${overallGrade.descriptor} performance recorded in ${streamDisplay} for ${reportData.term}.`
        : 'Pending subject mark entry and faculty evaluation.');
    const wrappedRemark = pdf.splitTextToSize(remarkText, pageW - 42);
    pdf.text(wrappedRemark.slice(0, 2), 20, y + 12.5);

    // Grading Legend
    y += 27;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      'Grading Key (G.C.E. A/L):  A = 75–100 (Distinction)  |  B = 65–74 (Very Good)  |  C = 55–64 (Credit)  |  S = 35–54 (Ordinary)  |  F = 0–34',
      pageW / 2,
      y,
      { align: 'center' }
    );

    // Signature Lines fixed cleanly near bottom of report card
    const sigY = Math.max(y + 22, pageH - 34);
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.4);
    pdf.line(20, sigY, 68, sigY);
    pdf.line(81, sigY, 129, sigY);
    pdf.line(142, sigY, 190, sigY);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Class Teacher', 44, sigY + 5, { align: 'center' });
    pdf.text('Section Head (Science)', 105, sigY + 5, { align: 'center' });
    pdf.text('Principal / Directorate', 166, sigY + 5, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Zahira College Mawanella', 44, sigY + 9, { align: 'center' });
    pdf.text('2k28 Science EM Registry', 105, sigY + 9, { align: 'center' });
    pdf.text('Official School Seal', 166, sigY + 9, { align: 'center' });

    return pdf;
  };

  const getActiveReportPayloadForExport = () => {
    if (!selectedStudent) return null;
    return {
      studentName: selectedStudent.fullName,
      studentIndex: selectedStudent.indexNumber || '—',
      stream: selectedStudent.stream,
      term: activeTerm,
      subjects: draftSubjects,
      totalMarks: draftSummary.totalMarks,
      totalMaxMarks: draftSummary.totalMaxMarks,
      average: draftSummary.average,
      position: draftPosition.trim(),
      teacherRemark: draftRemark.trim(),
    };
  };

  const handlePreviewSelectedReportCard = (customPayload?: TermExamReport) => {
    const payload = customPayload || getActiveReportPayloadForExport();
    if (!payload) return;
    const pdf = buildReportCardPDF(payload);
    const blob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    const safeName = payload.studentName.replace(/\s+/g, '_');
    const safeTerm = payload.term.replace(/[^a-z0-9]+/gi, '_');
    onPreviewPDF({
      title: `Report Card: ${payload.studentName}`,
      subtitle: `${payload.term} · ${getStreamLabel(payload.stream)} · Zahira College Mawanella`,
      category: 'Official Term Exam Report Card',
      filename: `ZCM_Report_Card_${safeName}_${safeTerm}.pdf`,
      blobUrl,
      blob,
    });
  };

  const handleDownloadSelectedReportCard = (customPayload?: TermExamReport) => {
    const payload = customPayload || getActiveReportPayloadForExport();
    if (!payload) return;
    const pdf = buildReportCardPDF(payload);
    const safeName = payload.studentName.replace(/\s+/g, '_');
    const safeTerm = payload.term.replace(/[^a-z0-9]+/gi, '_');
    pdf.save(`ZCM_Report_Card_${safeName}_${safeTerm}.pdf`);
    onToast(`Downloaded Term Report Card PDF for ${payload.studentName}.`);
  };

  // Export separated Bio Stream & Physical Stream Term Marksheet PDF
  const handleDownloadStreamMarksheetPDF = () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(15, 23, 42);
    pdf.text('ZAHIRA COLLEGE MAWANELLA • 2K28 SCIENCE EM', 16, 18);

    pdf.setFontSize(10);
    pdf.setTextColor(30, 64, 175);
    pdf.text(`TERM EXAM MARKSHEET BY STREAM — ${activeTerm.toUpperCase()}`, 16, 24);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 16, 29);

    let y = 36;

    const renderStreamTable = (title: string, list: RosterStudent[]) => {
      if (y > 245) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFillColor(15, 23, 42);
      pdf.rect(16, y, pageW - 32, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text(`${title.toUpperCase()} (${list.length} STUDENTS)`, 20, y + 5.5);
      y += 9;

      // Column headers
      pdf.setFillColor(241, 245, 249);
      pdf.rect(16, y, pageW - 32, 7, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(51, 65, 85);
      pdf.text('POS', 20, y + 5);
      pdf.text('INDEX NO', 36, y + 5);
      pdf.text('STUDENT NAME', 62, y + 5);
      pdf.text('SUBJECTS', 132, y + 5, { align: 'right' });
      pdf.text('TOTAL', 158, y + 5, { align: 'right' });
      pdf.text('AVERAGE', 184, y + 5, { align: 'right' });
      y += 7.5;

      if (list.length === 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text('No students assigned to this stream.', 20, y + 5);
        y += 10;
        return;
      }

      list.forEach((student) => {
        if (y > 272) {
          pdf.addPage();
          y = 20;
        }
        const rep = reportsByStudentId[student.id];
        const pos =
          rep?.position?.trim() ||
          (autoRankMap[student.id] ? formatOrdinal(autoRankMap[student.id]) : '—');
        const subCount = rep?.subjects?.length || 0;
        const totalStr = rep ? `${rep.totalMarks}/${rep.totalMaxMarks}` : '—';
        const avgStr = rep ? `${rep.average.toFixed(1)}%` : '—';

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(180, 83, 9);
        pdf.text(pos, 20, y + 4.5);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.text(student.indexNumber || '—', 36, y + 4.5);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(student.fullName.slice(0, 32), 62, y + 4.5);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.text(String(subCount), 132, y + 4.5, { align: 'right' });
        pdf.text(totalStr, 158, y + 4.5, { align: 'right' });

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 64, 175);
        pdf.text(avgStr, 184, y + 4.5, { align: 'right' });

        pdf.setDrawColor(241, 245, 249);
        pdf.line(16, y + 6.5, pageW - 16, y + 6.5);
        y += 7;
      });

      y += 6;
    };

    if (streamViewFilter === 'all' || streamViewFilter === 'bio') {
      renderStreamTable('Biological Science Stream (Bio Stream)', bioStudents);
    }
    if (streamViewFilter === 'all' || streamViewFilter === 'physical') {
      renderStreamTable('Physical Science Stream (Physical Stream)', physicalStudents);
    }

    pdf.save(`ZCM_Stream_Marksheet_${slugifyTerm(activeTerm)}.pdf`);
    onToast(`Downloaded ${activeTerm} separated Stream Marksheet PDF.`);
  };

  // Non-Teacher/Non-Admin View: strictly read-only personal Term Exam Report Cards
  if (!isTeacherOrAdmin) {
    const activePersonalReport =
      personalReportsForViewer.find((r) => slugifyTerm(r.term) === activeTermSlug) ||
      personalReportsForViewer[0] ||
      null;

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                Term Examination Report Card
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-500 dark:text-slate-400">
                <Lock className="w-3 h-3" />
                <span>Read-Only</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Subject marks, averages, and stream positions are entered and verified by your Teacher or School Admin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-stone-800 dark:text-white"
            >
              {availableTerms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {activePersonalReport && (
              <>
                <button
                  type="button"
                  onClick={() => handlePreviewSelectedReportCard(activePersonalReport)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-3.5 py-2 text-xs font-bold text-blue-800 dark:text-blue-200"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview Report Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSelectedReportCard(activePersonalReport)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </>
            )}
          </div>
        </div>

        {!activePersonalReport ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
            <Award className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="font-serif text-base font-bold text-slate-800 dark:text-slate-100">
              No Term Exam Report Released for {activeTerm}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Once your teacher or administrator records your term subjects, marks, and position, your official report card will appear here for PDF download.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-slate-800 pb-4">
              <div>
                <h4 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
                  {activePersonalReport.studentName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  Index: {activePersonalReport.studentIndex} · {getStreamLabel(activePersonalReport.stream)} ·{' '}
                  {activePersonalReport.term}
                </p>
              </div>
              {activePersonalReport.position && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Stream Position
                  </p>
                  <p className="font-serif text-lg font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                    {activePersonalReport.position}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/60 p-3.5">
                <p className="text-[10px] font-bold uppercase text-stone-500 dark:text-slate-400">Total Marks</p>
                <p className="font-serif text-xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {activePersonalReport.totalMarks} / {activePersonalReport.totalMaxMarks}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 p-3.5">
                <p className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">Term Average</p>
                <p className="font-serif text-xl font-bold text-blue-900 dark:text-blue-100 mt-0.5 tabular-nums">
                  {activePersonalReport.average.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-3.5">
                <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Position</p>
                <p className="font-serif text-xl font-bold text-amber-900 dark:text-amber-200 mt-0.5 tabular-nums">
                  {activePersonalReport.position || 'Pending'}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3.5">
                <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Grade</p>
                <p className="font-serif text-xl font-bold text-emerald-900 dark:text-emerald-200 mt-0.5">
                  {getTermGrade(activePersonalReport.average).grade}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-stone-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-4">Subject</th>
                    <th className="py-2.5 px-4 text-right">Marks</th>
                    <th className="py-2.5 px-4 text-right">Max</th>
                    <th className="py-2.5 px-4 text-right">Average %</th>
                    <th className="py-2.5 px-4 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
                  {activePersonalReport.subjects.map((sub) => {
                    const pct =
                      sub.maxMarks > 0
                        ? Math.round((sub.marksObtained / sub.maxMarks) * 1000) / 10
                        : 0;
                    const { grade } = getTermGrade(pct);
                    return (
                      <tr key={sub.id} className="hover:bg-stone-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                          {sub.subject}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                          {sub.marksObtained}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                          {sub.maxMarks}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {pct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-emerald-700 dark:text-emerald-300">
                          {grade}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {activePersonalReport.teacherRemark && (
              <div className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/50 p-3.5 text-xs text-slate-700 dark:text-slate-300">
                <strong className="text-slate-900 dark:text-white">Teacher Remark: </strong>
                {activePersonalReport.teacherRemark}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // TEACHER & ADMIN TERM EXAM WORKSPACE
  const renderStudentRosterItem = (student: RosterStudent) => {
    const isSelected = student.id === selectedStudentId;
    const rep = reportsByStudentId[student.id];
    const hasMarks = Boolean(rep && rep.subjects && rep.subjects.length > 0);
    const autoRank = autoRankMap[student.id];
    const displayPosition = rep?.position?.trim() || (autoRank ? formatOrdinal(autoRank) : '');

    return (
      <button
        type="button"
        key={student.id}
        onClick={() => setSelectedStudentId(student.id)}
        className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
          isSelected
            ? 'border-blue-600 bg-blue-50/90 dark:bg-blue-900/30 shadow-2xs'
            : 'border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-slate-600 hover:bg-stone-50/70 dark:hover:bg-slate-800/50'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-bold text-xs truncate ${
                isSelected ? 'text-blue-950 dark:text-white' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {student.fullName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            <span>#{student.indexNumber || '—'}</span>
            <span>·</span>
            {hasMarks ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                {rep.subjects.length} subj · {rep.totalMarks}/{rep.totalMaxMarks} ({rep.average.toFixed(1)}%)
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">No marks yet</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {displayPosition && (
            <span className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[10px] font-bold tabular-nums">
              {displayPosition}
            </span>
          )}
          <ChevronRight
            className={`w-4 h-4 ${
              isSelected ? 'text-blue-600 dark:text-blue-300' : 'text-slate-300 dark:text-slate-600'
            }`}
          />
        </div>
      </button>
    );
  };

  const selectedAutoRank = selectedStudent ? autoRankMap[selectedStudent.id] : undefined;

  return (
    <div className="space-y-5">
      {/* Top Term Controls & Separated Stream Actions */}
      <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-stone-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                Term Examinations &amp; Report Cards (Bio &amp; Physical Streams)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All student names &amp; streams sync live from the Attendance Register. Click any student name to add subjects, enter marks, set stream position, and export a real Report Card PDF.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleAutoRankAllStreams}
              disabled={rankingStreams || rosterStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition-all shadow-2xs"
              title="Calculate positions separately for Bio Stream and Physical Stream based on Total Marks"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>{rankingStreams ? 'Ranking...' : 'Auto-Rank Stream Positions'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadStreamMarksheetPDF}
              disabled={rosterStudents.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-700 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Export Stream Marksheet PDF</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-end">
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-1">
              Academic Term
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => {
                setSelectedTerm(e.target.value);
                setCustomTermInput('');
              }}
              className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {availableTerms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-1">
              Or Custom Term Label
            </label>
            <input
              type="text"
              value={customTermInput}
              onChange={(e) => setCustomTermInput(e.target.value)}
              placeholder="e.g. First Term Test 2026"
              className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-1">
              Search Student
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or index number..."
                className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 pl-8 pr-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-1">
              Stream Filter
            </label>
            <div className="grid grid-cols-3 rounded-xl bg-stone-100 dark:bg-slate-800 p-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setStreamViewFilter('all')}
                className={`rounded-lg py-1.5 transition-all ${
                  streamViewFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-200 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStreamViewFilter('bio')}
                className={`rounded-lg py-1.5 transition-all ${
                  streamViewFilter === 'bio'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Bio ({bioStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setStreamViewFilter('physical')}
                className={`rounded-lg py-1.5 transition-all ${
                  streamViewFilter === 'physical'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Physical ({physicalStudents.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split View: Left Separated Bio & Physical Student Directory | Right Student Report Sheet */}
      {loadingRoster ? (
        <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-500">
          Syncing student directory from Attendance Register...
        </div>
      ) : rosterStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <GraduationCap className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h4 className="font-serif text-base font-bold text-slate-800 dark:text-slate-100">
            No Students in Attendance Register Yet
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Add students and assign their Bio or Physical stream inside the Attendance Register first. Every student entered there automatically appears here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: Student Lists Separated by Bio Stream & Physical Stream */}
          <div className="lg:col-span-5 space-y-4">
            {/* Bio Stream Section */}
            {(streamViewFilter === 'all' || streamViewFilter === 'bio') && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-emerald-50/90 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <h4 className="font-serif text-sm font-bold text-emerald-950 dark:text-emerald-200">
                      Bio Stream
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {bioStudents.length} student{bioStudents.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="p-3 space-y-2 max-h-[340px] overflow-y-auto">
                  {bioStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                      No Bio Stream students match the filter.
                    </p>
                  ) : (
                    bioStudents.map(renderStudentRosterItem)
                  )}
                </div>
              </div>
            )}

            {/* Physical Stream Section */}
            {(streamViewFilter === 'all' || streamViewFilter === 'physical') && (
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Atom className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                    <h4 className="font-serif text-sm font-bold text-indigo-950 dark:text-indigo-200">
                      Physical Stream
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {physicalStudents.length} student{physicalStudents.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="p-3 space-y-2 max-h-[340px] overflow-y-auto">
                  {physicalStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                      No Physical Stream students match the filter.
                    </p>
                  ) : (
                    physicalStudents.map(renderStudentRosterItem)
                  )}
                </div>
              </div>
            )}

            {/* Unassigned Students Bucket (only shown when legacy/unassigned students exist) */}
            {unassignedStudents.length > 0 && streamViewFilter === 'all' && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/50 flex items-center justify-between">
                  <span className="font-serif text-sm font-bold text-amber-950 dark:text-amber-200">
                    Stream Not Assigned Yet
                  </span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {unassignedStudents.length}
                  </span>
                </div>
                <div className="p-3 space-y-2 max-h-[260px] overflow-y-auto">
                  {unassignedStudents.map((student) => (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        student.id === selectedStudentId
                          ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-900/30'
                          : 'border-stone-200 dark:border-slate-800 hover:bg-stone-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {student.fullName}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                          #{student.indexNumber || '—'}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleAssignStream(student, 'bio')}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Bio
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAssignStream(student, 'physical')}
                          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Physical
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Selected Student's Subject Marks, Total, Average, Position & PDF Report Card */}
          <div className="lg:col-span-7">
            {!selectedStudent ? (
              <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
                <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Select a Student Name from the List
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Click any student under Bio Stream or Physical Stream to enter subjects, marks, position, and export their Report Card PDF.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-xs space-y-5">
                {/* Student Header & Report Card PDF Actions */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-stone-100 dark:border-slate-800 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
                        {selectedStudent.fullName}
                      </h3>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          selectedStudent.stream === 'bio'
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
                            : selectedStudent.stream === 'physical'
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200'
                              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        {getStreamLabel(selectedStudent.stream)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>Index: <strong>{selectedStudent.indexNumber || '—'}</strong></span>
                      <span>·</span>
                      <span>Term: <strong className="text-blue-700 dark:text-blue-300">{activeTerm}</strong></span>
                    </div>

                    {/* Inline Stream Switcher synced to Attendance */}
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        Stream (Synced with Attendance):
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAssignStream(selectedStudent, 'bio')}
                        className={`rounded-lg px-2.5 py-1 font-bold transition-colors ${
                          selectedStudent.stream === 'bio'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-stone-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                        }`}
                      >
                        Bio Stream
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAssignStream(selectedStudent, 'physical')}
                        className={`rounded-lg px-2.5 py-1 font-bold transition-colors ${
                          selectedStudent.stream === 'physical'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-stone-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                        }`}
                      >
                        Physical Stream
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePreviewSelectedReportCard()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3.5 py-2 text-xs font-bold text-blue-900 dark:text-blue-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview Report Card</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSelectedReportCard()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Report Card PDF</span>
                    </button>
                  </div>
                </div>

                {/* Live Summary Cards: Total Marks, Average, Position on Report Sheet, Grade */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
                      Total Marks
                    </p>
                    <p className="font-serif text-xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {draftSummary.totalMarks}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        / {draftSummary.totalMaxMarks}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                      Average
                    </p>
                    <p className="font-serif text-xl font-bold text-blue-900 dark:text-blue-100 mt-0.5 tabular-nums">
                      {draftSummary.average.toFixed(1)}%
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-3">
                    <div className="flex items-center justify-between gap-1">
                      <label
                        htmlFor="term-report-position"
                        className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                      >
                        Position (Report)
                      </label>
                      {selectedAutoRank && (
                        <button
                          type="button"
                          onClick={() => setDraftPosition(formatOrdinal(selectedAutoRank))}
                          className="text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:underline tabular-nums"
                          title="Fill calculated rank within stream"
                        >
                          Use #{selectedAutoRank}
                        </button>
                      )}
                    </div>
                    <input
                      id="term-report-position"
                      type="text"
                      value={draftPosition}
                      onChange={(e) => setDraftPosition(e.target.value)}
                      placeholder={selectedAutoRank ? `e.g. ${formatOrdinal(selectedAutoRank)}` : 'e.g. 1st'}
                      className="mt-1 w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-sm font-bold text-amber-950 dark:text-amber-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>

                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Overall Grade
                    </p>
                    <p className="font-serif text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-0.5">
                      {draftSubjects.length > 0 ? draftSummary.grade : '—'}
                    </p>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate">
                      {draftSubjects.length > 0 ? draftSummary.descriptor : 'Add subjects'}
                    </p>
                  </div>
                </div>

                {/* Quick Preset Bar when student has no subjects yet */}
                {draftSubjects.length === 0 && (
                  <div className="rounded-xl border border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      Quick start: Load standard A/L{' '}
                      <strong>
                        {selectedStudent.stream === 'bio' ? 'Bio Stream' : 'Physical Stream'}
                      </strong>{' '}
                      subjects or add custom subjects below.
                    </span>
                    <button
                      type="button"
                      onClick={handleLoadStreamPresetSubjects}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        Load {selectedStudent.stream === 'bio' ? 'Bio' : 'Physical'} Subjects
                      </span>
                    </button>
                  </div>
                )}

                {/* Subjects & Marks Table */}
                <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-slate-700">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-stone-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3 w-28">Marks</th>
                        <th className="py-2.5 px-3 w-24">Max</th>
                        <th className="py-2.5 px-3 text-right w-20">Pct %</th>
                        <th className="py-2.5 px-3 text-center w-16">Grade</th>
                        <th className="py-2.5 px-3 text-right w-14">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
                      {draftSubjects.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-6 px-4 text-center text-xs text-slate-400 dark:text-slate-500"
                          >
                            No subjects added yet. Use the form below to add subjects &amp; marks.
                          </td>
                        </tr>
                      ) : (
                        draftSubjects.map((sub) => {
                          const pct =
                            sub.maxMarks > 0
                              ? Math.round((sub.marksObtained / sub.maxMarks) * 1000) / 10
                              : 0;
                          const { grade } = getTermGrade(pct);
                          return (
                            <tr
                              key={sub.id}
                              className="hover:bg-stone-50/70 dark:hover:bg-slate-800/40"
                            >
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={sub.subject}
                                  onChange={(e) =>
                                    handleUpdateSubjectField(sub.id, 'subject', e.target.value)
                                  }
                                  className="w-full rounded-lg border border-transparent hover:border-stone-200 dark:hover:border-slate-700 focus:border-blue-500 bg-transparent px-2 py-1 font-bold text-slate-900 dark:text-white focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={sub.maxMarks}
                                  step="0.5"
                                  value={sub.marksObtained}
                                  onChange={(e) =>
                                    handleUpdateSubjectField(
                                      sub.id,
                                      'marksObtained',
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1 font-bold text-blue-700 dark:text-blue-300 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  value={sub.maxMarks}
                                  onChange={(e) =>
                                    handleUpdateSubjectField(sub.id, 'maxMarks', e.target.value)
                                  }
                                  className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 tabular-nums focus:outline-none"
                                />
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                {pct.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-emerald-700 dark:text-emerald-400">
                                {grade}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubjectRow(sub.id)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                  title="Remove subject"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add New Subject & Mark Form (Teacher & Admin only) */}
                <form
                  onSubmit={handleAddSubjectRow}
                  className="rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/80 dark:bg-slate-800/50 p-3.5 space-y-2.5 text-xs"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Add Subject &amp; Marks to {selectedStudent.fullName}&rsquo;s Report
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        list="term-subject-suggestions"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="Subject name (e.g. Biology, Physics)"
                        className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      <datalist id="term-subject-suggestions">
                        {mergedSubjectSuggestions.map((sub) => (
                          <option key={sub} value={sub} />
                        ))}
                      </datalist>
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min={0}
                        max={Number(newSubjectMax) || 100}
                        step="0.5"
                        value={newSubjectMarks}
                        onChange={(e) => setNewSubjectMarks(e.target.value)}
                        placeholder="Marks"
                        className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-bold text-blue-700 dark:text-blue-300 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={newSubjectMax}
                        onChange={(e) => setNewSubjectMax(e.target.value)}
                        placeholder="Max (100)"
                        className="w-full rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 tabular-nums focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 px-3 py-2 font-bold text-white transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </form>

                {/* Teacher Remark & Save Report Sheet Footer */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-1">
                      Class Teacher / Evaluator Remark (Printed on Report Card PDF)
                    </label>
                    <input
                      type="text"
                      value={draftRemark}
                      onChange={(e) => setDraftRemark(e.target.value)}
                      placeholder="e.g. Excellent progress in Organic Chemistry & Mechanics. Keep up the momentum!"
                      className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  {sheetError && (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{sheetError}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-stone-100 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      {selectedExistingReport ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>
                            Last saved {new Date(selectedExistingReport.updatedAt).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span>Not saved to Firestore for {activeTerm} yet.</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveStudentReport}
                      disabled={savingSheet}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingSheet ? 'Saving Report Sheet...' : 'Save Report Sheet'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
