'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function Navbar() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();

  const navItems = [
    { name: 'Map View', href: '/' },
    { name: 'Cell Drill-Down', href: '/cell/1' },
    { name: 'Saved Regions', href: '/regions', authRequired: true },
    { name: 'About Model', href: '/about' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-neutral-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-rose-500/20 group-hover:scale-105 transition">
              GF
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight group-hover:text-amber-400 transition">
                GEOFUSION
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-neutral-400 font-mono">
                v2.0-spatial
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href.startsWith('/cell') && pathname.startsWith('/cell'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3.5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  {item.name}
                  {item.authRequired && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 font-mono">
                      auth
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: Auth state */}
        <div className="flex items-center space-x-3.5">
          {loading ? (
            <div className="h-9 w-24 bg-neutral-900 animate-pulse rounded-xl" />
          ) : user ? (
            <div className="flex items-center space-x-3.5">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white truncate max-w-[170px]">{user.email}</p>
                <span className="text-xs font-mono text-indigo-300 font-bold">
                  {profile?.role || 'authenticated_viewer'}
                </span>
              </div>
              <button
                onClick={() => signOut()}
                className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white text-sm font-medium border border-neutral-800 transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5">
              <Link
                href="/login"
                className="px-3.5 py-2 rounded-xl text-sm font-medium text-neutral-200 hover:text-white hover:bg-neutral-900 transition"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 transition"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
