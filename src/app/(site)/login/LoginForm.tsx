'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// The password screen. Rendered inside the bare root-layout shell (the sidebar is
// withheld until authenticated), styled with the Atelier tokens so it reads as
// part of the codex rather than a bolted-on gate.

function LoginFields() {
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Full navigation so the server re-renders the now-authorized shell.
        window.location.assign(next);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error || 'Incorrect password');
      setBusy(false);
    } catch {
      setError('Something went wrong — please try again.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">
        Game Design
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">Tool + Codex</h1>
      <p className="mt-3 text-sm text-muted">
        This workspace is private. Enter the password to view and edit.
      </p>

      <label className="mt-6 block">
        <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Password
        </span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-ink outline-none transition-colors focus:border-brass"
          placeholder="••••••••"
        />
      </label>

      {error && <p className="mt-2 text-sm text-oxblood">{error}</p>}

      <button
        type="submit"
        disabled={busy || !password}
        className="mt-5 w-full rounded-lg bg-brass px-4 py-2 font-medium text-surface transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  );
}

export function LoginForm() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense>
      <LoginFields />
    </Suspense>
  );
}
