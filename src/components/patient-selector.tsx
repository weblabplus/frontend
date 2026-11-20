'use client';

import { useState, useEffect } from 'react';
import { User, Plus, Loader2, Search, X, UserPlus, Calendar, Ruler, Weight, Hash } from 'lucide-react';
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

interface PatientSelectorProps {
  value: string;
  onChange: (patientId: string, patient?: Patient) => void;
}

export function PatientSelector({ value, onChange }: PatientSelectorProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New patient form state
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGender, setNewGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [newAmka, setNewAmka] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedPatient = patients.find(p => p.id === value);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const data = await api.getPatients();
      setPatients(data.patients || []);
    } catch (err) {
      console.warn('Failed to load patients:', err);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePatient = async () => {
    if (!newFirstName || !newLastName || !newDob) {
      setError('Συμπληρώστε όνομα, επώνυμο και ημ. γέννησης');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const patient = {
        id: `patient_${Date.now()}`,
        firstName: newFirstName,
        lastName: newLastName,
        dateOfBirth: newDob,
        gender: newGender,
        amka: newAmka || undefined,
      };

      const data = await api.createPatient(patient);
      const created = data.patient;

      setPatients(prev => [...prev, created]);
      onChange(created.id, created);
      setShowNewForm(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα δημιουργίας ασθενούς');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewFirstName('');
    setNewLastName('');
    setNewDob('');
    setNewGender('MALE');
    setNewAmka('');
    setError(null);
  };

  const filteredPatients = search
    ? patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
      )
    : patients;

  const genderLabel = (g: string) => {
    const v = (g || '').toUpperCase();
    return v === 'MALE' ? '♂' : v === 'FEMALE' ? '♀' : '⚧';
  };

  return (
    <div className="space-y-3">
      {/* Selected Patient Display */}
      {selectedPatient ? (
        <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {selectedPatient.firstName} {selectedPatient.lastName}
              </p>
              <p className="text-xs text-gray-500">
                {genderLabel(selectedPatient.gender)} · {selectedPatient.dateOfBirth}
                {selectedPatient.amka && <span className="ml-1">· ΑΜΚΑ: {selectedPatient.amka}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => onChange('')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Αλλαγή ασθενούς"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <>
          {/* Search and Dropdown */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση ασθενούς..."
              className="input-field pl-10 pr-4"
            />
          </div>

          {/* Patient List */}
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Φόρτωση...</span>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                {search ? 'Δεν βρέθηκαν ασθενείς' : 'Δεν υπάρχουν ασθενείς'}
              </div>
            ) : (
              filteredPatients.map(patient => (
                <button
                  key={patient.id}
                  onClick={() => onChange(patient.id, patient)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {genderLabel(patient.gender)} · {patient.dateOfBirth}
                      {patient.amka && <span className="ml-1">· {patient.amka}</span>}
                    </p>
                  </div>
                </button>
              ))
            )}

            {/* Add New Patient Button */}
            <button
              onClick={() => { setShowNewForm(!showNewForm); resetForm(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary-50 transition-colors text-primary-600"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Νέος ασθενής</span>
            </button>
          </div>
        </>
      )}

      {/* New Patient Form */}
      {showNewForm && (
        <div className="border border-primary-200 rounded-lg p-4 bg-primary-50/50 space-y-3">
          <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary-600" />
            Νέος Ασθενής
          </h4>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Όνομα *</label>
              <input
                type="text"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="input-field text-sm"
                placeholder="π.χ. Ιωάννης"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Επώνυμο *</label>
              <input
                type="text"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="input-field text-sm"
                placeholder="π.χ. Παπαδόπουλος"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                Ημ. Γέννησης *
              </label>
              <input
                type="date"
                value={newDob}
                onChange={(e) => setNewDob(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Φύλο</label>
              <select
                value={newGender}
                onChange={(e) => setNewGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                className="input-field text-sm"
              >
                <option value="MALE">♂ Άνδρας</option>
                <option value="FEMALE">♀ Γυναίκα</option>
                <option value="OTHER">⚧ Άλλο</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Hash className="w-3 h-3 inline mr-1" />
                ΑΜΚΑ
              </label>
              <input
                type="text"
                value={newAmka}
                onChange={(e) => setNewAmka(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="input-field text-sm"
                placeholder="11 ψηφία"
                maxLength={11}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreatePatient}
              disabled={creating}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {creating ? 'Δημιουργία...' : 'Δημιουργία'}
            </button>
            <button
              onClick={() => { setShowNewForm(false); resetForm(); }}
              className="btn-secondary text-sm"
            >
              Άκυρο
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
