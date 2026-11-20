import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: string;
}

interface NewsCache {
  articles: NewsArticle[];
  fetchedAt: number | null;
  failed: boolean;
}

const GNEWS_ENDPOINT = 'https://gnews.io/api/v4/top-headlines';
const REQUEST_TIMEOUT_MS = 10_000;
/** Το GNews καλείται το πολύ μία φορά την ώρα (cache στο server). */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
/** Πόσα άρθρα εμφανίζονται στο dashboard. */
const MAX_ARTICLES = 9;
/** Πόσα ζητάμε από το GNews (free plan: έως 10) — τα υπόλοιπα τα κόβει το φίλτρο. */
const MAX_CANDIDATES = 10;
/** Στοχευμένο ερώτημα (όριο GNews: 200 χαρακτήρες) — μόνο ιατρικό περιεχόμενο. */
const SEARCH_QUERY =
  'ιατρική OR νόσος OR νόσημα OR καρκίνος OR εμβόλιο OR θεραπεία OR φάρμακο OR νοσοκομείο OR διάγνωση OR διαβήτης OR εγκέφαλος OR καρδιά OR λοίμωξη';

/**
 * Ιατρικά στελέχη (χωρίς τόνους) για τον τοπικό έλεγχο συνάφειας.
 * Το `q` του GNews ψάχνει και στο πλήρες κείμενο, οπότε ένα άσχετο άρθρο μπορεί να
 * περάσει επειδή απλώς αναφέρει κάποια λέξη. Γι' αυτό ελέγχουμε τίτλο + περιγραφή
 * και κρατάμε μόνο ό,τι έχει πραγματικά ιατρικό θέμα.
 */
const MEDICAL_TERMS = [
  // Δομές / ειδικότητες
  'ιατρ', 'γιατρ', 'νοσοκομ', 'κλινικ', 'εοδυ', 'υγει', 'υγιειν', 'φαρμακ', 'θεραπ',
  'διαγνωσ', 'χειρουργ', 'εγχειρησ', 'ασθεν', 'νοσο', 'νοσημ', 'νοσηλ', 'παθησ',
  'νοσηροτητ', 'θνησιμοτητ', 'κρουσμα', 'μεταδοτικ', 'προληψ',
  // Καρκίνος
  'καρκιν', 'ογκ', 'μεταστασ', 'χημειοθεραπ', 'ακτινοθεραπ', 'λευχαιμι',
  // Καρδιά / αγγεία
  'καρδι', 'εμφραγμ', 'εγκεφαλικ', 'θρομβωσ', 'πιεση', 'υπερτασ', 'χοληστερ', 'αρτηρι',
  // Μεταβολισμός / ενδοκρινής
  'διαβητ', 'σακχαρ', 'ινσουλιν', 'παχυσαρκ', 'θυρεοειδ', 'ορμον',
  // Νευρολογία / ψυχική υγεία
  'εγκεφαλ', 'ανοια', 'αλτσχαιμερ', 'παρκινσον', 'σκληρυνσ', 'επιληψ', 'ημικρανι',
  'πονοκεφαλ', 'νευρολογ', 'ψυχικ', 'καταθλιψ', 'αγχο', 'αυτισμ',
  // Αναπνευστικό
  'αναπνευστ', 'πνευμον', 'βρογχ', 'ασθμα',
  // Πεπτικό / ήπαρ / νεφρά
  'ηπαρ', 'ηπατ', 'νεφρ', 'γαστρεντερ', 'εντερο', 'μικροβιωμα',
  // Λοιμώξεις
  'λοιμωξ', 'μικροβ', 'βακτηρι', 'ιολογ', 'αντιβιοτικ', 'κοβιντ', 'κορονο', 'γριπ',
  'πανδημι', 'επιδημι', 'ιλαρα', 'μηνιγγιτ', 'ηπατιτιδ', 'ανεμοβλογια', 'ερυθρα',
  // Αίμα
  'αιματολογ', 'αναιμι',
  // Μυοσκελετικό
  'αρθριτ', 'ρευματ', 'οστεοπορωσ', 'μυοσκελετ', 'καταγμα',
  // Αναπαραγωγή / παιδιά
  'εγκυμοσυν', 'κυησ', 'γονιμοτητ', 'ωοθηκ', 'μητρα', 'προστατ', 'μαστο', 'βρεφ', 'νεογν',
  // Δέρμα / αισθήσεις / στόμα
  'δερματ', 'τριχοπτωσ', 'φαλακρ', 'τριχοφυι', 'ψωριασ', 'οφθαλμ', 'ορασ', 'ακοη',
  'ωτορινολαρυγγ', 'οδοντι', 'περιοδοντ', 'στοματικ',
  // Λοιπά ιατρικά
  'διατροφ', 'βιταμιν', 'υπνο', 'καπνισ', 'τσιγαρ', 'αλκοολ', 'εθισμ', 'τοξιν', 'τραυμα',
  'αλλεργ', 'ανοσο', 'αντισωμα', 'εμβολ', 'μεταμοσχευ', 'μοσχευμ', 'αναπηρ', 'δυστροφια',
  'μυικη ατροφια', 'κυτταρ', 'γονιδι', 'μικροοργανισμ', 'δηλητηριασ', 'προσθετικ',
];

/** Αντιστοίχιση στην αρχή λέξης, ώστε π.χ. το «νοσο» να μη «πιάνει» μέσα σε άλλη λέξη. */
const MEDICAL_PATTERN = new RegExp(`(?:^|[^\\p{L}])(?:${MEDICAL_TERMS.join('|')})`, 'u');

let cache: NewsCache = { articles: [], fetchedAt: null, failed: false };
let inFlight: Promise<NewsCache> | null = null;

function isFresh(fetchedAt: number | null): boolean {
  return fetchedAt !== null && Date.now() - fetchedAt < REFRESH_INTERVAL_MS;
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s*\[\d+ chars\]\s*$/, '').trim();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** 2 = ιατρικός όρος στον τίτλο, 1 = στην περιγραφή, 0 = άσχετο. */
function medicalScore(article: NewsArticle): number {
  if (MEDICAL_PATTERN.test(normalizeText(article.title))) return 2;
  if (MEDICAL_PATTERN.test(normalizeText(article.description))) return 1;
  return 0;
}

function selectRelevantArticles(articles: NewsArticle[]): NewsArticle[] {
  const relevant = articles.filter(article => medicalScore(article) > 0);
  // Safety net: αν κάποια μέρα δεν περάσει τίποτα, δείχνουμε ό,τι ήρθε αντί για κενή ενότητα.
  return (relevant.length > 0 ? relevant : articles).slice(0, MAX_ARTICLES);
}

function normalizeArticles(payload: unknown): NewsArticle[] {
  const raw = (payload as { articles?: unknown } | null)?.articles;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const articles: NewsArticle[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const article = item as Record<string, any>;
    const url = typeof article.url === 'string' ? article.url : '';
    const title = cleanText(article.title);

    if (!url || !title || seen.has(url)) continue;
    seen.add(url);

    articles.push({
      id: typeof article.id === 'string' && article.id ? article.id : url,
      title,
      description: cleanText(article.description),
      url,
      image: typeof article.image === 'string' && article.image ? article.image : null,
      publishedAt: typeof article.publishedAt === 'string' ? article.publishedAt : '',
      source: cleanText(article.source?.name),
    });

    if (articles.length >= MAX_CANDIDATES) break;
  }

  return articles;
}

async function requestGNews(apiKey: string): Promise<NewsArticle[]> {
  const url = new URL(GNEWS_ENDPOINT);
  url.searchParams.set('category', 'health');
  url.searchParams.set('lang', 'el');
  url.searchParams.set('country', 'gr');
  url.searchParams.set('q', SEARCH_QUERY);
  url.searchParams.set('max', String(MAX_CANDIDATES));
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`GNews responded with ${res.status}`);

  return normalizeArticles(await res.json());
}

async function refresh(apiKey: string): Promise<NewsCache> {
  try {
    const articles = selectRelevantArticles(await requestGNews(apiKey));
    cache = { articles, fetchedAt: Date.now(), failed: false };
  } catch {
    // Ληγμένο/εξαντλημένο quota ή δικτυακό σφάλμα: κρατάμε τα προηγούμενα άρθρα,
    // δεσμεύουμε την ώρα ώστε να μην επαναλαμβάνεται το αίτημα και δεν
    // εμφανίζεται κανένα μήνυμα λάθους στον χρήστη.
    cache = { articles: cache.articles, fetchedAt: Date.now(), failed: true };
  }

  return cache;
}

function toResponse(state: NewsCache) {
  return NextResponse.json(
    {
      enabled: true,
      articles: state.articles,
      fetchedAt: state.fetchedAt ? new Date(state.fetchedAt).toISOString() : null,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      stale: state.failed && state.articles.length > 0,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET() {
  const apiKey = (process.env.GNEWS_API_KEY || '').trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        enabled: false,
        articles: [],
        fetchedAt: null,
        refreshIntervalMs: REFRESH_INTERVAL_MS,
        stale: false,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (isFresh(cache.fetchedAt)) return toResponse(cache);

  if (!inFlight) {
    inFlight = refresh(apiKey).finally(() => {
      inFlight = null;
    });
  }

  return toResponse(await inFlight);
}