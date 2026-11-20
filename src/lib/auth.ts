'use client';

/**
 * Authentication client για το MediLab.
 * Χρησιμοποιεί το Better Auth του API (Neon PostgreSQL) με bearer token.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'medilab.auth.token';
const USER_KEY = 'medilab.auth.user';

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
  role: 'doctor' | 'lab_technician' | 'admin';
  createdAt?: string;
}

type AuthListener = (user: AuthUser | null) => void;

const listeners = new Set<AuthListener>();

function notify(user: AuthUser | null) {
  listeners.forEach(listener => listener(user));
}

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persist(user: AuthUser | null, token: string | null) {
  if (typeof window === 'undefined') return;
  if (user && token) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
  notify(user);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  return data as T;
}

export async function loginWithEmail(email: string, password: string): Promise<AuthUser> {
  const data = await post<{ user: AuthUser; token: string }>('/auth/login', { email, password });
  persist(data.user, data.token);
  return data.user;
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
  role: string
): Promise<AuthUser> {
  const data = await post<{ user: AuthUser; token: string }>('/auth/register', {
    email,
    password,
    displayName,
    role,
  });
  persist(data.user, data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  const token = getAuthTokenSync();
  persist(null, null);

  if (token) {
    // Ακύρωση του session στο Better Auth (best effort)
    await fetch(`${API_BASE}/better-auth/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

export function getAuthTokenSync(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export async function getAuthToken(): Promise<string | null> {
  return getAuthTokenSync();
}

/** Εγγραφή listener — καλείται άμεσα με τον αποθηκευμένο χρήστη */
export function onAuthChange(callback: AuthListener): () => void {
  listeners.add(callback);
  callback(readStoredUser());

  // Συγχρονισμός μεταξύ tabs
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === USER_KEY) {
      callback(readStoredUser());
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function getCurrentUser(): AuthUser | null {
  return readStoredUser();
}

/** Ενημέρωση του cached χρήστη (π.χ. μετά από αλλαγή προφίλ) */
export function setCurrentUser(user: AuthUser) {
  const token = getAuthTokenSync();
  if (token) persist(user, token);
}
