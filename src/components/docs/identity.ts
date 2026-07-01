'use client';

import { useCallback, useEffect, useState } from 'react';

// Lightweight, auth-free identity for presence. We just need a display name and a
// stable color per browser, persisted in localStorage. Real authentication is out
// of scope — this only labels live cursors and avatars for teammates.

export type Identity = { name: string; color: string };

const STORAGE_KEY = 'gamedoc-identity';

// A spread of distinguishable, accessible-on-white colors.
const PALETTE = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0891b2', // cyan
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#4f46e5', // indigo
];

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function read(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (typeof parsed?.name === 'string' && typeof parsed?.color === 'string') {
      return { name: parsed.name, color: parsed.color };
    }
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return null;
}

/**
 * Returns the stored identity (or null until the user names themselves), a setter
 * that persists the name with a stable color, and `ready` once localStorage has
 * been read (so callers don't flash the name prompt during hydration).
 */
export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIdentity(read());
    setReady(true);
  }, []);

  const save = useCallback((rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    // Keep an existing color stable across renames; assign one on first save.
    const color = read()?.color ?? randomColor();
    const next: Identity = { name, color };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage failures — presence still works in-session */
    }
    setIdentity(next);
  }, []);

  return { identity, ready, save };
}

/** Two-letter initials for an avatar chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
