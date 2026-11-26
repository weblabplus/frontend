'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Clock, X,
  Trash2, Pencil, Stethoscope, AlertCircle, CheckCircle2, Search, CalendarCheck,
  Wallet, ArrowDownLeft, ArrowUpRight, ClipboardList, Printer, Building2,
  Cloud,
} from 'lucide-react';
import {
  api,
  type AppointmentDto,
  type AppointmentStatus,
  type FinanceEntry,
  type ReferenceCenter,
  type ReferenceCenterWorklist,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  amka?: string;
}

interface VisitItem {
  id: string;
  patientId: string;
  patientName?: string;
  visitDate: string;
  reason: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

const WEEKDAYS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];

const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Προγραμματισμένο',
  confirmed: 'Επιβεβαιωμένο',
  completed: 'Σε επίσκεψη',
  cancelled: 'Ακυρωμένο',
  no_show: 'Δεν προσήλθε',
};

const statusColors: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-gray-100 text-gray-600',
};

const statusDotColors: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-400',
  confirmed: 'bg-indigo-400',
  completed: 'bg-green-400',
  cancelled: 'bg-red-400',
  no_show: 'bg-gray-400',
};

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

const financeStatusLabels: Record<string, string> = {
  pending: 'Εκκρεμεί',
  partial: 'Μερική εξόφληση',
  settled: 'Εξοφλημένο',
  cancelled: 'Ακυρωμένο',
};

const financeStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  partial: 'bg-blue-100 text-blue-700',
  settled: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Ημερομηνία χωρίς ώρα/ζώνη (visits & finance αποθηκεύουν YYYY-MM-DD) */
const dateOnlyToDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: Date) => date.toLocaleDateString('el-GR');
const currency = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });

/** Ελληνικός πληθυντικός με μέτρηση (1 επίσκεψη / 2 επισκέψεις) */
const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

type AppointmentDayItem = {
  kind: 'appointment';
  date: Date;
  sortOrder: number;
  appointment: AppointmentDto;
};
type VisitDayItem = { kind: 'visit'; date: Date; sortOrder: number; visit: VisitItem };
type FinanceDayItem = { kind: 'finance'; date: Date; sortOrder: number; entry: FinanceEntry };
type DayItem = AppointmentDayItem | VisitDayItem | FinanceDayItem;

const dayItemKey = (item: DayItem) => {
  if (item.kind === 'appointment') return `appointment-${item.appointment.id}`;
  if (item.kind === 'visit') return `visit-${item.visit.id}`;
  return `finance-${item.entry.id}`;
};

const dayItemDotClass = (item: DayItem) => {
  if (item.kind === 'appointment') {
    return statusDotColors[item.appointment.status] || 'bg-gray-300';
  }
  if (item.kind === 'visit') {
    return item.visit.status === 'cancelled' ? 'bg-gray-300' : 'bg-violet-400';
  }
  return item.entry.direction === 'receivable' ? 'bg-teal-500' : 'bg-amber-500';
};

const dayItemLabel = (item: DayItem) => {
  if (item.kind === 'appointment') {
    return `${timeLabel(item.appointment.scheduledAt)} ${item.appointment.patientName || 'Ασθενής'}`;
  }
  if (item.kind === 'visit') {
    return `Επίσκεψη: ${item.visit.patientName || item.visit.reason}`;
  }
  return `Λήξη: ${item.entry.partyName}`;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const byScheduledAt = (a: AppointmentDto, b: AppointmentDto) =>
  new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();

type PendingAction = { type: 'delete' | 'convert'; appointment: AppointmentDto };

export default function CalendarPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
  const [showAppointments, setShowAppointments] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const [showFinance, setShowFinance] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [patientFilter, setPatientFilter] = useState('');
  const [notice, setNotice] = useState<{ text: string; patientId: string } | null>(null);

  // ── Φόρμα ραντεβού ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPatientId, setFormPatientId] = useState('');
  const [formPatientSearch, setFormPatientSearch] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('09:00');
  const [formDuration, setFormDuration] = useState('30');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<AppointmentStatus>('scheduled');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Επιβεβαίωση ενέργειας (διαγραφή / μετατροπή) ──
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Λίστα εργασίας (κέντρο αναφοράς) ──
  const [worklistOpen, setWorklistOpen] = useState(false);
  const [centers, setCenters] = useState<ReferenceCenter[]>([]);
  const [centersLoading, setCentersLoading] = useState(false);
  const [worklistCenterId, setWorklistCenterId] = useState('');
  const [worklist, setWorklist] = useState<ReferenceCenterWorklist | null>(null);
  const [worklistLoading, setWorklistLoading] = useState(false);
  const [worklistError, setWorklistError] = useState<string | null>(null);

  // ── Hapio (auto-sync ραντεβού) ──
  const [hapioBusyId, setHapioBusyId] = useState<string | null>(null);
  const [hapioMessage, setHapioMessage] = useState<string | null>(null);

  const loadPatients = useCallback(async () => {
    try {
      const data = await api.getPatients();
      setPatients(data.patients || []);
    } catch {
      setPatients([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadPatients();
  }, [authLoading, loadPatients]);

  const loadMonth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const fromIso = monthStart.toISOString();
      const toIso = new Date(
        lastDay.getFullYear(),
        lastDay.getMonth(),
        lastDay.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();
      const fromDate = dateKey(monthStart);
      const toDate = dateKey(lastDay);

      const [apptRes, visitRes, financeRes] = await Promise.allSettled([
        api.getAppointments({ from: fromIso, to: toIso }),
        api.getVisits(undefined, { from: fromDate, to: toDate }),
        // Οι κινήσεις ταμείου απαιτούν σύνδεση
        isAuthenticated
          ? api.getFinanceEntries({ dueFrom: fromDate, dueTo: toDate })
          : Promise.resolve({ entries: [] as FinanceEntry[], total: 0 }),
      ]);

      setAppointments(apptRes.status === 'fulfilled' ? apptRes.value.appointments || [] : []);
      setVisits(visitRes.status === 'fulfilled' ? visitRes.value.visits || [] : []);
      setFinanceEntries(
        financeRes.status === 'fulfilled'
          ? (financeRes.value.entries || []).filter(
              // Μόνο εκκρεμείς / μερικώς εξοφλημένες — οι εξοφλημένες & ακυρωμένες δεν εμφανίζονται
              entry => entry.status === 'pending' || entry.status === 'partial'
            )
          : []
      );

      const failed = [apptRes, visitRes, financeRes].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        const reason = (failed[0] as PromiseRejectedResult).reason;
        setError(reason?.message || 'Σφάλμα φόρτωσης ημερολογίου');
      }
    } catch (err: any) {
      setError(err.message || 'Σφάλμα φόρτωσης ημερολογίου');
    } finally {
      setLoading(false);
    }
  }, [cursor, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    loadMonth();
  }, [authLoading, loadMonth]);

  const todayKey = dateKey(new Date());

  /** Επισκέψεις που δημιουργήθηκαν από ραντεβού — δεν εμφανίζονται ξεχωριστά */
  const convertedVisitIds = useMemo(
    () =>
      new Set(
        appointments
          .map(appointment => appointment.visitId)
          .filter((id): id is string => Boolean(id))
      ),
    [appointments]
  );

  const monthItems = useMemo(() => {
    const items: DayItem[] = [];
    const matchesPatient = (patientId?: string) =>
      !patientFilter || patientId === patientFilter;

    if (showAppointments) {
      for (const appointment of appointments) {
        if (!matchesPatient(appointment.patientId)) continue;
        const date = new Date(appointment.scheduledAt);
        items.push({
          kind: 'appointment',
          date,
          sortOrder: date.getHours() * 60 + date.getMinutes(),
          appointment,
        });
      }
    }

    if (showVisits) {
      for (const visit of visits) {
        if (!matchesPatient(visit.patientId)) continue;
        // Η επίσκεψη προέκυψε από ραντεβού; εμφανίζεται μόνο το ραντεβού.
        if (convertedVisitIds.has(visit.id)) continue;
        const date = dateOnlyToDate(visit.visitDate);
        if (!date) continue;
        items.push({ kind: 'visit', date, sortOrder: 10000, visit });
      }
    }

    if (showFinance) {
      for (const entry of financeEntries) {
        if (!matchesPatient(entry.patientId)) continue;
        const date = dateOnlyToDate(entry.dueDate);
        if (!date) continue;
        items.push({ kind: 'finance', date, sortOrder: 20000, entry });
      }
    }

    return items;
  }, [
    appointments,
    visits,
    financeEntries,
    convertedVisitIds,
    patientFilter,
    showAppointments,
    showVisits,
    showFinance,
  ]);

  const counts = useMemo(
    () => ({
      appointments: monthItems.filter(item => item.kind === 'appointment').length,
      visits: monthItems.filter(item => item.kind === 'visit').length,
      finance: monthItems.filter(item => item.kind === 'finance').length,
    }),
    [monthItems]
  );

  const byDay = useMemo(() => {
    const map: Record<string, DayItem[]> = {};
    for (const item of monthItems) {
      const key = dateKey(item.date);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    Object.values(map).forEach(list => list.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  }, [monthItems]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Δευτέρα
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, i) => new Date(year, month, 1 - firstWeekday + i));
  }, [cursor]);

  const selectedKey = dateKey(selectedDate);
  const selectedItems = byDay[selectedKey] || [];
  const selectedAppointments = selectedItems.filter(
    (item): item is AppointmentDayItem => item.kind === 'appointment'
  );
  const selectedVisits = selectedItems.filter(
    (item): item is VisitDayItem => item.kind === 'visit'
  );
  const selectedFinance = selectedItems.filter(
    (item): item is FinanceDayItem => item.kind === 'finance'
  );

  const monthLabel = cursor.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
  const selectedLabel = selectedDate.toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const sortedPatients = useMemo(
    () => [...patients].sort((a, b) => a.lastName.localeCompare(b.lastName, 'el')),
    [patients]
  );

  const filteredFormPatients = useMemo(() => {
    const q = formPatientSearch.trim().toLowerCase();
    if (!q) return sortedPatients;
    return sortedPatients.filter(p => {
      const name = `${p.lastName} ${p.firstName}`.toLowerCase();
      return name.includes(q) || (p.amka || '').includes(q);
    });
  }, [sortedPatients, formPatientSearch]);

  const changeMonth = (delta: number) => {
    setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCursor(startOfMonth(now));
    setSelectedDate(now);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormPatientId('');
    setFormPatientSearch('');
    setFormDate('');
    setFormTime('09:00');
    setFormDuration('30');
    setFormReason('');
    setFormNotes('');
    setFormStatus('scheduled');
    setFormError(null);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    resetForm();
  };

  const openCreate = (day?: Date) => {
    resetForm();
    const date = day || selectedDate;
    setFormDate(dateKey(date));
    if (patientFilter) {
      const patient = patients.find(p => p.id === patientFilter);
      if (patient) {
        setFormPatientId(patient.id);
        setFormPatientSearch(`${patient.lastName} ${patient.firstName}`);
      }
    }
    setFormOpen(true);
  };

  const openEdit = (a: AppointmentDto) => {
    const d = new Date(a.scheduledAt);
    setEditingId(a.id);
    setFormPatientId(a.patientId);
    setFormPatientSearch(a.patientName || '');
    setFormDate(dateKey(d));
    setFormTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setFormDuration(a.durationMinutes ? String(a.durationMinutes) : '30');
    setFormReason(a.reason);
    setFormNotes(a.notes || '');
    setFormStatus(a.status);
    setFormError(null);
    setFormOpen(true);
  };

  const selectPatient = (patient: Patient) => {
    setFormPatientId(patient.id);
    setFormPatientSearch(`${patient.lastName} ${patient.firstName}`);
  };

  /** Ραντεβού που έχει ήδη μετατραπεί — η κατάσταση δεν αλλάζει χειροκίνητα */
  const editingConverted = Boolean(
    editingId && appointments.find(a => a.id === editingId)?.visitId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formPatientId || !formDate || !formTime || !formReason.trim()) {
      setFormError('Συμπληρώστε ασθενή, ημερομηνία, ώρα και λόγο ραντεβού');
      return;
    }

    const scheduled = new Date(`${formDate}T${formTime}`);
    if (Number.isNaN(scheduled.getTime())) {
      setFormError('Μη έγκυρη ημερομηνία ή ώρα');
      return;
    }

    const patient = patients.find(p => p.id === formPatientId);
    const payload = {
      patientId: formPatientId,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : formPatientSearch,
      scheduledAt: scheduled.toISOString(),
      durationMinutes: Number(formDuration) > 0 ? Number(formDuration) : undefined,
      reason: formReason.trim(),
      notes: formNotes.trim() || undefined,
      status: formStatus,
    };

    try {
      setSaving(true);
      let hapioWarning: string | undefined;
      if (editingId) {
        const data = await api.updateAppointment(editingId, payload);
        hapioWarning = data.hapioWarning;
        setAppointments(prev =>
          prev.map(a => (a.id === editingId ? data.appointment : a)).sort(byScheduledAt)
        );
      } else {
        const data = await api.createAppointment(payload);
        hapioWarning = data.hapioWarning;
        setAppointments(prev => [...prev, data.appointment].sort(byScheduledAt));
      }

      setSelectedDate(scheduled);
      if (
        scheduled.getMonth() !== cursor.getMonth() ||
        scheduled.getFullYear() !== cursor.getFullYear()
      ) {
        setCursor(startOfMonth(scheduled));
      }

      if (hapioWarning) {
        setHapioMessage(`Το ραντεβού αποθηκεύτηκε, αλλά το Hapio επέστρεψε: ${hapioWarning}`);
      }

      setFormOpen(false);
      resetForm();
      setNotice(null);
    } catch (err: any) {
      setFormError(err.message || 'Σφάλμα αποθήκευσης ραντεβού');
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { type, appointment } = pending;

    try {
      setBusyId(appointment.id);
      setActionError(null);

      if (type === 'delete') {
        const data = await api.deleteAppointment(appointment.id);
        if (data.hapioWarning) {
          setHapioMessage(`Το ραντεβού διαγράφηκε, αλλά το Hapio επέστρεψε: ${data.hapioWarning}`);
        }
        setAppointments(prev => prev.filter(a => a.id !== appointment.id));
        setPending(null);
      } else {
        const data = await api.convertAppointmentToVisit(
          appointment.id,
          dateKey(new Date(appointment.scheduledAt))
        );
        setAppointments(prev =>
          prev.map(a => (a.id === appointment.id ? data.appointment : a)).sort(byScheduledAt)
        );
        const createdVisit = data.visit as VisitItem | undefined;
        if (createdVisit?.id) {
          setVisits(prev =>
            prev.some(v => v.id === createdVisit.id) ? prev : [...prev, createdVisit]
          );
        }
        setNotice({
          text: `Το ραντεβού του/της ${appointment.patientName || 'ασθενούς'} μετατράπηκε σε επίσκεψη.`,
          patientId: appointment.patientId,
        });
        setPending(null);
      }
    } catch (err: any) {
      setActionError(err.message || 'Σφάλμα εκτέλεσης ενέργειας');
    } finally {
      setBusyId(null);
    }
  };

  // ── Λίστα εργασίας ──
  const openWorklist = async () => {
    setWorklistOpen(true);
    setWorklist(null);
    setWorklistError(null);

    if (centers.length > 0) return;

    try {
      setCentersLoading(true);
      const data = await api.getReferenceCenters();
      const active = (data.centers || []).filter(center => center.active !== false);
      setCenters(active);
      if (active.length > 0) {
        setWorklistCenterId(prev => prev || active[0].id);
      }
    } catch (err: any) {
      setWorklistError(err.message || 'Σφάλμα φόρτωσης κέντρων αναφοράς');
    } finally {
      setCentersLoading(false);
    }
  };

  const closeWorklist = () => {
    if (worklistLoading) return;
    setWorklistOpen(false);
    setWorklist(null);
    setWorklistError(null);
  };

  const buildWorklist = async () => {
    if (!worklistCenterId) {
      setWorklistError('Επιλέξτε κέντρο αναφοράς');
      return;
    }
    try {
      setWorklistLoading(true);
      setWorklistError(null);
      const data = await api.getCenterWorklist(worklistCenterId, selectedKey);
      setWorklist(data);
    } catch (err: any) {
      setWorklist(null);
      setWorklistError(err.message || 'Σφάλμα δημιουργίας λίστας εργασίας');
    } finally {
      setWorklistLoading(false);
    }
  };

  // ── Hapio (retry αποστολής αν απέτυχε ο αυτόματος συγχρονισμός) ──
  const pushAppointmentToHapio = async (appointment: AppointmentDto) => {
    try {
      setHapioBusyId(appointment.id);
      setActionError(null);
      setHapioMessage(null);
      const data = await api.pushAppointmentToHapio(appointment.id);
      setAppointments(prev =>
        prev.map(item => (item.id === appointment.id ? data.appointment : item)).sort(byScheduledAt)
      );
      setHapioMessage(
        data.resynced
          ? 'Το ραντεβού επανασυγχρονίστηκε με το Hapio.'
          : 'Το ραντεβού στάλθηκε στο Hapio.'
      );
    } catch (err: any) {
      // Το backend αποθηκεύει το σφάλμα στο ραντεβού — το φέρνουμε για να
      // εμφανιστεί με κόκκινο στην κάρτα.
      const fresh = await api.getAppointment(appointment.id).catch(() => null);
      if (fresh?.appointment) {
        setAppointments(prev =>
          prev
            .map(item => (item.id === appointment.id ? fresh.appointment : item))
            .sort(byScheduledAt)
        );
      }
      setHapioMessage(null);
      setActionError(err.message || 'Σφάλμα συγχρονισμού με Hapio');
    } finally {
      setHapioBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary-600" />
            Ημερολόγιο
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Προγραμματισμός ραντεβού ανά ασθενή και μετατροπή τους σε επίσκεψη.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openWorklist}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            title="Εκτύπωση λίστας εργασίας κέντρου αναφοράς για την επιλεγμένη ημέρα"
          >
            <ClipboardList className="w-4 h-4" />
            Λίστα εργασίας
          </button>
          <button onClick={() => openCreate()} className="btn-primary flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Νέο Ραντεβού
          </button>
        </div>
      </div>

      {hapioMessage && (
        <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
          <Cloud className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-sky-800">{hapioMessage}</p>
          <button onClick={() => setHapioMessage(null)} className="text-sky-700 hover:text-sky-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-green-800">
            {notice.text}{' '}
            <Link
              href={`/visits?patientId=${encodeURIComponent(notice.patientId)}`}
              className="font-semibold underline hover:text-green-900"
            >
              Άνοιγμα επισκέψεων
            </Link>
          </div>
          <button onClick={() => setNotice(null)} className="text-green-700 hover:text-green-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ημερολόγιο */}
        <div className="card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-gray-100 transition-colors"
                aria-label="Προηγούμενος μήνας"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 capitalize min-w-[150px] text-center">
                {monthLabel}
              </h2>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-gray-100 transition-colors"
                aria-label="Επόμενος μήνας"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={goToday}
                className="ml-1 px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Σήμερα
              </button>
              {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={patientFilter}
                onChange={e => setPatientFilter(e.target.value)}
                className="text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[190px]"
              >
                <option value="">Όλοι οι ασθενείς</option>
                {sortedPatients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.lastName} {p.firstName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <TypeToggle
              active={showAppointments}
              onClick={() => setShowAppointments(value => !value)}
              dotClass="bg-blue-400"
              label={`Ραντεβού ${counts.appointments}`}
            />
            <TypeToggle
              active={showVisits}
              onClick={() => setShowVisits(value => !value)}
              dotClass="bg-violet-400"
              label={`Επισκέψεις ${counts.visits}`}
            />
            <TypeToggle
              active={showFinance}
              onClick={() => setShowFinance(value => !value)}
              dotClass="bg-amber-500"
              label={`Ταμείο ${counts.finance}`}
            />
            <span className="ml-auto text-[11px] text-gray-400">
              Κινήσεις ταμείου: μόνο εκκρεμείς, κατά ημερομηνία λήξης
            </span>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-t border-l border-gray-100">
            {cells.map(cell => {
              const key = dateKey(cell);
              const items = byDay[key] || [];
              const isCurrentMonth = cell.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(cell)}
                  className={`h-20 sm:h-24 border-r border-b border-gray-100 p-1 text-left align-top transition-colors overflow-hidden ${
                    isSelected ? 'bg-primary-50 ring-1 ring-inset ring-primary-400' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                        isToday
                          ? 'bg-primary-600 text-white'
                          : isCurrentMonth
                            ? 'text-gray-700'
                            : 'text-gray-300'
                      }`}
                    >
                      {cell.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[10px] font-semibold text-gray-400">{items.length}</span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {items.slice(0, 2).map(item => (
                      <div
                        key={dayItemKey(item)}
                        className="flex items-center gap-1 text-[10px] leading-3 text-gray-600 truncate"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dayItemDotClass(item)}`}
                        />
                        <span className="truncate">{dayItemLabel(item)}</span>
                      </div>
                    ))}
                    {items.length > 2 && (
                      <div className="text-[10px] text-gray-400">+{items.length - 2} ακόμη</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ραντεβού ημέρας */}
        <div className="card flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 capitalize">{selectedLabel}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {plural(selectedAppointments.length, 'ραντεβού', 'ραντεβού')} ·{' '}
                {plural(selectedVisits.length, 'επίσκεψη', 'επισκέψεις')} ·{' '}
                {plural(selectedFinance.length, 'κίνηση', 'κινήσεις')}
              </p>
            </div>
            <button
              onClick={() => openCreate(selectedDate)}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium shrink-0"
            >
              <Plus className="w-4 h-4" />
              Νέο
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Φόρτωση...
            </div>
          ) : selectedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="w-10 h-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-500">Δεν υπάρχουν καταχωρήσεις για αυτή την ημέρα.</p>
              <button
                onClick={() => openCreate(selectedDate)}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Προσθήκη ραντεβού
              </button>
            </div>
          ) : (
            <div className="space-y-5 overflow-y-auto max-h-[560px] pr-1">
              {selectedAppointments.length > 0 && (
                <section>
                  <SectionHeader color="bg-blue-400" label="Ραντεβού" count={selectedAppointments.length} />
                  <div className="space-y-3">
                    {selectedAppointments.map(item => item.appointment).map(a => (
                <div key={a.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {timeLabel(a.scheduledAt)}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            statusColors[a.status] || 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {statusLabels[a.status] || a.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 mt-1 truncate">
                        {a.patientName || 'Χωρίς όνομα ασθενούς'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {a.reason}
                        {a.durationMinutes ? ` · ${a.durationMinutes}′` : ''}
                      </p>
                      {a.notes && (
                        <p className="text-xs text-gray-400 mt-1 whitespace-pre-line">{a.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(a)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Επεξεργασία"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setActionError(null);
                          setPending({ type: 'delete', appointment: a });
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Διαγραφή"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {a.visitId ? (
                      <Link
                        href={`/visits?patientId=${encodeURIComponent(a.patientId)}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Stethoscope className="w-3.5 h-3.5" />
                        Άνοιγμα επίσκεψης
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          setActionError(null);
                          setPending({ type: 'convert', appointment: a });
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        Μετατροπή σε επίσκεψη
                      </button>
                    )}

                    {a.hapioBookingId ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1.5 rounded-lg"
                        title={`Hapio booking: ${a.hapioBookingId}`}
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        Hapio
                      </span>
                    ) : null}

                    {a.hapio?.lastError ? (
                      <button
                        onClick={() => pushAppointmentToHapio(a)}
                        disabled={hapioBusyId === a.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                        title={a.hapio.lastError}
                      >
                        {hapioBusyId === a.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Cloud className="w-3.5 h-3.5" />
                        )}
                        {a.hapioBookingId ? 'Επανασυγχρονισμός' : 'Επαναποστολή στο Hapio'}
                      </button>
                    ) : null}
                  </div>

                  {a.hapio?.lastError && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="break-words">Hapio: {a.hapio.lastError}</span>
                    </p>
                  )}
                </div>
              ))}
                  </div>
                </section>
              )}

              {selectedVisits.length > 0 && (
                <section>
                  <SectionHeader color="bg-violet-400" label="Επισκέψεις" count={selectedVisits.length} />
                  <div className="space-y-2">
                    {selectedVisits.map(({ visit }) => (
                      <div key={visit.id} className="rounded-lg border border-gray-200 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {visit.patientName || 'Χωρίς όνομα ασθενούς'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{visit.reason}</p>
                          </div>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              visitStatusColors[visit.status] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {visitStatusLabels[visit.status] || visit.status}
                          </span>
                        </div>
                        <Link
                          href={`/visits?patientId=${encodeURIComponent(visit.patientId)}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          Άνοιγμα επίσκεψης
                        </Link>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {selectedFinance.length > 0 && (
                <section>
                  <SectionHeader
                    color="bg-amber-500"
                    label="Κινήσεις ταμείου (λήξη)"
                    count={selectedFinance.length}
                  />
                  <div className="space-y-2">
                    {selectedFinance.map(({ entry }) => {
                      const dueDate = dateOnlyToDate(entry.dueDate);
                      const overdue =
                        entry.status !== 'settled' && entry.dueDate
                          ? String(entry.dueDate).slice(0, 10) < todayKey
                          : false;
                      const remaining = Math.max(0, entry.amount - (entry.paidAmount || 0));
                      return (
                        <div key={entry.id} className="rounded-lg border border-gray-200 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                                {entry.direction === 'receivable' ? (
                                  <ArrowDownLeft className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                )}
                                <span className="truncate">{entry.partyName}</span>
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {entry.description ||
                                  (entry.direction === 'receivable' ? 'Απαίτηση' : 'Οφειλή')}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                <span className="font-semibold">{currency.format(entry.amount)}</span>
                                {entry.status !== 'settled' && remaining > 0 && remaining !== entry.amount && (
                                  <span className="text-gray-500">
                                    {' '}
                                    · Υπόλοιπο {currency.format(remaining)}
                                  </span>
                                )}
                              </p>
                              <p
                                className={`text-[11px] mt-0.5 ${
                                  overdue ? 'text-red-600 font-medium' : 'text-gray-400'
                                }`}
                              >
                                Λήξη: {dueDate ? formatDate(dueDate) : '—'}
                                {overdue ? ' · Ληξιπρόθεσμη' : ''}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                financeStatusColors[entry.status] || 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {financeStatusLabels[entry.status] || entry.status}
                            </span>
                          </div>
                          <Link
                            href="/finance"
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Άνοιγμα ταμείου
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Φόρμα ραντεβού */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForm}
        >
          <div
            className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Επεξεργασία Ραντεβού' : 'Νέο Ραντεβού'}
              </h3>
              <button
                onClick={closeForm}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Κλείσιμο"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{formError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Ασθενής <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    value={formPatientSearch}
                    onChange={e => {
                      setFormPatientSearch(e.target.value);
                      setFormPatientId('');
                    }}
                    placeholder="Αναζήτηση με επώνυμο ή ΑΜΚΑ..."
                    className="input-field pl-9"
                  />
                </div>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {filteredFormPatients.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">
                      {patients.length === 0
                        ? 'Δεν υπάρχουν ασθενείς. Προσθέστε πρώτα ασθενή από τη σελίδα «Ασθενείς».'
                        : 'Δεν βρέθηκαν ασθενείς.'}
                    </p>
                  ) : (
                    filteredFormPatients.slice(0, 50).map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          formPatientId === p.id
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {p.lastName} {p.firstName}
                        {p.amka && <span className="ml-2 text-xs text-gray-400">ΑΜΚΑ {p.amka}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Ημερομηνία <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Ώρα <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Διάρκεια (λεπτά)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={formDuration}
                    onChange={e => setFormDuration(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Λόγος ραντεβού <span className="text-red-500">*</span>
                </label>
                <input
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  placeholder="π.χ. Επανέλεγχος, Λήψη δείγματος"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Κατάσταση</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value as AppointmentStatus)}
                  className="input-field"
                  disabled={editingConverted}
                >
                  <option value="scheduled">Προγραμματισμένο</option>
                  <option value="confirmed">Επιβεβαιωμένο</option>
                  <option value="cancelled">Ακυρωμένο</option>
                  <option value="no_show">Δεν προσήλθε</option>
                  {editingId && <option value="completed">Σε επίσκεψη</option>}
                </select>
                {editingConverted && (
                  <p className="text-xs text-gray-500 mt-1">
                    Το ραντεβού έχει μετατραπεί σε επίσκεψη, οπότε η κατάσταση δεν αλλάζει.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Σημειώσεις</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Προαιρετικές σημειώσεις"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary" disabled={saving}>
                  Ακύρωση
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Αποθήκευση' : 'Δημιουργία'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Επιβεβαίωση διαγραφής / μετατροπής */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busyId && setPending(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    pending.type === 'delete' ? 'bg-red-50' : 'bg-primary-50'
                  }`}
                >
                  {pending.type === 'delete' ? (
                    <Trash2 className="w-5 h-5 text-red-600" />
                  ) : (
                    <CalendarCheck className="w-5 h-5 text-primary-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {pending.type === 'delete' ? 'Διαγραφή ραντεβού' : 'Μετατροπή σε επίσκεψη'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {pending.type === 'delete'
                      ? pending.appointment.visitId
                        ? 'Το ραντεβού έχει μετατραπεί σε επίσκεψη. Το ραντεβού θα διαγραφεί, αλλά η επίσκεψη θα παραμείνει.'
                        : 'Το ραντεβού θα διαγραφεί οριστικά.'
                      : `Θα δημιουργηθεί επίσκεψη για τον/την ${
                          pending.appointment.patientName || 'ασθενή'
                        } στις ${new Date(pending.appointment.scheduledAt).toLocaleDateString(
                          'el-GR'
                        )} και το ραντεβού θα σημανθεί ως «Σε επίσκεψη».`}
                  </p>
                  {actionError && <p className="text-sm text-red-700 mt-2">{actionError}</p>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-4">
              <button
                onClick={() => setPending(null)}
                className="btn-secondary"
                disabled={Boolean(busyId)}
              >
                Ακύρωση
              </button>
              <button
                onClick={confirmPending}
                disabled={Boolean(busyId)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-60 ${
                  pending.type === 'delete'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {busyId && <Loader2 className="w-4 h-4 animate-spin" />}
                {pending.type === 'delete' ? 'Διαγραφή' : 'Μετατροπή'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Λίστα εργασίας — κέντρο αναφοράς */}
      {worklistOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-gray-900/60 p-4 print:static print:z-auto print:bg-white print:p-0">
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-5 py-3 print:hidden">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <ClipboardList className="w-5 h-5 text-primary-600" />
                  Λίστα εργασίας
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{selectedLabel}</p>
              </div>
              <button
                onClick={closeWorklist}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Κλείσιμο"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border-b border-gray-100 px-5 py-4 space-y-3 print:hidden">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Κέντρο αναφοράς
                </label>
                <select
                  value={worklistCenterId}
                  onChange={event => {
                    setWorklistCenterId(event.target.value);
                    setWorklist(null);
                    setWorklistError(null);
                  }}
                  className="input-field max-w-md"
                  disabled={centersLoading || worklistLoading}
                >
                  {centersLoading && <option value="">Φόρτωση κέντρων…</option>}
                  {!centersLoading && centers.length === 0 && (
                    <option value="">Δεν υπάρχουν ενεργά κέντρα</option>
                  )}
                  {centers.map(center => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Θα εκτυπωθούν τα παραπεμπτικά και οι εξετάσεις που στάλθηκαν στο κέντρο στις{' '}
                  {formatDate(selectedDate)}.
                </p>
              </div>

              {worklistError && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{worklistError}</p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={closeWorklist} className="btn-secondary" disabled={worklistLoading}>
                  Κλείσιμο
                </button>
                <button
                  onClick={buildWorklist}
                  disabled={worklistLoading || centersLoading || !worklistCenterId}
                  className="btn-primary flex items-center gap-2 disabled:opacity-60"
                >
                  {worklistLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ClipboardList className="w-4 h-4" />
                  )}
                  Δημιουργία λίστας
                </button>
                {worklist && worklist.totals.exams > 0 && (
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white bg-gray-800 hover:bg-gray-900 transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    Εκτύπωση
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 print:p-0 print:overflow-visible">
              {!worklist ? (
                <div className="flex flex-col items-center justify-center py-12 text-center print:hidden">
                  <Building2 className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-500">
                    Επιλέξτε κέντρο αναφοράς και πατήστε «Δημιουργία λίστας».
                  </p>
                </div>
              ) : worklist.totals.exams === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-500">
                    Δεν βρέθηκαν παραπεμπτικά που στάλθηκαν στο κέντρο{' '}
                    {worklist.center.name} στις {formatDate(selectedDate)}.
                  </p>
                </div>
              ) : (
                <div id="worklist-print-area">
                  <div className="mb-4">
                    <h1 className="text-lg font-bold text-gray-900">
                      Λίστα εργασίας — {worklist.center.name}
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ημερομηνία: {formatDate(selectedDate)} · Παραπεμπτικά:{' '}
                      {worklist.totals.referrals} · Εξετάσεις: {worklist.totals.exams} · Εκτύπωση:{' '}
                      {new Date().toLocaleString('el-GR')}
                    </p>
                  </div>

                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-1.5 py-1 text-left">#</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Ασθενής</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Barcode</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Εντολή</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Ώρα</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Κωδικός</th>
                        <th className="border border-gray-300 px-1.5 py-1 text-left">Εξέταση</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklist.referrals.flatMap((referral, referralIndex) =>
                        referral.exams.map((exam, examIndex) => (
                          <tr
                            key={`${referral.referralId}-${exam.id}`}
                            className="align-top"
                          >
                            {examIndex === 0 && (
                              <>
                                <td
                                  rowSpan={referral.exams.length}
                                  className="border border-gray-300 px-1.5 py-1 text-center"
                                >
                                  {referralIndex + 1}
                                </td>
                                <td
                                  rowSpan={referral.exams.length}
                                  className="border border-gray-300 px-1.5 py-1"
                                >
                                  {referral.patientName || '—'}
                                </td>
                                <td
                                  rowSpan={referral.exams.length}
                                  className="border border-gray-300 px-1.5 py-1 font-mono"
                                >
                                  {referral.barcode || '—'}
                                </td>
                                <td
                                  rowSpan={referral.exams.length}
                                  className="border border-gray-300 px-1.5 py-1 font-mono"
                                >
                                  {referral.orderNo || '—'}
                                </td>
                                <td
                                  rowSpan={referral.exams.length}
                                  className="border border-gray-300 px-1.5 py-1 whitespace-nowrap"
                                >
                                  {referral.sentAt
                                    ? new Date(referral.sentAt).toLocaleTimeString('el-GR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '—'}
                                </td>
                              </>
                            )}
                            <td className="border border-gray-300 px-1.5 py-1 font-mono">
                              {exam.code || '—'}
                            </td>
                            <td className="border border-gray-300 px-1.5 py-1">
                              {exam.name}
                              {exam.barcode ? ` (${exam.barcode})` : ''}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={7} className="border border-gray-300 px-1.5 py-1">
                          Σύνολο: {plural(worklist.totals.referrals, 'παραπεμπτικό', 'παραπεμπτικά')} ·{' '}
                          {plural(worklist.totals.exams, 'εξέταση', 'εξετάσεις')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function SectionHeader({ color, label, count }: { color: string; label: string; count: number }) {  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
      <span className="text-gray-300">({count})</span>
    </h3>
  );
}

function TypeToggle({
  active,
  onClick,
  dotClass,
  label,
}: {
  active: boolean;
  onClick: () => void;
  dotClass: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          : 'border-gray-200 bg-gray-100 text-gray-400'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${dotClass} ${active ? '' : 'opacity-40'}`} />
      {label}
    </button>
  );
}
