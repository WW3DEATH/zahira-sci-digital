import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SiteConfigProvider } from './context/SiteConfigContext';
import { ThemeProvider } from './context/ThemeContext';
import { BatchProvider, useBatch } from './context/BatchContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AdminDashboard } from './components/dashboards/AdminDashboard';
import { TeacherDashboard } from './components/dashboards/TeacherDashboard';
import { StudentDashboard } from './components/dashboards/StudentDashboard';
import { ParentDashboard } from './components/dashboards/ParentDashboard';
import { GuestPortalLanding } from './components/dashboards/GuestPortalLanding';
import { AdminMasterControlPage } from './pages/AdminMasterControlPage';
import { ClassesPage } from './pages/ClassesPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { QuizzesPage } from './pages/QuizzesPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { AttendancePage } from './pages/AttendancePage';
import { TimetablePage } from './pages/TimetablePage';
import { CalendarPage } from './pages/CalendarPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { MessagesPage } from './pages/MessagesPage';
import { DiscussionsPage } from './pages/DiscussionsPage';
import { TutorPage } from './pages/TutorPage';
import { TeacherAssistantPage } from './pages/TeacherAssistantPage';
import { UsersAdminPage } from './pages/UsersAdminPage';
import { TeacherPanelPage } from './pages/TeacherPanelPage';
import { ScienceLabsPage } from './pages/ScienceLabsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { PvPQuizArenaPage } from './pages/PvPQuizArenaPage';
import { AboutUsPage } from './pages/AboutUsPage';
import { AuthModal } from './components/common/AuthModal';
import { StudentAIChatWidget } from './components/common/StudentAIChatWidget';
import { CursorEffect } from './components/common/CursorEffect';
import {
  LayoutDashboard,
  Calendar,
  Sparkles,
  MessageSquare,
  Menu,
  Layers,
  CheckCircle2,
  Lock,
} from 'lucide-react';

const MainApp: React.FC = () => {
  const { activeRole, userProfile, updateCurrentUserBatch } = useAuth();
  const { batches } = useBatch();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [tutorInitialTopic, setTutorInitialTopic] = useState<string>('');
  const [pendingBatchPick, setPendingBatchPick] = useState<string>('');
  const [savingBatchPick, setSavingBatchPick] = useState<boolean>(false);
  const [batchPickError, setBatchPickError] = useState<string | null>(null);

  // Close authentication modal as soon as user is authenticated
  useEffect(() => {
    if (userProfile && authModalOpen) {
      setAuthModalOpen(false);
    }
  }, [userProfile, authModalOpen]);

  const needsStudentBatchSelection =
    !!userProfile && activeRole === 'student' && !userProfile.batchId && batches.length > 0;

  const handleConfirmStudentBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBatch = batches.find((b) => b.id === pendingBatchPick);
    if (!targetBatch) return;
    setSavingBatchPick(true);
    setBatchPickError(null);
    try {
      await updateCurrentUserBatch(targetBatch.id, targetBatch.name);
      setPendingBatchPick('');
    } catch (err: any) {
      setBatchPickError(err?.message || 'Unable to assign batch.');
    } finally {
      setSavingBatchPick(false);
    }
  };

  const handleLaunchTutorTopic = (topic: string) => {
    setTutorInitialTopic(topic);
    setCurrentPage('tutor');
  };

  const renderRoleDashboard = () => {
    if (!userProfile) {
      return (
        <GuestPortalLanding
          onOpenAuthModal={() => setAuthModalOpen(true)}
          onNavigate={setCurrentPage}
        />
      );
    }
    if (activeRole === 'admin') {
      return <AdminDashboard onNavigate={setCurrentPage} />;
    }
    if (activeRole === 'teacher') {
      return <TeacherDashboard onNavigate={setCurrentPage} />;
    }
    if (activeRole === 'parent') {
      return <ParentDashboard onNavigate={setCurrentPage} />;
    }
    return (
      <StudentDashboard
        onNavigate={setCurrentPage}
        onLaunchTutorTopic={handleLaunchTutorTopic}
      />
    );
  };

  const renderCurrentPage = () => {
    if (currentPage === 'admin_panel' || currentPage.startsWith('admin_panel:')) {
      const subTab = currentPage.includes(':')
        ? (currentPage.split(':')[1] as any)
        : 'branding';
      return activeRole === 'admin' ? (
        <AdminMasterControlPage
          key={subTab}
          initialTab={subTab}
          onNavigate={setCurrentPage}
        />
      ) : (
        renderRoleDashboard()
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return renderRoleDashboard();

      case 'teacher_panel':
        return userProfile && (activeRole === 'teacher' || activeRole === 'admin') ? (
          <TeacherPanelPage onNavigate={setCurrentPage} />
        ) : (
          renderRoleDashboard()
        );

      case 'classes':
        return <ClassesPage />;
      case 'subjects':
        return <SubjectsPage />;
      case 'labs':
        return <ScienceLabsPage />;
      case 'materials':
        return <MaterialsPage />;
      case 'assignments':
        return <AssignmentsPage />;
      case 'quizzes':
        return <QuizzesPage />;
      case 'pvp_quiz':
        return (
          <PvPQuizArenaPage
            initialTab="arena"
            onOpenAuthModal={() => setAuthModalOpen(true)}
          />
        );
      case 'leaderboard':
        return (
          <PvPQuizArenaPage
            initialTab="leaderboard"
            onOpenAuthModal={() => setAuthModalOpen(true)}
          />
        );
      case 'assessments':
        return <AssessmentsPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'timetable':
        return <TimetablePage />;
      case 'calendar':
        return <CalendarPage initialTab="attendance" />;
      case 'announcements':
        return <AnnouncementsPage />;
      case 'messages':
        return <MessagesPage />;
      case 'discussions':
        return <DiscussionsPage onOpenAuthModal={() => setAuthModalOpen(true)} />;
      case 'tutor':
        return <TutorPage initialTopic={tutorInitialTopic} />;
      case 'teacher_assistant':
        return userProfile && (activeRole === 'teacher' || activeRole === 'admin') ? (
          <TeacherAssistantPage />
        ) : (
          renderRoleDashboard()
        );
      case 'insights':
        return renderRoleDashboard();
      case 'users_admin':
        return userProfile && activeRole === 'admin' ? (
          <UsersAdminPage />
        ) : (
          renderRoleDashboard()
        );
      case 'profile':
        return <ProfilePage />;
      case 'about':
        return <AboutUsPage onNavigate={setCurrentPage} />;
      case 'settings':
        return userProfile && activeRole === 'admin' ? (
          <SettingsPage />
        ) : (
          renderRoleDashboard()
        );
      default:
        return renderRoleDashboard();
    }
  };

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans selection:bg-blue-100 selection:text-blue-900 transition-colors duration-200">
      {/* 1. TOP HEADER */}
      <Header
        onOpenProfile={() => setCurrentPage('profile')}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onNavigate={setCurrentPage}
        onToggleMobileMenu={() => setMobileNavOpen(!mobileNavOpen)}
      />

      {/* 2. BODY CONTAINER: DOCKED COLLEGIATE SIDEBAR + MAIN CONTENT */}
      <div className="flex flex-1 overflow-hidden w-full min-w-0">
        {/* Desktop Docked Sidebar */}
        <div className="hidden md:flex shrink-0 h-full">
          <Sidebar
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenAuthModal={() => setAuthModalOpen(true)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Mobile Off-Canvas Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden h-dvh">
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative flex flex-col h-full max-h-dvh min-h-0 z-10 animate-in slide-in-from-left duration-200 shadow-2xl">
              <Sidebar
                currentPage={currentPage}
                onNavigate={(page) => {
                  setCurrentPage(page);
                  setMobileNavOpen(false);
                }}
                onOpenAuthModal={() => {
                  setAuthModalOpen(true);
                  setMobileNavOpen(false);
                }}
                onCloseMobile={() => setMobileNavOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 lg:px-8 py-4 sm:py-6 w-full min-w-0">
          <div className="mx-auto max-w-7xl pb-24 md:pb-10 w-full min-w-0 space-y-10">
            {renderCurrentPage()}

            <footer className="border-t border-slate-200/80 dark:border-slate-800 pt-5 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <p>
                &copy; {new Date().getFullYear()} M. N. M. Jaasim · Zahira College Mawanella Science Project EM
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setCurrentPage('about')}
                  className="font-semibold text-blue-900 dark:text-blue-400 hover:underline underline-offset-4"
                >
                  About Us &amp; Copyrights
                </button>
                <a
                  href="https://www.linkedin.com/in/m-n-m-jaasim-9ab879380/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 hover:underline underline-offset-4"
                >
                  Developer LinkedIn
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe shadow-lg"
      >
        <div className="grid grid-cols-5 items-center h-14 px-1">
          {[
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'tutor', label: 'Gemini AI', icon: Sparkles },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] py-1 rounded-xl transition-colors ${
                  isActive
                    ? 'text-blue-900 dark:text-blue-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-red-600 dark:text-red-400' : ''}`} />
                <span className="text-[10px] leading-tight mt-0.5 truncate max-w-full px-0.5">
                  {item.label}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex flex-col items-center justify-center min-h-[44px] py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] leading-tight mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* Mandatory Academic Batch Selection Modal for Google / Unassigned Students */}
      {needsStudentBatchSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-900 text-amber-400 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                  Select Your Academic Batch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your portal content, marks, attendance, chats, and discussion room will strictly sync to your batch.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[11px] font-medium text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Permanent One-Time Selection:</strong> Once confirmed, students cannot change their academic batch.
              </span>
            </div>

            {batchPickError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {batchPickError}
              </div>
            )}

            <form onSubmit={handleConfirmStudentBatch} className="space-y-3">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {batches.map((b) => {
                  const selected = pendingBatchPick === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPendingBatchPick(b.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-all flex items-center justify-between gap-2 ${
                        selected
                          ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-950 dark:text-blue-100 ring-2 ring-blue-500/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold">{b.name}</p>
                        {(b.academicYear || b.description) && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {[b.academicYear, b.description].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                      {selected && <CheckCircle2 className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={!pendingBatchPick || savingBatchPick}
                className="w-full rounded-xl bg-blue-900 hover:bg-blue-950 disabled:opacity-50 text-white font-bold py-2.5 text-xs transition-colors shadow-sm inline-flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span>{savingBatchPick ? 'Locking Batch...' : 'Confirm & Lock Batch'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating AI Chat Widget */}
      <StudentAIChatWidget onNavigate={setCurrentPage} />

      {/* Global Interactive Cursor & Tap Burst Effect */}
      <CursorEffect />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BatchProvider>
          <SiteConfigProvider>
            <MainApp />
          </SiteConfigProvider>
        </BatchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
