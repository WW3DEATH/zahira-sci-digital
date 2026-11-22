import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Download,
  Edit2,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe,
  Link as LinkIcon,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreDoc } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useBatch } from '../../context/BatchContext';
import { AdmissionFormRecord, YearlyResultReport } from '../../types';

const MAX_FIRESTORE_PDF_BYTES = 650 * 1024; // ~650 KB raw file stays safely below Firestore 1 MiB limit after base64

export const HomepageSyncManager: React.FC = () => {
  const { userProfile, activeRole } = useAuth();
  const { batches } = useBatch();

  const canManage = activeRole === 'admin' || activeRole === 'teacher';
  const [subTab, setSubTab] = useState<'admission' | 'results'>('admission');
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Synced Collections
  const [admissionForms, setAdmissionForms] = useState<AdmissionFormRecord[]>([]);
  const [yearlyResults, setYearlyResults] = useState<YearlyResultReport[]>([]);

  // Admission Form Editor State
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formAcademicYear, setFormAcademicYear] = useState('2026–2028');
  const [formBatchName, setFormBatchName] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formExternalUrl, setFormExternalUrl] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileDataUrl, setFormFileDataUrl] = useState('');
  const [formFileSize, setFormFileSize] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [savingForm, setSavingForm] = useState(false);

  // Yearly Results Editor State
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [resYear, setResYear] = useState('');
  const [resTitle, setResTitle] = useState('');
  const [resSummary, setResSummary] = useState('');
  const [resCandidates, setResCandidates] = useState('');
  const [resUniQualified, setResUniQualified] = useState('');
  const [resUniPassRate, setResUniPassRate] = useState('');
  const [resA3Count, setResA3Count] = useState('');
  const [resPhysicalRate, setResPhysicalRate] = useState('');
  const [resBioRate, setResBioRate] = useState('');
  const [resMedicineCount, setResMedicineCount] = useState('');
  const [resEngineeringCount, setResEngineeringCount] = useState('');
  const [resExternalUrl, setResExternalUrl] = useState('');
  const [resPdfName, setResPdfName] = useState('');
  const [resPdfDataUrl, setResPdfDataUrl] = useState('');
  const [resPdfSize, setResPdfSize] = useState('');
  const [savingResult, setSavingResult] = useState(false);

  const notify = (type: 'success' | 'error', text: string) => {
    setStatusNotice({ type, text });
    setTimeout(() => setStatusNotice(null), 4500);
  };

  useEffect(() => {
    const unsubForms = onSnapshot(collection(db, 'admissionForms'), (snap) => {
      const list: AdmissionFormRecord[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as AdmissionFormRecord), id: d.id }));
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setAdmissionForms(list);
    });

    const unsubResults = onSnapshot(collection(db, 'yearlyResultsReports'), (snap) => {
      const list: YearlyResultReport[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as YearlyResultReport), id: d.id }));
      list.sort((a, b) => a.examYear.localeCompare(b.examYear));
      setYearlyResults(list);
    });

    return () => {
      unsubForms();
      unsubResults();
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleAdmissionPdfPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FIRESTORE_PDF_BYTES) {
      notify(
        'error',
        `PDF size (${formatFileSize(file.size)}) exceeds the 650 KB direct-sync limit. Compress the PDF under 650 KB or paste a Google Drive / hosted PDF URL below.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormFileDataUrl(reader.result as string);
      setFormFileName(file.name);
      setFormFileSize(formatFileSize(file.size));
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
      }
    };
    reader.onerror = () => notify('error', 'Failed to read selected PDF file.');
    reader.readAsDataURL(file);
  };

  const handleResultPdfPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FIRESTORE_PDF_BYTES) {
      notify(
        'error',
        `PDF size (${formatFileSize(file.size)}) exceeds the 650 KB direct-sync limit. Compress under 650 KB or paste an external PDF URL below.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setResPdfDataUrl(reader.result as string);
      setResPdfName(file.name);
      setResPdfSize(formatFileSize(file.size));
    };
    reader.onerror = () => notify('error', 'Failed to read selected results PDF.');
    reader.readAsDataURL(file);
  };

  const resetAdmissionEditor = () => {
    setEditingFormId(null);
    setFormTitle('');
    setFormAcademicYear('2026–2028');
    setFormBatchName('');
    setFormDeadline('');
    setFormInstructions('');
    setFormExternalUrl('');
    setFormFileName('');
    setFormFileDataUrl('');
    setFormFileSize('');
    setFormIsActive(true);
  };

  const resetResultEditor = () => {
    setEditingResultId(null);
    setResYear('');
    setResTitle('');
    setResSummary('');
    setResCandidates('');
    setResUniQualified('');
    setResUniPassRate('');
    setResA3Count('');
    setResPhysicalRate('');
    setResBioRate('');
    setResMedicineCount('');
    setResEngineeringCount('');
    setResExternalUrl('');
    setResPdfName('');
    setResPdfDataUrl('');
    setResPdfSize('');
  };

  const handleSaveAdmissionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !userProfile) return;

    const finalUrl = formFileDataUrl || formExternalUrl.trim();
    if (!formTitle.trim() || !finalUrl) {
      notify('error', 'Provide a form title and either upload a PDF file or enter a valid PDF URL.');
      return;
    }

    setSavingForm(true);
    try {
      const id = editingFormId || `adm-form-${Date.now()}`;
      const existing = admissionForms.find((f) => f.id === id);

      // If setting this form active, deactivate prior active forms cleanly so homepage displays the official active intake
      if (formIsActive) {
        await Promise.all(
          admissionForms
            .filter((f) => f.id !== id && f.isActive)
            .map((f) =>
              setDoc(
                doc(db, 'admissionForms', f.id),
                sanitizeFirestoreDoc({ ...f, isActive: false, updatedAt: new Date().toISOString() }),
                { merge: true }
              )
            )
        );
      }

      const payload: AdmissionFormRecord = {
        id,
        title: formTitle.trim(),
        academicYear: formAcademicYear.trim() || '2026–2028',
        batchName: formBatchName.trim() || undefined,
        deadline: formDeadline.trim() || undefined,
        instructions: formInstructions.trim() || undefined,
        fileName: formFileName || 'Zahira_Science_Admission_Form.pdf',
        fileUrl: finalUrl,
        fileSize: formFileSize || (formExternalUrl.trim() ? 'External PDF Link' : undefined),
        isActive: formIsActive,
        uploadedBy: userProfile.userId,
        uploadedByName: userProfile.fullName,
        uploadedByRole: activeRole === 'admin' ? 'admin' : 'teacher',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'admissionForms', id), sanitizeFirestoreDoc(payload), { merge: true });
      resetAdmissionEditor();
      notify('success', `Admission form "${payload.title}" synced to the public homepage.`);
    } catch (err: any) {
      notify('error', err?.message || 'Failed to save admission form.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleAdmissionActive = async (target: AdmissionFormRecord) => {
    if (!canManage) return;
    try {
      const nextActive = !target.isActive;
      if (nextActive) {
        await Promise.all(
          admissionForms
            .filter((f) => f.id !== target.id && f.isActive)
            .map((f) =>
              setDoc(
                doc(db, 'admissionForms', f.id),
                sanitizeFirestoreDoc({ ...f, isActive: false, updatedAt: new Date().toISOString() }),
                { merge: true }
              )
            )
        );
      }
      await setDoc(
        doc(db, 'admissionForms', target.id),
        sanitizeFirestoreDoc({ ...target, isActive: nextActive, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      notify(
        'success',
        nextActive
          ? `"${target.title}" is now the active Admission Form on the homepage.`
          : `"${target.title}" moved to archive.`
      );
    } catch (err: any) {
      notify('error', err?.message || 'Unable to update admission form visibility.');
    }
  };

  const handleDeleteAdmissionForm = async (form: AdmissionFormRecord) => {
    if (!canManage) return;
    try {
      await deleteDoc(doc(db, 'admissionForms', form.id));
      if (editingFormId === form.id) resetAdmissionEditor();
      notify('success', `Deleted admission form "${form.title}".`);
    } catch (err: any) {
      notify('error', err?.message || 'Unable to delete admission form.');
    }
  };

  const handleSaveYearlyResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !userProfile) return;

    const cleanYear = resYear.trim();
    if (!cleanYear || !resTitle.trim()) {
      notify('error', 'Enter both an Exam Year (e.g. 2024) and Report Title.');
      return;
    }

    const totalCandidates = Math.max(0, Number(resCandidates) || 0);
    const universityQualifiedCount = Math.max(0, Number(resUniQualified) || 0);
    const computedPassRate =
      resUniPassRate.trim() !== ''
        ? Math.min(100, Math.max(0, Number(resUniPassRate) || 0))
        : totalCandidates > 0
        ? Math.round((universityQualifiedCount / totalCandidates) * 1000) / 10
        : 0;

    setSavingResult(true);
    try {
      const id = editingResultId || `res-${cleanYear.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
      const existing = yearlyResults.find((r) => r.id === id);
      const pdfUrl = resPdfDataUrl || resExternalUrl.trim() || undefined;

      const payload: YearlyResultReport = {
        id,
        examYear: cleanYear,
        title: resTitle.trim(),
        summary: resSummary.trim() || undefined,
        totalCandidates,
        universityQualifiedCount,
        universityPassRate: computedPassRate,
        a3Count: Math.max(0, Number(resA3Count) || 0),
        physicalPassRate: Math.min(100, Math.max(0, Number(resPhysicalRate) || 0)),
        bioPassRate: Math.min(100, Math.max(0, Number(resBioRate) || 0)),
        medicineCount: resMedicineCount.trim() !== '' ? Math.max(0, Number(resMedicineCount) || 0) : undefined,
        engineeringCount:
          resEngineeringCount.trim() !== '' ? Math.max(0, Number(resEngineeringCount) || 0) : undefined,
        pdfFileName: pdfUrl ? resPdfName || `Zahira_AL_Results_${cleanYear}.pdf` : undefined,
        pdfFileUrl: pdfUrl,
        pdfFileSize: pdfUrl ? resPdfSize || (resExternalUrl.trim() ? 'External PDF Link' : undefined) : undefined,
        updatedBy: userProfile.userId,
        updatedByName: userProfile.fullName,
        updatedByRole: activeRole === 'admin' ? 'admin' : 'teacher',
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'yearlyResultsReports', id), sanitizeFirestoreDoc(payload), { merge: true });
      resetResultEditor();
      notify('success', `Year ${payload.examYear} results PDF & graph analysis synced to homepage.`);
    } catch (err: any) {
      notify('error', err?.message || 'Failed to save yearly results report.');
    } finally {
      setSavingResult(false);
    }
  };

  const handleEditYearlyResult = (item: YearlyResultReport) => {
    setEditingResultId(item.id);
    setResYear(item.examYear);
    setResTitle(item.title);
    setResSummary(item.summary || '');
    setResCandidates(String(item.totalCandidates));
    setResUniQualified(String(item.universityQualifiedCount));
    setResUniPassRate(String(item.universityPassRate));
    setResA3Count(String(item.a3Count));
    setResPhysicalRate(String(item.physicalPassRate));
    setResBioRate(String(item.bioPassRate));
    setResMedicineCount(item.medicineCount !== undefined ? String(item.medicineCount) : '');
    setResEngineeringCount(item.engineeringCount !== undefined ? String(item.engineeringCount) : '');
    if (item.pdfFileUrl?.startsWith('data:')) {
      setResPdfDataUrl(item.pdfFileUrl);
      setResExternalUrl('');
    } else {
      setResExternalUrl(item.pdfFileUrl || '');
      setResPdfDataUrl('');
    }
    setResPdfName(item.pdfFileName || '');
    setResPdfSize(item.pdfFileSize || '');
  };

  const handleDeleteYearlyResult = async (item: YearlyResultReport) => {
    if (!canManage) return;
    try {
      await deleteDoc(doc(db, 'yearlyResultsReports', item.id));
      if (editingResultId === item.id) resetResultEditor();
      notify('success', `Removed Year ${item.examYear} results report.`);
    } catch (err: any) {
      notify('error', err?.message || 'Unable to delete yearly result.');
    }
  };

  const chartData = useMemo(
    () =>
      yearlyResults.map((r) => ({
        year: r.examYear,
        'University Pass %': r.universityPassRate,
        'Physical Science %': r.physicalPassRate,
        'Bio Science %': r.bioPassRate,
        '3 A Distinctions': r.a3Count,
      })),
    [yearlyResults]
  );

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        Only Teachers and Administrators can edit Homepage Admission Forms and Yearly Results Reports.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="rounded-2xl border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 dark:text-blue-400">
            <Globe className="w-4 h-4" />
            <span>Live Public Homepage Sync (Admin &amp; Teacher Control)</span>
          </div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">
            Homepage Admissions &amp; Yearly A/L Results Center
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
            Any Admission Form PDF or Yearly G.C.E. A/L Results Report &amp; Graph uploaded here by Teachers or Administrators syncs immediately to the public Zahira Science Project homepage.
          </p>
        </div>

        {/* Sub-tab Switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('admission')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              subTab === 'admission'
                ? 'bg-blue-900 text-white dark:bg-blue-600 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Admission Form ({admissionForms.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('results')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              subTab === 'results'
                ? 'bg-blue-900 text-white dark:bg-blue-600 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Yearly Results &amp; Graphs ({yearlyResults.length})</span>
          </button>
        </div>
      </div>

      {statusNotice && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 border ${
            statusNotice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          }`}
        >
          {statusNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusNotice.text}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 1: ADMISSION FORM PDF MANAGER                               */}
      {/* =================================================================== */}
      {subTab === 'admission' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload / Edit Form */}
          <form
            onSubmit={handleSaveAdmissionForm}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                {editingFormId ? 'Edit Admission Form' : 'Upload Admission Form (PDF)'}
              </h3>
              {editingFormId && (
                <button
                  type="button"
                  onClick={resetAdmissionEditor}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Form Title *
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. A/L Science EM 2026–2028 Admission Application"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Intake Academic Year *
                </label>
                <input
                  type="text"
                  required
                  value={formAcademicYear}
                  onChange={(e) => setFormAcademicYear(e.target.value)}
                  placeholder="2026–2028"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Linked LMS Batch (Optional)
                </label>
                <select
                  value={formBatchName}
                  onChange={(e) => setFormBatchName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="">All Prospective Intakes</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Submission Deadline (Optional)
              </label>
              <input
                type="text"
                value={formDeadline}
                onChange={(e) => setFormDeadline(e.target.value)}
                placeholder="e.g. Submit to Hall 28 before 15 June 2026"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Applicant Instructions
              </label>
              <textarea
                rows={2}
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                placeholder="Download, print, attach O/L results slip & hand over to Science Complex Hall 28..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* PDF Upload Box */}
            <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
              <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center">
                <Upload className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <span className="text-xs font-bold text-blue-950 dark:text-blue-200">
                  {formFileName ? `Selected: ${formFileName} (${formFileSize})` : 'Choose PDF Admission Form (max 650 KB)'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Direct browser upload synced via Firestore
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleAdmissionPdfPick}
                  className="hidden"
                />
              </label>

              <div className="pt-2 border-t border-blue-200/70 dark:border-blue-900 space-y-1">
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  <LinkIcon className="w-3 h-3" />
                  <span>Or Paste External PDF URL (for larger files)</span>
                </label>
                <input
                  type="url"
                  value={formExternalUrl}
                  onChange={(e) => {
                    setFormExternalUrl(e.target.value);
                    if (e.target.value.trim()) setFormFileDataUrl('');
                  }}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Publish immediately as the active Homepage Admission Form</span>
            </label>

            <button
              type="submit"
              disabled={savingForm}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-950 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 py-2.5 text-xs font-bold text-white transition-colors shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>
                {savingForm
                  ? 'Syncing to Homepage...'
                  : editingFormId
                  ? 'Update Admission Form'
                  : 'Upload & Sync to Homepage'}
              </span>
            </button>
          </form>

          {/* Uploaded Admission Forms List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                    Synced Admission Forms ({admissionForms.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The active form appears directly in the Admissions section of the public homepage
                  </p>
                </div>
              </div>

              {admissionForms.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  No admission forms uploaded yet. Use the panel on the left to publish an official PDF form to the homepage.
                </div>
              ) : (
                <div className="space-y-3">
                  {admissionForms.map((form) => (
                    <div
                      key={form.id}
                      className={`rounded-xl border p-4 transition-colors space-y-3 ${
                        form.isActive
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                form.isActive
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {form.isActive ? 'Live on Homepage' : 'Archived'}
                            </span>
                            <span className="text-xs font-mono font-semibold text-blue-800 dark:text-blue-400">
                              {form.academicYear}
                            </span>
                            {form.batchName && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                · Batch: {form.batchName}
                              </span>
                            )}
                          </div>
                          <h4 className="font-serif text-base font-bold text-slate-950 dark:text-white">
                            {form.title}
                          </h4>
                          {form.instructions && (
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {form.instructions}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            File: <span className="font-mono">{form.fileName}</span>{' '}
                            {form.fileSize ? `(${form.fileSize})` : ''} · Uploaded by{' '}
                            {form.uploadedByName} ({form.uploadedByRole})
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <a
                            href={form.fileUrl}
                            download={form.fileName}
                            target={form.fileUrl.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleToggleAdmissionActive(form)}
                            className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 text-[11px] font-bold text-blue-800 dark:text-blue-300 hover:bg-blue-100"
                          >
                            {form.isActive ? 'Unpublish' : 'Set Live'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingFormId(form.id);
                              setFormTitle(form.title);
                              setFormAcademicYear(form.academicYear);
                              setFormBatchName(form.batchName || '');
                              setFormDeadline(form.deadline || '');
                              setFormInstructions(form.instructions || '');
                              setFormFileName(form.fileName);
                              setFormFileSize(form.fileSize || '');
                              setFormIsActive(form.isActive);
                              if (form.fileUrl.startsWith('data:')) {
                                setFormFileDataUrl(form.fileUrl);
                                setFormExternalUrl('');
                              } else {
                                setFormExternalUrl(form.fileUrl);
                                setFormFileDataUrl('');
                              }
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Edit form details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAdmissionForm(form)}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Delete admission form"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 2: YEARLY A/L RESULTS PDF & GRAPH ANALYSIS                  */}
      {/* =================================================================== */}
      {subTab === 'results' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form: Add / Edit Yearly Result */}
            <form
              onSubmit={handleSaveYearlyResult}
              className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                  {editingResultId ? `Edit ${resYear} Results` : 'Add Yearly A/L Results Report'}
                </h3>
                {editingResultId && (
                  <button
                    type="button"
                    onClick={resetResultEditor}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Exam Year *
                  </label>
                  <input
                    type="text"
                    required
                    value={resYear}
                    onChange={(e) => setResYear(e.target.value)}
                    placeholder="2024"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Report Heading *
                  </label>
                  <input
                    type="text"
                    required
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="G.C.E. A/L Science Results 2024"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Numeric Graph Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Total Sat *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={resCandidates}
                    onChange={(e) => setResCandidates(e.target.value)}
                    placeholder="60"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Uni Qualified *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={resUniQualified}
                    onChange={(e) => setResUniQualified(e.target.value)}
                    placeholder="52"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Overall Pass %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={resUniPassRate}
                    onChange={(e) => setResUniPassRate(e.target.value)}
                    placeholder="Auto"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    3 A&apos;s Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={resA3Count}
                    onChange={(e) => setResA3Count(e.target.value)}
                    placeholder="12"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Physical Pass %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={resPhysicalRate}
                    onChange={(e) => setResPhysicalRate(e.target.value)}
                    placeholder="88"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Bio Pass %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={resBioRate}
                    onChange={(e) => setResBioRate(e.target.value)}
                    placeholder="85"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Medicine Select
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={resMedicineCount}
                    onChange={(e) => setResMedicineCount(e.target.value)}
                    placeholder="Opt."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Engineering Select
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={resEngineeringCount}
                    onChange={(e) => setResEngineeringCount(e.target.value)}
                    placeholder="Opt."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Faculty Analysis Summary
                </label>
                <textarea
                  rows={2}
                  value={resSummary}
                  onChange={(e) => setResSummary(e.target.value)}
                  placeholder="Highlights, island/district ranks, or commentary for homepage visitors..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* PDF File Upload */}
              <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2.5">
                <label className="flex flex-col items-center justify-center gap-1 cursor-pointer text-center">
                  <Upload className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span className="text-xs font-bold text-blue-950 dark:text-blue-200">
                    {resPdfName ? `PDF: ${resPdfName} (${resPdfSize})` : 'Attach Yearly Results PDF (max 650 KB)'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleResultPdfPick}
                    className="hidden"
                  />
                </label>

                <input
                  type="url"
                  value={resExternalUrl}
                  onChange={(e) => {
                    setResExternalUrl(e.target.value);
                    if (e.target.value.trim()) setResPdfDataUrl('');
                  }}
                  placeholder="Or paste external Results PDF URL (https://...)"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={savingResult}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-950 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 py-2.5 text-xs font-bold text-white transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {savingResult
                    ? 'Syncing...'
                    : editingResultId
                    ? 'Update Year Results & Graph'
                    : 'Publish Year Results & Graph'}
                </span>
              </button>
            </form>

            {/* Right: Live Preview Graph + Synced Year Records */}
            <div className="lg:col-span-7 space-y-5">
              {/* Live Chart Preview */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-serif text-base font-bold text-slate-950 dark:text-white">
                      Homepage Graph Live Preview
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Real-time preview of what visitors see in the Yearly Results section
                    </p>
                  </div>
                </div>

                {chartData.length > 0 ? (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="University Pass %" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Physical Science %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Bio Science %" fill="#059669" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-44 flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    Add at least one exam year on the left to generate the live results graph.
                  </div>
                )}
              </div>

              {/* Synced Years Table/Cards */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-3">
                <h3 className="font-serif text-base font-bold text-slate-950 dark:text-white">
                  Synced Annual Results ({yearlyResults.length})
                </h3>

                {yearlyResults.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No yearly results uploaded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {yearlyResults.map((item) => (
                      <div
                        key={item.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-900 dark:text-blue-400">
                              {item.examYear}
                            </span>
                            <span className="font-semibold text-sm text-slate-950 dark:text-white">
                              {item.title}
                            </span>
                            {item.pdfFileUrl && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                <FileCheck2 className="w-3 h-3" />
                                PDF Attached
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            Sat: {item.totalCandidates} · Uni Qualified: {item.universityQualifiedCount} ({item.universityPassRate}%) · 3 A&apos;s: {item.a3Count} · Phys {item.physicalPassRate}% · Bio {item.bioPassRate}%
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.pdfFileUrl && (
                            <a
                              href={item.pdfFileUrl}
                              download={item.pdfFileName || `Results_${item.examYear}.pdf`}
                              target={item.pdfFileUrl.startsWith('http') ? '_blank' : undefined}
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>PDF</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditYearlyResult(item)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Edit result report"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteYearlyResult(item)}
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Delete result report"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
