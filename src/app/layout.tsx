import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { NavBar } from '@/components/nav-bar';

export const metadata: Metadata = {
  title: 'MediLab - Ιατρική Διαγνωστική Εφαρμογή',
  description: 'Ανάλυση εργαστηριακών εξετάσεων με AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el">
      <body className="min-h-screen bg-slate-50">
        <AuthProvider>
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
