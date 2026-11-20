'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';

/** Προεπιλεγμένο διάστημα ανανέωσης: 1 ώρα (το server κάνει το πολύ 1 αίτημα/ώρα στο GNews). */
const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: string;
}

interface NewsResponse {
  enabled: boolean;
  articles: NewsArticle[];
  fetchedAt: string | null;
}

function formatPublishedAt(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('el-GR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function NewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch('/api/news', { cache: 'no-store' });
      if (!res.ok) return;

      const data = (await res.json()) as NewsResponse;
      setEnabled(data.enabled !== false);
      setFetchedAt(data.fetchedAt ?? null);
      // Ώστε να διατηρούνται τα προηγούμενα νέα αν το αίτημα αποτύχει ή επιστρέψει κενά.
      if (Array.isArray(data.articles)) setArticles(data.articles);
    } catch {
      // Σφάλματα δικτύου/quota αγνοούνται σιωπηλά — κρατάμε ό,τι έχουμε ήδη.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(), DEFAULT_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!enabled) return null;

  return (
    <section className="card mt-12">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <Newspaper className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Ιατρικά Νέα από την Ελλάδα</h2>
            <p className="text-sm text-gray-500 mt-1">
              Ενημέρωση στα ελληνικά από το GNews · αυτόματη ανανέωση κάθε ώρα
              {fetchedAt ? ` · τελευταία λήψη ${formatPublishedAt(fetchedAt)}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors disabled:opacity-50"
          title="Ανανέωση ειδήσεων"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Ανανέωση</span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 overflow-hidden animate-pulse">
              <div className="aspect-video bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-full bg-gray-100 rounded" />
                <div className="h-4 w-3/4 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <p className="text-sm text-gray-500">Δεν υπάρχουν διαθέσιμα νέα αυτή τη στιγμή.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map(article => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-xl border border-gray-100 bg-white overflow-hidden hover:shadow-md hover:border-primary-100 transition-all"
            >
              {article.image && (
                <div className="aspect-video overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={article.image}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2 p-4 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {article.source && (
                    <span className="font-medium text-primary-700">{article.source}</span>
                  )}
                  {article.publishedAt && (
                    <time dateTime={article.publishedAt}>{formatPublishedAt(article.publishedAt)}</time>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 leading-snug line-clamp-3 group-hover:text-primary-700 transition-colors">
                  {article.title}
                </h3>
                {article.description && (
                  <p className="text-sm text-gray-500 line-clamp-3">{article.description}</p>
                )}
                <span className="mt-auto pt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                  Διαβάστε περισσότερα
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
