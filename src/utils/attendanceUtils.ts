import {
  AttendanceDayControl,
  AttendanceRecord,
  AttendanceStatus,
  RosterStudent,
  UserProfile,
} from '../types';

/**
 * Builds a deterministic Firestore document ID for an attendance register.
 * Backwards-compatible with daily records (`att-${date}-${classId}`),
 * while supporting multiple distinct class/period sessions on the same date.
 */
export function buildAttendanceRecordId(
  date: string,
  classId?: string,
  sessionId?: string
): string {
  const safeClassId = classId || 'general';
  if (!sessionId || sessionId === 'daily') {
    return `att-${date}-${safeClassId}`;
  }
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `att-${date}-${safeClassId}__${safeSessionId}`;
}

/**
 * Determines whether attendance marking & dashboard graph sync is turned ON for a given YYYY-MM-DD date.
 * Defaults to ON (true) unless explicitly turned OFF by a Teacher or Admin.
 */
export function isAttendanceDateEnabled(
  date: string,
  dayControlsMap: Record<string, AttendanceDayControl>
): boolean {
  if (!date) return false;
  const control = dayControlsMap[date];
  return control ? control.enabled !== false : true;
}

/**
 * Checks whether a saved AttendanceRecord should be synced to Teacher/Student/Admin/Parent graphs & KPIs.
 * Strictly requires non-empty saved records AND the day's attendance toggle to be ON.
 */
export function isAttendanceRecordActive(
  rec: AttendanceRecord,
  dayControlsMap: Record<string, AttendanceDayControl>
): boolean {
  if (!rec || !rec.date || !rec.records) return false;
  if (Object.keys(rec.records).length === 0) return false;
  return isAttendanceDateEnabled(rec.date, dayControlsMap);
}

/**
 * Resolves all candidate student IDs (Firebase UID + matching roll-call roster IDs by index or name)
 * so attendance marked for roster entries accurately syncs to the logged-in student's account.
 */
export function getMatchingStudentIds(
  userProfile: Pick<UserProfile, 'userId' | 'indexNumber' | 'fullName'> | null | undefined,
  rosterStudents: RosterStudent[]
): string[] {
  const normalizedTargetName = userProfile?.fullName?.trim().toLowerCase();
  const trimmedTargetIndex = userProfile?.indexNumber?.trim();

  const matchingRosterIds = rosterStudents
    .filter((s) => {
      if (userProfile?.userId && s.id === userProfile.userId) return true;
      if (trimmedTargetIndex && s.indexNumber && s.indexNumber.trim() === trimmedTargetIndex) {
        return true;
      }
      if (normalizedTargetName && s.fullName && s.fullName.trim().toLowerCase() === normalizedTargetName) {
        return true;
      }
      return false;
    })
    .map((s) => s.id);

  return Array.from(new Set([userProfile?.userId, ...matchingRosterIds].filter(Boolean) as string[]));
}

/**
 * Looks up a student's attendance status inside a single AttendanceRecord across candidate IDs.
 */
export function resolveStudentStatusInRecord(
  rec: AttendanceRecord,
  candidateIds: string[]
): AttendanceStatus | undefined {
  if (!rec?.records) return undefined;
  for (const cid of candidateIds) {
    const status = rec.records[cid];
    if (status) return status;
  }
  return undefined;
}
