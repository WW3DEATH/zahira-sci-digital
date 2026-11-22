export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'guest';

export const OFFICIAL_STUDENT_SUBJECTS = [
  'C.Maths',
  'Bio',
  'Physics',
  'Chemistry',
  'ICT',
] as const;

export type OfficialStudentSubject = (typeof OFFICIAL_STUDENT_SUBJECTS)[number];

export interface SchoolBatch {
  id: string;
  name: string;
  academicYear?: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  username?: string;
  usernameLower?: string;
  authMethod?: 'firebase_auth' | 'firestore_email' | 'google';
  role: UserRole;
  batchId?: string;
  batchName?: string;
  indexNumber?: string; // Official Zahira College Science EM Student Index (e.g., '2860003', '2860004')
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  subject?: string; // For teachers: primary subject
  stream?: string;  // For students: academic stream (e.g., Biological Science, Physical Science)
  enrolledSubjects?: string[]; // For students: joined subjects (C.Maths, Bio, Physics, Chemistry, ICT)
  assignedClassIds?: string[]; // For teachers
  enrolledClassIds?: string[]; // For students
  linkedStudentIds?: string[]; // For parents
  createdAt?: string;
  updatedAt?: string;
}

export type StudentStream = 'bio' | 'physical';

export interface RosterStudent {
  id: string; // e.g. 'roster_2860001'
  fullName: string;
  indexNumber: string; // e.g. '2860001' or '2K28-SCI-001'
  stream?: StudentStream; // 'bio' (Biological Science) or 'physical' (Physical Science)
  batchId?: string;
  batchName?: string;
  classId?: string; // class cohort or 'general'
  createdAt: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
  academicYear: string;
  description: string;
  room?: string;
  batchId?: string;
  batchName?: string;
  teacherIds: string[];
  studentIds: string[];
  subjectIds: string[];
  createdAt?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
  color: string;
  batchId?: string;
  batchName?: string;
  teacherIds: string[];
  classIds: string[];
  createdAt?: string;
}

export interface LearningMaterial {
  id: string;
  title: string;
  description: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  teacherName?: string;
  fileType: 'pdf' | 'document' | 'presentation' | 'image' | 'link';
  fileUrl?: string;
  fileSize?: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  dueDate: string;
  maxMarks: number;
  rubric?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  createdAt: string;
}

export type SubmissionStatus = 'draft' | 'submitted' | 'late' | 'under_review' | 'graded' | 'revision';

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  status: SubmissionStatus;
  marksObtained?: number;
  feedback?: string;
  aiFeedbackSuggestion?: string;
  submittedAt: string;
  gradedAt?: string;
}

export interface AcademicTest {
  id: string;
  title: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  examDate: string;
  maxMarks: number;
  term: string;
  createdAt: string;
}

export interface TestMark {
  id: string;
  testId: string;
  studentId: string;
  studentName: string;
  studentIndex?: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  subjectId: string;
  marksObtained: number;
  maxMarks: number;
  feedback?: string;
  createdAt: string;
}

export interface TermExamSubjectMark {
  id: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
}

export interface AcademicTerm {
  id: string;
  name: string;
  academicYear?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  batchId: string;
  batchName: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TermExamReport {
  id: string; // `${termSlug}__${studentId}`
  term: string;
  batchId?: string;
  batchName?: string;
  studentId: string;
  studentName: string;
  studentIndex: string;
  stream?: StudentStream;
  subjects: TermExamSubjectMark[];
  totalMarks: number;
  totalMaxMarks: number;
  average: number;
  position?: string;
  teacherRemark?: string;
  updatedBy?: string;
  updatedAt: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface QRAttendanceSession {
  sessionId: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  className: string;
  date: string;
  subjectId?: string;
  subjectName?: string;
  room: string;
  generatedBy: string;
  teacherName: string;
  secretToken: string;
  validUntil: string;
  isActive: boolean;
  qrPayload: string;
  createdAt: string;
}

export interface AttendanceCheckInLog {
  id: string;
  recordId: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  date: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  status: AttendanceStatus;
  checkInTime: string;
  method: 'qr_scan' | 'manual_rollcall';
  sessionToken?: string;
}

export interface AttendanceRecord {
  id: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  date: string; // YYYY-MM-DD
  sessionId?: string;
  sessionSubject?: string;
  timeSlot?: string;
  teacherId: string;
  records: Record<string, AttendanceStatus>; // studentId -> status
  checkInLogs?: AttendanceCheckInLog[];
  activeSession?: QRAttendanceSession;
  createdAt: string;
}

export interface AttendanceDayControl {
  id: string; // `${batchId}__${date}` or legacy YYYY-MM-DD
  batchId?: string;
  batchName?: string;
  date: string; // YYYY-MM-DD
  enabled: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface ScienceSkillReference {
  database: 'AlphaFold DB' | 'UniProt' | 'Reactome' | 'PubChem' | 'RCSB PDB' | 'Europe PMC';
  accessionOrId: string;
  name: string;
  description: string;
  link: string;
  plddtConfidence?: string;
}

export interface StudyScheduleBlock {
  id: string;
  day: string;
  timeSlot: string;
  durationMinutes: number;
  subject: string;
  topic: string;
  urgency: 'critical_deadline' | 'upcoming_exam' | 'concept_mastery' | 'revision';
  linkedAssignmentId?: string;
  linkedDeadline?: string;
  objectives: string[];
  scienceReference?: ScienceSkillReference;
  completed: boolean;
  notes?: string;
}

export interface StudentStudyPlan {
  id: string;
  studentId: string;
  studentName: string;
  stream: string;
  generatedAt: string;
  weeklyGoal: string;
  performanceDiagnosis: string;
  targetExam: string;
  overallReadinessScore: number;
  scheduleBlocks: StudyScheduleBlock[];
  bioscienceKeyConcepts: {
    concept: string;
    description: string;
    databaseRef: string;
    link: string;
  }[];
}

export type SchoolEventType = 'holiday' | 'exam' | 'academic' | 'study_group' | 'meeting' | 'sports' | 'general';

export const STUDY_GROUP_ROOMS = [
  { id: 'general', name: 'General Science EM', description: 'Cross-subject past-paper practice and group review' },
  { id: 'cmath', name: 'Combined Mathematics', description: 'Calculus, vectors, mechanics & problem sets' },
  { id: 'bio', name: 'Biology', description: 'Cellular physiology, genetics & essay prep' },
  { id: 'physics', name: 'Physics', description: 'Mechanics, fields, waves, optics & derivations' },
  { id: 'chemistry', name: 'Chemistry', description: 'Organic mechanisms, equilibrium & electrochemistry' },
  { id: 'ict', name: 'ICT', description: 'Algorithms, databases, networking & web systems' },
] as const;

export type StudyGroupRequestStatus = 'pending' | 'approved' | 'declined';

export interface StudyGroupJoinRequest {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  eventLocation?: string;
  roomId: string;
  roomName: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  studentIndex?: string;
  batchId: string;
  batchName: string;
  note?: string;
  status: StudyGroupRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  time?: string;      // e.g. "08:30"
  type: SchoolEventType;
  batchId?: string;
  batchName?: string;
  classId?: string;
  subjectId?: string;
  studyRoomId?: string;
  studyRoomName?: string;
  location?: string;
  createdBy: string;
  createdByName?: string;
  googleEventId?: string;
  isSyncedWithGoogle?: boolean;
  createdAt: string;
}

export type AnnouncementAudience = 'all' | 'teachers' | 'students' | 'parents' | 'class';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  audience: AnnouncementAudience;
  batchId?: string;
  batchName?: string;
  classId?: string;
  isPinned?: boolean;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  durationMinutes: number;
  totalMarks: number;
  isPublished: boolean;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  studentName: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  answers: Record<string, string>; // questionId -> selectedAnswer
  score: number;
  maxScore: number;
  status: 'completed' | 'in_progress';
  completedAt: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  batchId?: string;
  batchName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt: string;
  requestStatus?: 'pending' | 'accepted' | 'declined';
  requestedBy?: string;
  requestedTo?: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  batchId?: string;
  batchName?: string;
  text: string;
  createdAt: string;
}

export type DiscussionCategory = 'class' | 'subject' | 'study_group' | 'general';

export interface Discussion {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  category: DiscussionCategory;
  batchId?: string;
  batchName?: string;
  classId?: string;
  subjectId?: string;
  tags: string[];
  repliesCount: number;
  isPinned?: boolean;
  isLocked?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  createdAt: string;
}

export interface DiscussionReply {
  id: string;
  discussionId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  batchId?: string;
  batchName?: string;
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  createdAt: string;
}

export interface DiscussionRoomMessage {
  id: string;
  roomId: string;
  roomName?: string;
  batchId?: string;
  batchName?: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  indexNumber?: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  createdAt: string;
}

export interface TutorChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface TutorSession {
  id: string;
  studentId: string;
  subject: string;
  topic: string;
  style: string;
  messages: TutorChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId?: string;
  audience?: 'all' | 'students' | 'teachers' | 'user' | 'admin';
  batchId?: string;
  batchName?: string;
  title: string;
  message: string;
  link?: string;
  type: 'assignment' | 'grade' | 'announcement' | 'message' | 'quiz' | 'attendance' | 'material' | 'discussion' | 'attendance_alert';
  read: boolean;
  readBy?: string[];
  createdAt: string;
}

export interface SchoolSetting {
  id: string;
  schoolName: string;
  cohortName: string;
  academicYear: string;
  terms: string[];
  contactEmail: string;
  contactPhone?: string;
  address: string;
  room?: string;
  motto?: string;
  marqueeNotice?: string;
  showMarquee?: boolean;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

export type BadgeCategory = 'streak' | 'quiz' | 'attendance' | 'assignment' | 'discussion' | 'milestone';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface StudentBadge {
  id: string;
  title: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  iconName: string;
  requirement: string;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  isUnlocked: boolean;
  unlockedAt?: string;
  xpBonus: number;
}

export interface StudentBadgeSummary {
  badges: StudentBadge[];
  totalXp: number;
  unlockedCount: number;
  totalCount: number;
  level: number;
  levelTitle: string;
  currentStreakDays: number;
}

export interface ScheduledClass {
  id: string;
  batchId?: string;
  batchName?: string;
  classId: string;
  className: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "08:00 - 09:30"
  periodName?: string; // e.g. "Period 1"
  subject: string; // e.g. "Combined Mathematics", "Physics", "Chemistry", "Biology"
  topic?: string;
  teacherId: string;
  teacherName: string;
  room: string;
  attendanceRecords?: Record<string, AttendanceStatus>;
  attendanceTaken?: boolean;
  notes?: string;
  createdAt: string;
}

export interface PvPPlayerAnswer {
  selected: string;
  isCorrect: boolean;
  pointsAwarded: number;
  timeSpentSec: number;
}

export interface PvPPlayerState {
  userId: string;
  userName: string;
  userRole: UserRole;
  indexNumber?: string;
  score: number;
  correctCount: number;
  streak: number;
  currentIndex: number;
  finished: boolean;
  joinedAt: string;
  finishedAt?: string;
  lastActiveAt?: string;
  lastAnswerCorrect?: boolean | null;
  answers?: Record<string, PvPPlayerAnswer>;
}

export type PvPMode = 'pvp' | 'solo_ranked';
export type PvPStatus = 'waiting' | 'active' | 'completed';

export interface PvPMatch {
  id: string;
  roomCode: string;
  mode: PvPMode;
  batchId?: string;
  batchName?: string;
  subject: string;
  subjects?: string[];
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionCount: number;
  status: PvPStatus;
  hostId: string;
  hostName: string;
  hostRole: UserRole;
  hostIndexNumber?: string;
  guestId?: string;
  guestName?: string;
  guestRole?: UserRole;
  guestIndexNumber?: string;
  invitedUserId?: string;
  invitedUserName?: string;
  questions: QuizQuestion[];
  questionSource?: 'gemini_ai' | 'procedural_engine';
  playerStates: Record<string, PvPPlayerState>;
  winnerId?: string | null;
  winnerName?: string | null;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QuizScoreEvent {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  indexNumber?: string;
  batchId?: string;
  batchName?: string;
  mode: 'pvp' | 'solo_ranked' | 'standard_quiz';
  matchId?: string;
  subject: string;
  pointsEarned: number;
  correctCount: number;
  totalQuestions: number;
  isWin: boolean;
  completedAt: string;
}

export type TimetableDay =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export const TIMETABLE_DAYS: readonly TimetableDay[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type TimetableStream = 'all' | 'bio' | 'physical';

export type TimetableAccent = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';

export interface TimetableEntry {
  id: string;
  batchId: string;
  batchName: string;
  dayOfWeek: TimetableDay;
  periodLabel: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  subject: string;
  stream: TimetableStream;
  teacherName: string;
  teacherId?: string;
  room: string;
  notes?: string;
  color?: TimetableAccent;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdmissionFormRecord {
  id: string;
  title: string;
  academicYear: string;
  batchName?: string;
  deadline?: string;
  instructions?: string;
  fileName: string;
  fileUrl: string;
  fileSize?: string;
  isActive: boolean;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByRole: 'admin' | 'teacher';
  createdAt: string;
  updatedAt: string;
}

export interface YearlyResultReport {
  id: string;
  examYear: string;
  title: string;
  summary?: string;
  totalCandidates: number;
  universityQualifiedCount: number;
  universityPassRate: number;
  a3Count: number;
  physicalPassRate: number;
  bioPassRate: number;
  medicineCount?: number;
  engineeringCount?: number;
  pdfFileName?: string;
  pdfFileUrl?: string;
  pdfFileSize?: string;
  updatedBy: string;
  updatedByName: string;
  updatedByRole: 'admin' | 'teacher';
  createdAt: string;
  updatedAt: string;
}
