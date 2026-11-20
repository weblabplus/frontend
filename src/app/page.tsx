'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Upload, FileText, TrendingUp } from 'lucide-react';
import { NewsFeed } from '@/components/news-feed';

export default function HomePage() {
  const [stats] = useState({
    totalTests: 0,
    normal: 0,
    abnormal: 0,
    critical: 0,
  });

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🏥 Ιατρική Διαγνωστική Εφαρμογή
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Ανεβάστε εργαστηριακές εξετάσεις και λάβετε αυτόματη ανάλυση με
          συνδυασμό ιατρικών κανόνων και τεχνητής νοημοσύνης.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <a
          href="/upload"
          className="card hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary-50 group-hover:bg-primary-100 transition-colors">
              <Upload className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Upload Εξετάσεων</h3>
              <p className="text-sm text-gray-500">
                Ανεβάστε CSV, JSON, HL7 ή PDF αρχεία με εργαστηριακά αποτελέσματα.
              </p>
            </div>
          </div>
        </a>

        <a
          href="/results"
          className="card hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Αποτελέσματα</h3>
              <p className="text-sm text-gray-500">
                Δείτε και αναλύστε τα αποτελέσματα των εξετάσεων με λεπτομερή ερμηνεία.
              </p>
            </div>
          </div>
        </a>

        <a
          href="/reports"
          className="card hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-purple-50 group-hover:bg-purple-100 transition-colors">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Αναφορές</h3>
              <p className="text-sm text-gray-500">
                Δημιουργήστε διαγνωστικές αναφορές σε HTML, JSON ή CSV format.
              </p>
            </div>
          </div>
        </a>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary-600">{stats.totalTests}</div>
          <div className="text-sm text-gray-500 mt-1">Σύνολο Εξετάσεων</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-600">{stats.normal}</div>
          <div className="text-sm text-gray-500 mt-1">Φυσιολογικές</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-yellow-600">{stats.abnormal}</div>
          <div className="text-sm text-gray-500 mt-1">Παθολογικές</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-600">{stats.critical}</div>
          <div className="text-sm text-gray-500 mt-1">Κρίσιμες</div>
        </div>
      </div>

      {/* Features */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Δυνατότητες</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureItem
            icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
            title="Rule-Based Ανάλυση"
            description="Ιατρικοί κανόνες για άμεσο flagging κρίσιμων τιμών και παθολογικών ευρημάτων."
          />
          <FeatureItem
            icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
            title="Trend Analysis"
            description="Διαχρονική ανάλυση τάσεων για παρακολούθηση της πορείας των εξετάσεων."
          />
          <FeatureItem
            icon={<AlertTriangle className="w-5 h-5 text-orange-500" />}
            title="Anomaly Detection"
            description="Εντοπισμός ασυνήθιστων τιμών με στατιστικές μεθόδους (z-score, IQR)."
          />
          <FeatureItem
            icon={<Activity className="w-5 h-5 text-purple-500" />}
            title="Pattern Recognition"
            description="Αναγνώριση ιατρικών μοτίβων (ηπατική βλάβη, αναιμία, μεταβολικό σύνδρομο κ.α.)."
          />
        </div>
      </div>

      {/* Medical news (GNews) */}
      <NewsFeed />

      {/* Disclaimer */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          ⚠️ <strong>Ιατρική Αποποίηση:</strong> Αυτή η εφαρμογή παρέχεται μόνο για ερευνητικούς
          και εκπαιδευτικούς σκοπούς. Δεν υποκαθιστά την επαγγελματική ιατρική γνωμάτευση.
          Πάντα να συμβουλεύεστε τον ιατρό σας για ερμηνεία εργαστηριακών αποτελεσμάτων.
        </p>
      </div>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h3 className="font-medium text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
    </div>
  );
}
