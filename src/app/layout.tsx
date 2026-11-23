import type { Metadata } from 'next';
import { Geologica } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { NavBar } from '@/components/nav-bar';

const geologica = Geologica({
  subsets: ['latin', 'greek'],
  variable: '--font-geologica',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Medisend - Ιατρική Διαγνωστική Εφαρμογή',
  description: 'Ανάλυση εργαστηριακών εξετάσεων με AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el" className={geologica.variable}>
      <body className="min-h-screen bg-slate-50 font-sans">
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
