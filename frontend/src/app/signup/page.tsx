'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function SignupFormContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      router.replace(redirectPath);
    }
  }, [user, redirectPath, router]);

  async function handleGoogleSignIn() {
    setOauthLoading(true);
    setMessage(null);
    try {
      const redirectUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'Google OAuth sign-in failed',
        type: 'error',
      });
      setOauthLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        setMessage({ text: 'Account created! Redirecting...', type: 'success' });
        router.replace(redirectPath);
      } else {
        setMessage({
          text: 'Registration received. If email verification is enabled, please check your inbox to confirm your account.',
          type: 'info',
        });
      }
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'Sign up failed',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3 font-mono">
          Route: /signup
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Create GEOFUSION Account</h1>
        <p className="text-xs text-neutral-400 mt-1.5">
          Join as an authenticated viewer (PRD Section 5.3)
        </p>
      </div>

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={oauthLoading || loading}
        className="w-full flex items-center justify-center py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white text-xs font-semibold rounded-xl border border-neutral-700 transition duration-150 shadow-sm disabled:opacity-50 mb-5"
      >
        <GoogleIcon />
        {oauthLoading ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div className="relative flex items-center justify-center mb-5">
        <div className="border-t border-neutral-800 w-full" />
        <span className="bg-neutral-900 px-3 text-[10px] uppercase tracking-wider text-neutral-500 font-mono absolute">
          or with email
        </span>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="viewer@organization.com"
            className="w-full px-3.5 py-2.5 bg-neutral-950/70 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/80 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 bg-neutral-950/70 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/80 transition"
          />
        </div>

        {message && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-start gap-2.5 ${
              message.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
              !
            </span>
            <span>{message.text}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || oauthLoading}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/20 transition duration-150 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account with Password'}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-neutral-400">
        Already have an account?{' '}
        <Link
          href={`/login${redirectPath !== '/' ? `?redirect=${redirectPath}` : ''}`}
          className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 transition"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <Suspense fallback={<div className="text-xs text-neutral-400">Loading auth...</div>}>
        <SignupFormContent />
      </Suspense>
    </div>
  );
}
