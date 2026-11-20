'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, User, Calendar, Trash2, Users, AlertCircle, Search, Ruler, Weight, Pencil, Save, X, Hash, ClipboardList, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  status?: string;
  height?: number;
  weight?: number;
  amka?: string;
}

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [amka, setAmka] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [editAmka, setEditAmka] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPatients();
      setPatients(data.patients || []);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα φόρτωσης ασθενών');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !dateOfBirth) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία');
      return;
    }

    setCreating(true);
    setFormError(null);

    try {
      const patient = {
        id: `patient_${Date.now()}`,
        firstName,
        lastName,
        dateOfBirth,
        gender,
        amka: amka || undefined,
      };

      const data = await api.createPatient(patient);
      setPatients(prev => [data.patient, ...prev]);
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setFormError(err.message || 'Σφάλμα δημιουργίας');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτόν τον ασθενή;')) return;

    try {
      await api.deletePatient(id);
      setPatients(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message || 'Σφάλμα διαγραφής');
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setDateOfBirth('');
    setGender('MALE');
    setAmka('');
    setFormError(null);
  };

  /** Μετάβαση στις επισκέψεις φιλτραρισμένες για τον επιλεγμένο ασθενή */
  const openPatientVisits = (patientId: string) => {
    router.push(`/visits?patientId=${encodeURIComponent(patientId)}`);
  };

  const startEdit = (patient: Patient) => {
    setEditingId(patient.id);
    setEditFirstName(patient.firstName);
    setEditLastName(patient.lastName);
    setEditDateOfBirth(patient.dateOfBirth);
    setEditGender((patient.gender || '').toUpperCase() as Patient['gender']);
    setEditAmka(patient.amka || '');
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    if (!editFirstName || !editLastName || !editDateOfBirth) {
      setFormError('Συμπληρώστε όλα τα υποχρεωτικά πεδία');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const data = await api.updatePatient(editingId, {
        firstName: editFirstName,
        lastName: editLastName,
        dateOfBirth: editDateOfBirth,
        gender: editGender,
        amka: editAmka || null,
      });
      setPatients(prev => prev.map(p => p.id === editingId ? data.patient : p));
      cancelEdit();
    } catch (err: any) {
      setFormError(err.message || 'Σφάλμα ενημέρωσης');
    } finally {
      setSaving(false);
    }
  };

  const filteredPatients = search
    ? patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        (p.amka && p.amka.includes(search))
      )
    : patients;

  const genderLabel = (g: string) => {
    const v = (g || '').toUpperCase();
    return v === 'MALE' ? '♂ Άνδρας' : v === 'FEMALE' ? '♀ Γυναίκα' : '⚧ Άλλο';
  };

  const calculateAge = (dob: string) => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const formatAge = (dob: string) => {
    const age = calculateAge(dob);
    return age === null ? '—' : `${age} ετών`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-600" />
            Ασθενείς
          </h1>
          <p className="text-gray-500 mt-1">
            Διαχείριση του αρχείου ασθενών σας
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); resetForm(); cancelEdit(); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Νέος Ασθενής
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={loadPatients}
              className="text-xs text-red-600 underline mt-1 hover:text-red-800"
            >
              Δοκιμάστε ξανά
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card mb-6 border-primary-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserPlusIcon className="w-5 h-5 text-primary-600" />
            Νέος Ασθενής
          </h3>

          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Όνομα *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field"
                  placeholder="π.χ. Ιωάννης"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Επώνυμο *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field"
                  placeholder="π.χ. Παπαδόπουλος"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Ημερομηνία Γέννησης *
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Φύλο</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                  className="input-field"
                >
                  <option value="MALE">♂ Άνδρας</option>
                  <option value="FEMALE">♀ Γυναίκα</option>
                  <option value="OTHER">⚧ Άλλο</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Hash className="w-3.5 h-3.5 inline mr-1" />
                  ΑΜΚΑ
                </label>
                <input
                  type="text"
                  value={amka}
                  onChange={(e) => setAmka(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="input-field"
                  placeholder="11 ψηφία"
                  maxLength={11}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {creating ? 'Δημιουργία...' : 'Δημιουργία'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="btn-secondary"
              >
                Άκυρο
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Αναζήτηση ασθενούς..."
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">
          {filteredPatients.length} {filteredPatients.length === 1 ? 'ασθενής' : 'ασθενείς'}
        </span>
        {search && patients.length !== filteredPatients.length && (
          <span className="text-xs text-gray-400">
            (φιλτραρισμένο από {patients.length})
          </span>
        )}
      </div>

      {/* Patient List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <span className="ml-3 text-gray-500">Φόρτωση ασθενών...</span>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          {search ? (
            <>
              <h3 className="text-lg font-medium text-gray-600">Δεν βρέθηκαν ασθενείς</h3>
              <p className="text-sm text-gray-400 mt-1">Δοκιμάστε διαφορετικό όρο αναζήτησης</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-gray-600">Δεν υπάρχουν ασθενείς</h3>
              <p className="text-sm text-gray-400 mt-1">Προσθέστε τον πρώτο σας ασθενή</p>
              <button
                onClick={() => setShowForm(true)}
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Νέος Ασθενής
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPatients.map(patient => (
            <div
              key={patient.id}
              className="card hover:shadow-md transition-shadow"
            >
              {editingId === patient.id ? (
                /* Edit Mode */
                <form onSubmit={handleUpdate}>
                  {formError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">{formError}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Όνομα *</label>
                      <input
                        type="text"
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Επώνυμο *</label>
                      <input
                        type="text"
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ημ. Γέννησης *</label>
                      <input
                        type="date"
                        value={editDateOfBirth}
                        onChange={(e) => setEditDateOfBirth(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Φύλο</label>
                      <select
                        value={editGender}
                        onChange={(e) => setEditGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                        className="input-field"
                      >
                        <option value="MALE">♂ Άνδρας</option>
                        <option value="FEMALE">♀ Γυναίκα</option>
                        <option value="OTHER">⚧ Άλλο</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Hash className="w-3.5 h-3.5 inline mr-1" />
                        ΑΜΚΑ
                      </label>
                      <input
                        type="text"
                        value={editAmka}
                        onChange={(e) => setEditAmka(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        className="input-field"
                        placeholder="11 ψηφία"
                        maxLength={11}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn-primary flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Άκυρο
                    </button>
                  </div>
                </form>
              ) : (
                /* View Mode */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => openPatientVisits(patient.id)}
                        className="font-medium text-gray-900 hover:text-primary-600 transition-colors text-left"
                        title="Προβολή επισκέψεων ασθενούς"
                      >
                        {patient.firstName} {patient.lastName}
                      </button>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span>{genderLabel(patient.gender)}</span>
                        {patient.amka && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {patient.amka}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {patient.dateOfBirth || '—'} ({formatAge(patient.dateOfBirth)})
                        </span>
                        {patient.height && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Ruler className="w-3 h-3" />
                              {patient.height} cm
                            </span>
                          </>
                        )}
                        {patient.weight && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Weight className="w-3 h-3" />
                              {patient.weight} kg
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {patient.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openPatientVisits(patient.id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors rounded-lg"
                      title="Προβολή επισκέψεων ασθενούς"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span className="hidden sm:inline">Επισκέψεις</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => startEdit(patient)}
                      className="p-2 text-gray-300 hover:text-primary-500 transition-colors rounded-lg hover:bg-primary-50"
                      title="Επεξεργασία ασθενούς"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(patient.id)}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                      title="Διαγραφή ασθενούς"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline icon component for UserPlus */
function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}
