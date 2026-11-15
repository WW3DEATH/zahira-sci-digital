import { collection, doc, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc } from '../firebase';
import { AppNotification, Assignment, Submission } from '../types';

export interface BroadcastNotificationParams {
  title: string;
  message: string;
  type: AppNotification['type'];
  link?: string;
  audience?: 'all' | 'students' | 'teachers' | 'admin' | 'user';
  userId?: string;
}

const APP_ICON_URL = '/assets/aistudio/image_27ea2622.png';
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Registers the lightweight service worker (/sw.js) so Android Chrome, desktop Chrome/Edge,
 * and installed PWAs can display real OS-level notifications via ServiceWorkerRegistration.showNotification().
 */
export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        try {
          const readyReg = await navigator.serviceWorker.ready;
          return readyReg || reg;
        } catch {
          return reg;
        }
      })
      .catch((err) => {
        console.warn('Service worker registration note:', err);
        return null;
      });
  }
  return swRegistrationPromise;
}

/**
 * Triggers a real OS / Device / Browser Notification if permission is granted.
 * Uses ServiceWorkerRegistration.showNotification first (required on mobile browsers),
 * falling back cleanly to window.Notification on desktop browsers.
 */
export async function triggerBrowserNotification(
  title: string,
  options?: { body?: string; tag?: string; link?: string }
): Promise<boolean> {
  if (!isBrowserNotificationSupported()) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const cleanBody = options?.body || 'Zahira College 2k28 Science EM academic alert.';
  const notifOptions: NotificationOptions = {
    body: cleanBody,
    icon: APP_ICON_URL,
    badge: APP_ICON_URL,
    tag: options?.tag || `znc-${Date.now()}`,
    data: {
      link: options?.link || 'dashboard',
      url: '/',
    },
  };

  // Prefer ServiceWorkerRegistration.showNotification (works on Android, mobile browsers, and desktop)
  try {
    const reg = await registerNotificationServiceWorker();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, notifOptions);
      return true;
    }
  } catch (swErr) {
    console.warn('Service worker showNotification fallback:', swErr);
  }

  // Desktop Notification API fallback
  try {
    const notif = new Notification(title, notifOptions);
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch {}
    };
    return true;
  } catch (e) {
    console.warn('Browser notification trigger failed:', e);
    return false;
  }
}

/**
 * Requests browser & device notification permission from the user and registers the service worker.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) {
    return 'denied';
  }
  try {
    await registerNotificationServiceWorker();
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
}

export async function sendTestBrowserNotification(): Promise<boolean> {
  return triggerBrowserNotification('Zahira College 2k28 Science EM', {
    body: 'Device and browser notifications are now active for school alerts and messages.',
    tag: `znc-test-${Date.now()}`,
    link: 'dashboard',
  });
}

/**
 * Broadcasts an announcement, material upload, assignment creation, or discussion
 * to all students and teachers via Firestore, while triggering desktop notifications.
 */
export async function broadcastSystemNotification(params: BroadcastNotificationParams): Promise<void> {
  const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const notification: AppNotification = {
    id: notifId,
    userId: params.userId || 'all',
    audience: params.audience || 'all',
    title: params.title,
    message: params.message,
    type: params.type,
    link: params.link || 'dashboard',
    read: false,
    readBy: [],
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'notifications', notifId), sanitizeFirestoreDoc(notification));
  } catch (err) {
    console.warn('Failed to save broadcast notification to Firestore:', err);
  }

  // Also trigger local browser notification immediately
  triggerBrowserNotification(params.title, { body: params.message, tag: notifId });
}

/**
 * Sends a private direct notification targeted EXCLUSIVELY to one receiver in Notification Center.
 * Does NOT broadcast to everyone.
 */
export async function sendDirectNotification(params: {
  recipientId: string;
  title: string;
  message: string;
  link?: string;
  type?: AppNotification['type'];
}): Promise<void> {
  const notifId = `notif-dm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const notification: AppNotification = {
    id: notifId,
    userId: params.recipientId, // Strict single recipient
    audience: 'user',
    title: params.title,
    message: params.message,
    type: params.type || 'message',
    link: params.link || 'messages',
    read: false,
    readBy: [],
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'notifications', notifId), sanitizeFirestoreDoc(notification));
  } catch (err) {
    console.warn('Failed to save direct message notification:', err);
  }
}

/**
 * Dispatches an automated low attendance alert exclusively to the Admin portal (< 75% attendance).
 */
export async function sendAdminAttendanceAlert(params: {
  studentId: string;
  studentName: string;
  studentIndex?: string;
  attendanceRate: number;
  totalSessions: number;
  classId?: string;
}): Promise<void> {
  const notifId = `notif-att-alert-${params.studentId}-${new Date().toISOString().split('T')[0]}`;
  const notification: AppNotification = {
    id: notifId,
    userId: 'all', // Targeted by audience
    audience: 'admin', // Strict Admin portal visibility
    title: `⚠️ Low Attendance Intervention Alert: ${params.studentName}`,
    message: `Scholar ${params.studentName}${params.studentIndex ? ` (${params.studentIndex})` : ''} has dropped to ${params.attendanceRate}% attendance across ${params.totalSessions} sessions, below the 75% institutional threshold. Please review academic status.`,
    type: 'attendance_alert',
    link: 'attendance',
    read: false,
    readBy: [],
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'notifications', notifId), sanitizeFirestoreDoc(notification), { merge: true });
  } catch (err) {
    console.warn('Failed to dispatch low attendance alert to Admin:', err);
  }

  triggerBrowserNotification(`⚠️ Low Attendance Alert: ${params.studentName}`, {
    body: `${params.studentName} is at ${params.attendanceRate}% attendance (threshold: 75%).`,
    tag: notifId,
  });
}

/**
 * Checks for unsubmitted assignments due within 24 hours and triggers native desktop alerts.
 */
export function checkUpcomingDeadlinesAndNotify(
  assignments: Assignment[],
  submissions: Submission[],
  currentUserId?: string
): Assignment[] {
  if (!currentUserId || typeof window === 'undefined') return [];

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const userSubs = submissions.filter((s) => s.studentId === currentUserId);

  const urgentAssignments: Assignment[] = [];

  assignments.forEach((assignment) => {
    // Check if already submitted
    const isSubmitted = userSubs.some((s) => s.assignmentId === assignment.id);
    if (isSubmitted) return;

    const dueTime = new Date(assignment.dueDate).getTime();
    const diff = dueTime - now;

    // Due within 24 hours and not yet past
    if (diff > 0 && diff <= oneDayMs) {
      urgentAssignments.push(assignment);

      // Check if we've already notified the user for this assignment in this session/day
      const storageKey = `zahira_alerted_due_${assignment.id}_${currentUserId}`;
      const lastAlerted = localStorage.getItem(storageKey);
      const twelveHoursMs = 12 * 60 * 60 * 1000;

      if (!lastAlerted || now - parseInt(lastAlerted, 10) > twelveHoursMs) {
        const hoursRemaining = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
        const alertTitle = `⚠️ Assignment Due in ${hoursRemaining}h: ${assignment.title}`;
        const alertBody = `Due by ${new Date(assignment.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Please finalize and submit your coursework solutions.`;

        triggerBrowserNotification(alertTitle, { body: alertBody, tag: `due-${assignment.id}` });
        localStorage.setItem(storageKey, String(now));
      }
    }
  });

  return urgentAssignments;
}
