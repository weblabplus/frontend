'use client';

import { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, User } from 'lucide-react';
import { getAuthToken } from '@/lib/auth';
import { PatientSelector } from '@/components/patient-selector';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('csv');
  const [patientId, setPatientId] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePatientChange = (id: string, patient?: any) => {
    setPatientId(id);
    setSelectedPatient(patient || null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      if (patientId) formData.append('patientId', patientId);

      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.errors?.map((e: any) => e.message).join(', ') || 'Σφάλμα κατά το upload');
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Σφάλμα σύνδεσης με τον server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">📤 Upload Εργαστηριακών Εξετάσεων</h1>
      <p className="text-gray-500 mb-8">
        Ανεβάστε αρχεία CSV, JSON, HL7 ή επικολλήστε δεδομένα για ανάλυση.
      </p>

      <div className="card mb-6">
        {/* Format Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Format Αρχείου</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="input-field"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="hl7">HL7</option>
          </select>
        </div>

        {/* Patient Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
            <User className="w-4 h-4" />
            Εξεταζόμενος
          </label>
          <PatientSelector value={patientId} onChange={handlePatientChange} />
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Επιλογή Αρχείου</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors cursor-pointer">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".csv,.json,.txt,.hl7"
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {file ? (
                <div>
                  <p className="text-primary-600 font-medium">{file.name}</p>
                  <p className="text-sm text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-600 font-medium">Κάντε κλικ για επιλογή αρχείου</p>
                  <p className="text-sm text-gray-400 mt-1">ή σύρετε το αρχείο εδώ</p>
                </div>
              )}
            </label>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Upload className="w-5 h-5" />
          )}
          {loading ? 'Ανέβασμα...' : 'Ανέβασμα & Ανάλυση'}
        </button>
      </div>

      {/* Results */}
      {error && (
        <div className="card border-l-4 border-red-500 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">Σφάλμα</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {result && result.success && (
        <div className="card border-l-4 border-green-500">
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-green-800">Επιτυχές Parsing</h3>
              <p className="text-sm text-green-600">
                {result.metadata?.parsedLines || 0} αποτελέσματα αναγνώστηκαν επιτυχώς
                {result.metadata?.parseDuration && ` (σε ${result.metadata.parseDuration}ms)`}
              </p>
            </div>
          </div>

          {result.results && result.results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2">Εξέταση</th>
                    <th className="text-left p-2">Τιμή</th>
                    <th className="text-left p-2">Μονάδα</th>
                    <th className="text-left p-2">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.test?.name || 'Άγνωστη'}</td>
                      <td className="p-2 font-mono">{r.value}</td>
                      <td className="p-2 text-gray-500">{r.unit}</td>
                      <td className="p-2">
                        <span className={r.isCritical ? 'badge-critical' : r.isAbnormal ? 'badge-warning' : 'badge-success'}>
                          {r.isCritical ? 'Κρίσιμο' : r.isAbnormal ? 'Παθολογικό' : 'Φυσιολογικό'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.results.length > 20 && (
                <p className="text-sm text-gray-400 mt-2">...και {result.results.length - 20} ακόμα αποτελέσματα</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
