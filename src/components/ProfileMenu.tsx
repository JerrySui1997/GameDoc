'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

function initialsFor(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || '?';
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return source[0].toUpperCase();
}

export function ProfileMenu({
  name,
  email,
  image,
  onLogout,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const AVATAR_CLASS =
    'flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-line bg-canvas text-xs font-semibold text-ink';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-canvas"
        aria-expanded={open}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className={AVATAR_CLASS} />
        ) : (
          <span className={AVATAR_CLASS}>{initialsFor(name, email)}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{name || email}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="border-b border-line-soft px-2 pb-2">
            {name && <p className="truncate text-sm font-medium text-ink">{name}</p>}
            {email && <p className="truncate text-xs text-muted">{email}</p>}
          </div>
          <Link
            href="/app/account"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-lg px-2 py-1.5 text-sm text-ink transition-colors hover:bg-canvas"
          >
            Account settings
          </Link>
          <form action={onLogout}>
            <button
              type="submit"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-oxblood transition-colors hover:bg-canvas"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
