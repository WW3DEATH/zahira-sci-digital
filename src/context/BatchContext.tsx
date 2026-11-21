import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc } from '../firebase';
import { SchoolBatch } from '../types';
import { useAuth } from './AuthContext';

export const DEFAULT_BATCH_ID = 'batch-2k28-sci-em';
export const DEFAULT_BATCH_NAME = '2k28 Science EM';
export const ALL_BATCHES_ID = 'all';
export const ALL_BATCHES_NAME = 'All Batches';

const STORAGE_ACTIVE_BATCH_KEY = 'znc_active_batch_id';

export function resolveItemBatchId(itemBatchId?: string): string {
  const trimmed = itemBatchId?.trim();
  if (!trimmed || trimmed === ALL_BATCHES_ID) return DEFAULT_BATCH_ID;
  return trimmed;
}

export function isInBatch(itemBatchId: string | undefined, targetBatchId: string): boolean {
  const target = targetBatchId && targetBatchId.trim() ? targetBatchId.trim() : DEFAULT_BATCH_ID;
  if (target === ALL_BATCHES_ID) return true;
  return resolveItemBatchId(itemBatchId) === target;
}

interface BatchContextType {
  batches: SchoolBatch[];
  loadingBatches: boolean;
  activeBatchId: string;
  activeBatch: SchoolBatch | null;
  defaultBatch: SchoolBatch;
  isViewingAllBatches: boolean;
  resolveWriteBatchId: (candidateBatchId?: string) => string;
  setActiveBatchId: (batchId: string) => void;
  isBatchLocked: boolean;
  getBatchName: (batchId?: string) => string;
  addBatch: (data: { name: string; academicYear?: string; description?: string; isDefault?: boolean }) => Promise<SchoolBatch>;
  updateBatch: (batchId: string, data: Partial<Pick<SchoolBatch, 'name' | 'academicYear' | 'description' | 'isDefault' | 'isActive'>>) => Promise<void>;
  deleteBatch: (batchId: string) => Promise<void>;
}

const BatchContext = createContext<BatchContextType | undefined>(undefined);

const FALLBACK_DEFAULT_BATCH: SchoolBatch = {
  id: DEFAULT_BATCH_ID,
  name: DEFAULT_BATCH_NAME,
  academicYear: '2026-2028',
  description: 'Zahira College Mawanella GCE A/L Science English Medium Cohort',
  isDefault: true,
  isActive: true,
  createdAt: new Date().toISOString(),
};

export const BatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile, activeRole } = useAuth();
  const [batches, setBatches] = useState<SchoolBatch[]>([FALLBACK_DEFAULT_BATCH]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(true);
  const [staffBatchId, setStaffBatchId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_ACTIVE_BATCH_KEY) || ALL_BATCHES_ID;
    } catch {
      return ALL_BATCHES_ID;
    }
  });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'batches'),
      async (snap) => {
        if (snap.empty) {
          // Auto-seed default batch on first load
          setBatches([FALLBACK_DEFAULT_BATCH]);
          setLoadingBatches(false);
          try {
            await setDoc(
              doc(db, 'batches', DEFAULT_BATCH_ID),
              sanitizeFirestoreDoc(FALLBACK_DEFAULT_BATCH),
              { merge: true }
            );
          } catch (err) {
            console.warn('Default batch auto-seed notice:', err);
          }
          return;
        }

        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SchoolBatch, 'id'>),
        })) as SchoolBatch[];

        list.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.name.localeCompare(b.name);
        });

        setBatches(list);
        setLoadingBatches(false);
      },
      (err) => {
        console.warn('Batches snapshot error:', err);
        setBatches([FALLBACK_DEFAULT_BATCH]);
        setLoadingBatches(false);
      }
    );

    return () => unsub();
  }, []);

  const isBatchLocked = activeRole === 'student' || activeRole === 'parent';

  const defaultBatch = useMemo(() => {
    return batches.find((b) => b.isDefault) || batches[0] || FALLBACK_DEFAULT_BATCH;
  }, [batches]);

  const activeBatchId = useMemo(() => {
    if (isBatchLocked) {
      const assigned = resolveItemBatchId(userProfile?.batchId);
      const exists = batches.some((b) => b.id === assigned);
      if (exists) return assigned;
      return assigned;
    }

    if (staffBatchId === ALL_BATCHES_ID) {
      return ALL_BATCHES_ID;
    }

    if (batches.some((b) => b.id === staffBatchId)) {
      return staffBatchId;
    }
    return ALL_BATCHES_ID;
  }, [isBatchLocked, userProfile?.batchId, batches, staffBatchId]);

  const isViewingAllBatches = !isBatchLocked && activeBatchId === ALL_BATCHES_ID;

  const activeBatch = useMemo<SchoolBatch | null>(() => {
    if (isViewingAllBatches) {
      return {
        id: ALL_BATCHES_ID,
        name: `${ALL_BATCHES_NAME} (${batches.length})`,
        academicYear: 'Multi-Batch View',
        description: 'Combined overview across all active academic batches.',
        isDefault: false,
        isActive: true,
        createdAt: '',
      };
    }
    return (
      batches.find((b) => b.id === activeBatchId) ||
      defaultBatch
    );
  }, [isViewingAllBatches, batches, activeBatchId, defaultBatch]);

  const resolveWriteBatchId = (candidateBatchId?: string): string => {
    if (isBatchLocked) {
      return resolveItemBatchId(userProfile?.batchId);
    }
    const clean = candidateBatchId?.trim();
    if (clean && clean !== ALL_BATCHES_ID && batches.some((b) => b.id === clean)) {
      return clean;
    }
    if (activeBatchId && activeBatchId !== ALL_BATCHES_ID && batches.some((b) => b.id === activeBatchId)) {
      return activeBatchId;
    }
    return defaultBatch.id;
  };

  const setActiveBatchId = (batchId: string) => {
    if (isBatchLocked) return;
    const next = batchId && batchId.trim() ? batchId.trim() : ALL_BATCHES_ID;
    setStaffBatchId(next);
    try {
      localStorage.setItem(STORAGE_ACTIVE_BATCH_KEY, next);
    } catch {}
  };

  const getBatchName = (batchId?: string): string => {
    if (batchId === ALL_BATCHES_ID) return `${ALL_BATCHES_NAME} (${batches.length})`;
    const resolved = resolveItemBatchId(batchId);
    const found = batches.find((b) => b.id === resolved);
    if (found) return found.name;
    if (resolved === DEFAULT_BATCH_ID) return DEFAULT_BATCH_NAME;
    return resolved;
  };

  const addBatch = async (data: {
    name: string;
    academicYear?: string;
    description?: string;
    isDefault?: boolean;
  }): Promise<SchoolBatch> => {
    const cleanName = data.name.trim();
    if (!cleanName) throw new Error('Batch name is required.');

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const batchId = `batch-${slug || Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    const newBatch: SchoolBatch = {
      id: batchId,
      name: cleanName,
      academicYear: data.academicYear?.trim() || '',
      description: data.description?.trim() || '',
      isDefault: !!data.isDefault,
      isActive: true,
      createdBy: userProfile?.userId || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (data.isDefault) {
      for (const existing of batches) {
        if (existing.isDefault && existing.id !== batchId) {
          await setDoc(doc(db, 'batches', existing.id), { isDefault: false }, { merge: true }).catch(() => {});
        }
      }
    }

    await setDoc(doc(db, 'batches', batchId), sanitizeFirestoreDoc(newBatch));
    return newBatch;
  };

  const updateBatch = async (
    batchId: string,
    data: Partial<Pick<SchoolBatch, 'name' | 'academicYear' | 'description' | 'isDefault' | 'isActive'>>
  ): Promise<void> => {
    if (data.isDefault) {
      for (const existing of batches) {
        if (existing.isDefault && existing.id !== batchId) {
          await setDoc(doc(db, 'batches', existing.id), { isDefault: false }, { merge: true }).catch(() => {});
        }
      }
    }
    await setDoc(
      doc(db, 'batches', batchId),
      sanitizeFirestoreDoc({
        ...data,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  };

  const deleteBatch = async (batchId: string): Promise<void> => {
    if (batches.length <= 1) {
      throw new Error('Cannot remove the last remaining batch. Create another batch first.');
    }
    const target = batches.find((b) => b.id === batchId);
    await deleteDoc(doc(db, 'batches', batchId));

    if (target?.isDefault) {
      const remaining = batches.find((b) => b.id !== batchId);
      if (remaining) {
        await setDoc(doc(db, 'batches', remaining.id), { isDefault: true }, { merge: true }).catch(() => {});
      }
    }
    if (staffBatchId === batchId) {
      setActiveBatchId(ALL_BATCHES_ID);
    }
  };

  return (
    <BatchContext.Provider
      value={{
        batches,
        loadingBatches,
        activeBatchId,
        activeBatch,
        defaultBatch,
        isViewingAllBatches,
        resolveWriteBatchId,
        setActiveBatchId,
        isBatchLocked,
        getBatchName,
        addBatch,
        updateBatch,
        deleteBatch,
      }}
    >
      {children}
    </BatchContext.Provider>
  );
};

export const useBatch = () => {
  const ctx = useContext(BatchContext);
  if (!ctx) {
    throw new Error('useBatch must be used within a BatchProvider');
  }
  return ctx;
};
