import {
  AttendanceDayControl,
  AttendanceRecord,
  AttendanceStatus,
  RosterStudent,
  UserProfile,
} from '../types';
import { isFakeAttendanceStudentKey } from '../services/dataService';
import { ALL_BATCHES_ID, DEFAULT_BATCH_ID, resolveItemBatchId } from '../context/BatchContext';

/**
 * Builds a deterministic Firestore document ID for an attendance register.
 * Backwards-compatible with daily records (`att-${date}-${classId}`),
 * while supporting multiple distinct class/period sessions on the same date.
 */
export function buildAttendanceRecordId(
  date: string,
  classId?: string,
  sessionId?: string,
  batchId?: string
): string {
  const safeClassId = classId || 'general';
  const resolvedBatch = batchId && batchId !== ALL_BATCHES_ID ? resolveItemBatchId(batchId) : DEFAULT_BATCH_ID;
  const batchPrefix = resolvedBatch === DEFAULT_BATCH_ID ? 'att' : `att-${resolvedBatch}`;
  if (!sessionId || sessionId === 'daily') {
    return `${batchPrefix}-${date}-${safeClassId}`;
  }
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${batchPrefix}-${date}-${safeClassId}__${safeSessionId}`;
}

/**
 * Builds a batch-isolated Firestore document ID for per-date attendance ON/OFF toggles.
 */
export function buildAttendanceDayControlId(date: string, batchId?: string): string {
  const resolved = resolveItemBatchId(batchId);
  return `${resolved}__${date}`;
}

/**
 * Resolves the AttendanceDayControl record for a given YYYY-MM-DD date and optional batchId.
 * Supports batch-keyed docs (`${batchId}__${date}`) as well as legacy `${date}` docs for DEFAULT_BATCH_ID.
 */
export function resolveDayControlForDate(
  date: string,
  dayControlsMap: Record<string, AttendanceDayControl>,
  batchId?: string
): AttendanceDayControl | undefined {
  if (!date) return undefined;
  const resolvedBatch = resolveItemBatchId(batchId);
  const batchKey = `${resolvedBatch}__${date}`;
  if (dayControlsMap[batchKey]) return dayControlsMap[batchKey];

  // Legacy fallback for default batch only
  if (resolvedBatch === DEFAULT_BATCH_ID && dayControlsMap[date]) {
    return dayControlsMap[date];
  }

  // Fallback search across map values
  for (const ctrl of Object.values(dayControlsMap)) {
    if (ctrl.date === date && resolveItemBatchId(ctrl.batchId) === resolvedBatch) {
      return ctrl;
    }
  }
  return undefined;
}

/**
 * Determines whether attendance marking & dashboard graph sync is turned ON for a given YYYY-MM-DD date (and batch).
 * Defaults to ON (true) unless explicitly turned OFF by a Teacher or Admin.
 */
export function isAttendanceDateEnabled(
  date: string,
  dayControlsMap: Record<string, AttendanceDayControl>,
  batchId?: string
): boolean {
  if (!date) return false;
  const control = resolveDayControlForDate(date, dayControlsMap, batchId);
  return control ? control.enabled !== false : true;
}

/**
 * Returns only real student attendance entries from a saved AttendanceRecord,
 * filtering out legacy seed/fake student keys and (optionally) keys not present in the active roster/user set.
 */
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

/**
 * Checks whether a saved AttendanceRecord should be synced to Teacher/Student/Admin/Parent graphs & KPIs.
 * Strictly requires non-empty real saved records, matching batch (unless viewing all batches), AND the day's attendance toggle to be ON.
 */
export function isAttendanceRecordActive(
  rec: AttendanceRecord,
  dayControlsMap: Record<string, AttendanceDayControl>,
  validStudentIds?: Set<string>,
  batchId?: string
): boolean {
  if (!rec || !rec.date || !rec.records) return false;
  if (rec.id?.startsWith('att-seed-') || rec.id?.startsWith('att-demo-')) return false;
  const isAllBatches = batchId === ALL_BATCHES_ID;
  const targetBatch = batchId && !isAllBatches ? resolveItemBatchId(batchId) : resolveItemBatchId(rec.batchId);
  if (batchId && !isAllBatches && resolveItemBatchId(rec.batchId) !== targetBatch) return false;
  if (!isAttendanceDateEnabled(rec.date, dayControlsMap, targetBatch)) return false;
  return Object.keys(getValidAttendanceRecordsMap(rec, validStudentIds)).length > 0;
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
