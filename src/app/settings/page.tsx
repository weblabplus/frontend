'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Settings, User, Mail, Shield, Save, ArrowLeft, CheckCircle, AlertCircle, RefreshCw, Database, Hash, Stethoscope, KeyRound, Trash2, Clock, Beaker, Loader2, Send, Building2, Barcode } from 'lucide-react';

/** Τύποι barcode που υποστηρίζονται για την εκτύπωση αριθμού εντολής */
const BARCODE_FORMATS = [
  'CODE128',
  'CODE128A',
  'CODE128B',
  'CODE128C',
  'CODE39',
  'CODE93',
  'EAN13',
  'EAN8',
  'ITF14',
  'ITF',
  'UPC',
  'MSI',
  'pharmacode',
  'codabar',
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Admin sync state
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [loincSyncing, setLoincSyncing] = useState(false);
  const [paramsSyncing, setParamsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    examCatalog: { loaded: boolean; size: number; syncing: boolean; progress: { page: number; totalPages: number; count: number } };
    examLoinc: { loaded: boolean; size: number; syncing: boolean; progress: { page: number; totalPages: number; count: number } };
    examParameters?: import('@/lib/api').ExamParametersStatus;
  } | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // E-Fulfillment (e-Prescription) state
  const [efState, setEfState] = useState<import('@/lib/api').EfulfillmentState | null>(null);
  const [efUsername, setEfUsername] = useState('');
  const [efPassword, setEfPassword] = useState('');
  const [efSaving, setEfSaving] = useState(false);
  const [efRefreshing, setEfRefreshing] = useState(false);
  const [efMessage, setEfMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Admin: E-Fulfillment config (Api-Key / Base URL)
  const [efConfig, setEfConfig] = useState<{
    baseUrl: string;
    apiKeyMasked: string | null;
    apiKeySource: 'database' | 'env' | 'none';
    refreshHours: number;
    ttlHours: number;
  } | null>(null);
  const [efApiKey, setEfApiKey] = useState('');
  const [efBaseUrl, setEfBaseUrl] = useState('');
  const [efConfigSaving, setEfConfigSaving] = useState(false);
  const [efConfigTesting, setEfConfigTesting] = useState(false);
  const [efConfigMessage, setEfConfigMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Στοιχεία Εργαστηρίου (προεπιλογή από φορέα, επεξεργάσιμα)
  const [labIdentity, setLabIdentity] = useState<import('@/lib/api').LabIdentity | null>(null);
  const [labName, setLabName] = useState('');
  const [labVat, setLabVat] = useState('');
  const [labLicense, setLabLicense] = useState('');
  const [labNameFromProvider, setLabNameFromProvider] = useState('');
  const [labVatFromProvider, setLabVatFromProvider] = useState('');
  const [labSaving, setLabSaving] = useState(false);
  const [labMessage, setLabMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Api-Key Lab Data Repository (admin)
  const [labRepoApiKeyInput, setLabRepoApiKeyInput] = useState('');
  const [labRepoKeyInfo, setLabRepoKeyInfo] = useState<{ apiKeyMasked: string; apiKeySource: string } | null>(null);
  const [labRepoSaving, setLabRepoSaving] = useState(false);
  const [labRepoKeyMessage, setLabRepoKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Κέντρα Αναφοράς (SLIS)
  const [centers, setCenters] = useState<import('@/lib/api').ReferenceCenter[]>([]);
  const [centerSaving, setCenterSaving] = useState<string | null>(null);
  const [centerMsg, setCenterMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [centerDraft, setCenterDraft] = useState<Record<string, {
    name: string;
    url: string;
    senderCode: string;
    action: string;
    password: string;
    resultsUrl: string;
    documentsUrl: string;
    documentsCode: string;
    documentsUsername: string;
    documentsPassword: string;
    barcodeType: string;
    barcodeWidthMm: string;
    barcodeHeightMm: string;
    barcodeShowText: boolean;
    barcodeCopies: string;
  }>>({});
  const [repoLock, setRepoLock] = useState<import('@/lib/api').LabProfileResponse['lock']>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Ref για ανίχνευση αλλαγών στην κατάσταση συγχρονισμού
  const prevSyncState = useRef<{ catalogSyncing: boolean; loincSyncing: boolean; paramsSyncing: boolean; initialized: boolean }>({
    catalogSyncing: false,
    loincSyncing: false,
    paramsSyncing: false,
    initialized: false,
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
    }
  }, [user]);

  // Φόρτωση κατάστασης E-Fulfillment
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const loadEfulfillment = async () => {
      try {
        const data = await api.getEfulfillment();
        if (cancelled) return;
        setEfState(data);
        if (data.username) setEfUsername(data.username);
        if (data.refreshError) {
          setEfMessage({ type: 'error', text: data.refreshError });
        }
      } catch (err: any) {
        if (!cancelled && err?.message) {
          setEfMessage({ type: 'error', text: err.message });
        }
      }
    };

    loadEfulfillment();
    loadLabProfile();
    loadLabRepoKey();
    loadCenters();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Φόρτωση κατάστασης sync για admins
  useEffect(() => {
    if (!isAdmin) return;
    const fetchStatus = async () => {
      try {
        const data = await api.getSyncStatus();
        setSyncStatus(data);

        // Ανίχνευση ολοκλήρωσης συγχρονισμού
        const prev = prevSyncState.current;
        if (prev.initialized) {
          // Catalog: ήταν σε sync και τώρα όχι → ολοκληρώθηκε
          if (prev.catalogSyncing && !data.examCatalog.syncing) {
            setSyncMessage({ type: 'success', text: '✅ Ο συγχρονισμός του καταλόγου εξετάσεων ολοκληρώθηκε.' });
            setCatalogSyncing(false);
          }
          // Loinc: ήταν σε sync και τώρα όχι → ολοκληρώθηκε
          if (prev.loincSyncing && !data.examLoinc.syncing) {
            setSyncMessage({ type: 'success', text: '✅ Ο συγχρονισμός των LOINC κωδικών ολοκληρώθηκε.' });
            setLoincSyncing(false);
          }
          // Parameters: ήταν σε sync και τώρα όχι → ολοκληρώθηκε
          const paramsStatus = data.examParameters;
          if (prev.paramsSyncing && paramsStatus && !paramsStatus.syncing) {
            if (paramsStatus.lastError) {
              setSyncMessage({
                type: 'error',
                text: `❌ Ο συγχρονισμός παραμέτρων απέτυχε: ${paramsStatus.lastError}`,
              });
            } else {
              setSyncMessage({
                type: 'success',
                text: `✅ Συγχρονίστηκαν ${paramsStatus.parameterCount.toLocaleString()} παράμετροι για ${paramsStatus.examCount.toLocaleString()} εξετάσεις.`,
              });
            }
            setParamsSyncing(false);
          }
          // Αν τρέχει sync, ενημέρωσε το μήνυμα με progress
          if (data.examCatalog.syncing) {
            setSyncMessage({
              type: 'info',
              text: `Συγχρονισμός exam_catalog: σελίδα ${data.examCatalog.progress.page}/${data.examCatalog.progress.totalPages} (${data.examCatalog.progress.count.toLocaleString()} εγγραφές)`,
            });
          }
          if (data.examLoinc.syncing) {
            setSyncMessage({
              type: 'info',
              text: `Συγχρονισμός exam_loinc: σελίδα ${data.examLoinc.progress.page}/${data.examLoinc.progress.totalPages} (${data.examLoinc.progress.count.toLocaleString()} εγγραφές)`,
            });
          }
          if (paramsStatus?.syncing) {
            const phaseLabels: Record<string, string> = {
              exams: 'εξετάσεις',
              loinc: 'σχέσεις LOINC',
              write: 'εγγραφή',
            };
            setSyncMessage({
              type: 'info',
              text: `Συγχρονισμός παραμέτρων (${phaseLabels[paramsStatus.progress.phase] || paramsStatus.progress.phase}): ${
                paramsStatus.progress.totalPages > 0
                  ? `σελίδα ${paramsStatus.progress.page}/${paramsStatus.progress.totalPages} `
                  : ''
              }(${paramsStatus.progress.count.toLocaleString()} εγγραφές)`,
            });
          }
        }

        // Ενημέρωση προηγούμενης κατάστασης
        prevSyncState.current = {
          catalogSyncing: data.examCatalog.syncing,
          loincSyncing: data.examLoinc.syncing,
          paramsSyncing: Boolean(data.examParameters?.syncing),
          initialized: true,
        };
      } catch {
        // silent fail — status will show as unavailable
      }
    };
    fetchStatus();
    // Poll κάθε 5 δευτερόλεπτα όταν τρέχει sync
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleSave = async () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setStatus('error');
      setMessage('Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες');
      return;
    }

    setSaving(true);
    setStatus('idle');

    try {
      await api.updateProfile(displayName.trim());
      await refreshUser();
      setStatus('success');
      setMessage('Το προφίλ σας ενημερώθηκε επιτυχώς');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Σφάλμα κατά την ενημέρωση του προφίλ');
    } finally {
      setSaving(false);
    }
  };

  // ── Admin sync handlers ──

  const handleSyncCatalog = async () => {
    setCatalogSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.syncExamCatalog(undefined);
      setSyncMessage({ type: 'info', text: result.message });
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err?.message || 'Σφάλμα συγχρονισμού' });
    } finally {
      setCatalogSyncing(false);
    }
  };

  const handleSyncLoinc = async () => {
    setLoincSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.syncExamLoinc();
      setSyncMessage({ type: 'info', text: result.message });
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err?.message || 'Σφάλμα συγχρονισμού' });
    } finally {
      setLoincSyncing(false);
    }
  };

  const handleSyncParameters = async () => {
    setParamsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.syncExamParameters();
      setSyncMessage({ type: 'info', text: result.message });
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err?.message || 'Σφάλμα συγχρονισμού παραμέτρων' });
    } finally {
      setParamsSyncing(false);
    }
  };

  // ── E-Fulfillment handlers ──

  const loadLabProfile = async () => {
    try {
      const res = await api.getLabProfile();
      setLabIdentity(res.identity);
      // Τι δίνει ο φορέας (για placeholders / σύγκριση)
      const providerName = res.identity?.labName || '';
      const providerVat = res.identity?.vatNumber || '';
      // Αν ο χρήστης δεν έχει κάνει παράκαμψη, προσυμπληρώνουμε από τον φορέα
      setLabNameFromProvider(providerName);
      setLabVatFromProvider(providerVat);
      setLabName(res.profile?.labName || providerName);
      setLabVat(res.profile?.vatNumber || providerVat);
      setLabLicense(res.profile?.licenseNumber || '');
      setRepoLock(res.lock ?? null);
    } catch {
      // αγνοείται — η φόρμα μένει κενή
    }
  };

  const loadLabRepoKey = async () => {
    try {
      const res = await api.getLabRepoConfig();
      setLabRepoKeyInfo(res);
    } catch {
      // αγνοείται
    }
  };

  const handleSaveLabRepoKey = async () => {
    setLabRepoSaving(true);
    setLabRepoKeyMessage(null);
    try {
      const res = await api.saveLabRepoConfig(labRepoApiKeyInput.trim());
      setLabRepoKeyInfo({ apiKeyMasked: res.apiKeyMasked, apiKeySource: res.apiKeySource });
      setLabRepoApiKeyInput('');
      setLabRepoKeyMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setLabRepoKeyMessage({ type: 'error', text: err?.message || 'Σφάλμα αποθήκευσης' });
    } finally {
      setLabRepoSaving(false);
    }
  };

  const loadCenters = async () => {
    try {
      const res = await api.getReferenceCenters();
      setCenters(res.centers || []);
      const drafts: Record<string, {
        name: string;
        url: string;
        senderCode: string;
        action: string;
        password: string;
        resultsUrl: string;
        documentsUrl: string;
        documentsCode: string;
        documentsUsername: string;
        documentsPassword: string;
        barcodeType: string;
        barcodeWidthMm: string;
        barcodeHeightMm: string;
        barcodeShowText: boolean;
        barcodeCopies: string;
      }> = {};
      for (const c of res.centers || []) {
        drafts[c.id] = {
          name: c.name,
          url: c.url,
          senderCode: c.config?.senderCode || '',
          action: String(c.config?.action ?? 1),
          password: c.config?.password || '',
          resultsUrl: c.config?.resultsUrl || '',
          documentsUrl: c.config?.documentsUrl || '',
          documentsCode: c.config?.documentsCode || '',
          documentsUsername: c.config?.documentsUsername || '',
          documentsPassword: c.config?.documentsPassword || '',
          barcodeType: c.config?.barcodeType || 'CODE128',
          barcodeWidthMm: String(c.config?.barcodeWidthMm ?? 50),
          barcodeHeightMm: String(c.config?.barcodeHeightMm ?? 15),
          barcodeShowText: c.config?.barcodeShowText !== false,
          barcodeCopies: String(c.config?.barcodeCopies ?? 1),
        };
      }
      setCenterDraft(drafts);
    } catch {
      // αγνοείται
    }
  };

  const handleSaveCenter = async (center: import('@/lib/api').ReferenceCenter) => {
    const draft = centerDraft[center.id];
    if (!draft) return;
    setCenterSaving(center.id);
    setCenterMsg(null);
    try {
      const res = await api.updateReferenceCenter(center.id, {
        name: draft.name,
        url: draft.url,
        config: {
          senderCode: draft.senderCode.trim().padStart(4, '0'),
          action: Number(draft.action) || 1,
          password: draft.password.trim(),
          resultsUrl: draft.resultsUrl.trim(),
          documentsUrl: draft.documentsUrl.trim(),
          documentsCode: draft.documentsCode.trim(),
          documentsUsername: draft.documentsUsername.trim(),
          documentsPassword: draft.documentsPassword.trim(),
          barcodeType: draft.barcodeType,
          barcodeWidthMm: Math.max(1, Number(draft.barcodeWidthMm) || 50),
          barcodeHeightMm: Math.max(1, Number(draft.barcodeHeightMm) || 15),
          barcodeShowText: Boolean(draft.barcodeShowText),
          barcodeCopies: Math.min(100, Math.max(1, Math.floor(Number(draft.barcodeCopies) || 1))),
        },
      });
      setCenters(prev => prev.map(c => (c.id === center.id ? res.center : c)));
      setCenterMsg({ type: 'success', text: res.message });
    } catch (err: any) {
      setCenterMsg({ type: 'error', text: err?.message || 'Σφάλμα αποθήκευσης κέντρου' });
    } finally {
      setCenterSaving(null);
    }
  };

  const handleSaveLabProfile = async () => {    setLabSaving(true);    setLabMessage(null);
    try {
      const res = await api.saveLabProfile({
        labName: labName.trim(),
        vatNumber: labVat.replace(/\D/g, ''),
        licenseNumber: labLicense.trim(),
      });
      setLabIdentity(res.identity);
      setLabMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setLabMessage({ type: 'error', text: err?.message || 'Σφάλμα αποθήκευσης' });
    } finally {
      setLabSaving(false);
    }
  };

  const resetLabToProvider = () => {
    setLabName(labNameFromProvider);
    setLabVat(labVatFromProvider);
    setLabMessage(null);
  };

  // Αντίστροφη μέτρηση για το κλείδωμα λογαριασμού φορέα
  useEffect(() => {
    if (!repoLock) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [repoLock]);

  const lockRemainingMs = repoLock
    ? Math.max(0, new Date(repoLock.unlockAt).getTime() - nowTick)
    : 0;

  const formatCountdown = (ms: number) => {
    const total = Math.ceil(ms / 1000);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  };

  const handleSaveEfulfillment = async () => {
    if (!efUsername.trim() || efPassword.length < 4) {
      setEfMessage({
        type: 'error',
        text: 'Συμπληρώστε username και password του φορέα',
      });
      return;
    }

    setEfSaving(true);
    setEfMessage({ type: 'info', text: 'Σύνδεση με τον φορέα...' });

    try {
      const result = await api.saveEfulfillmentCredentials(efUsername.trim(), efPassword);
      setEfPassword('');
      setEfMessage({ type: 'success', text: result.message });
      const fresh = await api.getEfulfillment();
      setEfState(fresh);
    } catch (err: any) {
      setEfMessage({ type: 'error', text: err?.message || 'Σφάλμα σύνδεσης με τον φορέα' });
    } finally {
      setEfSaving(false);
    }
  };

  const handleRefreshEfulfillment = async () => {
    setEfRefreshing(true);
    setEfMessage({ type: 'info', text: 'Ανανέωση σύνδεσης...' });

    try {
      const result = await api.refreshEfulfillment();
      setEfMessage({ type: 'success', text: result.message });
      const fresh = await api.getEfulfillment();
      setEfState(fresh);
    } catch (err: any) {
      setEfMessage({ type: 'error', text: err?.message || 'Σφάλμα ανανέωσης' });
    } finally {
      setEfRefreshing(false);
    }
  };

  const handleDeleteEfulfillment = async () => {
    setEfMessage(null);
    try {
      await api.deleteEfulfillmentCredentials();
      setEfState({ hasCredentials: false, profile: null });
      setEfUsername('');
      setEfPassword('');
      setEfMessage({ type: 'success', text: 'Τα στοιχεία σύνδεσης φορέα διαγράφηκαν' });
    } catch (err: any) {
      setEfMessage({ type: 'error', text: err?.message || 'Σφάλμα διαγραφής' });
    }
  };

  // Φόρτωση admin config για E-Fulfillment
  useEffect(() => {
    if (!isAdmin) return;
    const loadConfig = async () => {
      try {
        const cfg = await api.getEfulfillmentConfig();
        setEfConfig(cfg);
        setEfBaseUrl(cfg.baseUrl);
      } catch {
        // silent
      }
    };
    loadConfig();
  }, [isAdmin]);

  // ── Admin: E-Fulfillment config handlers ──

  const handleSaveEfConfig = async () => {
    setEfConfigSaving(true);
    setEfConfigMessage({ type: 'info', text: 'Αποθήκευση...' });
    try {
      await api.setEfulfillmentConfig({
        ...(efApiKey.trim() ? { apiKey: efApiKey.trim() } : {}),
        ...(efBaseUrl.trim() ? { baseUrl: efBaseUrl.trim() } : {}),
      });
      setEfApiKey('');
      const cfg = await api.getEfulfillmentConfig();
      setEfConfig(cfg);
      setEfBaseUrl(cfg.baseUrl);
      setEfConfigMessage({ type: 'success', text: 'Οι ρυθμίσεις αποθηκεύτηκαν' });
    } catch (err: any) {
      setEfConfigMessage({ type: 'error', text: err?.message || 'Σφάλμα αποθήκευσης' });
    } finally {
      setEfConfigSaving(false);
    }
  };

  const handleTestEfConfig = async () => {
    setEfConfigTesting(true);
    setEfConfigMessage({ type: 'info', text: 'Δοκιμή Api-Key...' });
    try {
      const res = await api.testEfulfillmentConfig();
      setEfConfigMessage({
        type: res.ok ? 'success' : 'error',
        text: res.ok ? '✅ Το Api-Key είναι έγκυρο' : res.error || 'Το Api-Key δεν είναι έγκυρο',
      });
    } catch (err: any) {
      setEfConfigMessage({ type: 'error', text: err?.message || 'Σφάλμα δοκιμής' });
    } finally {
      setEfConfigTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const roleLabels: Record<string, string> = {
    doctor: 'Ιατρός',
    lab_technician: 'Τεχνικός Εργαστηρίου',
    admin: 'Διαχειριστής',
  };

  const formatDateTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const hoursUntil = (iso?: string | null): number | null => {
    if (!iso) return null;
    return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
  };

  const efProfile = efState?.profile;
  const efExpiresIn = hoursUntil(efState?.expiresAt);
  const efNextRefreshIn = hoursUntil(efState?.nextRefreshAt);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Επιστροφή"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Settings className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Ρυθμίσεις</h1>
          </div>
          <p className="mt-1 text-gray-500 ml-11">Διαχείριση του προφίλ σας</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status message */}
        {status !== 'idle' && (
          <div className={`mb-6 flex items-center gap-2 p-4 rounded-lg ${
            status === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {status === 'success' ? (
              <CheckCircle className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span className="text-sm font-medium">{message}</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5 text-primary-600" />
              Στοιχεία Προφίλ
            </h2>
          </div>

          <div className="p-6 space-y-6">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">Το email δεν μπορεί να αλλάξει</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Ονοματεπώνυμο
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setStatus('idle'); }}
                placeholder="Το ονοματεπώνυμό σας"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors"
              />
            </div>

            {/* Role (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Shield className="w-4 h-4 inline mr-1.5 text-gray-400" />
                Ρόλος
              </label>
              <input
                type="text"
                value={roleLabels[user?.role || 'doctor'] || user?.role}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || displayName === (user?.displayName || '')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Αποθήκευση...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Αποθήκευση
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── E-Fulfillment Section ── */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-emerald-600" />
                Στοιχεία Φορέα (e-Prescription)
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Σύνδεση με το E-Fulfillment API του e-Prescription για άντληση των στοιχείων σας.
                Η σύνδεση ανανεώνεται αυτόματα πριν από το 24ωρο όριο του φορέα.
              </p>
            </div>

            <div className="p-6 space-y-6">
              {efMessage && (
                <div
                  className={`flex items-center gap-2 p-4 rounded-lg ${
                    efMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : efMessage.type === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}
                >
                  {efMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 shrink-0" />
                  ) : efMessage.type === 'error' ? (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  ) : (
                    <RefreshCw className="w-5 h-5 shrink-0 animate-spin" />
                  )}
                  <span className="text-sm font-medium">{efMessage.text}</span>
                </div>
              )}

              {/* Κατάσταση σύνδεσης */}
              {efState?.hasCredentials && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-gray-700">
                      <Clock className="w-4 h-4 inline mr-1.5 text-gray-400" />
                      Τελευταία άντληση: <strong>{formatDateTime(efState.lastSyncAt)}</strong>
                    </span>
                    {efExpiresIn !== null && (
                      <span className="text-gray-600 text-xs">
                        Λήξη σύνδεσης φορέα: {formatDateTime(efState.expiresAt)} ({efExpiresIn}ω)
                      </span>
                    )}
                    {efNextRefreshIn !== null && (
                      <span className="text-gray-600 text-xs">
                        Αυτόματη ανανέωση σε: {efNextRefreshIn}ω
                      </span>
                    )}
                  </div>
                  {efState.lastError && (
                    <p className="text-xs text-red-600">
                      Τελευταίο σφάλμα: {efState.lastError}
                    </p>
                  )}
                </div>
              )}

              {/* Ληφθέντα στοιχεία */}
              {efProfile && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Ονοματεπώνυμο</p>
                    <p className="text-sm font-medium text-gray-900">
                      {efProfile.fullName || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">ΑΜΚΑ</p>
                    <p className="text-sm font-medium text-gray-900">{efProfile.amka || '—'}</p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">ΑΦΜ</p>
                    <p className="text-sm font-medium text-gray-900">{efProfile.afm || '—'}</p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Αρ. Άδειας (etaaRegNo)</p>
                    <p className="text-sm font-medium text-gray-900">
                      {efProfile.etaaRegNo || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Κωδικός Ιατρού</p>
                    <p className="text-sm font-medium text-gray-900">
                      {efProfile.practitionerId || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Ημ. Γέννησης / Φύλο</p>
                    <p className="text-sm font-medium text-gray-900">
                      {efProfile.birthDate || '—'}
                      {efProfile.gender
                        ? ` · ${efProfile.gender === 'male' ? 'Άνδρας' : efProfile.gender === 'female' ? 'Γυναίκα' : efProfile.gender}`
                        : ''}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {efProfile.email || '—'}
                    </p>
                  </div>
                  <div className="p-3 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 mb-0.5">Κινητό</p>
                    <p className="text-sm font-medium text-gray-900">{efProfile.mobile || '—'}</p>
                  </div>
                  {efProfile.specialties?.length > 0 && (
                    <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Ειδικότητες</p>
                      <p className="text-sm font-medium text-gray-900">
                        {efProfile.specialties.join(', ')}
                      </p>
                    </div>
                  )}
                  {(efProfile.organizationName || efProfile.healthcareServices?.length > 0) && (
                    <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Μονάδα / Φορέας</p>
                      <p className="text-sm font-medium text-gray-900">
                        {efProfile.organizationName ||
                          efProfile.healthcareServices?.join(', ') ||
                          '—'}
                      </p>
                    </div>
                  )}
                  {(efProfile.examCenterId || efProfile.userUnitId) && (
                    <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Κωδικοί Μονάδας</p>
                      <p className="text-sm font-medium text-gray-900">
                        {efProfile.examCenterId && `examCenterId: ${efProfile.examCenterId}`}
                        {efProfile.examCenterId && efProfile.userUnitId && ' · '}
                        {efProfile.userUnitId && `userUnitId: ${efProfile.userUnitId}`}
                      </p>
                    </div>
                  )}
                  <div className="p-3 border border-gray-200 rounded-lg sm:col-span-2">
                    <p className="text-xs text-gray-400 mb-1.5">Δυνατότητες</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { on: efProfile.isExamCenter, label: 'Εξεταστικό Κέντρο' },
                        { on: efProfile.canExecuteExam, label: 'Εκτέλεση Παραπεμπτικών' },
                        { on: efProfile.canAddExamResults, label: 'Καταχώρηση Αποτελεσμάτων' },
                        { on: efProfile.isPublicHealthProvider, label: 'Δημόσιος Φορέας' },
                      ].map(item => (
                        <span
                          key={item.label}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.on
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-50 text-gray-400 border border-gray-200'
                          }`}
                        >
                          {item.on ? '✓' : '✗'} {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Φόρμα credentials */}
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    <KeyRound className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    {efState?.hasCredentials ? 'Ενημέρωση στοιχείων σύνδεσης' : 'Στοιχεία σύνδεσης φορέα'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Τα διαπιστευτήρια αποθηκεύονται κρυπτογραφημένα (AES-256-GCM).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={efUsername}
                    onChange={e => {
                      setEfUsername(e.target.value);
                      setEfMessage(null);
                    }}
                    placeholder="π.χ. doctor123"
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={efPassword}
                    onChange={e => {
                      setEfPassword(e.target.value);
                      setEfMessage(null);
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {efState?.hasCredentials && (
                  <>
                    <button
                      type="button"
                      onClick={handleDeleteEfulfillment}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Διαγραφή
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshEfulfillment}
                      disabled={efRefreshing}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${efRefreshing ? 'animate-spin' : ''}`} />
                      Άντληση τώρα
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSaveEfulfillment}
                  disabled={efSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {efSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Σύνδεση...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Αποθήκευση &amp; Σύνδεση
                    </>
                  )}
                </button>
              </div>

              {/* Admin: ρύθμιση Api-Key / Base URL */}
              {isAdmin && efConfig && (
                <div className="mt-2 pt-6 border-t border-gray-100 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      <KeyRound className="w-4 h-4 inline mr-1.5 text-amber-600" />
                      Ρύθμιση εφαρμογής (Διαχειριστής)
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Το Api-Key χορηγείται από τον φορέα ανά εφαρμογή. Υπερισχύει του
                      <code className="mx-1 px-1 bg-gray-100 rounded">EFULFILLMENT_API_KEY</code>.
                    </p>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
                    <p>
                      Τρέχον Api-Key:{' '}
                      <strong className="text-gray-900">
                        {efConfig.apiKeyMasked || 'δεν έχει οριστεί'}
                      </strong>{' '}
                      <span className="text-gray-400">
                        ({efConfig.apiKeySource === 'database'
                          ? 'από τη βάση'
                          : efConfig.apiKeySource === 'env'
                          ? 'από .env.local'
                          : '—'})
                      </span>
                    </p>
                    <p>
                      Ανανέωση κάθε <strong>{efConfig.refreshHours}h</strong> · όριο φορέα{' '}
                      <strong>{efConfig.ttlHours}h</strong>
                    </p>
                  </div>

                  {efConfigMessage && (
                    <div
                      className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                        efConfigMessage.type === 'success'
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : efConfigMessage.type === 'error'
                          ? 'bg-red-50 text-red-800 border border-red-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {efConfigMessage.type === 'success' ? (
                        <CheckCircle className="w-4 h-4 shrink-0" />
                      ) : efConfigMessage.type === 'error' ? (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      ) : (
                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                      )}
                      <span className="font-medium">{efConfigMessage.text}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Api-Key Lab Data Repository
                      </label>
                      <input
                        type="password"
                        value={labRepoApiKeyInput}
                        onChange={e => {
                          setLabRepoApiKeyInput(e.target.value);
                          setLabRepoKeyMessage(null);
                        }}
                        placeholder="Το Api-Key της εφαρμογής για το Lab Data Repository"
                        className="input-field font-mono text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Ενεργό: <strong className="font-mono">{labRepoKeyInfo?.apiKeyMasked || '—'}</strong>{' '}
                        ({labRepoKeyInfo?.apiKeySource === 'database' ? 'από τη βάση' : labRepoKeyInfo?.apiKeySource === 'env' ? 'από .env' : 'κενό'})
                      </p>
                      <button
                        onClick={handleSaveLabRepoKey}
                        disabled={labRepoSaving || labRepoApiKeyInput.trim().length < 8}
                        className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        {labRepoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        Αποθήκευση Api-Key
                      </button>
                      {labRepoKeyMessage && (
                        <p
                          className={`text-xs mt-1 ${
                            labRepoKeyMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {labRepoKeyMessage.text}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Νέο Api-Key
                      </label>
                      <input
                        type="password"
                        value={efApiKey}
                        onChange={e => {
                          setEfApiKey(e.target.value);
                          setEfConfigMessage(null);
                        }}
                        placeholder="Αφήστε κενό για να μην αλλάξει"
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={efBaseUrl}
                        onChange={e => {
                          setEfBaseUrl(e.target.value);
                          setEfConfigMessage(null);
                        }}
                        placeholder="https://testeps.e-prescription.gr/efulfillment"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleTestEfConfig}
                      disabled={efConfigTesting}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${efConfigTesting ? 'animate-spin' : ''}`} />
                      Δοκιμή Api-Key
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEfConfig}
                      disabled={efConfigSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      {efConfigSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          Αποθήκευση...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Αποθήκευση ρυθμίσεων
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Laboratory identity (για αποστολή αποτελεσμάτων) ── */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Beaker className="w-5 h-5 text-emerald-600" />
                Στοιχεία Εργαστηρίου
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Προσυμπληρώνονται από τα <strong>Στοιχεία Φορέα (e-Prescription)</strong> και
                μπορείτε να τα αλλάξετε. Ο κωδικός εγκατάστασης ΕΟΠΥΥ συμπληρώνεται χειροκίνητα.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {repoLock && lockRemainingMs > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-red-800">
                        Ο λογαριασμός στο Lab Data Repository είναι κλειδωμένος
                      </p>
                      <p className="text-sm text-red-700 mt-1">
                        Προκλήθηκε από πολλαπλές αποτυχημένες προσπάθειες σύνδεσης. Απαιτούνται{' '}
                        <strong>30 λεπτά χωρίς καμία νέα κλήση</strong> πριν από νέα προσπάθεια.
                      </p>
                      <p className="text-sm text-red-800 mt-2">
                        Απομένουν:{' '}
                        <strong className="font-mono text-base">
                          {formatCountdown(lockRemainingMs)}
                        </strong>{' '}
                        <span className="text-xs text-red-600">
                          (έως {new Date(repoLock.unlockAt).toLocaleTimeString('el-GR')})
                        </span>
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ Κάθε νέα αποτυχημένη προσπάθεια επαναφέρει τον χρόνο αναμονής στα 30 λεπτά.
                        Μην εκτελείτε κλήσεις πριν λήξει η αντίστροφη μέτρηση.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {labMessage && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    labMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {labMessage.type === 'success' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {labMessage.text}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Επωνυμία Εργαστηρίου (Μονάδα / Φορέας)
                  </label>
                  <input
                    type="text"
                    value={labName}
                    onChange={e => setLabName(e.target.value)}
                    className="input-field"
                    placeholder={labNameFromProvider || 'π.χ. ΔΙΑΓΝΩΣΤΙΚΟ ΕΡΓΑΣΤΗΡΙΟ'}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {labNameFromProvider && labName !== labNameFromProvider ? (
                      <span className="text-amber-600">
                        Άλλαξε από το φορέα («{labNameFromProvider}»)
                      </span>
                    ) : (
                      'Προσυμπληρωμένο από τα Στοιχεία Φορέα'
                    )}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ΑΦΜ</label>
                  <input
                    type="text"
                    value={labVat}
                    onChange={e => setLabVat(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    className="input-field font-mono"
                    placeholder={labVatFromProvider || '9 ψηφία'}
                    maxLength={9}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {labVatFromProvider && labVat !== labVatFromProvider ? (
                      <span className="text-amber-600">Άλλαξε από το φορέα («{labVatFromProvider}»)</span>
                    ) : (
                      'Προσυμπληρωμένο από τα Στοιχεία Φορέα'
                    )}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Κωδικός Εγκατάστασης ΕΟΠΥΥ
                </label>
                <input
                  type="text"
                  value={labLicense}
                  onChange={e => setLabLicense(e.target.value)}
                  className="input-field font-mono"
                  placeholder="π.χ. 120-A"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Δεν παρέχεται από τα Στοιχεία Φορέα — συμπληρώνεται χειροκίνητα.
                </p>
                {labIdentity && (labIdentity.examCenterId || labIdentity.userUnitId) && (
                  <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                    <p className="font-medium mb-1">Κωδικοί μονάδας από τα Στοιχεία Φορέα:</p>
                    <p className="font-mono">
                      {labIdentity.examCenterId && <>examCenterId: {labIdentity.examCenterId}</>}
                      {labIdentity.userUnitId && <> · userUnitId: {labIdentity.userUnitId}</>}
                      {labIdentity.healthCareUnitId && (
                        <> · healthCareUnitId: {labIdentity.healthCareUnitId}</>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveLabProfile}
                  disabled={labSaving || (!labName.trim() && !labVat && !labLicense.trim())}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {labSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Αποθήκευση...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Αποθήκευση
                    </>
                  )}
                </button>
                {(labName !== labNameFromProvider || labVat !== labVatFromProvider) && (
                  <button
                    onClick={resetLabToProvider}
                    disabled={labSaving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Επαναφορά από φορέα
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Κέντρα Αναφοράς (SLIS) ── */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                Κέντρα Αναφοράς
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Αποστολή εξετάσεων παραπεμπτικού σε εξωτερικό κέντρο (SLIS / Infomed XML).
                Η διεύθυνση και ο SENDERCODE δίνονται από το κέντρο.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {centerMsg && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    centerMsg.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {centerMsg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {centerMsg.text}
                </div>
              )}

              {centers.length === 0 && (
                <p className="text-sm text-gray-400">Δεν υπάρχουν διαθέσιμα κέντρα.</p>
              )}

              {centers.map(center => {
                const draft = centerDraft[center.id] || {
                  name: center.name,
                  url: center.url,
                  senderCode: center.config?.senderCode || '',
                  action: String(center.config?.action ?? 1),
                  password: center.config?.password || '',
                  resultsUrl: center.config?.resultsUrl || '',
                  documentsUrl: '',
                  documentsCode: '',
                  documentsUsername: '',
                  documentsPassword: '',
                  barcodeType: center.config?.barcodeType || 'CODE128',
                  barcodeWidthMm: String(center.config?.barcodeWidthMm ?? 50),
                  barcodeHeightMm: String(center.config?.barcodeHeightMm ?? 15),
                  barcodeShowText: center.config?.barcodeShowText !== false,
                  barcodeCopies: String(center.config?.barcodeCopies ?? 1),
                };
                return (
                  <div key={center.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{center.name}</span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 shrink-0">
                          {center.protocol}
                        </span>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          center.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {center.active ? 'Ενεργό' : 'Ανενεργό'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Ονομασία
                        </label>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={e =>
                            setCenterDraft(prev => ({
                              ...prev,
                              [center.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          SENDERCODE
                        </label>
                        <input
                          type="text"
                          value={draft.senderCode}
                          onChange={e =>
                            setCenterDraft(prev => ({
                              ...prev,
                              [center.id]: { ...draft, senderCode: e.target.value },
                            }))
                          }
                          className="input-field font-mono text-sm"
                          placeholder="π.χ. 184"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Διεύθυνση κλήσης (URL)
                      </label>
                      <input
                        type="text"
                        value={draft.url}
                        onChange={e =>
                          setCenterDraft(prev => ({
                            ...prev,
                            [center.id]: { ...draft, url: e.target.value },
                          }))
                        }
                        className="input-field font-mono text-sm"
                        placeholder="http://host:port/SLISMESSAGE"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        PASSWORD / Token
                      </label>
                      <input
                        type="password"
                        value={draft.password}
                        onChange={e =>
                          setCenterDraft(prev => ({
                            ...prev,
                            [center.id]: { ...draft, password: e.target.value },
                          }))
                        }
                        className="input-field font-mono text-sm"
                        placeholder="Το password που έδωσε το κέντρο"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Χρησιμοποιείται και ως <code className="font-mono">PASSWORD</code> στο{' '}
                        <code className="font-mono">&lt;USER&gt;</code> block και ως{' '}
                        <code className="font-mono">Token</code> στην κλήση αποτελεσμάτων.
                        REQUESTOR και USERNAME = SENDERCODE.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <p className="text-xs font-semibold text-gray-700">Αποτελέσματα (RESULTS)</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Διεύθυνση αποτελεσμάτων (RESULTS URL)
                        </label>
                        <input
                          type="text"
                          value={draft.resultsUrl}
                          onChange={e =>
                            setCenterDraft(prev => ({
                              ...prev,
                              [center.id]: { ...draft, resultsUrl: e.target.value },
                            }))
                          }
                          className="input-field font-mono text-sm"
                          placeholder="http://host:port/RESULTS"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Καλείται ως{' '}
                          <code className="font-mono">
                            ?HISOrder=&lt;ORDERNO&gt;&amp;Token=&lt;PASSWORD&gt;
                          </code>{' '}
                          — χρησιμοποιείται το ίδιο PASSWORD.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                        <Barcode className="w-4 h-4 text-indigo-600" />
                        Barcode εντολής (εκτύπωση)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Τύπος barcode
                          </label>
                          <select
                            value={draft.barcodeType}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, barcodeType: e.target.value },
                              }))
                            }
                            className="input-field text-sm"
                          >
                            {BARCODE_FORMATS.map(format => (
                              <option key={format} value={format}>{format}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Πλάτος (mm)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            step={1}
                            value={draft.barcodeWidthMm}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, barcodeWidthMm: e.target.value },
                              }))
                            }
                            className="input-field text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Ύψος (mm)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={draft.barcodeHeightMm}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, barcodeHeightMm: e.target.value },
                              }))
                            }
                            className="input-field text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Αντίγραφα (προεπιλογή)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={draft.barcodeCopies}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, barcodeCopies: e.target.value },
                              }))
                            }
                            className="input-field text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs font-medium text-gray-600 pb-2">
                          <input
                            type="checkbox"
                            checked={draft.barcodeShowText}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, barcodeShowText: e.target.checked },
                              }))
                            }
                            className="rounded border-gray-300"
                          />
                          Εμφάνιση αριθμού εντολής κάτω από το barcode
                        </label>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Εφαρμόζεται στο κουμπί «Barcode» του παραπεμπτικού μετά την αποστολή
                        εξετάσεων στο κέντρο. Το πλήθος αντιγράφων μπορεί να αλλάξει και κατά την
                        εκτύπωση.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <p className="text-xs font-semibold text-gray-700">Οφειλές (Documents API)</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Διεύθυνση κλήσης οφειλών
                        </label>
                        <input
                          type="text"
                          value={draft.documentsUrl}
                          onChange={e =>
                            setCenterDraft(prev => ({
                              ...prev,
                              [center.id]: { ...draft, documentsUrl: e.target.value },
                            }))
                          }
                          className="input-field font-mono text-sm"
                          placeholder="http://host:port"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Καλείται ως{' '}
                          <code className="font-mono">
                            GET /api/documents?date_from=…&amp;date_to=…&amp;code=…
                          </code>{' '}
                          για το τελευταίο 6μηνο. Αν μείνει κενή, χρησιμοποιείται η τιμή του{' '}
                          <code className="font-mono">EMPORIKO_DOCUMENTS_URL</code>.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Κωδικός πελάτη (code)
                          </label>
                          <input
                            type="text"
                            value={draft.documentsCode}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, documentsCode: e.target.value },
                              }))
                            }
                            className="input-field font-mono text-sm"
                            placeholder="π.χ. 0001"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            Τετραψήφιος κωδικός· αν κενό, χρησιμοποιείται το SENDERCODE.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Username οφειλών
                          </label>
                          <input
                            type="text"
                            value={draft.documentsUsername}
                            onChange={e =>
                              setCenterDraft(prev => ({
                                ...prev,
                                [center.id]: { ...draft, documentsUsername: e.target.value },
                              }))
                            }
                            className="input-field font-mono text-sm"
                            placeholder="π.χ. invoiceapi"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Password οφειλών
                        </label>
                        <input
                          type="password"
                          value={draft.documentsPassword}
                          onChange={e =>
                            setCenterDraft(prev => ({
                              ...prev,
                              [center.id]: { ...draft, documentsPassword: e.target.value },
                            }))
                          }
                          className="input-field font-mono text-sm"
                          placeholder="Το password του Documents API"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Basic auth για το Documents API. Κενά πεδία → πτώση στις τιμές{' '}
                          <code className="font-mono">EMPORIKO_DOCUMENTS_*</code>.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveCenter(center)}
                      disabled={centerSaving === center.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      {centerSaving === center.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Αποθήκευση
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Admin Section: Database Sync ── */}
          {isAdmin && (
            <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-600" />
                  Διαχείριση Βάσης Δεδομένων
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Επανασυγχρονισμός των πινάκων exam_catalog και exam_loinc από το ΗΔΙΚΑ API.
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Sync status message */}
                {syncMessage && (
                  <div className={`flex items-center gap-2 p-4 rounded-lg ${
                    syncMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : syncMessage.type === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}>
                    {syncMessage.type === 'success' ? (
                      <CheckCircle className="w-5 h-5 shrink-0" />
                    ) : syncMessage.type === 'error' ? (
                      <AlertCircle className="w-5 h-5 shrink-0" />
                    ) : (
                      <RefreshCw className="w-5 h-5 shrink-0 animate-spin" />
                    )}
                    <span className="text-sm font-medium">{syncMessage.text}</span>
                  </div>
                )}

                {/* Current status */}
                {syncStatus && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="w-4 h-4 text-primary-600" />
                        <span className="text-sm font-medium text-gray-700">exam_catalog</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {syncStatus.examCatalog.loaded ? syncStatus.examCatalog.size.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {syncStatus.examCatalog.syncing
                          ? `Σε εξέλιξη: σελ. ${syncStatus.examCatalog.progress.page}/${syncStatus.examCatalog.progress.totalPages} (${syncStatus.examCatalog.progress.count.toLocaleString()} εγγραφές)`
                          : syncStatus.examCatalog.loaded
                          ? 'φορτωμένο'
                          : 'μη διαθέσιμο'}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-gray-700">exam_loinc</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {syncStatus.examLoinc.loaded ? syncStatus.examLoinc.size.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {syncStatus.examLoinc.syncing
                          ? `Σε εξέλιξη: σελ. ${syncStatus.examLoinc.progress.page}/${syncStatus.examLoinc.progress.totalPages} (${syncStatus.examLoinc.progress.count.toLocaleString()} εγγραφές)`
                          : syncStatus.examLoinc.loaded
                          ? 'φορτωμένο'
                          : 'μη διαθέσιμο'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Sync button: exam-catalog */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Συγχρονισμός exam_catalog</p>
                    <p className="text-xs text-gray-500 mt-0.5">Κατέβασμα όλων των εξετάσεων από το ΗΔΙΚΑ API</p>
                  </div>
                  <button
                    onClick={handleSyncCatalog}
                    disabled={catalogSyncing}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                  >
                    {catalogSyncing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        Σε εξέλιξη...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Συγχρονισμός
                      </>
                    )}
                  </button>
                </div>

                {/* Sync button: exam_loinc */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Συγχρονισμός exam_loinc</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Κατέβασμα όλων των LOINC κωδικών (100.000+ εγγραφές) στο τοπικό αποθηκευτικό χώρο.
                    </p>
                  </div>
                  <button
                    onClick={handleSyncLoinc}
                    disabled={loincSyncing}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                  >
                    {loincSyncing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        Σε εξέλιξη...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Συγχρονισμός
                      </>
                    )}
                  </button>
                </div>

                {/* Παράμετροι εξετάσεων από το Master Data */}
                <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Παράμετροι εξετάσεων (Master Data)</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Συγχρονισμός παραμέτρων κάθε εξέτασης από τις δύο πηγές του ΗΔΙΚΑ Lab Data
                        Repository στους πίνακες <code className="font-mono">exam_parameters</code> και{' '}
                        <code className="font-mono">exam_catalog</code>.
                      </p>
                    </div>
                    <button
                      onClick={handleSyncParameters}
                      disabled={paramsSyncing || Boolean(syncStatus?.examParameters?.syncing)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                    >
                      {paramsSyncing || syncStatus?.examParameters?.syncing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          Σε εξέλιξη...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Συγχρονισμός
                        </>
                      )}
                    </button>
                  </div>

                  {syncStatus?.examParameters && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Εξετάσεις με παραμέτρους</p>
                          <p className="text-xl font-bold text-gray-900">
                            {syncStatus.examParameters.examCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Παράμετροι (γραμμές)</p>
                          <p className="text-xl font-bold text-gray-900">
                            {syncStatus.examParameters.parameterCount.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg col-span-2 sm:col-span-1">
                          <p className="text-xs text-gray-500">Τελευταίος συγχρονισμός</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">
                            {syncStatus.examParameters.lastSyncedAt
                              ? new Date(syncStatus.examParameters.lastSyncedAt).toLocaleString('el-GR')
                              : '—'}
                          </p>
                        </div>
                      </div>

                      {syncStatus.examParameters.parameterCount === 0 && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Δεν υπάρχουν συγχρονισμένες παράμετροι. Εκτελέστε πρώτα τον συγχρονισμό
                          <code className="font-mono mx-1">exam_catalog</code> και{' '}
                          <code className="font-mono mx-1">exam_loinc</code>, και μετά αυτόν εδώ.
                        </p>
                      )}

                      {syncStatus.examParameters.lastResult && (
                        <p className="text-xs text-gray-500">
                          Τελευταίο αποτέλεσμα: {syncStatus.examParameters.lastResult.parameters.toLocaleString()}{' '}
                          παράμετροι σε {syncStatus.examParameters.lastResult.exams.toLocaleString()} εξετάσεις
                          {' · '}
                          {syncStatus.examParameters.lastResult.fromLoincRelations.toLocaleString()} από
                          σχέσεις LOINC
                          {syncStatus.examParameters.lastResult.unmatchedRelations > 0 && (
                            <>
                              {' · '}
                              {syncStatus.examParameters.lastResult.unmatchedRelations.toLocaleString()} χωρίς
                              αντιστοίχιση
                            </>
                          )}
                        </p>
                      )}

                      {syncStatus.examParameters.lastError && (
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {syncStatus.examParameters.lastError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
