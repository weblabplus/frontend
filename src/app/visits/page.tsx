'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Loader2, User, Calendar, Trash2, AlertCircle, Search, Pencil, Save, X, ClipboardList, Stethoscope, Filter, FileText, ChevronDown, ChevronRight, Building2, Beaker, Printer, FileSearch, CheckCircle2, Send, Barcode, RotateCcw, RefreshCw } from 'lucide-react';
import { api, type PatientReferralSearch, type DispenseSearchResult, type ReferenceCenter, type LabProfileResponse, IMPORT_VISIT_REASON_LABEL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import JsBarcode from 'jsbarcode';
import { EXAM_CATEGORY_LABELS_EL } from '@/lib/exam-categories';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  amka?: string;
}

interface Visit {
  id: string;
  patientId: string;
  patientName?: string;
  visitDate: string;
  reason: string;
  diagnosis?: string;
  notes?: string;
  doctorId?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface Referral {
  id: string;
  visitId: string;
  patientId: string;
  patientName?: string;
  visitReason?: string;
  specialty: string;
  reason: string;
  hospital?: string;
  referralDate: string;
  status:
    | 'pending'
    | 'sent'
    | 'received'
    | 'partially_executed'
    | 'fully_executed'
    | 'completed'
    | 'cancelled';
  notes?: string;
  reportUrl?: string;
  doctorId?: string;
  barcode?: string;
  executionNo?: string;
  executionType?: 'full' | 'partial';
  executedLineIds?: string[];
  executedAt?: string;
  resultsSubmittedAt?: string;
  resultsSubmittedCount?: number;
  resultsFetchedAt?: string;
  referenceOrders?: Array<{
    centerId: string;
    centerName: string;
    orderNo: string;
    lisOrderNo?: string;
    status: string;
    sentAt: string;
    tests: Array<{ code: string; barcode?: string }>;
  }>;
  labResultIds?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExamParameter {
  name: string;
  result?: string;
  unit?: string;
  referenceRange?: string;
  loincNum?: string;
}

interface Exam {
  id: string;
  referralId: string;
  visitId: string;
  patientId: string;
  patientName?: string;
  name: string;
  category?: string;
  status: 'ordered' | 'in_progress' | 'completed' | 'cancelled';
  result?: string;
  unit?: string;
  referenceRange?: string;
  parameters?: ExamParameter[];
  notes?: string;
  examDate?: string;
  loincCode?: string;
  doctorId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Ρυθμίσεις εκτύπωσης barcode εντολής κέντρου αναφοράς */
interface CenterBarcodeSettings {
  type: string;
  widthMm: number;
  heightMm: number;
  showText: boolean;
  copies: number;
}

function centerBarcodeSettings(center?: ReferenceCenter | null): CenterBarcodeSettings {
  const cfg: Record<string, any> = center?.config || {};
  const type = typeof cfg.barcodeType === 'string' && cfg.barcodeType.trim() ? cfg.barcodeType.trim() : 'CODE128';
  const widthMm = Number(cfg.barcodeWidthMm) > 0 ? Number(cfg.barcodeWidthMm) : 50;
  const heightMm = Number(cfg.barcodeHeightMm) > 0 ? Number(cfg.barcodeHeightMm) : 15;
  const showText = cfg.barcodeShowText !== false;
  const copies = Number(cfg.barcodeCopies) > 0 ? Math.floor(Number(cfg.barcodeCopies)) : 1;
  return { type, widthMm, heightMm, showText, copies: Math.min(100, Math.max(1, copies)) };
}

/** Δημιουργεί SVG barcode (μονάδες mm) για εκτύπωση */
function buildBarcodeSvg(value: string, settings: CenterBarcodeSettings): string {
  const pxPerMm = 96 / 25.4;
  const heightPx = Math.max(10, Math.round(settings.heightMm * pxPerMm));

  const render = (barWidth: number) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: settings.type,
      width: barWidth,
      height: heightPx,
      displayValue: settings.showText,
      fontSize: 14,
      textMargin: 2,
      margin: 2,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return svg;
  };

  // 1ο πέρασμα για το πραγματικό πλάτος, 2ο με προσαρμοσμένο πάχος γραμμής
  // ώστε το barcode να μην παραμορφώνεται οριζόντια στο ζητούμενο πλάτος (mm).
  let svg = render(2);
  const intrinsicWidth = parseFloat(svg.getAttribute('width') || '0');
  if (intrinsicWidth > 0) {
    const barWidth = Math.min(10, Math.max(0.5, (2 * settings.widthMm * pxPerMm) / intrinsicWidth));
    if (Math.abs(barWidth - 2) > 0.01) svg = render(barWidth);
  }

  svg.setAttribute('width', `${settings.widthMm}mm`);
  svg.setAttribute('height', `${settings.heightMm}mm`);
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg.outerHTML;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Εκτυπώνει HTML μέσω κρυφού iframe (χωρίς popup). Το popup μπορεί να μπλοκάρεται
 * από τον ενσωματωμένο browser/blocker, οπότε το iframe είναι η κύρια μέθοδος.
 */
function openPrintDocument(content: string): void {
  const existing = document.getElementById('medilab-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'medilab-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    window.alert('Δεν ήταν δυνατή η προετοιμασία της εκτύπωσης. Δοκιμάστε ξανά.');
    return;
  }

  doc.open();
  doc.write(content);
  doc.close();

  let done = false;
  const doPrint = () => {
    if (done) return;
    done = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.alert('Η εκτύπωση δεν υποστηρίζεται από τον browser. Ανοίξτε την εφαρμογή σε εξωτερικό browser.');
    } finally {
      setTimeout(() => {
        try { iframe.remove(); } catch (_) {}
      }, 60000);
    }
  };

  iframe.onload = () => setTimeout(doPrint, 150);
  setTimeout(doPrint, 600);
}

const visitStatusLabels: Record<string, string> = {
  scheduled: 'Προγραμματισμένη',
  in_progress: 'Σε εξέλιξη',
  completed: 'Ολοκληρωμένη',
  cancelled: 'Ακυρωμένη',
};

const visitStatusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const referralStatusLabels: Record<string, string> = {
  pending: 'Εκκρεμεί',
  sent: 'Απεστάλη',
  received: 'Παραλήφθηκε',
  partially_executed: 'Σε εξέλιξη - Μερικώς Εκτελεσμένο',
  fully_executed: 'Σε εξέλιξη - Ολικώς Εκτελεσμένο',
  completed: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
};

const referralStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-purple-100 text-purple-700',
  partially_executed: 'bg-amber-100 text-amber-800',
  fully_executed: 'bg-sky-100 text-sky-800',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const examStatusLabels: Record<string, string> = {
  ordered: 'Διατάχθηκε',
  in_progress: 'Σε εξέλιξη',
  sent: 'Απεσταλμένη σε Κέντρο',
  completed: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
};

const examStatusColors: Record<string, string> = {
  ordered: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const examCategories = Object.entries(EXAM_CATEGORY_LABELS_EL).map(([, label]) => label);

const specialties = [
  'Καρδιολογία', 'Παθολογία', 'Ορθοπεδική', 'Νευρολογία', 'Ακτινολογία',
  'Δερματολογία', 'Οφθαλμολογία', 'ΩΡΛ', 'Γαστρεντερολογία', 'Πνευμονολογία',
  'Ενδοκρινολογία', 'Αιματολογία', 'Ουρολογία', 'Γυναικολογία', 'Ψυχιατρική',
  'Φυσικοθεραπεία', 'Άλλο',
];

export default function VisitsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Φόρτωση...
        </div>
      }
    >
      <VisitsPageContent />
    </Suspense>
  );
}

function VisitsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPatientId = searchParams.get('patientId') || '';
  const { user } = useAuth();

  // ── Visit state ──
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [patientFilter, setPatientFilter] = useState(urlPatientId);
  const [showVisitForm, setShowVisitForm] = useState(false);

  // Visit create form
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitReason, setVisitReason] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitStatus, setVisitStatus] = useState<Visit['status']>('scheduled');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Visit edit state
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editVisitDate, setEditVisitDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editVisitStatus, setEditVisitStatus] = useState<Visit['status']>('scheduled');
  const [savingVisit, setSavingVisit] = useState(false);

  // ── Στοιχεία εργαστηρίου / γιατρών για εκτυπώσεις ──
  const [labProfile, setLabProfile] = useState<LabProfileResponse | null>(null);
  const [doctorDirectory, setDoctorDirectory] = useState<
    Array<{ uid?: string; id?: string; email: string; displayName?: string }>
  >([]);

  // ── Referral state ──
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [expandedVisits, setExpandedVisits] = useState<Set<string>>(new Set());
  const [showReferralFormForVisit, setShowReferralFormForVisit] = useState<string | null>(null);

  // Referral create form
  const [refSpecialty, setRefSpecialty] = useState('');
  const [refReason, setRefReason] = useState('');
  const [refHospital, setRefHospital] = useState('');
  const [refDate, setRefDate] = useState('');
  const [refStatus, setRefStatus] = useState<Referral['status']>('pending');
  const [refNotes, setRefNotes] = useState('');
  const [creatingRef, setCreatingRef] = useState(false);
  const [refFormError, setRefFormError] = useState<string | null>(null);

  // Referral edit state
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [editRefSpecialty, setEditRefSpecialty] = useState('');
  const [editRefReason, setEditRefReason] = useState('');
  const [editRefHospital, setEditRefHospital] = useState('');
  const [editRefDate, setEditRefDate] = useState('');
  const [editRefStatus, setEditRefStatus] = useState<Referral['status']>('pending');
  const [editRefNotes, setEditRefNotes] = useState('');
  const [savingRef, setSavingRef] = useState(false);

  // ── Exam state ──
  const [exams, setExams] = useState<Exam[]>([]);
  const [modalReferralId, setModalReferralId] = useState<string | null>(null);  const [showExamFormForReferral, setShowExamFormForReferral] = useState<string | null>(null);
  const [printPreview, setPrintPreview] = useState<{ title: string; html: string } | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Exam create form
  const [examName, setExamName] = useState('');
  const [examCategory, setExamCategory] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examStatus, setExamStatus] = useState<Exam['status']>('ordered');
  const [examResult, setExamResult] = useState('');
  const [examUnit, setExamUnit] = useState('');
  const [examRefRange, setExamRefRange] = useState('');
  const [examNotes, setExamNotes] = useState('');
  const [examParameters, setExamParameters] = useState<ExamParameter[]>([]);
  const [examLoincCode, setExamLoincCode] = useState('');
  const [creatingExam, setCreatingExam] = useState(false);
  const [examFormError, setExamFormError] = useState<string | null>(null);

  // Exam edit state
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editExamName, setEditExamName] = useState('');
  const [editExamCategory, setEditExamCategory] = useState('');
  const [editExamDate, setEditExamDate] = useState('');
  const [editExamStatus, setEditExamStatus] = useState<Exam['status']>('ordered');
  const [editExamResult, setEditExamResult] = useState('');
  const [editExamUnit, setEditExamUnit] = useState('');
  const [editExamRefRange, setEditExamRefRange] = useState('');
  const [editExamNotes, setEditExamNotes] = useState('');
  const [editExamParameters, setEditExamParameters] = useState<ExamParameter[]>([]);
  const [editExamLoincCode, setEditExamLoincCode] = useState('');
  const [savingExam, setSavingExam] = useState(false);

  // ── Άυλη συνταγογράφηση: αναζήτηση παραπεμπτικών με ΑΜΚΑ ──
  const [showNopaper, setShowNopaper] = useState(false);
  const [npAmka, setNpAmka] = useState('');
  const [npPin, setNpPin] = useState('');
  const [npSearching, setNpSearching] = useState(false);
  const [npResult, setNpResult] = useState<PatientReferralSearch | null>(null);
  const [npSelected, setNpSelected] = useState<Set<string>>(new Set());
  const [npError, setNpError] = useState<string | null>(null);
  const [npImporting, setNpImporting] = useState(false);
  const [npSuccess, setNpSuccess] = useState<{
    visitId: string;
    count: number;
    patientCreated: boolean;
    message: string;
  } | null>(null);
  const [npDob, setNpDob] = useState('');
  const [npGender, setNpGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('OTHER');
  const [npExpiredWarning, setNpExpiredWarning] = useState<string[]>([]);

  // ── Άυλη συνταγογράφηση: αναζήτηση με barcode (Άντληση προς εκτέλεση) ──
  const [showBarcode, setShowBarcode] = useState(false);
  const [bcValue, setBcValue] = useState('');
  const [bcSearching, setBcSearching] = useState(false);
  const [bcResult, setBcResult] = useState<DispenseSearchResult | null>(null);
  const [bcError, setBcError] = useState<string | null>(null);
  const [bcImporting, setBcImporting] = useState(false);
  const [bcSuccess, setBcSuccess] = useState<{
    visitId: string;
    examCount: number;
    patientCreated: boolean;
    message: string;
    fullExecution?: boolean;
  } | null>(null);
  const [bcSelectedExams, setBcSelectedExams] = useState<Set<string>>(new Set());

  /**
   * Επιβεβαίωση διαγραφής. Απαιτείται πάντα ρητή επιβεβαίωση, με έμφαση
   * όταν η επίσκεψη ή το παραπεμπτικό είναι ολοκληρωμένα.
   */
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'visit' | 'referral';
    id: string;
    title: string;
    subtitle?: string;
    statusLabel?: string;
    isCompleted: boolean;
    referralCount?: number;
    examCount?: number;
    /** Μήνυμα όταν η διαγραφή δεν επιτρέπεται (π.χ. εκτελεσμένο παραπεμπτικό) */
    blockedReason?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Ακύρωση εκτέλεσης παραπεμπτικού ──
  const [cancelingExecution, setCancelingExecution] = useState(false);  const [cancelTarget, setCancelTarget] = useState<{
    referralId: string;
    specialty: string;
    patientName?: string;
    barcode: string;
    isFull: boolean;
    fullExecution: boolean;
  } | null>(null);
  const [cancelMessage, setCancelMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ── Αποστολή αποτελεσμάτων στον φορέα ──
  const [submittingResultsId, setSubmittingResultsId] = useState<string | null>(null);

  // Auto-dismiss του μηνύματος ακύρωσης
  useEffect(() => {
    if (!cancelMessage) return;
    const t = setTimeout(() => setCancelMessage(null), 6000);
    return () => clearTimeout(t);
  }, [cancelMessage]);

  // ── Inline result entry (for "ordered" exams) ──
  // Per-exam inline values: key = examId
  interface ParamInline { result: string; unit: string; refRange: string; }
  interface ExamInlineVals {
    mainResult: string;
    mainUnit: string;
    mainRefRange: string;
    examDate: string;
    params: Record<number, ParamInline>;
  }
  const DEFAULT_INLINE = (): ExamInlineVals => ({ mainResult: '', mainUnit: '', mainRefRange: '', examDate: '', params: {} });
  const [inlineValues, setInlineValues] = useState<Record<string, ExamInlineVals>>({});
  const [savingInlineExamId, setSavingInlineExamId] = useState<string | null>(null);

  // ── LOINC online search ──
  const [loincQuery, setLoincQuery] = useState('');
  const [loincResults, setLoincResults] = useState<any[]>([]);
  const [loincSearching, setLoincSearching] = useState(false);
  const [loincDropdownOpen, setLoincDropdownOpen] = useState(false);
  const [loincTarget, setLoincTarget] = useState<'create' | 'edit'>('create');
  const [loincSource, setLoincSource] = useState<'exam-catalog' | 'exam-loinc'>('exam-catalog');
  const loincDebounceRef = { current: null as ReturnType<typeof setTimeout> | null };

  const handleLoincSearch = (query: string, target: 'create' | 'edit') => {
    setLoincQuery(query);
    setLoincTarget(target);
    if (loincDebounceRef.current) clearTimeout(loincDebounceRef.current);
    if (query.trim().length < 2) {
      setLoincResults([]);
      setLoincDropdownOpen(false);
      return;
    }
    loincDebounceRef.current = setTimeout(async () => {
      setLoincSearching(true);
      try {
        const data = await api.searchLOINC(query.trim(), loincSource);
        setLoincResults(data.results || []);
        setLoincDropdownOpen(true);
      } catch {
        setLoincResults([]);
      } finally {
        setLoincSearching(false);
      }
    }, 350);
  };

  const selectLoincResult = async (item: any) => {
    const isEdit = loincTarget === 'edit';
    const displayName = item.greekName || item.longCommonName || item.component || '';
    if (isEdit) {
      setEditExamName(displayName);
      setEditExamCategory(item.class || '');
      setEditExamParameters([]);
      setEditExamResult('');
      setEditExamUnit('');
      setEditExamRefRange('');
      setEditExamLoincCode(item.loincNum || '');
    } else {
      setExamName(displayName);
      setExamCategory(item.class || '');
      setExamParameters([]);
      setExamResult('');
      setExamUnit('');
      setExamRefRange('');
      setExamLoincCode(item.loincNum || '');
    }
    setLoincQuery('');
    setLoincResults([]);
    setLoincDropdownOpen(false);

    // Auto-populate parameters from FHIR Questionnaire
    if (item.loincNum) {
      try {
        const data = await api.getLOINCParameters(item.loincNum, item.examCode, loincSource);
        const params = (data.parameters || []).map(p => ({
          name: p.name || '',
          result: '',
          unit: '',
          referenceRange: '',
          loincNum: p.loincNum || '',
        }));
        if (params.length > 0) {
          if (isEdit) {
            setEditExamParameters(params);
          } else {
            setExamParameters(params);
          }
        }
      } catch {
        // silent — parameters remain empty
      }
    }
  };

  // ── Άυλη συνταγογράφηση handlers ──

  const resetNopaper = () => {
    setNpAmka('');
    setNpPin('');
    setNpResult(null);
    setNpSelected(new Set());
    setNpError(null);
    setNpSuccess(null);
    setNpDob('');
    setNpGender('OTHER');
    setNpExpiredWarning([]);
  };

  /** true αν η ημερομηνία λήξης έχει περάσει (σύγκριση μόνο ημερομηνίας) */
  const isExpired = (expiryDate?: string): boolean => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  };

  const handleNopaperSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amka = npAmka.replace(/\s/g, '');
    setNpError(null);
    setNpSuccess(null);

    if (!/^\d{11}$/.test(amka)) {
      setNpError('Το ΑΜΚΑ πρέπει να αποτελείται από 11 ψηφία');
      return;
    }

    setNpSearching(true);
    setNpResult(null);
    setNpSelected(new Set());

    try {
      const data = await api.searchPatientReferrals(amka, npPin || undefined);
      setNpResult(data);
      setNpDob(data.existingPatient?.dateOfBirth || '');
      setNpGender((data.existingPatient?.gender as 'MALE' | 'FEMALE' | 'OTHER') || 'OTHER');
      setNpExpiredWarning([]);
      if (data.referrals.length === 0) {
        setNpError(
          data.alreadyImportedCount
            ? `Όλα τα παραπεμπτικά (${data.alreadyImportedCount}) έχουν ήδη εισαχθεί`
            : 'Δεν βρέθηκαν παραπεμπτικά για αυτό το ΑΜΚΑ'
        );
      }
    } catch (err: any) {
      setNpError(err?.message || 'Σφάλμα αναζήτησης παραπεμπτικών');
    } finally {
      setNpSearching(false);
    }
  };

  const toggleNpReferral = (barcode: string) => {
    const ref = npResult?.referrals.find(r => r.barcode === barcode);
    if (ref && isExpired(ref.expiryDate)) {
      setNpError(`Το παραπεμπτικό ${barcode} έχει λήξει και δεν μπορεί να καταχωρηθεί`);
      return;
    }
    setNpSelected(prev => {
      const next = new Set(prev);
      if (next.has(barcode)) next.delete(barcode);
      else next.add(barcode);
      return next;
    });
  };

  const toggleAllNpReferrals = () => {
    if (!npResult) return;
    // Μόνο τα μη ληγμένα μπορούν να επιλεγούν
    const selectable = npResult.referrals.filter(r => !isExpired(r.expiryDate));
    if (npSelected.size === selectable.length) {
      setNpSelected(new Set());
    } else {
      setNpSelected(new Set(selectable.map(r => r.barcode)));
    }
  };

  const handleNopaperImport = async () => {
    if (!npResult || npSelected.size === 0) return;

    setNpImporting(true);
    setNpError(null);

    try {
      const selected = npResult.referrals.filter(r => npSelected.has(r.barcode));
      const res = await api.importPatientReferrals({
        amka: npResult.amka,
        referrals: selected,
        patient: {
          firstName: npResult.existingPatient?.firstName || selected[0]?.firstName,
          lastName: npResult.existingPatient?.lastName || selected[0]?.lastName,
          ...(npResult.existingPatient ? {} : { dateOfBirth: npDob || undefined, gender: npGender }),
        },
      });

      setNpSuccess({
        visitId: res.visit.id,
        count: res.referrals.length,
        patientCreated: res.patientCreated,
        message: res.message,
      });
      const expiredList = res.expired || [];
      setNpExpiredWarning(expiredList);
      setNpSelected(new Set());

      // Αφαίρεση των εισαγμένων παραπεμπτικών από τη λίστα (έλεγχος με barcode)
      const importedBarcodes = new Set(
        (res.referrals as Array<{ id?: string; notes?: string }>)
          .map(r => String(r.id || '').replace('referral_epres_', ''))
          .filter(Boolean)
      );
      setNpResult(prev => {
        if (!prev) return prev;
        const remaining = prev.referrals.filter(r => !importedBarcodes.has(r.barcode));
        return {
          ...prev,
          referrals: remaining,
          total: remaining.length,
          alreadyImportedCount: (prev.alreadyImportedCount || 0) + importedBarcodes.size,
          // Ο ασθενής υπάρχει πλέον στη βάση
          existingPatient: {
            id: res.patient.id,
            firstName: res.patient.firstName,
            lastName: res.patient.lastName,
            dateOfBirth: res.patient.dateOfBirth,
            gender: res.patient.gender,
          },
        };
      });

      // Ανανέωση δεδομένων σελίδας
      await loadData(patientFilter || undefined);
    } catch (err: any) {
      setNpError(err?.message || 'Σφάλμα εισαγωγής παραπεμπτικών');
    } finally {
      setNpImporting(false);
    }
  };

  // ── Άυλη συνταγογράφηση: barcode handlers ──

  const resetBarcode = () => {
    setBcValue('');
    setBcResult(null);
    setBcError(null);
    setBcSuccess(null);
    setBcSelectedExams(new Set());
  };

  const handleBarcodeSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const barcode = bcValue.trim();
    setBcError(null);
    setBcSuccess(null);

    if (barcode.length < 4) {
      setBcError('Το barcode πρέπει να έχει τουλάχιστον 4 χαρακτήρες');
      return;
    }

    setBcSearching(true);
    setBcResult(null);
    setBcSelectedExams(new Set());

    try {
      const data = await api.searchReferralByBarcode(barcode);
      setBcResult(data);
      // Προεπιλογή όλων των εξετάσεων
      setBcSelectedExams(new Set(data.referral.exams.map(e => String(e.lineId))));
    } catch (err: any) {
      setBcError(err?.message || 'Σφάλμα άντλησης παραπεμπτικού');
    } finally {
      setBcSearching(false);
    }
  };

  const toggleBcExam = (lineId: string) => {
    setBcSelectedExams(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleAllBcExams = () => {
    if (!bcResult) return;
    const all = bcResult.referral.exams.map(e => String(e.lineId));
    if (bcSelectedExams.size === all.length) setBcSelectedExams(new Set());
    else setBcSelectedExams(new Set(all));
  };

  const handleBarcodeImport = async () => {
    if (!bcResult || bcResult.alreadyImported || bcResult.expired) return;
    if (bcSelectedExams.size === 0) {
      setBcError('Επιλέξτε τουλάχιστον μία εξέταση προς εκτέλεση');
      return;
    }

    setBcImporting(true);
    setBcError(null);

    try {
      const res = await api.importReferralByBarcode({
        barcode: bcResult.referral.barcode,
        referral: bcResult.referral,
        selectedLineIds: Array.from(bcSelectedExams),
      });

      setBcSuccess({
        visitId: res.visit.id,
        examCount: res.exams?.length || 0,
        patientCreated: res.patientCreated,
        message: res.message,
        fullExecution: res.execution?.fullExecution,
      });
      setBcResult(prev =>
        prev
          ? {
              ...prev,
              alreadyImported: true,
              existingPatient: {
                id: res.patient.id,
                firstName: res.patient.firstName,
                lastName: res.patient.lastName,
                dateOfBirth: res.patient.dateOfBirth,
                gender: res.patient.gender,
                amka: res.patient.amka,
              },
            }
          : prev
      );
      await loadData(patientFilter || undefined);
    } catch (err: any) {
      // Το 2019 (ALREADY_EXECUTED) αντιμετωπίζεται server-side: γίνεται
      // απευθείας καταχώρηση του ήδη εκτελεσμένου παραπεμπτικού.
      const isFullOnly = err?.code === 'FULL_ONLY' || err?.code === '2018';

      if (isFullOnly && bcResult) {
        // Ο φορέας δέχεται μόνο ολική εκτέλεση → προεπιλογή όλων για άμεση επανάληψη
        setBcSelectedExams(new Set(bcResult.referral.exams.map(e => String(e.lineId))));
        setBcError(
          'Ο φορέας απαιτεί ολική εκτέλεση: επιλέχθηκαν αυτόματα όλες οι εξετάσεις. ' +
            'Πατήστε ξανά «Εκτέλεση & Καταχώρηση».'
        );
      } else {
        setBcError(err?.message || 'Σφάλμα εκτέλεσης παραπεμπτικού');
      }
    } finally {
      setBcImporting(false);
    }
  };

  // ── Data loading ──
  useEffect(() => {
    loadData(patientFilter || undefined);
  }, [patientFilter]);

  /** Στοιχεία εργαστηρίου & γιατρών για την εκτύπωση παραπεμπτικού */
  useEffect(() => {
    api.getLabProfile().then(setLabProfile).catch(() => {});
    if (user?.role === 'admin') {
      api
        .getUsers()
        .then(res => setDoctorDirectory(res.users || []))
        .catch(() => {});
    }
  }, [user?.role]);

  /** Κρατά το URL συγχρονισμένο με το φίλτρο ασθενούς (χωρίς νέο history entry) */
  useEffect(() => {
    const current = searchParams.get('patientId') || '';
    if (current === patientFilter) return;

    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (patientFilter) params.set('patientId', patientFilter);
    else params.delete('patientId');

    const qs = params.toString();
    router.replace(qs ? `/visits?${qs}` : '/visits', { scroll: false });
  }, [patientFilter, searchParams, router]);

  /** Μεταβολή του URL (back/forward, εξωτερικός σύνδεσμος) → ενημέρωση φίλτρου */
  useEffect(() => {
    setPatientFilter(prev => (prev === urlPatientId ? prev : urlPatientId));
  }, [urlPatientId]);

  /** Άγνωστο patientId στο URL → καθαρισμός φίλτρου μόλις φορτωθούν οι ασθενείς */
  useEffect(() => {
    if (!patientFilter || patients.length === 0) return;
    if (patients.some(p => p.id === patientFilter)) return;
    setPatientFilter('');
  }, [patientFilter, patients]);

  const loadData = async (patientId?: string) => {
    try {
      setLoading(true);
      const [visitsData, patientsData, referralsData, examsData] = await Promise.all([
        api.getVisits(patientId),
        api.getPatients(),
        api.getReferrals(),
        api.getExams(),
      ]);
      setVisits(visitsData.visits || []);
      setPatients(patientsData.patients || []);
      setReferrals(referralsData.referrals || []);
      setExams(examsData.exams || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVisits = async (patientId?: string) => {
    try {
      const data = await api.getVisits(patientId);
      setVisits(data.visits || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Referrals by visit ──
  const referralsByVisit = useMemo(() => {
    const map: Record<string, Referral[]> = {};
    for (const r of referrals) {
      if (!map[r.visitId]) map[r.visitId] = [];
      map[r.visitId].push(r);
    }
    return map;
  }, [referrals]);

  const refCountByVisit = (visitId: string) => referralsByVisit[visitId]?.length || 0;

  // ── Παραπεμπτικό που δεν έχει ολοκληρωθεί/ακυρωθεί = εκκρεμές ──
  const isReferralOpen = (status: Referral['status']) =>
    status !== 'completed' && status !== 'cancelled';

  const hasOpenReferrals = (visitId: string) =>
    (referralsByVisit[visitId] || []).some(r => isReferralOpen(r.status));

  /**
   * Επίσκεψη με εκκρεμή παραπεμπτικά εμφανίζεται ως «Σε εξέλιξη» αντί «Ολοκληρωμένη».
   * Οι ακυρωμένες επισκέψεις παραμένουν ακυρωμένες.
   */
  const effectiveVisitStatus = (visit: Visit): Visit['status'] => {
    if (visit.status === 'cancelled') return visit.status;
    if (visit.status === 'completed' && hasOpenReferrals(visit.id)) return 'in_progress';
    return visit.status;
  };

  // ── Exams by referral ──
  const examsByReferral = useMemo(() => {
    const map: Record<string, Exam[]> = {};
    for (const e of exams) {
      if (!map[e.referralId]) map[e.referralId] = [];
      map[e.referralId].push(e);
    }
    return map;
  }, [exams]);

  const examCountByReferral = (referralId: string) => examsByReferral[referralId]?.length || 0;

  // ── Visit CRUD ──
  const resetVisitForm = () => {
    setSelectedPatientId('');
    setVisitDate('');
    setVisitReason('');
    setDiagnosis('');
    setVisitNotes('');
    setVisitStatus('scheduled');
    setFormError(null);
  };

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPatientId || !visitDate || !visitReason) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία (Ασθενής, Ημερομηνία, Λόγος)');
      return;
    }
    try {
      setCreating(true);
      const patient = patients.find(p => p.id === selectedPatientId);
      const data = await api.createVisit({
        patientId: selectedPatientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : '',
        visitDate,
        reason: visitReason,
        diagnosis: diagnosis || undefined,
        notes: visitNotes || undefined,
        status: visitStatus,
      });
      setVisits(prev => [data.visit, ...prev]);
      resetVisitForm();
      setShowVisitForm(false);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEditVisit = (visit: Visit) => {
    setEditingVisitId(visit.id);
    setEditVisitDate(visit.visitDate);
    setEditReason(visit.reason);
    setEditDiagnosis(visit.diagnosis || '');
    setEditNotes(visit.notes || '');
    setEditVisitStatus(visit.status);
    setFormError(null);
  };

  const cancelEditVisit = () => {
    setEditingVisitId(null);
    setFormError(null);
  };

  const handleUpdateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!editingVisitId || !editVisitDate || !editReason) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία');
      return;
    }
    try {
      setSavingVisit(true);
      const data = await api.updateVisit(editingVisitId, {
        visitDate: editVisitDate,
        reason: editReason,
        diagnosis: editDiagnosis || null,
        notes: editNotes || null,
        status: editVisitStatus,
      });
      setVisits(prev => prev.map(v => (v.id === editingVisitId ? data.visit : v)));
      cancelEditVisit();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSavingVisit(false);
    }
  };

  // ── Επιβεβαίωση διαγραφής (modal) ──

  const requestDeleteVisit = (visit: Visit) => {
    const status = effectiveVisitStatus(visit);
    const vRefs = referralsByVisit[visit.id] || [];
    const examTotal = vRefs.reduce((sum, r) => sum + (examsByReferral[r.id]?.length || 0), 0);
    const executed = vRefs.filter(
      r => r.status === 'partially_executed' || r.status === 'fully_executed'
    );

    setDeleteTarget({
      type: 'visit',
      id: visit.id,
      title: visit.patientName || getPatientName(visit.patientId),
      subtitle: `${new Date(visit.visitDate).toLocaleDateString('el-GR')} · ${visit.reason}`,
      statusLabel: visitStatusLabels[status],
      isCompleted: status === 'completed',
      referralCount: vRefs.length,
      examCount: examTotal,
      ...(executed.length > 0
        ? {
            blockedReason:
              `Η επίσκεψη περιέχει ${executed.length} εκτελεσμένο(α) παραπεμπτικό(ά) στον φορέα ` +
              'και δεν μπορεί να διαγραφεί. Ακυρώστε πρώτα την εκτέλεση.',
          }
        : {}),
    });
  };

  const requestDeleteReferral = (referral: Referral) => {
    const isExecuted =
      referral.status === 'partially_executed' || referral.status === 'fully_executed';

    setDeleteTarget({
      type: 'referral',
      id: referral.id,
      title: referral.specialty || referral.reason,
      subtitle: referral.patientName || referral.visitReason,
      statusLabel: referralStatusLabels[referral.status],
      isCompleted: referral.status === 'completed',
      examCount: examsByReferral[referral.id]?.length || 0,
      ...(isExecuted
        ? {
            blockedReason:
              'Το παραπεμπτικό είναι εκτελεσμένο στον φορέα και δεν μπορεί να διαγραφεί. ' +
              'Ακυρώστε πρώτα την εκτέλεση.',
          }
        : {}),
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);

    try {
      if (deleteTarget.type === 'visit') {
        await api.deleteVisit(deleteTarget.id);
        setVisits(prev => prev.filter(v => v.id !== deleteTarget.id));
        setReferrals(prev => prev.filter(r => r.visitId !== deleteTarget.id));
        setExams(prev => prev.filter(e => e.visitId !== deleteTarget.id));
      } else {
        await api.deleteReferral(deleteTarget.id);
        setReferrals(prev => prev.filter(r => r.id !== deleteTarget.id));
        setExams(prev => prev.filter(e => e.referralId !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Ακύρωση εκτέλεσης παραπεμπτικού ──
  const requestCancelExecution = (
    referral: Referral,
    isFull: boolean,
    hasResults: boolean
  ) => {
    if (hasResults) return;
    setCancelTarget({
      referralId: referral.id,
      specialty: referral.specialty || referral.reason,
      patientName: referral.patientName || referral.visitReason,
      barcode: referral.barcode || referral.id.replace(/^referral_epres_/, ''),
      isFull,
      fullExecution: isFull,
    });
  };

  const confirmCancelExecution = async () => {    if (!cancelTarget || cancelingExecution) return;
    setCancelingExecution(true);
    setCancelMessage(null);

    try {
      const res = await api.cancelReferralExecution(cancelTarget.referralId);

      setReferrals(prev =>
        prev.map(r =>
          r.id === cancelTarget.referralId
            ? { ...r, status: 'pending' as Referral['status'], executedAt: undefined }
            : r
        )
      );
      setExams(prev =>
        prev.map(e =>
          e.referralId === cancelTarget.referralId && e.status === 'in_progress'
            ? { ...e, status: 'ordered' as Exam['status'] }
            : e
        )
      );

      setCancelMessage({
        type: 'success',
        text:
          cancelTarget.isFull
            ? 'Η εκτέλεση του παραπεμπτικού ακυρώθηκε πλήρως.'
            : 'Η μερική εκτέλεση του παραπεμπτικού ακυρώθηκε.',
      });
      setCancelTarget(null);
    } catch (err: any) {
      setCancelMessage({
        type: 'error',
        text:
          err.code === 'RESULTS_ENTERED' || err.status === 409
            ? 'Δεν είναι δυνατή η ακύρωση: έχουν ήδη καταχωρηθεί αποτελέσματα στις εξετάσεις.'
            : err.message || 'Αποτυχία ακύρωσης εκτέλεσης.',
      });
    } finally {
      setCancelingExecution(false);
    }
  };

  // ── Άντληση αποτελεσμάτων από τον φορέα κατά το άνοιγμα παραπεμπτικού ──
  const [fetchingResultsFor, setFetchingResultsFor] = useState<string | null>(null);

  // ── Αποστολή σε Κέντρο Αναφοράς (SLIS) ──
  const [centers, setCenters] = useState<ReferenceCenter[]>([]);
  const [centerPanelFor, setCenterPanelFor] = useState<string | null>(null);
  const [centerId, setCenterId] = useState<string>('');
  const [centerSelected, setCenterSelected] = useState<Set<string>>(new Set());
  const [centerPreview, setCenterPreview] = useState<{
    tests: Array<{ code: string; name: string; loincCode?: string; action: number }>;
    unmapped: Array<{ examId: string; name: string; loincCode?: string | null; reason: string }>;
    ambiguous: Array<{
      examId: string;
      name: string;
      loincCode: string;
      options: Array<{ code: string; name: string }>;
    }>;
  } | null>(null);
  const [centerChoices, setCenterChoices] = useState<Record<string, string>>({});
  const [centerLoading, setCenterLoading] = useState(false);
  const [centerSending, setCenterSending] = useState(false);
  const [centerError, setCenterError] = useState<string | null>(null);
  /** Πλήθος αντιγράφων barcode ανά απεσταλμένη εντολή (κλειδί: referralId:orderNo) */
  const [barcodeCopies, setBarcodeCopies] = useState<Record<string, number>>({});

  // Φόρτωση κέντρων αναφοράς μία φορά
  useEffect(() => {
    api
      .getReferenceCenters()
      .then(res => setCenters((res.centers || []).filter(c => c.active)))
      .catch(() => {});
  }, []);

  const openCenterPanel = (referral: Referral) => {
    const exams = examsByReferral[referral.id] || [];
    setCenterPanelFor(referral.id);
    // Δεν προτείνονται εξετάσεις ήδη απεσταλμένες ή ολοκληρωμένες
    setCenterSelected(
      new Set(
        exams
          .filter(e => {
            const st = String(e.status);
            return st !== 'sent' && st !== 'completed';
          })
          .map(e => e.id)
      )
    );
    setCenterPreview(null);
    setCenterChoices({});
    setCenterError(null);
    if (!centerId && centers.length > 0) setCenterId(centers[0].id);
  };

  const runCenterPreview = async (
    referralId: string,
    selected: Set<string>,
    choices: Record<string, string> = centerChoices
  ) => {
    if (!centerId) return;
    setCenterLoading(true);
    setCenterError(null);
    try {
      const res = await api.previewCenterSend(referralId, centerId, Array.from(selected), choices);
      setCenterPreview({ tests: res.tests, unmapped: res.unmapped, ambiguous: res.ambiguous || [] });
    } catch (err: any) {
      setCenterError(err?.message || 'Σφάλμα προεπισκόπησης');
      setCenterPreview(null);
    } finally {
      setCenterLoading(false);
    }
  };

  useEffect(() => {
    if (!centerPanelFor || !centerId) return;
    runCenterPreview(centerPanelFor, centerSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerPanelFor, centerId]);

  const handleFetchCenterResults = async (referral: Referral, targetCenterId?: string) => {
    const cid = targetCenterId || centerId || centers[0]?.id;
    if (!cid) return;
    setCenterSending(true);
    setCenterError(null);
    try {
      const res = await api.fetchResultsFromCenter(referral.id, cid);
      if (Array.isArray(res.exams) && res.exams.length > 0) {
        const map = new Map(res.exams.map((e: any) => [e.id, e]));
        setExams(prev => prev.map(e => (map.has(e.id) ? { ...e, ...map.get(e.id) } : e)));
      }
      setCancelMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setCenterError(err?.message || 'Σφάλμα άντλησης αποτελεσμάτων από το κέντρο');
    } finally {
      setCenterSending(false);
    }
  };

  const handleSendToCenter = async (referral: Referral) => {
    if (!centerId) return;
    const center = centers.find(c => c.id === centerId);
    const ok = window.confirm(
      `Αποστολή ${centerSelected.size} εξετάσεων στο «${center?.name || centerId}»;`
    );
    if (!ok) return;

    setCenterSending(true);
    setCenterError(null);
    try {
      const res = await api.sendToReferenceCenter(
        referral.id,
        centerId,
        Array.from(centerSelected),
        centerChoices
      );
      if (res.referral) {
        setReferrals(prev => prev.map(r => (r.id === referral.id ? { ...r, ...res.referral } : r)));
      }
      setCancelMessage({ type: 'success', text: res.message });
      // Παραμένει ανοιχτό το section ώστε να είναι άμεσα διαθέσιμη η εκτύπωση barcode.
      setCenterSelected(new Set());
      setCenterPreview(null);
      setCenterChoices({});
    } catch (err: any) {
      setCenterError(err?.message || 'Σφάλμα αποστολής στο κέντρο');
    } finally {
      setCenterSending(false);
    }
  };

  const printReferenceOrderBarcode = (
    referral: Referral,
    order: NonNullable<Referral['referenceOrders']>[number]
  ) => {
    const center = centers.find(c => c.id === order.centerId);
    const settings = centerBarcodeSettings(center);
    const key = `${referral.id}:${order.orderNo}`;
    const copies = Math.min(100, Math.max(1, Math.floor(barcodeCopies[key] ?? settings.copies)));
    const value = String(order.orderNo || '').trim();
    if (!value) {
      setCenterError('Δεν υπάρχει αριθμός εντολής για εκτύπωση barcode.');
      return;
    }

    let svgMarkup: string;
    try {
      svgMarkup = buildBarcodeSvg(value, settings);
    } catch {
      setCenterError(
        `Δεν είναι δυνατή η δημιουργία barcode τύπου ${settings.type} για τον αριθμό εντολής «${value}». ` +
          'Ελέγξτε τον τύπο barcode στις Ρυθμίσεις → Κέντρα Αναφοράς.'
      );
      return;
    }
    setCenterError(null);

    const centerName = escapeHtml(order.centerName || center?.name || '');
    const patientName = escapeHtml(referral.patientName || '');
    const sentDate = order.sentAt ? new Date(order.sentAt).toLocaleString('el-GR') : '';
    const labelHtml = `
    <div class="label">
      <div class="head">${centerName}</div>
      ${patientName ? `<div class="meta">${patientName}</div>` : ''}
      ${svgMarkup}
      <div class="meta">Αρ. εντολής: <strong>${escapeHtml(value)}</strong></div>
      ${sentDate ? `<div class="meta">${escapeHtml(sentDate)}</div>` : ''}
    </div>`;

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode εντολής ${escapeHtml(value)}</title>
  <style>
    @page { margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
    .label {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
      page-break-after: always;
      break-after: page;
    }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .head { font-size: 9pt; font-weight: bold; text-align: center; }
    .meta { font-size: 8pt; color: #333; text-align: center; }
    svg { display: block; }
  </style>
</head>
<body>
${Array.from({ length: copies }, () => labelHtml).join('')}
</body>
</html>`;

    setPrintPreview({ title: `Barcode εντολής ${value} (${copies} αντίγραφα)`, html: content });
  };

  const [cancellingResultsFor, setCancellingResultsFor] = useState<string | null>(null);

  const handleCancelFetchedResults = async (referral: Referral) => {
    const ok = window.confirm(
      'Ακύρωση των αντληθέντων αποτελεσμάτων στον φορέα;\n\n' +
        'Οι εξετάσεις θα επανέλθουν στην κατάσταση πριν την άντληση, ώστε να μπορείτε να ' +
        'καταχωρήσετε αποτελέσματα ξανά.'
    );
    if (!ok) return;

    setCancellingResultsFor(referral.id);
    try {
      const res = await api.cancelReferralResults(referral.id);
      if (Array.isArray(res.exams) && res.exams.length > 0) {
        const map = new Map(res.exams.map((e: any) => [e.id, e]));
        setExams(prev => prev.map(e => (map.has(e.id) ? { ...e, ...map.get(e.id) } : e)));
      }
      if (res.referral) {
        setReferrals(prev => prev.map(r => (r.id === referral.id ? { ...r, ...res.referral } : r)));
      }
      setCancelMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setCancelMessage({
        type: 'error',
        text: err?.message || 'Αποτυχία ακύρωσης αποτελεσμάτων',
      });
    } finally {
      setCancellingResultsFor(null);
    }
  };

  useEffect(() => {
    if (!modalReferralId) return;
    const referral = referrals.find(r => r.id === modalReferralId);
    if (!referral) return;
    // Μόνο παραπεμπτικά που αντλήθηκαν από την ηλεκτρονική συνταγογράφηση
    const isEpres = Boolean(referral.barcode || referral.id.startsWith('referral_epres_'));
    if (!isEpres) return;

    let cancelled = false;
    setFetchingResultsFor(referral.id);

    const mergeExams = (list: any[]) => {
      if (!Array.isArray(list) || list.length === 0) return;
      setExams(prev => {
        const map = new Map(list.map((e: any) => [e.id, e]));
        const next = prev.map(e => (map.has(e.id) ? { ...e, ...map.get(e.id) } : e));
        const existing = new Set(prev.map(e => e.id));
        for (const e of list) if (!existing.has(e.id)) next.push(e);
        return next;
      });
    };

    (async () => {
      // 1) Άντληση από τον κρατικό φορέα (e-Prescription)
      try {
        const res = await api.fetchReferralResults(referral.id);
        if (!cancelled) mergeExams(res.exams);
      } catch {
        // σιωπηλή αποτυχία — ο χρήστης μπορεί να δοκιμάσει χειροκίνητα
      }

      if (cancelled) return;

      // 2) Αν το παραπεμπτικό έχει σταλεί σε κέντρο αναφοράς → άντληση αποτελεσμάτων
      const orders = Array.isArray(referral.referenceOrders) ? referral.referenceOrders : [];
      const centerIds = Array.from(
        new Set(orders.map(o => String(o.centerId || '')).filter(Boolean))
      );

      for (const cid of centerIds) {
        if (cancelled) return;
        try {
          const res = await api.fetchResultsFromCenter(referral.id, cid);
          if (cancelled) return;
          mergeExams(res.exams);
          if (res.updatedExams > 0) {
            setCancelMessage({ type: 'success', text: res.message });
          }
        } catch {
          // σιωπηλή αποτυχία (π.χ. δεν έχει επιστρέψει ακόμη αποτελέσματα)
        }
      }
    })()
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setFetchingResultsFor(null);
      });

    return () => {
      cancelled = true;
    };
  }, [modalReferralId, referrals]);

  const requestSubmitResults = async (referral: Referral, alreadySubmitted: boolean) => {
    if (alreadySubmitted) {
      setCancelMessage({
        type: 'error',
        text:
          'Έχει ήδη γίνει καταχώρηση αποτελεσμάτων στον φορέα για αυτό το παραπεμπτικό. ' +
          'Ακυρώστε πρώτα τα αποτελέσματα (κουμπί «Ακύρωση αποτελεσμάτων») για να στείλετε νέα.',
      });
      return;
    }
    const completed = (examsByReferral[referral.id] || []).filter(
      e =>
        String(e.status) === 'completed' &&
        !(e as any).resultsSubmittedAt &&
        ((typeof e.result === 'string' && e.result.trim() !== '') ||
          (Array.isArray(e.parameters) && e.parameters.some(p => (p.result ?? '').trim() !== '')))
    );
    const confirmed = window.confirm(
      `Αποστολή αποτελεσμάτων ${completed.length} ολοκληρωμένων εξετάσεων στον φορέα (ΗΔΙΚΑ);`
    );
    if (!confirmed) return;

    setSubmittingResultsId(referral.id);
    setCancelMessage(null);
    try {
      const res = await api.submitReferralResults(referral.id, false);
      setReferrals(prev =>
        prev.map(r =>
          r.id === referral.id
            ? {
                ...r,
                notes: res.referral?.notes ?? r.notes,
                resultsSubmittedAt: res.referral?.resultsSubmittedAt ?? res.sentAt,
                resultsSubmittedCount: res.referral?.resultsSubmittedCount ?? res.indicatorCount,
              }
            : r
        )
      );
      setCancelMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setCancelMessage({
        type: 'error',
        text: err?.message || 'Αποτυχία αποστολής αποτελεσμάτων στον φορέα',
      });
    } finally {
      setSubmittingResultsId(null);
    }
  };

  const handlePrintVisit = (visit: Visit) => {
    const visitReferrals = referrals.filter(r => r.visitId === visit.id);
    const examsByReferral = referrals.reduce((acc, r) => {
      acc[r.id] = exams.filter(e => e.referralId === r.id);
      return acc;
    }, {} as Record<string, Exam[]>);

    const statusLabels: Record<string, string> = {
      scheduled: 'Προγραμματισμένη',
      in_progress: 'Σε εξέλιξη',
      completed: 'Ολοκληρωμένη',
      cancelled: 'Ακυρωμένη',
    };

    const refStatusLabels: Record<string, string> = {
      pending: 'Εκκρεμεί', sent: 'Απεστάλη', received: 'Παραλήφθηκε',
      partially_executed: 'Σε εξέλιξη - Μερικώς Εκτελεσμένο',
      fully_executed: 'Σε εξέλιξη - Ολικώς Εκτελεσμένο',
      completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε',
    };

    const examStatusLabels: Record<string, string> = {
      ordered: 'Διατάχθηκε', in_progress: 'Σε εξέλιξη',
      completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε',
    };

    const examCategoryLabels: Record<string, string> = {
      hematology: 'Αιματολογικές', biochemistry: 'Βιοχημικές', immunology: 'Ανοσολογικές',
      hormones: 'Ορμονολογικές', microbiology: 'Μικροβιολογικές', cytology: 'Κυτταρολογικές',
      imaging: 'Απεικονιστικές', other: 'Άλλη',
    };

    const content = `<!DOCTYPE html>
<html>
<head>
  <title>Επίσκεψη - ${visit.patientName || 'Ασθενής'}</title>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 900px; margin: 0 auto; }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; font-size: 22px; }
    h3 { margin: 16px 0 8px; font-size: 15px; color: #2563eb; }
    .section { margin-bottom: 20px; }
    .label { font-weight: bold; color: #555; display: inline-block; width: 150px; font-size: 13px; }
    p { margin: 4px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background-color: #f3f4f6; font-size: 12px; }
    .param-row { background: #f9fafb; font-size: 11px; color: #555; }
    .param-name { padding-left: 24px !important; }
    .footer { text-align: right; color: #999; margin-top: 40px; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>🏥 Επίσκεψη Ασθενούς</h1>

  <div class="section">
    <h3>Στοιχεία Ασθενούς</h3>
    <p><span class="label">Ονοματεπώνυμο:</span> ${visit.patientName || '-'}</p>
  </div>

  <div class="section">
    <h3>Στοιχεία Επίσκεψης</h3>
    <p><span class="label">Ημερομηνία:</span> ${new Date(visit.visitDate).toLocaleDateString('el-GR')}</p>
    <p><span class="label">Κατάσταση:</span> ${statusLabels[effectiveVisitStatus(visit)] || effectiveVisitStatus(visit)}</p>
    <p><span class="label">Αιτία:</span> ${visit.reason || '-'}</p>
    <p><span class="label">Διάγνωση:</span> ${visit.diagnosis || '-'}</p>
    <p><span class="label">Σημειώσεις:</span> ${visit.notes || '-'}</p>
  </div>

  <div class="section">
    <h3>Παραπεμπτικά & Εξετάσεις (${visitReferrals.length})</h3>
    ${visitReferrals.length > 0 ? visitReferrals.map(r => {
      const refExams = examsByReferral[r.id] || [];
      return `
      <table>
        <thead><tr><th>Ειδικότητα</th><th>Αιτιολογία</th><th>Νοσοκομείο</th><th>Ημ/νία</th><th>Κατάσταση</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>${r.specialty}</strong></td>
            <td>${r.reason || '-'}</td>
            <td>${r.hospital || '-'}</td>
            <td>${new Date(r.referralDate).toLocaleDateString('el-GR')}</td>
            <td>${refStatusLabels[r.status] || r.status}</td>
          </tr>
        </tbody>
      </table>
      ${refExams.length > 0 ? `
      <table>
        <thead><tr><th>Εξέταση</th><th>Κατηγορία</th><th>Αποτέλεσμα</th><th>Μονάδα</th><th>Εύρος</th><th>Ημ/νία</th><th>Κατάσταση</th></tr></thead>
        <tbody>
          ${refExams.map(e => `
            <tr>
              <td>🔬 ${e.name}</td>
              <td>${examCategoryLabels[e.category || ''] || e.category || '-'}</td>
              <td>${e.result || '-'}</td>
              <td>${e.unit || '-'}</td>
              <td>${e.referenceRange || '-'}</td>
              <td>${e.examDate ? new Date(e.examDate).toLocaleDateString('el-GR') : '-'}</td>
              <td>${examStatusLabels[e.status] || e.status}</td>
            </tr>
            ${(e.parameters || []).map(p => `
            <tr class="param-row">
              <td class="param-name">↳ ${p.name}</td>
              <td></td>
              <td>${p.result || '-'}</td>
              <td>${p.unit || '-'}</td>
              <td>${p.referenceRange || '-'}</td>
              <td></td>
              <td></td>
            </tr>`).join('')}
          `).join('')}
        </tbody>
      </table>` : '<p style="font-size:12px; color:#888; margin:4px 0;">Καμία εξέταση</p>'}
      `;
    }).join('') : '<p>Δεν υπάρχουν παραπεμπτικά.</p>'}
  </div>

  <p class="footer">Εκτυπώθηκε: ${new Date().toLocaleDateString('el-GR')}</p>
</body>
</html>`;

    openPrintDocument(content);
  };

  const handlePrintReferral = (referral: Referral) => {
    const refExams = examsByReferral[referral.id] || [];
    const esc = (value: unknown) => escapeHtml(value === undefined || value === null ? '' : String(value));
    const fmtDate = (value?: string) =>
      value ? new Date(value).toLocaleDateString('el-GR') : '-';

    const labName = labProfile?.profile?.labName || labProfile?.identity?.labName || '';
    const labVat = labProfile?.profile?.vatNumber || labProfile?.identity?.vatNumber || '';
    const labLicense = labProfile?.profile?.licenseNumber || labProfile?.identity?.licenseNumber || '';
    const doctorSpecialty = labProfile?.profile?.doctorSpecialty || '';

    // Ο γιατρός του παραπεμπτικού: ταίριασμα με τη λίστα χρηστών (uid ή Better Auth id)
    // ή με τον συνδεδεμένο χρήστη.
    const doctorName = (() => {
      const doctorId = referral.doctorId;
      if (doctorId) {
        const match = doctorDirectory.find(d => d.uid === doctorId || d.id === doctorId);
        if (match) return match.displayName || match.email;
        if (user && (doctorId === user.uid)) return user.displayName || user.email;
        return '';
      }
      return user?.displayName || user?.email || '';
    })();

    const orders = Array.isArray(referral.referenceOrders) ? referral.referenceOrders : [];
    const ordersHtml = orders.length > 0
      ? `
      <h3>Κέντρα Αναφοράς — Εντολές</h3>
      <table>
        <thead><tr><th>Κέντρο</th><th>Αρ. εντολής</th><th>LIS</th><th>Κατάσταση</th><th>Ημ/νία αποστολής</th><th>Κωδικοί</th></tr></thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td>${esc(o.centerName)}</td>
              <td><strong>${esc(o.orderNo)}</strong></td>
              <td>${esc(o.lisOrderNo || '-')}</td>
              <td>${esc(o.status)}</td>
              <td>${o.sentAt ? esc(new Date(o.sentAt).toLocaleString('el-GR')) : '-'}</td>
              <td>${esc((o.tests || []).map(t => t.code).join(', ') || '-')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`
      : '';

    const examsHtml = refExams.length > 0
      ? refExams.map(e => `
      <table>
        <thead><tr><th>Εξέταση</th><th>Κατηγορία</th><th>Αποτέλεσμα</th><th>Μονάδα</th><th>Εύρος</th><th>Ημ/νία</th><th>Κατάσταση</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>${esc(e.name)}</strong>${e.loincCode ? ` <span class="loinc">${esc(e.loincCode)}</span>` : ''}</td>
            <td>${esc((EXAM_CATEGORY_LABELS_EL as Record<string, string>)[e.category || ''] || e.category || '-')}</td>
            <td>${esc(e.result || '-')}</td>
            <td>${esc(e.unit || '-')}</td>
            <td>${esc(e.referenceRange || '-')}</td>
            <td>${fmtDate(e.examDate)}</td>
            <td>${esc(examStatusLabels[e.status] || e.status)}</td>
          </tr>
          ${(e.parameters || []).map(p => `
          <tr class="param-row">
            <td class="param-name">↳ ${esc(p.name)}${p.loincNum ? ` <span class="loinc">${esc(p.loincNum)}</span>` : ''}</td>
            <td></td>
            <td>${esc(p.result || '-')}</td>
            <td>${esc(p.unit || '-')}</td>
            <td>${esc(p.referenceRange || '-')}</td>
            <td></td>
            <td></td>
          </tr>`).join('')}
        </tbody>
      </table>`).join('')
      : '<p class="muted">Δεν υπάρχουν εξετάσεις.</p>';

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Παραπεμπτικό - ${esc(referral.patientName || 'Ασθενής')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 16mm; color: #333; max-width: 900px; margin: 0 auto; }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px; font-size: 22px; }
    h3 { margin: 16px 0 8px; font-size: 14px; color: #2563eb; }
    .label { font-weight: bold; color: #555; display: inline-block; width: 150px; font-size: 13px; }
    p { margin: 4px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background-color: #f3f4f6; font-size: 12px; }
    .param-row { background: #f9fafb; font-size: 11px; color: #555; }
    .param-name { padding-left: 24px !important; }
    .loinc { font-family: monospace; font-size: 10px; color: #6b7280; }
    .muted { color: #888; font-size: 12px; }
    .footer { text-align: right; color: #999; margin-top: 30px; font-size: 11px; }
    @media print { body { padding: 10mm; } }
  </style>
</head>
<body>
  <h1>📋 Παραπεμπτικό</h1>

  <div class="section">
    <h3>Στοιχεία Εργαστηρίου</h3>
    <p><span class="label">Εργαστήριο:</span> ${esc(labName || '-')}</p>
    <p><span class="label">ΑΦΜ:</span> ${esc(labVat || '-')}</p>
    <p><span class="label">Άδεια λειτουργίας:</span> ${esc(labLicense || '-')}</p>
    <p><span class="label">Γιατρός:</span> ${esc(doctorName || '-')}</p>
    ${doctorSpecialty ? `<p><span class="label">Ειδικότητα γιατρού:</span> ${esc(doctorSpecialty)}</p>` : ''}
  </div>

  <div class="section">
    <h3>Στοιχεία Ασθενούς</h3>
    <p><span class="label">Ονοματεπώνυμο:</span> ${esc(referral.patientName || '-')}</p>
  </div>

  <div class="section">
    <h3>Στοιχεία Παραπεμπτικού</h3>
    <p><span class="label">Ειδικότητα:</span> ${esc(referral.specialty || '-')}</p>
    <p><span class="label">Λόγος:</span> ${esc(referral.reason || '-')}</p>
    <p><span class="label">Ημερομηνία:</span> ${fmtDate(referral.referralDate)}</p>
    <p><span class="label">Νοσοκομείο:</span> ${esc(referral.hospital || '-')}</p>
    <p><span class="label">Κατάσταση:</span> ${esc(referralStatusLabels[referral.status] || referral.status)}</p>
    ${referral.barcode ? `<p><span class="label">Barcode:</span> ${esc(referral.barcode)}</p>` : ''}
    ${referral.executionNo ? `<p><span class="label">Αρ. εκτέλεσης:</span> ${esc(referral.executionNo)}</p>` : ''}
    ${referral.notes ? `<p><span class="label">Σημειώσεις:</span> ${esc(referral.notes)}</p>` : ''}
  </div>

  ${ordersHtml}

  <div class="section">
    <h3>Εξετάσεις (${refExams.length})</h3>
    ${examsHtml}
  </div>

  <p class="footer">Εκτυπώθηκε: ${new Date().toLocaleString('el-GR')}</p>
</body>
</html>`;

    setPrintPreview({
      title: `Παραπεμπτικό — ${referral.patientName || 'Ασθενής'}`,
      html: content,
    });
  };

  // ── Referral CRUD ──
  const resetRefForm = () => {
    setRefSpecialty('');
    setRefReason('');
    setRefHospital('');
    setRefDate('');
    setRefStatus('pending');
    setRefNotes('');
    setRefFormError(null);
  };

  const openRefForm = (visitId: string) => {
    resetRefForm();
    setShowReferralFormForVisit(visitId);
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefFormError(null);
    const visitId = showReferralFormForVisit;
    if (!visitId || !refSpecialty || !refReason || !refDate) {
      setRefFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία (Ειδικότητα, Λόγος, Ημερομηνία)');
      return;
    }
    try {
      setCreatingRef(true);
      const visit = visits.find(v => v.id === visitId);
      const data = await api.createReferral({
        visitId,
        patientId: visit?.patientId || '',
        patientName: visit?.patientName || '',
        visitReason: visit?.reason || '',
        specialty: refSpecialty,
        reason: refReason,
        hospital: refHospital || undefined,
        referralDate: refDate,
        status: refStatus,
        notes: refNotes || undefined,
      });
      setReferrals(prev => [data.referral, ...prev]);
      setExpandedVisits(prev => new Set([...prev, visitId]));
      resetRefForm();
      setShowReferralFormForVisit(null);
      // Open the newly created referral in the modal
      setModalReferralId(data.referral.id);
    } catch (err: any) {
      setRefFormError(err.message);
    } finally {
      setCreatingRef(false);
    }
  };

  const startEditReferral = (referral: Referral) => {
    setEditingRefId(referral.id);
    setEditRefSpecialty(referral.specialty);
    setEditRefReason(referral.reason);
    setEditRefHospital(referral.hospital || '');
    setEditRefDate(referral.referralDate);
    setEditRefStatus(referral.status);
    setEditRefNotes(referral.notes || '');
    setRefFormError(null);
  };

  const cancelEditReferral = () => {
    setEditingRefId(null);
    setRefFormError(null);
  };

  const handleUpdateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefFormError(null);
    if (!editingRefId || !editRefSpecialty || !editRefReason || !editRefDate) {
      setRefFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία');
      return;
    }
    try {
      setSavingRef(true);
      const data = await api.updateReferral(editingRefId, {
        specialty: editRefSpecialty,
        reason: editRefReason,
        hospital: editRefHospital || null,
        referralDate: editRefDate,
        status: editRefStatus,
        notes: editRefNotes || null,
      });
      setReferrals(prev => prev.map(r => (r.id === editingRefId ? data.referral : r)));
      cancelEditReferral();
    } catch (err: any) {
      setRefFormError(err.message);
    } finally {
      setSavingRef(false);
    }
  };

  // ── Exam CRUD ──
  const resetExamForm = () => {
    setExamName('');
    setExamCategory('');
    setExamDate('');
    setExamStatus('ordered');
    setExamResult('');
    setExamUnit('');
    setExamRefRange('');
    setExamNotes('');
    setExamParameters([]);
    setExamLoincCode('');
    setExamFormError(null);
    setLoincQuery('');
    setLoincResults([]);
    setLoincDropdownOpen(false);
  };

  const openExamForm = (referralId: string) => {
    resetExamForm();
    setShowExamFormForReferral(referralId);
  };

  /** Επιλογή εξέτασης από τον κατάλογο — συμπληρώνει αυτόματα τα πεδία */
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormError(null);
    const referralId = showExamFormForReferral;
    if (!referralId || !examName) {
      setExamFormError('Συμπληρώστε το όνομα της εξέτασης');
      return;
    }
    // Filter out empty parameters
    const validParams = examParameters.filter(p => p.name.trim());
    const hasCreateParams = validParams.length > 0;
    try {
      setCreatingExam(true);
      const referral = referrals.find(r => r.id === referralId);
      const data = await api.createExam({
        referralId,
        visitId: referral?.visitId || '',
        patientId: referral?.patientId || '',
        patientName: referral?.patientName || '',
        name: examName,
        category: examCategory || undefined,
        status: examStatus,
        result: hasCreateParams ? undefined : (examResult || undefined),
        unit: hasCreateParams ? undefined : (examUnit || undefined),
        referenceRange: hasCreateParams ? undefined : (examRefRange || undefined),
        parameters: hasCreateParams ? validParams : undefined,
        notes: examNotes || undefined,
        examDate: examDate || undefined,
        loincCode: examLoincCode || undefined,
      });
      setExams(prev => [data.exam, ...prev]);
      setShowExamFormForReferral(null);
      resetExamForm();
      setShowExamFormForReferral(null);
    } catch (err: any) {
      setExamFormError(err.message);
    } finally {
      setCreatingExam(false);
    }
  };

  const startEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setEditExamName(exam.name);
    setEditExamCategory(exam.category || '');
    setEditExamDate(exam.examDate || '');
    setEditExamStatus(exam.status);
    setEditExamResult(exam.result || '');
    setEditExamUnit(exam.unit || '');
    setEditExamRefRange(exam.referenceRange || '');
    setEditExamNotes(exam.notes || '');
    setEditExamParameters(exam.parameters || []);
    setEditExamLoincCode(exam.loincCode || '');
    setExamFormError(null);
    setLoincQuery('');
    setLoincResults([]);
    setLoincDropdownOpen(false);
  };

  const cancelEditExam = () => {
    setEditingExamId(null);
    setEditExamParameters([]);
    setEditExamLoincCode('');
    setExamFormError(null);
    setLoincQuery('');
    setLoincResults([]);
    setLoincDropdownOpen(false);
  };

  const handleUpdateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormError(null);
    if (!editingExamId || !editExamName) {
      setExamFormError('Συμπληρώστε το όνομα της εξέτασης');
      return;
    }
    const validParams = editExamParameters.filter(p => p.name.trim());
    const hasUpdateParams = validParams.length > 0;
    try {
      setSavingExam(true);
      const data = await api.updateExam(editingExamId, {
        name: editExamName,
        category: editExamCategory || null,
        examDate: editExamDate || null,
        status: editExamStatus,
        result: hasUpdateParams ? undefined : (editExamResult || null),
        unit: hasUpdateParams ? undefined : (editExamUnit || null),
        referenceRange: hasUpdateParams ? undefined : (editExamRefRange || null),
        parameters: hasUpdateParams ? validParams : [],
        notes: editExamNotes || null,
        loincCode: editExamLoincCode || null,
      });
      setExams(prev => prev.map(e => (e.id === editingExamId ? data.exam : e)));
      cancelEditExam();
    } catch (err: any) {
      setExamFormError(err.message);
    } finally {
      setSavingExam(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    const exam = exams.find(e => e.id === id);
    if (exam && String(exam.status) === 'sent') {
      setError('Η εξέταση έχει αποσταλεί σε κέντρο αναφοράς και δεν μπορεί να διαγραφεί.');
      return;
    }
    if (!confirm('Είστε βέβαιοι ότι θέλετε να διαγράψετε αυτή την εξέταση;')) return;
    try {
      await api.deleteExam(id);
      setExams(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Inline result entry ──
  const initInlineValues = (exam: Exam) => {
    if (!inlineValues[exam.id]) {
      const params: Record<number, ParamInline> = {};
      if (exam.parameters) {
        exam.parameters.forEach((p, i) => {
          params[i] = { result: p.result || '', unit: p.unit || '', refRange: p.referenceRange || '' };
        });
      }
      setInlineValues(prev => ({
        ...prev,
        [exam.id]: {
          mainResult: exam.result || '',
          mainUnit: exam.unit || '',
          mainRefRange: exam.referenceRange || '',
          examDate: exam.examDate || '',
          params,
        },
      }));
    }
  };

  const updateInlineParamValue = (examId: string, paramIdx: number, field: string, value: string) => {
    setInlineValues(prev => {
      const examVals = prev[examId] || DEFAULT_INLINE();
      const params = { ...examVals.params };
      params[paramIdx] = { ...(params[paramIdx] || { result: '', unit: '', refRange: '' }), [field]: value };
      return { ...prev, [examId]: { ...examVals, params } };
    });
  };

  const handleSaveInlineResult = async (examId: string, referralId: string) => {
    const vals = inlineValues[examId];
    if (!vals) return;
    setExamFormError(null);

    // Build updated parameters array from inline values
    const exam = exams.find(e => e.id === examId);
    const updatedParams = exam?.parameters?.map((p, i) => {
      const inlineParam = vals.params[i];
      if (inlineParam) {
        return { ...p, result: inlineParam.result || undefined, unit: inlineParam.unit || undefined, referenceRange: inlineParam.refRange || undefined };
      }
      return p;
    });

    try {
      setSavingInlineExamId(examId);
      const hasParams = exam?.parameters && exam.parameters.length > 0;
      const data = await api.updateExam(examId, {
        result: hasParams ? undefined : (vals.mainResult || null),
        unit: hasParams ? undefined : (vals.mainUnit || null),
        referenceRange: hasParams ? undefined : (vals.mainRefRange || null),
        examDate: vals.examDate || null,
        parameters: updatedParams || undefined,
        status: 'in_progress',
      });
      setExams(prev => prev.map(e => (e.id === examId ? data.exam : e)));
      setInlineValues(prev => {
        const next = { ...prev };
        delete next[examId];
        return next;
      });
    } catch (err: any) {
      setExamFormError(err.message);
    } finally {
      setSavingInlineExamId(null);
    }
  };

  const toggleVisit = (visitId: string) => {
    setExpandedVisits(prev => {
      const next = new Set(prev);
      if (next.has(visitId)) next.delete(visitId);
      else next.add(visitId);
      return next;
    });
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? `${patient.firstName} ${patient.lastName}` : 'Άγνωστος';
  };

  /** Ο ασθενής του ενεργού φίλτρου (banner + προεπιλογή στη φόρμα) */
  const filteredPatient = patientFilter
    ? patients.find(p => p.id === patientFilter)
    : undefined;

  /** Παραπεμπτικά που μπορούν να επιλεγούν (όχι ληγμένα) */
  const selectableCount = npResult
    ? npResult.referrals.filter(r => !isExpired(r.expiryDate)).length
    : 0;

  // ── Filtering ──
  const filteredVisits = search
    ? visits.filter(v =>
        (v.patientName || getPatientName(v.patientId)).toLowerCase().includes(search.toLowerCase()) ||
        v.reason.toLowerCase().includes(search.toLowerCase()) ||
        (v.diagnosis && v.diagnosis.toLowerCase().includes(search.toLowerCase())) ||
        v.id.toLowerCase().includes(search.toLowerCase()) ||
        referralsByVisit[v.id]?.some(r =>
          r.specialty.toLowerCase().includes(search.toLowerCase()) ||
          r.reason.toLowerCase().includes(search.toLowerCase()) ||
          (r.hospital && r.hospital.toLowerCase().includes(search.toLowerCase())) ||
          examsByReferral[r.id]?.some(e =>
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            (e.category && e.category.toLowerCase().includes(search.toLowerCase())) ||
            (e.result && e.result.toLowerCase().includes(search.toLowerCase())) ||
            (e.parameters && e.parameters.some(p => p.name.toLowerCase().includes(search.toLowerCase())))
          )
        )
      )
    : visits;

  // ── Render ──
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-primary-600" />
            Επισκέψεις
          </h1>
          <p className="text-gray-500 mt-1">Παρακολούθηση ιατρικών επισκέψεων και παραπεμπτικών</p>
        </div>
        <button
          onClick={() => {
            resetVisitForm();
            // Με ενεργό φίλτρο, προεπιλέγεται ο συγκεκριμένος ασθενής
            if (patientFilter) setSelectedPatientId(patientFilter);
            setShowVisitForm(!showVisitForm);
          }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {showVisitForm ? 'Απόκρυψη φόρμας' : 'Νέα Επίσκεψη'}
        </button>
      </div>

      {/* ── Άυλη Συνταγογράφηση: Αναζήτηση παραπεμπτικών με ΑΜΚΑ ── */}
      <div className="mb-6">
        <button
          onClick={() => {
            if (showNopaper) {
              setShowNopaper(false);
            } else {
              resetNopaper();
              setShowNopaper(true);
            }
          }}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-colors text-left ${
            showNopaper
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <FileSearch className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Αναζήτηση Παραπεμπτικών με ΑΜΚΑ
              </p>
              <p className="text-xs text-gray-500">
                Άντληση παραπεμπτικών από το e-Prescription και καταχώρηση σε επίσκεψη
                «Άυλη συνταγογράφηση»
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
              showNopaper ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showNopaper && (
          <div className="mt-3 p-5 bg-white rounded-xl border border-emerald-200 shadow-sm">
            <form onSubmit={handleNopaperSearch} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ΑΜΚΑ Ασθενούς *
                </label>
                <input
                  type="text"
                  value={npAmka}
                  onChange={e => {
                    setNpAmka(e.target.value);
                    setNpError(null);
                  }}
                  className="input-field"
                  placeholder="11 ψηφία, π.χ. 05039001978"
                  maxLength={11}
                  inputMode="numeric"
                />
              </div>
              <div className="w-full sm:w-40">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN <span className="text-gray-400 font-normal">(προαιρετικό)</span>
                </label>
                <input
                  type="text"
                  value={npPin}
                  onChange={e => setNpPin(e.target.value)}
                  className="input-field"
                  placeholder="PIN"
                />
              </div>
              <button
                type="submit"
                disabled={npSearching}
                className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50 shrink-0 w-full sm:w-auto"
              >
                {npSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {npSearching ? 'Αναζήτηση...' : 'Αναζήτηση'}
              </button>
            </form>

            {npError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{npError}</span>
              </div>
            )}

            {npSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{npSuccess.message}</p>
                    <p className="mt-0.5 text-emerald-700">
                      Καταχωρήθηκαν <strong>{npSuccess.count}</strong> παραπεμπτικά
                      {npSuccess.patientCreated && ' · Δημιουργήθηκε νέος ασθενής'} · Επίσκεψη:{' '}
                      <span className="font-mono text-xs">{npSuccess.visitId}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {npExpiredWarning.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">
                      Δεν καταχωρήθηκαν {npExpiredWarning.length} ληγμένα παραπεμπτικά
                    </p>
                    <p className="mt-0.5 text-red-700 font-mono text-xs break-all">
                      {npExpiredWarning.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {npResult && npResult.referrals.length > 0 && (
              <div className="mt-4">
                {/* Στοιχεία ασθενούς */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-sm">
                  <span className="font-medium text-gray-900">
                    {npResult.existingPatient
                      ? `${npResult.existingPatient.firstName} ${npResult.existingPatient.lastName}`
                      : npResult.patientName ||
                        [npResult.referrals[0]?.firstName, npResult.referrals[0]?.lastName]
                          .filter(Boolean)
                          .join(' ')}
                  </span>
                  <span className="text-gray-500">ΑΜΚΑ {npResult.amka}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      npResult.existingPatient
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {npResult.existingPatient ? 'Υπάρχων ασθενής' : 'Θα δημιουργηθεί νέος ασθενής'}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {npResult.total} παραπεμπτικά
                  </span>
                  {!!npResult.alreadyImportedCount && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      {npResult.alreadyImportedCount} ήδη εισαγμένα (κρυμμένα)
                    </span>
                  )}
                  {(() => {
                    const expiredCount = npResult.referrals.filter(r =>
                      isExpired(r.expiryDate)
                    ).length;
                    return expiredCount > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                        {expiredCount} ληγμένα (δεν καταχωρούνται)
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Νέα πεδία ασθενούς */}
                {!npResult.existingPatient && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Ημ. Γέννησης (προαιρετικό)
                      </label>
                      <input
                        type="date"
                        value={npDob}
                        onChange={e => setNpDob(e.target.value)}
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Φύλο</label>
                      <select
                        value={npGender}
                        onChange={e => setNpGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                        className="input-field text-sm"
                      >
                        <option value="MALE">♂ Άνδρας</option>
                        <option value="FEMALE">♀ Γυναίκα</option>
                        <option value="OTHER">⚧ Άλλο</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Επιλογή όλων */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    type="button"
                    onClick={toggleAllNpReferrals}
                    disabled={selectableCount === 0}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {npSelected.size > 0 && npSelected.size === selectableCount
                      ? 'Αποεπιλογή όλων'
                      : 'Επιλογή όλων'}
                  </button>
                  <span className="text-xs text-gray-500">
                    {npSelected.size} επιλεγμένα
                  </span>
                </div>

                {/* Λίστα παραπεμπτικών */}
                <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {npResult.referrals.map(ref => {
                    const expired = isExpired(ref.expiryDate);
                    const checked = npSelected.has(ref.barcode);
                    return (
                      <label
                        key={ref.barcode}
                        className={`flex items-start gap-3 p-3 transition-colors ${
                          expired
                            ? 'bg-red-50/50 cursor-not-allowed'
                            : checked
                            ? 'bg-emerald-50 cursor-pointer'
                            : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={expired}
                          onChange={() => toggleNpReferral(ref.barcode)}
                          className="mt-0.5 w-4 h-4 accent-emerald-600 disabled:opacity-40"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-mono text-xs font-medium ${
                                expired ? 'text-gray-400 line-through' : 'text-gray-900'
                              }`}
                            >
                              {ref.barcode}
                            </span>
                            {expired && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                                ΛΗΓΜΕΝΟ
                              </span>
                            )}
                            {ref.statusName && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {ref.statusName}
                              </span>
                            )}
                            {ref.isProactive && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                                Προληπτική
                              </span>
                            )}
                            {ref.socialInsuranceShortName && (
                              <span className="text-[11px] text-gray-400">
                                {ref.socialInsuranceShortName}
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-sm mt-0.5 truncate ${
                              expired ? 'text-gray-400' : 'text-gray-700'
                            }`}
                          >
                            {ref.examinationGroupName || '—'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Έκδοση: {ref.issueDate ? ref.issueDate.slice(0, 10) : '—'}
                            {ref.expiryDate && ` · Λήξη: ${ref.expiryDate.slice(0, 10)}`}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Ενέργεια εισαγωγής */}
                <div className="flex items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-gray-500">
                    Θα δημιουργηθεί επίσκεψη «Άυλη συνταγογράφηση» με ημερομηνία σήμερα.
                  </p>
                  <button
                    type="button"
                    onClick={handleNopaperImport}
                    disabled={npImporting || npSelected.size === 0}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50 shrink-0"
                  >
                    {npImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {npImporting
                      ? 'Εισαγωγή...'
                      : `Εισαγωγή ${npSelected.size > 0 ? `(${npSelected.size})` : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Άυλη Συνταγογράφηση: Αναζήτηση Παραπεμπτικών με Barcode ── */}
      <div className="mb-6">
        <button
          onClick={() => {
            if (showBarcode) {
              setShowBarcode(false);
            } else {
              resetBarcode();
              setShowBarcode(true);
            }
          }}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 transition-colors text-left ${
            showBarcode
              ? 'border-sky-500 bg-sky-50'
              : 'border-gray-200 bg-white hover:border-sky-400 hover:bg-sky-50/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
              <Barcode className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Αναζήτηση Παραπεμπτικών με Barcode
              </p>
              <p className="text-xs text-gray-500">
                Άντληση παραπεμπτικού προς εκτέλεση και δημιουργία νέας επίσκεψης με τις
                εξετάσεις του
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
              showBarcode ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showBarcode && (
          <div className="mt-3 p-5 bg-white rounded-xl border border-sky-200 shadow-sm">
            <form onSubmit={handleBarcodeSearch} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Barcode Παραπεμπτικού *
                </label>
                <input
                  type="text"
                  value={bcValue}
                  onChange={e => {
                    setBcValue(e.target.value);
                    setBcError(null);
                  }}
                  className="input-field font-mono"
                  placeholder="π.χ. 23565656565"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={bcSearching}
                className="flex items-center justify-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm disabled:opacity-50 shrink-0 w-full sm:w-auto"
              >
                {bcSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {bcSearching ? 'Άντληση...' : 'Άντληση'}
              </button>
            </form>

            {bcError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{bcError}</span>
              </div>
            )}

            {bcSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{bcSuccess.message}</p>
                    <p className="mt-0.5 text-emerald-700">
                      {bcSuccess.examCount > 0 && (
                        <>
                          {bcSuccess.fullExecution === false ? 'Μερική εκτέλεση' : 'Ολική εκτέλεση'} ·{' '}
                          <strong>{bcSuccess.examCount}</strong> εξετάσεις
                          {' · '}
                        </>
                      )}
                      {bcSuccess.patientCreated && 'Δημιουργήθηκε νέος ασθενής · '}
                      Επίσκεψη:{' '}
                      <span className="font-mono text-xs">{bcSuccess.visitId}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {bcResult && (
              <div className="mt-4">
                {/* Κατάσταση */}
                <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
                  <span className="font-mono font-medium text-gray-900">
                    {bcResult.referral.barcode}
                  </span>
                  {bcResult.referral.status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      {bcResult.referral.status}
                    </span>
                  )}
                  {bcResult.expired ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-semibold">
                      ΛΗΓΜΕΝΟ — δεν καταχωρείται
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                      Έγκυρο
                    </span>
                  )}
                  {bcResult.alreadyImported && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      Έχει ήδη καταχωρηθεί
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      bcResult.existingPatient
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {bcResult.existingPatient
                      ? 'Υπάρχων ασθενής'
                      : 'Θα δημιουργηθεί νέος ασθενής'}
                  </span>
                  {!!bcResult.referral.totalExecutions && (
                    <span className="text-xs text-gray-400">
                      Εκτελέσεις: {bcResult.referral.totalExecutions}
                    </span>
                  )}
                </div>

                {/* Στοιχεία */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Ασθενής</p>
                    <p className="text-sm font-medium text-gray-900">
                      {bcResult.referral.patient?.fullName || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">ΑΜΚΑ</p>
                    <p className="text-sm font-medium text-gray-900">
                      {bcResult.referral.patient?.amka || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                    <p className="text-xs text-gray-400 mb-0.5">Ομάδα Εξετάσεων</p>
                    <p className="text-sm font-medium text-gray-900">
                      {bcResult.referral.examGroupName || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Έκδοση</p>
                    <p className="text-sm font-medium text-gray-900">
                      {bcResult.referral.authoredOn
                        ? bcResult.referral.authoredOn.slice(0, 10)
                        : '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Λήξη εκτέλεσης</p>
                    <p
                      className={`text-sm font-medium ${
                        bcResult.expired ? 'text-red-700' : 'text-gray-900'
                      }`}
                    >
                      {(() => {
                        const expiry =
                          bcResult.referral.effectiveExpiry ||
                          bcResult.referral.occurrenceDateTime ||
                          bcResult.referral.expiryDate;
                        return expiry ? expiry.slice(0, 10) : '—';
                      })()}
                    </p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        bcResult.expired ? 'text-red-600 font-medium' : 'text-gray-400'
                      }`}
                    >
                      {bcResult.expiryMessage ||
                        (bcResult.expired ? 'Έχει λήξει' : 'Εντός ισχύος')}
                    </p>
                  </div>
                  {bcResult.referral.reason && (
                    <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Αιτιολογία</p>
                      <p className="text-sm text-gray-900">{bcResult.referral.reason}</p>
                    </div>
                  )}
                </div>

                {/* Εξετάσεις */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">
                      Εξετάσεις παραπεμπτικού ({bcResult.referral.exams.length}) — επιλέξτε όσες θα
                      εκτελεστούν
                    </p>
                    {bcResult.referral.exams.length > 1 && (
                      <button
                        type="button"
                        onClick={toggleAllBcExams}
                        disabled={bcResult.alreadyImported || bcResult.expired}
                        className="text-xs font-medium text-sky-700 hover:text-sky-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {bcSelectedExams.size === bcResult.referral.exams.length
                          ? 'Αποεπιλογή όλων'
                          : 'Επιλογή όλων'}
                      </button>
                    )}
                  </div>

                  {bcResult.referral.exams.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      Δεν επιστράφηκαν εξετάσεις για αυτό το παραπεμπτικό.
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {bcResult.referral.exams.map((exam, i) => {
                        const lineId = String(exam.lineId);
                        const checked = bcSelectedExams.has(lineId);
                        const locked = bcResult.alreadyImported || bcResult.expired;
                        return (
                          <label
                            key={`${lineId}-${i}`}
                            className={`flex items-start gap-3 p-2.5 transition-colors ${
                              locked
                                ? 'cursor-not-allowed opacity-70'
                                : 'cursor-pointer hover:bg-gray-50'
                            } ${checked && !locked ? 'bg-sky-50/60' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggleBcExam(lineId)}
                              className="mt-0.5 w-4 h-4 accent-sky-600 disabled:opacity-40"
                            />
                            <Beaker className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800">{exam.name}</p>
                              <p className="text-[11px] text-gray-400 font-mono">
                                {exam.examId && `examId: ${exam.examId}`}
                                {exam.examId && exam.lineId && ' · '}
                                {exam.lineId && `lineId: ${exam.lineId}`}
                                {typeof exam.executionPrice === 'number' &&
                                  ` · ${exam.executionPrice.toFixed(2)} €`}
                                {typeof exam.participationAmount === 'number' &&
                                  ` · συμμετοχή ${exam.participationAmount.toFixed(2)} €`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {bcResult.referral.exams.length > 0 && (
                    <div className="flex items-center justify-between mt-1.5 px-1">
                      <span className="text-xs text-gray-500">
                        {bcSelectedExams.size} από {bcResult.referral.exams.length} επιλεγμένες
                        {bcSelectedExams.size > 0 &&
                          bcSelectedExams.size === bcResult.referral.exams.length && (
                            <span className="ml-1.5 text-emerald-700 font-medium">
                              · ολική εκτέλεση
                            </span>
                          )}
                        {bcSelectedExams.size > 0 &&
                          bcSelectedExams.size < bcResult.referral.exams.length && (
                            <span className="ml-1.5 text-amber-700 font-medium">
                              · μερική εκτέλεση
                            </span>
                          )}
                      </span>
                      {bcSelectedExams.size > 0 && (
                        <span className="text-xs text-gray-500 flex items-center gap-3">
                          <span>
                            Σύνολο:{' '}
                            <strong className="text-gray-800">
                              {bcResult.referral.exams
                                .filter(e => bcSelectedExams.has(String(e.lineId)))
                                .reduce((s, e) => s + (e.executionPrice || 0), 0)
                                .toFixed(2)}{' '}
                              €
                            </strong>
                          </span>
                          <span>
                            Συμμετοχή:{' '}
                            <strong className="text-amber-700">
                              {bcResult.referral.exams
                                .filter(e => bcSelectedExams.has(String(e.lineId)))
                                .reduce((s, e) => s + (e.participationAmount || 0), 0)
                                .toFixed(2)}{' '}
                              €
                            </strong>
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {bcSelectedExams.size > 0 &&
                    bcSelectedExams.size < bcResult.referral.exams.length && (
                      <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800">
                          <strong>Ο φορέας απαιτεί ολική εκτέλεση.</strong> Αν επιλέξετε μερική,
                          το αίτημα θα απορριφθεί (σφάλμα 2018) — σε αυτή την περίπτωση θα
                          επιλεγούν αυτόματα όλες οι εξετάσεις.
                        </p>
                      </div>
                    )}
                </div>

                {/* Ενέργεια */}
                <div className="flex items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-gray-500">
                    Θα εκτελεστούν οι επιλεγμένες εξετάσεις στον φορέα και θα δημιουργηθεί νέα
                    επίσκεψη «{IMPORT_VISIT_REASON_LABEL}» με ημερομηνία σήμερα.
                  </p>
                  <button
                    type="button"
                    onClick={handleBarcodeImport}
                    disabled={
                      bcImporting ||
                      bcResult.alreadyImported ||
                      bcResult.expired ||
                      bcSelectedExams.size === 0
                    }
                    className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {bcImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {bcImporting
                      ? 'Εκτέλεση...'
                      : bcResult.alreadyImported
                      ? 'Ήδη καταχωρημένο'
                      : `Εκτέλεση & Καταχώρηση${
                          bcSelectedExams.size > 0 ? ` (${bcSelectedExams.size})` : ''
                        }`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Visit Create Form */}
      {showVisitForm && (
        <div className="mb-6 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary-600" />
            Νέα Επίσκεψη
          </h3>
          <form onSubmit={handleCreateVisit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />{formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ασθενής *</label>
                <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className="input-field" required>
                  <option value="">-- Επιλέξτε ασθενή --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />Ημερομηνία Επίσκεψης *
                </label>
                <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                <select value={visitStatus} onChange={(e) => setVisitStatus(e.target.value as Visit['status'])} className="input-field">
                  <option value="scheduled">📅 Προγραμματισμένη</option>
                  <option value="in_progress">🔄 Σε εξέλιξη</option>
                  <option value="completed">✅ Ολοκληρωμένη</option>
                  <option value="cancelled">❌ Ακυρωμένη</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Λόγος Επίσκεψης *</label>
                <input type="text" value={visitReason} onChange={(e) => setVisitReason(e.target.value)} className="input-field" placeholder="π.χ. Ετήσιος έλεγχος, Πόνος στο στήθος" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Διάγνωση</label>
                <input type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="input-field" placeholder="π.χ. Υπέρταση σταδίου Ι" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
                <textarea value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} className="input-field min-h-[80px]" placeholder="Συμπτώματα, παρατηρήσεις..." rows={3} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={creating} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? 'Δημιουργία...' : 'Δημιουργία'}
              </button>
              <button type="button" onClick={() => { setShowVisitForm(false); resetVisitForm(); }} className="text-gray-500 hover:text-gray-700 text-sm">Άκυρο</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
            placeholder="Αναζήτηση σε επισκέψεις και παραπεμπτικά..."
          />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            className="input-field pl-9 pr-8"
            data-testid="patient-filter"
          >
            <option value="">Όλοι οι ασθενείς</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Banner φιλτραρίσματος ανά ασθενή */}
      {patientFilter && (
        <div
          className="flex items-center justify-between gap-3 mb-4 px-4 py-3 bg-primary-50 border border-primary-200 rounded-lg"
          data-testid="patient-filter-banner"
        >
          <div className="flex items-center gap-2 text-sm text-primary-800 min-w-0">
            <User className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Εμφανίζονται μόνο οι επισκέψεις του ασθενούς{' '}
              <strong>
                {filteredPatient
                  ? `${filteredPatient.firstName} ${filteredPatient.lastName}`
                  : loading
                  ? '…'
                  : getPatientName(patientFilter)}
              </strong>
              {filteredPatient?.amka && (
                <span className="text-primary-600 font-mono"> · ΑΜΚΑ {filteredPatient.amka}</span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPatientFilter('')}
            className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            Καθαρισμός φίλτρου
          </button>
        </div>
      )}

      {/* Count */}
      <p className="text-sm text-gray-500 mb-4">
        {filteredVisits.length} {filteredVisits.length === 1 ? 'επίσκεψη' : 'επισκέψεις'}
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Φόρτωση δεδομένων...
        </div>
      )}

      {/* Empty */}
      {!loading && visits.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Δεν βρέθηκαν επισκέψεις</p>
          <p className="text-gray-400 text-sm mt-1">
            {patientFilter
              ? 'Ο συγκεκριμένος ασθενής δεν έχει καταχωρημένες επισκέψεις'
              : 'Δημιουργήστε μια νέα επίσκεψη για να ξεκινήσετε'}
          </p>
          {patientFilter && (
            <button
              type="button"
              onClick={() => setPatientFilter('')}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              <X className="w-4 h-4" />
              Εμφάνιση όλων των ασθενών
            </button>
          )}
        </div>
      )}

      {/* Empty search */}
      {!loading && visits.length > 0 && filteredVisits.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Δεν βρέθηκαν αποτελέσματα</p>
          <p className="text-gray-400 text-sm mt-1">Δοκιμάστε διαφορετικό όρο αναζήτησης</p>
        </div>
      )}

      {/* Visits List (with nested Referrals) */}
      {!loading && filteredVisits.map(visit => {
        const visitReferrals = referralsByVisit[visit.id] || [];
        const isExpanded = expandedVisits.has(visit.id) || search.length > 0;

        return (
          <div key={visit.id} className="mb-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            {editingVisitId === visit.id ? (
              /* ── Visit Edit Mode ── */
              <form onSubmit={handleUpdateVisit} className="p-4">
                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />{formError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ημερομηνία *</label>
                    <input type="date" value={editVisitDate} onChange={(e) => setEditVisitDate(e.target.value)} className="input-field" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                    <select value={editVisitStatus} onChange={(e) => setEditVisitStatus(e.target.value as Visit['status'])} className="input-field">
                      <option value="scheduled">📅 Προγραμματισμένη</option>
                      <option value="in_progress">🔄 Σε εξέλιξη</option>
                      <option value="completed">✅ Ολοκληρωμένη</option>
                      <option value="cancelled">❌ Ακυρωμένη</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Λόγος Επίσκεψης *</label>
                    <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} className="input-field" required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Διάγνωση</label>
                    <input type="text" value={editDiagnosis} onChange={(e) => setEditDiagnosis(e.target.value)} className="input-field" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="input-field min-h-[80px]" rows={3} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button type="submit" disabled={savingVisit} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors text-sm disabled:opacity-50">
                    {savingVisit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Αποθήκευση
                  </button>
                  <button type="button" onClick={cancelEditVisit} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm">
                    <X className="w-4 h-4" /> Άκυρο
                  </button>
                </div>
              </form>
            ) : (
              /* ── Visit View: Expandable Header ── */
              <>
                <button
                  onClick={() => toggleVisit(visit.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <Stethoscope className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {visit.patientName || getPatientName(visit.patientId)}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visitStatusColors[effectiveVisitStatus(visit)]}`}>
                          {visitStatusLabels[effectiveVisitStatus(visit)]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(visit.visitDate).toLocaleDateString('el-GR')}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <ClipboardList className="w-3 h-3" />
                          {visit.reason}
                        </span>
                        {visit.diagnosis && (
                          <>
                            <span>·</span>
                            <span>Διάγνωση: {visit.diagnosis}</span>
                          </>
                        )}
                      </div>
                      {visit.notes && (
                        <p className="text-xs text-gray-400 mt-1 italic">"{visit.notes}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${refCountByVisit(visit.id) > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                      {refCountByVisit(visit.id)} {refCountByVisit(visit.id) === 1 ? 'παραπεμπτικό' : 'παραπεμπτικά'}
                    </span>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>

                {/* Visit actions */}
                <div className="px-4 pb-2 flex items-center gap-1">
                  <button onClick={() => handlePrintVisit(visit)} className="p-1.5 text-gray-300 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-50" title="Εκτύπωση επίσκεψης">
                    <Printer className="w-4 h-4" />
                  </button>
                  <button onClick={() => startEditVisit(visit)} className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors rounded-lg hover:bg-primary-50" title="Επεξεργασία επίσκεψης">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => requestDeleteVisit(visit)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50" title="Διαγραφή επίσκεψης">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* ── Expanded: Referrals for this visit ── */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                {/* Referral create form */}
                {showReferralFormForVisit === visit.id && (
                  <div className="p-4 border-b border-gray-100 bg-white">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary-600" />Νέο Παραπεμπτικό
                    </h4>
                    <form onSubmit={handleCreateReferral} className="space-y-3">
                      {refFormError && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5" />{refFormError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Ειδικότητα *</label>
                          <select value={refSpecialty} onChange={(e) => setRefSpecialty(e.target.value)} className="input-field text-sm" required>
                            <option value="">-- Επιλέξτε ειδικότητα --</option>
                            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Κατάσταση</label>
                          <select value={refStatus} onChange={(e) => setRefStatus(e.target.value as Referral['status'])} className="input-field text-sm">
                            <option value="pending">⏳ Εκκρεμεί</option>
                            <option value="sent">📤 Απεστάλη</option>
                            <option value="received">📥 Παραλήφθηκε</option>
                            <option value="partially_executed">🔄 Σε εξέλιξη - Μερικώς Εκτελεσμένο</option>
                            <option value="fully_executed">🔄 Σε εξέλιξη - Ολικώς Εκτελεσμένο</option>
                            <option value="completed">✅ Ολοκληρώθηκε</option>
                            <option value="cancelled">❌ Ακυρώθηκε</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Ημερομηνία *</label>
                          <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="input-field text-sm" required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Νοσοκομείο</label>
                          <input type="text" value={refHospital} onChange={(e) => setRefHospital(e.target.value)} className="input-field text-sm" placeholder="π.χ. Γενικό Νοσοκομείο Αθηνών" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Λόγος Παραπομπής *</label>
                          <input type="text" value={refReason} onChange={(e) => setRefReason(e.target.value)} className="input-field text-sm" placeholder="π.χ. Υπερηχογράφημα καρδιάς, Αξονική θώρακος" required />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Σημειώσεις</label>
                          <textarea value={refNotes} onChange={(e) => setRefNotes(e.target.value)} className="input-field text-sm min-h-[60px]" placeholder="Κλινικές πληροφορίες, ευρήματα..." rows={2} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="submit" disabled={creatingRef} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors text-sm disabled:opacity-50">
                          {creatingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          {creatingRef ? 'Δημιουργία...' : 'Δημιουργία'}
                        </button>
                        <button type="button" onClick={() => { setShowReferralFormForVisit(null); resetRefForm(); }} className="text-gray-500 hover:text-gray-700 text-sm">Άκυρο</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Referrals list */}
                {visitReferrals.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Δεν υπάρχουν παραπεμπτικά για αυτή την επίσκεψη
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {visitReferrals.map(referral => (
                      <div key={referral.id} className="p-4 pl-12">
                          {/* Referral: Click to open modal */}
                          <button
                            onClick={() => setModalReferralId(referral.id)}
                            className="w-full flex items-start justify-between hover:bg-purple-50/50 rounded-lg -m-1 p-1 transition-colors text-left group"
                          >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                                  <FileText className="w-4 h-4 text-purple-600" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium text-gray-800 text-sm group-hover:text-purple-700">{referral.specialty}</p>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${referralStatusColors[referral.status]}`}>
                                      {referralStatusLabels[referral.status]}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 mt-0.5">{referral.reason}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(referral.referralDate).toLocaleDateString('el-GR')}
                                    </span>
                                    {referral.hospital && (
                                      <>
                                        <span>·</span>
                                        <span className="flex items-center gap-1">
                                          <Building2 className="w-3 h-3" />
                                          {referral.hospital}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {referral.notes && (
                                    <p className="text-xs text-gray-400 mt-1 italic">"{referral.notes}"</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${examCountByReferral(referral.id) > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {examCountByReferral(referral.id)} {examCountByReferral(referral.id) === 1 ? 'εξέταση' : 'εξετάσεις'}
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-400" />
                              </div>
                            </button>

                        {/* ── CLOSING: No inline expanded exams - they are in the modal ── */}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add referral button */}
                {showReferralFormForVisit !== visit.id && (
                  <div className="p-3 border-t border-gray-100">
                    <button
                      onClick={() => openRefForm(visit.id)}
                      className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Προσθήκη παραπεμπτικού
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Referral Management Modal ── */}
      {modalReferralId && (() => {
        const referral = referrals.find(r => r.id === modalReferralId);
        if (!referral) return null;
        const refExams = examsByReferral[referral.id] || [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setModalReferralId(null); cancelEditReferral(); cancelEditExam(); }}>
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{referral.specialty}</h3>
                    <p className="text-xs text-gray-500">{referral.reason}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setModalReferralId(null); cancelEditReferral(); cancelEditExam(); }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Κλείσιμο"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body - scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* ── Referral section ── */}
                <div>
                  {editingRefId === referral.id ? (
                    /* Referral Edit Form */
                    <form onSubmit={async (e) => { e.preventDefault(); await handleUpdateReferral(e); }} className="space-y-3">
                      {refFormError && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5" />{refFormError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Ειδικότητα *</label>
                          <select value={editRefSpecialty} onChange={(e) => setEditRefSpecialty(e.target.value)} className="input-field text-sm">
                            <option value="">-- Επιλέξτε --</option>
                            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Κατάσταση</label>
                          <select value={editRefStatus} onChange={(e) => setEditRefStatus(e.target.value as Referral['status'])} className="input-field text-sm">
                            <option value="pending">⏳ Εκκρεμεί</option>
                            <option value="sent">📤 Απεστάλη</option>
                            <option value="received">📥 Παραλήφθηκε</option>
                            <option value="partially_executed">🔄 Σε εξέλιξη - Μερικώς Εκτελεσμένο</option>
                            <option value="fully_executed">🔄 Σε εξέλιξη - Ολικώς Εκτελεσμένο</option>
                            <option value="completed">✅ Ολοκληρώθηκε</option>
                            <option value="cancelled">❌ Ακυρώθηκε</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Ημερομηνία *</label>
                          <input type="date" value={editRefDate} onChange={(e) => setEditRefDate(e.target.value)} className="input-field text-sm" required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Νοσοκομείο</label>
                          <input type="text" value={editRefHospital} onChange={(e) => setEditRefHospital(e.target.value)} className="input-field text-sm" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Λόγος *</label>
                          <input type="text" value={editRefReason} onChange={(e) => setEditRefReason(e.target.value)} className="input-field text-sm" required />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Σημειώσεις</label>
                          <textarea value={editRefNotes} onChange={(e) => setEditRefNotes(e.target.value)} className="input-field text-sm min-h-[60px]" rows={2} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="submit" disabled={savingRef} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors text-sm disabled:opacity-50">
                          {savingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Αποθήκευση
                        </button>
                        <button type="button" onClick={cancelEditReferral} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm">
                          <X className="w-4 h-4" /> Άκυρο
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Referral Details View */
                    <div>
                      {fetchingResultsFor === referral.id && (
                        <p className="text-xs text-primary-600 flex items-center gap-1 mb-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Έλεγχος αποτελεσμάτων (φορέας / κέντρο αναφοράς)…
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${referralStatusColors[referral.status]}`}>
                            {referralStatusLabels[referral.status]}
                          </span>
                          <span className="text-sm text-gray-600 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(referral.referralDate).toLocaleDateString('el-GR')}
                          </span>
                          {referral.hospital && (
                            <span className="text-sm text-gray-600 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />
                              {referral.hospital}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {(() => {
                            // Ακύρωση αντληθέντων αποτελεσμάτων (DELETE /api/results/cancel/{id})
                            const isEpres = Boolean(
                              referral.barcode || referral.id.startsWith('referral_epres_')
                            );
                            const fetchedIds = (referral as any).labResultIds;
                            const hasFetched = Array.isArray(fetchedIds) && fetchedIds.length > 0;
                            const hasAnyResult = refExams.some(e => {
                              if (typeof e.result === 'string' && e.result.trim() !== '') return true;
                              return Array.isArray(e.parameters)
                                ? e.parameters.some(
                                    p => typeof p.result === 'string' && p.result.trim() !== ''
                                  )
                                : false;
                            });
                            // Εμφανίζεται για e-Prescription παραπεμπτικά (με ή χωρίς αντληθέντα)
                            if (!isEpres) return null;

                            return (
                              <button
                                onClick={() => handleCancelFetchedResults(referral)}
                                disabled={cancellingResultsFor === referral.id}
                                title={
                                  hasFetched || hasAnyResult
                                    ? 'Ακύρωση των αποτελεσμάτων στον φορέα και επαναφορά των εξετάσεων'
                                    : 'Ακύρωση αποτελεσμάτων — δεν υπάρχουν αντληθέντα αποτελέσματα'
                                }
                                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors font-medium disabled:opacity-50"
                              >
                                {cancellingResultsFor === referral.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                Ακύρωση αποτελεσμάτων
                              </button>
                            );
                          })()}
                          <button
                            onClick={() => handlePrintReferral(referral)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors font-medium"
                            title="Εκτύπωση παραπεμπτικού"
                            data-testid="print-referral"
                          >
                            <Printer className="w-3.5 h-3.5" /> Εκτύπωση
                          </button>
                          <button
                            onClick={() => startEditReferral(referral)}
                            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-lg transition-colors font-medium"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Επεξεργασία
                          </button>
                          {centers.length > 0 && refExams.length > 0 && (
                            <button
                              onClick={() => openCenterPanel(referral)}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors font-medium"
                              title="Αποστολή εξετάσεων σε κέντρο αναφοράς"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Αποστολή σε Κέντρο
                              {Array.isArray(referral.referenceOrders) && referral.referenceOrders.length > 0 && (
                                <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">
                                  {referral.referenceOrders.length}
                                </span>
                              )}
                            </button>
                          )}
                          {(() => {
                            // Αποστολή αποτελεσμάτων: ολοκληρωμένες εξετάσεις με
                            // αποτέλεσμα που δεν έχουν ήδη σταλεί στον φορέα
                            const submittable = refExams.filter(e => {
                              if (String(e.status) !== 'completed') return false;
                              if ((e as any).resultsSubmittedAt) return false;
                              if (typeof e.result === 'string' && e.result.trim() !== '') return true;
                              return Array.isArray(e.parameters)
                                ? e.parameters.some(
                                    p => typeof p.result === 'string' && p.result.trim() !== ''
                                  )
                                : false;
                            });
                            const isEpres = Boolean(
                              referral.barcode || referral.id.startsWith('referral_epres_')
                            );
                            const alreadySubmitted = Boolean(referral.resultsSubmittedAt);
                            if (!isEpres) return null;
                            if (submittable.length === 0 && !alreadySubmitted) return null;

                            const blocked = alreadySubmitted;

                            return (
                              <button
                                onClick={() => requestSubmitResults(referral, blocked)}
                                disabled={submittingResultsId === referral.id}
                                title={
                                  blocked
                                    ? 'Έχει ήδη γίνει καταχώρηση στον φορέα — απαιτείται ακύρωση αποτελεσμάτων πρώτα'
                                    : `Αποστολή ${submittable.length} ολοκληρωμένων εξετάσεων στον φορέα`
                                }
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors font-medium disabled:opacity-50 ${
                                  blocked
                                    ? 'text-gray-400 hover:text-gray-500 hover:bg-gray-50'
                                    : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {submittingResultsId === referral.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                {blocked ? 'Ήδη καταχωρημένα' : 'Αποστολή στον φορέα'}
                              </button>
                            );
                          })()}
                          {(referral.status === 'partially_executed' ||
                            referral.status === 'fully_executed') &&
                            (() => {
                              const hasResults = refExams.some(e => {
                                if (typeof e.result === 'string' && e.result.trim() !== '') return true;
                                return Array.isArray(e.parameters)
                                  ? e.parameters.some(
                                      p => typeof p.result === 'string' && p.result.trim() !== ''
                                    )
                                  : false;
                              });
                              const isFull = referral.status === 'fully_executed';
                              return (
                                <button
                                  onClick={() => requestCancelExecution(referral, isFull, hasResults)}
                                  disabled={hasResults || cancelingExecution}
                                  title={
                                    hasResults
                                      ? 'Δεν είναι δυνατή η ακύρωση: έχουν καταχωρηθεί αποτελέσματα'
                                      : isFull
                                      ? 'Ακύρωση ολικής εκτέλεσης'
                                      : 'Ακύρωση μερικής εκτέλεσης'
                                  }
                                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors font-medium disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  {isFull ? 'Ακύρωση εκτέλεσης' : 'Ακύρωση μερικής'}
                                </button>
                              );
                            })()}
                          <button
                            onClick={() => { requestDeleteReferral(referral); setModalReferralId(null); }}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Διαγραφή
                          </button>
                        </div>
                      </div>
                      {referral.notes && (
                        <p className="text-xs text-gray-400 mt-2 italic">"{referral.notes}"</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-gray-200" />

                {/* ── Αποστολή σε Κέντρο Αναφοράς ── */}
                {centerPanelFor === referral.id && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                        <Send className="w-4 h-4" /> Αποστολή σε Κέντρο Αναφοράς
                      </h4>
                      <button
                        onClick={() => setCenterPanelFor(null)}
                        className="text-indigo-400 hover:text-indigo-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-indigo-900 mb-1">Κέντρο</label>
                      <select
                        value={centerId}
                        onChange={e => setCenterId(e.target.value)}
                        className="input-field text-sm"
                        data-testid="center-select"
                      >
                        {centers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-indigo-900 mb-1">
                        Εξετάσεις προς αποστολή ({centerSelected.size}/{refExams.length})
                      </p>
                      <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-indigo-200 divide-y divide-gray-100">
                        {refExams.map(exam => {
                          const isSent = String(exam.status) === 'sent';
                          const isCompleted = String(exam.status) === 'completed';
                          const isLocked = isSent || isCompleted;
                          return (
                          <label
                            key={exam.id}
                            className={`flex items-center gap-2 px-3 py-2 text-xs ${
                              isLocked
                                ? 'cursor-not-allowed opacity-60 bg-gray-50'
                                : 'cursor-pointer hover:bg-indigo-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={centerSelected.has(exam.id)}
                              disabled={isLocked}
                              onChange={e => {
                                const next = new Set(centerSelected);
                                if (e.target.checked) next.add(exam.id);
                                else next.delete(exam.id);
                                setCenterSelected(next);
                                runCenterPreview(referral.id, next);
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="flex-1 truncate text-gray-800">{exam.name}</span>
                            {isSent ? (
                              <span className="text-[10px] text-indigo-600 font-medium">Απεσταλμένη</span>
                            ) : isCompleted ? (
                              <span className="text-[10px] text-green-700 font-medium">Ολοκληρωμένη</span>
                            ) : (() => {
                              const displayLoinc =
                                exam.loincCode ||
                                (exam as any).sentToCenter?.loincCode ||
                                (exam.parameters || []).find(p => p.loincNum)?.loincNum;
                              return displayLoinc ? (
                                <span className="font-mono text-[10px] text-gray-500">{displayLoinc}</span>
                              ) : (
                                <span className="text-[10px] text-amber-600">χωρίς LOINC</span>
                              );
                            })()}
                          </label>
                          );
                        })}
                      </div>
                    </div>

                    {centerLoading && (
                      <p className="text-xs text-indigo-700 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Αντιστοίχιση κωδικών sLis…
                      </p>
                    )}

                    {centerPreview && (
                      <div className="text-xs space-y-1">
                        {centerPreview.ambiguous.length > 0 && (
                          <div className="p-2 bg-amber-50 border border-amber-300 rounded space-y-2">
                            <p className="font-semibold text-amber-900">
                              ⚠️ {centerPreview.ambiguous.length} εξέταση(εις) αντιστοιχίζονται σε
                              περισσότερες από μία εξετάσεις του κέντρου — επιλέξτε:
                            </p>
                            {centerPreview.ambiguous.map(amb => (
                              <div key={amb.examId} className="space-y-1">
                                <p className="text-amber-900 truncate">
                                  {amb.name}{' '}
                                  <span className="font-mono text-[10px] text-amber-700">
                                    ({amb.loincCode})
                                  </span>
                                </p>
                                <select
                                  value={centerChoices[amb.examId] || ''}
                                  onChange={e => {
                                    const next = { ...centerChoices, [amb.examId]: e.target.value };
                                    if (!e.target.value) delete next[amb.examId];
                                    setCenterChoices(next);
                                    runCenterPreview(referral.id, centerSelected, next);
                                  }}
                                  className="input-field text-xs py-1"
                                  data-testid={`center-choice-${amb.examId}`}
                                >
                                  <option value="">— Επιλέξτε εξέταση κέντρου —</option>
                                  {amb.options.map(o => (
                                    <option key={o.code} value={o.code}>
                                      {o.name} ({o.code})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-green-800">
                          <strong>{centerPreview.tests.length}</strong> εξετάσεις αντιστοιχίστηκαν
                          σε κωδικούς sLis:
                        </p>
                        <p className="font-mono text-[11px] text-gray-700 break-all">
                          {centerPreview.tests.map(t => t.code).join(', ') || '—'}
                        </p>
                        {centerPreview.unmapped.length > 0 && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded">
                            <p className="font-medium text-amber-800">
                              {centerPreview.unmapped.length} δεν αντιστοιχίστηκαν (θα παραλειφθούν):
                            </p>
                            <ul className="list-disc list-inside text-amber-700 mt-0.5">
                              {centerPreview.unmapped.slice(0, 5).map(u => (
                                <li key={u.examId} className="truncate">{u.name} — {u.reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {centerError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                        {centerError}
                      </p>
                    )}

                    <button
                      onClick={() => handleSendToCenter(referral)}
                      disabled={
                        centerSending ||
                        centerLoading ||
                        !centerPreview ||
                        centerPreview.tests.length === 0 ||
                        centerPreview.ambiguous.length > 0
                      }
                      title={
                        centerPreview && centerPreview.ambiguous.length > 0
                          ? 'Επιλέξτε πρώτα την εξέταση κέντρου για όλες τις διφορούμενες αντιστοιχίσεις'
                          : undefined
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      {centerSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Αποστολή
                    </button>

                    {Array.isArray(referral.referenceOrders) && referral.referenceOrders.length > 0 && (
                      <div className="text-xs text-indigo-800 border-t border-indigo-200 pt-2 space-y-1">
                        <p className="font-medium mb-1">Ήδη απεσταλμένα:</p>
                        {referral.referenceOrders.map((o, i) => {
                          const orderKey = `${referral.id}:${o.orderNo}`;
                          const centerForOrder = centers.find(c => c.id === o.centerId);
                          const copiesValue =
                            barcodeCopies[orderKey] ?? centerBarcodeSettings(centerForOrder).copies;
                          return (
                            <div key={i} className="flex flex-wrap items-center justify-between gap-2">
                              <p className="truncate flex-1 min-w-0">
                                • {o.centerName} · ORDERNO {o.orderNo} · {o.status}
                                {o.lisOrderNo ? ` · LIS ${o.lisOrderNo}` : ''}
                              </p>
                              <div className="shrink-0 flex items-center gap-2">
                                <label
                                  className="flex items-center gap-1 text-[11px] text-indigo-800"
                                  title="Πλήθος barcode προς εκτύπωση"
                                >
                                  <span>Αντίγραφα</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={copiesValue}
                                    onChange={e => {
                                      const next = Math.min(
                                        100,
                                        Math.max(1, Math.floor(Number(e.target.value) || 1))
                                      );
                                      setBarcodeCopies(prev => ({ ...prev, [orderKey]: next }));
                                    }}
                                    className="w-14 px-1.5 py-1 text-[11px] text-center border border-indigo-200 rounded bg-white"
                                    data-testid={`barcode-copies-${i}`}
                                  />
                                </label>
                                <button
                                  onClick={() => printReferenceOrderBarcode(referral, o)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
                                  title={`Εκτύπωση barcode αριθμού εντολής ${o.orderNo}`}
                                  data-testid={`print-barcode-${i}`}
                                >
                                  <Printer className="w-3 h-3" />
                                  Barcode
                                </button>
                                <button
                                  onClick={() => handleFetchCenterResults(referral, o.centerId)}
                                  disabled={centerSending}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded transition-colors"
                                  title="Άντληση αποτελεσμάτων από το κέντρο"
                                >
                                  {centerSending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  Αποτελέσματα
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Exams Section ── */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-primary-600" />
                    Εξετάσεις ({refExams.length})
                  </h4>

                  {/* Exam create form */}
                  {showExamFormForReferral === referral.id ? (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <h5 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-primary-600" />Νέα Εξέταση
                      </h5>
                      <form onSubmit={async (e) => { e.preventDefault(); await handleCreateExam(e); }} className="space-y-2">
                        {examFormError && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5" />{examFormError}
                          </div>
                        )}
                        {/* LOINC online search */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">
                            🔍 Αναζήτηση στον κατάλογο LOINC
                            <select
                              value={loincSource}
                              onChange={(e) => setLoincSource(e.target.value as 'exam-catalog' | 'exam-loinc')}
                              className="ml-2 text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white"
                            >
                              <option value="exam-catalog">📋 Κατάλογος Εξετάσεων (ΗΔΙΚΑ)</option>
                              <option value="exam-loinc">🔬 Λίστα LOINC (Masterdata)</option>
                            </select>
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={loincQuery}
                              onChange={(e) => handleLoincSearch(e.target.value, 'create')}
                              onFocus={() => { if (loincResults.length > 0) setLoincDropdownOpen(true); }}
                              placeholder="Αναζήτηση (ελληνικά ή αγγλικά)..."
                              className="input-field text-sm flex-1"
                            />
                            {loincSearching && <Loader2 className="w-4 h-4 animate-spin text-primary-500 shrink-0" />}
                          </div>
                          {loincDropdownOpen && loincResults.length > 0 && (
                            <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                              {loincResults.map((item: any, i: number) => (
                                <button
                                  key={item.loincNum + '-' + i}
                                  type="button"
                                  onClick={() => selectLoincResult(item)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                >
                                  <div className="font-medium text-gray-900 truncate">{item.greekName || item.longCommonName || item.component}</div>
                                  <div className="text-gray-400 mt-0.5 flex gap-2">
                                    <span className="bg-gray-100 px-1 rounded text-[10px]">{item.loincNum}</span>
                                    {item.class && <span>{item.class}</span>}
                                    {item.system && <span>{item.system}</span>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Click-outside catcher */}
                          {loincDropdownOpen && (
                            <div className="fixed inset-0 z-20" onClick={() => setLoincDropdownOpen(false)} />
                          )}
                        </div>
                        {examLoincCode && (
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono">{examLoincCode}</span>
                            <span>LOINC</span>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-0.5">Όνομα Εξέτασης *</label>
                            <input type="text" value={examName} onChange={(e) => setExamName(e.target.value)} className="input-field text-sm" placeholder="π.χ. Γενική Αίματος, TKE, Σάκχαρο" required />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-0.5">Κατάσταση</label>
                            <select value={examStatus} onChange={(e) => setExamStatus(e.target.value as Exam['status'])} className="input-field text-sm">
                              <option value="ordered">📋 Διατάχθηκε</option>
                              <option value="in_progress">🔄 Σε εξέλιξη</option>
                              <option value="completed">✅ Ολοκληρώθηκε</option>
                              <option value="cancelled">❌ Ακυρώθηκε</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-0.5">Κατηγορία</label>
                            <select value={examCategory} onChange={(e) => setExamCategory(e.target.value)} className="input-field text-sm">
                              <option value="">-- Επιλέξτε --</option>
                              {examCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-0.5">Ημερομηνία</label>
                            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="input-field text-sm" />
                          </div>
                          {/* Result/Unit/RefRange — hidden when parameters exist */}
                          {examParameters.length === 0 && (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">Αποτέλεσμα</label>
                                <input type="text" value={examResult} onChange={(e) => setExamResult(e.target.value)} className="input-field text-sm" placeholder="π.χ. 14.5" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">Μονάδα</label>
                                <input type="text" value={examUnit} onChange={(e) => setExamUnit(e.target.value)} className="input-field text-sm" placeholder="π.χ. mg/dL" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">Φυσιολογικό Εύρος</label>
                                <input type="text" value={examRefRange} onChange={(e) => setExamRefRange(e.target.value)} className="input-field text-sm" placeholder="π.χ. 70-110" />
                              </div>
                            </>
                          )}
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-700 mb-0.5">Σημειώσεις</label>
                            <input type="text" value={examNotes} onChange={(e) => setExamNotes(e.target.value)} className="input-field text-sm" placeholder="Παρατηρήσεις..." />
                          </div>
                        </div>

                        {/* Sub-parameters */}
                        <div className="border-t border-gray-200 pt-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-gray-600 flex items-center gap-1">📊 Παράμετροι</span>
                            <button type="button" onClick={() => setExamParameters(prev => [...prev, { name: '', result: '', unit: '', referenceRange: '' }])} className="text-[11px] text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-0.5 rounded font-medium transition-colors">
                              + Προσθήκη
                            </button>
                          </div>
                          {examParameters.map((param, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 mb-1">
                              <input type="text" value={param.name} onChange={(e) => { const next = [...examParameters]; next[idx] = { ...next[idx], name: e.target.value }; setExamParameters(next); }} placeholder="Όνομα (π.χ. WBC)" className="flex-1 min-w-[70px] text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                              <input type="text" value={param.result || ''} onChange={(e) => { const next = [...examParameters]; next[idx] = { ...next[idx], result: e.target.value }; setExamParameters(next); }} placeholder="Τιμή" className="w-14 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                              <input type="text" value={param.unit || ''} onChange={(e) => { const next = [...examParameters]; next[idx] = { ...next[idx], unit: e.target.value }; setExamParameters(next); }} placeholder="Μονάδα" className="w-12 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                              <input type="text" value={param.referenceRange || ''} onChange={(e) => { const next = [...examParameters]; next[idx] = { ...next[idx], referenceRange: e.target.value }; setExamParameters(next); }} placeholder="Εύρος" className="w-16 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                              <button type="button" onClick={() => setExamParameters(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0" title="Αφαίρεση παραμέτρου">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {examParameters.length === 0 && (
                            <p className="text-[11px] text-gray-400 italic">Προσθέστε παραμέτρους για εξετάσεις με πολλαπλές μετρήσεις (π.χ. Γενική Αίματος)</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={creatingExam} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors text-xs disabled:opacity-50">
                            {creatingExam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {creatingExam ? 'Δημιουργία...' : 'Προσθήκη'}
                          </button>
                          <button type="button" onClick={() => { setShowExamFormForReferral(null); resetExamForm(); }} className="text-gray-500 hover:text-gray-700 text-xs">Άκυρο</button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <button
                      onClick={() => openExamForm(referral.id)}
                      className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium mb-3"
                    >
                      <Plus className="w-3 h-3" />
                      Προσθήκη εξέτασης
                    </button>
                  )}

                  {/* Exams list */}
                  {refExams.length === 0 && showExamFormForReferral !== referral.id ? (
                    <div className="py-6 text-center text-gray-400 text-xs">
                      <Beaker className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      Δεν υπάρχουν εξετάσεις για αυτό το παραπεμπτικό
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {refExams.map(exam => (
                        <div key={exam.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                          {editingExamId === exam.id ? (
                            /* Exam Edit Mode */
                            <form onSubmit={async (e) => { e.preventDefault(); await handleUpdateExam(e); }} className="space-y-2">
                              {examFormError && (
                                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                                  <AlertCircle className="w-3.5 h-3.5" />{examFormError}
                                </div>
                              )}
                              {/* LOINC online search (edit) */}
                              <div className="relative">
                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                  🔍 Αναζήτηση στον κατάλογο LOINC
                                  <select
                                    value={loincSource}
                                    onChange={(e) => setLoincSource(e.target.value as 'exam-catalog' | 'exam-loinc')}
                                    className="ml-2 text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white"
                                  >
                                    <option value="exam-catalog">📋 Κατάλογος Εξετάσεων (ΗΔΙΚΑ)</option>
                                    <option value="exam-loinc">🔬 Λίστα LOINC (Masterdata)</option>
                                  </select>
                                </label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={loincQuery}
                                    onChange={(e) => handleLoincSearch(e.target.value, 'edit')}
                                    onFocus={() => { if (loincResults.length > 0) setLoincDropdownOpen(true); }}
                                    placeholder="Αναζήτηση (ελληνικά ή αγγλικά)..."
                                    className="input-field text-sm flex-1"
                                  />
                                  {loincSearching && <Loader2 className="w-4 h-4 animate-spin text-primary-500 shrink-0" />}
                                </div>
                                {loincDropdownOpen && loincResults.length > 0 && (
                                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                                    {loincResults.map((item: any, i: number) => (
                                      <button
                                        key={item.loincNum + '-' + i}
                                        type="button"
                                        onClick={() => selectLoincResult(item)}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 border-b border-gray-100 last:border-b-0 transition-colors"
                                      >
                                        <div className="font-medium text-gray-900 truncate">{item.greekName || item.longCommonName || item.component}</div>
                                        <div className="text-gray-400 mt-0.5 flex gap-2">
                                          <span className="bg-gray-100 px-1 rounded text-[10px]">{item.loincNum}</span>
                                          {item.class && <span>{item.class}</span>}
                                          {item.system && <span>{item.system}</span>}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {loincDropdownOpen && (
                                  <div className="fixed inset-0 z-20" onClick={() => setLoincDropdownOpen(false)} />
                                )}
                              </div>
                              {editExamLoincCode && (
                                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                  <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-mono">{editExamLoincCode}</span>
                                  <span>LOINC</span>
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div className="md:col-span-2">
                                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Όνομα *</label>
                                  <input type="text" value={editExamName} onChange={(e) => setEditExamName(e.target.value)} className="input-field text-sm" required />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Κατάσταση</label>
                                  <select value={editExamStatus} onChange={(e) => setEditExamStatus(e.target.value as Exam['status'])} className="input-field text-sm">
                                    <option value="ordered">📋 Διατάχθηκε</option>
                                    <option value="in_progress">🔄 Σε εξέλιξη</option>
                                    <option value="completed">✅ Ολοκληρώθηκε</option>
                                    <option value="cancelled">❌ Ακυρώθηκε</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Κατηγορία</label>
                                  <select value={editExamCategory} onChange={(e) => setEditExamCategory(e.target.value)} className="input-field text-sm">
                                    <option value="">-- Επιλέξτε --</option>
                                    {examCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Ημερομηνία</label>
                                  <input type="date" value={editExamDate} onChange={(e) => setEditExamDate(e.target.value)} className="input-field text-sm" />
                                </div>
                                {/* Result/Unit/RefRange — hidden when parameters exist */}
                                {editExamParameters.length === 0 && (
                                  <>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-0.5">Αποτέλεσμα</label>
                                      <input type="text" value={editExamResult} onChange={(e) => setEditExamResult(e.target.value)} className="input-field text-sm" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-0.5">Μονάδα</label>
                                      <input type="text" value={editExamUnit} onChange={(e) => setEditExamUnit(e.target.value)} className="input-field text-sm" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-0.5">Εύρος</label>
                                      <input type="text" value={editExamRefRange} onChange={(e) => setEditExamRefRange(e.target.value)} className="input-field text-sm" />
                                    </div>
                                  </>
                                )}
                                <div className="md:col-span-3">
                                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Σημειώσεις</label>
                                  <input type="text" value={editExamNotes} onChange={(e) => setEditExamNotes(e.target.value)} className="input-field text-sm" />
                                </div>
                              </div>

                              {/* Edit sub-parameters */}
                              <div className="border-t border-gray-200 pt-2">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">📊 Παράμετροι</span>
                                  <button type="button" onClick={() => setEditExamParameters(prev => [...prev, { name: '', result: '', unit: '', referenceRange: '' }])} className="text-[11px] text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-0.5 rounded font-medium transition-colors">
                                    + Προσθήκη
                                  </button>
                                </div>
                                {editExamParameters.map((param, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 mb-1">
                                    <input type="text" value={param.name} onChange={(e) => { const next = [...editExamParameters]; next[idx] = { ...next[idx], name: e.target.value }; setEditExamParameters(next); }} placeholder="Όνομα (π.χ. WBC)" className="flex-1 min-w-[70px] text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                    <input type="text" value={param.result || ''} onChange={(e) => { const next = [...editExamParameters]; next[idx] = { ...next[idx], result: e.target.value }; setEditExamParameters(next); }} placeholder="Τιμή" className="w-14 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                    <input type="text" value={param.unit || ''} onChange={(e) => { const next = [...editExamParameters]; next[idx] = { ...next[idx], unit: e.target.value }; setEditExamParameters(next); }} placeholder="Μονάδα" className="w-12 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                    <input type="text" value={param.referenceRange || ''} onChange={(e) => { const next = [...editExamParameters]; next[idx] = { ...next[idx], referenceRange: e.target.value }; setEditExamParameters(next); }} placeholder="Εύρος" className="w-16 text-[11px] px-1.5 py-1 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                    <button type="button" onClick={() => setEditExamParameters(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0" title="Αφαίρεση παραμέτρου">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center gap-2">
                                <button type="submit" disabled={savingExam} className="flex items-center gap-1.5 bg-primary-600 text-white px-2.5 py-1 rounded-lg hover:bg-primary-700 transition-colors text-xs disabled:opacity-50">
                                  {savingExam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  Αποθήκευση
                                </button>
                                <button type="button" onClick={cancelEditExam} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-xs">
                                  <X className="w-3.5 h-3.5" /> Άκυρο
                                </button>
                              </div>
                            </form>
                          ) : (
                            /* Exam View Mode with inline result entry */
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="w-6 h-6 rounded bg-primary-100 flex items-center justify-center shrink-0">
                                    <Beaker className="w-3.5 h-3.5 text-primary-600" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-xs font-medium text-gray-800 truncate">{exam.name}</p>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${examStatusColors[exam.status]}`}>
                                        {examStatusLabels[exam.status]}
                                      </span>
                                    </div>
                                    {exam.status === 'ordered' ? (
                                      /* Inline result entry */
                                      (() => {
                                        initInlineValues(exam);
                                        const vals = inlineValues[exam.id] || DEFAULT_INLINE();
                                        const isSaving = savingInlineExamId === exam.id;
                                        const hasParams = exam.parameters && exam.parameters.length > 0;
                                        return (
                                          <div>
                                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                              {exam.category && <span className="text-[11px] text-gray-400">{exam.category}</span>}
                                              {exam.category && !hasParams && <span className="text-gray-300">·</span>}
                                              {/* Main result — only for exams WITHOUT parameters */}
                                              {!hasParams && (
                                                <>
                                                  <input type="text" value={vals.mainResult} onChange={(e) => { setInlineValues(prev => { const cur = prev[exam.id] || DEFAULT_INLINE(); return { ...prev, [exam.id]: { ...cur, mainResult: e.target.value } }; }); }} placeholder="Αποτέλεσμα" className="w-14 text-[11px] px-1.5 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                  <input type="text" value={vals.mainUnit} onChange={(e) => { setInlineValues(prev => { const cur = prev[exam.id] || DEFAULT_INLINE(); return { ...prev, [exam.id]: { ...cur, mainUnit: e.target.value } }; }); }} placeholder="Μονάδα" className="w-12 text-[11px] px-1.5 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                  <span className="text-gray-300">[</span>
                                                  <input type="text" value={vals.mainRefRange} onChange={(e) => { setInlineValues(prev => { const cur = prev[exam.id] || DEFAULT_INLINE(); return { ...prev, [exam.id]: { ...cur, mainRefRange: e.target.value } }; }); }} placeholder="Εύρος" className="w-16 text-[11px] px-1.5 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                  <span className="text-gray-300">]</span>
                                                </>
                                              )}
                                              <input type="date" value={vals.examDate} onChange={(e) => { setInlineValues(prev => { const cur = prev[exam.id] || DEFAULT_INLINE(); return { ...prev, [exam.id]: { ...cur, examDate: e.target.value } }; }); }} className="text-[11px] px-1 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                              <button type="button" disabled={isSaving} onClick={() => handleSaveInlineResult(exam.id, referral.id)} className="flex items-center gap-0.5 bg-green-600 text-white px-2 py-0.5 rounded text-[11px] hover:bg-green-700 transition-colors disabled:opacity-50 font-medium">
                                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                                                {isSaving ? '...' : 'Καταχώρηση'}
                                              </button>
                                            </div>
                                            {/* Inline parameters */}
                                            {exam.parameters && exam.parameters.length > 0 && (
                                              <div className="mt-1.5 ml-6 border-l-2 border-gray-200 pl-3 space-y-1">
                                                {exam.parameters.map((param, idx) => {
                                                  const pv = vals.params[idx] || { result: '', unit: '', refRange: '' };
                                                  return (
                                                    <div key={idx} className="flex items-center gap-1">
                                                      <span className="text-[10px] font-medium text-gray-500 w-14 shrink-0 truncate" title={param.name}>{param.name || '—'}</span>
                                                      <input type="text" value={pv.result} onChange={(e) => updateInlineParamValue(exam.id, idx, 'result', e.target.value)} placeholder="Τιμή" className="w-12 text-[10px] px-1 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                      <input type="text" value={pv.unit} onChange={(e) => updateInlineParamValue(exam.id, idx, 'unit', e.target.value)} placeholder="Μον" className="w-10 text-[10px] px-1 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                      <span className="text-gray-300 text-[10px]">[</span>
                                                      <input type="text" value={pv.refRange} onChange={(e) => updateInlineParamValue(exam.id, idx, 'refRange', e.target.value)} placeholder="Εύρος" className="w-14 text-[10px] px-1 py-0.5 border border-gray-200 rounded focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none" />
                                                      <span className="text-gray-300 text-[10px]">]</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      /* Normal display for exams with results */
                                      <div>
                                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
                                          {exam.category && <span>{exam.category}</span>}
                                          {exam.result && (
                                            <>
                                              {exam.category && <span>·</span>}
                                              <span className="font-medium text-gray-600">{exam.result} {exam.unit}</span>
                                              {exam.referenceRange && <span className="text-gray-400">({exam.referenceRange})</span>}
                                            </>
                                          )}
                                          {exam.examDate && (
                                            <>
                                              <span>·</span>
                                              <span>{new Date(exam.examDate).toLocaleDateString('el-GR')}</span>
                                            </>
                                          )}
                                        </div>
                                        {exam.parameters && exam.parameters.length > 0 && (
                                          <div className="mt-1 ml-6 border-l-2 border-gray-200 pl-3 space-y-0.5">
                                            {exam.parameters.map((param, idx) => (
                                              <div key={idx} className="flex items-center gap-1 text-[10px]">
                                                <span className="font-medium text-gray-600 w-14 shrink-0 truncate" title={param.name}>{param.name}</span>
                                                {(param.result || param.unit || param.referenceRange) ? (
                                                  <>
                                                    <span className="text-gray-700 font-medium">{param.result || '—'} {param.unit}</span>
                                                    {param.referenceRange && <span className="text-gray-400">({param.referenceRange})</span>}
                                                  </>
                                                ) : (
                                                  <span className="text-gray-300 italic">—</span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {exam.notes && (
                                      <p className="text-[11px] text-gray-400 italic truncate mt-0.5">"{exam.notes}"</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                                  <button onClick={() => startEditExam(exam)} className="p-1 text-gray-300 hover:text-primary-500 transition-colors rounded hover:bg-primary-50" title="Επεξεργασία">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteExam(exam.id)}
                                    disabled={String(exam.status) === 'sent'}
                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-300 disabled:hover:bg-transparent"
                                    title={
                                      String(exam.status) === 'sent'
                                        ? 'Απεσταλμένη σε κέντρο αναφοράς — δεν διαγράφεται'
                                        : 'Διαγραφή'
                                    }
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal επιβεβαίωσης διαγραφής ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    deleteTarget.isCompleted ? 'bg-red-100' : 'bg-amber-100'
                  }`}
                >
                  <Trash2
                    className={`w-5 h-5 ${
                      deleteTarget.isCompleted ? 'text-red-600' : 'text-amber-600'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">
                    Διαγραφή {deleteTarget.type === 'visit' ? 'επίσκεψης' : 'παραπεμπτικού'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Η ενέργεια είναι μη αναστρέψιμη.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {deleteTarget.blockedReason && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 font-medium">{deleteTarget.blockedReason}</p>
                </div>
              )}

              {!deleteTarget.blockedReason && deleteTarget.isCompleted && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800">
                    <strong>
                      {deleteTarget.type === 'visit' ? 'Η επίσκεψη' : 'Το παραπεμπτικό'} είναι
                      ολοκληρωμέ{deleteTarget.type === 'visit' ? 'νη' : 'νο'}.
                    </strong>{' '}
                    Η διαγραφή θα αφαιρέσει οριστικά και τα σχετιζόμενα δεδομένα.
                  </p>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {deleteTarget.title}
                </p>
                {deleteTarget.subtitle && (
                  <p className="text-xs text-gray-500 truncate">{deleteTarget.subtitle}</p>
                )}
                {deleteTarget.statusLabel && (
                  <p className="text-xs text-gray-500">
                    Κατάσταση: <strong className="text-gray-700">{deleteTarget.statusLabel}</strong>
                  </p>
                )}
              </div>

              {!deleteTarget.blockedReason &&
                ((deleteTarget.referralCount ?? 0) > 0 || (deleteTarget.examCount ?? 0) > 0) && (
                <div className="text-xs text-gray-600 space-y-0.5">
                  <p className="font-medium text-gray-700">Θα διαγραφούν επίσης:</p>
                  {(deleteTarget.referralCount ?? 0) > 0 && (
                    <p>• {deleteTarget.referralCount} παραπεμπτικό(ά)</p>
                  )}
                  {(deleteTarget.examCount ?? 0) > 0 && (
                    <p>• {deleteTarget.examCount} εξέταση(εις)</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || Boolean(deleteTarget.blockedReason)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Διαγραφή...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Επιβεβαίωση διαγραφής
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal επιβεβαίωσης ακύρωσης εκτέλεσης ── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !cancelingExecution && setCancelTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">
                    {cancelTarget.isFull ? 'Ακύρωση εκτέλεσης' : 'Ακύρωση μερικής εκτέλεσης'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Η ενέργεια θα αποχαρακτηρίσει το παραπεμπτικό στον φορέα (ΗΔΙΚΑ).
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {cancelTarget.specialty}
                </p>
                {cancelTarget.patientName && (
                  <p className="text-xs text-gray-500 truncate">{cancelTarget.patientName}</p>
                )}
                <p className="text-xs text-gray-500">
                  Barcode: <strong className="text-gray-700">{cancelTarget.barcode}</strong>
                </p>
                <p className="text-xs text-gray-500">
                  Εκτέλεση:{' '}
                  <strong className="text-gray-700">
                    {cancelTarget.fullExecution ? 'Ολική' : 'Μερική'}
                  </strong>
                </p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  {cancelTarget.isFull
                    ? 'Θα ακυρωθεί ολόκληρη η εκτέλεση του παραπεμπτικού. Οι εξετάσεις θα επανέλθουν σε κατάσταση «Διατάχθηκε».'
                    : 'Θα ακυρωθεί μόνο η μερική εκτέλεση. Οι εκτελεσμένες εξετάσεις θα επανέλθουν σε κατάσταση «Διατάχθηκε».'}
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelingExecution}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Πίσω
              </button>
              <button
                type="button"
                onClick={confirmCancelExecution}
                disabled={cancelingExecution}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelingExecution ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Ακύρωση...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Επιβεβαίωση ακύρωσης
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Προεπισκόπηση εκτύπωσης παραπεμπτικού ── */}
      {printPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          data-testid="print-preview"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">Προεπισκόπηση εκτύπωσης</h3>
                <p className="text-xs text-gray-500 truncate">{printPreview.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const win = printFrameRef.current?.contentWindow;
                    if (!win) return;
                    try {
                      win.focus();
                      win.print();
                    } catch {
                      window.alert('Η εκτύπωση δεν υποστηρίζεται από αυτόν τον browser.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                  data-testid="confirm-print"
                >
                  <Printer className="w-4 h-4" /> Εκτύπωση
                </button>
                <button
                  type="button"
                  onClick={() => setPrintPreview(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Κλείσιμο"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              ref={printFrameRef}
              srcDoc={printPreview.html}
              title="Προεπισκόπηση παραπεμπτικού"
              className="flex-1 w-full min-h-[60vh] bg-white"
            />
            <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100 shrink-0">
              Αν ο browser δεν εμφανίσει διάλογο εκτύπωσης (π.χ. ενσωματωμένος browser),
              ανοίξτε την εφαρμογή σε Chrome/Edge ή χρησιμοποιήστε Ctrl+P από την προεπισκόπηση.
            </p>
          </div>
        </div>
      )}

      {/* ── Μήνυμα ακύρωσης εκτέλεσης ── */}
      {cancelMessage && (
        <div className="fixed bottom-4 right-4 z-[70] max-w-sm">
          <div
            className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-lg border ${
              cancelMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            {cancelMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            )}
            <p
              className={`text-sm flex-1 ${
                cancelMessage.type === 'success' ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              {cancelMessage.text}
            </p>
            <button
              type="button"
              onClick={() => setCancelMessage(null)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
