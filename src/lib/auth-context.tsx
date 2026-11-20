'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  AuthUser,
  getAuthToken,
  onAuthChange,
  logout as authLogout,
} from '@/lib/auth';
import { setTokenProvider } from '@/lib/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  logout: async () => {},
  getToken: async () => null,
  refreshUser: async () => {},
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return;
      }

      if (res.status === 401) {
        await authLogout();
        setUser(null);
      }
    } catch {
      // Διατήρηση cached χρήστη σε σφάλμα δικτύου
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthChange((storedUser) => {
      setUser(storedUser);
      setLoading(false);

      if (storedUser) {
        refreshUser();
      }
    });

    return unsubscribe;
  }, [refreshUser]);

  const handleLogout = async () => {
    await authLogout();
    setUser(null);
  };

  // Register token provider with API client
  useEffect(() => {
    setTokenProvider(getAuthToken);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        logout: handleLogout,
        getToken: getAuthToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}