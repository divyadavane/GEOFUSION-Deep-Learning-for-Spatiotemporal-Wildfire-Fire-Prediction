import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GEOFUSION • Wildfire Risk Prediction Platform',
  description: 'Multimodal Deep Learning for Spatiotemporal Wildfire Prediction & Satellite Imagery Analysis',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-950 text-neutral-100 min-h-screen flex flex-col`}>
        <AuthProvider>
          <Navbar />
          <main className="flex-1 flex flex-col">{children}</main>
          <footer className="w-full border-t border-neutral-900 bg-neutral-950 py-4 px-6 text-center text-xs text-neutral-600 font-mono">
            GEOFUSION • Multimodal Spatiotemporal Deep Learning • Sentinel-2 + ERA5 + NASA FIRMS
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
