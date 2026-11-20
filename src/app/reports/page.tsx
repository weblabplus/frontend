'use client';

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">📑 Διαγνωστικές Αναφορές</h1>
      <p className="text-gray-500 mb-8">
        Δημιουργήστε και εξάγετε διαγνωστικές αναφορές σε HTML, JSON ή CSV.
      </p>

      <div className="card">
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">
            📝 Εκτελέστε ανάλυση για να δημιουργηθούν αναφορές εδώ.
          </p>
        </div>
      </div>
    </div>
  );
}
