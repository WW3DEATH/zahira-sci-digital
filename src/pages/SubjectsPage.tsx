import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Tag, ArrowRight, X } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ALL_BATCHES_ID, useBatch, isInBatch } from '../context/BatchContext';
import { Subject } from '../types';
import { SEED_SUBJECTS } from '../services/dataService';

export const SubjectsPage: React.FC = () => {
  const { activeRole, userProfile } = useAuth();
  const { batches, activeBatchId, activeBatch, resolveWriteBatchId, setActiveBatchId, isBatchLocked, getBatchName } = useBatch();
  const [subjects, setSubjects] = useState<Subject[]>(SEED_SUBJECTS);
  const [loading, setLoading] = useState(true);

  // Add Subject Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBatchId, setNewBatchId] = useState(() => resolveWriteBatchId(activeBatchId));
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');

  useEffect(() => {
    setNewBatchId(resolveWriteBatchId(activeBatchId));
  }, [activeBatchId, batches]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'subjects'),
      (snap) => {
        const list: Subject[] = [];
        snap.forEach((d) => list.push(d.data() as Subject));
        if (list.length > 0) {
          setSubjects(list);
        } else {
          setSubjects(SEED_SUBJECTS);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Real-time subjects note:', error);
        setSubjects(SEED_SUBJECTS);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleAddSubject = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    try {
      const id = `sub-${Date.now()}`;
      const targetBatchName = getBatchName(newBatchId);
      const sub: Subject = {
        id,
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        description: newDesc.trim(),
        color: newColor,
        batchId: newBatchId,
        batchName: targetBatchName,
        teacherIds: userProfile?.role === 'teacher' ? [userProfile.userId] : [],
        classIds: [],
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'subjects', id), sanitizeFirestoreDoc(sub));
      setShowAddModal(false);
      setNewCode('');
      setNewName('');
      setNewDesc('');
    } catch (e) {
      console.error('Failed to create subject:', e);
    }
  };

  const batchSubjects = subjects.filter((s) => isInBatch(s.batchId, activeBatchId));
  const activeBatchName = activeBatch?.name || '2k28 Science EM';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-stone-900">
              Academic Subjects & Disciplines
            </h2>
            <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-[11px] font-bold">
              {activeBatchName}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            G.C.E. A/L Science curricula, course codes, and faculty instructors for Zahira College {activeBatchName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isBatchLocked && (
            <select
              value={activeBatchId}
              onChange={(e) => setActiveBatchId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-800 shadow-2xs"
              aria-label="Filter subjects by batch"
            >
              <option value={ALL_BATCHES_ID}>
                All Batches ({batches.length})
              </option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch: {b.name}
                </option>
              ))}
            </select>
          )}

          {(activeRole === 'admin' || activeRole === 'teacher') && (
            <button
              onClick={() => {
                setNewBatchId(resolveWriteBatchId(activeBatchId));
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-bold text-stone-950 transition-all shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Subject</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Subjects */}
      {batchSubjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-2" />
          <h3 className="font-serif text-lg font-bold text-stone-800">
            No Subjects Assigned to {activeBatchName}
          </h3>
          <p className="text-xs text-stone-500 mt-1">
            Teachers and Admins can add subjects for this batch.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {batchSubjects.map((subj) => (
          <div
            key={subj.id}
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span
                  className="rounded-md px-2.5 py-1 text-xs font-mono font-bold text-white shadow-2xs"
                  style={{ backgroundColor: subj.color || '#0f172a' }}
                >
                  {subj.code}
                </span>
                <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  A/L Science
                </span>
              </div>

              <h3 className="font-serif text-lg font-bold text-stone-900 mb-2">{subj.name}</h3>
              <p className="text-xs text-stone-600 leading-relaxed line-clamp-3">{subj.description}</p>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-800">{subj.batchName || activeBatchName}</span>
              <span className="text-[11px] text-emerald-700 font-medium">Curriculum Active</span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Add Subject Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <h3 className="font-serif text-lg font-bold text-stone-900">Add Academic Subject</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1.5 hover:bg-stone-100 text-stone-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[11px]">
                  Target Academic Batch
                </label>
                <select
                  value={newBatchId}
                  onChange={(e) => setNewBatchId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-800 font-semibold"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[11px]">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g. PHYS-28"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-800 uppercase"
                  />
                </div>

                <div>
                  <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[11px]">
                    Accent Theme
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-stone-200 p-0.5"
                    />
                    <span className="font-mono text-stone-600">{newColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[11px]">
                  Subject Title
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Combined Mathematics"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-800"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 uppercase tracking-wider block mb-1 text-[11px]">
                  Syllabus Description & Scope
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Topics covered, practical components, examination expectations..."
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 p-2 text-stone-800"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubject}
                className="rounded-lg bg-stone-900 px-5 py-2 text-xs font-bold text-white hover:bg-stone-800 shadow-xs"
              >
                Create Subject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
