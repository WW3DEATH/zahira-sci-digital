import {
  AttendanceDayControl,
  AttendanceRecord,
  AttendanceStatus,
  RosterStudent,
  UserProfile,
} from '../types';
import { isFakeAttendanceStudentKey } from '../services/dataService';

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

export function isAttendanceDateEnabled(
  date: string,
  dayControlsMap: Record<string, AttendanceDayControl>
): boolean {
  if (!date) return false;
  const control = dayControlsMap[date];
  return control ? control.enabled !== false : true;
}

export function getValidAttendanceRecordsMap(
  rec: AttendanceRecord,
  validStudentIds?: Set<string>
): Record<string, AttendanceStatus> {
  if (!rec?.records) return {};
  const result: Record<string, AttendanceStatus> = {};
  for (const [key, status] of Object.entries(rec.records)) {
    if (isFakeAttendanceStudentKey(key)) continue;
    if (validStudentIds && validStudentIds.size > 0 && !validStudentIds.has(key)) continue;
    if (status) result[key] = status;
  }
  return result;
}

export function isAttendanceRecordActive(
  rec: AttendanceRecord,
  dayControlsMap: Record<string, AttendanceDayControl>,
  validStudentIds?: Set<string>
): boolean {
  if (!rec || !rec.date || !rec.records) return false;
  if (rec.id?.startsWith('att-seed-') || rec.id?.startsWith('att-demo-')) return false;
  if (!isAttendanceDateEnabled(rec.date, dayControlsMap)) return false;
  return Object.keys(getValidAttendanceRecordsMap(rec, validStudentIds)).length > 0;
}

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
