'use client';

import { Activity, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { NewsFeed } from '@/components/news-feed';

export default function HomePage() {
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
