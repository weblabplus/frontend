'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Stethoscope, LogOut, LogIn, UserPlus, User, Shield, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

export function NavBar() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    el.addEventListener('scroll', checkScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', checkScroll);
    };
  }, [checkScroll, isAuthenticated]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Stethoscope className="w-7 h-7 text-primary-600" />
              <h1 className="text-xl font-bold text-primary-700 hidden sm:block">MediLab</h1>
            </Link>
          </div>

          {/* Left scroll arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scrollBy('left')}
              className="shrink-0 p-1 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Κύλιση αριστερά"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Nav Links - scrollable */}
          <div
            ref={scrollRef}
            className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide"
          >
            <NavLink href="/">Dashboard</NavLink>
            {isAuthenticated && (
              <>
                <NavLink href="/patients">Ασθενείς</NavLink>
                <NavLink href="/visits">Επισκέψεις</NavLink>
                <NavLink href="/calendar">Ημερολόγιο</NavLink>
                <NavLink href="/upload">Upload</NavLink>
                <NavLink href="/results">Αποτελέσματα</NavLink>
                <NavLink href="/reports">Αναφορές</NavLink>
                <NavLink href="/finance">Ταμείο</NavLink>
              </>
            )}
          </div>

          {/* Right scroll arrow */}
          {canScrollRight && (
            <button
              onClick={() => scrollBy('right')}
              className="shrink-0 p-1 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Κύλιση δεξιά"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Auth Section */}
          <div className="flex items-center gap-3 shrink-0">
            {loading ? (
              <div className="w-20 h-8 bg-gray-100 rounded animate-pulse" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
                    {user?.role === 'admin' ? (
                      <Shield className="w-4 h-4 text-purple-600" />
                    ) : (
                      <User className="w-4 h-4 text-primary-600" />
                    )}
                    <span className="text-gray-700 font-medium truncate max-w-[100px]">
                      {user?.displayName}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium">
                    {user?.role === 'admin' ? 'Admin' : user?.role === 'lab_technician' ? 'Τεχνικός' : 'Ιατρός'}
                  </span>
                </div>
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors px-2 py-1"
                  title="Ρυθμίσεις"
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1"
                  title="Αποσύνδεση"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Έξοδος</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors px-3 py-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Σύνδεση</span>
                </Link>
                <Link
                  href="/register"
                  className="flex items-center gap-1.5 text-sm bg-primary-600 text-white hover:bg-primary-700 transition-colors px-3 py-1.5 rounded-lg"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Εγγραφή</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-gray-600 hover:text-primary-600 hover:bg-gray-50 transition-colors font-medium text-sm px-2.5 py-1.5 rounded-lg"
    >
      {children}
    </Link>
  );
}
