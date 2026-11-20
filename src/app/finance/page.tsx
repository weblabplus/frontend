'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Euro,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  api,
  type FinanceEntry,
  type FinanceEntryStatus,
  type FinancePartyType,
  type FinanceSummary,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type FinanceSyncResult = {
  centerId: string;
  centerName: string;
  from: string;
  to: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  error?: string;
};

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  amka?: string;
}

interface CenterOption {
  id: string;
  name: string;
  active?: boolean;
}

interface ReferralOption {
  id: string;
  patientId: string;
  patientName?: string;
  barcode?: string;
  specialty?: string;
  referralDate?: string;
}

const PARTY_TYPE_LABELS: Record<FinancePartyType, string> = {
  reference_center: 'Κέντρο αναφοράς',
  payer: 'Φορέας',
  patient: 'Ασθενής',
};

const PARTY_TYPE_BADGES: Record<FinancePartyType, string> = {
  reference_center: 'bg-blue-100 text-blue-700',
  payer: 'bg-purple-100 text-purple-700',
  patient: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<FinanceEntryStatus, string> = {
  pending: 'Εκκρεμεί',
  partial: 'Μερική εξόφληση',
  settled: 'Εξοφλημένο',
  cancelled: 'Ακυρωμένο',
};

const STATUS_COLORS: Record<FinanceEntryStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-amber-100 text-amber-800',
  settled: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
};

const PAYERS = [
  'ΕΟΠΥΥ',
  'ΗΔΙΚΑ',
  'e-ΕΦΚΑ',
  'ΙΚΑ-ΕΤΑΜ',
  'ΟΑΕΕ',
  'ΟΠΑΔ',
  'ΤΥΔΚΥ',
  'ΕΔΟΕΑΠ',
  'ΕΤΑΠ-ΜΜΕ',
];

const PAYMENT_METHODS = ['Μετρητά', 'Κάρτα', 'Τραπεζική κατάθεση', 'Επιταγή', 'IRIS', 'Άλλο'];

/** Κινήσεις ανά σελίδα στη λίστα ταμείου */
const PAGE_SIZE = 10;

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (value: number) => Math.round(value * 100) / 100;

const formatMoney = (value: number) =>
  new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('el-GR');
};

const patientLabel = (patient?: PatientOption) =>
  patient ? `${patient.firstName} ${patient.lastName}`.trim() : '';

const isOverdue = (entry: FinanceEntry) =>
  Boolean(entry.dueDate) &&
  entry.status !== 'settled' &&
  entry.status !== 'cancelled' &&
  entry.dueDate! < today() &&
  entry.amount - entry.paidAmount > 0.005;

export default function FinancePage() {
  const { loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [referrals, setReferrals] = useState<ReferralOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncDetails, setSyncDetails] = useState<FinanceSyncResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'all' | 'debt' | 'receivable'>('all');
  const [statusFilter, setStatusFilter] = useState<'' | FinanceEntryStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const autoSyncStarted = useRef(false);

  // Εξαγωγή / Εκτύπωση
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportAction, setExportAction] = useState<'print' | 'csv'>('csv');
  const [exportYear, setExportYear] = useState('');
  const [printPreview, setPrintPreview] = useState<{ rows: FinanceEntry[]; year: string } | null>(null);

  // Φόρμα νέας κίνησης
  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<'debt' | 'receivable'>('debt');
  const [partyType, setPartyType] = useState<FinancePartyType>('reference_center');
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [referralId, setReferralId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Εξόφληση / είσπραξη
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [entriesRes, summaryRes, patientsRes, centersRes, referralsRes] = await Promise.all([
        api.getFinanceEntries(),
        api.getFinanceSummary(),
        api.getPatients(),
        api.getReferenceCenters(),
        api.getReferrals(),
      ]);
      setEntries(entriesRes.entries || []);
      setSummary(summaryRes);
      setPatients(patientsRes.patients || []);
      setCenters(centersRes.centers || []);
      setReferrals(referralsRes.referrals || []);
    } catch (err: any) {
      setError(err?.message || 'Σφάλμα φόρτωσης ταμείου');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Περιμένουμε να ολοκληρωθεί η αρχικοποίηση του auth ώστε το token
    // provider να έχει καταχωρηθεί πριν από τα πρώτα API calls.
    // Ο αυτόματος συγχρονισμός (6μηνο) τρέχει μόνο την πρώτη επίσκεψη της ημέρας.
    if (authLoading || autoSyncStarted.current) return;
    autoSyncStarted.current = true;

    const bootstrap = async () => {
      setSyncing(true);
      try {
        const result = await api.syncFinance(undefined, 'auto');
        if (!result.skipped && result.results?.length > 0) {
          setSyncMessage(result.message);
          setSyncDetails(result.results || []);
        }
      } catch (err: any) {
        // Σε αποτυχία εμφανίζουμε τα υπάρχοντα δεδομένα χωρίς να μπλοκάρουμε
        console.warn('Auto finance sync failed:', err?.message || err);
      } finally {
        setSyncing(false);
        await loadData();
      }
    };

    bootstrap();
  }, [authLoading]);

  /** Χειροκίνητος συγχρονισμός (30ετία) + επαναφόρτωση */
  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncMessage(null);
    setSyncDetails([]);
    try {
      const result = await api.syncFinance(undefined, 'manual');
      setSyncMessage(result.message);
      setSyncDetails(result.results || []);
      await loadData();
      setPage(1);
    } catch (err: any) {
      setError(err?.message || 'Σφάλμα συγχρονισμού με τα κέντρα αναφοράς');
      // Τα υπάρχοντα δεδομένα παραμένουν διαθέσιμα ακόμη και σε αποτυχία sync
      await loadData(true);
    } finally {
      setSyncing(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: entries.length,
      debt: entries.filter(e => e.direction === 'debt').length,
      receivable: entries.filter(e => e.direction === 'receivable').length,
    }),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(entry => {
      if (tab !== 'all' && entry.direction !== tab) return false;
      if (statusFilter && entry.status !== statusFilter) return false;
      if (!q) return true;
      return [
        entry.partyName,
        entry.patientName,
        entry.description,
        entry.referralBarcode,
        entry.notes,
        PARTY_TYPE_LABELS[entry.partyType],
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q));
    });
  }, [entries, tab, statusFilter, search]);

  const filteredTotals = useMemo(() => {
    const amount = filteredEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const paid = filteredEntries.reduce((sum, e) => sum + (Number(e.paidAmount) || 0), 0);
    return { amount: round2(amount), paid: round2(paid), balance: round2(Math.max(0, amount - paid)) };
  }, [filteredEntries]);

  // Έτη για επιλογή κατά την εξαγωγή/εκτύπωση
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const entry of entries) {
      const year = String(entry.issueDate || '').slice(0, 4);
      if (/^\d{4}$/.test(year)) years.add(year);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  // Σελιδοποίηση: 10 κινήσεις ανά σελίδα, από τις νεότερες στις παλαιότερες
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = useMemo(
    () => filteredEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredEntries, currentPage]
  );

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, search]);

  const centerDebts = summary?.byPartyType.find(
    p => p.direction === 'debt' && p.partyType === 'reference_center'
  );
  const payerDebts = summary?.byPartyType.find(p => p.direction === 'debt' && p.partyType === 'payer');
  const patientReceivables = summary?.byPartyType.find(
    p => p.direction === 'receivable' && p.partyType === 'patient'
  );
  const payerReceivables = summary?.byPartyType.find(
    p => p.direction === 'receivable' && p.partyType === 'payer'
  );
  /** Αν το κέντρο δίνει DeductedAmount, το σύνολο οφειλών προκύπτει από αυτό */
  const hasApiOutstanding = entries.some(entry => entry.source?.deductedAmount !== undefined);

  const resetForm = () => {
    setDirection('debt');
    setPartyType('reference_center');
    setPartyId('');
    setPartyName('');
    setPatientId('');
    setReferralId('');
    setDescription('');
    setAmount('');
    setIssueDate(today());
    setDueDate('');
    setNotes('');
    setFormError(null);
  };

  const handleDirectionChange = (value: 'debt' | 'receivable') => {
    setDirection(value);
    setPartyType(value === 'receivable' ? 'patient' : 'reference_center');
    setPartyId('');
    setPartyName('');
    setPatientId('');
    setReferralId('');
  };

  const handlePartyTypeChange = (value: FinancePartyType) => {
    setPartyType(value);
    setPartyId('');
    setPartyName('');
    if (value !== 'patient') setPatientId('');
  };

  const handleCenterChange = (id: string) => {
    setPartyId(id);
    const center = centers.find(c => c.id === id);
    setPartyName(center?.name || '');
  };

  const handlePatientChange = (id: string) => {
    setPatientId(id);
    const patient = patients.find(p => p.id === id);
    setPartyName(patientLabel(patient));
    setPartyId(id);
  };

  const handleReferralChange = (id: string) => {
    setReferralId(id);
    const referral = referrals.find(r => r.id === id);
    if (!referral) return;
    if (referral.patientId) {
      setPatientId(referral.patientId);
      const patient = patients.find(p => p.id === referral.patientId);
      if (partyType === 'patient') {
        setPartyId(referral.patientId);
        setPartyName(referral.patientName || patientLabel(patient));
      }
    }
    if (!description) {
      setDescription(
        `Παραπεμπτικό ${referral.barcode || referral.id}` +
          (referral.specialty ? ` — ${referral.specialty}` : '')
      );
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const amountNumber = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFormError('Συμπληρώστε έγκυρο ποσό μεγαλύτερο από μηδέν.');
      return;
    }
    if (partyType === 'payer' && !partyName.trim()) {
      setFormError('Συμπληρώστε την επωνυμία του φορέα.');
      return;
    }
    if (partyType !== 'payer' && !partyId && !partyName.trim()) {
      setFormError(partyType === 'reference_center' ? 'Επιλέξτε κέντρο αναφοράς.' : 'Επιλέξτε ασθενή.');
      return;
    }

    setCreating(true);
    try {
      const referral = referrals.find(r => r.id === referralId);
      const patient = patients.find(p => p.id === patientId);

      await api.createFinanceEntry({
        direction,
        partyType,
        partyId: partyId || undefined,
        partyName: partyName.trim() || undefined,
        patientId: patientId || undefined,
        patientName: patientLabel(patient) || referral?.patientName,
        referralId: referralId || undefined,
        referralBarcode: referral?.barcode,
        description: description.trim() || undefined,
        amount: amountNumber,
        issueDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });

      await loadData(true);
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      setFormError(err?.message || 'Σφάλμα καταχώρησης');
    } finally {
      setCreating(false);
    }
  };

  const togglePayments = (entry: FinanceEntry) => {
    setPaymentError(null);
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    setPayAmount(String(round2(Math.max(0, entry.amount - entry.paidAmount))));
    setPayDate(today());
    setPayMethod(PAYMENT_METHODS[0]);
  };

  const handleAddPayment = async (entry: FinanceEntry) => {
    setPaymentError(null);
    const amountNumber = Number(String(payAmount).replace(',', '.'));
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setPaymentError('Συμπληρώστε έγκυρο ποσό.');
      return;
    }

    setPaymentSaving(true);
    try {
      await api.addFinancePayment(entry.id, {
        amount: amountNumber,
        paidAt: payDate,
        method: payMethod,
      });
      await loadData(true);
      setPayAmount('');
    } catch (err: any) {
      setPaymentError(err?.message || 'Σφάλμα καταχώρησης πληρωμής');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDeletePayment = async (entry: FinanceEntry, paymentId: string) => {
    if (!window.confirm('Να ακυρωθεί η καταχώρηση εξόφλησης;')) return;
    try {
      await api.deleteFinancePayment(entry.id, paymentId);
      await loadData(true);
    } catch (err: any) {
      setError(err?.message || 'Σφάλμα διαγραφής πληρωμής');
    }
  };

  const handleToggleCancel = async (entry: FinanceEntry) => {
    try {
      await api.updateFinanceEntry(entry.id, {
        status: entry.status === 'cancelled' ? 'pending' : 'cancelled',
      });
      await loadData(true);
    } catch (err: any) {
      setError(err?.message || 'Σφάλμα ενημέρωσης κατάστασης');
    }
  };

  const handleDelete = async (entry: FinanceEntry) => {
    if (!window.confirm(`Να διαγραφεί η κίνηση «${entry.partyName}»;`)) return;
    try {
      await api.deleteFinanceEntry(entry.id);
      await loadData(true);
    } catch (err: any) {
      setError(err?.message || 'Σφάλμα διαγραφής');
    }
  };

  const exportCsv = (rowsToExport: FinanceEntry[], year: string) => {
    const header = [
      'Ημερομηνία',
      'Τύπος',
      'Αντισυμβαλλόμενος',
      'Κατηγορία',
      'Ασθενής',
      'Παραπεμπτικό',
      'Περιγραφή',
      'Ποσό',
      'Εξοφλημένο',
      'Υπόλοιπο',
      'Λήξη',
      'Κατάσταση',
      'Πηγή',
      'Αρ. παραστατικού',
    ];
    const rows = rowsToExport.map(entry => [
      formatDate(entry.issueDate),
      entry.direction === 'debt' ? 'Οφειλή' : 'Απαίτηση',
      entry.partyName,
      PARTY_TYPE_LABELS[entry.partyType],
      entry.patientName || '',
      entry.referralBarcode || '',
      entry.description || '',
      entry.amount.toFixed(2).replace('.', ','),
      entry.paidAmount.toFixed(2).replace('.', ','),
      round2(entry.amount - entry.paidAmount).toFixed(2).replace('.', ','),
      formatDate(entry.dueDate),
      STATUS_LABELS[entry.status],
      entry.source?.system || '',
      entry.source?.documentId || '',
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tameio${year ? `_${year}` : ''}_${today()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const entriesForYear = (year: string) =>
    year ? entries.filter(entry => String(entry.issueDate || '').slice(0, 4) === year) : entries;

  /** Άνοιγμα της προεπισκόπησης σε νέα καρτέλα (fallback αν ο browser μπλοκάρει το print dialog) */
  const openPrintWindow = () => {
    const area = document.getElementById('finance-print-area');
    if (!area) return;

    const styles = `
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 16px; }
      h1 { font-size: 15px; margin: 0 0 4px; }
      p { font-size: 11px; color: #4b5563; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; }
      th, td { border: 1px solid #d1d5db; padding: 3px 5px; vertical-align: top; text-align: left; }
      thead th { background: #f3f4f6; }
      tbody td:nth-child(7), tbody td:nth-child(8), tbody td:nth-child(9) { text-align: right; }
      tfoot td { background: #f9fafb; font-weight: bold; }
      @page { size: A4 landscape; margin: 8mm; }
    `;

    const html = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8" />
      <title>Ταμείο${printPreview?.year ? ` ${printPreview.year}` : ''}</title>
      <style>${styles}</style></head><body>${area.innerHTML}</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `tameio${printPreview?.year ? `_${printPreview.year}` : ''}_${today()}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  /** Εκτυπώσιμη προβολή (in-app preview) αντί για print σε κρυφό iframe */
  const runExport = (action: 'print' | 'csv') => {
    const rows = entriesForYear(exportYear);
    if (rows.length === 0) {
      setExportDialogOpen(false);
      setError(`Δεν υπάρχουν κινήσεις για το έτος ${exportYear || '—'}`);
      return;
    }
    if (action === 'csv') exportCsv(rows, exportYear);
    else setPrintPreview({ rows, year: exportYear });
    setExportDialogOpen(false);
  };

  const printTotals = printPreview
    ? {
        count: printPreview.rows.length,
        amount: round2(printPreview.rows.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)),
        paid: round2(printPreview.rows.reduce((sum, e) => sum + (Number(e.paidAmount) || 0), 0)),
        balance: round2(
          Math.max(
            0,
            printPreview.rows.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) -
              printPreview.rows.reduce((sum, e) => sum + (Number(e.paidAmount) || 0), 0)
          )
        ),
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary-600" />
            Ταμείο
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Οφειλές προς κέντρα αναφοράς και φορείς, καθώς και απαιτήσεις από ασθενείς.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={loading || syncing}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
            title="Συγχρονισμός παραστατικών με τα κέντρα αναφοράς και τους φορείς"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Συγχρονισμός...' : 'Ανανέωση'}
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(open => !open)}
              disabled={entries.length === 0}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
              title="Εκτύπωση ή εξαγωγή CSV ανά έτος"
            >
              <Download className="w-4 h-4" />
              Εξαγωγή
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => {
                      setExportAction('print');
                      setExportYear(availableYears[0] || '');
                      setExportMenuOpen(false);
                      setExportDialogOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Printer className="w-4 h-4 text-gray-400" />
                    Εκτύπωση
                  </button>
                  <button
                    onClick={() => {
                      setExportAction('csv');
                      setExportYear(availableYears[0] || '');
                      setExportMenuOpen(false);
                      setExportDialogOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4 text-gray-400" />
                    Εξαγωγή CSV
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => {
              setShowForm(v => !v);
              setFormError(null);
            }}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {showForm ? 'Απόκρυψη φόρμας' : 'Νέα κίνηση'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Αποτέλεσμα συγχρονισμού */}
      {syncMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{syncMessage}</p>
              {syncDetails.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-emerald-700">
                  {syncDetails.map(detail => (
                    <li key={detail.centerId}>
                      {detail.error
                        ? `${detail.centerName}: ${detail.error}`
                        : `${detail.centerName}: ${detail.fetched} παραστατικά (${detail.created} νέα · ${detail.updated} ενημερώσεις · ${detail.skipped} χωρίς ποσό) · ${detail.from} → ${detail.to}`}
                      {detail.errors.length > 0 && (
                        <span className="block text-amber-700">
                          {detail.errors.length} γραμμές με σφάλμα: {detail.errors.slice(0, 3).join(' | ')}
                          {detail.errors.length > 3 ? '…' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => {
                setSyncMessage(null);
                setSyncDetails([]);
              }}
              className="text-emerald-500 hover:text-emerald-700"
              title="Κλείσιμο"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
        <SummaryCard
          title="Οφειλές σε κέντρα αναφοράς"
          value={formatMoney(
            hasApiOutstanding
              ? summary?.totals.centerOutstandingFromApi || 0
              : centerDebts?.outstanding || 0
          )}
          hint={
            hasApiOutstanding
              ? `Υπόλοιπο κατά κέντρο (DeductedAmount) · ${centerDebts?.count || 0} κινήσεις`
              : `${centerDebts?.count || 0} κινήσεις · σύνολο ${formatMoney(centerDebts?.amount || 0)}`
          }
          icon={Building2}
          tone="blue"
        />
        <SummaryCard
          title="Οφειλές προς φορείς"
          value={formatMoney(payerDebts?.outstanding || 0)}
          hint={`${payerDebts?.count || 0} κινήσεις · σύνολο ${formatMoney(payerDebts?.amount || 0)}`}
          icon={Landmark}
          tone="purple"
        />
        <SummaryCard
          title="Απαιτήσεις από ασθενείς"
          value={formatMoney(patientReceivables?.outstanding || 0)}
          hint={`${patientReceivables?.count || 0} κινήσεις · σύνολο ${formatMoney(
            patientReceivables?.amount || 0
          )}`}
          icon={User}
          tone="emerald"
        />
        <SummaryCard
          title="Απαιτήσεις από φορείς"
          value={formatMoney(payerReceivables?.outstanding || 0)}
          hint={`${payerReceivables?.count || 0} κινήσεις · σύνολο ${formatMoney(
            payerReceivables?.amount || 0
          )}`}
          icon={Landmark}
          tone="emerald"
        />
        <SummaryCard
          title="Ληξιπρόθεσμα"
          value={formatMoney(summary?.totals.overdueAmount || 0)}
          hint={`${summary?.totals.overdueCount || 0} ληξιπρόθεσμες κινήσεις`}
          icon={AlertCircle}
          tone="amber"
        />
      </div>

      {/* Φόρμα νέας κίνησης */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary-600" />
            Νέα κίνηση ταμείου
          </h2>

          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formError}
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <button
                type="button"
                onClick={() => handleDirectionChange('debt')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  direction === 'debt'
                    ? 'bg-rose-50 border-rose-300 text-rose-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Οφειλή
              </button>
              <button
                type="button"
                onClick={() => handleDirectionChange('receivable')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  direction === 'receivable'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Απαίτηση
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Κατηγορία *</label>
                <select
                  value={partyType}
                  onChange={e => handlePartyTypeChange(e.target.value as FinancePartyType)}
                  className="input-field"
                >
                  <option value="reference_center">Κέντρο αναφοράς</option>
                  <option value="payer">Φορέας (ΕΟΠΥΥ / ασφαλιστικό)</option>
                  <option value="patient">Ασθενής</option>
                </select>
              </div>

              {partyType === 'reference_center' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="w-3.5 h-3.5 inline mr-1" />
                    Κέντρο αναφοράς *
                  </label>
                  <select
                    value={partyId}
                    onChange={e => handleCenterChange(e.target.value)}
                    className="input-field"
                  >
                    <option value="">-- Επιλέξτε κέντρο --</option>
                    {centers.map(center => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                        {center.active === false ? ' (ανενεργό)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {partyType === 'payer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Landmark className="w-3.5 h-3.5 inline mr-1" />
                    Φορέας *
                  </label>
                  <input
                    type="text"
                    list="finance-payers"
                    value={partyName}
                    onChange={e => setPartyName(e.target.value)}
                    className="input-field"
                    placeholder="π.χ. ΕΟΠΥΥ"
                    required
                  />
                  <datalist id="finance-payers">
                    {PAYERS.map(payer => (
                      <option key={payer} value={payer} />
                    ))}
                  </datalist>
                </div>
              )}

              {partyType === 'patient' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    Ασθενής *
                  </label>
                  <select
                    value={partyId}
                    onChange={e => handlePatientChange(e.target.value)}
                    className="input-field"
                  >
                    <option value="">-- Επιλέξτε ασθενή --</option>
                    {patients.map(patient => (
                      <option key={patient.id} value={patient.id}>
                        {patientLabel(patient)}
                        {patient.amka ? ` · ΑΜΚΑ ${patient.amka}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Σχετικό παραπεμπτικό
                </label>
                <select
                  value={referralId}
                  onChange={e => handleReferralChange(e.target.value)}
                  className="input-field"
                >
                  <option value="">-- Κανένα --</option>
                  {referrals.map(referral => (
                    <option key={referral.id} value={referral.id}>
                      {referral.barcode || referral.id}
                      {referral.patientName ? ` · ${referral.patientName}` : ''}
                      {referral.specialty ? ` · ${referral.specialty}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Euro className="w-3.5 h-3.5 inline mr-1" />
                  Ποσό (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="input-field"
                  placeholder="0,00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Ημερομηνία έκδοσης
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ημερομηνία λήξης</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Περιγραφή</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input-field"
                  placeholder="π.χ. Εκτελέσεις εξετάσεων Ιανουαρίου 2026"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="input-field min-h-[70px]"
                  rows={2}
                  placeholder="Παραστατικά, συμφωνημένα ποσά, όροι πληρωμής..."
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? 'Καταχώρηση...' : 'Καταχώρηση'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Άκυρο
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Φίλτρα */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
            Όλα ({counts.all})
          </TabButton>
          <TabButton active={tab === 'debt'} onClick={() => setTab('debt')}>
            Οφειλές ({counts.debt})
          </TabButton>
          <TabButton active={tab === 'receivable'} onClick={() => setTab('receivable')}>
            Απαιτήσεις ({counts.receivable})
          </TabButton>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as '' | FinanceEntryStatus)}
            className="input-field sm:w-48"
          >
            <option value="">Όλες οι καταστάσεις</option>
            <option value="pending">Εκκρεμεί</option>
            <option value="partial">Μερική εξόφληση</option>
            <option value="settled">Εξοφλημένο</option>
            <option value="cancelled">Ακυρωμένο</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 sm:w-72"
              placeholder="Αναζήτηση αντισυμβαλλομένου, ασθενή, barcode..."
            />
          </div>
        </div>
      </div>

      {/* Λίστα */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Φόρτωση ταμείου...
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Δεν υπάρχουν κινήσεις ταμείου</p>
          <p className="text-gray-400 text-sm mt-1">
            Καταχωρήστε την πρώτη οφειλή ή απαίτηση με το κουμπί «Νέα κίνηση».
          </p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Δεν βρέθηκαν κινήσεις</p>
          <p className="text-gray-400 text-sm mt-1">Δοκιμάστε διαφορετικά φίλτρα ή όρο αναζήτησης.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Αντισυμβαλλόμενος</th>
                  <th className="px-4 py-3 font-medium">Περιγραφή</th>
                  <th className="px-4 py-3 font-medium text-right">Ποσό</th>
                  <th className="px-4 py-3 font-medium text-right">Εξοφλήθηκε</th>
                  <th className="px-4 py-3 font-medium text-right">Υπόλοιπο</th>
                  <th className="px-4 py-3 font-medium">Λήξη</th>
                  <th className="px-4 py-3 font-medium">Κατάσταση</th>
                  <th className="px-4 py-3 font-medium text-right">Ενέργειες</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageEntries.map(entry => {
                  const balance = round2(Math.max(0, entry.amount - entry.paidAmount));
                  const overdue = isOverdue(entry);
                  const expanded = expandedId === entry.id;

                  return (
                    <Fragment key={entry.id}>
                      <tr className={`hover:bg-gray-50/60 ${entry.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-gray-900">{entry.partyName}</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PARTY_TYPE_BADGES[entry.partyType]}`}
                              >
                                {PARTY_TYPE_LABELS[entry.partyType]}
                              </span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  entry.direction === 'debt'
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {entry.direction === 'debt' ? 'Οφειλή' : 'Απαίτηση'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <p className="max-w-[260px] truncate" title={entry.description || ''}>
                            {entry.description || '—'}
                          </p>
                          <div className="flex flex-wrap gap-x-2 text-xs text-gray-400 mt-0.5">
                            {entry.patientName && <span>{entry.patientName}</span>}
                            {entry.referralBarcode && <span>· {entry.referralBarcode}</span>}
                            <span>· {formatDate(entry.issueDate)}</span>
                          </div>
                          {entry.source?.system === 'emporiko-documents' && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                Emporiko #{entry.source.documentId || '—'}
                              </span>
                              {entry.source.documentType && (
                                <span
                                  className={`px-1.5 py-0.5 rounded font-medium ${
                                    entry.source.documentType === 'receipt'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : entry.source.documentType === 'credit'
                                      ? 'bg-sky-50 text-sky-700'
                                      : 'bg-indigo-50 text-indigo-700'
                                  }`}
                                >
                                  {entry.source.documentType === 'receipt'
                                    ? 'Είσπραξη'
                                    : entry.source.documentType === 'credit'
                                    ? 'Πιστωτικό'
                                    : 'Τιμολόγιο'}
                                </span>
                              )}
                              {entry.source.netAmount !== undefined && (
                                <span className="text-gray-400">
                                  καθαρό {formatMoney(entry.source.netAmount)}
                                  {entry.source.vatAmount !== undefined
                                    ? ` · ΦΠΑ ${formatMoney(entry.source.vatAmount)}`
                                    : ''}
                                </span>
                              )}
                              {entry.source.einvoiceUrl && (
                                <a
                                  href={entry.source.einvoiceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary-600 hover:underline"
                                >
                                  e-invoice
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {formatMoney(entry.paidAmount)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                            balance > 0 ? 'text-rose-600' : 'text-green-600'
                          }`}
                        >
                          {formatMoney(balance)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {formatDate(entry.dueDate)}
                          </span>
                          {overdue && (
                            <span className="block text-[11px] text-red-500 font-medium">Ληξιπρόθεσμο</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[entry.status]}`}
                          >
                            {STATUS_LABELS[entry.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => togglePayments(entry)}
                              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                              title={balance > 0 ? 'Καταχώρηση εξόφλησης' : 'Ιστορικό εξοφλήσεων'}
                            >
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {entry.status === 'cancelled' ? (
                              <button
                                onClick={() => handleToggleCancel(entry)}
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Επαναφορά"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleCancel(entry)}
                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Ακύρωση κίνησης"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(entry)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Διαγραφή"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                  Ιστορικό εξοφλήσεων
                                </h4>
                                {entry.payments.length === 0 ? (
                                  <p className="text-sm text-gray-400">Δεν υπάρχουν καταχωρήσεις.</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {entry.payments.map(payment => (
                                      <li
                                        key={payment.id}
                                        className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                      >
                                        <div>
                                          <span className="font-medium text-gray-900">
                                            {formatMoney(payment.amount)}
                                          </span>
                                          <span className="text-gray-400 text-xs ml-2">
                                            {formatDate(payment.paidAt)}
                                            {payment.method ? ` · ${payment.method}` : ''}
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => handleDeletePayment(entry, payment.id)}
                                          className="text-gray-300 hover:text-red-600"
                                          title="Ακύρωση καταχώρησης"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {entry.status !== 'cancelled' && balance > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    Νέα εξόφληση / είσπραξη
                                  </h4>
                                  {paymentError && (
                                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-1.5">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                      {paymentError}
                                    </div>
                                  )}
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      max={balance}
                                      value={payAmount}
                                      onChange={e => setPayAmount(e.target.value)}
                                      className="input-field sm:w-28"
                                      placeholder="Ποσό"
                                    />
                                    <input
                                      type="date"
                                      value={payDate}
                                      onChange={e => setPayDate(e.target.value)}
                                      className="input-field sm:w-40"
                                    />
                                    <select
                                      value={payMethod}
                                      onChange={e => setPayMethod(e.target.value)}
                                      className="input-field sm:w-40"
                                    >
                                      {PAYMENT_METHODS.map(method => (
                                        <option key={method} value={method}>
                                          {method}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleAddPayment(entry)}
                                      disabled={paymentSaving}
                                      className="flex items-center justify-center gap-1.5 bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                                    >
                                      {paymentSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                      )}
                                      Καταχώρηση
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">
                                    Υπόλοιπο προς εξόφληση: {formatMoney(balance)}
                                  </p>
                                </div>
                              )}
                            </div>

                            {entry.notes && (
                              <p className="mt-3 text-xs text-gray-500 border-t border-gray-200 pt-3">
                                <span className="font-medium">Σημειώσεις: </span>
                                {entry.notes}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-sm">
            <span className="text-gray-500">
              {filteredEntries.length === 0
                ? '0 κινήσεις'
                : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                    currentPage * PAGE_SIZE,
                    filteredEntries.length
                  )} από ${filteredEntries.length} ${
                    filteredEntries.length === 1 ? 'κίνηση' : 'κινήσεις'
                  }`}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-gray-500">
                Σύνολο: <span className="font-medium text-gray-800">{formatMoney(filteredTotals.amount)}</span>
              </span>
              <span className="text-gray-500">
                Εξοφλημένα:{' '}
                <span className="font-medium text-gray-800">{formatMoney(filteredTotals.paid)}</span>
              </span>
              <span className="text-gray-500">
                Υπόλοιπο:{' '}
                <span className="font-semibold text-rose-600">{formatMoney(filteredTotals.balance)}</span>
              </span>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Προηγούμενη
              </button>

              <div className="flex items-center gap-1">
                {getPageNumbers(currentPage, totalPages).map((item, index) =>
                  item === '…' ? (
                    <span key={`gap-${index}`} className="px-1 text-gray-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`min-w-[32px] px-2 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                        item === currentPage
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Επόμενη
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Επιλογή έτους για εκτύπωση / εξαγωγή */}
      {exportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {exportAction === 'print' ? (
                  <Printer className="w-4 h-4 text-primary-600" />
                ) : (
                  <FileText className="w-4 h-4 text-primary-600" />
                )}
                {exportAction === 'print' ? 'Εκτύπωση ταμείου' : 'Εξαγωγή CSV'}
              </h3>
              <button
                onClick={() => setExportDialogOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Κλείσιμο"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Έτος</label>
                <select
                  value={exportYear}
                  onChange={e => setExportYear(e.target.value)}
                  className="input-field"
                >
                  <option value="">Όλα τα έτη ({entries.length})</option>
                  {availableYears.map(year => {
                    const count = entries.filter(
                      entry => String(entry.issueDate || '').slice(0, 4) === year
                    ).length;
                    return (
                      <option key={year} value={year}>
                        {year} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <p className="text-xs text-gray-500">
                {exportAction === 'print'
                  ? 'Ανοίγει η προεπισκόπηση εκτύπωσης με τις κινήσεις του επιλεγμένου έτους.'
                  : 'Το αρχείο περιλαμβάνει όλες τις κινήσεις του επιλεγμένου έτους.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
              <button
                onClick={() => setExportDialogOpen(false)}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Άκυρο
              </button>
              <button
                onClick={() => runExport(exportAction)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
              >
                {exportAction === 'print' ? (
                  <>
                    <Printer className="w-4 h-4" />
                    Εκτύπωση
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Εξαγωγή
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Προεπισκόπηση εκτύπωσης */}
      {printPreview && printTotals && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-gray-900/60 p-4 print:p-0 print:bg-white print:static print:z-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 print:hidden">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Προεπισκόπηση εκτύπωσης — {printPreview.year || 'Όλα τα έτη'}
                </h3>
                <p className="text-xs text-gray-500">
                  {printTotals.count} κινήσεις · Αν δεν ανοίξει ο διάλογος εκτύπωσης, πατήστε{' '}
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-300 text-[10px]">Ctrl</kbd>
                  +
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-300 text-[10px]">P</kbd>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPrintPreview(null)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Κλείσιμο
                </button>
                <button
                  onClick={openPrintWindow}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"
                  title="Άνοιγμα σε νέα καρτέλα για εκτύπωση"
                >
                  <ExternalLink className="w-4 h-4" />
                  Νέα καρτέλα
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
                >
                  <Printer className="w-4 h-4" />
                  Εκτύπωση
                </button>
              </div>
            </div>

            <div id="finance-print-area" className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible">
              <div className="mb-4">
                <h1 className="text-lg font-bold text-gray-900">Ταμείο — Οφειλές &amp; Απαιτήσεις</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Έτος: {printPreview.year || 'Όλα τα έτη'} · Κινήσεις: {printTotals.count} · Εκτύπωση:{' '}
                  {new Date().toLocaleString('el-GR')}
                </p>
              </div>

              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Ημερομηνία</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Τύπος</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Αντισυμβαλλόμενος</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Κατηγορία</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Περιγραφή</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Ασθενής</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-right">Ποσό</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-right">Εξοφλημένο</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-right">Υπόλοιπο</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Λήξη</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {printPreview.rows.map(entry => {
                    const balance = round2(Math.max(0, entry.amount - entry.paidAmount));
                    return (
                      <tr key={entry.id}>
                        <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">
                          {formatDate(entry.issueDate)}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1">
                          {entry.direction === 'debt' ? 'Οφειλή' : 'Απαίτηση'}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1">{entry.partyName}</td>
                        <td className="border border-gray-300 px-1.5 py-1">
                          {PARTY_TYPE_LABELS[entry.partyType]}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1">{entry.description || ''}</td>
                        <td className="border border-gray-300 px-1.5 py-1">{entry.patientName || ''}</td>
                        <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                          {formatMoney(entry.paidAmount)}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                          {formatMoney(balance)}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">
                          {formatDate(entry.dueDate)}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1">
                          {STATUS_LABELS[entry.status]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border border-gray-300 px-1.5 py-1" colSpan={6}>
                      Σύνολα
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                      {formatMoney(printTotals.amount)}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                      {formatMoney(printTotals.paid)}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">
                      {formatMoney(printTotals.balance)}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-1" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Αριθμοί σελίδων με αποσιωπητικά για μεγάλο εύρος */
function getPageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages)
    .filter(pageNumber => pageNumber >= 1 && pageNumber <= total)
    .sort((a, b) => a - b);

  const result: Array<number | '…'> = [];
  let previous = 0;
  for (const pageNumber of sorted) {
    if (previous && pageNumber - previous > 1) result.push('…');
    result.push(pageNumber);
    previous = pageNumber;
  }
  return result;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'blue' | 'purple' | 'emerald' | 'amber';
}) {
  const tones: Record<typeof tone, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
          <p className="text-xs text-gray-400 mt-1 truncate" title={hint}>
            {hint}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
