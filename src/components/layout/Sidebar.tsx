import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  CalendarCheck2,
  Calendar,
  BookOpen,
  FileText,
  BarChart3,
  ShoppingBag,
  Bell,
  User,
  LogOut,
  LogIn,
  FlaskConical,
  Sparkles,
  CheckCircle2,
  MessagesSquare,
  MessageSquare,
  Users,
  Settings,
  GraduationCap,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Swords,
  Trophy,
  Info,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSiteConfig } from '../../context/SiteConfigContext';
import { ZahiraLogo } from '../common/ZahiraLogo';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenAuthModal?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavSection {
  key: string;
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  onOpenAuthModal,
  collapsed = false,
  onToggleCollapse,
  onCloseMobile,
}) => {
  const { userProfile, activeRole, signOut } = useAuth();
  const { siteConfig } = useSiteConfig();
  const [menuFilter, setMenuFilter] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    core: true,
    academics: true,
    community: false,
    account: false,
  });

  const sections: NavSection[] = [
    {
      key: 'core',
      title: 'Core',
      items: [
        { id: 'dashboard', label: 'Dashboard', hint: 'Overview, stats & quick shortcuts', icon: LayoutDashboard },
        ...(activeRole === 'admin'
          ? [{ id: 'admin_panel', label: 'Admin Panel', hint: 'Full school control & settings', icon: ShieldCheck, badge: 'Admin' }]
          : []),
        ...(activeRole === 'teacher'
          ? [{ id: 'teacher_panel', label: 'Teacher Panel', hint: 'Classes, grading & faculty tools', icon: ShieldCheck, badge: 'Faculty' }]
          : []),
        { id: 'attendance', label: 'Attendance', hint: 'Daily roll-call, streams & QR', icon: CalendarCheck2 },
        { id: 'assessments', label: 'Marks & Exams', hint: 'Term marks, streams & report cards', icon: BarChart3 },
      ],
    },
    {
      key: 'academics',
      title: 'Academics',
      items: [
        { id: 'assignments', label: 'Assignments', hint: 'Tasks, due dates & submissions', icon: FileText },
        { id: 'materials', label: 'Materials', hint: 'Notes, past papers & PDF packs', icon: ShoppingBag },
        { id: 'quizzes', label: 'Quizzes', hint: 'Practice tests & instant scoring', icon: CheckCircle2 },
        { id: 'labs', label: 'Science Labs', hint: 'Interactive science simulations', icon: FlaskConical },
        { id: 'classes', label: 'Classes', hint: 'Batch groups & class sessions', icon: GraduationCap },
        { id: 'subjects', label: 'Subjects', hint: 'Physics, Chem, Maths & Bio units', icon: BookOpen },
        { id: 'timetable', label: 'Timetable', hint: 'Weekly class schedule & room slots', icon: Clock },
        { id: 'calendar', label: 'Calendar', hint: 'Events, attendance & class recordings', icon: Calendar },
      ],
    },
    {
      key: 'community',
      title: 'AI & Community',
      items: [
        { id: 'tutor', label: 'AI Tutor', hint: 'Ask any math or science question', icon: Sparkles, badge: 'AI' },
        ...(activeRole === 'teacher' || activeRole === 'admin'
          ? [{ id: 'teacher_assistant', label: 'Teacher AI', hint: 'Lesson plans, notes & rubrics', icon: BrainCircuit }]
          : []),
        { id: 'pvp_quiz', label: 'PvP Arena', hint: '1v1 live quiz duels', icon: Swords, badge: 'Live' },
        { id: 'leaderboard', label: 'Leaderboard', hint: 'Top 20 week, month & year', icon: Trophy },
        { id: 'discussions', label: 'Discussions', hint: 'Live group chat & study topics', icon: MessagesSquare },
        { id: 'messages', label: 'Messages', hint: '1-on-1 consultations & requests', icon: MessageSquare },
        { id: 'announcements', label: 'Notices', hint: 'Official circulars & bulletins', icon: Bell },
      ],
    },
    {
      key: 'account',
      title: activeRole === 'admin' ? 'Account & Admin' : 'Account',
      items: [
        { id: 'profile', label: 'Profile', hint: 'Student ID, role & account info', icon: User },
        ...(activeRole === 'admin'
          ? [
              { id: 'users_admin', label: 'Users', hint: 'Manage students, teachers & IDs', icon: Users },
              { id: 'settings', label: 'Settings', hint: 'Portal configuration & preferences', icon: Settings },
            ]
          : []),
        { id: 'about', label: 'About', hint: 'Zahira College Mawanella Science Project EM', icon: Info },
      ],
    },
  ];

  // Auto-expand the group containing the currently active page
  useEffect(() => {
    const ownerSection = sections.find((sec) => sec.items.some((item) => item.id === currentPage));
    if (ownerSection && !openGroups[ownerSection.key]) {
      setOpenGroups((prev) => ({ ...prev, [ownerSection.key]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const normalizedFilter = menuFilter.trim().toLowerCase();
  const isFiltering = normalizedFilter.length > 0;
  const filteredSections = isFiltering
    ? sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.label.toLowerCase().includes(normalizedFilter) ||
              item.hint.toLowerCase().includes(normalizedFilter)
          ),
        }))
        .filter((section) => section.items.length > 0)
    : sections;

  return (
    <aside
      className={`flex flex-col h-full max-h-dvh min-h-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 select-none shrink-0 ${
        collapsed ? 'w-[68px]' : 'w-[80vw] max-w-[270px] md:w-56'
      }`}
    >
      {/* Top Branding Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            <ZahiraLogo size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-blue-950 dark:text-slate-100 truncate">
                {siteConfig.schoolName || 'Zahira College Mawanella Science Project EM'}
              </p>
              <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider truncate">
                {activeRole === 'guest' ? 'Visitor' : `${activeRole} Portal`}
              </p>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex justify-center w-full">
            <ZahiraLogo size="xs" />
          </div>
        )}

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
            title="Close Menu"
            aria-label="Close Menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Compact Quick Filter (Desktop & Mobile when expanded) */}
      {!collapsed && (
        <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={menuFilter}
              onChange={(e) => setMenuFilter(e.target.value)}
              placeholder="Quick jump..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-7 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {menuFilter && (
              <button
                type="button"
                onClick={() => setMenuFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compressed Accordion Navigation Links */}
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y sidebar-menu-scroll side-view-scrollbar px-2 py-2.5 space-y-2.5">
        {filteredSections.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-slate-400">
            No matching pages.
          </div>
        ) : (
          filteredSections.map((section) => {
            const isExpanded = collapsed || isFiltering || Boolean(openGroups[section.key]);
            return (
              <div key={section.key}>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.key)}
                    className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        isExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </button>
                )}

                {isExpanded && (
                  <div className="space-y-0.5 mt-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            onNavigate(item.id);
                            setMenuFilter('');
                          }}
                          title={collapsed ? item.label : item.hint}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 min-h-[38px] md:min-h-[34px] rounded-lg text-left text-xs font-semibold transition-all ${
                            collapsed ? 'justify-center' : 'justify-between'
                          } ${
                            isActive
                              ? 'bg-blue-900 text-white shadow-2xs'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-950 dark:hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-red-400' : 'text-slate-400 dark:text-slate-400'
                              }`}
                            />
                            {!collapsed && (
                              <span className="truncate whitespace-nowrap leading-tight">
                                {item.label}
                              </span>
                            )}
                          </div>
                          {!collapsed && item.badge && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                                isActive
                                  ? 'bg-red-600 text-white'
                                  : 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      {/* Bottom Auth Action Footer */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800 shrink-0 pb-safe">
        {userProfile ? (
          <button
            type="button"
            onClick={signOut}
            className={`w-full flex items-center gap-2 px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuthModal}
            className={`w-full flex items-center gap-2 px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-bold bg-blue-900 hover:bg-blue-950 text-white transition-colors shadow-xs ${
              collapsed ? 'justify-center' : ''
            }`}
            title="Sign In"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign In / Register</span>}
          </button>
        )}
      </div>
    </aside>
  );
};
