'use client';

export default function ResultsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">📊 Αποτελέσματα</h1>
      <p className="text-gray-500 mb-8">
        Αναζητήστε και δείτε αναλυμένα εργαστηριακά αποτελέσματα.
      </p>

      <div className="card">
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">
            🔍 Ανεβάστε εξετάσεις από την σελίδα Upload για να δείτε αποτελέσματα εδώ.
          </p>
        </div>
      </div>
    </div>
  );
}
