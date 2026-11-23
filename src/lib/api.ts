/**
 * API Client για το MediLab backend
 * Υποστηρίζει Firebase Authentication μέσω Bearer token
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

let _getToken: (() => Promise<string | null>) | null = null;

/** Ορισμός του token provider (καλείται από το AuthContext) */
export function setTokenProvider(getToken: () => Promise<string | null>) {
  _getToken = getToken;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Προσθήκη auth token αν υπάρχει
  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Σφάλμα δικτύου' }));
    const err = new Error(error.error || error.message || `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    // Ο κωδικός του API επιτρέπει στο UI να αντιδράσει (π.χ. FULL_ONLY → επιλογή όλων)
    err.code = error.code;
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    fetchAPI<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, displayName: string, role: string) =>
    fetchAPI<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, role }),
    }),

  me: () => fetchAPI<any>('/auth/me'),

  updateProfile: (displayName: string) =>
    fetchAPI<any>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),

  refreshToken: () =>
    fetchAPI<any>('/auth/refresh', { method: 'POST' }),

  // Health
  health: () => fetchAPI<any>('/health'),

  // Patients
  getPatients: () => fetchAPI<any>('/patients'),

  getPatient: (id: string) => fetchAPI<any>(`/patients/${id}`),

  createPatient: (patient: any) =>
    fetchAPI<any>('/patients', {
      method: 'POST',
      body: JSON.stringify(patient),
    }),

  deletePatient: (id: string) =>
    fetchAPI<any>(`/patients/${id}`, { method: 'DELETE' }),

  updatePatient: (id: string, updates: any) =>
    fetchAPI<any>(`/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  // Reference Ranges
  getReferenceRanges: () => fetchAPI<any>('/reference-ranges'),
  getReferenceRange: (testCode: string) => fetchAPI<any>(`/reference-ranges/${testCode}`),
  setReferenceRange: (testCode: string, range: any) =>
    fetchAPI<any>('/reference-ranges', {
      method: 'POST',
      body: JSON.stringify({ testCode, range }),
    }),

  // Visits
  getVisits: (
    patientId?: string,
    range?: { from?: string; to?: string }
  ) => {
    const params = new URLSearchParams();
    if (patientId) params.set('patientId', patientId);
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    const qs = params.toString();
    return fetchAPI<any>(`/visits${qs ? `?${qs}` : ''}`);
  },

  getVisit: (id: string) => fetchAPI<any>(`/visits/${id}`),

  createVisit: (visit: any) =>
    fetchAPI<any>('/visits', {
      method: 'POST',
      body: JSON.stringify(visit),
    }),

  updateVisit: (id: string, updates: any) =>
    fetchAPI<any>(`/visits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteVisit: (id: string) =>
    fetchAPI<any>(`/visits/${id}`, { method: 'DELETE' }),

  // Appointments (Ημερολόγιο)
  getAppointments: (params?: { patientId?: string; from?: string; to?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.patientId) qs.set('patientId', params.patientId);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return fetchAPI<{ appointments: AppointmentDto[]; total: number }>(
      `/appointments${query ? `?${query}` : ''}`
    );
  },

  getAppointment: (id: string) =>
    fetchAPI<{ appointment: AppointmentDto }>(`/appointments/${id}`),

  createAppointment: (appointment: Partial<AppointmentDto>) =>
    fetchAPI<{ appointment: AppointmentDto }>('/appointments', {
      method: 'POST',
      body: JSON.stringify(appointment),
    }),

  updateAppointment: (id: string, updates: Partial<AppointmentDto>) =>
    fetchAPI<{ appointment: AppointmentDto }>(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteAppointment: (id: string) =>
    fetchAPI<{ message: string }>(`/appointments/${id}`, { method: 'DELETE' }),

  convertAppointmentToVisit: (id: string, visitDate?: string) =>
    fetchAPI<{ appointment: AppointmentDto; visit: any }>(
      `/appointments/${id}/convert-to-visit`,
      {
        method: 'POST',
        body: JSON.stringify({ visitDate }),
      }
    ),

  // Referrals
  getReferrals: (visitId?: string, patientId?: string) => {
    const params = new URLSearchParams();
    if (visitId) params.set('visitId', visitId);
    if (patientId) params.set('patientId', patientId);
    const qs = params.toString();
    return fetchAPI<any>(`/referrals${qs ? `?${qs}` : ''}`);
  },

  getReferral: (id: string) => fetchAPI<any>(`/referrals/${id}`),

  createReferral: (referral: any) =>
    fetchAPI<any>('/referrals', {
      method: 'POST',
      body: JSON.stringify(referral),
    }),

  updateReferral: (id: string, updates: any) =>
    fetchAPI<any>(`/referrals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteReferral: (id: string) =>
    fetchAPI<any>(`/referrals/${id}`, { method: 'DELETE' }),

  // Exams
  getExams: (referralId?: string, visitId?: string, patientId?: string) => {
    const params = new URLSearchParams();
    if (referralId) params.set('referralId', referralId);
    if (visitId) params.set('visitId', visitId);
    if (patientId) params.set('patientId', patientId);
    const qs = params.toString();
    return fetchAPI<any>(`/exams${qs ? `?${qs}` : ''}`);
  },

  getExam: (id: string) => fetchAPI<any>(`/exams/${id}`),

  createExam: (exam: any) =>
    fetchAPI<any>('/exams', {
      method: 'POST',
      body: JSON.stringify(exam),
    }),

  updateExam: (id: string, updates: any) =>
    fetchAPI<any>(`/exams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteExam: (id: string) =>
    fetchAPI<any>(`/exams/${id}`, { method: 'DELETE' }),

  // LOINC Search
  searchLOINC: (query: string, source: string = 'exam-catalog') =>
    fetchAPI<{ results: any[]; total: number }>(`/loinc/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`),

  // LOINC Parameters (auto-populate from Exam Catalog)
  getLOINCParameters: (loincNum: string, examCode?: string, source?: string) => {
    let url = `/loinc/parameters?loincNum=${encodeURIComponent(loincNum)}`;
    if (examCode) url += `&examCode=${encodeURIComponent(examCode)}`;
    if (source) url += `&source=${encodeURIComponent(source)}`;
    return fetchAPI<{ loincNum: string; title: string; parameters: Array<{ loincNum: string; name: string; type: string }> }>(url);
  },

  // Exam Parameters (Master Data → δικοί μας πίνακες)
  getExamParameters: (examCode: string) =>
    fetchAPI<ExamParametersResponse>(`/exam-parameters/${encodeURIComponent(examCode)}`),

  // Admin – Sync
  getSyncStatus: () =>
    fetchAPI<{
      examCatalog: { loaded: boolean; size: number; syncing: boolean; progress: { page: number; totalPages: number; count: number } };
      examLoinc: { loaded: boolean; size: number; syncing: boolean; progress: { page: number; totalPages: number; count: number } };
      examParameters?: ExamParametersStatus;
    }>('/admin/sync/status'),

  syncExamCatalog: (offset?: number) =>
    fetchAPI<{ status: string; message: string; startPage: number }>('/admin/sync/exam-catalog', {
      method: 'POST',
      body: JSON.stringify({ offset }),
    }),

  syncExamLoinc: () =>
    fetchAPI<{ status: string; message: string; startPage: number }>('/admin/sync/exam-loinc', {
      method: 'POST',
    }),

  syncExamParameters: () =>
    fetchAPI<{ status: string; message: string }>('/admin/sync/exam-parameters', {
      method: 'POST',
    }),

  getExamParametersStatus: () =>
    fetchAPI<ExamParametersStatus>('/admin/sync/exam-parameters/status'),

  // Lab Results (Καταχώρηση Εργαστηριακών Αποτελεσμάτων → ΗΔΙΚΑ)
  submitReferralResults: (referralId: string, force = false) =>
    fetchAPI<{
      message: string;
      referral: any;
      sentAt: string;
      examCount: number;
      indicatorCount: number;
      response: any;
    }>(`/efulfillment/referrals/${encodeURIComponent(referralId)}/submit-results`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),

  getLabProfile: () => fetchAPI<LabProfileResponse>('/lab-profile'),

  /** Λίστα χρηστών (admin) — για εμφάνιση ονόματος γιατρού σε εκτυπώσεις */
  getUsers: () =>
    fetchAPI<{
      users: Array<{
        uid?: string;
        id?: string;
        email: string;
        displayName?: string;
        role?: string;
      }>;
      total: number;
    }>('/admin/users'),

  // ── Κέντρα Αναφοράς (SLIS) ──
  getReferenceCenters: () =>
    fetchAPI<{ centers: ReferenceCenter[] }>('/reference-centers'),

  /** Λίστα εργασίας κέντρου αναφοράς για συγκεκριμένη ημέρα */
  getCenterWorklist: (centerId: string, date: string) =>
    fetchAPI<ReferenceCenterWorklist>(
      `/reference-centers/${encodeURIComponent(centerId)}/worklist?date=${encodeURIComponent(date)}`
    ),

  updateReferenceCenter: (id: string, patch: Partial<ReferenceCenter>) =>
    fetchAPI<{ message: string; center: ReferenceCenter }>(
      `/reference-centers/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(patch) }
    ),

  previewCenterSend: (referralId: string, centerId: string, examIds?: string[], choices?: Record<string, string>) => {
    let url = `/referrals/${encodeURIComponent(referralId)}/reference-center/preview?centerId=${encodeURIComponent(centerId)}`;
    if (examIds && examIds.length > 0) url += `&examIds=${encodeURIComponent(examIds.join(','))}`;
    if (choices && Object.keys(choices).length > 0) {
      url += `&choices=${encodeURIComponent(JSON.stringify(choices))}`;
    }
    return fetchAPI<{
      center: ReferenceCenter;
      tests: Array<{ code: string; name: string; loincCode?: string; action: number }>;
      unmapped: Array<{ examId: string; name: string; loincCode?: string | null; reason: string }>;
      ambiguous: Array<{
        examId: string;
        name: string;
        loincCode: string;
        options: Array<{ code: string; name: string }>;
      }>;
      alreadySent: Array<any>;
    }>(url);
  },

  // Άντληση αποτελεσμάτων από κέντρο αναφοράς
  fetchResultsFromCenter: (referralId: string, centerId: string) =>
    fetchAPI<{
      centerId: string;
      centerName: string;
      orderNo: string;
      resultTests: number;
      updatedExams: number;
      indicators: number;
      unmatched: string[];
      fetchedAt: string;
      message: string;
      exams: any[];
    }>(`/referrals/${encodeURIComponent(referralId)}/reference-center/fetch-results`, {
      method: 'POST',
      body: JSON.stringify({ centerId }),
    }),

  sendToReferenceCenter: (    referralId: string,
    centerId: string,
    examIds?: string[],
    choices?: Record<string, string>
  ) =>
    fetchAPI<{
      message: string;
      centerId: string;
      centerName: string;
      orderNo: string;
      status: string;
      lisOrderNo?: string;
      tests: Array<{ code: string; barcode?: string }>;
      sentAt: string;
      referral: any;
    }>(`/referrals/${encodeURIComponent(referralId)}/reference-center/send`, {
      method: 'POST',
      body: JSON.stringify({ centerId, examIds, choices }),
    }),

  // Άντληση αποτελεσμάτων από το Lab Data Repository (barcode → id → λεπτομέρειες)
  fetchReferralResults: (referralId: string) =>
    fetchAPI<{
      resultIds: number;
      updatedExams: number;
      indicators: number;
      message: string;
      exams: any[];
    }>(`/efulfillment/referrals/${encodeURIComponent(referralId)}/fetch-results`),

  // Ακύρωση αντληθέντων αποτελεσμάτων (DELETE με το id του φορέα)
  cancelReferralResults: (referralId: string) =>
    fetchAPI<{
      cancelled: number;
      failed: number;
      restoredExams: number;
      maxOrderNo?: number;
      message: string;
      referral: any;
      exams: any[];
    }>(`/efulfillment/referrals/${encodeURIComponent(referralId)}/fetch-results`, {
      method: 'DELETE',
    }),

  // Admin – Lab Data Repository Api-Key
  getLabRepoConfig: () =>
    fetchAPI<{ apiKeyMasked: string; apiKeySource: 'database' | 'env' | 'none' }>(
      '/admin/lab-repo/config'
    ),

  saveLabRepoConfig: (apiKey: string) =>
    fetchAPI<{ message: string; apiKeyMasked: string; apiKeySource: 'database' | 'env' | 'none' }>(
      '/admin/lab-repo/config',
      { method: 'PUT', body: JSON.stringify({ apiKey }) }
    ),

  saveLabProfile: (profile: LabProfile) =>
    fetchAPI<{ message: string; profile: LabProfile; identity: LabIdentity }>('/lab-profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),

  // E-Fulfillment (e-Prescription / ΗΔΙΚΑ)
  getEfulfillment: () => fetchAPI<EfulfillmentState>('/efulfillment/me'),

  saveEfulfillmentCredentials: (username: string, password: string) =>
    fetchAPI<{ message: string; profile: PractitionerProfile; syncedAt: string }>(
      '/efulfillment/credentials',
      {
        method: 'PUT',
        body: JSON.stringify({ username, password }),
      }
    ),

  refreshEfulfillment: () =>
    fetchAPI<{ message: string; profile: PractitionerProfile; syncedAt: string }>(
      '/efulfillment/refresh',
      { method: 'POST' }
    ),

  deleteEfulfillmentCredentials: () =>
    fetchAPI<{ message: string }>('/efulfillment/credentials', { method: 'DELETE' }),

  // E-Fulfillment — παραπεμπτικά ασθενή με ΑΜΚΑ
  searchPatientReferrals: (amka: string, pin?: string, page?: number, size?: number) => {
    const params = new URLSearchParams();
    if (pin) params.set('pin', pin);
    if (page !== undefined) params.set('page', String(page));
    if (size !== undefined) params.set('size', String(size));
    const qs = params.toString();
    return fetchAPI<PatientReferralSearch>(`/efulfillment/patients/${encodeURIComponent(amka)}/referrals${qs ? `?${qs}` : ''}`);
  },

  importPatientReferrals: (payload: {
    amka: string;
    referrals: EpresReferral[];
    patient?: { firstName?: string; lastName?: string; dateOfBirth?: string; gender?: string };
  }) =>
    fetchAPI<{
      message: string;
      patient: any;
      patientCreated: boolean;
      visit: any;
      referrals: any[];
      skipped: number;
      /** Barcodes ληγμένων παραπεμπτικών που δεν καταχωρήθηκαν */
      expired?: string[];
    }>('/efulfillment/import-referrals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // E-Fulfillment — παραπεμπτικό με barcode (Άντληση προς εκτέλεση)
  searchReferralByBarcode: (barcode: string) =>
    fetchAPI<DispenseSearchResult>(`/efulfillment/referrals/${encodeURIComponent(barcode)}`),

  importReferralByBarcode: (payload: {
    barcode: string;
    referral: EpresDispenseReferral;
    /** Γραμμές εξετάσεων προς εκτέλεση */
    selectedLineIds: string[];
  }) =>
    fetchAPI<{
      message: string;
      patient: any;
      patientCreated: boolean;
      visit: any;
      referral: any;
      exams: any[];
      execution: {
        barcode: string;
        executedLineIds: string[];
        fullExecution: boolean;
        status?: string;
        occurredAt: string;
        executionNo?: string;
      } | null;
      /** Απαίτηση συμμετοχής ασθενούς που καταχωρήθηκε στο Ταμείο */
      patientShare?: FinanceEntry | null;
      /** Απαίτηση αποζημίωσης από τον ασφαλιστικό φορέα */
      payerShare?: FinanceEntry | null;
    }>('/efulfillment/import-referral', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // E-Fulfillment — ακύρωση εκτέλεσης παραπεμπτικού
  cancelReferralExecution: (referralId: string) =>
    fetchAPI<{
      message: string;
      referral: any;
      exams: any[];
      cancellation: {
        barcode: string;
        fullCancellation: boolean;
        executionNo?: string;
        cancelledAt: string;
      };
    }>(`/efulfillment/referrals/${encodeURIComponent(referralId)}/cancel`, {
      method: 'POST',
    }),

  // Admin – E-Fulfillment config
  getEfulfillmentConfig: () =>
    fetchAPI<{
      baseUrl: string;
      apiKeyMasked: string | null;
      apiKeySource: 'database' | 'env' | 'none';
      refreshHours: number;
      ttlHours: number;
    }>('/admin/efulfillment/config'),

  setEfulfillmentConfig: (payload: { apiKey?: string; baseUrl?: string }) =>
    fetchAPI<{ message: string }>('/admin/efulfillment/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  testEfulfillmentConfig: () =>
    fetchAPI<{ ok: boolean; message?: string; error?: string; code?: string }>(
      '/admin/efulfillment/test',
      { method: 'POST' }
    ),

  // Ταμείο — οφειλές σε κέντρα αναφοράς/φορείς & απαιτήσεις από ασθενείς
  getFinanceEntries: (params?: {
    direction?: FinanceDirection;
    partyType?: FinancePartyType;
    status?: FinanceEntryStatus;
    q?: string;
    /** Φίλτρο ημερομηνίας λήξης (YYYY-MM-DD) */
    dueFrom?: string;
    dueTo?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.direction) search.set('direction', params.direction);
    if (params?.partyType) search.set('partyType', params.partyType);
    if (params?.status) search.set('status', params.status);
    if (params?.q) search.set('q', params.q);
    if (params?.dueFrom) search.set('dueFrom', params.dueFrom);
    if (params?.dueTo) search.set('dueTo', params.dueTo);
    const qs = search.toString();
    return fetchAPI<{ entries: FinanceEntry[]; total: number }>(
      `/finance/entries${qs ? `?${qs}` : ''}`
    );
  },

  getFinanceSummary: () => fetchAPI<FinanceSummary>('/finance/summary'),

  createFinanceEntry: (entry: {
    direction: FinanceDirection;
    partyType: FinancePartyType;
    partyId?: string;
    partyName?: string;
    patientId?: string;
    patientName?: string;
    referralId?: string;
    referralBarcode?: string;
    description?: string;
    amount: number;
    issueDate?: string;
    dueDate?: string;
    notes?: string;
  }) =>
    fetchAPI<{ entry: FinanceEntry }>('/finance/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),

  updateFinanceEntry: (id: string, updates: Partial<FinanceEntry>) =>
    fetchAPI<{ entry: FinanceEntry }>(`/finance/entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deleteFinanceEntry: (id: string) =>
    fetchAPI<{ message: string }>(`/finance/entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  addFinancePayment: (
    id: string,
    payment: { amount: number; paidAt?: string; method?: string; notes?: string }
  ) =>
    fetchAPI<{ entry: FinanceEntry; payment: FinancePayment }>(
      `/finance/entries/${encodeURIComponent(id)}/payments`,
      { method: 'POST', body: JSON.stringify(payment) }
    ),

  deleteFinancePayment: (id: string, paymentId: string) =>
    fetchAPI<{ entry: FinanceEntry }>(
      `/finance/entries/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`,
      { method: 'DELETE' }
    ),

  // Συγχρονισμός παραστατικών από κέντρα αναφοράς (Emporiko Documents API)
  syncFinance: (centerId?: string, mode: 'auto' | 'manual' = 'manual') =>
    fetchAPI<{
      message: string;
      mode?: 'auto' | 'manual';
      monthsBack?: number;
      skipped?: boolean;
      lastSyncAt?: string;
      results: Array<{
        centerId: string;
        centerName: string;
        from: string;
        to: string;
        fetched: number;
        created: number;
        updated: number;
        skipped: number;
        errors: string[];
        error?: string;
      }>;
    }>('/finance/sync', {
      method: 'POST',
      body: JSON.stringify({ centerId, mode }),
    }),
};

export interface ReferenceCenter {
  id: string;
  name: string;
  url: string;
  protocol: string;
  active: boolean;
  config: {
    requestType?: string;
    senderCode?: string;
    username?: string;
    password?: string;
    requestor?: string;
    action?: number;
    /** Εκτύπωση barcode αριθμού εντολής — ρυθμίσεις ανά κέντρο */
    barcodeType?: string;
    barcodeWidthMm?: number;
    barcodeHeightMm?: number;
    barcodeShowText?: boolean;
    barcodeCopies?: number;
    [key: string]: any;
  };
}

/** Εξέταση σε λίστα εργασίας κέντρου αναφοράς */
export interface WorklistExam {
  id: string;
  name: string;
  /** Κωδικός εξέτασης στο κέντρο */
  code?: string;
  loincCode?: string;
  barcode?: string;
  status?: string;
}

/** Παραπεμπτικό σε λίστα εργασίας κέντρου αναφοράς */
export interface WorklistReferral {
  referralId: string;
  barcode?: string;
  patientId?: string;
  patientName?: string;
  orderNo?: string;
  lisOrderNo?: string;
  status?: string;
  sentAt?: string;
  exams: WorklistExam[];
}

export interface ReferenceCenterWorklist {
  center: { id: string; name: string };
  date: string;
  referrals: WorklistReferral[];
  totals: { referrals: number; exams: number };
}

// ── Ταμείο (finance) ──

export type FinanceDirection = 'debt' | 'receivable';
export type FinancePartyType = 'reference_center' | 'payer' | 'patient';
export type FinanceEntryStatus = 'pending' | 'partial' | 'settled' | 'cancelled';

export interface FinancePayment {
  id: string;
  amount: number;
  paidAt: string;
  method?: string;
  notes?: string;
  createdAt: string;
}

/** Προέλευση κίνησης όταν δημιουργείται από εξωτερικό σύστημα */
export interface FinanceEntrySource {
  system: string;
  centerId?: string;
  documentId?: string;
  /** Είδος παραστατικού κέντρου: τιμολόγιο, απόδειξη είσπραξης, πιστωτικό */
  documentType?: 'invoice' | 'receipt' | 'credit';
  tradeCode?: string;
  series?: string;
  einvoiceId?: string;
  einvoiceUrl?: string;
  netAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  /** Υπόλοιπο προς εξόφληση όπως το δίνει το κέντρο (0 = εξοφλημένο, <0 = πιστωμένο) */
  deductedAmount?: number;
}

export interface FinanceEntry {
  id: string;
  direction: FinanceDirection;
  partyType: FinancePartyType;
  partyId?: string;
  partyName: string;
  patientId?: string;
  patientName?: string;
  referralId?: string;
  referralBarcode?: string;
  description?: string;
  amount: number;
  paidAmount: number;
  status: FinanceEntryStatus;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  payments: FinancePayment[];
  source?: FinanceEntrySource;
  doctorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancePartyTypeSummary {
  direction: FinanceDirection;
  partyType: FinancePartyType;
  count: number;
  amount: number;
  paidAmount: number;
  outstanding: number;
}

export interface FinancePartySummary extends FinancePartyTypeSummary {
  partyId?: string;
  partyName: string;
}

export interface FinanceSummary {
  totals: {
    debts: number;
    debtsPaid: number;
    debtsOutstanding: number;
    receivables: number;
    receivablesPaid: number;
    receivablesOutstanding: number;
    overdueAmount: number;
    overdueCount: number;
    openCount: number;
    settledCount: number;
    cancelledCount: number;
    /** Σύνολο οφειλών προς κέντρα όπως το δίνει το API (άθροισμα DeductedAmount) */
    centerOutstandingFromApi: number;
  };
  byPartyType: FinancePartyTypeSummary[];
  byParty: FinancePartySummary[];
}

// ── Master Data types (παράμετροι εξετάσεων) ──

export interface LabProfile {
  labName?: string;
  vatNumber?: string;
  licenseNumber?: string;
  doctorSpecialty?: string;
}

export interface LabIdentity {
  labName: string;
  vatNumber: string;
  licenseNumber: string;
  examCenterId?: string;
  userUnitId?: string;
  healthCareUnitId?: string;
}

export interface LabProfileResponse {
  profile: LabProfile | null;
  identity: LabIdentity | null;
  lock?: {
    lockedAt: string;
    unlockAt: string;
    operation: string;
    remainingMs: number;
  } | null;
  source?: { labName: string | null; vatNumber: string | null; licenseNumber: string | null };
}

export interface ExamParameterEntry {
  name: string;
  unit?: string;
  referenceRange?: string;
  loincNum?: string;
}

export interface ExamParametersResponse {
  examCode: string;
  examDescription: string | null;
  edapyCode: string | null;
  examinationId: number | null;
  examinationGroup: string | null;
  parameters: ExamParameterEntry[];
  total: number;
}

export interface ExamParametersStatus {
  examCount: number;
  parameterCount: number;
  examsWithParameters: number;
  lastSyncedAt: string | null;
  syncing: boolean;
  progress: { phase: 'exams' | 'loinc' | 'write'; page: number; totalPages: number; count: number };
  lastResult?: {
    exams: number;
    parameters: number;
    fromLoincRelations: number;
    unmatchedRelations: number;
    ambiguousRelations?: number;
    sourceExams?: 'api' | 'local';
    sourceLoinc?: 'database' | 'api';
    durationMs: number;
    finishedAt: string;
  } | null;
  lastError?: string | null;
}

// ── E-Fulfillment types ──

/** Τίτλος επίσκεψης που δημιουργείται από εισαγωγή παραπεμπτικών e-Prescription */
export const IMPORT_VISIT_REASON_LABEL = 'Άυλη συνταγογράφηση';

export interface PractitionerProfile {
  amka?: string;
  afm?: string;
  practitionerId?: string;
  etaaRegNo?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  specialties: string[];
  organizationId?: string;
  organizationName?: string;
  healthcareServices: string[];
  examCenterId?: string;
  userUnitId?: string;
  healthCareUnitId?: string;
  isExamCenter?: boolean;
  canExecuteExam?: boolean;
  canAddExamResults?: boolean;
  isPublicHealthProvider?: boolean;
  address?: string;
  resourceType?: string;
  fetchedAt: string;
}

export interface EpresReferral {
  id: number | string;
  barcode: string;
  statusId?: number;
  statusName?: string;
  amka?: string;
  firstName?: string;
  lastName?: string;
  socialInsuranceShortName?: string;
  issueDate?: string;
  expiryDate?: string;
  examinationGroupId?: number;
  examinationGroupName?: string;
  isProactive?: boolean;
}

export interface PatientReferralSearch {
  referrals: EpresReferral[];
  total: number;
  page: number;
  totalPages: number;
  patientName?: string;
  unitId?: number;
  amka: string;
  /** Πόσα παραπεμπτικά είχαν ήδη εισαχθεί και φιλτραρίστηκαν */
  alreadyImportedCount?: number;
  existingPatient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    gender?: string;
  } | null;
}

export interface EpresExam {
  lineId: string;
  examId?: string;
  name: string;
  rawName?: string;
  /** Τιμή εκτέλεσης */
  executionPrice?: number;
  /** Ποσό συμμετοχής ασφαλισμένου */
  participationAmount?: number;
  /** Τιμή κατά τη συνταγογράφηση */
  prescribedPrice?: number;
}

export interface EpresDispenseReferral {
  barcode: string;
  status?: string;
  intent?: string;
  examGroupCode?: string;
  examGroupName?: string;
  authoredOn?: string;
  occurrenceDateTime?: string;
  expiryDate?: string;
  expiryFromExtension?: string;
  /** Η αποτελεσματική ημερομηνία λήξης που χρησιμοποιήθηκε για τον έλεγχο */
  effectiveExpiry?: string;
  reason?: string;
  notes?: string;
  totalExecutions?: number;
  patient?: {
    amka?: string;
    ama?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    gender?: string;
    birthDate?: string;
    phone?: string;
  };
  exams: EpresExam[];
  resourceType?: string;
}

export interface DispenseSearchResult {
  referral: EpresDispenseReferral;
  unitId: string;
  alreadyImported: boolean;
  existingReferralId?: string;
  existingVisitId?: string;
  expired: boolean;
  /** Ημέρες μέχρι τη λήξη· αρνητικό αν έχει λήξει */
  daysUntilExpiry?: number;
  expiryMessage?: string;
  /** Υπάρχων ασθενής με αυτό το ΑΜΚΑ (null = θα δημιουργηθεί νέος) */
  existingPatient?: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    gender?: string;
    amka?: string;
  } | null;
}

export interface EfulfillmentState {  hasCredentials: boolean;
  username?: string;
  lastSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  expiresAt?: string | null;
  nextRefreshAt?: string | null;
  profile?: PractitionerProfile | null;
  synced?: boolean;
  refreshError?: string | null;
  message?: string;
}

/** Κατάσταση ραντεβού (Ημερολόγιο) */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Ραντεβού ασθενούς */
export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName?: string;
  doctorId?: string;
  /** ISO 8601 ημερομηνία + ώρα */
  scheduledAt: string;
  durationMinutes?: number;
  reason: string;
  notes?: string;
  status: AppointmentStatus;
  /** Η επίσκεψη στην οποία μετατράπηκε το ραντεβού */
  visitId?: string;
  createdAt: string;
  updatedAt: string;
}
