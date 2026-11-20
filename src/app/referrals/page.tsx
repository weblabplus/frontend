'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, User, Calendar, Trash2, AlertCircle, Search, Pencil, Save, X, FileText, Stethoscope, ChevronDown, ChevronRight, ExternalLink, Building2, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';

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
  createdAt: string;
  updatedAt: string;
}

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

const specialties = [
  'Καρδιολογία', 'Παθολογία', 'Ορθοπεδική', 'Νευρολογία', 'Ακτινολογία',
  'Δερματολογία', 'Οφθαλμολογία', 'ΩΡΛ', 'Γαστρεντερολογία', 'Πνευμονολογία',
  'Ενδοκρινολογία', 'Αιματολογία', 'Ουρολογία', 'Γυναικολογία', 'Ψυχιατρική',
  'Φυσικοθεραπεία', 'Άλλο',
];

export default function ReferralsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expandedVisits, setExpandedVisits] = useState<Set<string>>(new Set());

  // Create form
  const [selectedVisitId, setSelectedVisitId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [reason, setReason] = useState('');
  const [hospital, setHospital] = useState('');
  const [referralDate, setReferralDate] = useState('');
  const [status, setStatus] = useState<Referral['status']>('pending');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editHospital, setEditHospital] = useState('');
  const [editReferralDate, setEditReferralDate] = useState('');
  const [editStatus, setEditStatus] = useState<Referral['status']>('pending');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [visitsData, referralsData] = await Promise.all([
        api.getVisits(),
        api.getReferrals(),
      ]);
      setVisits(visitsData.visits || []);
      setReferrals(referralsData.referrals || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const referralsByVisit = useMemo(() => {
    const map: Record<string, Referral[]> = {};
    for (const r of referrals) {
      if (!map[r.visitId]) map[r.visitId] = [];
      map[r.visitId].push(r);
    }
    return map;
  }, [referrals]);

  const resetForm = () => {
    setSelectedVisitId('');
    setSelectedPatientId('');
    setSpecialty('');
    setReason('');
    setHospital('');
    setReferralDate('');
    setStatus('pending');
    setNotes('');
    setFormError(null);
  };

  const handleVisitSelect = (visitId: string) => {
    setSelectedVisitId(visitId);
    const visit = visits.find(v => v.id === visitId);
    if (visit) {
      setSelectedPatientId(visit.patientId);
      setReferralDate(visit.visitDate);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedVisitId || !specialty || !reason || !referralDate) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία (Επίσκεψη, Ειδικότητα, Λόγος, Ημερομηνία)');
      return;
    }

    try {
      setCreating(true);
      const visit = visits.find(v => v.id === selectedVisitId);
      const data = await api.createReferral({
        visitId: selectedVisitId,
        patientId: selectedPatientId,
        patientName: visit?.patientName || '',
        visitReason: visit?.reason || '',
        specialty,
        reason,
        hospital: hospital || undefined,
        referralDate,
        status,
        notes: notes || undefined,
      });
      setReferrals(prev => [data.referral, ...prev]);
      setExpandedVisits(prev => new Set([...prev, selectedVisitId]));
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (referral: Referral) => {
    setEditingId(referral.id);
    setEditSpecialty(referral.specialty);
    setEditReason(referral.reason);
    setEditHospital(referral.hospital || '');
    setEditReferralDate(referral.referralDate);
    setEditStatus(referral.status);
    setEditNotes(referral.notes || '');
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingId || !editSpecialty || !editReason || !editReferralDate) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία');
      return;
    }

    try {
      setSaving(true);
      const data = await api.updateReferral(editingId, {
        specialty: editSpecialty,
        reason: editReason,
        hospital: editHospital || null,
        referralDate: editReferralDate,
        status: editStatus,
        notes: editNotes || null,
      });
      setReferrals(prev => prev.map(r => (r.id === editingId ? data.referral : r)));
      cancelEdit();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, status?: string) => {
    // Εκτελεσμένα παραπεμπτικά δεν διαγράφονται
    if (status === 'partially_executed' || status === 'fully_executed') {
      setError(
        'Το παραπεμπτικό είναι εκτελεσμένο στον φορέα και δεν μπορεί να διαγραφεί. ' +
          'Ακυρώστε πρώτα την εκτέλεση.'
      );
      return;
    }
    if (!confirm('Είστε βέβαιοι ότι θέλετε να διαγράψετε αυτό το παραπεμπτικό;')) return;
    try {
      await api.deleteReferral(id);
      setReferrals(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancelExecution = async (referral: Referral) => {
    const isFull = referral.status === 'fully_executed';
    const ok = confirm(
      isFull
        ? 'Ακύρωση ολικής εκτέλεσης του παραπεμπτικού στον φορέα (ΗΔΙΚΑ);'
        : 'Ακύρωση μερικής εκτέλεσης του παραπεμπτικού στον φορέα (ΗΔΙΚΑ);'
    );
    if (!ok) return;

    setCancelingId(referral.id);
    setError('');
    try {
      await api.cancelReferralExecution(referral.id);
      setReferrals(prev =>
        prev.map(r => (r.id === referral.id ? { ...r, status: 'pending' as Referral['status'] } : r))
      );
    } catch (err: any) {
      setError(
        err.code === 'RESULTS_ENTERED' || err.status === 409
          ? 'Δεν είναι δυνατή η ακύρωση: έχουν ήδη καταχωρηθεί αποτελέσματα στις εξετάσεις.'
          : err.message || 'Αποτυχία ακύρωσης εκτέλεσης.'
      );
    } finally {
      setCancelingId(null);
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

  const filteredVisits = search
    ? visits.filter(v =>
        (v.patientName || '').toLowerCase().includes(search.toLowerCase()) ||
        v.reason.toLowerCase().includes(search.toLowerCase()) ||
        (v.diagnosis && v.diagnosis.toLowerCase().includes(search.toLowerCase())) ||
        referralsByVisit[v.id]?.some(r =>
          r.specialty.toLowerCase().includes(search.toLowerCase()) ||
          r.reason.toLowerCase().includes(search.toLowerCase()) ||
          (r.hospital && r.hospital.toLowerCase().includes(search.toLowerCase()))
        )
      )
    : visits;

  const refCountByVisit = (visitId: string) => referralsByVisit[visitId]?.length || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary-600" />
            Παραπεμπτικά
          </h1>
          <p className="text-gray-500 mt-1">Διαχείριση παραπεμπτικών ανά επίσκεψη</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          disabled={visits.length === 0}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={visits.length === 0 ? 'Απαιτείται πρώτα καταχώρηση επίσκεψης' : ''}
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Απόκρυψη φόρμας' : 'Νέο Παραπεμπτικό'}
        </button>
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

      {/* No visits warning */}
      {!loading && visits.length === 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-medium">Δεν υπάρχουν επισκέψεις</p>
            <p>Πρέπει πρώτα να καταχωρήσετε μια επίσκεψη από την καρτέλα «Επισκέψεις» για να δημιουργήσετε παραπεμπτικά.</p>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Νέο Παραπεμπτικό
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Stethoscope className="w-3.5 h-3.5 inline mr-1" />
                  Επίσκεψη *
                </label>
                <select
                  value={selectedVisitId}
                  onChange={(e) => handleVisitSelect(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">-- Επιλέξτε επίσκεψη --</option>
                  {visits.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.patientName || 'Άγνωστος'} — {new Date(v.visitDate).toLocaleDateString('el-GR')} — {v.reason}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Κάθε παραπεμπτικό πρέπει να συνδέεται με μια επίσκεψη</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ειδικότητα *</label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">-- Επιλέξτε ειδικότητα --</option>
                  {specialties.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Κατάσταση</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Referral['status'])}
                  className="input-field"
                >
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Ημερομηνία Παραπεμπτικού *
                </label>
                <input
                  type="date"
                  value={referralDate}
                  onChange={(e) => setReferralDate(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-3.5 h-3.5 inline mr-1" />
                  Νοσοκομείο / Κλινική
                </label>
                <input
                  type="text"
                  value={hospital}
                  onChange={(e) => setHospital(e.target.value)}
                  className="input-field"
                  placeholder="π.χ. Γενικό Νοσοκομείο Αθηνών"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Λόγος Παραπομπής *</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input-field"
                  placeholder="π.χ. Υπερηχογράφημα καρδιάς, Αξονική θώρακος"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Σημειώσεις</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-field min-h-[70px]"
                  placeholder="Κλινικές πληροφορίες, ευρήματα..."
                  rows={2}
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
                {creating ? 'Δημιουργία...' : 'Δημιουργία'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Άκυρο
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-9"
          placeholder="Αναζήτηση σε επισκέψεις και παραπεμπτικά..."
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Φόρτωση δεδομένων...
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

      {/* Visits with nested Referrals */}
      {!loading && filteredVisits.map(visit => {
        const visitReferrals = referralsByVisit[visit.id] || [];
        const isExpanded = expandedVisits.has(visit.id) || search.length > 0;

        return (
          <div key={visit.id} className="mb-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Visit Header */}
            <button
              onClick={() => toggleVisit(visit.id)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <Stethoscope className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {visit.patientName || 'Άγνωστος'}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visitStatusColors[visit.status]}`}>
                      {visitStatusLabels[visit.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(visit.visitDate).toLocaleDateString('el-GR')}
                    </span>
                    <span>·</span>
                    <span>{visit.reason}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${refCountByVisit(visit.id) > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                  {refCountByVisit(visit.id)} {refCountByVisit(visit.id) === 1 ? 'παραπεμπτικό' : 'παραπεμπτικά'}
                </span>
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </div>
            </button>

            {/* Expanded: Referrals list */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                {visitReferrals.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    Δεν υπάρχουν παραπεμπτικά για αυτή την επίσκεψη
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {visitReferrals.map(referral => (
                      <div key={referral.id} className="p-4 pl-12">
                        {editingId === referral.id ? (
                          /* Edit Mode */
                          <form onSubmit={handleUpdate} className="space-y-3">
                            {formError && (
                              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {formError}
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Ειδικότητα *</label>
                                <select value={editSpecialty} onChange={(e) => setEditSpecialty(e.target.value)} className="input-field text-sm">
                                  <option value="">-- Επιλέξτε --</option>
                                  {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Κατάσταση</label>
                                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Referral['status'])} className="input-field text-sm">
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
                                <input type="date" value={editReferralDate} onChange={(e) => setEditReferralDate(e.target.value)} className="input-field text-sm" required />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Νοσοκομείο</label>
                                <input type="text" value={editHospital} onChange={(e) => setEditHospital(e.target.value)} className="input-field text-sm" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Λόγος *</label>
                                <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} className="input-field text-sm" required />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Σημειώσεις</label>
                                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="input-field text-sm min-h-[60px]" rows={2} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors text-sm disabled:opacity-50">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Αποθήκευση
                              </button>
                              <button type="button" onClick={cancelEdit} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm">
                                <X className="w-4 h-4" /> Άκυρο
                              </button>
                            </div>
                          </form>
                        ) : (
                          /* View Mode */
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                                <FileText className="w-4 h-4 text-purple-600" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-gray-800 text-sm">{referral.specialty}</p>
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
                            <div className="flex items-center gap-1 shrink-0 ml-4">
                              {(referral.status === 'partially_executed' ||
                                referral.status === 'fully_executed') && (
                                <button
                                  onClick={() => handleCancelExecution(referral)}
                                  disabled={cancelingId === referral.id}
                                  className="p-1.5 text-gray-300 hover:text-amber-500 transition-colors rounded-lg hover:bg-amber-50 disabled:opacity-50"
                                  title={
                                    referral.status === 'fully_executed'
                                      ? 'Ακύρωση εκτέλεσης'
                                      : 'Ακύρωση μερικής εκτέλεσης'
                                  }
                                >
                                  {cancelingId === referral.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              <button onClick={() => startEdit(referral)} className="p-1.5 text-gray-300 hover:text-primary-500 transition-colors rounded-lg hover:bg-primary-50" title="Επεξεργασία">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(referral.id, referral.status)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50" title="Διαγραφή">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
